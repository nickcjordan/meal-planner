"use client";

import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { X, Check, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Optional action button (e.g. "Undo"). Clicking it dismisses the toast. */
  action?: ToastAction;
  /** Override the auto-dismiss duration in ms. */
  duration?: number;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  action?: ToastAction;
}

interface ToastContextValue {
  /** Show a toast. Returns its id so callers can dismiss it programmatically. */
  toast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  /** Dismiss a toast by id. */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => "",
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, typeof Check> = {
  success: Check,
  error: X,
  warning: AlertTriangle,
  info: Info,
};

const STYLES: Record<ToastType, string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-accent/30 bg-accent/10 text-accent",
};

// Errors/warnings linger long enough to read and act on; confirmations are brief.
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  warning: 6000,
  error: 8000,
};

// Cap the visible stack; oldest toasts drop off when it overflows.
const MAX_TOASTS = 5;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.type];
  const remainingRef = useRef(toast.duration);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => onDismiss(toast.id), [toast.id, onDismiss]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    clearTimer();
    if (remainingRef.current <= 0) return;
    startRef.current = Date.now();
    timerRef.current = setTimeout(close, remainingRef.current);
  }, [clearTimer, close]);

  const pause = useCallback(() => {
    clearTimer();
    remainingRef.current -= Date.now() - startRef.current;
  }, [clearTimer]);

  useEffect(() => {
    resume();
    return clearTimer;
  }, [resume, clearTimer]);

  const isError = toast.type === "error" || toast.type === "warning";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${STYLES[toast.type]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words text-sm font-medium">{toast.message}</p>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            close();
          }}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold underline-offset-2 transition-colors hover:bg-foreground/5 hover:underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={close}
        aria-label="Dismiss"
        className="mt-0.5 shrink-0 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success", options?: ToastOptions) => {
      const id = String(++nextId);
      const entry: Toast = {
        id,
        message,
        type,
        duration: options?.duration ?? DEFAULT_DURATIONS[type],
        action: options?.action,
      };
      setToasts((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      return id;
    },
    [],
  );

  return (
    <ToastContext value={{ toast, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext>
  );
}
