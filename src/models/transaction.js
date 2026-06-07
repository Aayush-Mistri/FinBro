const db = require('../db/db');

const Transaction = {
  insert(data) {
    const stmt = db.prepare(`
      INSERT INTO transactions (
        user_id, amount, direction, vpa, resolved_name, vpa_type,
        upi_handle, category, subcategory, confidence, timestamp, raw_text
      ) VALUES (
        @user_id, @amount, @direction, @vpa, @resolved_name, @vpa_type,
        @upi_handle, @category, @subcategory, @confidence, @timestamp, @raw_text
      )
    `);
    const info = stmt.run(data);
    return { id: info.lastInsertRowid, ...data };
  },

  getByUserId(userId) {
    const stmt = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC');
    return stmt.all(userId);
  },

  getByDateRange(userId, from, to) {
    const stmt = db.prepare('SELECT * FROM transactions WHERE user_id = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp DESC');
    return stmt.all(userId, from, to);
  },

  getByCategory(userId, category) {
    const stmt = db.prepare('SELECT * FROM transactions WHERE user_id = ? AND category = ? ORDER BY timestamp DESC');
    return stmt.all(userId, category);
  },

  getUncategorized(userId) {
    const stmt = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND (category IS NULL OR category = '')
      ORDER BY timestamp DESC
    `);
    return stmt.all(userId);
  },

  getTopMerchants(userId, limit = 10) {
    const stmt = db.prepare(`
      SELECT COALESCE(resolved_name, vpa, 'Unknown Merchant') AS merchant_name,
             SUM(amount) AS total_spend,
             COUNT(*) AS transaction_count
      FROM transactions
      WHERE user_id = ? AND direction = 'debit'
      GROUP BY merchant_name
      ORDER BY total_spend DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  },

  getMonthlySummary(userId) {
    const stmt = db.prepare(`
      SELECT strftime('%Y-%m', timestamp) AS month,
             SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) AS total_income,
             SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) AS total_expense
      FROM transactions
      WHERE user_id = ? AND timestamp IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
    `);
    return stmt.all(userId);
  },

  getWeeklyCashflow(userId) {
    const stmt = db.prepare(`
      SELECT strftime('%Y-%W', timestamp) AS week,
             SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) AS credits,
             SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) AS debits
      FROM transactions
      WHERE user_id = ? AND timestamp IS NOT NULL
      GROUP BY week
      ORDER BY week ASC
    `);
    return stmt.all(userId);
  },

  existsDuplicate(userId, amount, vpa, timestamp) {
    // If timestamp is not provided, we check for exact same amount and VPA recently or skip.
    // Let's protect against null timestamp.
    if (!timestamp) return false;
    
    const stmt = db.prepare(`
      SELECT 1 FROM transactions
      WHERE user_id = ?
        AND amount = ?
        AND vpa = ?
        AND timestamp IS NOT NULL
        AND abs(strftime('%s', timestamp) - strftime('%s', ?)) <= 60
      LIMIT 1
    `);
    const result = stmt.get(userId, amount, vpa, timestamp);
    return !!result;
  }
};

module.exports = Transaction;
