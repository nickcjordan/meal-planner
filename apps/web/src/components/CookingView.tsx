"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Minus, Plus, Wifi } from "lucide-react";
import type { Ingredient, PlanningSession, Recipe, SideIngredient } from "@meal-planner/types";
import { useWakeLock } from "@/hooks/useWakeLock";
import { formatMinutes } from "@/lib/format";
import { api, tryApi, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface ResolvedSide {
  name: string;
  complexity: string;
  ingredients: SideIngredient[];
  prepNotes?: string;
}

interface CookingViewProps {
  recipe: Recipe;
  sides?: ResolvedSide[];
  sessionId?: string;
  mealDay?: string;
  mealType?: string;
}

function formatQuantity(qty: number): string {
  if (qty === 0) return "0";

  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 100) / 100;

  const fractions: Record<number, string> = {
    0.25: "¼",
    0.33: "⅓",
    0.34: "⅓",
    0.5: "½",
    0.67: "⅔",
    0.66: "⅔",
    0.75: "¾",
  };

  const fracChar = fractions[Math.round(frac * 100) / 100];

  if (frac === 0) return whole.toString();
  if (whole === 0 && fracChar) return fracChar;
  if (whole > 0 && fracChar) return `${whole}${fracChar}`;
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
}

export function CookingView({ recipe, sides, sessionId, mealDay, mealType }: CookingViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [servings, setServings] = useState(recipe.servings);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [stepMode, setStepMode] = useState<"classic" | "inline">("classic");
  const [ingredientsExpanded, setIngredientsExpanded] = useState(true);
  const [markingCooked, setMarkingCooked] = useState(false);
  const [markedCooked, setMarkedCooked] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const stepsContainerRef = useRef<HTMLDivElement>(null);
  const { isActive: wakeLockActive } = useWakeLock();

  const canMarkCooked = !!(sessionId && mealDay && mealType);

  async function handleMarkCooked() {
    if (!canMarkCooked) return;
    setMarkingCooked(true);
    try {
      const session = await api<PlanningSession>(`/api/sessions/${sessionId}`);
      const updatedMeals = session.meals.map((m) =>
        m.day === mealDay && m.mealType === mealType && m.recipeId === recipe.id
          ? { ...m, cookedAt: new Date().toISOString() }
          : m,
      );
      await api(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals: updatedMeals }),
      });
      setMarkedCooked(true);

      // Celebrate when this was the final un-cooked meal — but only if the week
      // hasn't already been reviewed.
      if (updatedMeals.length > 0 && updatedMeals.every((m) => m.cookedAt)) {
        const fb = await tryApi<unknown[]>(`/api/sessions/${sessionId}/feedback`);
        if (fb.ok && Array.isArray(fb.data) && fb.data.length === 0) {
          toast("Week complete! Ready to review?", "success", {
            duration: 10000,
            action: { label: "Review", onClick: () => router.push(`/review/${sessionId}`) },
          });
        }
      }

      setTimeout(() => router.push("/week"), 800);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't mark as cooked", "error");
      setMarkingCooked(false);
    }
  }

  const scale = servings / recipe.servings;
  const totalTime = recipe.prepTime + recipe.cookTime;
  const hasEnriched = !!recipe.enrichedStepSections;

  // Total step count for the active mode — drives the position cue.
  const totalSteps = useMemo(() => {
    if (stepMode === "inline" && recipe.enrichedStepSections) {
      return recipe.enrichedStepSections.reduce((n, s) => n + s.steps.length, 0);
    }
    return recipe.stepSections.reduce((n, s) => n + s.steps.length, 0);
  }, [stepMode, recipe.stepSections, recipe.enrichedStepSections]);

  const longSteps = totalSteps >= 8;

  // Build a name → ingredient lookup for chip rendering
  const ingredientMap = useMemo(() => {
    const map = new Map<string, Ingredient>();
    for (const section of recipe.ingredientSections) {
      for (const ing of section.items) {
        map.set(ing.name.toLowerCase(), ing);
      }
    }
    return map;
  }, [recipe.ingredientSections]);

  // Scrollspy: track which step is at the top of the viewport for the "step N of M" cue.
  useEffect(() => {
    if (!longSteps) {
      setCurrentStep(1);
      return;
    }
    const container = stepsContainerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-step]"));
    if (items.length === 0) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.step);
          if (entry.isIntersecting) visible.add(n);
          else visible.delete(n);
        }
        if (visible.size > 0) setCurrentStep(Math.min(...visible));
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [longSteps, stepMode, totalSteps]);

  function toggleIngredient(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/week"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> This Week
          </Link>
          <Link
            href={`/recipes/${recipe.id}`}
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Details
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {wakeLockActive && (
            <span className="flex items-center gap-1 text-xs text-success" title="Screen will stay awake">
              <Wifi className="h-3 w-3" /> Awake
            </span>
          )}
          {canMarkCooked && (
            <button
              onClick={handleMarkCooked}
              disabled={markingCooked || markedCooked}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                markedCooked
                  ? "bg-success/15 text-success"
                  : "border border-card-border text-muted hover:bg-tag-bg hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              {markedCooked ? "Cooked!" : markingCooked ? "Saving…" : "Mark as Cooked"}
            </button>
          )}
        </div>
      </div>

      {/* Recipe title */}
      <h1 className="mt-4 text-2xl font-bold text-foreground">{recipe.name}</h1>

      {/* Time + servings bar */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Prep {formatMinutes(recipe.prepTime)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Cook {formatMinutes(recipe.cookTime)}
          </span>
          <span className="font-medium text-foreground">{formatMinutes(totalTime)} total</span>
        </div>

        {/* Servings scaler */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Servings</span>
          <button
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            aria-label="Decrease servings"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-sm font-semibold text-foreground">
            {servings}
          </span>
          <button
            onClick={() => setServings((s) => s + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            aria-label="Increase servings"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Two-column on desktop: ingredients (sticky) left, steps right. Single column on phone. */}
      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Ingredients checklist */}
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <button
            onClick={() => setIngredientsExpanded((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <h2 className="text-xl font-semibold text-foreground">Ingredients</h2>
            {stepMode === "inline" && (
              <span className="text-sm text-muted">
                {ingredientsExpanded ? "collapse" : "expand for reference"}
              </span>
            )}
          </button>
          {(!ingredientsExpanded && stepMode === "inline") ? null : recipe.ingredientSections.map((section, si) => (
            <div key={si}>
              {section.header && (
                <h3 className="mt-5 mb-1 text-sm font-semibold uppercase tracking-wider text-muted">
                  {section.header}
                </h3>
              )}
              <ul className={`${si === 0 && !section.header ? "mt-4" : "mt-2"} space-y-1`}>
                {section.items.map((ing, ii) => {
                  const key = `s${si}-i${ii}`;
                  const isChecked = checked.has(key);
                  const scaledQty = formatQuantity(ing.quantity * scale);
                  return (
                    <li key={key}>
                      <button
                        onClick={() => toggleIngredient(key)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-tag-bg/50 ${
                          isChecked ? "opacity-40" : ""
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                            isChecked
                              ? "border-accent bg-accent text-white"
                              : "border-input-border"
                          }`}
                        >
                          {isChecked && (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className={`text-base ${isChecked ? "line-through" : ""}`}>
                          <span className="font-medium text-foreground">
                            {scaledQty} {ing.unit}
                          </span>{" "}
                          <span className="text-muted">
                            {ing.name}
                            {ing.prep && <span className="text-muted/70">, {ing.prep}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div ref={stepsContainerRef} className="relative mt-10 lg:mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Steps</h2>
            <div className="flex overflow-hidden rounded-lg border border-card-border text-sm">
              <button
                onClick={() => {
                  setStepMode("classic");
                  setIngredientsExpanded(true);
                }}
                className={`px-3 py-1.5 transition-colors ${
                  stepMode === "classic"
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-tag-bg hover:text-foreground"
                }`}
              >
                Classic
              </button>
              <button
                onClick={() => {
                  setStepMode("inline");
                  setIngredientsExpanded(false);
                }}
                className={`px-3 py-1.5 transition-colors ${
                  stepMode === "inline"
                    ? "bg-accent text-white"
                    : hasEnriched
                    ? "text-muted hover:bg-tag-bg hover:text-foreground"
                    : "cursor-default opacity-40"
                }`}
                title={!hasEnriched ? "Polish this recipe to enable inline mode" : undefined}
              >
                Inline
              </button>
            </div>
          </div>

          {/* Subtle position cue for long recipes — floats at the top while scrolling. */}
          {longSteps && (
            <div className="pointer-events-none sticky top-2 z-10 mt-2 flex justify-end lg:justify-start">
              <span className="rounded-full border border-card-border bg-card/90 px-2.5 py-1 text-xs font-medium tabular-nums text-muted shadow-sm backdrop-blur">
                Step {currentStep} of {totalSteps}
              </span>
            </div>
          )}

          {stepMode === "inline" && !hasEnriched ? (
            <p className="mt-6 text-sm text-muted">
              Polish this recipe from the{" "}
              <Link href={`/recipes/${recipe.id}`} className="text-accent hover:underline">
                recipe page
              </Link>{" "}
              to enable inline mode.
            </p>
          ) : stepMode === "inline" && recipe.enrichedStepSections ? (
            (() => {
              let stepNum = 0;
              return recipe.enrichedStepSections.map((section, si) => (
                <div key={si}>
                  {section.header && (
                    <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                      {section.header}
                    </h3>
                  )}
                  <ol className="mt-4 space-y-6">
                    {section.steps.map((step) => {
                      stepNum++;
                      const chips = (step.ingredients ?? []).map((ingRef) => {
                        const ing = ingredientMap.get(ingRef.name.toLowerCase());
                        const rawQty = ingRef.quantityOverride ?? ing?.quantity ?? 0;
                        const unit = ingRef.unit ?? ing?.unit ?? "";
                        const prep = ingRef.prep ?? ing?.prep;
                        const qtyText = rawQty > 0
                          ? `${formatQuantity(rawQty * scale)}${unit ? " " + unit : ""}`
                          : unit;
                        return { key: ingRef.name, qtyText, name: ingRef.name, prep };
                      });
                      return (
                        <li key={stepNum} data-step={stepNum} className="flex gap-4">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-bold text-accent">
                            {stepNum}
                          </span>
                          <div className="flex-1 pt-1">
                            <p className="text-lg leading-relaxed text-foreground">{step.text}</p>
                            {chips.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {chips.map((c) => (
                                  <span
                                    key={c.key}
                                    className="inline-flex items-baseline gap-1 rounded-md bg-tag-bg px-2 py-1 text-xs"
                                  >
                                    {c.qtyText && (
                                      <span className="font-semibold text-foreground">{c.qtyText}</span>
                                    )}
                                    <span className="text-muted">
                                      {c.name}
                                      {c.prep && <span className="text-muted/70">, {c.prep}</span>}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ));
            })()
          ) : (
            (() => {
              let stepNum = 0;
              return recipe.stepSections.map((section, si) => (
                <div key={si}>
                  {section.header && (
                    <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                      {section.header}
                    </h3>
                  )}
                  <ol className="mt-4 space-y-6">
                    {section.steps.map((step) => {
                      stepNum++;
                      return (
                        <li key={stepNum} data-step={stepNum} className="flex gap-4">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-bold text-accent">
                            {stepNum}
                          </span>
                          <p className="pt-1 text-lg leading-relaxed text-foreground">{step}</p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ));
            })()
          )}
        </div>
      </div>

      {/* Sides */}
      {sides && sides.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">Sides</h2>
          <div className="mt-4 space-y-6">
            {sides.map((side, si) => (
              <div key={si} className="rounded-xl border border-card-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{side.name}</h3>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    {side.complexity}
                  </span>
                </div>
                {side.ingredients.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {side.ingredients.map((ing, ii) => {
                      const key = `side-${si}-${ii}`;
                      const isChecked = checked.has(key);
                      const scaledQty = formatQuantity(ing.quantity * scale);
                      return (
                        <li key={key}>
                          <button
                            onClick={() => toggleIngredient(key)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-tag-bg/50 ${
                              isChecked ? "opacity-40" : ""
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                isChecked
                                  ? "border-accent bg-accent text-white"
                                  : "border-input-border"
                              }`}
                            >
                              {isChecked && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span className={`text-sm ${isChecked ? "line-through" : ""}`}>
                              <span className="font-medium text-foreground">
                                {scaledQty} {ing.unit}
                              </span>{" "}
                              <span className="text-muted">{ing.name}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {side.prepNotes && (
                  <p className="mt-3 text-sm text-muted italic">{side.prepNotes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
