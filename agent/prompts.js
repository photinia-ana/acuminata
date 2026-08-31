// Agent prompt builders — pure functions, no side effects.
// Both main.js and extend/background.ts should import from here.

/**
 * Build the analysis prompt for the agent.
 * @param {Array<{title?:string, matchedRule:string, score?:number|null, pinned?:number}>} records
 * @param {Array<{domain:string, label?:string, regexFilter?:string, regexTarget?:string}>} watchlist
 * @returns {string}
 */
function buildAnalysisPrompt(records, watchlist) {
  const ruleToLabel = {};
  watchlist.forEach((w) => {
    ruleToLabel[w.domain] = w.label || w.domain;
  });

  const recordItems = records.map((r) => {
    const label = ruleToLabel[r.matchedRule] || r.matchedRule;
    const title = (r.title || "").slice(0, 80);
    const score = r.score || 0;
    const pinned = r.pinned ? "★" : "";
    return `- [${label}] ${title} (分数:${score} ${pinned})`;
  });

  const patterns = [];
  watchlist.forEach((w) => {
    if (w.regexFilter && w.regexFilter.trim()) {
      patterns.push(
        `  - ${w.label || w.domain}: ${w.regexFilter} (${w.regexTarget})`,
      );
    }
  });

  return (
    "你是一个私人的内容推荐专家。以下是我近期高分收藏的视频记录：\n" +
    recordItems.join("\n") +
    "\n\n" +
    (patterns.length > 0
      ? "我关注的内容模式（正则匹配规则）：\n" + patterns.join("\n") + "\n\n"
      : "") +
    "请执行以下任务：\n" +
    " 1. 用一句话总结我的内容偏好。\n" +
    " 2. 推测 5 个我目前还未看过，但极大概率会感兴趣的相关系列、标签或具体搜索关键词。\n" +
    '   请严格按照 JSON 格式返回结果：{ "summary": "...", "keywords": ["...", "..."] }'
  );
}

/**
 * Build the reflection prompt after a batch delete.
 * @param {Array} deletedRecords
 * @param {Array} sampleKept
 * @returns {string}
 */
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

/**
 * Build the reflection prompt after rejecting a recommendation.
 * @param {{title:string, url:string, domain:string, reason?:string}} rec
 * @param {Array} sampleKept
 * @returns {string}
 */
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

module.exports = {
  buildAnalysisPrompt,
  buildDeleteReflectionPrompt,
  buildRejectReflectionPrompt,
};
