import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** 筛选栏 — R2.1: 搜索框 + 域名/标签筛选 chips + Pinned */
export function FilterBar() {
  const activeFilter = useAppStore((s) => s.activeFilter);
  const setFilter = useAppStore((s) => s.setFilter);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const stats = useAppStore((s) => s.stats);
  const watchlist = useAppStore((s) => s.watchlist);
  const t = useLocaleStore((s) => s.t);

  // 域名计数 — 从 stats.domainCounts 提取
  const domainCounts = stats?.domainCounts ?? {};
  const domains = Object.keys(domainCounts);

  return (
    <div className="flex flex-col gap-3">
      {/* 搜索框 */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 筛选 chips */}
      <div className="flex flex-wrap gap-1.5">
        {/* All */}
        <FilterChip
          active={activeFilter === "all"}
          onClick={() => setFilter("all")}
        >
          {t("filter.all")}
        </FilterChip>

        {/* Pinned */}
        <FilterChip
          active={activeFilter === "pinned"}
          onClick={() => setFilter("pinned")}
          accent
        >
          {t("filter.pinned")}
        </FilterChip>

        {/* 各域名 / 标签 — 带计数 */}
        {domains.map((d) => {
          // 尝试匹配 watchlist 中的颜色
          const entry = watchlist.find(
            (w) => w.domain === d || w.label === d
          );
          return (
            <FilterChip
              key={d}
              active={activeFilter === d}
              onClick={() => setFilter(d)}
              color={entry?.color}
            >
              {d}{" "}
              <span className="opacity-50">{domainCounts[d]}</span>
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  accent,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accent?: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors",
        active
          ? "border-foreground/30 bg-secondary text-foreground"
          : "border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
        accent && !active && "border-yellow-500/40 text-yellow-500/80"
      )}
      style={color && !active ? { borderColor: color } : undefined}
    >
      {children}
    </button>
  );
}
