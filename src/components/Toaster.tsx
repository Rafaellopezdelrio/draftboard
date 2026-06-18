import { create } from "zustand";
import { useEffect } from "react";
import { i18n } from "../i18n";

export type ToastSeverity = "info" | "warn" | "bad" | "good";

export interface Toast {
  id: number;
  message: string;
  severity: ToastSeverity;
  ttlMs: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, opts?: { severity?: ToastSeverity; ttlMs?: number }) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, opts = {}) => {
    const t: Toast = {
      id: nextId++,
      message,
      severity: opts.severity ?? "info",
      ttlMs: opts.ttlMs ?? 5000,
    };
    set((s) => ({ toasts: [...s.toasts, t] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
    }, t.ttlMs);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(
  message: string,
  opts?: { severity?: ToastSeverity; ttlMs?: number }
) {
  useToastStore.getState().push(message, opts);
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} t={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ t, onClose }: { t: Toast; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, t.ttlMs);
    return () => clearTimeout(id);
  }, [t.ttlMs, onClose]);

  const colors: Record<ToastSeverity, string> = {
    info: "border-border-subtle bg-bg-elev",
    good: "border-good/60 bg-good/15",
    warn: "border-meh/60 bg-meh/15",
    bad: "border-bad/60 bg-bad/15",
  };
  const icons: Record<ToastSeverity, string> = {
    info: "ℹ",
    good: "✓",
    warn: "!",
    bad: "✗",
  };

  return (
    <div
      className={`pointer-events-auto min-w-[280px] max-w-[420px] p-3 rounded border text-sm text-white shadow-lg ${colors[t.severity]} flex items-start gap-2`}
    >
      <span className="text-lg leading-none">{icons[t.severity]}</span>
      <p className="flex-1">{t.message}</p>
      <button
        onClick={onClose}
        className="text-white/40 hover:text-white text-xs"
        aria-label={i18n.t("toast.dismiss")}
      >
        ✕
      </button>
    </div>
  );
}
