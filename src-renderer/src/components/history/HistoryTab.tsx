import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { FilterBar } from "./FilterBar";
import { RecordList } from "./RecordList";

/** History Tab — Phase 2 */
export function HistoryTab() {
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <h1 className="mb-4 font-mono text-xl font-semibold tracking-tight">
        {t("tab.history")}
      </h1>
      <FilterBar />
      <div className="mt-3 flex-1 overflow-hidden">
        <RecordList />
      </div>
    </div>
  );
}
