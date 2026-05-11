// Self-reflection module — hooks into destructive user actions
// (batch delete, reject recommendation) to learn and update agent memories.
// Memories are stored in agent_memories table, decoupled from settings.

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
    deletedSummary + "\n\n" +
    "用户保留的高价值记录（样本）:\n" +
    keptSummary + "\n\n" +
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
    keptSummary + "\n\n" +
    "请分析用户为什么拒绝这条推荐，并总结出可以避免的规律。\n" +
    "返回严格的 JSON 格式，不要包含任何额外文本：\n" +
    '{ "insight": "一句话总结拒绝原因", "antiPatterns": ["应避免的推荐关键词或模式"], "preferredDomains": { "域名": 0.8 }, "profileUpdate": "简要描述档案变更" }'
  );
}

function applyReflection(memoriesUpsert, reflection, sourceConvId) {
  if (!reflection || typeof reflection !== "object") return;

  const now = Date.now();

  if (reflection.insight) {
    memoriesUpsert("insight", "reflection_" + now, JSON.stringify({
      insight: reflection.insight,
      profileUpdate: reflection.profileUpdate || "",
      time: now,
    }), 0.5, null, JSON.stringify(reflection));
  }

  if (Array.isArray(reflection.antiPatterns)) {
    for (const p of reflection.antiPatterns) {
      if (p && typeof p === "string") {
        memoriesUpsert("anti_pattern", p, p, 0.4, sourceConvId, JSON.stringify(reflection));
      }
    }
  }

  if (reflection.preferredDomains && typeof reflection.preferredDomains === "object") {
    for (const [domain, weight] of Object.entries(reflection.preferredDomains)) {
      const w = Math.min(1, Math.max(0, Number(weight) || 0.5));
      memoriesUpsert("preference", domain, domain, w, sourceConvId, JSON.stringify(reflection));
    }
  }
}

module.exports = {
  buildDeleteReflectionPrompt,
  buildRejectReflectionPrompt,
  applyReflection,
};
