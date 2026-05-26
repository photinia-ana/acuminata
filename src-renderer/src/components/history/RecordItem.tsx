import type { HistoryRecord } from "@/electron/api";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { cn } from "@/lib/utils";
import {
  Pin,
  PinOff,
  Minus,
  Plus,
  ExternalLink,
  Check,
} from "lucide-react";

/** 单条记录 — R2.3 / R2.5 / R2.6 */
export function RecordItem({ record }: { record: HistoryRecord }) {
  const watchlist = useAppStore((s) => s.watchlist);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const toggleRecordSelection = useAppStore((s) => s.toggleRecordSelection);
  const togglePin = useAppStore((s) => s.togglePin);
  const t = useLocaleStore((s) => s.t);

  const isSelected = selectedIds.has(record.id);
  const isPinned = record.pinned === 1;

  // 匹配 watchlist 中的颜色
  const entry = watchlist.find(
    (w) => w.domain === record.matchedRule || w.label === record.matchedRule
  );
  const ruleColor = entry?.color ?? "#71717a";

  const handlePin = () => {
    const newPinned = isPinned ? 0 : 1;
    const newScore = newPinned === 1 && !record.score ? 1 : record.score;
    togglePin(record.id, newPinned, newScore);
  };

  const handleScoreChange = (delta: number) => {
    if (!isPinned) return;
    const newScore = Math.max(0, (record.score ?? 0) + delta);
    togglePin(record.id, 1, newScore);
  };

  const handleClick = () => {
    window.electronAPI.openUrl(record.url);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 transition-colors",
        isSelected && "border-primary/30 bg-secondary/30"
      )}
    >
      {/* 选择框 — R2.4 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleRecordSelection(record.id);
        }}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          isSelected
            ? "border-foreground bg-foreground text-background"
            : "border-border hover:border-muted-foreground"
        )}
      >
        {isSelected && <Check size={10} />}
      </button>

      {/* Favicon */}
      {record.favIconUrl ? (
        <img
          src={record.favIconUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-sm"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="h-4 w-4 shrink-0 rounded-sm bg-secondary" />
      )}

      {/* 主体内容 */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={handleClick}
      >
        {/* 标题 */}
        <div className="truncate font-mono text-sm leading-tight">
          {record.title || record.url}
        </div>
        {/* 元信息 */}
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {/* 匹配规则 badge */}
          {record.matchedRule && (
            <span
              className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]"
              style={{ borderColor: ruleColor, color: ruleColor }}
            >
              {record.matchedRule}
            </span>
          )}
          {/* 时间 */}
          <span className="shrink-0">{formatTime(record.timestamp)}</span>
          {/* URL 或描述 */}
          <span className="truncate">
            {record.description
              ? record.description.slice(0, 60)
              : record.url}
          </span>
        </div>
      </div>

      {/* 操作区 — hover 显示 */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {/* 打分 (仅 Pinned) */}
        {isPinned && (
          <div className="flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleScoreChange(-1);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Minus size={10} />
            </button>
            <span className="min-w-[1.5rem] text-center font-mono text-[10px]">
              {record.score ?? 0}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleScoreChange(1);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus size={10} />
            </button>
          </div>
        )}

        {/* Pin/Unpin */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePin();
          }}
          className={cn(
            "flex h-6 items-center gap-1 rounded-md border px-2 font-mono text-[10px] transition-colors",
            isPinned
              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
          title={isPinned ? t("record.pin") : t("record.pinned")}
        >
          {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
          {isPinned ? t("record.pinned") : t("record.pin")}
        </button>

        {/* 打开链接 — R2.6 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Open in browser"
        >
          <ExternalLink size={12} />
        </button>
      </div>

      {/* 始终可见的 Pinned 标识 (非 hover 时) */}
      {isPinned && (
        <span className="shrink-0 text-yellow-500 opacity-100 group-hover:opacity-0">
          ★
        </span>
      )}
    </div>
  );
}

// ── 工具函数 ──

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
