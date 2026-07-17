"use client";

import { useMemo, useState } from "react";
import type { EnrichedStepSection, Ingredient, IngredientSection, StepSection } from "@meal-planner/types";

interface RecipeStepsToggleProps {
  stepSections: StepSection[];
  enrichedStepSections?: EnrichedStepSection[];
  ingredientSections: IngredientSection[];
}

function formatQuantity(qty: number): string {
  if (qty === 0) return "0";
  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 100) / 100;
  const fractions: Record<number, string> = {
    0.25: "¼", 0.33: "⅓", 0.34: "⅓",
    0.5: "½", 0.67: "⅔", 0.66: "⅔", 0.75: "¾",
  };
  const fracChar = fractions[Math.round(frac * 100) / 100];
  if (frac === 0) return whole.toString();
  if (whole === 0 && fracChar) return fracChar;
  if (whole > 0 && fracChar) return `${whole}${fracChar}`;
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
}

export function RecipeStepsToggle({
  stepSections,
  enrichedStepSections,
  ingredientSections,
}: RecipeStepsToggleProps) {
  const [mode, setMode] = useState<"classic" | "inline">("classic");
  const hasEnriched = !!enrichedStepSections;

  const ingredientMap = useMemo(() => {
    const map = new Map<string, Ingredient>();
    for (const section of ingredientSections) {
      for (const ing of section.items) {
        map.set(ing.name.toLowerCase(), ing);
      }
    }
    return map;
  }, [ingredientSections]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Steps</h2>
        <div className="flex rounded-lg border border-card-border text-xs overflow-hidden">
          <button
            onClick={() => setMode("classic")}
            className={`px-2.5 py-1 transition-colors ${
              mode === "classic"
                ? "bg-accent text-white"
                : "text-muted hover:bg-tag-bg hover:text-foreground"
            }`}
          >
            Classic
          </button>
          <button
            onClick={() => setMode("inline")}
            disabled={!hasEnriched}
            title={!hasEnriched ? "Polish this recipe to enable inline mode" : undefined}
            className={`px-2.5 py-1 transition-colors ${
              mode === "inline"
                ? "bg-accent text-white"
                : hasEnriched
                ? "text-muted hover:bg-tag-bg hover:text-foreground"
                : "cursor-default opacity-40"
            }`}
          >
            Inline
          </button>
        </div>
      </div>

      {mode === "inline" && enrichedStepSections ? (
        (() => {
          let stepNum = 0;
          return enrichedStepSections.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-6" : ""}>
              {section.header && (
                <h3 className="mt-4 mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                  {section.header}
                </h3>
              )}
              <ol className="mt-4 space-y-4">
                {section.steps.map((step) => {
                  stepNum++;
                  const chips = (step.ingredients ?? []).map((ingRef) => {
                    const ing = ingredientMap.get(ingRef.name.toLowerCase());
                    const rawQty = ingRef.quantityOverride ?? ing?.quantity ?? 0;
                    const unit = ingRef.unit ?? ing?.unit ?? "";
                    const prep = ingRef.prep ?? ing?.prep;
                    const qtyText = rawQty > 0
                      ? `${formatQuantity(rawQty)}${unit ? " " + unit : ""}`
                      : unit;
                    return { key: ingRef.name, qtyText, name: ingRef.name, prep };
                  });
                  return (
                    <li key={stepNum} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tag-bg text-xs font-semibold text-tag-text">
                        {stepNum}
                      </span>
                      <div className="flex-1">
                        <span className="text-muted leading-relaxed">{step.text}</span>
                        {chips.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {chips.map((c) => (
                              <span
                                key={c.key}
                                className="inline-flex items-baseline gap-1 rounded bg-tag-bg px-1.5 py-0.5 text-xs"
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
          return stepSections.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-6" : ""}>
              {section.header && (
                <h3 className="mt-4 mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                  {section.header}
                </h3>
              )}
              <ol className="mt-4 space-y-4">
                {section.steps.map((step) => {
                  stepNum++;
                  return (
                    <li key={stepNum} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tag-bg text-xs font-semibold text-tag-text">
                        {stepNum}
                      </span>
                      <span className="text-muted leading-relaxed">{step}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ));
        })()
      )}
    </div>
  );
}
