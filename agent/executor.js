// Agent execution loop — handles multi-turn tool calling with LLM.
// Read tools execute immediately. Write tools go into a pending queue for user approval.
// After approval, results are fed back to the loop.

const { getReadTools, getWriteTools, getOpenAITools, getAnthropicTools } = require("./tools");

const MAX_ROUNDS = 5;

let pendingActions = [];

function getPendingActions() {
  return pendingActions;
}

function clearPendingActions() {
  pendingActions = [];
}

function addPendingAction(action) {
  pendingActions.push(action);
}

async function executeToolCalls(toolCalls, toolHandlers, broadcastFn) {
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
      // Queue write actions for user approval
      const action = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tool: name, args, timestamp: Date.now() };
      newPending.push(action);
      results.push({ name, result: { pending: true, action_id: action.id, message: "Action queued for user approval." } });
    } else {
      // Execute read tools immediately
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

async function agentLoop(messages, aiConfig, callAIFns, toolHandlers, broadcastFn) {
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
      // Ollama fallback: use JSON-mode prompt for tool calling
      response = await callAIFns.callOllamaWithTools(messages, tools);
    }

    const toolCalls = response.tool_calls || [];
    const content = response.content || "";

    // If no tool calls, the agent is done
    if (toolCalls.length === 0) {
      finalContent = content;
      break;
    }

    // Execute tool calls
    const { results, newPending } = await executeToolCalls(toolCalls, toolHandlers, broadcastFn);

    if (newPending.length > 0) {
      allPendingActions.push(...newPending);
      // Add pending results to messages so the agent knows actions are queued
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      });
      for (let i = 0; i < toolCalls.length; i++) {
        messages.push({
          role: "tool",
          tool_call_id: toolCalls[i].id || ("call_" + i),
          content: JSON.stringify(results[i]?.result || { pending: true }),
        });
      }
      // Agent continues loop with pending knowledge
      continue;
    }

    // Append assistant message with tool calls
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls,
    });

    // Append tool results
    for (let i = 0; i < toolCalls.length; i++) {
      messages.push({
        role: "tool",
        tool_call_id: toolCalls[i].id || ("call_" + i),
        content: JSON.stringify(results[i]?.result || {}),
      });
    }
  }

  if (!finalContent) {
    finalContent = messages[messages.length - 1]?.content || "";
  }

  return { result: finalContent, pendingActions: allPendingActions };
}

async function executeApprovedActions(actionIds, toolHandlers, broadcastFn) {
  const results = [];
  const remaining = [];

  for (const action of pendingActions) {
    if (actionIds.includes(action.id)) {
      const handler = toolHandlers[action.tool];
      if (handler) {
        try {
          const result = await handler(action.args);
          results.push({ action, result });
        } catch (e) {
          results.push({ action, result: { error: e.message } });
        }
      }
    } else {
      remaining.push(action);
    }
  }

  pendingActions = remaining;
  return results;
}

module.exports = {
  agentLoop,
  getPendingActions,
  clearPendingActions,
  addPendingAction,
  executeApprovedActions,
};
