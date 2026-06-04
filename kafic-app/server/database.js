const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'kafic.db'));

// Kreiraj tabele ako ne postoje
db.exec(`
  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    guest_name TEXT NOT NULL,
    total_amount REAL DEFAULT 0,
    opened_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT,
    FOREIGN KEY (table_id) REFERENCES tables(id)
  );

  CREATE TABLE IF NOT EXISTS session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_revenue REAL DEFAULT 0,
    generated_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;