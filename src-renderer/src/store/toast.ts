import { create } from "zustand";

/** Toast 通知系统 — R5.3 */

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration: number; // ms
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"], duration?: number) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message, type = "success", duration = 3000) => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({
      toasts: [...s.toasts, { id, message, type, duration }],
    }));
    // 自动消失
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** 便捷 hook — 在组件中使用 */
export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  return {
    toast: (message: string, type?: Toast["type"]) => addToast(message, type),
    success: (message: string) => addToast(message, "success"),
    error: (message: string) => addToast(message, "error", 5000),
    info: (message: string) => addToast(message, "info"),
  };
}
