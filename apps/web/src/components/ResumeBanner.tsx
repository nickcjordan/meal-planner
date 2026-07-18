"use client";

import { RotateCcw, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/chat";

interface ResumeBannerProps {
  /** ISO timestamp of when the restored session was last persisted (may be null for legacy sessions). */
  savedAt: string | null;
  /** Discard the restored plan and start fresh. */
  onDiscard: () => void;
  /** Hide the banner without touching the restored plan. */
  onDismiss: () => void;
}

/**
 * Inline notice shown when an in-progress plan is restored from localStorage, so
 * a stale half-finished plan is never mistaken for a fresh one. Offers a quick
 * Discard and a dismiss.
 */
export function ResumeBanner({ savedAt, onDiscard, onDismiss }: ResumeBannerProps) {
  const rel = formatRelativeTime(savedAt);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
      <RotateCcw className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        Resumed your in-progress plan{rel ? ` from ${rel}` : ""}.
      </span>
      <button
        onClick={onDiscard}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-danger underline-offset-2 transition-colors hover:bg-danger/10 hover:underline"
      >
        Discard
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
