let watchlist = [];
let records = [];
let enabled = true;
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 2500);
}

function renderStats() {
  document.getElementById('statTotal').textContent = records.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = records.filter(r => r.timestamp >= todayStart.getTime()).length;
  document.getElementById('statToday').textContent = todayCount;

  document.getElementById('statSites').textContent = watchlist.length;

  const domainStats = {};
  for (const r of records) {
    domainStats[r.matchedRule] = (domainStats[r.matchedRule] || 0) + 1;
  }
  const topDomain = Object.entries(domainStats).sort((a, b) => b[1] - a[1])[0];
  if (topDomain) {
    document.getElementById('statTopSite').textContent = topDomain[0].length > 12 ? topDomain[0].slice(0, 12) + '...' : topDomain[0];
    document.getElementById('statTopSiteLabel').textContent = `最多访问 ${topDomain[1]}次`;
  } else {
    document.getElementById('statTopSite').textContent = '-';
    document.getElementById('statTopSiteLabel').textContent = '最多访问';
  }
}

function renderWatchlist() {
  const container = document.getElementById('watchlist');
  if (watchlist.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无追踪站点，请在上方添加</div>';
    return;
  }

  const counts = {};
  for (const r of records) {
    counts[r.matchedRule] = (counts[r.matchedRule] || 0) + 1;
  }

  container.innerHTML = watchlist.map((entry, idx) => `
    <div class="watch-item">
      <div class="color-dot" style="background:${entry.color || '#5b8dee'}"></div>
      <div class="watch-domain">${escapeHtml(entry.domain)}</div>
      <div class="watch-label">${escapeHtml(entry.label || '')}</div>
      <div class="watch-count">${counts[entry.domain] || 0} 条</div>
      <button class="btn btn-danger btn-remove" data-idx="${idx}">移除</button>
    </div>
  `).join('');
}

function renderRecords() {
  const container = document.getElementById('recordsContainer');
  const filtered = activeFilter === 'all'
    ? records
    : records.filter(r => r.matchedRule === activeFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text2)">暂无记录</div>';
    return;
  }

  container.innerHTML = filtered.slice(0, 200).map(r => {
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
}

function renderFilterBar() {
  const bar = document.getElementById('filterBar');
  const domains = [...new Set(records.map(r => r.matchedRule))];
  const chips = [
    `<div class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-domain="all">全部</div>`,
    ...domains.map(d => {
      const color = getDomainColor(d);
      const count = records.filter(r => r.matchedRule === d).length;
      return `<div class="filter-chip ${activeFilter === d ? 'active' : ''}" data-domain="${d}" style="${activeFilter === d ? `background:${color};border-color:${color}` : `border-color:${color}40`}">${d} <span style="opacity:0.7">${count}</span></div>`;
    })
  ];
  bar.innerHTML = chips.join('');
}

async function addEntry() {
  const domain = document.getElementById('inputDomain').value.trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const label = document.getElementById('inputLabel').value.trim();
  const color = document.getElementById('inputColor').value;

  if (!domain) {
    showToast('请输入域名', 'error');
    return;
  }

  if (watchlist.find(e => e.domain === domain)) {
    showToast('该域名已存在', 'error');
    return;
  }

  watchlist.push({ domain, label, color });
  await window.electronAPI.addToWatchlist({ domain, label, color });
  document.getElementById('inputDomain').value = '';
  document.getElementById('inputLabel').value = '';
  renderWatchlist();
  showToast(`已添加 ${domain}`, 'success');
}

async function removeEntry(idx) {
  const entry = watchlist[idx];
  if (!confirm(`确认移除 ${entry.domain}？相关记录不会删除。`)) return;
  watchlist.splice(idx, 1);
  await window.electronAPI.removeFromWatchlist(entry.domain);
  renderWatchlist();
  showToast('已移除', 'success');
}

async function exportData() {
  const data = await window.electronAPI.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `site-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('导出成功', 'success');
}

async function clearData() {
  if (!confirm('确认清空所有浏览记录？此操作不可撤销。')) return;
  await window.electronAPI.clearRecords();
  records = [];
  renderRecords();
  renderStats();
  showToast('已清空所有记录', 'success');
}

async function init() {
  try {
    watchlist = await window.electronAPI.getWatchlist();
    records = await window.electronAPI.getRecords();
    const stats = await window.electronAPI.getStats();
    enabled = stats.enabled;
  } catch (e) {
    console.error('Init error:', e);
  }

  document.getElementById('enabledToggle').checked = enabled;
  document.getElementById('toggleLabel').textContent = enabled ? '追踪中' : '已暂停';

  renderWatchlist();
  renderStats();
  renderFilterBar();
  renderRecords();
}

init();

document.getElementById('btnAdd').addEventListener('click', addEntry);
document.getElementById('btnExport').addEventListener('click', exportData);
document.getElementById('btnClear').addEventListener('click', clearData);

document.getElementById('watchlist').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove');
  if (btn) removeEntry(parseInt(btn.dataset.idx));
});

document.getElementById('filterBar').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (chip) {
    activeFilter = chip.dataset.domain;
    renderFilterBar();
    renderRecords();
  }
});

document.getElementById('recordsContainer').addEventListener('click', (e) => {
  const item = e.target.closest('.record-item');
  if (item) {
    const url = decodeURIComponent(item.dataset.url);
    window.electronAPI.openUrl(url);
  }
});

document.getElementById('enabledToggle').addEventListener('change', async (e) => {
  enabled = e.target.checked;
  await window.electronAPI.setEnabled(enabled);
  document.getElementById('toggleLabel').textContent = enabled ? '追踪中' : '已暂停';
  showToast(enabled ? '追踪已开启' : '追踪已暂停', 'success');
});

document.getElementById('inputDomain').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addEntry();
});

window.electronAPI.onUpdate((data) => {
  if (data.type === 'recordAdded') {
    records.unshift(data.record);
    renderRecords();
    renderStats();
    renderFilterBar();
  } else if (data.type === 'recordsCleared') {
    records = [];
    renderRecords();
    renderStats();
    renderFilterBar();
  } else if (data.type === 'watchlistUpdated') {
    watchlist = data.watchlist;
    renderWatchlist();
  } else if (data.type === 'enabledUpdated') {
    enabled = data.enabled;
    document.getElementById('enabledToggle').checked = enabled;
    document.getElementById('toggleLabel').textContent = enabled ? '追踪中' : '已暂停';
  }
});

window.electronAPI.onWatchlistUpdate((data) => {
  watchlist = data.watchlist;
  renderWatchlist();
});