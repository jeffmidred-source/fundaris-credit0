const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'kumasi.db');
const db = new sqlite3.Database(dbPath);

function initSqlDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS contact_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT,
          phone TEXT,
          message TEXT,
          created_at TEXT
        )
      `, (err) => {
        if (err) return reject(err);

        db.run(`
          CREATE TABLE IF NOT EXISTS loan_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            product TEXT,
            amount TEXT,
            term TEXT,
            email TEXT,
            phone TEXT,
            status TEXT,
            created_at TEXT
          )
        `, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
  });
}

function addContactSubmission(payload) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO contact_submissions (name, email, phone, message, created_at) VALUES (?, ?, ?, ?, ?)',
      [payload.name, payload.email, payload.phone, payload.message, payload.createdAt],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

function addLoanApplication(payload) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO loan_applications (name, product, amount, term, email, phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [payload.name, payload.product, payload.amount, payload.term, payload.email, payload.phone, payload.status, payload.createdAt],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

function getAllSubmissions() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM contact_submissions ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAllApplications() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM loan_applications ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = {
  initSqlDatabase,
  addContactSubmission,
  addLoanApplication,
  getAllSubmissions,
  getAllApplications
};

