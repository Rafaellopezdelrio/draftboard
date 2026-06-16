// Centralised toast notification system. Stacked top-right, auto-dismiss
// (configurable per toast), keyboard-accessible (Esc closes last), with
// 4 variants: info / success / warn / error. Replaces inline status
// strings (the "¡Copiado!" text in About, the inline status in Diagnostics,
// etc) — toasts are non-blocking so the user can keep working while a
// background event resolves.
//
// Usage:
//   import { useToast } from "./ui/ToastContainer";
//   const { push } = useToast();
//   push({ type: "success", title: "Build aplicada", detail: "Tu LoL la verá en el shop." });

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { addBreadcrumb } from "../../services/sentry";

export type ToastType = "info" | "success" | "warn" | "error";

/** Map our toast type onto Sentry's SeverityLevel vocabulary so the
 * breadcrumb timeline in the dashboard colours rows correctly. */
function toastTypeToSeverity(t: ToastType): "info" | "warning" | "error" {
  if (t === "error") return "error";
  if (t === "warn") return "warning";
  return "info";
}

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  detail?: string;
  /** Auto-dismiss after this many ms. 0 = sticky until manually closed.
   *  Default: 4000 (4s). Errors default to 6000 (6s). */
  durationMs?: number;
  /** Optional action button — e.g. "Reintentar", "Ver" */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft-fallback: outside a provider (tests, browser previews) we
    // log instead of throwing. Lets components freely call `useToast`
    // without forcing every render path to mount the provider.
    return {
      push: (t) => {
        // eslint-disable-next-line no-console
        console.info(`[toast/${t.type}] ${t.title}${t.detail ? " — " + t.detail : ""}`);
        return 0;
      },
      dismiss: () => {},
      dismissAll: () => {},
    };
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      const dur =
        t.durationMs !== undefined
          ? t.durationMs
          : t.type === "error"
            ? 6000
            : 4000;
      setToasts((prev) => [...prev, { ...t, id }]);
      if (dur > 0) {
        setTimeout(() => dismiss(id), dur);
      }
      // Breadcrumb so any subsequent Sentry event captures the last few
      // user-facing messages. Massive debug value: a crash report no
      // longer arrives blind — we see "toast: 'No se pudo cargar op.gg'"
      // 200ms before the exception, etc. Capped detail length so a
      // verbose toast doesn't bloat the breadcrumb buffer (max 100 by
      // default in Sentry).
      addBreadcrumb({
        category: "toast",
        level: toastTypeToSeverity(t.type),
        message: t.title,
        data: t.detail ? { detail: String(t.detail).slice(0, 160) } : undefined,
      });
      return id;
    },
    [dismiss]
  );

  const dismissAll = useCallback(() => setToasts([]), []);

  // Esc closes the most recent toast.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toasts.length > 0) {
        dismiss(toasts[toasts.length - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toasts, dismiss]);

  const { t } = useTranslation();

  return (
    <ToastContext.Provider value={{ push, dismiss, dismissAll }}>
      {children}
      {/* Fixed top-right stack. z-[90] sits above modals (z-[70]/80) so
          a toast is always reachable even when a dialog is open. */}
      <div
        role="region"
        aria-label={t("toast.region")}
        aria-live="polite"
        className="fixed top-4 right-4 z-[90] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const variants: Record<
    ToastType,
    { ring: string; bg: string; text: string; Icon: typeof Info }
  > = {
    info: { ring: "ring-white/30", bg: "bg-bg-card/95", text: "text-white", Icon: Info },
    success: { ring: "ring-good/40", bg: "bg-good/10", text: "text-good", Icon: CheckCircle2 },
    warn: { ring: "ring-meh/40", bg: "bg-meh/10", text: "text-meh", Icon: AlertTriangle },
    error: { ring: "ring-bad/40", bg: "bg-bad/15", text: "text-bad", Icon: AlertCircle },
  };
  const v = variants[toast.type];
  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className={`pointer-events-auto rounded-lg ring-1 ${v.ring} ${v.bg} shadow-2xl p-3 flex items-start gap-2 animate-[scaleIn_180ms_ease-out]`}
    >
      <v.Icon className={`w-4 h-4 shrink-0 mt-0.5 ${v.text}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${v.text}`}>{toast.title}</p>
        {toast.detail && (
          <p className="text-xs text-white/70 mt-0.5 leading-snug">{toast.detail}</p>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className={`mt-1.5 text-[10px] uppercase tracking-widest font-semibold ${v.text} hover:underline`}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label={t("toast.dismiss")}
        className="text-white/40 hover:text-white shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
