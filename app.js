const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const {
  getSetting, setSetting,
  getAllGroups, getGroupByKey, getGroupById, addGroup, updateGroup, deleteGroup,
  getGroupLinks, addGroupLink, updateGroupLink, deleteGroupLink, updateGroupLinkSort,
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
app.use(session({
  secret: getSetting('session_secret', 'shorturl-secret-2024'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7天
}));

// 初始化默认账号密码
if (!getSetting('admin_username')) setSetting('admin_username', 'admin');
if (!getSetting('admin_password')) setSetting('admin_password', 'admin123');

// 鉴权中间件
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path.startsWith('/auth')) return next();
  // API 请求返回 401
  if (req.path.startsWith('/links') || req.path.startsWith('/categories') ||
      req.path.startsWith('/groups') || req.path.startsWith('/settings')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

// 登录页
app.get('/login', (req, res) => {
  if (req.session && req.session.loggedIn) return res.redirect('/manage');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// 登录 API
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const storedUser = getSetting('admin_username', 'admin');
  const storedPass = getSetting('admin_password', 'admin123');
  if (username === storedUser && password === storedPass) {
    req.session.loggedIn = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: '用户名或密码错误' });
});

// 登出 API
app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

const router = express.Router();

// Static uploads
app.use('/public', express.static(path.join(__dirname, 'public')));

// Pages
router.get('/',       (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
router.get('/manage', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

// 所有 API 需要登录
router.use('/settings', requireAuth);
router.use('/categories', requireAuth);
router.use('/links', requireAuth);
router.use('/groups', requireAuth);

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

router.post('/settings/password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写原密码和新密码' });
  const stored = getSetting('admin_password', 'admin123');
  if (oldPassword !== stored) return res.status(401).json({ error: '原密码错误' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  setSetting('admin_password', newPassword);
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
  const page  = parseInt(req.query.page) || 0;
  const size  = 10;
  const q     = req.query.q     || '';
  const catId = req.query.cat   ? parseInt(req.query.cat) : null;
  if (page > 0) {
    const total = countLinks(q, catId);
    const items = getLinksPage(page, size, q, catId);
    return res.json({ items, total, page, pages: Math.ceil(total / size) });
  }
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

// ── Groups API ───────────────────────────────────────────────
router.get('/groups', (req, res) => res.json(getAllGroups()));

// group page data — for group.html to fetch by key
router.get('/groups/by-key/:key', (req, res) => {
  const group = getGroupByKey(req.params.key);
  if (!group) return res.status(404).json({ error: 'Not found' });
  const links = getGroupLinks(group.id);
  res.json({ ...group, links });
});

router.post('/groups', (req, res) => {
  const { key, name, subtitle } = req.body;
  if (!key || !name) return res.status(400).json({ error: 'key and name are required' });
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return res.status(400).json({ error: 'key invalid' });
  try {
    const r = addGroup(key, name, subtitle || '');
    res.status(201).json({ id: r.lastInsertRowid, key, name, subtitle: subtitle || '' });
  } catch (err) {
    if (err.code === 'DUPLICATE_KEY') return res.status(409).json({ error: 'Key already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/groups/:id', (req, res) => {
  const { key, name, subtitle } = req.body;
  if (!key || !name) return res.status(400).json({ error: 'key and name are required' });
  const result = updateGroup(req.params.id, key, name, subtitle || '');
  if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
  res.json({ id: Number(req.params.id), key, name, subtitle: subtitle || '' });
});

router.delete('/groups/:id', (req, res) => {
  const result = deleteGroup(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
  res.status(204).end();
});

router.get('/groups/:id/links', (req, res) => res.json(getGroupLinks(req.params.id)));

router.post('/groups/:id/links', (req, res) => {
  const { name, url, sort } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'url must be http/https' });
  } catch { return res.status(400).json({ error: 'url must be a valid URL' }); }
  const r = addGroupLink(req.params.id, name || url, url, sort || 0);
  res.status(201).json({ id: r.lastInsertRowid, group_id: Number(req.params.id), name: name || url, url, sort: sort || 0 });
});

router.put('/groups/:id/links/:lid', (req, res) => {
  const { name, url, sort } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'url must be http/https' });
  } catch { return res.status(400).json({ error: 'url must be a valid URL' }); }
  const result = updateGroupLink(req.params.lid, name || url, url, sort || 0);
  if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });
  res.json({ id: Number(req.params.lid), name: name || url, url, sort: sort || 0 });
});

router.patch('/groups/:id/links/:lid/sort', (req, res) => {
  const { sort } = req.body;
  if (typeof sort !== 'number') return res.status(400).json({ error: 'sort must be a number' });
  updateGroupLinkSort(req.params.lid, sort);
  res.json({ ok: true });
});

router.delete('/groups/:id/links/:lid', (req, res) => {
  const result = deleteGroupLink(req.params.lid);
  if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });
  res.status(204).end();
});

// Short link redirect — catch-all, must be last
router.get('/:key', (req, res) => {
  const key = req.params.key;
  // 先查链接组
  const group = getGroupByKey(key);
  if (group) return res.sendFile(path.join(__dirname, 'views', 'group.html'));
  // 再查单链接
  const row = getLink(key);
  if (!row) return res.status(404).send('Not found');
  try {
    const parsed = new URL(row.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Invalid redirect target');
  } catch { return res.status(400).send('Invalid redirect target'); }
  res.redirect(302, row.url);
});

app.use('/', router);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
