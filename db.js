const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'links.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    key        TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

function getLink(key) {
  return db.prepare('SELECT url FROM links WHERE key = ?').get(key);
}

function getAllLinks() {
  return db.prepare('SELECT key, url, created_at FROM links ORDER BY created_at DESC').all();
}

function addLink(key, url) {
  return db.prepare('INSERT INTO links (key, url) VALUES (?, ?)').run(key, url);
}

function deleteLink(key) {
  return db.prepare('DELETE FROM links WHERE key = ?').run(key);
}

module.exports = { getLink, getAllLinks, addLink, deleteLink };
