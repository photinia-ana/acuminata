import { create } from "zustand";

/** 国际化状态管理 — R5.1 */

type LocaleCode = "en" | "zh-CN";

interface LocaleStore {
  localeCode: LocaleCode;
  messages: Record<string, string>;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (code: LocaleCode) => Promise<void>;
  loadLocale: () => Promise<void>;
}

export const useLocaleStore = create<LocaleStore>((set, get) => ({
  localeCode: (localStorage.getItem("acuminata-locale") as LocaleCode) || "en",
  messages: {},

  t: (key, params) => {
    let text = get().messages[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  },

  setLocale: async (code) => {
    const api = window.electronAPI;
    if (api?.setLocale) {
      try {
        await api.setLocale(code);
      } catch {
        // 后端可能未实现 — 降级为纯前端
      }
    }
    localStorage.setItem("acuminata-locale", code);
    set({ localeCode: code });
    await get().loadLocale();
  },

  loadLocale: async () => {
    const api = window.electronAPI;
    if (!api?.getLocale) return;
    try {
      const data = await api.getLocale();
      set({ messages: data });
    } catch {
      // 后端可能未实现 — 降级为 key 回退
    }
  },
}));
