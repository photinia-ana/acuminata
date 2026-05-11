let watchlist = [];
let records = [];
let enabled = true;
let activeFilter = "all";
let searchQuery = "";
let currentPage = 1;
let pageSize = 100;
let totalRecords = 0;
let loadedAll = false;
let stats = null;
let selectedIds = new Set();

// --- 基础工具函数 ---
function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m前";
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function getDomainColor(val) {
  const entry = watchlist.find((e) => e.domain === val || e.label === val);
  return entry ? entry.color : "#767d88";
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}

function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show";
  setTimeout(() => el.classList.remove("show"), 2500);
}

function setWsStatus(connected) {
  const dot = document.getElementById("wsDot");
  const txt = document.getElementById("wsStatusText");
  dot.className = "ws-dot " + (connected ? "on" : "");
  txt.textContent = connected ? "ONLINE" : "OFFLINE";
}

function dateGroupLabel(ts) {
  const d = new Date(ts),
    today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// --- 渲染逻辑 ---
function renderStats() {
  if (!stats) return;
  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statToday").textContent = stats.today;
  document.getElementById("statSites").textContent =
    stats.sites || watchlist.length;
  document.getElementById("statTopSite").textContent = stats.topDomain || "-";
}

function renderWatchlist() {
  const container = document.getElementById("watchlist");
  const counts = (stats && stats.domainCounts) || {};
  if (watchlist.length === 0) {
    container.innerHTML =
      '<div style="color:var(--muted-fg); font-size:12px">暂无监控站点</div>';
    return;
  }
  container.innerHTML = watchlist
    .map(
      (entry, idx) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border:1px solid var(--border); border-radius:6px; background:#1a1a1a">
      <div style="display:flex; align-items:center; gap:8px">
        <div style="width:8px; height:8px; border-radius:50%; background:${entry.color}"></div>
        <span style="font-family:var(--font-mono); font-weight:600">${escapeHtml(entry.domain)}</span>
        <span class="badge">${escapeHtml(entry.label || "未命名")}</span>
        ${entry.regexFilter ? `<span style="color:var(--warning); font-size:10px" title="正则: ${escapeHtml(entry.regexFilter)}">[.*]</span>` : ""}
      </div>
      <div style="display:flex; align-items:center; gap:12px">
        <span style="font-family:var(--font-mono); font-size:11px; color:var(--muted-fg)">${counts[entry.label || entry.domain] || 0} hits</span>
        <button class="btn btn-ghost" onclick="removeEntry(${idx})" style="padding:2px 6px">×</button>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderFilterBar() {
  const bar = document.getElementById("filterBar");
  const counts = (stats && stats.domainCounts) || {};
  const domains = Object.keys(counts);
  let html = `
    <div class="filter-chip ${activeFilter === "all" ? "active" : ""}" data-domain="all">全部</div>
    <div class="filter-chip ${activeFilter === "pinned" ? "active" : ""}" data-domain="pinned" style="border-color:var(--warning)">★ 已收藏</div>
  `;
  domains.forEach((d) => {
    html += `<div class="filter-chip ${activeFilter === d ? "active" : ""}" data-domain="${d}">${d} <span style="opacity:0.5">${counts[d]}</span></div>`;
  });
  bar.innerHTML = html;
}

function renderRecords() {
  const container = document.getElementById("recordsContainer");
  const loadMoreBtnContainer = document.getElementById("loadMoreContainer");

  // 综合过滤 (搜索 + 筛选)
  let filtered = records;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.url && r.url.toLowerCase().includes(q)) ||
        (r.matchedRule && r.matchedRule.toLowerCase().includes(q)),
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted-fg)">${searchQuery ? "未发现匹配记录" : "历史空空如也"}</div>`;
    loadMoreBtnContainer.innerHTML = "";
    return;
  }

  let html = "";
  let currentGroup = "";
  filtered.forEach((r) => {
    const dateLabel = dateGroupLabel(r.timestamp);
    if (dateLabel !== currentGroup) {
      currentGroup = dateLabel;
      html += `<div class="date-group-header">${dateLabel}</div>`;
    }
    const color = getDomainColor(r.matchedRule);
    const isPinned = r.pinned ? true : false;
    const favicon = r.favIconUrl ? `<img class="rec-favicon" src="${escapeHtml(r.favIconUrl)}" onerror="this.style.display='none'" />` : "";
    const desc = r.description ? `<span class="item-url" style="max-width:240px; opacity:0.5">${escapeHtml(r.description.slice(0, 60))}</span>` : `<span class="item-url">${escapeHtml(r.url)}</span>`;

    html += `
      <div class="data-item" data-url="${encodeURIComponent(r.url)}">
        <input type="checkbox" class="rec-checkbox" data-action="rec-select" data-id="${r.id}" ${selectedIds.has(r.id) ? "checked" : ""}>
        ${favicon}
        <div class="item-body">
          <div class="item-title">${escapeHtml(r.title || r.url)}</div>
          <div class="item-meta">
            <span class="badge" style="border-color:${color}; color:${color}">${escapeHtml(r.matchedRule)}</span>
            <span>${formatTime(r.timestamp)}</span>
            ${desc}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-pin-text ${isPinned ? "on" : ""}" data-action="rec-pin" data-id="${r.id}">${isPinned ? "Pinned" : "Pin"}</button>
          ${
            isPinned
              ? `
            <div class="score-group">
              <button class="score-btn" data-action="rec-score-down" data-id="${r.id}">−</button>
              <span class="score-val">${r.score || 0}</span>
              <button class="score-btn" data-action="rec-score-up" data-id="${r.id}">+</button>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  });
  container.innerHTML = html;

  // 加载更多按钮
  if (!loadedAll && !searchQuery) {
    loadMoreBtnContainer.innerHTML = `<button id="btnLoadMore" class="btn btn-ghost">加载更多 (${records.length} / ${totalRecords})</button>`;
    document.getElementById("btnLoadMore").onclick = () =>
      loadRecords(currentPage + 1);
  } else {
    loadMoreBtnContainer.innerHTML = "";
  }
}

async function loadRecords(page, filter) {
  const f = filter !== undefined ? filter : activeFilter;
  const result = await window.electronAPI.getRecordsPage(page, pageSize, f);
  records = page === 1 ? result.records : records.concat(result.records);
  currentPage = page;
  totalRecords = result.total;
  loadedAll = records.length >= totalRecords;
  renderRecords();
}

async function refreshStats() {
  stats = await window.electronAPI.getStatistics();
  enabled = stats.enabled;
  renderStats();
}

// --- 事件监听 ---
document.querySelectorAll(".nav-item").forEach((item) => {
  item.onclick = function () {
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    this.classList.add("active");
    document.getElementById(this.dataset.target).classList.add("active");
  };
});

document.getElementById("recordsContainer").onclick = function (e) {
  const selectBtn = e.target.closest("[data-action='rec-select']");
  if (selectBtn) {
    e.stopPropagation();
    if (selectBtn.checked) selectedIds.add(selectBtn.dataset.id);
    else selectedIds.delete(selectBtn.dataset.id);
    updateBatchDeleteBtn();
    return;
  }

  const pinBtn = e.target.closest("[data-action='rec-pin']");
  if (pinBtn) {
    e.stopPropagation();
    const id = pinBtn.dataset.id;
    const rec = records.find((r) => r.id === id);
    if (rec) {
      const newPinned = !rec.pinned;
      const newScore = newPinned && !rec.score ? 1 : rec.score;
      window.electronAPI.toggleRecordPin(id, newPinned, newScore);
      // 后台更新由 broadcast 处理，这里先本地更新体验更好
      rec.pinned = newPinned ? 1 : 0;
      rec.score = newScore;
      renderRecords();
    }
    return;
  }

  const sUp = e.target.closest("[data-action='rec-score-up']");
  const sDown = e.target.closest("[data-action='rec-score-down']");
  if (sUp || sDown) {
    e.stopPropagation();
    const id = (sUp || sDown).dataset.id;
    const rec = records.find((r) => r.id === id);
    if (rec && rec.pinned) {
      const newScore = Math.max(0, (rec.score || 0) + (sUp ? 1 : -1));
      window.electronAPI.toggleRecordPin(id, true, newScore);
      rec.score = newScore;
      renderRecords();
    }
    return;
  }

  const item = e.target.closest(".data-item");
  if (item) {
    window.electronAPI.openUrl(decodeURIComponent(item.dataset.url));
  }
};

function updateBatchDeleteBtn() {
  const btn = document.getElementById("btnBatchDelete");
  btn.style.display = selectedIds.size > 0 ? "block" : "none";
  btn.textContent = `删除选中 (${selectedIds.size})`;
}

document.getElementById("btnBatchDelete").onclick = async function () {
  if (confirm(`确定删除选中的 ${selectedIds.size} 条记录？`)) {
    await window.electronAPI.deleteRecords(Array.from(selectedIds));
    selectedIds.clear();
    updateBatchDeleteBtn();
    loadRecords(1);
    refreshStats();
  }
};

document.getElementById("filterBar").onclick = async function (e) {
  const chip = e.target.closest(".filter-chip");
  if (chip) {
    activeFilter = chip.dataset.domain;
    renderFilterBar();
    loadRecords(1);
  }
};

document.getElementById("searchInput").oninput = function () {
  searchQuery = this.value.trim();
  renderRecords();
};

document.getElementById("btnAdd").onclick = async function () {
  const domain = document
    .getElementById("inputDomain")
    .value.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const label = document.getElementById("inputLabel").value.trim();
  const color = document.getElementById("inputColor").value;
  const regexFilter = document.getElementById("inputRegexFilter").value.trim();
  const regexTarget = document.getElementById("inputRegexTarget").value;

  if (!domain) return showToast("请输入域名", "error");
  const newEntry = { domain, label, color, regexFilter, regexTarget };
  const ok = await window.electronAPI.addToWatchlist(newEntry);
  if (ok) {
    watchlist.push(newEntry);
    renderWatchlist();
    showToast("监控已添加");
    document.getElementById("inputDomain").value = "";
    document.getElementById("inputLabel").value = "";
    document.getElementById("inputRegexFilter").value = "";
  }
};

async function removeEntry(idx) {
  const entry = watchlist[idx];
  if (confirm(`停止监控 ${entry.domain}？`)) {
    await window.electronAPI.removeFromWatchlist(entry.domain);
    watchlist.splice(idx, 1);
    renderWatchlist();
    refreshStats();
  }
}

document.getElementById("enabledToggle").onchange = async function () {
  enabled = this.checked;
  await window.electronAPI.setEnabled(enabled);
  document.getElementById("toggleLabel").textContent = enabled
    ? "追踪开启中"
    : "追踪已暂停";
};

document.getElementById("btnExport").onclick = async function () {
  const data = await window.electronAPI.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `site-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  showToast("数据已导出");
};

document.getElementById("btnClear").onclick = async function () {
  if (confirm("警告：将永久清空所有浏览记录！")) {
    await window.electronAPI.clearRecords();
    records = [];
    renderRecords();
    refreshStats();
    showToast("记录已清空");
  }
};

// --- 初始化与监听 ---
async function init() {
  setWsStatus(false);
  watchlist = await window.electronAPI.getWatchlist();
  await refreshStats();
  document.getElementById("enabledToggle").checked = enabled;
  renderWatchlist();
  renderFilterBar();
  loadRecords(1);
  setWsStatus(true);
}

window.electronAPI.onUpdate((data) => {
  if (data.type === "recordAdded" || data.type === "recordUpdated") {
    // 简单起见，收到更新就刷新统计和第一页
    refreshStats();
    renderFilterBar();
    loadRecords(1);
  } else if (data.type === "recordsCleared") {
    records = [];
    renderRecords();
    refreshStats();
  }
});

document.getElementById("btnRunAgent").onclick = async function () {
  const btn = this;
  const profileText = document.getElementById("aiProfileText");
  const tagsContainer = document.getElementById("aiTags");
  const recContainer = document.getElementById("recommendationsContainer");

  // 1. 进入 Loading 状态
  btn.innerHTML = "⏳ 模型推演中...";
  btn.style.opacity = "0.7";
  btn.style.pointerEvents = "none";

  profileText.innerHTML =
    "<span style='color: #a855f7; font-family: var(--font-mono);'>[System] Loading local models... Analyzing pinned records...</span>";
  tagsContainer.innerHTML = "";
  recContainer.innerHTML =
    '<div style="padding:40px; text-align:center; color:var(--muted-fg)">正在全网探测可能感兴趣的节点...</div>';

  // 2. 模拟调用本地大模型 (后续可替换为 ipcRenderer 真实请求)
  setTimeout(() => {
    // 渲染画像总结
    profileText.innerHTML =
      "基于您近期收藏的 <b style='color:#fff'>高分记录</b>，系统发现您对特定番号格式及深色模式界面表现出浓厚兴趣。您的内容消费偏向于高质量、高连贯性的深度沉浸体验，且存在明显的夜间活跃特征。";

    // 渲染偏好标签
    tagsContainer.innerHTML = `
      <span class="badge" style="border-color: #a855f7; color: #c084fc; background: rgba(168,85,247,0.1)">核心聚类: 格式化番号</span>
      <span class="badge" style="border-color: #6366f1; color: #818cf8; background: rgba(99,102,241,0.1)">偏好标签: 深度沉浸</span>
      <span class="badge" style="border-color: #3b82f6; color: #60a5fa; background: rgba(59,130,246,0.1)">活跃特征: 晚 22:00-02:00</span>
    `;

    // 渲染推荐假数据
    const recs = [
      {
        id: "rec1",
        title: "FC2-PPV-3019234 (高赞新作)",
        domain: "最新存活节点.com",
        reason: "基于您此前多次给 FC2 系列打出 80+ 高分",
      },
      {
        id: "rec2",
        title: "ABC-123 (匹配您的正则过滤库)",
        domain: "伪装站-主干.com",
        reason: "标题高度契合您的底层审美偏好",
      },
    ];

    recContainer.innerHTML = recs
      .map(
        (r) => `
      <div class="data-item">
        <div class="item-body">
          <div class="item-title" style="color: #e4e4e7;">${escapeHtml(r.title)}</div>
          <div class="item-meta">
            <span class="badge" style="background: rgba(168, 85, 247, 0.1); color: #c084fc; border-color: rgba(168, 85, 247, 0.3);">✨ 推荐理由: ${escapeHtml(r.reason)}</span>
            <span class="item-url">Source: ${escapeHtml(r.domain)}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-pin-text" style="color: #10b981; border-color: #10b981; background: transparent;" onclick="showToast('已录入正式追踪库'); this.closest('.data-item').style.opacity=0.3">吸收</button>
          <button class="btn-pin-text" style="color: var(--muted-fg); border-color: var(--border); background: transparent;" onclick="this.closest('.data-item').remove()">排斥</button>
        </div>
      </div>
    `,
      )
      .join("");

    // 恢复按钮状态
    btn.innerHTML = "✨ 重新推演";
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    showToast("Agent 报告已生成", "success");
  }, 1500); // 模拟 1.5s 延迟
};

init();
