const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the data directory exists
const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'finsight.db');

// Connect to SQLite database
const db = new Database(dbPath);

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize database schema on startup
const initSchema = () => {
  // Create users table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Create transactions table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      direction TEXT CHECK(direction IN ('credit','debit')) NOT NULL,
      vpa TEXT,
      resolved_name TEXT,
      vpa_type TEXT CHECK(vpa_type IN ('personal','merchant','unknown')),
      upi_handle TEXT,
      category TEXT,
      subcategory TEXT,
      confidence REAL,
      timestamp DATETIME,
      raw_text TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // Create vpa_labels table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vpa_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vpa TEXT NOT NULL,
      label TEXT NOT NULL,
      category TEXT,
      UNIQUE(user_id, vpa),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // Create vpa_cache table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vpa_cache (
      vpa TEXT PRIMARY KEY,
      resolved_name TEXT,
      vpa_type TEXT,
      looked_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
};

initSchema();

module.exports = db;
