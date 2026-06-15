const express = require('express');
const path = require('path');
const {
  getAllCategories, addCategory, updateCategory, deleteCategory,
  getLink, getAllLinks, getLinksPage, countLinks, addLink, updateLink, deleteLink,
} = require('./db');

const app = express();
app.use(express.json());

const router = express.Router();

// Pages
router.get('/',       (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
router.get('/manage', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

// ── Categories API ───────────────────────────────────────────
router.get('/categories', (req, res) => {
  res.json(getAllCategories());
});

router.post('/categories', (req, res) => {
  const { name, sort } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = addCategory(name, sort || 0);
    res.status(201).json({ id: result.lastInsertRowid, name, sort: sort || 0 });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '分类名称已存在' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/categories/:id', (req, res) => {
  const { name, sort } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = updateCategory(req.params.id, name, sort || 0);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ id: Number(req.params.id), name, sort: sort || 0 });
});

router.delete('/categories/:id', (req, res) => {
  const result = deleteCategory(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.status(204).end();
});

// ── Links API ────────────────────────────────────────────────
router.get('/links', (req, res) => {
  const page = parseInt(req.query.page) || 0;
  const size = 10;
  if (page > 0) {
    const total = countLinks();
    const items = getLinksPage(page, size);
    return res.json({ items, total, page, pages: Math.ceil(total / size) });
  }
  res.json(getAllLinks());
});

router.post('/links', (req, res) => {
  const { key, name, url, category_id } = req.body;
  if (!key || !url) return res.status(400).json({ error: 'key and url are required' });
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    return res.status(400).json({ error: 'key must contain only letters, numbers, hyphens, and underscores' });
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'url must be an http or https URL' });
    }
  } catch {
    return res.status(400).json({ error: 'url must be a valid URL' });
  }
  try {
    addLink(key, name || key, url, category_id);
    res.status(201).json({ key, name: name || key, url, category_id: category_id || null });
  } catch (err) {
    if (err.code === 'DUPLICATE_KEY') return res.status(409).json({ error: 'Key already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/links/:key', (req, res) => {
  const { name, url, category_id } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'url must be an http or https URL' });
    }
  } catch {
    return res.status(400).json({ error: 'url must be a valid URL' });
  }
  const result = updateLink(req.params.key, name || req.params.key, url, category_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  const updated = getAllLinks().find(l => l.key === req.params.key);
  res.json(updated);
});

router.delete('/links/:key', (req, res) => {
  const result = deleteLink(req.params.key);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  res.status(204).end();
});

// Short link redirect — catch-all, must be last
router.get('/:key', (req, res) => {
  const row = getLink(req.params.key);
  if (!row) return res.status(404).send('Not found');
  try {
    const parsed = new URL(row.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid redirect target');
    }
  } catch {
    return res.status(400).send('Invalid redirect target');
  }
  res.redirect(302, row.url);
});

app.use('/', router);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
