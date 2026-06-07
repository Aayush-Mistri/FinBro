const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db/db');
const Transaction = require('../models/transaction');
const VPALabel = require('../models/vpaLabel');

// Initialize Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * Universal helper to call Gemini or fallback to Groq.
 * 
 * @param {string} prompt - The text prompt.
 * @param {boolean} jsonMode - If true, requests JSON and parses the response.
 * @returns {Promise<string|object>} - LLM text response or parsed JSON.
 */
async function callLLM(prompt, jsonMode = false) {
  // 1. Try Gemini
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const config = {};
    if (jsonMode) {
      config.responseMimeType = 'application/json';
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: config
    });

    const text = result.response.text();
    if (jsonMode) {
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleaned);
    }
    return text;
  } catch (geminiError) {
    console.warn(`[LLM Warning] Gemini call failed: ${geminiError.message || geminiError}. Trying Groq fallback...`);

    // 2. Fallback to Groq
    try {
      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        throw new Error('GROQ_API_KEY is not configured.');
      }

      const body = {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      };

      if (jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      const content = resJson.choices[0].message.content;

      if (jsonMode) {
        const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(cleaned);
      }
      return content;
    } catch (groqError) {
      console.error('[LLM Error] Both Gemini and Groq calls failed.');
      throw new Error(`LLM Error: Gemini failed (${geminiError.message}) & Groq failed (${groqError.message})`);
    }
  }
}

const GeminiService = {
  /**
   * Parse messy statement text using LLM.
   */
  async extractTransactionsFromPDF(rawText, bankName) {
    const prompt = `You are an expert financial transaction extractor. Parse the following messy text from a bank statement for the bank: "${bankName || 'Unknown Bank'}".
Extract all transactions (both credit and debit).
Return ONLY a valid JSON object with a "transactions" array, with no markdown formatting, no backticks, and no explanation.
Each object in the transactions array must strictly have these fields:
- amount: (number, positive float)
- direction: (string, either 'credit' or 'debit')
- vpa: (string or null, e.g. 'friend@ybl', 'payment@paytm', or null)
- timestamp: (string in 'YYYY-MM-DD HH:mm:ss' format, or null if date/time is missing/unparseable)
- raw_text: (string, the exact line or text snippet from which this transaction was extracted)

If any field is missing or cannot be parsed, use null for that field. Do not skip any transactions.

Format:
{
  "transactions": [
    {
      "amount": 0,
      "direction": "debit",
      "vpa": null,
      "timestamp": null,
      "raw_text": ""
    }
  ]
}

Statement text:
"""
${rawText}
"""`;

    try {
      const result = await callLLM(prompt, true);
      if (Array.isArray(result)) {
        return result;
      } else if (result && Array.isArray(result.transactions)) {
        return result.transactions;
      }
      return [];
    } catch (err) {
      console.error('[LLM] Error extracting transactions:', err);
      return [];
    }
  },

  /**
   * Categorize transactions in batches of max 50.
   */
  async batchCategorize(transactions, userId) {
    if (!transactions || transactions.length === 0) return [];

    const results = new Array(transactions.length);
    const uncategorizedIndices = [];
    const uncategorizedPayload = [];

    // 1. Check vpa_labels first (skip LLM for manually-labeled VPAs)
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const label = tx.vpa ? VPALabel.getByVpa(userId, tx.vpa) : null;

      if (label && label.category) {
        results[i] = {
          category: label.category,
          subcategory: label.label || 'Manual Label',
          confidence: 1.0
        };
      } else {
        uncategorizedIndices.push(i);
        uncategorizedPayload.push({
          index: i,
          amount: tx.amount,
          direction: tx.direction,
          vpa: tx.vpa,
          resolved_name: tx.resolved_name,
          raw_text: tx.raw_text
        });
      }
    }

    if (uncategorizedPayload.length === 0) {
      return results;
    }

    // 2. Call LLM in batches of max 50
    const batchSize = 50;
    for (let i = 0; i < uncategorizedPayload.length; i += batchSize) {
      const batch = uncategorizedPayload.slice(i, i + batchSize);

      const prompt = `You are a financial transaction classifier. Categorize the following transactions.
Categories must strictly be one of: Food, Transport, Shopping, Entertainment, Bills, Healthcare, Education, Investment, Income, Peer Transfer, EMI, Other.
Provide a specific subcategory as well (e.g. if category is Food, subcategory could be Restaurants, Groceries, Delivery, etc.).
Assign a confidence score between 0.0 and 1.0.

Return ONLY a valid JSON object containing an array called "categorized". Do not return any markdown code blocks, backticks, or explanation.
Format:
{
  "categorized": [
    {
      "index": (number, the index of the transaction in the input batch),
      "category": (string, one of the allowed categories),
      "subcategory": (string, specific subcategory name),
      "confidence": (number, confidence score between 0.0 and 1.0)
    }
  ]
}

Transactions to categorize:
${JSON.stringify(batch, null, 2)}`;

      try {
        const response = await callLLM(prompt, true);
        const items = response.categorized || response;
        if (Array.isArray(items)) {
          for (const item of items) {
            results[item.index] = {
              category: item.category,
              subcategory: item.subcategory,
              confidence: item.confidence
            };
          }
        }
      } catch (err) {
        console.error(`[LLM] Error categorizing batch starting at index ${i}:`, err);
      }
    }

    // Fill in defaults for any missing/failed ones
    for (let i = 0; i < transactions.length; i++) {
      if (!results[i]) {
        results[i] = {
          category: 'Other',
          subcategory: 'Uncategorized',
          confidence: 0.0
        };
      }
    }

    return results;
  },

  /**
   * Detect spending patterns in the last 90 days.
   */
  async detectPatterns(userId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const fromStr = ninetyDaysAgo.toISOString().replace('T', ' ').slice(0, 19);
    const toStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const transactions = Transaction.getByDateRange(userId, fromStr, toStr);

    if (transactions.length === 0) {
      return {
        recurring_payments: [],
        top_spending_categories: [],
        unusual_spikes: [],
        income_sources: [],
        estimated_monthly_savings_rate: 0.0,
        message: 'No transactions found in the last 90 days.'
      };
    }

    const conciseTransactions = transactions.map(t => ({
      amount: t.amount,
      direction: t.direction,
      merchant: t.resolved_name || t.vpa || 'Unknown',
      category: t.category,
      timestamp: t.timestamp
    }));

    const prompt = `You are a financial advisor. Analyze the following list of transactions from the last 90 days.
Identify:
1. Recurring payments: Payments that repeat to the same merchant or VPA, with similar amounts, at periodic intervals (e.g. monthly subscriptions, weekly transfers).
2. Top spending categories: Summarize where most of the money goes.
3. Unusual spikes: Transactions with exceptionally high amounts compared to average.
4. Income sources: Sources of incoming funds and their frequency.
5. Estimated monthly savings rate: Based on total income vs expense, calculate the savings rate as a percentage of total income.

Return ONLY a valid JSON object (no markdown, no backticks, no explanations) structured as follows:
{
  "recurring_payments": [
    { "merchant": "Netflix", "amount": 499, "frequency": "Monthly", "confidence": 0.95 }
  ],
  "top_spending_categories": [
    { "category": "Food", "total_amount": 12500, "percentage_of_expense": 35.5 }
  ],
  "unusual_spikes": [
    { "merchant": "Apple Store", "amount": 89900, "date": "2026-05-15" }
  ],
  "income_sources": [
    { "source": "Salary from Org", "amount": 120000, "frequency": "Monthly" }
  ],
  "estimated_monthly_savings_rate": 24.5
}

Transactions:
${JSON.stringify(conciseTransactions, null, 2)}`;

    try {
      return await callLLM(prompt, true);
    } catch (err) {
      console.error('[LLM] Error detecting patterns:', err);
      return {
        recurring_payments: [],
        top_spending_categories: [],
        unusual_spikes: [],
        income_sources: [],
        estimated_monthly_savings_rate: 0.0,
        error: err.message || err
      };
    }
  },

  /**
   * Generate weekly insights for last 7 days.
   */
  async generateInsight(userId) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fromStr = sevenDaysAgo.toISOString().replace('T', ' ').slice(0, 19);
    const toStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const transactions = Transaction.getByDateRange(userId, fromStr, toStr);

    if (transactions.length === 0) {
      return `• No transactions were recorded in the last 7 days.
• Upload your latest bank statement to see new financial insights!`;
    }

    const conciseTransactions = transactions.map(t => ({
      amount: t.amount,
      direction: t.direction,
      merchant: t.resolved_name || t.vpa || 'Unknown',
      category: t.category,
      timestamp: t.timestamp
    }));

    const prompt = `You are a personal finance coach. Review the user's transactions for the last 7 days and generate 4-5 high-quality, actionable bullet-point insights.
Focus on:
- Total expenditure vs income.
- Highest spending areas.
- Subscription or repeating transactions.
- Savings recommendation.

Format the output strictly as plain text with 4-5 bullet points, each starting with "• ". Do not return JSON or markdown headers.

Transactions:
${JSON.stringify(conciseTransactions, null, 2)}`;

    try {
      return await callLLM(prompt, false);
    } catch (err) {
      console.error('[LLM] Error generating insight:', err);
      return `• Error generating weekly insights: ${err.message || err}
• Please check your dashboard to review your recent cashflow.`;
    }
  },

  /**
   * Conversation chat based on database query results context.
   */
  async chat(userId, message) {
    // 1. Identify search filter intent from user query
    const intentPrompt = `Analyze the following user query for financial transaction filters.
Extract intent parameters. Return ONLY a valid JSON object with the following fields (use null if not mentioned):
- from_date: (string in YYYY-MM-DD format or null)
- to_date: (string in YYYY-MM-DD format or null)
- category: (string, one of: Food, Transport, Shopping, Entertainment, Bills, Healthcare, Education, Investment, Income, Peer Transfer, EMI, Other, or null)
- merchant: (string to match merchant/VPA, or null)
- min_amount: (number or null)
- max_amount: (number or null)

User Query: "${message}"`;

    let filters = {
      from_date: null,
      to_date: null,
      category: null,
      merchant: null,
      min_amount: null,
      max_amount: null
    };

    try {
      filters = await callLLM(intentPrompt, true);
    } catch (err) {
      console.warn('[LLM Chat] Intent parsing failed, continuing with no filters.', err.message || err);
    }

    // 2. Query database with filters
    const params = [userId];
    let query = 'SELECT * FROM transactions WHERE user_id = ?';

    if (filters.from_date) {
      query += ' AND timestamp >= ?';
      params.push(filters.from_date + ' 00:00:00');
    }
    if (filters.to_date) {
      query += ' AND timestamp <= ?';
      params.push(filters.to_date + ' 23:59:59');
    }
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters.merchant) {
      query += ' AND (resolved_name LIKE ? OR vpa LIKE ?)';
      params.push(`%${filters.merchant}%`, `%${filters.merchant}%`);
    }
    if (filters.min_amount) {
      query += ' AND amount >= ?';
      params.push(filters.min_amount);
    }
    if (filters.max_amount) {
      query += ' AND amount <= ?';
      params.push(filters.max_amount);
    }

    query += ' ORDER BY timestamp DESC LIMIT 50';

    let transactions = [];
    try {
      const stmt = db.prepare(query);
      transactions = stmt.all(...params);
    } catch (err) {
      console.error('[LLM Chat] DB query failed:', err);
    }

    // 3. Generate answer using results context
    const chatPrompt = `You are FinSight, a personal finance AI assistant. Answer the user's question using the context of their transactions retrieved from the database.
If no transactions are found (database results are empty), explain clearly that you could not find any matching transactions for their request. Do not hallucinate or invent any transactions.
Be helpful, natural, and format numbers cleanly (e.g. ₹500).

User Question: "${message}"

Database Search Results:
${JSON.stringify(transactions, null, 2)}`;

    try {
      const reply = await callLLM(chatPrompt, false);
      return reply;
    } catch (err) {
      console.error('[LLM Chat] Failed to generate response:', err);
      return `I ran into an issue retrieving an answer. However, I searched your records and found ${transactions.length} matching transactions. Please try rephrasing your question!`;
    }
  }
};

module.exports = GeminiService;
