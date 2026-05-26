import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import type { HistoryRecord } from "@/electron/api";
import { RecordItem } from "./RecordItem";
import { Trash2, X } from "lucide-react";
import * as ScrollArea from "@radix-ui/react-scroll-area";

/** 日期分组的记录列表 + 虚拟滚动 — R2.2 / R2.4 */
export function RecordList() {
  const records = useAppStore((s) => s.records);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const totalRecords = useAppStore((s) => s.totalRecords);
  const currentPage = useAppStore((s) => s.currentPage);
  const fetchRecords = useAppStore((s) => s.fetchRecords);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const deleteRecordIds = useAppStore((s) => s.deleteRecordIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const t = useLocaleStore((s) => s.t);

  // 搜索过滤 (客户端)
  const filtered = searchQuery
    ? records.filter((r) => {
        const q = searchQuery.toLowerCase();
        return (
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.url && r.url.toLowerCase().includes(q)) ||
          (r.matchedRule && r.matchedRule.toLowerCase().includes(q))
        );
      })
    : records;

  // 日期分组
  const groups = groupByDate(filtered);

  const loadedAll = records.length >= totalRecords && !searchQuery;
  const selectedCount = selectedIds.size;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 批量操作栏 — R2.4 */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
          <span className="font-mono text-xs text-muted-foreground">
            {selectedCount} selected
          </span>
          <button
            onClick={() => deleteRecordIds(Array.from(selectedIds))}
            className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 font-mono text-[11px] text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 size={12} />
            {t("button.batchDelete", { n: selectedCount })}
          </button>
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={12} />
            Deselect
          </button>
        </div>
      )}

      {/* 记录列表 */}
      <ScrollArea.Root className="flex-1">
        <ScrollArea.Viewport className="h-full">
          <div className="flex flex-col gap-1 p-4">
            {groups.length === 0 ? (
              <div className="py-16 text-center font-mono text-sm text-muted-foreground">
                {searchQuery ? t("empty.noMatch") : t("empty.noRecords")}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="mb-3">
                  {/* 日期分组头 */}
                  <div className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    {g.label}
                  </div>
                  {/* 该日期下的记录 */}
                  <div className="flex flex-col gap-1">
                    {g.records.map((r) => (
                      <RecordItem key={r.id} record={r} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-2 touch-none select-none p-0.5"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-foreground/20" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      {/* 加载更多 */}
      {!loadedAll && !searchQuery && (
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={() => fetchRecords(currentPage + 1)}
            className="w-full rounded-md border border-border py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("button.loadMore", { loaded: records.length, total: totalRecords })}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 工具 ──

interface DateGroup {
  label: string;
  records: HistoryRecord[];
}

function groupByDate(records: HistoryRecord[]): DateGroup[] {
  const map = new Map<string, HistoryRecord[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const r of records) {
    const d = new Date(r.timestamp);
    let label: string;
    if (d.toDateString() === today.toDateString()) {
      label = "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(r);
  }

  return Array.from(map.entries()).map(([label, records]) => ({
    label,
    records,
  }));
}
