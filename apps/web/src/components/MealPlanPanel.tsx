"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  ShoppingCart,
  ArrowRightLeft,
  History,
  CakeSlice,
  X,
  AlertTriangle,
  Lightbulb,
  ShoppingBasket,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  TrendingUp,
  Home,
  ChevronDown,
} from "lucide-react";
import type { MealProposal, ProposedAdaptation, ProposedSuggestion, MealAlternativesPayload, AlternativeMeal } from "@meal-planner/agent";
import { formatWeekOf } from "@/lib/week";

const DAY_SHORT: Record<string, string> = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

const DAY_FULL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const COMPLEXITY_STYLES: Record<string, { bg: string; text: string; label: string; stripe: string }> = {
  staple: { bg: "bg-success/15", text: "text-success", label: "Staple", stripe: "border-l-success/70" },
  standard: { bg: "bg-accent/15", text: "text-accent", label: "Standard", stripe: "border-l-accent/70" },
  involved: { bg: "bg-warning/15", text: "text-warning", label: "Involved", stripe: "border-l-warning/70" },
};

const SUGGESTION_ICONS: Record<string, typeof Tag> = {
  "deal-meal": Tag,
  "recurring-item": RotateCcw,
  "pattern-detected": TrendingUp,
  "smart-promotion": Sparkles,
  "pantry-promotion": Home,
};

const SUGGESTION_COLORS: Record<string, string> = {
  "deal-meal": "border-red-500/30 bg-red-500/5",
  "recurring-item": "border-accent/30 bg-accent/5",
  "pattern-detected": "border-purple-500/30 bg-purple-500/5",
  "smart-promotion": "border-amber-500/30 bg-amber-500/5",
  "pantry-promotion": "border-green-500/30 bg-green-500/5",
};

interface MealPlanPanelProps {
  proposal: MealProposal;
  weekOf: string;
  excludedIngredients?: Set<string>;
  alternatives?: MealAlternativesPayload | null;
  respinLoading?: boolean;
  streaming?: boolean;
  onRequestRespin?: (selectedSlots: Array<{ day: string; mealType: string }>) => void;
  onConfirmRespinPicks?: (picks: Array<{ day: string; mealType: string; picked: AlternativeMeal }>) => void;
  onCancelRespin?: () => void;
  onRequestSwap: (day: string, mealType: string, complexity?: string) => void;
  onRemoveExtra: (extraName: string) => void;
  onRemoveStaple: (stapleName: string) => void;
  onConfirmCarryover: (name: string, action: "confirmed" | "need" | undefined) => void;
  onAcceptSuggestion: (suggestion: ProposedSuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
  onToggleAdaptation: (day: string, mealType: string, adaptationName: string, currentlyApplied: boolean) => void;
  onRecipeClick: (recipeId: string) => void;
  onSaved: () => void;
  onDiscard: () => void;
}

export function MealPlanPanel({
  proposal,
  weekOf,
  excludedIngredients,
  alternatives,
  respinLoading,
  streaming,
  onRequestRespin,
  onConfirmRespinPicks,
  onCancelRespin,
  onRequestSwap,
  onRemoveExtra,
  onRemoveStaple,
  onConfirmCarryover,
  onAcceptSuggestion,
  onDismissSuggestion,
  onToggleAdaptation,
  onRecipeClick,
  onSaved,
  onDiscard,
}: MealPlanPanelProps) {
  const [saving, setSaving] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [swapMenuDay, setSwapMenuDay] = useState<string | null>(null);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());
  // Modal picks: maps "day-mealType" to the chosen alternative
  const [modalPicks, setModalPicks] = useState<Map<string, AlternativeMeal>>(new Map());

  const isRespinActive = !!(alternatives && alternatives.slots.length > 0);

  function toggleSlot(day: string, mealType: string) {
    const key = `${day}-${mealType}`;
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleRespin() {
    const slots = [...selectedSlots].map((key) => {
      const [day, mealType] = key.split("-");
      return { day, mealType };
    });
    onRequestRespin?.(slots);
    setSelectionMode(false);
    setSelectedSlots(new Set());
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedSlots(new Set());
  }

  const sortedMeals = [...proposal.meals].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
  );

  const unresolvedCarryovers = (proposal.carryoverItems ?? []).filter(
    (c) => !c.status,
  );

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch("/api/sessions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf,
          meals: proposal.meals.map((m) => ({
            day: m.day,
            mealType: m.mealType,
            recipeId: m.recipeId,
            sides: m.sides?.map((s) =>
              s.sideId
                ? { kind: "ref" as const, sideId: s.sideId }
                : {
                    kind: "inline" as const,
                    name: s.sideName,
                    ingredients: s.ingredients ?? [],
                    complexity: s.complexity as "effortless" | "simple" | "prepared",
                    baseIngredient: s.baseIngredient,
                    sideCategory: s.sideCategory as "green" | "starch" | "grain" | "bread" | "legume" | "salad" | "other" | undefined,
                  },
            ),
          })),
          extras: proposal.extras,
          groceryStaples: proposal.groceryStaples,
          carryoverItems: proposal.carryoverItems?.map((c) => ({
            ...c,
            status: c.status ?? "unresolved",
          })),
          summary: [
            proposal.complexityMix ? `Mix: ${proposal.complexityMix.staple}S ${proposal.complexityMix.standard}M ${proposal.complexityMix.involved}I` : null,
            proposal.proteinRotation ? `Proteins: ${proposal.proteinRotation.join(" → ")}` : null,
          ].filter(Boolean).join(". ") || "Weekly meal plan",
        }),
      });

      if (res.ok) {
        const session = await res.json();
        // Merge ingredients into the persistent grocery list
        try {
          await fetch("/api/grocery/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: session.id,
              excludedIngredients: excludedIngredients ? [...excludedIngredients] : [],
            }),
          });
        } catch (mergeErr) {
          console.error("Failed to merge into grocery list:", mergeErr);
        }
        setSavedSessionId(session.id);
        onSaved();
      }
    } catch (err) {
      console.error("Failed to save plan:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleSwap(day: string, mealType: string, complexity?: string) {
    setSwapMenuDay(null);
    onRequestSwap(day, mealType, complexity);
  }

  const hasSuggestions = (proposal.suggestions ?? []).length > 0;
  const hasCarryovers = (proposal.carryoverItems ?? []).length > 0;
  const hasAvailableStaples = false; // Will be populated when removed staples move here

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-card-border px-6 py-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {savedSessionId ? "Plan Confirmed" : "Proposed Plan"}
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Week of{" "}
            {formatWeekOf(weekOf, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div>
          {savedSessionId ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-green-500 mr-2">
                <Check className="h-4 w-4" /> Saved
              </div>
              <Link
                href="/grocery"
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <ShoppingBasket className="h-4 w-4" /> Grocery List
              </Link>
              <Link
                href={`/settings/history/${savedSessionId}`}
                className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:bg-tag-bg hover:text-foreground"
              >
                <History className="h-4 w-4" /> View Plan
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Re-spin controls */}
              {isRespinActive ? (
                <button
                  onClick={() => { onCancelRespin?.(); exitSelectionMode(); }}
                  className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
                >
                  <X className="h-4 w-4" /> Cancel Re-spin
                </button>
              ) : selectionMode ? (
                <>
                  <button
                    onClick={exitSelectionMode}
                    className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </button>
                  {selectedSlots.size > 0 && (
                    <button
                      onClick={handleRespin}
                      disabled={respinLoading || streaming}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {respinLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Finding options...</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Re-spin {selectedSlots.size} meal{selectedSlots.size > 1 ? "s" : ""}</>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSelectionMode(true)}
                    disabled={saving || streaming}
                    className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" /> Re-spin
                  </button>
                  <button
                    onClick={onDiscard}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Discard
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Confirm & Save
                        {unresolvedCarryovers.length > 0 && (
                          <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                            {unresolvedCarryovers.length} unresolved
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ===== PLAN BOUNDARY START ===== */}
        <div className="rounded-2xl border-2 border-green-500/25 bg-green-500/[0.04] p-5">
          {/* Section label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="h-4 w-1 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">
              Your Plan
            </span>
          </div>

          {/* Selection mode hint */}
          {selectionMode && selectedSlots.size === 0 && (
            <div className="mb-3 text-xs text-muted text-center">
              Tap the meals you want to replace, then click Re-spin
            </div>
          )}

          {/* 7-column meal row */}
          <div className="grid grid-cols-7 gap-2">
            {sortedMeals.map((meal) => {
              const style = COMPLEXITY_STYLES[meal.complexity] ?? COMPLEXITY_STYLES.standard;
              const isSwapOpen = swapMenuDay === `${meal.day}-${meal.mealType}`;
              const slotKey = `${meal.day}-${meal.mealType}`;
              const isSelected = selectedSlots.has(slotKey);
              const slotAlts = alternatives?.slots.find(
                (s) => s.day === meal.day && s.mealType === meal.mealType,
              );
              const isLoading = respinLoading && isSelected;

              const reasonExpanded = expandedReasons.has(slotKey);
              return (
                <div
                  key={slotKey}
                  className={`group relative flex flex-col rounded-xl border border-l-[3px] p-3 transition-all ${style.stripe} ${
                    slotAlts
                      ? "border-accent/40 bg-accent/5"
                      : isSelected
                        ? "border-red-500/40 bg-red-500/5"
                        : isLoading
                          ? "border-accent/30 animate-pulse"
                          : "border-card-border bg-background hover:border-accent/30 hover:shadow-md"
                  }`}
                  onClick={selectionMode && !isRespinActive ? () => toggleSlot(meal.day, meal.mealType) : undefined}
                  role={selectionMode ? "checkbox" : undefined}
                  aria-checked={selectionMode ? isSelected : undefined}
                  style={selectionMode ? { cursor: "pointer" } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                        {DAY_SHORT[meal.day] ?? meal.day}
                      </span>
                      <span className={`rounded-full px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-wide ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                    </div>
                    {selectionMode && !isRespinActive ? (
                      <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isSelected ? "border-red-500 bg-red-500" : "border-muted"
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    ) : !savedSessionId && !isRespinActive && (
                      <div className="relative">
                        <button
                          onClick={() => setSwapMenuDay(isSwapOpen ? null : slotKey)}
                          className="text-muted opacity-0 transition-all hover:text-accent group-hover:opacity-100"
                          title={`Swap ${DAY_FULL[meal.day]}`}
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                        </button>
                        {isSwapOpen && (
                          <div className="absolute right-0 top-5 z-10 w-40 rounded-lg border border-card-border bg-card p-1.5 shadow-xl">
                            <button onClick={() => handleSwap(meal.day, meal.mealType)} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-foreground hover:bg-tag-bg">Any type</button>
                            <button onClick={() => handleSwap(meal.day, meal.mealType, "staple")} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-green-500 hover:bg-tag-bg">Staple</button>
                            <button onClick={() => handleSwap(meal.day, meal.mealType, "standard")} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-accent hover:bg-tag-bg">Standard</button>
                            <button onClick={() => handleSwap(meal.day, meal.mealType, "involved")} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-amber-500 hover:bg-tag-bg">Involved</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Current meal content — dimmed when alternatives are showing */}
                  <div className={slotAlts ? "opacity-40" : undefined}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRecipeClick(meal.recipeId); }}
                      className={`mt-2 block w-full text-left text-sm font-semibold leading-snug transition-colors ${
                        slotAlts ? "text-muted line-through" : "text-foreground hover:text-accent"
                      }`}
                    >
                      {meal.recipeName}
                    </button>
                    {/* Sides row */}
                    {!slotAlts && meal.sides && meal.sides.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted/90">
                        <span className="text-muted/50">+</span>
                        {meal.sides.map((side, sideIdx) => (
                          <span key={sideIdx}>
                            <span className="hover:text-accent cursor-default transition-colors">
                              {side.sideName}
                            </span>
                            {sideIdx < meal.sides!.length - 1 && (
                              <span className="text-muted/40 ml-1">·</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {!slotAlts && meal.reasoning && (
                      <div className="mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedReasons((prev) => {
                              const next = new Set(prev);
                              if (next.has(slotKey)) next.delete(slotKey);
                              else next.add(slotKey);
                              return next;
                            });
                          }}
                          className="flex items-center gap-0.5 text-[10px] font-medium text-muted/80 hover:text-accent transition-colors"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${reasonExpanded ? "" : "-rotate-90"}`}
                          />
                          {reasonExpanded ? "Hide" : "Why?"}
                        </button>
                        {reasonExpanded && (
                          <p className="mt-1 text-[11px] text-muted leading-relaxed">
                            {meal.reasoning}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Loading shimmer for this slot */}
                  {isLoading && (
                    <div className="mt-2 space-y-2">
                      <div className="h-3 rounded bg-accent/20 animate-pulse" />
                      <div className="h-3 w-3/4 rounded bg-accent/20 animate-pulse" />
                    </div>
                  )}

                  {/* Badge indicating this slot is being replaced via modal */}
                  {slotAlts && (
                    <div className="mt-2 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1.5 text-center">
                      <span className="text-[10px] font-semibold text-accent">
                        {modalPicks.has(slotKey) ? `Replacing with: ${modalPicks.get(slotKey)!.recipeName}` : "Picking replacement..."}
                      </span>
                    </div>
                  )}

                  {/* Adaptation badges — hidden during respin */}
                  {!slotAlts && meal.adaptations && meal.adaptations.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {meal.adaptations.map((adapt: ProposedAdaptation) => (
                        <button
                          key={adapt.adaptationName}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!savedSessionId) {
                              onToggleAdaptation(meal.day, meal.mealType, adapt.adaptationName, adapt.applied);
                            }
                          }}
                          disabled={!!savedSessionId}
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                            adapt.applied
                              ? "bg-green-500/15 text-green-500 hover:bg-green-500/25"
                              : "bg-tag-bg text-muted hover:bg-tag-bg/80 hover:text-foreground"
                          } ${savedSessionId ? "cursor-default" : "cursor-pointer"}`}
                          title={adapt.applied
                            ? `Adapted: ${adapt.swaps?.map((s) => `${s.from} → ${s.to}`).join(", ") ?? ""} — click to skip`
                            : `${adapt.skipReason ?? "Not adapted"}${adapt.skipNote ? ` — ${adapt.skipNote}` : ""} — click to adapt`
                          }
                        >
                          {adapt.applied ? "✓" : "•"} {adapt.adaptationName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Extras (inside plan boundary) */}
          {proposal.extras && proposal.extras.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-2">
                <CakeSlice className="h-4 w-4 text-pink-400" />
                <span className="text-sm font-semibold text-foreground">Extras</span>
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {proposal.extras.map((extra) => (
                  <button
                    key={extra.name}
                    onClick={() => setSelectedExtra(extra.name)}
                    className="group/extra rounded-xl border border-card-border bg-background p-3 text-left transition-all hover:border-accent/30 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{extra.name}</span>
                      {!savedSessionId && (
                        <span
                          onClick={(e) => { e.stopPropagation(); onRemoveExtra(extra.name); }}
                          className="text-muted opacity-0 transition-all hover:text-red-500 group-hover/extra:opacity-100 cursor-pointer"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    {extra.description && (
                      <p className="mt-1 text-[11px] text-muted">{extra.description}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-accent">
                      {extra.ingredients.length} ingredient{extra.ingredients.length !== 1 ? "s" : ""} — click to view
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recurring items (inside plan boundary) */}
          {proposal.groceryStaples && proposal.groceryStaples.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ShoppingBasket className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold text-foreground">Recurring</span>
                  <span className="text-xs text-muted">({proposal.groceryStaples.length})</span>
                </div>
                <Link
                  href="/settings/recurring"
                  className="text-[11px] text-muted hover:text-accent transition-colors"
                >
                  Manage →
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {proposal.groceryStaples.map((staple) => (
                  <div
                    key={staple.name}
                    className="group/staple flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2"
                  >
                    {staple.style === "flexible" ? (
                      <span className="text-sm text-foreground">
                        <span className="mr-1">🧺</span>
                        {staple.name}
                        {staple.description && (
                          <span className="text-xs text-muted ml-1">— {staple.description}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-foreground">
                        {staple.name}
                        {staple.quantity && staple.unit && (
                          <span className="text-xs text-muted ml-1">
                            {staple.quantity} {staple.unit}
                          </span>
                        )}
                      </span>
                    )}
                    {!savedSessionId && (
                      <button
                        onClick={() => onRemoveStaple(staple.name)}
                        className="text-muted opacity-0 transition-all hover:text-red-500 group-hover/staple:opacity-100"
                        title="Remove from this week"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        {/* ===== PLAN BOUNDARY END ===== */}

        {/* ===== REVIEW BEFORE CONFIRMING ===== */}
        {(hasSuggestions || hasAvailableStaples || hasCarryovers) && (
          <>
            <div className="mt-8 mb-4 flex items-center gap-2">
              <div
                className={`h-5 w-1 rounded-full ${
                  unresolvedCarryovers.length > 0 ? "bg-amber-500" : "bg-muted/50"
                }`}
              />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Review Before Confirming
              </h3>
              {unresolvedCarryovers.length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  {unresolvedCarryovers.length} unresolved
                </span>
              )}
              <div className="flex-1 border-t border-dashed border-card-border ml-2" />
            </div>

            {/* Assumed On Hand / Carryover Items */}
            {proposal.carryoverItems && proposal.carryoverItems.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-400">Assumed On Hand</span>
                  <span className="text-xs text-muted">
                    — These will NOT be on your shopping list
                  </span>
                </div>
                <div className="space-y-3">
                  {proposal.carryoverItems.map((item) => {
                    const isConfirmed = item.status === "confirmed";
                    const isNeeded = item.status === "need";
                    const isResolved = isConfirmed || isNeeded;

                    return (
                      <div
                        key={item.name}
                        className={`rounded-lg border p-3 ${
                          isConfirmed
                            ? "border-green-500/20 bg-green-500/5"
                            : isNeeded
                              ? "border-accent/20 bg-accent/5"
                              : "border-amber-500/20 bg-background"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isConfirmed ? (
                                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              ) : isNeeded ? (
                                <ShoppingCart className="h-3.5 w-3.5 text-accent shrink-0" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              )}
                              <span className={`text-sm font-semibold ${isResolved ? "text-muted" : "text-foreground"}`}>
                                {item.name} — ~{item.estimatedQuantity} {item.unit}
                              </span>
                              {isConfirmed && (
                                <span className="text-[10px] font-semibold text-green-500 uppercase tracking-wider">On hand</span>
                              )}
                              {isNeeded && (
                                <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Adding to list</span>
                              )}
                            </div>
                            {!isResolved && (
                              <>
                                <p className="mt-1 text-xs text-muted ml-5">
                                  Bought {item.source.purchasedQuantity} {item.unit} last week for{" "}
                                  {item.source.recipeName}. Used ~{item.source.usedQuantity} {item.unit}.
                                </p>
                                <p className="text-xs text-muted ml-5">
                                  Needed for: <span className="text-foreground">{item.neededFor.day}&apos;s {item.neededFor.recipeName}</span>
                                  {" "}({item.neededFor.requiredQuantity} {item.unit})
                                </p>
                              </>
                            )}
                          </div>
                          {!savedSessionId && (
                            isResolved ? (
                              <button
                                onClick={() => onConfirmCarryover(item.name, undefined)}
                                className="rounded-lg border border-card-border px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:bg-tag-bg transition-colors shrink-0"
                              >
                                Undo
                              </button>
                            ) : (
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  onClick={() => onConfirmCarryover(item.name, "confirmed")}
                                  className="rounded-lg border border-green-500/30 px-2.5 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/10 transition-colors"
                                >
                                  <Check className="h-3 w-3 inline mr-1" />
                                  I have this
                                </button>
                                <button
                                  onClick={() => onConfirmCarryover(item.name, "need")}
                                  className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-tag-bg transition-colors"
                                >
                                  <ShoppingCart className="h-3 w-3 inline mr-1" />
                                  I need this
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {proposal.suggestions && proposal.suggestions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold text-foreground">Suggestions</span>
                </div>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                  {proposal.suggestions.map((suggestion) => {
                    const Icon = SUGGESTION_ICONS[suggestion.type] ?? Lightbulb;
                    const colorClass = SUGGESTION_COLORS[suggestion.type] ?? "border-card-border bg-card";
                    return (
                      <div
                        key={suggestion.id}
                        className={`rounded-xl border p-3 ${colorClass}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 text-muted shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{suggestion.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted">{suggestion.description}</p>
                            <p className="mt-1 text-[10px] text-muted/70 italic">{suggestion.rationale}</p>
                          </div>
                          {!savedSessionId && (
                            <button
                              onClick={() => onDismissSuggestion(suggestion.id)}
                              className="shrink-0 rounded-lg p-1 text-muted/50 hover:text-foreground hover:bg-background/50 transition-colors"
                              title="Dismiss suggestion"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {!savedSessionId && (
                          <button
                            onClick={() => onAcceptSuggestion(suggestion)}
                            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-card-border bg-background py-1.5 text-xs font-medium text-accent hover:bg-tag-bg transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Add to plan
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Extra detail modal */}
        {selectedExtra && (() => {
          const extra = proposal.extras?.find((e) => e.name === selectedExtra);
          if (!extra) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedExtra(null)} />
              <div className="relative mx-4 max-h-[70vh] w-full max-w-md overflow-y-auto rounded-xl border border-card-border bg-card shadow-2xl">
                <button
                  onClick={() => setSelectedExtra(null)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="p-6">
                  <div className="flex items-center gap-2">
                    <CakeSlice className="h-5 w-5 text-pink-400" />
                    <h2 className="text-lg font-bold text-foreground">{extra.name}</h2>
                  </div>
                  {extra.description && (
                    <p className="mt-1.5 text-sm text-muted">{extra.description}</p>
                  )}
                  <h3 className="mt-5 text-sm font-semibold text-foreground">Ingredients</h3>
                  <ul className="mt-3 space-y-2">
                    {extra.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium text-foreground">
                          {ing.quantity} {ing.unit}
                        </span>
                        <span className="text-muted">{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Re-spin alternatives modal */}
        {isRespinActive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => { onCancelRespin?.(); setModalPicks(new Map()); }} />
            <div className="relative mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-card-border bg-card shadow-2xl">
              {/* Modal header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-card-border bg-card px-6 py-4 rounded-t-2xl">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    Pick Replacements
                  </h2>
                  <p className="text-sm text-muted mt-0.5">
                    Choose a new meal for {alternatives!.slots.length === 1 ? "this day" : `each of these ${alternatives!.slots.length} days`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {modalPicks.size === alternatives!.slots.length && (
                    <button
                      onClick={() => {
                        const picks = [...modalPicks.entries()].map(([key, picked]) => {
                          const [day, mealType] = key.split("-");
                          return { day, mealType, picked };
                        });
                        onConfirmRespinPicks?.(picks);
                        setModalPicks(new Map());
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                    >
                      <Check className="h-4 w-4" />
                      Confirm {modalPicks.size} pick{modalPicks.size > 1 ? "s" : ""}
                    </button>
                  )}
                  <button
                    onClick={() => { onCancelRespin?.(); setModalPicks(new Map()); }}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Slots */}
              <div className="p-6 space-y-6">
                {alternatives!.slots.map((slot) => {
                  const slotKey = `${slot.day}-${slot.mealType}`;
                  const currentMeal = proposal.meals.find((m) => m.day === slot.day && m.mealType === slot.mealType);
                  const pickedAlt = modalPicks.get(slotKey);

                  return (
                    <div key={slotKey}>
                      {/* Slot header — day + rejected meal */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent">
                          {DAY_FULL[slot.day] ?? slot.day}
                        </span>
                        {currentMeal && (
                          <span className="text-sm text-muted">
                            Replacing <span className="line-through">{currentMeal.recipeName}</span>
                          </span>
                        )}
                        {pickedAlt && (
                          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-green-500">
                            <Check className="h-3.5 w-3.5" /> Selected
                          </span>
                        )}
                      </div>

                      {/* Alternative cards — horizontal row */}
                      <div className="grid grid-cols-3 gap-3">
                        {slot.alternatives.map((alt) => {
                          const altStyle = COMPLEXITY_STYLES[alt.complexity] ?? COMPLEXITY_STYLES.standard;
                          const isPicked = pickedAlt?.recipeId === alt.recipeId;

                          return (
                            <button
                              key={alt.recipeId}
                              onClick={() => {
                                setModalPicks((prev) => {
                                  const next = new Map(prev);
                                  if (isPicked) next.delete(slotKey);
                                  else next.set(slotKey, alt);
                                  return next;
                                });
                              }}
                              className={`rounded-xl border p-4 text-left transition-all ${
                                isPicked
                                  ? "border-green-500 bg-green-500/5 ring-1 ring-green-500/30"
                                  : "border-card-border bg-background hover:border-accent/40 hover:shadow-md"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${altStyle.bg} ${altStyle.text}`}>
                                  {altStyle.label}
                                </span>
                                {isPicked && (
                                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                                    <Check className="h-3 w-3 text-white" />
                                  </div>
                                )}
                              </div>
                              <h3 className="mt-2 text-sm font-bold text-foreground leading-snug">
                                {alt.recipeName}
                              </h3>
                              <p className="mt-1.5 text-xs text-muted leading-relaxed">
                                {alt.reasoning}
                              </p>
                              {alt.adaptations && alt.adaptations.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {alt.adaptations.map((adapt) => (
                                    <span
                                      key={adapt.adaptationName}
                                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                        adapt.applied
                                          ? "bg-green-500/15 text-green-500"
                                          : "bg-tag-bg text-muted"
                                      }`}
                                    >
                                      {adapt.applied ? "✓" : "•"} {adapt.adaptationName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal footer — sticky confirm button when scrolled */}
              {modalPicks.size > 0 && modalPicks.size < alternatives!.slots.length && (
                <div className="sticky bottom-0 border-t border-card-border bg-card px-6 py-3 rounded-b-2xl">
                  <p className="text-xs text-muted text-center">
                    {alternatives!.slots.length - modalPicks.size} more to pick
                  </p>
                </div>
              )}
              {modalPicks.size === alternatives!.slots.length && (
                <div className="sticky bottom-0 border-t border-card-border bg-card px-6 py-3 rounded-b-2xl flex justify-end">
                  <button
                    onClick={() => {
                      const picks = [...modalPicks.entries()].map(([key, picked]) => {
                        const [day, mealType] = key.split("-");
                        return { day, mealType, picked };
                      });
                      onConfirmRespinPicks?.(picks);
                      setModalPicks(new Map());
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                  >
                    <Check className="h-4 w-4" />
                    Confirm {modalPicks.size} pick{modalPicks.size > 1 ? "s" : ""}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visual analytics */}
        <div className="mt-6 space-y-4">
          {/* Row 1: Complexity mix + Cook times */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {proposal.complexityMix && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Effort Balance</div>
                <div className="flex h-8 overflow-hidden rounded-lg">
                  {proposal.complexityMix.staple > 0 && (
                    <div className="flex items-center justify-center bg-green-500/20 text-green-500 text-xs font-bold" style={{ width: `${(proposal.complexityMix.staple / 7) * 100}%` }}>
                      {proposal.complexityMix.staple} Staple
                    </div>
                  )}
                  {proposal.complexityMix.standard > 0 && (
                    <div className="flex items-center justify-center bg-accent/20 text-accent text-xs font-bold" style={{ width: `${(proposal.complexityMix.standard / 7) * 100}%` }}>
                      {proposal.complexityMix.standard} Standard
                    </div>
                  )}
                  {proposal.complexityMix.involved > 0 && (
                    <div className="flex items-center justify-center bg-amber-500/20 text-amber-500 text-xs font-bold" style={{ width: `${(proposal.complexityMix.involved / 7) * 100}%` }}>
                      {proposal.complexityMix.involved} Involved
                    </div>
                  )}
                </div>
              </div>
            )}

            {proposal.cookTimes && proposal.cookTimes.length > 0 && (() => {
              const maxTime = Math.max(...proposal.cookTimes.map((t) => t.minutes));
              const BAR_MAX_PX = 64;
              return (
                <div className="rounded-xl border border-card-border p-4">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Cook Time by Day</div>
                  <div className="flex items-end gap-1.5">
                    {proposal.cookTimes.map((entry) => {
                      const barHeight = maxTime > 0 ? Math.max((entry.minutes / maxTime) * BAR_MAX_PX, 6) : 6;
                      const isWeekend = entry.day === "sat" || entry.day === "sun" || entry.day === "saturday" || entry.day === "sunday";
                      return (
                        <div key={entry.day} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-medium text-muted">{entry.minutes}m</span>
                          <div className={`w-full rounded-t ${isWeekend ? "bg-amber-500/50" : "bg-accent/40"}`} style={{ height: `${barHeight}px` }} />
                          <span className="text-[9px] font-bold uppercase text-muted">{entry.day.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Row 2: Protein rotation + Cuisine variety */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {proposal.proteinRotation && proposal.proteinRotation.length > 0 && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Protein Rotation</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {proposal.proteinRotation.map((protein, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="rounded-full bg-tag-bg px-2.5 py-1 text-xs font-semibold text-tag-text capitalize">{protein}</span>
                      {i < proposal.proteinRotation!.length - 1 && <span className="text-muted/40 text-xs">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {proposal.cuisineVariety && proposal.cuisineVariety.length > 0 && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Cuisine Variety</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {proposal.cuisineVariety.map((cuisine, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent capitalize">{cuisine}</span>
                      {i < proposal.cuisineVariety!.length - 1 && <span className="text-muted/40 text-xs">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Shopping highlights + Available for swaps */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {proposal.shoppingHighlights && proposal.shoppingHighlights.length > 0 && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider mb-3">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Shared Ingredients
                </div>
                <div className="space-y-2.5">
                  {proposal.shoppingHighlights.map((h, i) => {
                    if (typeof h === "string") {
                      return <p key={i} className="text-sm text-muted">{h}</p>;
                    }
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground min-w-[80px]">{h.ingredient}</span>
                        <div className="flex gap-1">
                          {h.days.map((day) => (
                            <span key={day} className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">{day}</span>
                          ))}
                        </div>
                        <span className="text-xs text-muted ml-auto">{h.buyNote}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {proposal.unusedRecipes && proposal.unusedRecipes.length > 0 && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Available for Swaps
                </div>
                <div className="flex flex-wrap gap-2">
                  {proposal.unusedRecipes.map((recipe, i) => {
                    if (typeof recipe === "string") {
                      return (
                        <div key={i} className="rounded-lg border border-card-border bg-background px-3 py-2">
                          <span className="text-sm font-medium text-foreground">{recipe}</span>
                        </div>
                      );
                    }
                    const style = COMPLEXITY_STYLES[recipe.complexity] ?? COMPLEXITY_STYLES.standard;
                    return (
                      <div key={recipe.name} className="rounded-lg border border-card-border bg-background px-3 py-2">
                        <span className="text-sm font-medium text-foreground">{recipe.name}</span>
                        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${style.bg} ${style.text}`}>{style.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
