const Transaction = require('../models/transaction');
const GeminiService = require('../services/geminiService');
const db = require('../db/db');

exports.getDashboard = async (req, res) => {
  const userId = req.user.id;

  try {
    console.log(`[Dashboard Controller] Loading dashboard metrics for user ID ${userId}...`);

    // 1. Monthly spend by category (debits grouped by category)
    const categorySpendStmt = db.prepare(`
      SELECT category, SUM(amount) AS total_amount, COUNT(*) AS count
      FROM transactions
      WHERE user_id = ? AND direction = 'debit' AND category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY total_amount DESC
    `);
    const monthlySpendByCategory = categorySpendStmt.all(userId);

    // 2. Weekly cashflow (income vs expense per week)
    const weeklyCashflow = Transaction.getWeeklyCashflow(userId);

    // 3. Top merchants (top 10 by total spend)
    const topMerchants = Transaction.getTopMerchants(userId, 10);

    // 4. Savings rate (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromStr = thirtyDaysAgo.toISOString().replace('T', ' ').slice(0, 19);

    const savingsStmt = db.prepare(`
      SELECT 
        SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) AS total_income,
        SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) AS total_expense
      FROM transactions
      WHERE user_id = ? AND timestamp >= ?
    `);
    const totals = savingsStmt.get(userId, fromStr);
    const income = totals.total_income || 0;
    const expense = totals.total_expense || 0;
    let savingsRate = 0;
    if (income > 0) {
      savingsRate = ((income - expense) / income) * 100;
      savingsRate = Math.round(savingsRate * 100) / 100;
    }

    // 5. Patterns (from detectPatterns service)
    console.log(`[Dashboard Controller] Fetching LLM patterns for user ID ${userId}...`);
    const patterns = await GeminiService.detectPatterns(userId);

    return res.json({
      monthly_spend_by_category: monthlySpendByCategory,
      weekly_cashflow: weeklyCashflow,
      top_merchants: topMerchants,
      patterns: patterns,
      savings_rate: {
        last_30_days: {
          income,
          expense,
          savings_rate_percent: savingsRate
        }
      }
    });
  } catch (err) {
    console.error('[Dashboard Controller] Error fetching dashboard data:', err);
    return res.status(500).json({ error: 'Failed to retrieve dashboard data. ' + err.message });
  }
};
