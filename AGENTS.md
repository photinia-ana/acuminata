# Browser History Tracker

Chrome extension (Manifest V3). No build step required.

## Loading the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this directory

## Architecture

- `manifest.json` - Extension manifest (entrypoints, permissions)
- `background.js` - Service worker; tracks tab URL changes, stores records
- `pages/popup.*` - Popup UI (history list, stats)
- `pages/options.*` - Settings page (watchlist management, data export)

## Data model

Records stored in `chrome.storage.local`:
```json
{
  "watchlist": [{ "domain": "bilibili.com", "label": "B站", "color": "#fb7299" }],
  "enabled": true,
  "records": [{ "id": "...", "url": "...", "title": "...", "domain": "...", "matchedRule": "...", "tabId": ..., "timestamp": ... }]
}
```

## Behavior notes

- Deduplication: same URL+tab within 60s is ignored
- `chrome://` and `chrome-extension://` URLs are never tracked
- Max 10,000 records; oldest are evicted when limit is reached
- Service worker wakes on `tabs.onUpdated`, `tabs.onActivated`, and `runtime.onInstalled`
