"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Loader2,
  Sparkles,
  Tag,
  DollarSign,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
} from "lucide-react";
import type { ShoppingList, ShoppingListItem, HebEnrichmentResult } from "@meal-planner/types";
import { CATEGORY_ICONS, groupByCategory } from "@/lib/categories";

export function ShoppingListView({ sessionId }: { sessionId: string }) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichStage, setEnrichStage] = useState("");
  const [enrichResult, setEnrichResult] = useState<HebEnrichmentResult | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [hebConnected, setHebConnected] = useState(false);
  const [carryoverExpanded, setCarryoverExpanded] = useState(false);
  const [addItemName, setAddItemName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest full-list snapshot awaiting persist, so we can flush before actions.
  const pendingItemsRef = useRef<ShoppingListItem[] | null>(null);

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

    fetch("/api/heb/status")
      .then((r) => r.json())
      .then((data) => setHebConnected(!!data.connected))
      .catch(() => setHebConnected(false));
  }, [sessionId]);

  const sendItems = useCallback(
    (items: ShoppingListItem[]) => {
      return fetch(`/api/sessions/${sessionId}/shopping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch((err) => console.error("Failed to save shopping list:", err));
    },
    [sessionId],
  );

  // Single-writer legacy view: keep the debounced full-list PATCH, but stash the
  // latest snapshot so it can be flushed before actions that read the server list.
  const persistItems = useCallback(
    (items: ShoppingListItem[]) => {
      pendingItemsRef.current = items;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const pending = pendingItemsRef.current;
        pendingItemsRef.current = null;
        if (pending) void sendItems(pending);
      }, 500);
    },
    [sendItems],
  );

  // Fire (and await) the pending full-list PATCH immediately.
  const flushPending = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const pending = pendingItemsRef.current;
    pendingItemsRef.current = null;
    if (pending) await sendItems(pending);
  }, [sendItems]);

  function toggleItem(index: number) {
    if (!list) return;
    const updated = list.items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item,
    );
    setList({ ...list, items: updated });
    persistItems(updated);
  }

  function removeItem(index: number) {
    if (!list) return;
    const updated = list.items.filter((_, i) => i !== index);
    setList({ ...list, items: updated });
    persistItems(updated);
  }

  function addCarryoverToList(name: string) {
    if (!list) return;
    const carryover = list.carryoverItems?.find((c) => c.name === name);
    if (!carryover) return;
    const newItem: ShoppingListItem = {
      name: carryover.name,
      quantity: carryover.estimatedQuantity,
      unit: carryover.unit,
      category: "other",
      recipeIds: [],
      checked: false,
    };
    const updatedItems = [...list.items, newItem];
    const updatedCarryover = (list.carryoverItems ?? []).filter((c) => c.name !== name);
    setList({ ...list, items: updatedItems, carryoverItems: updatedCarryover });
    persistItems(updatedItems);
  }

  function handleAddItem() {
    if (!list || !addItemName.trim()) return;
    const newItem: ShoppingListItem = {
      name: addItemName.trim(),
      quantity: 0,
      unit: "",
      category: "other",
      recipeIds: [],
      checked: false,
      source: "staple",
    };
    const updated = [...list.items, newItem];
    setList({ ...list, items: updated });
    persistItems(updated);
    setAddItemName("");
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

  async function enrichList() {
    setEnriching(true);
    setEnrichStage("Checking session...");
    setEnrichResult(null);
    setEnrichError(null);
    // Land any pending edits so the enrich re-read reflects them.
    await flushPending();
    let sawComplete = false;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/shopping/enrich`, {
        method: "POST",
      });
      if (!res.ok || !res.body) {
        setEnrichError("Could not start H-E-B enrichment. Please try again.");
        setEnriching(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));

          switch (event.type) {
            case "session_check":
              setEnrichStage("Checking session...");
              break;
            case "session_refresh":
              setEnrichStage("Establishing HEB session...");
              break;
            case "session_ready":
              setEnrichStage("Session ready");
              break;
            case "item_start":
              setEnrichStage(
                `Searching ${event.index + 1} of ${event.total}: ${event.itemName}`,
              );
              break;
            case "item_done":
              if (event.matched) {
                setEnrichStage(
                  `${event.index + 1}/${event.total}: ${event.productName} — ${event.price ?? ""}`,
                );
              }
              break;
            case "item_error":
              setEnrichStage(`Trouble with ${event.itemName}: ${event.reason}`);
              break;
            case "error":
              setEnrichError(event.message || "H-E-B enrichment failed. Please try again.");
              break;
            case "complete":
              sawComplete = true;
              setList(event.list);
              setEnrichResult(event.result);
              break;
          }
        }
      }
    } catch {
      setEnrichError("H-E-B enrichment was interrupted. Please try again.");
    } finally {
      setEnriching(false);
      setEnrichStage("");
      if (!sawComplete) {
        setEnrichError((prev) => prev ?? "H-E-B enrichment ended unexpectedly. Please try again.");
      }
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
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
  const totalCount = list.items.length;
  const enrichedCount = list.items.filter((i) => i.heb).length;
  const hasEnrichment = enrichedCount > 0;
  const estimatedTotal = list.items.reduce(
    (sum, item) => sum + (item.heb?.price?.amount ?? 0),
    0,
  );
  const checkedTotal = list.items
    .filter((i) => i.checked && i.heb?.price)
    .reduce((sum, item) => sum + (item.heb?.price?.amount ?? 0), 0);
  const progressPercent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  const carryovers = (list as ShoppingList & { carryoverItems?: Array<{ name: string; estimatedQuantity: number; unit: string; neededForRecipe: string; neededForDay: string; sourceWeekOf: string }> }).carryoverItems ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Carryover reminder */}
      {carryovers.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
          <button
            onClick={() => setCarryoverExpanded(!carryoverExpanded)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-400">
                Not on list — assumed on hand ({carryovers.length})
              </span>
            </div>
            {carryoverExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted" />
            )}
          </button>
          {carryoverExpanded && (
            <div className="mt-3 space-y-2">
              {carryovers.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-background px-4 py-2.5"
                >
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {c.name} — ~{c.estimatedQuantity} {c.unit}
                    </span>
                    <p className="text-xs text-muted">
                      For {c.neededForDay}&apos;s {c.neededForRecipe}
                    </p>
                  </div>
                  <button
                    onClick={() => addCarryoverToList(c.name)}
                    className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-tag-bg transition-colors"
                  >
                    <Plus className="h-3 w-3 inline mr-1" />
                    Add to list
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary header */}
      <div className="rounded-xl border border-card-border bg-card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-2xl font-bold text-foreground">{checkedCount}</span>
            <span className="text-sm text-muted"> / {totalCount} items</span>
          </div>
          <div className="flex items-center gap-3">
            {hasEnrichment && estimatedTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-sm font-semibold text-green-500">
                  est. ${estimatedTotal.toFixed(2)}
                </span>
                {checkedTotal > 0 && (
                  <span className="text-xs text-green-500/60 ml-1">
                    (${checkedTotal.toFixed(2)} checked)
                  </span>
                )}
              </div>
            )}
            {hebConnected && !enriching && (
              <button
                onClick={enrichList}
                className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {hasEnrichment ? "Refresh H-E-B" : "Get H-E-B prices"}
              </button>
            )}
            {enriching && (
              <span className="flex items-center gap-1.5 text-xs text-muted max-w-xs truncate">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                {enrichStage}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-card-border overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {enrichResult && !enriching && (
          <div className="mt-3 text-xs text-muted">
            Matched {enrichResult.enrichedCount} of {enrichResult.totalCount} items at H-E-B.
            {enrichResult.failedCount > 0 && (
              <span> {enrichResult.failedCount} unmatched.</span>
            )}
            {enrichResult.sessionExpired && (
              <span className="ml-1 text-amber-500">Session expired — try again.</span>
            )}
          </div>
        )}

        {enrichError && !enriching && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
            <X className="h-3.5 w-3.5 shrink-0" />
            {enrichError}
          </div>
        )}
      </div>

      {/* Category sections */}
      <div className="space-y-5">
        {Array.from(groups.entries()).map(([category, catItems]) => {
          const catChecked = catItems.filter((i) => i.checked).length;
          const catTotal = catItems.length;
          const catEstimate = catItems.reduce((s, i) => s + (i.heb?.price?.amount ?? 0), 0);

          return (
            <div key={category} className="rounded-xl border border-card-border bg-card overflow-hidden">
              {/* Category header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-card-border bg-tag-bg/30">
                <div className="flex items-center gap-2">
                  <span className="text-base">{CATEGORY_ICONS[category] ?? "📦"}</span>
                  <h3 className="text-sm font-semibold text-foreground capitalize">{category}</h3>
                  <span className="text-xs text-muted">
                    {catChecked}/{catTotal}
                  </span>
                </div>
                {hasEnrichment && catEstimate > 0 && (
                  <span className="text-xs font-medium text-muted">
                    ${catEstimate.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Items */}
              <div className="divide-y divide-card-border">
                {catItems.map((item) => {
                  const globalIndex = list.items.indexOf(item);
                  const itemAny = item as ShoppingListItem & { source?: string; isFlexible?: boolean; flexibleDescription?: string };
                  const isStaple = itemAny.source === "staple";
                  const isFlexible = itemAny.isFlexible;

                  return (
                    <div
                      key={`${item.name}-${item.unit}-${globalIndex}`}
                      className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-all hover:bg-tag-bg/20 ${
                        item.checked ? "opacity-40" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(globalIndex)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
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
                      </button>

                      {/* Item details */}
                      <button
                        onClick={() => toggleItem(globalIndex)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className={`flex items-center gap-2 ${item.checked ? "line-through" : ""}`}>
                          {isFlexible && <span className="text-sm">🧺</span>}
                          <span className="text-sm font-semibold text-foreground">{item.name}</span>
                          {!isFlexible && item.quantity > 0 && (
                            <span className="text-xs text-muted">
                              {item.quantity} {item.unit}
                            </span>
                          )}
                          {isStaple && (
                            <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-green-500">
                              staple
                            </span>
                          )}
                        </div>
                        {isFlexible && itemAny.flexibleDescription && !item.checked && (
                          <p className="mt-0.5 text-xs text-muted italic">
                            {itemAny.flexibleDescription}
                          </p>
                        )}
                        {item.heb && !item.checked && (
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                            <span>{item.heb.name}</span>
                            {item.heb.size && (
                              <span className="text-muted/60">({item.heb.size})</span>
                            )}
                          </div>
                        )}
                      </button>

                      {/* Price */}
                      {item.heb && !item.checked && (
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-semibold text-foreground">
                            {item.heb.price?.formatted}
                          </span>
                          {item.heb.isOnSale && (
                            <div className="flex items-center gap-0.5 justify-end mt-0.5">
                              <Tag className="h-3 w-3 text-red-500" />
                              <span className="text-[10px] font-semibold text-red-500">SALE</span>
                            </div>
                          )}
                          {item.heb.inStock === false && (
                            <div className="text-[10px] font-medium text-amber-500 mt-0.5">
                              Out of stock
                            </div>
                          )}
                        </div>
                      )}

                      {/* Remove button for staple/added items */}
                      {isStaple && !item.checked && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeItem(globalIndex); }}
                          className="shrink-0 rounded-lg p-1.5 text-muted opacity-0 transition-all hover:text-red-500 hover:bg-red-500/10 group-hover:opacity-100"
                          style={{ opacity: undefined }}
                          title="Remove from list"
                          onMouseEnter={(e) => { (e.currentTarget.style.opacity = "1"); }}
                          onMouseLeave={(e) => { (e.currentTarget.style.opacity = "0.3"); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add item input */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={addItemName}
          onChange={(e) => setAddItemName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
          placeholder="Add an item..."
          className="flex-1 rounded-lg border border-input-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleAddItem}
          disabled={!addItemName.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}
