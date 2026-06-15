const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
  getSetting, setSetting,
  getAllCategories, addCategory, updateCategory, deleteCategory,
  getLink, getAllLinks, getAllLinksSorted, getLinksPage, countLinks,
  addLink, updateLink, updateLinkSorts, deleteLink,
} = require('./db');

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, 'avatar' + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('只能上传图片'));
    cb(null, true);
  },
});

const app = express();
app.use(express.json());

const router = express.Router();

// Static uploads
app.use('/public', express.static(path.join(__dirname, 'public')));

// Pages
router.get('/',       (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
router.get('/manage', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

// ── Settings API ─────────────────────────────────────────────
router.get('/settings', (req, res) => {
  res.json({
    title:    getSetting('title',    '链接导航'),
    subtitle: getSetting('subtitle', '点击分类查看链接'),
    avatar:   getSetting('avatar',   ''),
  });
});

router.post('/settings', (req, res) => {
  const { title, subtitle } = req.body;
  if (title    !== undefined) setSetting('title',    title);
  if (subtitle !== undefined) setSetting('subtitle', subtitle);
  res.json({ ok: true });
});

router.post('/settings/avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片' });
  const url = '/public/uploads/' + req.file.filename;
  setSetting('avatar', url);
  res.json({ url });
});

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
  // sorted=1 for display page, default for admin
  if (req.query.sorted === '1') return res.json(getAllLinksSorted());
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

// API: update single link sort value
router.patch('/links/:key/sort', (req, res) => {
  const { sort } = req.body;
  if (typeof sort !== 'number') return res.status(400).json({ error: 'sort must be a number' });
  updateLinkSorts([{ key: req.params.key, sort }]);
  res.json({ ok: true });
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
