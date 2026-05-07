// options.js

let watchlist = [];
let records = [];
let enabled = true;

async function loadData() {
  const data = await chrome.storage.local.get(['watchlist', 'records', 'enabled']);
  watchlist = data.watchlist || [];
  records = data.records || [];
  enabled = data.enabled !== false;

  document.getElementById('enabledToggle').checked = enabled;
  document.getElementById('toggleLabel').textContent = enabled ? '追踪中' : '已暂停';

  renderWatchlist();
  renderStats();
}

function renderStats() {
  document.getElementById('statTotal').textContent = records.length;
  document.getElementById('statSites').textContent = watchlist.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = records.filter(r => r.timestamp >= todayStart.getTime()).length;
  document.getElementById('statToday').textContent = todayCount;
}

function renderWatchlist() {
  const container = document.getElementById('watchlist');

  if (watchlist.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无追踪站点，请在上方添加</div>';
    return;
  }

  // Count records per domain
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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
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
  await chrome.storage.local.set({ watchlist });
  document.getElementById('inputDomain').value = '';
  document.getElementById('inputLabel').value = '';
  renderWatchlist();
  renderStats();
  showToast(`已添加 ${domain}`, 'success');
}

async function removeEntry(idx) {
  const entry = watchlist[idx];
  if (!confirm(`确认移除 ${entry.domain}？相关记录不会删除。`)) return;
  watchlist.splice(idx, 1);
  await chrome.storage.local.set({ watchlist });
  renderWatchlist();
  showToast('已移除', 'success');
}

async function exportData() {
  const data = await chrome.storage.local.get(['records', 'watchlist']);
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
  await chrome.storage.local.set({ records: [] });
  records = [];
  renderWatchlist();
  renderStats();
  showToast('已清空所有记录', 'success');
}

// Toggle enabled state
document.getElementById('enabledToggle').addEventListener('change', async (e) => {
  enabled = e.target.checked;
  await chrome.storage.local.set({ enabled });
  document.getElementById('toggleLabel').textContent = enabled ? '追踪中' : '已暂停';
  showToast(enabled ? '追踪已开启' : '追踪已暂停', 'success');
});

// Enter key to add
document.getElementById('inputDomain').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addEntry();
});

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 2500);
}

// Init
loadData();

document.getElementById('btnAdd').addEventListener('click', addEntry);
document.getElementById('btnClear').addEventListener('click', clearData);
document.getElementById('btnExport').addEventListener('click', exportData);

document.getElementById('watchlist').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove');
  if (btn) removeEntry(parseInt(btn.dataset.idx));
});
