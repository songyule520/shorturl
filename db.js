const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'links.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL DEFAULT '',
    subtitle   TEXT NOT NULL DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  CREATE TABLE IF NOT EXISTS group_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL,
    sort       INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
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
    sort        INTEGER DEFAULT 0,
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
if (!linkCols.includes('sort')) {
  db.exec("ALTER TABLE links ADD COLUMN sort INTEGER DEFAULT 0");
}

// ── groups ───────────────────────────────────────────────────
const stmtGetAllGroups  = db.prepare('SELECT * FROM groups ORDER BY created_at DESC');
const stmtGetGroupByKey = db.prepare('SELECT * FROM groups WHERE key = ?');
const stmtGetGroupById  = db.prepare('SELECT * FROM groups WHERE id = ?');
const stmtAddGroup      = db.prepare('INSERT INTO groups (key, name, subtitle) VALUES (?, ?, ?)');
const stmtUpdateGroup   = db.prepare('UPDATE groups SET key = ?, name = ?, subtitle = ? WHERE id = ?');
const stmtDeleteGroup   = db.prepare('DELETE FROM groups WHERE id = ?');

const stmtGetGroupLinks    = db.prepare('SELECT * FROM group_links WHERE group_id = ? ORDER BY sort ASC, created_at ASC');
const stmtAddGroupLink     = db.prepare('INSERT INTO group_links (group_id, name, url, sort) VALUES (?, ?, ?, ?)');
const stmtUpdateGroupLink  = db.prepare('UPDATE group_links SET name = ?, url = ?, sort = ? WHERE id = ?');
const stmtDeleteGroupLink  = db.prepare('DELETE FROM group_links WHERE id = ?');
const stmtUpdateGroupLinkSort = db.prepare('UPDATE group_links SET sort = ? WHERE id = ?');

function getAllGroups()                           { return stmtGetAllGroups.all(); }
function getGroupByKey(key)                      { return stmtGetGroupByKey.get(key); }
function getGroupById(id)                        { return stmtGetGroupById.get(id); }
function addGroup(key, name, subtitle)           {
  try { return stmtAddGroup.run(key, name, subtitle); }
  catch (err) {
    if (err.message.includes('UNIQUE')) { const e = new Error('Key already exists'); e.code = 'DUPLICATE_KEY'; throw e; }
    throw err;
  }
}
function updateGroup(id, key, name, subtitle)    { return stmtUpdateGroup.run(key, name, subtitle, id); }
function deleteGroup(id)                         { return stmtDeleteGroup.run(id); }

function getGroupLinks(groupId)                  { return stmtGetGroupLinks.all(groupId); }
function addGroupLink(groupId, name, url, sort)  { return stmtAddGroupLink.run(groupId, name, url, sort || 0); }
function updateGroupLink(id, name, url, sort)    { return stmtUpdateGroupLink.run(name, url, sort || 0, id); }
function deleteGroupLink(id)                     { return stmtDeleteGroupLink.run(id); }
function updateGroupLinkSort(id, sort)           { return stmtUpdateGroupLinkSort.run(sort, id); }

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
  SELECT l.key, l.name, l.url, l.category_id, l.sort, l.created_at, c.name AS category_name
  FROM links l LEFT JOIN categories c ON l.category_id = c.id
  ORDER BY l.created_at DESC
`);
const stmtGetAllSorted = db.prepare(`
  SELECT l.key, l.name, l.url, l.category_id, l.sort, l.created_at, c.name AS category_name
  FROM links l LEFT JOIN categories c ON l.category_id = c.id
  ORDER BY l.sort ASC, l.created_at DESC
`);
const stmtUpdateSort = db.prepare('UPDATE links SET sort = ? WHERE key = ?');
const stmtGetPage    = db.prepare(`
  SELECT l.key, l.name, l.url, l.category_id, l.sort, l.created_at, c.name AS category_name
  FROM links l LEFT JOIN categories c ON l.category_id = c.id
  ORDER BY l.created_at DESC LIMIT ? OFFSET ?
`);
const stmtCountLinks       = db.prepare('SELECT COUNT(*) AS total FROM links');
const stmtCountLinksFilter = db.prepare(`SELECT COUNT(*) AS total FROM links WHERE (key LIKE ? OR name LIKE ? OR url LIKE ?) AND (? IS NULL OR category_id = ?)`);
const stmtGetPageFilter    = db.prepare(`
  SELECT l.key, l.name, l.url, l.category_id, l.sort, l.created_at, c.name AS category_name
  FROM links l LEFT JOIN categories c ON l.category_id = c.id
  WHERE (l.key LIKE ? OR l.name LIKE ? OR l.url LIKE ?) AND (? IS NULL OR l.category_id = ?)
  ORDER BY l.created_at DESC LIMIT ? OFFSET ?
`);
const stmtAddLink    = db.prepare('INSERT INTO links (key, name, url, category_id) VALUES (?, ?, ?, ?)');
const stmtUpdateLink = db.prepare('UPDATE links SET name = ?, url = ?, category_id = ? WHERE key = ?');
const stmtDeleteLink = db.prepare('DELETE FROM links WHERE key = ?');

const updateSortBatch = db.transaction((items) => {
  items.forEach(({ key, sort }) => stmtUpdateSort.run(sort, key));
});

function getLink(key)                          { return stmtGetLink.get(key); }
function getAllLinks()                          { return stmtGetAll.all(); }
function getAllLinksSorted()                    { return stmtGetAllSorted.all(); }
function updateLinkSorts(items)                { return updateSortBatch(items); }
function getLinksPage(page, size, q, catId) {
  if (q || catId) {
    const like = `%${q || ''}%`;
    const cat = catId || null;
    return stmtGetPageFilter.all(like, like, like, cat, cat, size, (page - 1) * size);
  }
  return stmtGetPage.all(size, (page - 1) * size);
}
function countLinks(q, catId) {
  if (q || catId) {
    const like = `%${q || ''}%`;
    const cat = catId || null;
    return stmtCountLinksFilter.get(like, like, like, cat, cat).total;
  }
  return stmtCountLinks.get().total;
}
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
  getAllGroups, getGroupByKey, getGroupById, addGroup, updateGroup, deleteGroup,
  getGroupLinks, addGroupLink, updateGroupLink, deleteGroupLink, updateGroupLinkSort,
  getAllCategories, addCategory, updateCategory, deleteCategory,
  getLink, getAllLinks, getAllLinksSorted, getLinksPage, countLinks,
  addLink, updateLink, updateLinkSorts, deleteLink,
};
