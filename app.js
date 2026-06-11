const express = require('express');
const path = require('path');
const { getLink, getAllLinks, addLink, deleteLink } = require('./db');

const app = express();
app.use(express.json());

// Admin page — must be before /:key to avoid being caught as a short key
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// API: list all links
app.get('/api/links', (req, res) => {
  res.json(getAllLinks());
});

// API: add a link
app.post('/api/links', (req, res) => {
  const { key, url } = req.body;
  if (!key || !url) {
    return res.status(400).json({ error: 'key and url are required' });
  }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    return res.status(400).json({ error: 'key must contain only letters, numbers, hyphens, and underscores' });
  }
  try {
    addLink(key, url);
    res.status(201).json({ key, url });
  } catch (err) {
    if (err.code === 'DUPLICATE_KEY') {
      return res.status(409).json({ error: 'Key already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: delete a link
app.delete('/api/links/:key', (req, res) => {
  const result = deleteLink(req.params.key);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  res.status(204).end();
});

// Short link redirect — catch-all, must be last
app.get('/:key', (req, res) => {
  const row = getLink(req.params.key);
  if (!row) return res.status(404).send('Not found');
  res.redirect(302, row.url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
