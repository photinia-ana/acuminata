/**
 * Record clustering module — pure logic, no DB or side effects.
 *
 * Responsibilities:
 *   - Regex validation for grouped watchlist entries
 *   - Group resolution (label → domains)
 *   - Path extraction from URLs
 *   - Dedup: same path within a group
 *   - Daily auto-pin scoring (max +1/day)
 *
 * @param {Object} incoming
 * @param {string} incoming.url
 * @param {string} incoming.title
 * @param {string} incoming.domain
 * @param {string} incoming.matchedRule
 * @param {number} incoming.tabId
 * @param {number} incoming.timestamp
 * @param {WatchlistEntry[]} watchlist
 * @param {Function} findExisting - (groupDomains: string[], path: string) => Record | null
 * @returns {{ action: "drop"|"ignore"|"update"|"insert", record?: any, updates?: object }}
 */

function resolveGroupLabel(matchedRule, domain, watchlist) {
  const currentWatch = watchlist.find((w) => w.domain === matchedRule);
  return currentWatch ? currentWatch.label || domain : domain;
}

function getGroupRules(groupLabel, watchlist) {
  return watchlist.filter(
    (w) =>
      (w.label || w.domain) === groupLabel &&
      w.regexFilter &&
      w.regexFilter.trim() !== "",
  );
}

function matchesRegex(rules, title, url) {
  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.regexFilter.trim());
      const targetStr = rule.regexTarget === "title" ? title || "" : url;
      if (regex.test(targetStr)) return true;
    } catch (e) {
      // ignore invalid regex
    }
  }
  return false;
}

function getGroupDomains(groupLabel, watchlist, fallbackDomain) {
  const domains = watchlist
    .filter((w) => (w.label || w.domain) === groupLabel)
    .map((w) => w.domain);
  if (domains.length === 0) domains.push(fallbackDomain);
  return domains;
}

function extractPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return url;
  }
}

function computeDailyScore(existing, now) {
  const todayStr = new Date(now).toDateString();
  const createdAt = existing.createdAt || existing.timestamp;
  const isCreatedToday = new Date(createdAt).toDateString() === todayStr;
  const isUpdatedToday = existing.updatedAt
    ? new Date(existing.updatedAt).toDateString() === todayStr
    : false;

  let newPinned = 1;
  let newScore = existing.score || 0;
  let newUpdatedAt = existing.updatedAt;

  if (!existing.pinned) {
    // First revisit today: pin and score 1
    newScore = 1;
    newUpdatedAt = now;
  } else if (!isCreatedToday && !isUpdatedToday) {
    // Not created today and not updated today: allow +1
    newScore += 1;
    newUpdatedAt = now;
  }

  return { newPinned, newScore, newUpdatedAt };
}

function evaluateIncoming(incoming, watchlist, findExisting) {
  const now = incoming.timestamp || Date.now();

  // 1. Resolve group
  const groupLabel = resolveGroupLabel(incoming.matchedRule, incoming.domain, watchlist);

  // 2. Regex validation
  const groupRules = getGroupRules(groupLabel, watchlist);
  if (groupRules.length > 0 && !matchesRegex(groupRules, incoming.title, incoming.url)) {
    return { action: "drop" };
  }

  // 3. Group domains
  const groupDomains = getGroupDomains(groupLabel, watchlist, incoming.matchedRule);

  // 4. Extract path
  const incomingPath = extractPath(incoming.url);

  // 5. Find existing by path in group
  const existing = findExisting(groupDomains, incomingPath);

  if (existing) {
    // 6. Dedup: same tab within 60s
    if (incoming.tabId === existing.tabId && now - existing.timestamp < 60000) {
      return { action: "ignore" };
    }

    // 7. Daily scoring
    const { newPinned, newScore, newUpdatedAt } = computeDailyScore(existing, now);

    const updated = {
      ...existing,
      url: incoming.url,
      domain: incoming.domain,
      matchedRule: incoming.matchedRule,
      pinned: newPinned,
      score: newScore,
      timestamp: now,
      updatedAt: newUpdatedAt,
    };

    return {
      action: "update",
      record: updated,
      updates: {
        url: incoming.url,
        domain: incoming.domain,
        matchedRule: incoming.matchedRule,
        pinned: newPinned,
        score: newScore,
        timestamp: now,
        updatedAt: newUpdatedAt,
      },
    };
  }

  // 8. New record
  const record = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    url: incoming.url,
    title: incoming.title || "",
    domain: incoming.domain,
    matchedRule: incoming.matchedRule,
    tabId: incoming.tabId,
    timestamp: now,
    favIconUrl: incoming.favIconUrl || "",
    description: incoming.description || "",
    ogImage: incoming.ogImage || "",
  };

  return { action: "insert", record };
}

module.exports = { evaluateIncoming };
