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

// 新增 broadcastFn 参数，用于在执行具体工具时向前端汇报进度
async function executeToolCalls(toolCalls, toolHandlers, broadcastFn) {
  const results = [];
  const newPending = [];

  for (const call of toolCalls) {
    const name = call.name || call.function?.name;

    // 📢 广播：准备执行工具
    if (broadcastFn) {
      broadcastFn({
        type: "agent_status",
        status: "running",
        message: `> 正在执行工具: ${name}...`,
      });
    }

    const argsStr = call.arguments || call.input || "{}";
    let args = {};
    try {
      args = typeof argsStr === "string" ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      results.push({
        name,
        result: { error: "Invalid arguments: " + e.message },
      });
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
      // 📢 广播：拦截到需要审批的高危操作
      if (broadcastFn) {
        broadcastFn({
          type: "agent_status",
          status: "pending",
          message: `> 拦截到敏感写入操作 [${name}]，已置入护栏队列等待您的审批。`,
        });
      }
    } else {
      try {
        const result = await handler(args);
        results.push({ name, result });
        // 📢 广播：工具执行完成
        if (broadcastFn) {
          broadcastFn({
            type: "agent_status",
            status: "success",
            message: `> 工具 [${name}] 执行完毕。`,
          });
        }
      } catch (e) {
        results.push({
          name,
          result: { error: "Tool execution failed: " + e.message },
        });
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

  // 📢 广播：唤醒 Agent
  if (broadcastFn) {
    broadcastFn({
      type: "agent_status",
      status: "start",
      message: `[系统] Agent 已唤醒，正在分析您的浏览拓扑...`,
    });
  }

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // 📢 广播：思考中
    if (broadcastFn) {
      broadcastFn({
        type: "agent_status",
        status: "thinking",
        message: `[第 ${rounds} 轮] 正在思考推理策略...`,
      });
    }

    let response;
    const provider = aiConfig.provider;

    if (provider === "openai") {
      response = await callAIFns.callOpenAIWithTools(messages, openaiTools);
    } else if (provider === "anthropic" || provider === "minimax") {
      response = await callAIFns.callAnthropicWithTools(
        messages,
        anthropicTools,
      );
    } else {
      response = await callAIFns.callOllamaWithTools(messages, tools);
    }

    const toolCalls = response.tool_calls || [];
    const content = response.content || "";

    if (conversationId && dbSaveMessage) {
      dbSaveMessage(
        conversationId,
        rounds,
        "assistant",
        content,
        toolCalls.length > 0 ? toolCalls : null,
      );
    }

    if (toolCalls.length === 0) {
      finalContent = content;
      // 📢 广播：分析结束
      if (broadcastFn) {
        broadcastFn({
          type: "agent_status",
          status: "done",
          message: `[完成] 思考结束，分析报告已生成。`,
        });
      }
      break;
    }

    // 📢 广播：打算调用工具
    if (broadcastFn) {
      const names = toolCalls.map((c) => c.name || c.function?.name).join(", ");
      broadcastFn({
        type: "agent_status",
        status: "planning",
        message: `[计划] 决定调用 ${toolCalls.length} 个工具: ${names}`,
      });
    }

    // 将 broadcastFn 传给执行器
    const { results, newPending } = await executeToolCalls(
      toolCalls,
      toolHandlers,
      broadcastFn,
    );

    if (newPending.length > 0) {
      allPendingActions.push(...newPending);
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      });
      for (let i = 0; i < toolCalls.length; i++) {
        const res = results[i]?.result || { pending: true };
        messages.push({
          role: "tool",
          tool_call_id: toolCalls[i].id || "call_" + i,
          content: JSON.stringify(res),
        });
        if (conversationId && dbSaveMessage) {
          dbSaveMessage(
            conversationId,
            rounds,
            "tool",
            JSON.stringify(res),
            null,
            toolCalls[i].id || "call_" + i,
          );
        }
      }
      // 📢 广播：触发断点
      if (broadcastFn) {
        broadcastFn({
          type: "agent_status",
          status: "paused",
          message: `[暂停] 流程已挂起，等待您审批队列中的操作...`,
        });
      }
      continue;
    }

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls,
    });
    for (let i = 0; i < toolCalls.length; i++) {
      const res = results[i]?.result || {};
      messages.push({
        role: "tool",
        tool_call_id: toolCalls[i].id || "call_" + i,
        content: JSON.stringify(res),
      });
      if (conversationId && dbSaveMessage) {
        dbSaveMessage(
          conversationId,
          rounds,
          "tool",
          JSON.stringify(res),
          null,
          toolCalls[i].id || "call_" + i,
        );
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
      const args =
        typeof action.args === "string"
          ? JSON.parse(action.args)
          : action.args || {};
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
