"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Minus, Plus, Wifi } from "lucide-react";
import type { Recipe } from "@meal-planner/types";
import { useWakeLock } from "@/hooks/useWakeLock";

interface CookingViewProps {
  recipe: Recipe;
}

function formatQuantity(qty: number): string {
  if (qty === 0) return "0";

  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 100) / 100;

  const fractions: Record<number, string> = {
    0.25: "\u00BC",
    0.33: "\u2153",
    0.34: "\u2153",
    0.5: "\u00BD",
    0.67: "\u2154",
    0.66: "\u2154",
    0.75: "\u00BE",
  };

  const fracChar = fractions[Math.round(frac * 100) / 100];

  if (frac === 0) return whole.toString();
  if (whole === 0 && fracChar) return fracChar;
  if (whole > 0 && fracChar) return `${whole}${fracChar}`;
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
}

export function CookingView({ recipe }: CookingViewProps) {
  const [servings, setServings] = useState(recipe.servings);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const { isActive: wakeLockActive } = useWakeLock();

  const scale = servings / recipe.servings;
  const totalTime = recipe.prepTime + recipe.cookTime;

  function toggleIngredient(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/week"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> This Week
        </Link>
        {wakeLockActive && (
          <span className="flex items-center gap-1 text-xs text-green-500" title="Screen will stay awake">
            <Wifi className="h-3 w-3" /> Awake
          </span>
        )}
      </div>

      {/* Recipe title */}
      <h1 className="mt-4 text-2xl font-bold text-foreground">{recipe.name}</h1>

      {/* Time + servings bar */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Prep {recipe.prepTime}m
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Cook {recipe.cookTime}m
          </span>
          <span className="font-medium text-foreground">{totalTime}m total</span>
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

      {/* Ingredients checklist */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-foreground">Ingredients</h2>
        <ul className="mt-4 space-y-1">
          {recipe.ingredients.map((ing, i) => {
            const isChecked = checked.has(i);
            const scaledQty = formatQuantity(ing.quantity * scale);
            return (
              <li key={i}>
                <button
                  onClick={() => toggleIngredient(i)}
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
                    <span className="text-muted">{ing.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Steps */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Steps</h2>
        <ol className="mt-4 space-y-6">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-bold text-accent">
                {i + 1}
              </span>
              <p className="pt-1 text-lg leading-relaxed text-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
