import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { cn } from "@/lib/utils";
import type { Stats } from "@/electron/api";

/** 统计数字卡片 — R1.1 */
export function StatsCards() {
  const stats = useAppStore((s) => s.stats);
  const enabled = useAppStore((s) => s.enabled);
  const t = useLocaleStore((s) => s.t);

  const cards: { label: string; value: string | number; accent?: boolean }[] = [
    { label: t("stats.totalRecords"), value: stats?.totalRecords ?? 0 },
    { label: t("stats.today"), value: stats?.todayRecords ?? 0 },
    { label: t("stats.sites"), value: stats?.trackedSites ?? 0 },
    {
      label: enabled ? t("header.tracking") : t("header.paused"),
      value: enabled ? "ON" : "OFF",
      accent: enabled,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-2xl font-semibold",
          accent && "text-green-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}
