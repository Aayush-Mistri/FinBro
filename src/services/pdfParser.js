const pdfParse = require('pdf-parse');
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
  if (t.includes('hdfc bank')) return 'HDFC Bank';
  if (t.includes('state bank') || t.includes('sbi')) return 'State Bank of India';
  if (t.includes('icici bank') || t.includes('icici')) return 'ICICI Bank';
  if (t.includes('axis bank') || t.includes('axis')) return 'Axis Bank';
  if (t.includes('kotak')) return 'Kotak Mahindra Bank';
  if (t.includes('yes bank')) return 'Yes Bank';
  return 'Unknown Bank';
}

/**
 * Parses a bank statement PDF buffer and runs the ingestion pipeline.
 * 
 * @param {number} userId - The ID of the user uploading the statement.
 * @param {Buffer} pdfBuffer - Multer memory storage PDF buffer.
 * @returns {Promise<object>} - Ingestion summary.
 */
async function parseStatement(userId, pdfBuffer) {
  // 1. Parse PDF to text (never touches disk)
  console.log(`[PDF Parser] Reading PDF buffer for user ID: ${userId}...`);
  const parsedPdf = await pdfParse(pdfBuffer);
  const rawText = parsedPdf.text;

  // 2. Identify the bank
  const bankName = detectBank(rawText);
  console.log(`[PDF Parser] Detected bank: "${bankName}"`);

  // 3. Extract raw transactions via LLM
  console.log(`[PDF Parser] Sending text to LLM for transaction extraction...`);
  const extractedTxList = await GeminiService.extractTransactionsFromPDF(rawText, bankName);
  console.log(`[PDF Parser] Extracted ${extractedTxList.length} transactions from statement.`);

  const uniqueTransactions = [];
  let duplicatesSkipped = 0;
  let insertedCount = 0;
  const insertedTransactions = [];

  // 4. Enrich and deduplicate transactions
  for (const tx of extractedTxList) {
    // Enrich VPA properties
    const enriched = await enrichVpa(userId, tx.vpa);

    const processedTx = {
      user_id: userId,
      amount: Number(tx.amount) || 0,
      direction: tx.direction === 'credit' ? 'credit' : 'debit', // fallback-safe
      vpa: tx.vpa,
      resolved_name: enriched.resolvedName,
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
