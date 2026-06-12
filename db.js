const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'links.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    key        TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// migrate: add name column if it doesn't exist (for existing databases)
const cols = db.prepare("PRAGMA table_info(links)").all().map(c => c.name);
if (!cols.includes('name')) {
  db.exec("ALTER TABLE links ADD COLUMN name TEXT NOT NULL DEFAULT ''");
}

const stmtGetLink    = db.prepare('SELECT url FROM links WHERE key = ?');
const stmtGetAll     = db.prepare('SELECT key, name, url, created_at FROM links ORDER BY created_at DESC');
const stmtAddLink    = db.prepare('INSERT INTO links (key, name, url) VALUES (?, ?, ?)');
const stmtUpdateLink = db.prepare('UPDATE links SET name = ?, url = ? WHERE key = ?');
const stmtDeleteLink = db.prepare('DELETE FROM links WHERE key = ?');

function getLink(key)             { return stmtGetLink.get(key); }
function getAllLinks()             { return stmtGetAll.all(); }
function addLink(key, name, url)  {
  try {
    return stmtAddLink.run(key, name, url);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      const e = new Error(`Key "${key}" already exists`);
      e.code = 'DUPLICATE_KEY';
      throw e;
    }
    throw err;
  }
}
function updateLink(key, name, url) { return stmtUpdateLink.run(name, url, key); }
function deleteLink(key)            { return stmtDeleteLink.run(key); }

module.exports = { getLink, getAllLinks, addLink, updateLink, deleteLink };
