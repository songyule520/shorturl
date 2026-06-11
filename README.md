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
