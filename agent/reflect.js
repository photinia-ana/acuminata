// Self-reflection module — hooks into destructive user actions
// (batch delete, reject recommendation) to learn and update agent profile.

const AGENT_PROFILE_KEY = "agent.profile";

const DEFAULT_PROFILE = {
  preferredDomains: {},
  antiPatterns: [],
  domainHealth: {},
  reflectionLog: [],
  updatedAt: null,
};

function getAgentProfile(dbGet, dbRun) {
  const row = dbGet("SELECT value FROM settings WHERE key = ?", [AGENT_PROFILE_KEY]);
  if (!row) {
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      AGENT_PROFILE_KEY,
      JSON.stringify(DEFAULT_PROFILE),
    ]);
    return { ...DEFAULT_PROFILE };
  }
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return { ...DEFAULT_PROFILE };
  }
}

function saveAgentProfile(profile, dbRun) {
  profile.updatedAt = Date.now();
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    AGENT_PROFILE_KEY,
    JSON.stringify(profile),
  ]);
}

function buildDeleteReflectionPrompt(deletedRecords, sampleKept) {
  const deletedSummary = deletedRecords
    .slice(0, 20)
    .map((r) => `- [${r.matchedRule}] ${(r.title || r.url).slice(0, 80)}`)
    .join("\n");
  const keptSummary = sampleKept
    .slice(0, 10)
    .map((r) => `- [${r.matchedRule}] ${(r.title || r.url).slice(0, 80)} (score:${r.score || 0})`)
    .join("\n");

  return (
    "你是一个学习用户偏好的智能代理。用户刚刚删除了以下浏览记录:\n" +
    deletedSummary +
    "\n\n" +
    "用户保留的高价值记录（样本）:\n" +
    keptSummary +
    "\n\n" +
    "请分析用户为什么删除这些记录（而不是保留它们），并将分析结果更新到用户档案。\n" +
    "返回严格的 JSON 格式，不要包含任何额外文本：\n" +
    '{ "insight": "一句话总结用户的删除意图", "antiPatterns": ["新增的负面偏好关键词或模式"], "preferredDomains": { "域名": 0.8 }, "profileUpdate": "简要描述档案变更" }'
  );
}

function buildRejectReflectionPrompt(rec, sampleKept) {
  const keptSummary = sampleKept
    .slice(0, 10)
    .map((r) => `- [${r.matchedRule}] ${(r.title || r.url).slice(0, 80)} (score:${r.score || 0})`)
    .join("\n");

  return (
    "你是一个学习用户偏好的智能代理。用户拒绝了一条 AI 推荐：\n" +
    `- 标题: ${rec.title}\n` +
    `- URL: ${rec.url}\n` +
    `- 域名: ${rec.domain}\n` +
    `- 推荐理由: ${rec.reason || "无"}\n\n` +
    "用户保留的高价值记录（样本）:\n" +
    keptSummary +
    "\n\n" +
    "请分析用户为什么拒绝这条推荐，并总结出可以避免的规律。\n" +
    "返回严格的 JSON 格式，不要包含任何额外文本：\n" +
    '{ "insight": "一句话总结拒绝原因", "antiPatterns": ["应避免的推荐关键词或模式"], "preferredDomains": { "域名": 0.8 }, "profileUpdate": "简要描述档案变更" }'
  );
}

function applyReflection(profile, reflection) {
  if (!reflection || typeof reflection !== "object") return profile;

  if (reflection.insight) {
    profile.reflectionLog.unshift({
      time: Date.now(),
      insight: reflection.insight,
      profileUpdate: reflection.profileUpdate || "",
    });
    if (profile.reflectionLog.length > 50) {
      profile.reflectionLog = profile.reflectionLog.slice(0, 50);
    }
  }

  if (Array.isArray(reflection.antiPatterns)) {
    for (const p of reflection.antiPatterns) {
      if (p && !profile.antiPatterns.includes(p)) {
        profile.antiPatterns.push(p);
      }
    }
    if (profile.antiPatterns.length > 30) {
      profile.antiPatterns = profile.antiPatterns.slice(-30);
    }
  }

  if (reflection.preferredDomains && typeof reflection.preferredDomains === "object") {
    for (const [domain, weight] of Object.entries(reflection.preferredDomains)) {
      const old = profile.preferredDomains[domain] || 0;
      profile.preferredDomains[domain] = Math.min(1, Math.max(0, old + weight * 0.3));
    }
  }

  return profile;
}

module.exports = {
  getAgentProfile,
  saveAgentProfile,
  buildDeleteReflectionPrompt,
  buildRejectReflectionPrompt,
  applyReflection,
  DEFAULT_PROFILE,
  AGENT_PROFILE_KEY,
};
