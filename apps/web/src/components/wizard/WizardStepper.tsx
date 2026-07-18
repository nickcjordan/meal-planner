"use client";

import { Check } from "lucide-react";
import { formatWeekOf } from "@/lib/week";

export interface WizardStepperProps {
  step: 1 | 2 | 3 | 4;
  weekOf: string;
  /** Navigate to an already-completed step (state preserved). Forward nav is
   *  Continue-only, so calls for a not-yet-reached step are ignored. */
  onNavigate: (step: 1 | 2 | 3 | 4) => void;
}

const STEPS: { n: 1 | 2 | 3 | 4; label: string }[] = [
  { n: 1, label: "Pick meals" },
  { n: 2, label: "Schedule" },
  { n: 3, label: "Round out" },
  { n: 4, label: "Review" },
];

export function WizardStepper({ step, weekOf, onNavigate }: WizardStepperProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-border bg-card px-4 py-3 shadow-sm">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const completed = s.n < step;
          const current = s.n === step;
          const clickable = completed;
          return (
            <li key={s.n} className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => clickable && onNavigate(s.n)}
                disabled={!clickable && !current}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                  current
                    ? "text-foreground"
                    : completed
                      ? "text-muted hover:bg-tag-bg hover:text-foreground"
                      : "cursor-default text-muted/50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    current
                      ? "bg-accent text-white"
                      : completed
                        ? "bg-success/20 text-success"
                        : "bg-tag-bg text-muted/60"
                  }`}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className={`h-px w-4 sm:w-8 ${s.n < step ? "bg-success/40" : "bg-card-border"}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
      <span className="text-sm text-muted">
        Week of {formatWeekOf(weekOf, { month: "long", day: "numeric" })}
      </span>
    </div>
  );
}
