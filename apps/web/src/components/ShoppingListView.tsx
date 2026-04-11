"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ShoppingCart, Loader2 } from "lucide-react";
import type { ShoppingList, ShoppingListItem } from "@meal-planner/types";

const CATEGORY_ORDER = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "bread",
  "pasta",
  "canned",
  "condiments",
  "spices",
  "pantry",
  "other",
];

function groupByCategory(items: ShoppingListItem[]): Map<string, ShoppingListItem[]> {
  const groups = new Map<string, ShoppingListItem[]>();
  for (const cat of CATEGORY_ORDER) {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) groups.set(cat, catItems);
  }
  // Catch any categories not in the predefined order
  const known = new Set(CATEGORY_ORDER);
  for (const item of items) {
    if (!known.has(item.category)) {
      const existing = groups.get(item.category) ?? [];
      existing.push(item);
      groups.set(item.category, existing);
    }
  }
  return groups;
}

export function ShoppingListView({ sessionId }: { sessionId: string }) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/shopping`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data && !data.error) setList(data);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const persistItems = useCallback(
    (items: ShoppingListItem[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetch(`/api/sessions/${sessionId}/shopping`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
      }, 500);
    },
    [sessionId],
  );

  function toggleItem(index: number) {
    if (!list) return;
    const updated = list.items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item,
    );
    setList({ ...list, items: updated });
    persistItems(updated);
  }

  async function generateList() {
    setGenerating(true);
    const res = await fetch(`/api/sessions/${sessionId}/shopping`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setList(data);
      setNotFound(false);
    }
    setGenerating(false);
  }

  if (loading) {
    return <div className="py-16 text-center text-muted">Loading shopping list...</div>;
  }

  if (notFound && !list) {
    return (
      <div className="py-16 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted/40" />
        <p className="mt-4 text-muted">No shopping list generated yet.</p>
        <button
          onClick={generateList}
          disabled={generating}
          className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating...
            </span>
          ) : (
            "Generate Shopping List"
          )}
        </button>
      </div>
    );
  }

  if (!list) return null;

  const groups = groupByCategory(list.items);
  const checkedCount = list.items.filter((i) => i.checked).length;

  return (
    <div>
      <div className="mb-4 text-sm text-muted">
        {checkedCount} of {list.items.length} items checked
      </div>
      <div className="space-y-6">
        {Array.from(groups.entries()).map(([category, items]) => (
          <div key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {category}
            </h3>
            <div className="space-y-1">
              {items.map((item) => {
                const globalIndex = list.items.indexOf(item);
                return (
                  <button
                    key={`${item.name}-${item.unit}`}
                    onClick={() => toggleItem(globalIndex)}
                    className={`flex w-full items-center gap-3 rounded-lg border border-card-border bg-card px-4 py-3 text-left transition-all ${
                      item.checked ? "opacity-50" : ""
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        item.checked
                          ? "border-accent bg-accent text-white"
                          : "border-input-border"
                      }`}
                    >
                      {item.checked && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${item.checked ? "line-through text-muted" : "text-foreground"}`}>
                        {item.quantity} {item.unit} <span className="font-medium">{item.name}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
