// popup.js

let allRecords = [];
let watchlist = [];
let activeFilter = 'all';

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getDomainColor(domain) {
  const entry = watchlist.find(e => e.domain === domain);
  return entry?.color || '#5b8dee';
}

async function loadData() {
  const data = await chrome.storage.local.get(['records', 'watchlist', 'enabled']);
  allRecords = data.records || [];
  watchlist = data.watchlist || [];
  const enabled = data.enabled !== false;

  // Status
  document.getElementById('statusDot').className = `status-dot ${enabled ? '' : 'off'}`;
  document.getElementById('statusText').textContent = enabled
    ? `追踪中 · ${allRecords.length} 条记录`
    : `已暂停 · ${allRecords.length} 条记录`;

  renderFilterBar();
  renderRecords();
  renderStats();
}

function renderFilterBar() {
  const bar = document.getElementById('filterBar');
  const domains = [...new Set(allRecords.map(r => r.matchedRule))];
  const chips = [
    `<div class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-domain="all">全部</div>`,
    ...domains.map(d => {
      const color = getDomainColor(d);
      const count = allRecords.filter(r => r.matchedRule === d).length;
      return `<div class="filter-chip ${activeFilter === d ? 'active' : ''}" data-domain="${d}" style="${activeFilter === d ? `background:${color};border-color:${color}` : `border-color:${color}40`}">${d} <span style="opacity:0.7">${count}</span></div>`;
    })
  ];
  bar.innerHTML = chips.join('');
  bar.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      activeFilter = el.dataset.domain;
      renderFilterBar();
      renderRecords();
    });
  });
}

function renderRecords() {
  const container = document.getElementById('recordsList');
  const filtered = activeFilter === 'all'
    ? allRecords
    : allRecords.filter(r => r.matchedRule === activeFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📭</div>
        暂无记录
      </div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 100).map(r => {
    const color = getDomainColor(r.matchedRule);
    return `
      <div class="record-item" data-url="${encodeURIComponent(r.url)}">
        <div class="record-title">${escapeHtml(r.title || r.url)}</div>
        <div class="record-meta">
          <span class="record-domain" style="color:${color}">${r.matchedRule}</span>
          <span class="record-time">${formatTime(r.timestamp)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Click to open URL
  container.querySelectorAll('.record-item').forEach(el => {
    el.addEventListener('click', () => {
      const url = decodeURIComponent(el.dataset.url);
      chrome.tabs.create({ url });
    });
  });
}

function renderStats() {
  const grid = document.getElementById('statGrid');
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = allRecords.filter(r => r.timestamp >= todayStart.getTime()).length;

  const domainStats = {};
  for (const r of allRecords) {
    domainStats[r.matchedRule] = (domainStats[r.matchedRule] || 0) + 1;
  }

  const topDomain = Object.entries(domainStats).sort((a, b) => b[1] - a[1])[0];

  grid.innerHTML = `
    <div class="mini-stat">
      <div class="mini-stat-val">${allRecords.length}</div>
      <div class="mini-stat-label">总记录数</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-val">${todayCount}</div>
      <div class="mini-stat-label">今日记录</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-val">${watchlist.length}</div>
      <div class="mini-stat-label">追踪站点</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-val" style="font-size:14px">${topDomain ? topDomain[0] : '-'}</div>
      <div class="mini-stat-label">最多访问 ${topDomain ? topDomain[1] + '次' : ''}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// Buttons
document.getElementById('btnOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('btnExport').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['records', 'watchlist']);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `site-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

loadData();
