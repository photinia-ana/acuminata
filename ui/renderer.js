let watchlist = [];
let records = [];
let enabled = true;
let activeFilter = "all";
let searchQuery = "";
let currentPage = 1;
let pageSize = 200;
let totalRecords = 0;
let loadedAll = false;
let stats = null;
let wsConnected = false;
let selectedIds = new Set(); // 新增：保存当前选中的记录 ID

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDomainColor(val) {
  // 同时兼容匹配域名或匹配备注(Label)
  const entry = watchlist.find(function (e) {
    return e.domain === val || e.label === val;
  });
  return entry ? entry.color : "#5b8dee";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m];
  });
}

function showToast(msg, type) {
  if (!type) type = "success";
  var el = document.getElementById("toast");
  el.textContent = (type === "success" ? "\u2713 " : "\u2717 ") + msg;
  el.className = "toast " + type + " show";
  setTimeout(function () {
    el.classList.remove("show");
  }, 2500);
}

function setWsStatus(connected) {
  wsConnected = connected;
  var dot = document.getElementById("wsDot");
  var txt = document.getElementById("wsStatusText");
  dot.className = "ws-dot " + (connected ? "on" : "off");
  txt.textContent = connected ? "已连接" : "未连接";
}

function dateGroupLabel(ts) {
  var d = new Date(ts);
  var today = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function renderStats() {
  if (!stats) return;
  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statToday").textContent = stats.today;
  document.getElementById("statSites").textContent = watchlist.length;
  if (stats.topDomain) {
    var label = stats.topDomain;
    if (label.length > 10) label = label.slice(0, 10) + "...";
    document.getElementById("statTopSite").textContent = label;
    document.getElementById("statTopSiteLabel").textContent =
      "最多访问 " + stats.topDomainCount + "次";
  } else {
    document.getElementById("statTopSite").textContent = "-";
    document.getElementById("statTopSiteLabel").textContent = "最多访问";
  }
}

function renderWatchlist() {
  var container = document.getElementById("watchlist");
  if (watchlist.length === 0) {
    container.innerHTML = '<div class="empty-watchlist">暂无追踪站点</div>';
    return;
  }
  var counts = (stats && stats.domainCounts) || {};
  container.innerHTML = watchlist
    .map(function (entry, idx) {
      return (
        '<div class="watch-item">' +
        '<div class="wd-dot" style="background:' +
        (entry.color || "#5b8dee") +
        '"></div>' +
        '<div class="wd-domain">' +
        escapeHtml(entry.domain) +
        "</div>" +
        '<div class="wd-label">' +
        escapeHtml(entry.label || "") +
        "</div>" +
        '<div class="wd-count">' +
        (counts[entry.domain] || 0) +
        " 条</div>" +
        '<button class="wd-remove" data-idx="' +
        idx +
        '">×</button>' +
        "</div>"
      );
    })
    .join("");
}

function getFilteredRecords() {
  var filtered = records; // 列表直接用服务器返回的
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    filtered = filtered.filter(function (r) {
      return (
        (r.title && r.title.toLowerCase().indexOf(q) !== -1) ||
        (r.url && r.url.toLowerCase().indexOf(q) !== -1) ||
        (r.matchedRule && r.matchedRule.toLowerCase().indexOf(q) !== -1)
      );
    });
  }
  return filtered;
}

function groupByDate(list) {
  var groups = [];
  var current = null;
  for (var i = 0; i < list.length; i++) {
    var label = dateGroupLabel(list[i].timestamp);
    if (!current || current.label !== label) {
      current = { label: label, items: [] };
      groups.push(current);
    }
    current.items.push(list[i]);
  }
  return groups;
}

function renderRecords() {
  var container = document.getElementById("recordsContainer");
  var filtered = getFilteredRecords();

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-records">' +
      '<div class="empty-icon">' +
      (searchQuery ? "🔍" : "📭") +
      "</div>" +
      '<div class="empty-text">' +
      (searchQuery ? "无匹配结果" : "暂无记录") +
      "</div>" +
      "</div>";
    if (searchQuery) {
      document.getElementById("recordsScroll").scrollTop = 0;
    }
    return;
  }

  var groups = groupByDate(filtered);
  var html = "";
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    html += '<div class="date-header">' + group.label + "</div>";
    for (var i = 0; i < group.items.length; i++) {
      var r = group.items[i];
      var color = getDomainColor(r.matchedRule);
      var pinned = r.pinned ? 1 : 0;
      var score = r.score ?? null;
      var pinBtn =
        '<button class="btn-text-pin' +
        (pinned ? " on" : "") +
        '" data-action="rec-pin" data-id="' +
        r.id +
        '">' +
        (pinned ? "Pinned" : "Pin") +
        "</button>";
      var scoreHtml = pinned
        ? '<div class="rec-score">' +
          '<button class="rec-sc-btn" data-action="rec-score-down" data-id="' +
          r.id +
          '">−</button>' +
          '<span class="rec-sc-val">' +
          (score ?? 50) +
          "</span>" +
          '<button class="rec-sc-btn" data-action="rec-score-up" data-id="' +
          r.id +
          '">+</button>' +
          "</div>"
        : "";
      html +=
        '<div class="record-item" data-url="' +
        encodeURIComponent(r.url) +
        '">' +
        // -- 新增的复选框 --
        '<input type="checkbox" class="rec-checkbox" data-action="rec-select" data-id="' +
        r.id +
        '" ' +
        (selectedIds.has(r.id) ? "checked" : "") +
        ">" +
        // ------------------
        '<div class="rec-dot" style="background:' +
        color +
        '"></div>' +
        '<div class="rec-body">' +
        '<div class="rec-title">' +
        escapeHtml(r.title || r.url) +
        "</div>" +
        '<div class="rec-meta">' +
        '<span class="rec-domain" style="color:' +
        color +
        '">' +
        escapeHtml(r.matchedRule) +
        "</span>" +
        '<span class="rec-time">' +
        formatTime(r.timestamp) +
        "</span>" +
        '<span class="rec-url">' +
        escapeHtml(r.url) +
        "</span>" +
        scoreHtml + // 星号删掉了，这里只保留打分（如果有）
        "</div>" +
        "</div>" +
        pinBtn + // <--- 将 Pin 按钮放在这里，它会被自动推到最右侧
        "</div>";
    }
  }

  if (!loadedAll && !searchQuery) {
    html +=
      '<div class="load-more-bar">' +
      '<button id="btnLoadMore">加载更多 (' +
      records.length +
      " / " +
      totalRecords +
      ")</button>" +
      "</div>";
  }

  container.innerHTML = html;

  // rebind load-more
  var lm = document.getElementById("btnLoadMore");
  if (lm) {
    lm.addEventListener("click", function () {
      loadRecords(currentPage + 1);
    });
  }
}

function updateBatchDeleteBtn() {
  var btn = document.getElementById("btnBatchDelete");
  if (!btn) return;
  if (selectedIds.size > 0) {
    btn.style.display = "block";
    btn.textContent = "删除选中 (" + selectedIds.size + ")";
  } else {
    btn.style.display = "none";
  }
}

function renderFilterBar() {
  var bar = document.getElementById("filterBar");
  var counts = (stats && stats.domainCounts) || {};
  var domains = Object.keys(counts);

  // 修改：在这里强行推入一个 Pinned 的芯片
  var chips = [
    '<div class="filter-chip' +
      (activeFilter === "all" ? " active" : "") +
      '" data-domain="all">全部</div>',
    '<div class="filter-chip' +
      (activeFilter === "pinned" ? " active" : "") +
      '" data-domain="pinned" style="border-color: var(--warning); ' +
      (activeFilter === "pinned"
        ? "background: var(--warning); color: #000;"
        : "color: var(--warning);") +
      '">★ 已收藏</div>',
  ];

  domains.forEach(function (d) {
    var color = getDomainColor(d);
    var active = activeFilter === d;
    chips.push(
      '<div class="filter-chip' +
        (active ? " active" : "") +
        '" data-domain="' +
        d +
        '" style="' +
        (active
          ? "background:" + color + ";border-color:" + color
          : "border-color:" + color + "40") +
        '">' +
        d +
        ' <span style="opacity:0.7">' +
        counts[d] +
        "</span></div>",
    );
  });
  bar.innerHTML = chips.join("");
}

async function loadRecords(page, filter) {
  var f = filter !== undefined ? filter : activeFilter;
  var result = await window.electronAPI.getRecordsPage(page, pageSize, f);
  if (page === 1) {
    records = result.records;
  } else {
    records = records.concat(result.records);
  }
  currentPage = page;
  totalRecords = result.total;
  loadedAll = records.length >= totalRecords;
  renderRecords();
}

async function refreshStats() {
  try {
    stats = await window.electronAPI.getStatistics();
    enabled = stats.enabled;
  } catch (e) {
    console.error("Stats error:", e);
  }
}

async function init() {
  setWsStatus(false);

  try {
    watchlist = await window.electronAPI.getWatchlist();
    await refreshStats();
  } catch (e) {
    console.error("Init error:", e);
  }

  document.getElementById("enabledToggle").checked = enabled;
  document.getElementById("toggleLabel").textContent = enabled
    ? "追踪中"
    : "已暂停";

  renderWatchlist();
  renderStats();
  renderFilterBar();
  await loadRecords(1, activeFilter);
  setWsStatus(true);
}

// ── Event listeners ──

init();

document.getElementById("btnAdd").addEventListener("click", addEntry);
document.getElementById("btnExport").addEventListener("click", exportData);
document.getElementById("btnClear").addEventListener("click", clearData);

// Watchlist toggle collapse
document
  .getElementById("watchlistToggle")
  .addEventListener("click", function (e) {
    if (e.target.closest("#btnToggleAdd")) return;
    this.classList.toggle("collapsed");
    var body = document.getElementById("watchlistBody");
    body.style.display = body.style.display === "none" ? "block" : "none";
  });

// Add form toggle
document.getElementById("btnToggleAdd").addEventListener("click", function (e) {
  e.stopPropagation();
  var form = document.getElementById("addFormInline");
  form.classList.toggle("open");
  if (form.classList.contains("open")) {
    document.getElementById("inputDomain").focus();
  }
});

// Watchlist remove
document.getElementById("watchlist").addEventListener("click", function (e) {
  var btn = e.target.closest(".wd-remove");
  if (btn) {
    removeEntry(parseInt(btn.dataset.idx));
    return;
  }
});

// Filter chips
document
  .getElementById("filterBar")
  .addEventListener("click", async function (e) {
    var chip = e.target.closest(".filter-chip");
    if (chip) {
      activeFilter = chip.dataset.domain;
      renderFilterBar();
      await loadRecords(1);
    }
  });

// Record click
document
  .getElementById("recordsContainer")
  .addEventListener("click", function (e) {
    // === 新增：拦截复选框的点击 ===
    var chk = e.target.closest("[data-action='rec-select']");
    if (chk) {
      e.stopPropagation(); // 重要：阻止冒泡，防止触发整行跳转
      if (chk.checked) {
        selectedIds.add(chk.dataset.id);
      } else {
        selectedIds.delete(chk.dataset.id);
      }
      updateBatchDeleteBtn();
      return;
    }
    // 拦截 Pin 按钮的点击
    var recPinBtn = e.target.closest("[data-action='rec-pin']");
    if (recPinBtn) {
      e.stopPropagation(); // 重要：阻止事件冒泡到外层触发 openUrl
      var id = recPinBtn.dataset.id;
      var rec = records.find(function (r) {
        return r.id === id;
      });
      if (rec) {
        var newPinned = !rec.pinned;
        var newScore = newPinned && !rec.score ? 50 : rec.score;
        var idx = records.findIndex(function (r) {
          return r.id === id;
        });
        records[idx].pinned = newPinned ? 1 : 0;
        if (newPinned && !rec.score) records[idx].score = 50;
        window.electronAPI.toggleRecordPin(id, newPinned, records[idx].score);
        renderRecords();
      }
      return;
    }

    // 拦截打分按钮的点击
    var scoreUp = e.target.closest("[data-action='rec-score-up']");
    var scoreDown = e.target.closest("[data-action='rec-score-down']");
    if (scoreUp || scoreDown) {
      e.stopPropagation(); // 重要：阻止事件冒泡
      var rid = (scoreUp || scoreDown).dataset.id;
      var rec = records.find(function (r) {
        return r.id === rid;
      });
      if (rec && rec.pinned) {
        var cur = rec.score ?? 50;
        var newScore = Math.max(0, Math.min(100, cur + (scoreUp ? 5 : -5)));
        var idx = records.findIndex(function (r) {
          return r.id === rid;
        });
        records[idx].score = newScore;
        window.electronAPI.toggleRecordPin(rid, true, newScore);
        renderRecords();
      }
      return;
    }

    // 如果没有点击上述按钮，则正常打开网页
    var item = e.target.closest(".record-item");
    if (item) {
      var url = decodeURIComponent(item.dataset.url);
      window.electronAPI.openUrl(url);
    }
  });

// Enable/disable toggle
document
  .getElementById("enabledToggle")
  .addEventListener("change", async function (e) {
    enabled = e.target.checked;
    await window.electronAPI.setEnabled(enabled);
    document.getElementById("toggleLabel").textContent = enabled
      ? "追踪中"
      : "已暂停";
    showToast(enabled ? "追踪已开启" : "追踪已暂停", "success");
  });

// Input keydown
document
  .getElementById("inputDomain")
  .addEventListener("keydown", function (e) {
    if (e.key === "Enter") addEntry();
  });
document.getElementById("inputLabel").addEventListener("keydown", function (e) {
  if (e.key === "Enter") addEntry();
});

// Search
var searchInput = document.getElementById("searchInput");
var searchClear = document.getElementById("searchClear");
var searchTimer = null;

searchInput.addEventListener("input", function () {
  searchQuery = this.value.trim();
  searchClear.classList.toggle("visible", searchQuery.length > 0);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    renderRecords();
    document.getElementById("recordsScroll").scrollTop = 0;
  }, 200);
});

searchClear.addEventListener("click", function () {
  searchInput.value = "";
  searchQuery = "";
  searchClear.classList.remove("visible");
  renderRecords();
  document.getElementById("recordsScroll").scrollTop = 0;
});

// ── Actions ──

async function addEntry() {
  var domain = document
    .getElementById("inputDomain")
    .value.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  var label = document.getElementById("inputLabel").value.trim();
  var color = document.getElementById("inputColor").value;

  if (!domain) {
    showToast("请输入域名", "error");
    return;
  }
  if (
    watchlist.find(function (e) {
      return e.domain === domain;
    })
  ) {
    showToast("该域名已存在", "error");
    return;
  }

  watchlist.push({ domain: domain, label: label, color: color });
  await window.electronAPI.addToWatchlist({
    domain: domain,
    label: label,
    color: color,
  });
  document.getElementById("inputDomain").value = "";
  document.getElementById("inputLabel").value = "";
  document.getElementById("addFormInline").classList.remove("open");
  renderWatchlist();
  renderStats();
  showToast("已添加 " + domain, "success");
}

async function removeEntry(idx) {
  var entry = watchlist[idx];
  if (!confirm("确认移除 " + entry.domain + "？相关记录不会删除。")) return;
  watchlist.splice(idx, 1);
  await window.electronAPI.removeFromWatchlist(entry.domain);
  renderWatchlist();
  renderStats();
  showToast("已移除", "success");
}

async function exportData() {
  var data = await window.electronAPI.exportData();
  var blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download =
    "site-history-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("导出成功", "success");
}

async function clearData() {
  if (!confirm("确认清空所有浏览记录？此操作不可撤销。")) return;
  await window.electronAPI.clearRecords();
  records = [];
  totalRecords = 0;
  loadedAll = true;
  await refreshStats();
  renderRecords();
  renderStats();
  renderFilterBar();
  showToast("已清空所有记录", "success");
}

// ── Broadcast handlers ──

window.electronAPI.onUpdate(function (data) {
  if (data.type === "recordAdded") {
    setWsStatus(true);

    // 找出这条新记录所属的伪装归类名
    var entry = watchlist.find(function (w) {
      return w.domain === data.record.matchedRule;
    });
    var rLabel = entry ? entry.label || entry.domain : data.record.matchedRule;

    if (
      activeFilter === "all" ||
      activeFilter === "pinned" ||
      activeFilter === rLabel
    ) {
      if (records.length >= totalRecords) {
        totalRecords++;
        loadedAll = records.length >= totalRecords;
      }
      records.unshift(data.record);
      renderRecords();
    }
    if (stats) {
      stats.total++;
      var ts = new Date();
      ts.setHours(0, 0, 0, 0);
      if (data.record.timestamp >= ts.getTime()) stats.today++;
      if (stats.domainCounts) {
        stats.domainCounts[data.record.matchedRule] =
          (stats.domainCounts[data.record.matchedRule] || 0) + 1;
      }
      if (!stats.topDomain) {
        stats.topDomain = data.record.matchedRule;
        stats.topDomainCount = 1;
      } else if (stats.domainCounts) {
        var cur = stats.domainCounts[data.record.matchedRule] || 0;
        if (cur > stats.topDomainCount) {
          stats.topDomain = data.record.matchedRule;
          stats.topDomainCount = cur;
        }
      }
    }
    renderStats();
    renderFilterBar();
  } else if (data.type === "recordsCleared") {
    records = [];
    totalRecords = 0;
    loadedAll = true;
    refreshStats().then(function () {
      renderRecords();
      renderStats();
      renderFilterBar();
    });
  } else if (data.type === "watchlistUpdated") {
    watchlist = data.watchlist;
    renderWatchlist();
    renderFilterBar();
    renderStats();
  } else if (data.type === "enabledUpdated") {
    enabled = data.enabled;
    document.getElementById("enabledToggle").checked = enabled;
    document.getElementById("toggleLabel").textContent = enabled
      ? "追踪中"
      : "已暂停";
  } else if (data.type === "recordUpdated") {
    if (data.record) {
      var idx = records.findIndex(function (r) {
        return r.id === data.record.id;
      });
      if (idx !== -1) {
        records[idx] = data.record;
        renderRecords();
      }
    }
  }
});

window.electronAPI.onWatchlistUpdate(function (data) {
  watchlist = data.watchlist;
  renderWatchlist();
});

// 批量删除
var btnBatchDelete = document.getElementById("btnBatchDelete");
if (btnBatchDelete) {
  btnBatchDelete.addEventListener("click", async function () {
    if (selectedIds.size === 0) return;
    if (!confirm("确认删除选中的 " + selectedIds.size + " 条记录吗？")) return;

    // 执行删除
    await window.electronAPI.deleteRecords(Array.from(selectedIds));

    // 清空选中状态并隐藏按钮
    selectedIds.clear();
    updateBatchDeleteBtn();

    // 重新拉取数据刷新界面
    records = [];
    await loadRecords(1);
    await refreshStats();
    renderStats();
    renderFilterBar();
    showToast("已删除选中记录", "success");
  });
}
