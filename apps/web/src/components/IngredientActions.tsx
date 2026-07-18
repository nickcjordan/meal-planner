"use client";

import { useState } from "react";
import { Home, RotateCcw, Check } from "lucide-react";
import { AddToListModal, type ListTarget } from "./AddToListModal";
import type { IngredientSection } from "@meal-planner/types";
import { Badge } from "@/components/ui";
import { tryApi } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
}

interface IngredientActionsProps {
  ingredientSections: IngredientSection[];
  /** Multiplier applied to displayed quantities (servings scaler). */
  scale?: number;
}

type AddedState = Record<string, ListTarget>;

/** Format a scaled quantity for display (mirrors CookingView). */
function formatQuantity(qty: number): string {
  if (qty === 0) return "0";
  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 100) / 100;
  const fractions: Record<number, string> = {
    0.25: "¼",
    0.33: "⅓",
    0.34: "⅓",
    0.5: "½",
    0.66: "⅔",
    0.67: "⅔",
    0.75: "¾",
  };
  const fracChar = fractions[Math.round(frac * 100) / 100];
  if (frac === 0) return whole.toString();
  if (whole === 0 && fracChar) return fracChar;
  if (whole > 0 && fracChar) return `${whole}${fracChar}`;
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
}

export function IngredientActions({ ingredientSections, scale = 1 }: IngredientActionsProps) {
  const { toast } = useToast();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    name: string;
    target: ListTarget;
    category?: string;
    key: string;
  } | null>(null);
  const [added, setAdded] = useState<AddedState>({});

  function toggleExpand(key: string) {
    setExpandedKey(expandedKey === key ? null : key);
  }

  function openModal(ing: Ingredient, target: ListTarget, key: string) {
    setModal({
      name: ing.name,
      target,
      category: ing.category,
      key,
    });
  }

  async function handleConfirm() {
    if (!modal) return;

    if (modal.target === "pantry") {
      // Use the categorize endpoint first for smart categorization.
      let category = modal.category ?? "other";
      let aliases: string[] | undefined;

      const catResult = await tryApi<{ results?: { category: string; aliases?: string[] }[] }>(
        "/api/pantry/categorize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [modal.name] }),
        },
      );
      if (catResult.ok) {
        const result = catResult.data.results?.[0];
        if (result) {
          category = result.category;
          aliases = result.aliases;
        }
      }

      const res = await tryApi("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modal.name, category, aliases }),
      });

      // 409 means it already exists in the pantry — treat as success.
      if (res.ok || (!res.ok && res.error.status === 409)) {
        setAdded((prev) => ({ ...prev, [modal.key]: "pantry" }));
        toast(`${modal.name} is in your pantry`, "success");
      } else {
        toast(res.error.message || "Couldn't add to pantry", "error");
        setModal(null);
        return;
      }
    } else {
      // Add as a weekly staple.
      const res = await tryApi("/api/staples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modal.name,
          style: "specific",
          category: modal.category ?? "other",
          frequency: "weekly",
        }),
      });

      if (res.ok) {
        setAdded((prev) => ({ ...prev, [modal.key]: "staples" }));
        toast(`${modal.name} added to weekly staples`, "success");
      } else {
        toast(res.error.message || "Couldn't add staple", "error");
        setModal(null);
        return;
      }
    }

    setModal(null);
    setExpandedKey(null);
  }

  return (
    <>
      {ingredientSections.map((section, si) => (
        <div key={si}>
          {section.header && (
            <h4 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0">
              {section.header}
            </h4>
          )}
          <ul className={`${si === 0 && !section.header ? "mt-4" : "mt-1"} space-y-1`}>
            {section.items.map((ing, ii) => {
              const key = `s${si}-i${ii}`;
              const isExpanded = expandedKey === key;
              const addedAs = added[key];

              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      isExpanded ? "bg-tag-bg" : "hover:bg-tag-bg/50"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {formatQuantity(ing.quantity * scale)} {ing.unit}
                    </span>
                    <span className="flex-1 text-muted">{ing.name}</span>
                    {addedAs && (
                      <Badge color={addedAs === "pantry" ? "success" : "accent"}>
                        <Check className="h-3 w-3" />
                        {addedAs === "pantry" ? "In pantry" : "Staple"}
                      </Badge>
                    )}
                  </button>

                  {isExpanded && !addedAs && (
                    <div className="ml-2 flex gap-1.5 pb-1 pl-2 pt-0.5">
                      <button
                        onClick={() => openModal(ing, "pantry", key)}
                        className="flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-success/50 hover:bg-success/5 hover:text-success"
                      >
                        <Home className="h-3 w-3" />+ Pantry
                      </button>
                      <button
                        onClick={() => openModal(ing, "staples", key)}
                        className="flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
                      >
                        <RotateCcw className="h-3 w-3" />+ Staple
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {modal && (
        <AddToListModal
          ingredientName={modal.name}
          target={modal.target}
          suggestedCategory={modal.category}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
