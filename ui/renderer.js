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
let selectedIds = new Set();
let aiAnalysisResult = null;
let recommendations = [];
let aiConfig = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  apiKey: "",
  model: "qwen2.5:7b",
};
let aiConnected = false;
let aiBusy = false;
let locale = { code: "zh-CN", data: {} };

function t(key, params) {
  var str = locale.data[key] || key;
  if (params) {
    for (var k in params) {
      str = str.replace("{" + k + "}", params[k]);
    }
  }
  return str;
}

async function applyLocale() {
  var els = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  }
  var phs = document.querySelectorAll("[data-i18n-placeholder]");
  for (var j = 0; j < phs.length; j++) {
    var ph = phs[j];
    ph.placeholder = t(ph.getAttribute("data-i18n-placeholder"));
  }
}

async function setLocale(code) {
  try {
    var old = document.querySelector(".lang-option.active");
    if (old) old.classList.remove("active");
    var next = document.querySelector('.lang-option[data-code="' + code + '"]');
    if (next) next.classList.add("active");
    await window.electronAPI.setLocale(code);
    var result = await window.electronAPI.getLocale();
    locale.code = result.code;
    locale.data = result.data;
    applyLocale();
    renderFilterBar();
    renderStats();
    renderWatchlist();
    renderRecords();
  } catch (e) {}
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return t("time.justNow");
  if (diff < 3600000) return t("time.minutesAgo", { n: Math.floor(diff / 60000) });
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
  txt.textContent = connected ? t("header.ws.connected") : t("header.ws.disconnected");
}

function dateGroupLabel(ts) {
  var d = new Date(ts);
  var today = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t("date.today");
  if (d.toDateString() === yesterday.toDateString()) return t("date.yesterday");
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
  document.getElementById("statTotalLabel").textContent = t("stats.totalRecords");
  document.getElementById("statTodayLabel").textContent = t("stats.today");
  document.getElementById("statSitesLabel").textContent = t("stats.sites");
  if (stats.topDomain) {
    var label = stats.topDomain;
    if (label.length > 10) label = label.slice(0, 10) + "...";
    document.getElementById("statTopSite").textContent = label;
    document.getElementById("statTopSiteLabel").textContent =
      t("stats.mostVisitedCount", { n: stats.topDomainCount });
  } else {
    document.getElementById("statTopSite").textContent = "-";
    document.getElementById("statTopSiteLabel").textContent = t("stats.mostVisited");
  }
}

function renderWatchlist() {
  var container = document.getElementById("watchlist");
  if (watchlist.length === 0) {
    container.innerHTML = '<div class="empty-watchlist">' + t("watchlist.empty") + '</div>';
    return;
  }
  var counts = (stats && stats.domainCounts) || {};

  container.innerHTML = watchlist
    .map(function (entry, idx) {
      // 新增：如果有正则规则，显示一个小的 [.*] 徽章，悬停可看规则详情
      var regexBadge = entry.regexFilter
        ? '<span style="font-size:9px;color:var(--warning);border:1px solid var(--warning);padding:0 3px;border-radius:3px;margin-left:6px;cursor:help;opacity:0.8" title="[' +
          (entry.regexTarget === "title" ? "Title" : "URL") +
          "] 正则: " +
          escapeHtml(entry.regexFilter) +
          '">.*</span>'
        : "";

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
        regexBadge +
        "</div>" +
        '<div class="wd-count">' +
        (counts[entry.domain] || 0) +
        t("watchlist.items", { n: "" }) + "</div>" +
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
  var aiPanel = document.getElementById("aiPanel");

  if (activeFilter === "recommend") {
    container.style.display = "none";
    aiPanel.classList.add("active");
    renderAiPanel();
    return;
  }

  container.style.display = "block";
  aiPanel.classList.remove("active");

  var filtered = getFilteredRecords();

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-records">' +
      '<div class="empty-icon">' +
      (searchQuery ? "🔍" : "📭") +
      "</div>" +
      '<div class="empty-text">' +
      (searchQuery ? t("empty.noMatch") : t("empty.noRecords")) +
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
        (pinned ? t("record.pinned") : t("record.pin")) +
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
      '<button id="btnLoadMore">' +
      t("button.loadMore", { loaded: records.length, total: totalRecords }) +
      "</button>" +
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
    btn.textContent = t("button.batchDelete", { n: selectedIds.size });
  } else {
    btn.style.display = "none";
  }
}

function renderFilterBar() {
  var bar = document.getElementById("filterBar");
  var counts = (stats && stats.domainCounts) || {};
  var domains = Object.keys(counts);

  var chips = [
    '<div class="filter-chip' +
      (activeFilter === "recommend" ? " active" : "") +
      '" data-domain="recommend" style="' +
      (activeFilter === "recommend"
        ? "background: linear-gradient(135deg, var(--accent), var(--accent2));border-color: transparent;color: #fff;"
        : "background: linear-gradient(135deg, rgba(91,141,238,0.1), rgba(232,93,138,0.1));border-color: rgba(91,141,238,0.3);") +
      '">' + t("filter.ai") + '</div>',
    '<div class="filter-chip' +
      (activeFilter === "all" ? " active" : "") +
      '" data-domain="all">' + t("filter.all") + '</div>',
    '<div class="filter-chip' +
      (activeFilter === "pinned" ? " active" : "") +
      '" data-domain="pinned" style="border-color: var(--warning); ' +
      (activeFilter === "pinned"
        ? "background: var(--warning); color: #000;"
        : "color: var(--warning);") +
      '">' + t("filter.pinned") + '</div>',
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

function renderAiPanel() {
  document.getElementById("aiProvider").value = aiConfig.provider;
  document.getElementById("aiEndpoint").value = aiConfig.endpoint;
  document.getElementById("aiModel").value = aiConfig.model;
  var apiKeyInput = document.getElementById("aiApiKey");
  var apiKeyRow = document.getElementById("aiApiKeyRow");
  if (aiConfig.provider === "ollama") {
    apiKeyRow.style.display = "none";
    apiKeyInput.value = "";
  } else {
    apiKeyRow.style.display = "flex";
    apiKeyInput.value = aiConfig.apiKey || "";
  }
  var ind = document.getElementById("aiIndicator");
  ind.className = "pc-indicator " + (aiConnected ? "ok" : "err");

  if (aiBusy) {
    document.getElementById("aiLoading").classList.add("active");
    document.getElementById("aiTriggerArea").style.display = "none";
    document.getElementById("aiResult").classList.remove("active");
  } else {
    document.getElementById("aiLoading").classList.remove("active");
  }

  if (aiAnalysisResult) {
    document.getElementById("aiTriggerArea").style.display = "none";
    document.getElementById("aiResult").classList.add("active");
    document.getElementById("aiSummary").textContent =
      aiAnalysisResult.summary || "";
    var kwHtml = (aiAnalysisResult.keywords || [])
      .map(function (k) {
        return '<span class="ai-keyword-tag">' + escapeHtml(k) + "</span>";
      })
      .join("");
    document.getElementById("aiKeywords").innerHTML =
      kwHtml || '<span style="color:var(--text3);font-size:12px">-</span>';
  } else {
    document.getElementById("aiTriggerArea").style.display = "block";
    document.getElementById("aiResult").classList.remove("active");
  }

  loadRecommendations();
}

async function loadRecommendations() {
  try {
    recommendations = await window.electronAPI.getRecommendations();
    var filtered = recommendations.filter(function (r) {
      return r.status === 0;
    });
    renderRecommendations(filtered);
  } catch (e) {
    console.error("Load recommendations error:", e);
  }
}

function renderRecommendations(list) {
  var section = document.getElementById("aiRecsSection");
  var container = document.getElementById("aiRecsContainer");

  if (list.length === 0) {
    section.classList.remove("active");
    container.innerHTML = "";
    return;
  }

  section.classList.add("active");
  container.innerHTML = list
    .map(function (r) {
      return (
        '<div class="rec-card" data-url="' +
        encodeURIComponent(r.url) +
        '">' +
        '<div class="rec-card-icon">💡</div>' +
        '<div class="rec-card-body">' +
        '<div class="rec-card-title">' +
        escapeHtml(r.title) +
        "</div>" +
        '<div class="rec-card-meta">' +
        escapeHtml(r.url) +
        " · " +
        escapeHtml(r.groupLabel) +
        "</div>" +
        (r.reason
          ? '<div class="rec-card-reason">' + escapeHtml(r.reason) + "</div>"
          : "") +
        "</div>" +
        '<div class="rec-card-actions">' +
        '<button class="rec-btn-accept" data-action="rec-accept" data-id="' +
        r.id +
        '">✅</button>' +
        '<button class="rec-btn-reject" data-action="rec-reject" data-id="' +
        r.id +
        '">❌</button>' +
        "</div>" +
        "</div>"
      );
    })
    .join("");
}

async function handleAiAnalyze() {
  if (aiBusy) return;
  aiBusy = true;

  document.getElementById("aiError").classList.remove("active");
  document.getElementById("aiTriggerArea").style.display = "none";
  document.getElementById("aiLoading").classList.add("active");
  document.getElementById("aiResult").classList.remove("active");

  try {
    var result = await window.electronAPI.triggerAgentAnalysis();
    if (result.error) {
      document.getElementById("aiError").textContent = result.error;
      document.getElementById("aiError").classList.add("active");
      document.getElementById("aiTriggerArea").style.display = "block";
    } else {
      aiAnalysisResult = result;
      document.getElementById("aiResult").classList.add("active");
      document.getElementById("aiSummary").textContent =
        result.summary || "";
      var kwHtml = (result.keywords || [])
        .map(function (k) {
          return '<span class="ai-keyword-tag">' + escapeHtml(k) + "</span>";
        })
        .join("");
      document.getElementById("aiKeywords").innerHTML =
        kwHtml || '<span style="color:var(--text3);font-size:12px">-</span>';
      showToast(t("ai.analyzed", { n: result.recordsAnalyzed }), "success");
    }
  } catch (e) {
    document.getElementById("aiError").textContent =
      t("ai.failed", { msg: e.message || e });
    document.getElementById("aiError").classList.add("active");
    document.getElementById("aiTriggerArea").style.display = "block";
  } finally {
    aiBusy = false;
    document.getElementById("aiLoading").classList.remove("active");
  }
}

async function handleTestAi() {
  saveAiConfig();
  var btn = document.getElementById("btnTestAi");
  var ind = document.getElementById("aiIndicator");
  btn.textContent = t("ai.testing");
  btn.disabled = true;
  try {
    var result = await window.electronAPI.testAiConnection();
    aiConnected = result.ok;
    ind.className = "pc-indicator " + (result.ok ? "ok" : "err");
    var providerName = t("provider." + result.provider) || t("provider.default");
    if (result.ok) {
      showToast(t("toast.connected", { provider: providerName }), "success");
    } else {
      showToast(t("toast.connectFailed", { msg: result.error || t("toast.unknownError") }), "error");
    }
  } catch (e) {
    aiConnected = false;
    ind.className = "pc-indicator err";
    showToast(t("toast.connectFailed", { msg: e.message || e }), "error");
  } finally {
    btn.textContent = t("ai.testBtn");
    btn.disabled = false;
  }
}

function saveAiConfig() {
  var provider = document.getElementById("aiProvider").value;
  var endpoint = document.getElementById("aiEndpoint").value.trim();
  var model = document.getElementById("aiModel").value.trim();
  var apiKey = document.getElementById("aiApiKey").value;
  aiConfig.provider = provider;
  aiConfig.endpoint = endpoint;
  aiConfig.model = model;
  if (apiKey && !apiKey.startsWith("••••")) {
    aiConfig.apiKey = apiKey;
  }
  window.electronAPI.setAiConfig({
    provider: provider,
    endpoint: endpoint,
    apiKey: apiKey,
    model: model,
  });
}

async function loadRecords(page, filter) {
  var f = filter !== undefined ? filter : activeFilter;
  if (f === "recommend") {
    renderRecords();
    return;
  }
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
    var cfg = await window.electronAPI.getAiConfig();
    aiConfig.provider = cfg.provider || "ollama";
    aiConfig.endpoint = cfg.endpoint || "http://127.0.0.1:11434";
    aiConfig.apiKey = cfg.apiKey || "";
    aiConfig.model = cfg.model || "qwen2.5:7b";
    var loc = await window.electronAPI.getLocale();
    locale.code = loc.code;
    locale.data = loc.data;
    await refreshStats();
  } catch (e) {
    console.error("Init error:", e);
  }

  document.getElementById("enabledToggle").checked = enabled;
  document.getElementById("toggleLabel").textContent = enabled
    ? t("header.tracking")
    : t("header.paused");

  renderWatchlist();
  renderStats();
  renderFilterBar();
  await loadRecords(1, activeFilter);
  applyLocale();
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
      if (activeFilter === "recommend") {
        searchQuery = "";
        searchInput.value = "";
        searchClear.classList.remove("visible");
        document.getElementById("searchBox").style.display = "none";
        document.getElementById("btnBatchDelete").style.display = "none";
        selectedIds.clear();
      } else {
        document.getElementById("searchBox").style.display = "flex";
        updateBatchDeleteBtn();
      }
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
      ? t("header.tracking")
      : t("header.paused");
    showToast(enabled ? t("toast.trackingOn") : t("toast.trackingOff"), "success");
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

// ── AI panel event listeners ──

document.getElementById("btnAiAnalyze").addEventListener("click", handleAiAnalyze);

document.getElementById("btnTestAi").addEventListener("click", handleTestAi);

document.getElementById("aiProvider").addEventListener("change", function () {
  var provider = this.value;
  var apiKeyRow = document.getElementById("aiApiKeyRow");
  var endpointInput = document.getElementById("aiEndpoint");
  var modelInput = document.getElementById("aiModel");
  var apiKeyInput = document.getElementById("aiApiKey");
  var defaults = {
    ollama: { endpoint: "http://127.0.0.1:11434", model: "qwen2.5:7b" },
    openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    anthropic: { endpoint: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514" },
    minimax: { endpoint: "https://api.minimaxi.com/anthropic", model: "MiniMax-M2.5" },
  };
  if (provider === "ollama") {
    apiKeyRow.style.display = "none";
    apiKeyInput.value = "";
  } else {
    apiKeyRow.style.display = "flex";
  }
  var d = defaults[provider];
  if (d) {
    endpointInput.value = d.endpoint;
    modelInput.value = d.model;
  }
  aiConnected = false;
  document.getElementById("aiIndicator").className = "pc-indicator err";
  saveAiConfig();
});

document.getElementById("aiEndpoint").addEventListener("change", saveAiConfig);
document.getElementById("aiModel").addEventListener("change", saveAiConfig);
document.getElementById("aiApiKey").addEventListener("change", saveAiConfig);

document.getElementById("langZh").addEventListener("click", function () { setLocale("zh-CN"); });
document.getElementById("langEn").addEventListener("click", function () { setLocale("en"); });

document.getElementById("btnClearRecs").addEventListener("click", async function () {
  if (!confirm(t("confirm.clearRecs"))) return;
  await window.electronAPI.clearRecommendations();
  recommendations = [];
  renderRecommendations([]);
  showToast(t("toast.recsCleared"), "success");
});

document.getElementById("aiPanel").addEventListener("click", function (e) {
  var acceptBtn = e.target.closest("[data-action='rec-accept']");
  var rejectBtn = e.target.closest("[data-action='rec-reject']");

  if (acceptBtn || rejectBtn) {
    e.stopPropagation();
    var id = (acceptBtn || rejectBtn).dataset.id;

    if (acceptBtn) {
      window.electronAPI
        .acceptRecommendation(id)
        .then(function (record) {
          if (record) {
            recommendations = recommendations.filter(function (r) {
              return r.id !== id;
            });
            var filtered = recommendations.filter(function (r) {
              return r.status === 0;
            });
            renderRecommendations(filtered);
            showToast(t("toast.accepted"), "success");
          }
        })
        .catch(function (e) {
          showToast(t("toast.opFailed"), "error");
        });
    } else {
      window.electronAPI
        .rejectRecommendation(id)
        .then(function () {
          recommendations = recommendations.filter(function (r) {
            return r.id !== id;
          });
          var filtered = recommendations.filter(function (r) {
            return r.status === 0;
          });
          renderRecommendations(filtered);
        })
        .catch(function (e) {
          showToast(t("toast.opFailed"), "error");
        });
    }
    return;
  }

  var card = e.target.closest(".rec-card");
  if (card) {
    var url = decodeURIComponent(card.dataset.url);
    window.electronAPI.openUrl(url);
  }
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

  // 新增：提取正则参数
  var regexTarget = document.getElementById("inputRegexTarget").value;
  var regexFilter = document.getElementById("inputRegexFilter").value.trim();

  if (!domain) {
    showToast(t("toast.domainRequired"), "error");
    return;
  }
  if (
    watchlist.find(function (e) {
      return e.domain === domain;
    })
  ) {
    showToast(t("toast.domainExists"), "error");
    return;
  }

  var newEntry = {
    domain: domain,
    label: label,
    color: color,
    regexFilter: regexFilter,
    regexTarget: regexTarget,
  };
  watchlist.push(newEntry);
  await window.electronAPI.addToWatchlist(newEntry);

  document.getElementById("inputDomain").value = "";
  document.getElementById("inputLabel").value = "";
  document.getElementById("inputRegexFilter").value = ""; // 清空正则框
  document.getElementById("addFormInline").classList.remove("open");
  renderWatchlist();
  renderStats();
  showToast(t("toast.added", { domain: domain }), "success");
}

async function removeEntry(idx) {
  var entry = watchlist[idx];
  if (!confirm(t("confirm.removeDomain", { domain: entry.domain }))) return;
  watchlist.splice(idx, 1);
  await window.electronAPI.removeFromWatchlist(entry.domain);
  renderWatchlist();
  renderStats();
  showToast(t("toast.removed"), "success");
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
    "acuminata-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast(t("toast.exported"), "success");
}

async function clearData() {
  if (!confirm(t("confirm.clearAll"))) return;
  await window.electronAPI.clearRecords();
  records = [];
  totalRecords = 0;
  loadedAll = true;
  await refreshStats();
  renderRecords();
  renderStats();
  renderFilterBar();
  showToast(t("toast.cleared"), "success");
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
      ? t("header.tracking")
      : t("header.paused");
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
    if (!confirm(t("confirm.batchDelete", { n: selectedIds.size }))) return;

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
    showToast(t("toast.deleted"), "success");
  });
}
