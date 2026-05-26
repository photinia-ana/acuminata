# 主进程适配点

## 7.1 createWindow 加载方式 (已完成 ✅)

`main.js` 中 `createWindow` 已适配 React 渲染进程：

```javascript
// main.js L724-759 (已修改)
function createWindow() {
  // ...
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');     // Vite HMR
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, 'src-renderer', 'dist', 'index.html')  // 生产构建
    );
  }
}
```

---

## 7.2 package.json 脚本 (已完成 ✅)

```json
{
  "scripts": {
    "start": "cross-env NODE_ENV=development concurrently -k \"npm run dev:renderer\" \"npm run dev:electron\"",
    "dev:renderer": "cd src-renderer && npm run dev",
    "dev:electron": "wait-on http://localhost:5173 && electron .",
    "build:renderer": "cd src-renderer && npm run build",
    "build:electron": "electron-builder",
    "build": "npm run build:renderer && npm run build:electron"
  }
}
```

---

## 7.3 electron-builder files (已完成 ✅)

```json
{
  "build": {
    "files": [
      "main.js", "preload.js", "agent/**/*", "locales/**/*",
      "package.json", "src-renderer/dist/**/*", "node_modules/**/*"
    ]
  }
}
```
