"use client";

import { Check, X, SkipForward, Loader2 } from "lucide-react";

interface ProgressItem {
  url: string;
  status: "pending" | "processing" | "done" | "skipped" | "error";
  recipeName?: string;
  reason?: string;
}

interface ImportProgressProps {
  items: ProgressItem[];
  total: number;
  completed: number;
}

export function ImportProgress({
  items,
  total,
  completed,
}: ImportProgressProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted">
          <span>
            {completed} of {total} processed
          </span>
          <span>{percentage}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-tag-bg">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Item list */}
      <div className="max-h-80 overflow-y-auto rounded-lg border border-card-border">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 border-b border-card-border px-4 py-2.5 last:border-b-0 ${
              item.status === "processing" ? "bg-accent/5" : ""
            }`}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {item.status === "pending" && (
                <div className="h-4 w-4 rounded-full border-2 border-card-border" />
              )}
              {item.status === "processing" && (
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
              )}
              {item.status === "done" && (
                <Check className="h-4 w-4 text-success" />
              )}
              {item.status === "skipped" && (
                <SkipForward className="h-4 w-4 text-warning" />
              )}
              {item.status === "error" && (
                <X className="h-4 w-4 text-danger" />
              )}
            </div>

            {/* URL and result */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-foreground">
                {item.recipeName || truncateUrl(item.url)}
              </div>
              {item.recipeName && (
                <div className="truncate text-xs text-muted">
                  {truncateUrl(item.url)}
                </div>
              )}
              {item.reason && (
                <div className="text-xs text-warning">
                  {item.reason}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path =
      parsed.pathname.length > 50
        ? parsed.pathname.slice(0, 47) + "..."
        : parsed.pathname;
    return parsed.hostname + path;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + "..." : url;
  }
}
