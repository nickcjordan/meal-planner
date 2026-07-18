"use client";

/**
 * Step 3 — "Round Out the Week" (Phase 4).
 *
 * Presentation-only: typed props in, callbacks out. Renders four titled groups
 * in order — Recurring / Assumed On Hand / Suggestions / Extras — porting the
 * legacy MealPlanPanel Extras/Recurring/carryover/Suggestions UX ~1:1 in visual
 * language. SUGGESTION_ICONS/COLORS are copied locally on purpose (legacy dies in
 * Phase 5 — never import from MealPlanPanel).
 */

import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CakeSlice,
  Check,
  Home,
  Lightbulb,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Tag,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import type { RoundoutUI } from "@/lib/wizard";

export interface RoundOutStepProps {
  roundout: RoundoutUI;
  onToggleStaple: (name: string) => void;
  onResolveCarryover: (name: string, status: "confirmed" | "need" | undefined) => void;
  onSuggestionAction: (id: string, action: "accept" | "dismiss") => void;
  onRemoveExtra: (name: string) => void;
  onContinue: () => void;
  onBack: () => void;
  refreshing: boolean;
}

// ─── Legacy suggestion styling (copied from MealPlanPanel; do NOT import) ─────
const SUGGESTION_ICONS: Record<string, typeof Tag> = {
  "deal-meal": Tag,
  "recurring-item": RotateCcw,
  "pattern-detected": TrendingUp,
  "smart-promotion": Sparkles,
  "pantry-promotion": Home,
};

const SUGGESTION_COLORS: Record<string, string> = {
  "deal-meal": "border-danger/30 bg-danger/5",
  "recurring-item": "border-accent/30 bg-accent/5",
  "pattern-detected": "border-info/30 bg-info/5",
  "smart-promotion": "border-warning/30 bg-warning/5",
  "pantry-promotion": "border-success/30 bg-success/5",
};

type Carryover = RoundoutUI["carryovers"][number];
type Staple = RoundoutUI["staples"][number];
type Suggestion = RoundoutUI["suggestions"][number];
type Extra = RoundoutUI["extras"][number];

/** Icon + title + optional count / trailing content for a titled group. */
function SectionTitle({
  icon: Icon,
  iconColor,
  title,
  count,
  children,
}: {
  icon: typeof Tag;
  iconColor: string;
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <Icon className={clsx("h-4 w-4", iconColor)} />
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {count != null && <span className="text-xs text-muted">({count})</span>}
      {children}
    </div>
  );
}

// ─── Recurring ────────────────────────────────────────────────────────────────
function RecurringSection({
  staples,
  onToggleStaple,
}: {
  staples: Staple[];
  onToggleStaple: (name: string) => void;
}) {
  return (
    <section>
      <SectionTitle
        icon={ShoppingBasket}
        iconColor="text-success"
        title="Recurring"
        count={staples.length}
      >
        <Link
          href="/settings/recurring"
          className="ml-auto text-[11px] text-muted transition-colors hover:text-accent"
        >
          Manage →
        </Link>
      </SectionTitle>
      <div className="space-y-2">
        {staples.map((staple) => (
          <label
            key={staple.name}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-card-border bg-background px-3 py-2 transition-colors hover:border-accent/30"
          >
            <input
              type="checkbox"
              checked={staple.accepted}
              onChange={() => onToggleStaple(staple.name)}
              className="h-4 w-4 shrink-0 rounded border-card-border accent-accent"
            />
            <span
              className={clsx(
                "text-sm",
                staple.accepted ? "text-foreground" : "text-muted line-through",
              )}
            >
              {staple.style === "flexible" ? (
                <>
                  <span className="mr-1">🧺</span>
                  {staple.name}
                  {staple.description && (
                    <span className="ml-1 text-xs text-muted">— {staple.description}</span>
                  )}
                </>
              ) : (
                <>
                  {staple.name}
                  {staple.quantity != null && staple.unit && (
                    <span className="ml-1 text-xs text-muted">
                      {staple.quantity} {staple.unit}
                    </span>
                  )}
                </>
              )}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

// ─── Assumed On Hand (carryovers) ─────────────────────────────────────────────
function CarryoverCard({
  item,
  onResolve,
}: {
  item: Carryover;
  onResolve: (name: string, status: "confirmed" | "need" | undefined) => void;
}) {
  const isConfirmed = item.status === "confirmed";
  const isNeeded = item.status === "need";
  const isResolved = isConfirmed || isNeeded;

  return (
    <div
      className={clsx(
        "rounded-lg border p-3",
        isConfirmed
          ? "border-success/20 bg-success/5"
          : isNeeded
            ? "border-accent/20 bg-accent/5"
            : "border-warning/20 bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isConfirmed ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : isNeeded ? (
              <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 shrink-0 text-warning" />
            )}
            <span
              className={clsx(
                "text-sm font-semibold",
                isResolved ? "text-muted" : "text-foreground",
              )}
            >
              {item.name} — ~{item.estimatedQuantity} {item.unit}
            </span>
            {isConfirmed && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-success">
                On hand
              </span>
            )}
            {isNeeded && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Adding to list
              </span>
            )}
          </div>
          {!isResolved && (
            <>
              <p className="ml-5 mt-1 text-xs text-muted">
                Bought {item.source.purchasedQuantity} {item.unit} last week for{" "}
                {item.source.recipeName}. Used ~{item.source.usedQuantity} {item.unit}.
              </p>
              <p className="ml-5 text-xs text-muted">
                Needed for:{" "}
                <span className="text-foreground">
                  {item.neededFor.day}&apos;s {item.neededFor.recipeName}
                </span>{" "}
                ({item.neededFor.requiredQuantity} {item.unit})
              </p>
            </>
          )}
        </div>
        {isResolved ? (
          <button
            onClick={() => onResolve(item.name, undefined)}
            className="shrink-0 rounded-lg border border-card-border px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
          >
            Undo
          </button>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => onResolve(item.name, "confirmed")}
              className="rounded-lg border border-success/30 px-2.5 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10"
            >
              <Check className="mr-1 inline h-3 w-3" />I have this
            </button>
            <button
              onClick={() => onResolve(item.name, "need")}
              className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              <ShoppingCart className="mr-1 inline h-3 w-3" />I need this
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssumedOnHandSection({
  carryovers,
  unresolved,
  onResolve,
}: {
  carryovers: Carryover[];
  unresolved: number;
  onResolve: (name: string, status: "confirmed" | "need" | undefined) => void;
}) {
  return (
    <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="text-sm font-semibold text-warning">Assumed On Hand</span>
        {unresolved > 0 && (
          <Badge color="warning" className="uppercase tracking-wider">
            {unresolved} unresolved
          </Badge>
        )}
        <span className="text-xs text-muted">— These will NOT be on your shopping list</span>
      </div>
      <div className="space-y-3">
        {carryovers.map((item) => (
          <CarryoverCard key={item.name} item={item} onResolve={onResolve} />
        ))}
      </div>
    </section>
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
function SuggestionCard({
  suggestion,
  onAction,
}: {
  suggestion: Suggestion;
  onAction: (id: string, action: "accept" | "dismiss") => void;
}) {
  const Icon = SUGGESTION_ICONS[suggestion.type] ?? Lightbulb;
  const colorClass = SUGGESTION_COLORS[suggestion.type] ?? "border-card-border bg-card";
  return (
    <div className={clsx("rounded-xl border p-3", colorClass)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{suggestion.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">{suggestion.description}</p>
          <p className="mt-1 text-[10px] italic text-muted/70">{suggestion.rationale}</p>
        </div>
        <button
          onClick={() => onAction(suggestion.id, "dismiss")}
          className="shrink-0 rounded-lg p-1 text-muted/50 transition-colors hover:bg-background/50 hover:text-foreground"
          title="Dismiss suggestion"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        onClick={() => onAction(suggestion.id, "accept")}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-card-border bg-background py-1.5 text-xs font-medium text-accent transition-colors hover:bg-tag-bg"
      >
        <Plus className="h-3 w-3" /> Add to plan
      </button>
    </div>
  );
}

function SuggestionsSection({
  suggestions,
  onAction,
}: {
  suggestions: Suggestion[];
  onAction: (id: string, action: "accept" | "dismiss") => void;
}) {
  return (
    <section>
      <SectionTitle icon={Lightbulb} iconColor="text-warning" title="Suggestions" />
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
        {suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}

// ─── Extras ───────────────────────────────────────────────────────────────────
function ExtrasSection({
  extras,
  onRemoveExtra,
}: {
  extras: Extra[];
  onRemoveExtra: (name: string) => void;
}) {
  return (
    <section>
      <SectionTitle
        icon={CakeSlice}
        iconColor="text-info"
        title="Extras"
        count={extras.length || undefined}
      />
      {extras.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          {extras.map((extra) => (
            <div
              key={extra.name}
              className="rounded-xl border border-card-border bg-background p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{extra.name}</span>
                <button
                  onClick={() => onRemoveExtra(extra.name)}
                  className="text-muted/60 transition-colors hover:text-danger"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {extra.description && (
                <p className="mt-1 text-[11px] text-muted">{extra.description}</p>
              )}
              <p className="mt-1.5 text-[11px] text-accent">
                {extra.ingredients.length} ingredient{extra.ingredients.length !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-card-border bg-background/50 px-4 py-3 text-sm text-muted">
          <MessageSquare className="h-4 w-4 shrink-0 text-muted/70" />
          <span>Want dessert, snacks, or party food? Ask in chat →</span>
        </div>
      )}
    </section>
  );
}

// ─── Step ─────────────────────────────────────────────────────────────────────
export function RoundOutStep({
  roundout,
  onToggleStaple,
  onResolveCarryover,
  onSuggestionAction,
  onRemoveExtra,
  onContinue,
  onBack,
  refreshing,
}: RoundOutStepProps) {
  // Accepted/dismissed suggestions drop out — `onSuggestionAction` has no
  // "reopen" action, so an accepted card can't offer an undo (see report).
  const openSuggestions = roundout.suggestions.filter((s) => s.state === "open");
  const unresolved = roundout.carryovers.filter((c) => !c.status).length;

  const hasStaples = roundout.staples.length > 0;
  const hasCarryovers = roundout.carryovers.length > 0;
  const hasSuggestions = openSuggestions.length > 0;
  const hasExtras = roundout.extras.length > 0;
  const allEmpty = !hasStaples && !hasCarryovers && !hasSuggestions && !hasExtras;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShoppingBasket className="h-5 w-5 text-success" />
          <h2 className="text-lg font-bold text-foreground">Round Out the Week</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Recurring items, things you may already have, and smart extras.
        </p>
      </div>

      {/* Panel */}
      <div className="relative min-h-0 flex-1">
        <Card padding="lg" className="h-full overflow-y-auto" aria-busy={refreshing}>
          {allEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
              <Sparkles className="h-8 w-8 text-success" />
              <p className="text-sm font-semibold text-foreground">
                Nothing extra needed this week
              </p>
              <p className="max-w-xs text-xs text-muted">
                No recurring staples are due, nothing carries over, and there are no extra
                suggestions. Want to add dessert or snacks? Ask in chat.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {hasStaples && (
                <RecurringSection staples={roundout.staples} onToggleStaple={onToggleStaple} />
              )}
              {hasCarryovers && (
                <AssumedOnHandSection
                  carryovers={roundout.carryovers}
                  unresolved={unresolved}
                  onResolve={onResolveCarryover}
                />
              )}
              {hasSuggestions && (
                <SuggestionsSection suggestions={openSuggestions} onAction={onSuggestionAction} />
              )}
              <ExtrasSection extras={roundout.extras} onRemoveExtra={onRemoveExtra} />
            </div>
          )}
        </Card>

        {/* Refreshing overlay — the prefetched roundout was stale and is being
            refetched in the foreground. */}
        {refreshing && (
          <div
            className="absolute inset-0 overflow-hidden rounded-xl bg-card/60"
            aria-live="polite"
            aria-label="Updating"
          >
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="absolute inset-x-0 top-8 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-card-border bg-background px-4 py-2 text-sm text-muted shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Updating for your latest changes…
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {unresolved > 0 && (
            <Badge color="warning" title="You can still continue — resolve these later if you like">
              {unresolved} to review
            </Badge>
          )}
          <Button variant="primary" onClick={onContinue}>
            Review &amp; Confirm <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
