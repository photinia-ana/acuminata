// Self-reflection module — hooks into destructive user actions
// (batch delete, reject recommendation) to learn and update agent memories.
// Memories are stored in agent_memories table, decoupled from settings.
// Prompt builders are imported from agent/prompts.js.

const { buildDeleteReflectionPrompt, buildRejectReflectionPrompt } = require("./prompts");

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
