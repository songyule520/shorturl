const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'links.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    sort       INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  CREATE TABLE IF NOT EXISTS links (
    key         TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL,
    category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
    created_at  INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

// migrations for existing databases
const linkCols = db.prepare("PRAGMA table_info(links)").all().map(c => c.name);
if (!linkCols.includes('name')) {
  db.exec("ALTER TABLE links ADD COLUMN name TEXT NOT NULL DEFAULT ''");
}
if (!linkCols.includes('category_id')) {
  db.exec("ALTER TABLE links ADD COLUMN category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL");
}

// ── settings ─────────────────────────────────────────────────
const stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSetSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getSetting(key, fallback = '')  {
  const row = stmtGetSetting.get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) { return stmtSetSetting.run(key, value); }

// ── categories ──────────────────────────────────────────────
const stmtGetAllCats  = db.prepare('SELECT * FROM categories ORDER BY sort, id');
const stmtAddCat      = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)');
const stmtUpdateCat   = db.prepare('UPDATE categories SET name = ?, sort = ? WHERE id = ?');
const stmtDeleteCat   = db.prepare('DELETE FROM categories WHERE id = ?');

function getAllCategories()            { return stmtGetAllCats.all(); }
function addCategory(name, sort = 0)  { return stmtAddCat.run(name, sort); }
function updateCategory(id, name, sort) { return stmtUpdateCat.run(name, sort, id); }
function deleteCategory(id)           { return stmtDeleteCat.run(id); }

// ── links ────────────────────────────────────────────────────
const stmtGetLink    = db.prepare('SELECT url FROM links WHERE key = ?');
const stmtGetAll     = db.prepare(`
  SELECT l.key, l.name, l.url, l.category_id, l.created_at, c.name AS category_name
  FROM links l LEFT JOIN categories c ON l.category_id = c.id
  ORDER BY l.created_at DESC
`);
const stmtGetPage    = db.prepare(`
  SELECT l.key, l.name, l.url, l.category_id, l.created_at, c.name AS category_name
  FROM links l LEFT JOIN categories c ON l.category_id = c.id
  ORDER BY l.created_at DESC LIMIT ? OFFSET ?
`);
const stmtCountLinks = db.prepare('SELECT COUNT(*) AS total FROM links');
const stmtAddLink    = db.prepare('INSERT INTO links (key, name, url, category_id) VALUES (?, ?, ?, ?)');
const stmtUpdateLink = db.prepare('UPDATE links SET name = ?, url = ?, category_id = ? WHERE key = ?');
const stmtDeleteLink = db.prepare('DELETE FROM links WHERE key = ?');

function getLink(key)                          { return stmtGetLink.get(key); }
function getAllLinks()                          { return stmtGetAll.all(); }
function getLinksPage(page, size)              { return stmtGetPage.all(size, (page - 1) * size); }
function countLinks()                          { return stmtCountLinks.get().total; }
function addLink(key, name, url, categoryId)   {
  try {
    return stmtAddLink.run(key, name, url, categoryId || null);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      const e = new Error(`Key "${key}" already exists`);
      e.code = 'DUPLICATE_KEY';
      throw e;
    }
    throw err;
  }
}
function updateLink(key, name, url, categoryId) {
  return stmtUpdateLink.run(name, url, categoryId || null, key);
}
function deleteLink(key) { return stmtDeleteLink.run(key); }

module.exports = {
  getSetting, setSetting,
  getAllCategories, addCategory, updateCategory, deleteCategory,
  getLink, getAllLinks, getLinksPage, countLinks, addLink, updateLink, deleteLink,
};
