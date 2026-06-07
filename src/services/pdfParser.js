const { PDFParse } = require('pdf-parse');
const GeminiService = require('./geminiService');
const { enrichVpa } = require('./vpaEnricher');
const { isDuplicate } = require('../utils/deduplicator');
const Transaction = require('../models/transaction');

/**
 * Detects the bank name from keywords present in the bank statement text.
 * 
 * @param {string} text - The raw text of the bank statement.
 * @returns {string} - The name of the detected bank.
 */
function detectBank(text) {
  const t = text.toLowerCase();
  if (t.includes('google pay app') || t.includes('transaction statement period')) return 'Google Pay';
  if (t.includes('hdfc bank')) return 'HDFC Bank';
  if (t.includes('state bank') || t.includes('sbi')) return 'State Bank of India';
  if (t.includes('icici bank') || t.includes('icici')) return 'ICICI Bank';
  if (t.includes('axis bank') || t.includes('axis')) return 'Axis Bank';
  if (t.includes('kotak')) return 'Kotak Mahindra Bank';
  if (t.includes('yes bank')) return 'Yes Bank';
  return 'Unknown Bank';
}

function parseDateToken(value) {
  if (!value) return null;

  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
  }

  const indian = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (indian) {
    let [, day, month, year] = indian;
    if (year.length === 2) {
      year = Number(year) > 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
  }

  return null;
}

function parseMonthNameDate(value) {
  const months = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12'
  };
  const match = value?.trim().match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})$/);
  if (!match) return null;

  const [, day, monthName, year] = match;
  const month = months[monthName.toLowerCase()];
  if (!month) return null;

  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function parseTimeToken(value) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '00:00:00';

  let [, hour, minute, meridiem] = match;
  let numericHour = Number(hour);
  if (meridiem.toUpperCase() === 'PM' && numericHour !== 12) numericHour += 12;
  if (meridiem.toUpperCase() === 'AM' && numericHour === 12) numericHour = 0;

  return `${String(numericHour).padStart(2, '0')}:${minute}:00`;
}

function parseAmount(value) {
  if (!value) return null;

  const normalized = value
    .replace(/(?:rs\.?|inr|₹)/gi, '')
    .replace(/,/g, '')
    .trim();
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function detectDirection(line) {
  const normalized = line.toLowerCase();
  if (/\b(cr|credit|credited|received|deposit|refund|cashback)\b/.test(normalized)) return 'credit';
  if (/\b(dr|debit|debited|paid|payment|withdrawal|purchase|sent|to)\b/.test(normalized)) return 'debit';
  return null;
}

function extractVpa(line) {
  const match = line.match(/\b[a-z0-9][a-z0-9._-]{1,}@[a-z][a-z0-9._-]{1,}\b/i);
  return match ? match[0].toLowerCase() : null;
}

function extractAmount(line) {
  const candidates = [];
  const amountPattern = /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)\s*(?:cr|dr)?\b/gi;
  let match;

  while ((match = amountPattern.exec(line)) !== null) {
    const amount = parseAmount(match[1]);
    if (amount !== null) {
      candidates.push(amount);
    }
  }

  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

function normalizeTransaction(tx) {
  const amount = parseAmount(String(tx.amount ?? ''));
  if (!amount) return null;

  return {
    amount,
    direction: tx.direction === 'credit' ? 'credit' : 'debit',
    vpa: typeof tx.vpa === 'string' && tx.vpa.trim() ? tx.vpa.trim().toLowerCase() : null,
    resolved_name: typeof tx.resolved_name === 'string' && tx.resolved_name.trim() ? tx.resolved_name.trim() : null,
    timestamp: typeof tx.timestamp === 'string' && tx.timestamp.trim() ? tx.timestamp.trim() : null,
    raw_text: typeof tx.raw_text === 'string' && tx.raw_text.trim() ? tx.raw_text.trim() : ''
  };
}

function extractGooglePayTransactions(lines) {
  const transactions = [];

  for (let i = 0; i < lines.length; i++) {
    const date = parseMonthNameDate(lines[i]);
    if (!date) continue;

    const timeLine = lines[i + 1];
    const detailLine = lines[i + 2];
    const detailMatch = detailLine?.match(/^(Paid to|Received from)\s+(.+)$/i);
    if (!detailMatch) continue;

    const [, action, counterparty] = detailMatch;
    const direction = action.toLowerCase().startsWith('received') ? 'credit' : 'debit';
    let amount = null;
    let endIndex = i + 2;

    for (let j = i + 3; j < Math.min(i + 8, lines.length); j++) {
      if (/^₹/.test(lines[j])) {
        amount = parseAmount(lines[j]);
        endIndex = j;
        break;
      }
    }

    if (!amount) continue;

    transactions.push({
      amount,
      direction,
      vpa: null,
      resolved_name: counterparty.trim(),
      timestamp: `${date} ${parseTimeToken(timeLine)}`,
      raw_text: lines.slice(i, endIndex + 1).join(' | ')
    });
  }

  return transactions;
}

function extractTransactionsLocally(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (/google pay app/i.test(rawText) || /transaction statement period/i.test(rawText)) {
    return extractGooglePayTransactions(lines);
  }

  const transactions = [];

  for (const line of lines) {
    const dateMatch = line.match(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/);
    const timestamp = parseDateToken(dateMatch?.[0]);
    const amount = extractAmount(line);
    const direction = detectDirection(line);
    const vpa = extractVpa(line);
    const looksLikeTransaction = timestamp && amount && (direction || vpa || /\b(upi|imps|neft|rtgs|atm|pos|ach|nach|transfer)\b/i.test(line));

    if (!looksLikeTransaction) {
      continue;
    }

    transactions.push({
      amount,
      direction: direction || 'debit',
      vpa,
      timestamp,
      raw_text: line
    });
  }

  return transactions;
}

/**
 * Parses a bank statement PDF buffer and runs the ingestion pipeline.
 * 
 * @param {number} userId - The ID of the user uploading the statement.
 * @param {Buffer} pdfBuffer - Multer memory storage PDF buffer.
 * @returns {Promise<object>} - Ingestion summary.
 */
async function parseStatement(userId, pdfBuffer) {
  // 1. Parse PDF to text using pdf-parse v2 class API (never touches disk)
  console.log(`[PDF Parser] Reading PDF buffer for user ID: ${userId}...`);
  const parser = new PDFParse({ data: pdfBuffer });
  let rawText = '';

  try {
    await parser.load();
    const textResult = await parser.getText();
    rawText = typeof textResult === 'string' ? textResult : textResult?.text;
  } catch (err) {
    const parseError = new Error(`Could not read this PDF. It may be corrupted, password-protected, or unsupported. ${err.message || err}`);
    parseError.statusCode = 400;
    throw parseError;
  } finally {
    await parser.destroy();
  }

  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    const emptyTextError = new Error('No readable text could be extracted from this PDF. Scanned or password-protected statements are not supported yet.');
    emptyTextError.statusCode = 400;
    throw emptyTextError;
  }

  // 2. Identify the bank
  const bankName = detectBank(rawText);
  console.log(`[PDF Parser] Detected bank: "${bankName}"`);

  // 3. Extract raw transactions via LLM
  console.log(`[PDF Parser] Sending text to LLM for transaction extraction...`);
  const shouldUseLocalFirst = bankName === 'Google Pay';
  const firstPassTransactions = shouldUseLocalFirst ? extractTransactionsLocally(rawText) : [];
  const llmTransactions = firstPassTransactions.length > 0 ? [] : await GeminiService.extractTransactionsFromPDF(rawText, bankName);
  const localTransactions = llmTransactions.length === 0 && firstPassTransactions.length === 0 ? extractTransactionsLocally(rawText) : firstPassTransactions;
  const extractedTxList = (firstPassTransactions.length > 0 ? firstPassTransactions : llmTransactions.length > 0 ? llmTransactions : localTransactions)
    .map(normalizeTransaction)
    .filter(Boolean);

  if (llmTransactions.length === 0 && localTransactions.length > 0) {
    console.warn(`[PDF Parser] LLM returned no transactions; local fallback found ${localTransactions.length}.`);
  }

  console.log(`[PDF Parser] Extracted ${extractedTxList.length} transactions from statement.`);

  const uniqueTransactions = [];
  let duplicatesSkipped = 0;
  let insertedCount = 0;
  const insertedTransactions = [];

  // 4. Enrich and deduplicate transactions
  for (const tx of extractedTxList) {
    // Enrich VPA properties
    const enriched = tx.vpa
      ? await enrichVpa(userId, tx.vpa)
      : { resolvedName: tx.resolved_name || null, vpaType: 'unknown', upiHandle: null };

    const processedTx = {
      user_id: userId,
      amount: Number(tx.amount) || 0,
      direction: tx.direction === 'credit' ? 'credit' : 'debit', // fallback-safe
      vpa: tx.vpa,
      resolved_name: enriched.resolvedName || tx.resolved_name || null,
      vpa_type: enriched.vpaType,
      upi_handle: enriched.upiHandle,
      timestamp: tx.timestamp,
      raw_text: tx.raw_text,
      category: null,
      subcategory: null,
      confidence: 0.0
    };

    // Run deduplication
    if (isDuplicate(userId, processedTx)) {
      duplicatesSkipped++;
    } else {
      uniqueTransactions.push(processedTx);
    }
  }

  console.log(`[PDF Parser] Deduplicated list: ${uniqueTransactions.length} unique items (${duplicatesSkipped} duplicates skipped).`);

  // 5. Categorize unique transactions in batches
  if (uniqueTransactions.length > 0) {
    console.log(`[PDF Parser] Categorizing ${uniqueTransactions.length} transactions via batch LLM service...`);
    const categorizationResults = await GeminiService.batchCategorize(uniqueTransactions, userId);

    // 6. Save unique transactions
    for (let i = 0; i < uniqueTransactions.length; i++) {
      const tx = uniqueTransactions[i];
      const categoryMeta = categorizationResults[i];

      tx.category = categoryMeta.category;
      tx.subcategory = categoryMeta.subcategory;
      tx.confidence = categoryMeta.confidence;

      try {
        const saved = Transaction.insert(tx);
        insertedTransactions.push(saved);
        insertedCount++;
      } catch (dbErr) {
        console.error(`[PDF Parser] Database insert failed for transaction: ${JSON.stringify(tx)}`, dbErr);
      }
    }
  }

  return {
    total_found: extractedTxList.length,
    inserted: insertedCount,
    duplicates_skipped: duplicatesSkipped,
    sample_transactions: insertedTransactions.slice(0, 5)
  };
}

module.exports = { parseStatement };
