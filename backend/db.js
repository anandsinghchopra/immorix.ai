const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db');

// Create the "users" table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

module.exports = db;
