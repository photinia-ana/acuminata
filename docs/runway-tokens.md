# Runway 设计系统 → Tailwind Token 映射

`src-renderer/src/index.css` 中的 CSS 变量需与 DESIGN.md 对齐，**仅 dark 模式，无 light**：

```css
@layer base {
  :root {
    /* Runway 极黑主题 — 单一暗色模式，不提供 light variant */
    --background: 0 0% 0%;          /* #000000 Runway Black */
    --foreground: 0 0% 100%;        /* #ffffff 纯白主文字 */
    --card: 0 0% 10.2%;             /* #1a1a1a Dark Surface */
    --card-foreground: 0 0% 100%;
    --popover: 0 0% 10.2%;
    --popover-foreground: 0 0% 100%;
    --primary: 0 0% 100%;
    --primary-foreground: 0 0% 0%;
    --secondary: 0 0% 15.3%;        /* #27272a 附近 */
    --secondary-foreground: 0 0% 100%;
    --muted: 0 0% 15.3%;
    --muted-foreground: 220 5% 50%;  /* #767d88 Cool Slate */
    --accent: 0 0% 15.3%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 62.8% 50.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 2% 16%;           /* #27272a Border Dark */
    --input: 240 2% 16%;
    --ring: 0 0% 83.9%;
    --radius: 0.5rem;               /* 8px 圆角 */
  }
}
```

## 关键设计规范 (来自 DESIGN.md)

| 规范 | 值 |
|------|---|
| 主背景 | `#000000` (Runway Black) |
| 卡片/浮层 | `#1a1a1a` (Dark Surface) |
| 边框 | `#27272a` (Border Dark) — 唯一边框色 |
| 主文字 (深色背景) | `#ffffff` |
| 次文字 | `#767d88` (Cool Slate) |
| 弱文字 | `#a7a7a7` (Muted Gray) |
| 数据字体 | `JetBrains Mono` |
| UI 字体 | `Inter` / `system-ui` |
| 阴影 | **零阴影** — 通过色块层级构建空间感 |
| 圆角 | 8px (卡片/按钮) |
| 标签排版 | 11px, uppercase, letter-spacing 0.35px |
