// Agent execution loop — handles multi-turn tool calling with LLM.
// Read tools execute immediately. Write tools go into a pending queue for user approval.
// After approval, results are fed back to the loop.

const {
  getReadTools,
  getWriteTools,
  getOpenAITools,
  getAnthropicTools,
} = require("./tools");

const MAX_ROUNDS = 5;

async function executeToolCalls(toolCalls, toolHandlers) {
  const results = [];
  const newPending = [];

  for (const call of toolCalls) {
    const name = call.name || call.function?.name;
    const argsStr = call.arguments || call.input || "{}";
    let args = {};
    try {
      args = typeof argsStr === "string" ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      results.push({ name, result: { error: "Invalid arguments: " + e.message } });
      continue;
    }

    const handler = toolHandlers[name];
    if (!handler) {
      results.push({ name, result: { error: "Unknown tool: " + name } });
      continue;
    }

    const tool = require("./tools").getTool(name);
    if (tool && tool.category === "write") {
      const action = {
        tool: name,
        args,
        timestamp: Date.now(),
      };
      newPending.push(action);
      results.push({
        name,
        result: {
          pending: true,
          message: "Action queued for user approval.",
        },
      });
    } else {
      try {
        const result = await handler(args);
        results.push({ name, result });
      } catch (e) {
        results.push({ name, result: { error: "Tool execution failed: " + e.message } });
      }
    }
  }

  return { results, newPending };
}

async function agentLoop(
  messages,
  aiConfig,
  callAIFns,
  toolHandlers,
  broadcastFn,
  conversationId,
  dbSaveMessage,
) {
  const tools = require("./tools").getAllTools();
  const openaiTools = getOpenAITools();
  const anthropicTools = getAnthropicTools();

  let rounds = 0;
  let finalContent = null;
  const allPendingActions = [];

  while (rounds < MAX_ROUNDS) {
    rounds++;

    let response;
    const provider = aiConfig.provider;

    if (provider === "openai") {
      response = await callAIFns.callOpenAIWithTools(messages, openaiTools);
    } else if (provider === "anthropic" || provider === "minimax") {
      response = await callAIFns.callAnthropicWithTools(messages, anthropicTools);
    } else {
      response = await callAIFns.callOllamaWithTools(messages, tools);
    }

    const toolCalls = response.tool_calls || [];
    const content = response.content || "";

    if (conversationId && dbSaveMessage) {
      dbSaveMessage(conversationId, rounds, "assistant", content, toolCalls.length > 0 ? toolCalls : null);
    }

    if (toolCalls.length === 0) {
      finalContent = content;
      break;
    }

    const { results, newPending } = await executeToolCalls(toolCalls, toolHandlers);

    if (newPending.length > 0) {
      allPendingActions.push(...newPending);
      messages.push({ role: "assistant", content: null, tool_calls: toolCalls });
      for (let i = 0; i < toolCalls.length; i++) {
        const res = results[i]?.result || { pending: true };
        messages.push({ role: "tool", tool_call_id: toolCalls[i].id || "call_" + i, content: JSON.stringify(res) });
        if (conversationId && dbSaveMessage) {
          dbSaveMessage(conversationId, rounds, "tool", JSON.stringify(res), null, toolCalls[i].id || "call_" + i);
        }
      }
      continue;
    }

    messages.push({ role: "assistant", content: content || null, tool_calls: toolCalls });
    for (let i = 0; i < toolCalls.length; i++) {
      const res = results[i]?.result || {};
      messages.push({ role: "tool", tool_call_id: toolCalls[i].id || "call_" + i, content: JSON.stringify(res) });
      if (conversationId && dbSaveMessage) {
        dbSaveMessage(conversationId, rounds, "tool", JSON.stringify(res), null, toolCalls[i].id || "call_" + i);
      }
    }
  }

  if (!finalContent) {
    finalContent = messages[messages.length - 1]?.content || "";
  }

  return { result: finalContent, pendingActions: allPendingActions };
}

async function executeApprovedActions(actionIds, toolHandlers, getPendingFn) {
  const results = [];
  const pendingActions = getPendingFn ? getPendingFn() : [];

  for (const action of pendingActions) {
    if (actionIds.includes(action.id)) {
      const handler = toolHandlers[action.tool_name || action.tool];
      const args = typeof action.args === "string" ? JSON.parse(action.args) : (action.args || {});
      if (handler) {
        try {
          const result = await handler(args);
          results.push({ action, result });
        } catch (e) {
          results.push({ action, result: { error: e.message } });
        }
      }
    }
  }

  return results;
}

module.exports = {
  agentLoop,
  executeApprovedActions,
};
