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

const stmtGetLink    = db.prepare('SELECT url FROM links WHERE key = ?');
const stmtGetAll     = db.prepare('SELECT key, url, created_at FROM links ORDER BY created_at DESC');
const stmtAddLink    = db.prepare('INSERT INTO links (key, url) VALUES (?, ?)');
const stmtDeleteLink = db.prepare('DELETE FROM links WHERE key = ?');

function getLink(key)      { return stmtGetLink.get(key); }
function getAllLinks()      { return stmtGetAll.all(); }
function addLink(key, url) {
  try {
    return stmtAddLink.run(key, url);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      const e = new Error(`Key "${key}" already exists`);
      e.code = 'DUPLICATE_KEY';
      throw e;
    }
    throw err;
  }
}
function deleteLink(key)   { return stmtDeleteLink.run(key); }

module.exports = { getLink, getAllLinks, addLink, deleteLink };
