const express = require('express');
const path = require('path');
const { getLink, getAllLinks, addLink, updateLink, deleteLink } = require('./db');

const app = express();
app.use(express.json());

const router = express.Router();

// Homepage — link-in-bio style display page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Admin page
router.get('/manage', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// API: list all links
router.get('/links', (req, res) => {
  res.json(getAllLinks());
});

// API: add a link
router.post('/links', (req, res) => {
  const { key, name, url } = req.body;
  if (!key || !url) {
    return res.status(400).json({ error: 'key and url are required' });
  }
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
    addLink(key, name || key, url);
    res.status(201).json({ key, name: name || key, url });
  } catch (err) {
    if (err.code === 'DUPLICATE_KEY') {
      return res.status(409).json({ error: 'Key already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: update a link
router.put('/links/:key', (req, res) => {
  const { name, url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'url must be an http or https URL' });
    }
  } catch {
    return res.status(400).json({ error: 'url must be a valid URL' });
  }
  const result = updateLink(req.params.key, name || req.params.key, url);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  const updated = getAllLinks().find(l => l.key === req.params.key);
  res.json(updated);
});

// API: delete a link
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
