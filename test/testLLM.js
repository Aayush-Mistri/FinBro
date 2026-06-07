require('dotenv').config();
const GeminiService = require('../src/services/geminiService');

async function testLLM() {
  console.log('--- Testing Gemini Service API ---');
  console.log('GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
  console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);
  
  // 1. Test transaction extraction mock text
  const mockText = `
    HDFC Bank Statement
    Date: 2026-06-01
    01/06/2026 UPI-ZOMATO-zomato@okicici-1234567890 DEBIT 350.00
    02/06/2026 UPI-SALARY-salary@company-9988776655 CREDIT 50000.00
    03/06/2026 UPI-FRIEND-9876543210@paytm-1122334455 DEBIT 1000.00
  `;

  console.log('\n[1] Testing Transaction Extraction...');
  try {
    const txs = await GeminiService.extractTransactionsFromPDF(mockText, 'HDFC Bank');
    console.log('Extracted Transactions Result:');
    console.log(JSON.stringify(txs, null, 2));
  } catch (err) {
    console.error('Extraction test failed:', err);
  }

  // 2. Test Pattern Detection
  console.log('\n[2] Testing Pattern Detection...');
  // We need to write mock transactions into the DB for user 1 to test this.
  const db = require('../src/db/db');
  // Check if test user exists
  let user = db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!user) {
    db.prepare("INSERT INTO users (id, name, email, password) VALUES (1, 'Test User', 'test@example.com', 'hash')").run();
  }
  
  // Insert some mock transactions
  db.prepare('DELETE FROM transactions WHERE user_id = 1').run();
  
  const insertTx = db.prepare(`
    INSERT INTO transactions (
      user_id, amount, direction, vpa, resolved_name, vpa_type, upi_handle, category, subcategory, confidence, timestamp, raw_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTx.run(1, 350.00, 'debit', 'zomato@okicici', 'Zomato', 'merchant', '@okicici', 'Food', 'Restaurants', 0.95, '2026-06-01 12:00:00', 'zomato match');
  insertTx.run(1, 499.00, 'debit', 'netflix@paytm', 'Netflix', 'merchant', '@paytm', 'Entertainment', 'Subscription', 0.99, '2026-05-15 08:00:00', 'netflix match');
  insertTx.run(1, 499.00, 'debit', 'netflix@paytm', 'Netflix', 'merchant', '@paytm', 'Entertainment', 'Subscription', 0.99, '2026-06-15 08:00:00', 'netflix match');
  insertTx.run(1, 50000.00, 'credit', 'salary@company', 'Salary Source', 'personal', '@company', 'Income', 'Salary', 0.99, '2026-06-01 09:00:00', 'salary match');

  try {
    const patterns = await GeminiService.detectPatterns(1);
    console.log('Detected Patterns Result:');
    console.log(JSON.stringify(patterns, null, 2));
  } catch (err) {
    console.error('Pattern detection test failed:', err);
  }

  // 3. Test Chat
  console.log('\n[3] Testing Chat Interface...');
  try {
    const reply = await GeminiService.chat(1, 'How much did I spend on Netflix or Zomato?');
    console.log('Chat Reply:');
    console.log(reply);
  } catch (err) {
    console.error('Chat test failed:', err);
  }
}

testLLM();
