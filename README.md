# SongSeed 静态版

纯前端静态页面，UI 与功能 tab 与原版完全一致。可直接部署到任意静态托管平台。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `index.html` | 入口页面（资源已改为相对路径） |
| `styles.css` | 全部样式（仅内联 SVG，无外部资源） |
| `routes.js` | 前端路由（基于 `pathname` 的 history 模式） |
| `app.js` | 业务逻辑（**未改动**） |
| `mock-api.js` | 固定数据层：拦截 `/api/*` 请求返回内置演示数据，并用 localStorage 持久化 |

## 内置固定数据

`mock-api.js` 在没有后端的情况下提供了一整套内置数据，打开页面即可浏览，无需任何服务：

- **登录账户**：`ck` / `pjr` / `djw`，密码均为 `123456`（也可注册新账户，本地生效）
- **Demo 库**：`ck` 名下预置 3 个项目（《晚风以后》《写给夏天》《霓虹回声》）
- **灵感**：3 条灵感记录
- **好友**：`pjr`、`djw`，含聊天记录
- **分享给我**：`pjr` 分享的《南方的雨》
- **Demo 接力**：`pjr` 对《晚风以后》发起的接力方案（含已整合版本）
- 增删改、新建 Demo、评论、分享、好友申请等操作都会**保存在浏览器本地**（localStorage），刷新不丢失

## 部署前须知

- 本项目**没有后端**，所有数据来自 `mock-api.js` 内置的固定数据。数据仅存于浏览器本地，不同设备/浏览器之间不互通。
- 音频播放仅展示播放器 UI，无实际音频文件（生成/试听均为静音占位）。
- 若之后要接真实后端：删除 `index.html` 中 `<script src="./mock-api.js"></script>` 这一行即可，页面会自动恢复为请求 `当前域名/api/*`。
- 路由为 history 模式，**必须配置 SPA fallback**：所有未匹配的路径都要回退到 `index.html`，否则刷新 `/demos/...`、`/share/...` 等深链会 404。

## 各平台 SPA fallback 配置

### Netlify

在项目根目录放一个 `_redirects` 文件：

```
/*    /index.html   200
```

### Vercel

在项目根目录放 `vercel.json`：

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### GitHub Pages

GitHub Pages 原生不支持 history 路由 fallback。两种方案：

1. 使用 `404.html` 兜底：把 `index.html` 复制一份命名为 `404.html`，深链访问时会由 404 页接管并渲染正确内容（会有一次 404 状态，但页面能正常显示）。
2. 改用 hash 路由（需要改动 `routes.js` 与 `app.js`，不推荐）。

### Nginx

```nginx
server {
  listen 80;
  root /var/www/songseed-static;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### 本地预览

```bash
cd songseed-static
python3 -m http.server 8000
# 打开 http://localhost:8000
```

> 本地用 `python -m http.server` 预览时，深链（如 `/demos/...`）刷新会 404，因为该命令不带 SPA fallback；仅首页导航可正常使用。真实部署按上面的平台配置即可解决。
