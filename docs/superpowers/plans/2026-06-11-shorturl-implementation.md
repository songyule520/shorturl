# Short URL Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a URL shortener service where short keys (e.g. `1`, `abc`) 302-redirect to destination URLs, with a web admin page to manage links.

**Architecture:** Single Express app with better-sqlite3 for storage. `db.js` owns all database operations; `app.js` owns all routes. Admin UI is a static HTML file that talks to the API via fetch.

**Tech Stack:** Node.js, Express 4, better-sqlite3 9, SQLite (file-based)

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | Dependencies and start script |
| `db.js` | SQLite init + CRUD: `getLink`, `getAllLinks`, `addLink`, `deleteLink` |
| `app.js` | Express server: redirect route, admin route, API routes |
| `views/admin.html` | Admin UI: add form + links table, talks to `/api/links` |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`

- [ ] **Step 1: Initialize project**

```bash
cd /Users/tal/cursorProjects/shorturl
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install express better-sqlite3
```

- [ ] **Step 3: Update package.json start script**

Edit `package.json` so scripts section reads:

```json
"scripts": {
  "start": "node app.js"
}
```

- [ ] **Step 4: Create .gitignore**

Create file `.gitignore`:

```
node_modules/
links.db
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: project scaffold with express and better-sqlite3"
```

---

### Task 2: Database layer

**Files:**
- Create: `db.js`

- [ ] **Step 1: Create db.js**

```js
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
```

- [ ] **Step 2: Smoke test db.js manually**

```bash
node -e "
const db = require('./db');
db.addLink('test', 'https://example.com');
console.log(db.getLink('test'));   // { url: 'https://example.com' }
console.log(db.getAllLinks());
db.deleteLink('test');
console.log(db.getLink('test'));   // undefined
"
```

Expected output:
```
{ url: 'https://example.com' }
[ { key: 'test', url: 'https://example.com', created_at: <number> } ]
undefined
```

Then clean up the test db:
```bash
rm links.db
```

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "feat: sqlite database layer with getLink/getAllLinks/addLink/deleteLink"
```

---

### Task 3: Express server and redirect route

**Files:**
- Create: `app.js`

- [ ] **Step 1: Create app.js with redirect route**

```js
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
  try {
    addLink(key, url);
    res.status(201).json({ key, url });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Key already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: delete a link
app.delete('/api/links/:key', (req, res) => {
  deleteLink(req.params.key);
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
```

- [ ] **Step 2: Start the server and test redirect**

```bash
node app.js &
```

Add a test link and verify redirect:

```bash
curl -s -X POST http://localhost:3000/api/links \
  -H 'Content-Type: application/json' \
  -d '{"key":"1","url":"https://www.baidu.com"}'
# Expected: {"key":"1","url":"https://www.baidu.com"}

curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/1
# Expected: 302 https://www.baidu.com/

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/notexist
# Expected: 404
```

- [ ] **Step 3: Test duplicate key rejection**

```bash
curl -s -X POST http://localhost:3000/api/links \
  -H 'Content-Type: application/json' \
  -d '{"key":"1","url":"https://www.taobao.com"}'
# Expected: {"error":"Key already exists"} with HTTP 409

curl -s -X POST http://localhost:3000/api/links \
  -H 'Content-Type: application/json' \
  -d '{"key":"","url":"https://x.com"}'
# Expected: {"error":"key and url are required"} with HTTP 400
```

- [ ] **Step 4: Test delete**

```bash
curl -s -X DELETE http://localhost:3000/api/links/1
# Expected: HTTP 204

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/1
# Expected: 404
```

- [ ] **Step 5: Stop server and clean up test db**

```bash
kill %1
rm links.db
```

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: express server with redirect, admin, and api routes"
```

---

### Task 4: Admin UI

**Files:**
- Create: `views/admin.html`

- [ ] **Step 1: Create views directory and admin.html**

```bash
mkdir -p views
```

Create `views/admin.html`:

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>短链管理</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 1.4rem; margin-bottom: 24px; }
    .form-row { display: flex; gap: 8px; margin-bottom: 24px; }
    .form-row input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; }
    .form-row input[name="key"] { width: 120px; }
    .form-row input[name="url"] { flex: 1; }
    button { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; }
    .btn-add { background: #2563eb; color: #fff; }
    .btn-del { background: #ef4444; color: #fff; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-size: 0.85rem; color: #6b7280; }
    #msg { margin-bottom: 12px; font-size: 0.9rem; }
    .err { color: #ef4444; }
    .ok  { color: #16a34a; }
  </style>
</head>
<body>
  <h1>短链管理</h1>
  <div id="msg"></div>
  <div class="form-row">
    <input name="key" placeholder="短码，如 1 或 abc" />
    <input name="url" placeholder="目标 URL，如 https://www.baidu.com" />
    <button class="btn-add" onclick="addLink()">添加</button>
  </div>
  <table>
    <thead>
      <tr><th>短码</th><th>目标 URL</th><th>创建时间</th><th></th></tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>

  <script>
    const msg = document.getElementById('msg');
    const tbody = document.getElementById('tbody');

    function showMsg(text, isErr) {
      msg.textContent = text;
      msg.className = isErr ? 'err' : 'ok';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    }

    async function loadLinks() {
      const res = await fetch('/api/links');
      const links = await res.json();
      tbody.innerHTML = links.map(l => `
        <tr>
          <td><a href="/${l.key}" target="_blank">/${l.key}</a></td>
          <td><a href="${l.url}" target="_blank">${l.url}</a></td>
          <td>${new Date(l.created_at * 1000).toLocaleString('zh-CN')}</td>
          <td><button class="btn-del" onclick="deleteLink('${l.key}')">删除</button></td>
        </tr>
      `).join('');
    }

    async function addLink() {
      const key = document.querySelector('input[name=key]').value.trim();
      const url = document.querySelector('input[name=url]').value.trim();
      if (!key || !url) return showMsg('请填写短码和目标 URL', true);
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, url })
      });
      const data = await res.json();
      if (!res.ok) return showMsg(data.error, true);
      document.querySelector('input[name=key]').value = '';
      document.querySelector('input[name=url]').value = '';
      showMsg(`已添加 /${key}`, false);
      loadLinks();
    }

    async function deleteLink(key) {
      if (!confirm(`确认删除 /${key}？`)) return;
      await fetch(`/api/links/${key}`, { method: 'DELETE' });
      showMsg(`已删除 /${key}`, false);
      loadLinks();
    }

    loadLinks();
  </script>
</body>
</html>
```

- [ ] **Step 2: Start server and verify admin page**

```bash
node app.js &
```

Open `http://localhost:3000/admin` in a browser.

Verify:
- Page loads with the add form and an empty table
- Add `key=1`, `url=https://www.baidu.com` → row appears in table, link `http://localhost:3000/1` opens Baidu
- Add `key=2`, `url=https://www.taobao.com` → second row appears
- Delete `key=1` → row disappears, `http://localhost:3000/1` returns 404
- Try adding duplicate key → error message shown in red

- [ ] **Step 3: Stop server**

```bash
kill %1
rm links.db
```

- [ ] **Step 4: Commit**

```bash
git add views/admin.html
git commit -m "feat: admin UI with add/delete/list links"
```

---

### Task 5: Final smoke test and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Full end-to-end smoke test**

```bash
node app.js &

# Add two links
curl -s -X POST http://localhost:3000/api/links \
  -H 'Content-Type: application/json' \
  -d '{"key":"1","url":"https://www.baidu.com"}'

curl -s -X POST http://localhost:3000/api/links \
  -H 'Content-Type: application/json' \
  -d '{"key":"2","url":"https://www.taobao.com"}'

# Verify redirects
curl -s -o /dev/null -w "key 1: %{http_code} -> %{redirect_url}\n" http://localhost:3000/1
# Expected: key 1: 302 -> https://www.baidu.com/

curl -s -o /dev/null -w "key 2: %{http_code} -> %{redirect_url}\n" http://localhost:3000/2
# Expected: key 2: 302 -> https://www.taobao.com/

# Verify list
curl -s http://localhost:3000/api/links | node -e "
  let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).length,'links'))
"
# Expected: 2 links

kill %1
rm links.db
```

- [ ] **Step 2: Create README.md**

```markdown
# shorturl

轻量级短链接跳转服务。

## 快速启动

npm install
node app.js

## 使用

- 访问 `http://localhost:3000/admin` 管理短链接
- 访问 `http://localhost:3000/<key>` 自动 302 跳转到目标 URL

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口 |
```

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: add README with quick start instructions"
```
