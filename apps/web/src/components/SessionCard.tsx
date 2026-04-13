"use client";

import Link from "next/link";
import type { PlanningSession } from "@meal-planner/types";
import { Calendar } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted/20 text-muted",
  confirmed: "bg-accent/20 text-accent",
  completed: "bg-success/20 text-success",
};

export function SessionCard({ session }: { session: PlanningSession }) {
  return (
    <Link
      href={`/history/${session.id}`}
      className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-5 shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
    >
      <Calendar className="mt-0.5 h-6 w-6 shrink-0 text-muted" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            Week of{" "}
            {new Date(session.weekOf).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[session.status] ?? STATUS_STYLES.draft}`}
          >
            {session.status}
          </span>
        </div>
        <div className="mt-1 text-sm text-muted">
          {session.meals.length} meal{session.meals.length !== 1 ? "s" : ""} planned
        </div>
        {session.summary && (
          <p className="mt-1.5 text-sm text-muted line-clamp-2">{session.summary}</p>
        )}
      </div>
    </Link>
  );
}
