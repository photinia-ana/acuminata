import { useLocaleStore } from "@/store/locale";
import { Globe, Check } from "lucide-react";

/** 语言切换器 — R4.2 + R5.1 绑定 store */
export function LocaleSwitcher() {
  const localeCode = useLocaleStore((s) => s.localeCode);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <Globe size={14} />
        {t("lang.selector")}
      </h2>

      <div className="flex gap-2">
        <button
          onClick={() => setLocale("en")}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
            localeCode === "en"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          {localeCode === "en" && <Check size={12} />}
          English
        </button>
        <button
          onClick={() => setLocale("zh-CN")}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
            localeCode === "zh-CN"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          {localeCode === "zh-CN" && <Check size={12} />}
          中文
        </button>
      </div>
    </div>
  );
}
