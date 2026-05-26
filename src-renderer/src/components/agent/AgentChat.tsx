import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import type { AgentMessage } from "@/store";
import { Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Agent 对话区 — R3.1 */
export function AgentChat() {
  const agentLoading = useAppStore((s) => s.agentLoading);
  const agentMessages = useAppStore((s) => s.agentMessages);
  const triggerAnalysis = useAppStore((s) => s.triggerAnalysis);
  const t = useLocaleStore((s) => s.t);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd || agentLoading) return;
    setInput("");
    triggerAnalysis(cmd);
  };

  const handleQuickAnalyze = () => {
    if (agentLoading) return;
    triggerAnalysis();
  };

  return (
    <div className="flex h-full flex-col">
      {/* 终端式消息流 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-black/40 p-4 font-mono text-sm"
      >
        {agentMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">
              {t("agent.chatPlaceholder")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {agentMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {agentLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                <span>{t("ai.loading")}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div className="border-t border-border bg-card p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("agent.inputPlaceholder")}
            disabled={agentLoading}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={agentLoading || !input.trim()}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Send size={13} />
            {t("agent.send")}
          </button>
          <button
            type="button"
            onClick={handleQuickAnalyze}
            disabled={agentLoading}
            className="flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-3 py-2 font-mono text-xs text-purple-400 transition-colors hover:bg-purple-500/20 disabled:opacity-50"
          >
            <Sparkles size={13} />
            {t("ai.trigger")}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── 子组件 ──

function ChatMessage({ message }: { message: AgentMessage }) {
  const t = useLocaleStore((s) => s.t);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        isUser && "border-blue-500/30 bg-blue-500/5 text-foreground",
        isSystem && "border-border bg-card text-muted-foreground",
        message.role === "agent" && "border-purple-500/30 bg-purple-500/5 text-foreground",
      )}
    >
      {/* 角色标签 */}
      <div className="mb-1 flex items-center gap-2">
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-widest",
            isUser && "text-blue-400",
            isSystem && "text-muted-foreground",
            message.role === "agent" && "text-purple-400",
          )}
        >
          {isUser ? `➜ ${t("agent.roleUser")}` : isSystem ? `[${t("agent.roleSystem")}]` : `✨ ${t("agent.roleAgent")}`}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* 内容 */}
      <div className="whitespace-pre-wrap break-words text-sm">
        {message.content}
      </div>

      {/* 关键词标签 (仅 Agent 消息) */}
      {message.keywords && message.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 font-mono text-[11px] text-purple-300"
            >
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
