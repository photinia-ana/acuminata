import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import type { AiConfig } from "@/electron/api";
import { Bot, Save, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const PROVIDERS: { value: AiConfig["provider"]; label: string }[] = [
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "minimax", label: "MiniMax" },
];

const DEFAULT_CONFIGS: Record<string, Partial<AiConfig>> = {
  ollama: { ollamaEndpoint: "http://127.0.0.1:11434", ollamaModel: "qwen2.5:7b" },
  openai: { openaiEndpoint: "https://api.openai.com/v1", openaiModel: "gpt-4o-mini" },
  anthropic: { anthropicModel: "claude-sonnet-4-20250514" },
  minimax: {},
};

/** AI 提供商配置面板 — R4.1 */
export function AiConfigPanel() {
  const aiConfig = useAppStore((s) => s.aiConfig);
  const fetchAiConfig = useAppStore((s) => s.fetchAiConfig);
  const updateAiConfig = useAppStore((s) => s.updateAiConfig);
  const testAiConnection = useAppStore((s) => s.testAiConnection);
  const t = useLocaleStore((s) => s.t);

  const [form, setForm] = useState<AiConfig>({
    provider: "ollama",
    ollamaEndpoint: "http://127.0.0.1:11434",
    ollamaModel: "qwen2.5:7b",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    openaiEndpoint: "https://api.openai.com/v1",
    anthropicApiKey: "",
    anthropicModel: "claude-sonnet-4-20250514",
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  // 加载配置
  useEffect(() => {
    fetchAiConfig();
  }, [fetchAiConfig]);

  // 同步 store 中的配置到本地表单
  useEffect(() => {
    if (aiConfig) {
      setForm(aiConfig);
    }
  }, [aiConfig]);

  const handleProviderChange = (provider: AiConfig["provider"]) => {
    const defaults = DEFAULT_CONFIGS[provider] ?? {};
    setForm((f) => ({ ...f, provider, ...defaults }));
    setTestResult(null);
    setSaved(false);
  };

  const updateField = (field: keyof AiConfig, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
    setTestResult(null);
  };

  const handleSave = async () => {
    await updateAiConfig(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // 先保存以确保测试使用最新配置
      await updateAiConfig(form);
      const result = await testAiConnection();
      setTestResult({
        ok: result.ok,
        message: result.ok
          ? result.response || "Connection successful"
          : result.error || "Connection failed",
      });
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const { provider } = form;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <Bot size={14} />
        {t("ai.config")}
      </h2>

      {/* Provider 选择 */}
      <div className="mb-4">
        <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
          Provider
        </label>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => handleProviderChange(p.value)}
              className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                provider === p.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`provider.${p.value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Ollama 配置 */}
      {provider === "ollama" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              Endpoint
            </label>
            <input
              type="text"
              value={form.ollamaEndpoint}
              onChange={(e) => updateField("ollamaEndpoint", e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              Model
            </label>
            <input
              type="text"
              value={form.ollamaModel}
              onChange={(e) => updateField("ollamaModel", e.target.value)}
              placeholder="qwen2.5:7b"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* OpenAI 配置 */}
      {provider === "openai" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              Endpoint
            </label>
            <input
              type="text"
              value={form.openaiEndpoint}
              onChange={(e) => updateField("openaiEndpoint", e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              API Key
            </label>
            <input
              type="password"
              value={form.openaiApiKey}
              onChange={(e) => updateField("openaiApiKey", e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              Model
            </label>
            <input
              type="text"
              value={form.openaiModel}
              onChange={(e) => updateField("openaiModel", e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Anthropic 配置 */}
      {provider === "anthropic" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              API Key
            </label>
            <input
              type="password"
              value={form.anthropicApiKey}
              onChange={(e) => updateField("anthropicApiKey", e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[11px] text-muted-foreground">
              Model
            </label>
            <input
              type="text"
              value={form.anthropicModel}
              onChange={(e) => updateField("anthropicModel", e.target.value)}
              placeholder="claude-sonnet-4-20250514"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* MiniMax — 无额外字段，仅 provider 选择 */}

      {/* 操作按钮 */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-4 py-2 font-mono text-xs font-medium transition-colors hover:bg-secondary/80"
        >
          <Save size={13} />
          {saved ? "Saved ✓" : t("ai.config")}
        </button>

        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 font-mono text-xs font-medium transition-colors hover:bg-secondary/60 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : testResult?.ok ? (
            <Wifi size={13} className="text-green-500" />
          ) : (
            <WifiOff size={13} />
          )}
          {testing ? t("ai.testing") : t("ai.testBtn")}
        </button>

        {testResult && (
          <span
            className={`font-mono text-[11px] ${
              testResult.ok ? "text-green-500" : "text-destructive"
            }`}
          >
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}
