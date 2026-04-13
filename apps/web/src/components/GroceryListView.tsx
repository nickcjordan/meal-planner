"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  Tag,
  DollarSign,
  X,
  Plus,
  Trash2,
  ClipboardCopy,
  ArrowDownWideNarrow,
  LayoutGrid,
  Check,
} from "lucide-react";
import type { GroceryList, GroceryListItem, HebEnrichmentResult } from "@meal-planner/types";
import { CATEGORY_ICONS, groupByCategory } from "@/lib/categories";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type SortMode = "category" | "price";

function getSourceLabel(item: GroceryListItem): { text: string; color: string } | null {
  if (item.sources.length === 0) return null;

  // Check for adaptation source first — it's the most important indicator
  const adaptSource = item.sources.find((s) => s.type === "adaptation");
  if (adaptSource?.type === "adaptation") {
    const { adaptationName } = adaptSource;
    return {
      text: `${adaptationName} swap`,
      color: "text-emerald-500 bg-emerald-500/10",
    };
  }

  const first = item.sources[0];
  if (first.type === "manual") return { text: "manual", color: "text-muted bg-card-border/50" };
  if (first.type === "staple") return { text: "staple", color: "text-green-500 bg-green-500/10" };
  if (first.type === "recipe") {
    const recipeCount = item.sources.filter((s) => s.type === "recipe").length;
    const recipeName = first.recipeName;
    return {
      text: recipeCount > 1 ? `${recipeName} +${recipeCount - 1}` : recipeName,
      color: "text-accent bg-accent/10",
    };
  }
  if (first.type === "extra") {
    return { text: first.extraName, color: "text-accent bg-accent/10" };
  }
  return null;
}

export function GroceryListView() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichStage, setEnrichStage] = useState("");
  const [enrichResult, setEnrichResult] = useState<HebEnrichmentResult | null>(null);
  const [hebConnected, setHebConnected] = useState(false);
  const [addItemName, setAddItemName] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [exportCopied, setExportCopied] = useState(false);
  const [clearingChecked, setClearingChecked] = useState(false);
  const [unmergedSessionId, setUnmergedSessionId] = useState<string | null>(null);
  const [unmergedWeekOf, setUnmergedWeekOf] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/grocery")
      .then((r) => r.json())
      .then((data) => { if (!data.error) setList(data); })
      .finally(() => setLoading(false));

    fetch("/api/heb/status")
      .then((r) => r.json())
      .then((data) => setHebConnected(!!data.store))
      .catch(() => setHebConnected(false));

    // Check for unmerged session
    fetch("/api/week/current")
      .then((r) => { if (r.ok) return r.json(); return null; })
      .then((data) => {
        const session = data?.session;
        if (session?.id && session.status === "confirmed") {
          // We'll check mergedSessionIds once list loads
          setUnmergedSessionId(session.id);
          setUnmergedWeekOf(session.weekOf);
        }
      })
      .catch(() => {});
  }, []);

  // Once both list and unmergedSessionId are available, check if already merged
  useEffect(() => {
    if (list && unmergedSessionId && list.mergedSessionIds.includes(unmergedSessionId)) {
      setUnmergedSessionId(null);
    }
  }, [list, unmergedSessionId]);

  const persistItems = useCallback(
    (items: GroceryListItem[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetch("/api/grocery", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
      }, 500);
    },
    [],
  );

  function toggleItem(id: string) {
    if (!list) return;
    const updated = list.items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item,
    );
    setList({ ...list, items: updated });
    persistItems(updated);
  }

  function removeItem(id: string) {
    if (!list) return;
    const updated = list.items.filter((item) => item.id !== id);
    setList({ ...list, items: updated });
    persistItems(updated);
  }

  async function handleAddItem() {
    if (!list || !addItemName.trim()) return;
    try {
      const res = await fetch("/api/grocery/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addItemName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setList(data.list);
      }
    } catch (err) {
      console.error("Failed to add item:", err);
    }
    setAddItemName("");
  }

  async function handleClearChecked() {
    if (!list) return;
    const count = list.items.filter((i) => i.checked).length;
    if (count === 0) return;

    setClearingChecked(true);
    setShowClearConfirm(false);
    try {
      const res = await fetch("/api/grocery/clear-checked", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setList(data.list);
        toast(`Cleared ${count} item${count !== 1 ? "s" : ""}`);
      }
    } catch (err) {
      console.error("Failed to clear checked:", err);
      toast("Failed to clear items", "error");
    } finally {
      setClearingChecked(false);
    }
  }

  async function handleExport() {
    try {
      const res = await fetch("/api/grocery/export?format=text");
      if (res.ok) {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setExportCopied(true);
        setTimeout(() => setExportCopied(false), 2000);
        toast("Copied to clipboard", "info");
      }
    } catch (err) {
      console.error("Failed to export:", err);
    }
  }

  async function handleMerge() {
    if (!unmergedSessionId) return;
    setMerging(true);
    try {
      const res = await fetch("/api/grocery/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: unmergedSessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setList(data.list);
        setUnmergedSessionId(null);
      }
    } catch (err) {
      console.error("Failed to merge:", err);
    } finally {
      setMerging(false);
    }
  }

  async function enrichList() {
    setEnriching(true);
    setEnrichStage("Checking session...");
    setEnrichResult(null);
    try {
      const res = await fetch("/api/grocery/enrich", { method: "POST" });
      if (!res.ok || !res.body) {
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
            case "complete":
              setList(event.list);
              setEnrichResult(event.result);
              break;
          }
        }
      }
    } finally {
      setEnriching(false);
      setEnrichStage("");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-card-border bg-card px-4 py-3">
            <div className="h-5 w-5 animate-pulse rounded bg-card-border/50" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-card-border/50" />
            <div className="flex-1" />
            <div className="h-3 w-16 animate-pulse rounded bg-card-border/50" />
          </div>
        ))}
      </div>
    );
  }

  if (!list) return null;

  const checkedCount = list.items.filter((i) => i.checked).length;
  const totalCount = list.items.length;
  const hasEnrichment = list.items.some((i) => i.heb);
  const estimatedTotal = list.items.reduce(
    (sum, item) => sum + (item.heb?.price?.amount ?? 0),
    0,
  );
  const checkedTotal = list.items
    .filter((i) => i.checked && i.heb?.price)
    .reduce((sum, item) => sum + (item.heb?.price?.amount ?? 0), 0);
  const progressPercent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  // Determine displayed items based on sort mode
  let displayGroups: Map<string, GroceryListItem[]>;
  if (sortMode === "price" && hasEnrichment) {
    const sorted = [...list.items].sort(
      (a, b) => (b.heb?.price?.amount ?? 0) - (a.heb?.price?.amount ?? 0),
    );
    displayGroups = new Map([["all", sorted]]);
  } else {
    displayGroups = groupByCategory(list.items);
  }

  const showImportBanner = unmergedSessionId && !mergeDismissed;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Import banner */}
      {showImportBanner && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-accent" />
              <span className="text-sm text-foreground">
                <span className="font-semibold">
                  Week of{" "}
                  {unmergedWeekOf
                    ? new Date(unmergedWeekOf).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      })
                    : "this week"}
                </span>{" "}
                meal plan is ready to add.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMerge}
                disabled={merging}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {merging ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add to List
              </button>
              <button
                onClick={() => setMergeDismissed(true)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary header */}
      <div className="rounded-xl border border-card-border bg-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            {totalCount > 0 ? (
              <>
                <span className="text-2xl font-bold text-foreground">{checkedCount}</span>
                <span className="text-sm text-muted"> / {totalCount} items</span>
              </>
            ) : (
              <span className="text-sm text-muted">No items yet</span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {totalCount > 0 && (
          <div className="h-2 rounded-full bg-card-border overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

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
      </div>

      {/* Toolbar */}
      {totalCount > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {/* Sort toggle */}
          {hasEnrichment && (
            <div className="flex rounded-lg border border-card-border overflow-hidden">
              <button
                onClick={() => setSortMode("category")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortMode === "category"
                    ? "bg-accent text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Category
              </button>
              <button
                onClick={() => setSortMode("price")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortMode === "price"
                    ? "bg-accent text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                Price
              </button>
            </div>
          )}

          {/* HEB enrichment */}
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

          <div className="flex-1" />

          {/* Export — prominent since app is local-only */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {exportCopied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardCopy className="h-4 w-4" />
                Copy List
              </>
            )}
          </button>

          {/* Clear checked */}
          {checkedCount > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearingChecked}
              className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-500/50 hover:text-red-500"
            >
              {clearingChecked ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Clear Checked ({checkedCount})
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-card-border/30 flex items-center justify-center mb-4">
            <Plus className="h-6 w-6 text-muted/40" />
          </div>
          <p className="text-muted mb-1">Your grocery list is empty.</p>
          <p className="text-sm text-muted/60">
            Add items manually below, or confirm a meal plan to import ingredients.
          </p>
        </div>
      )}

      {/* Category sections */}
      <div className="space-y-5">
        {Array.from(displayGroups.entries()).map(([groupKey, groupItems]) => {
          const catChecked = groupItems.filter((i) => i.checked).length;
          const catTotal = groupItems.length;
          const catEstimate = groupItems.reduce((s, i) => s + (i.heb?.price?.amount ?? 0), 0);
          const isAllGroup = groupKey === "all";

          return (
            <div key={groupKey} className="rounded-xl border border-card-border bg-card overflow-hidden">
              {/* Category header */}
              {!isAllGroup && (
                <div className="flex items-center justify-between px-5 py-3 border-b border-card-border bg-tag-bg/30">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{CATEGORY_ICONS[groupKey] ?? "📦"}</span>
                    <h3 className="text-sm font-semibold text-foreground capitalize">{groupKey}</h3>
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
              )}
              {isAllGroup && (
                <div className="flex items-center justify-between px-5 py-3 border-b border-card-border bg-tag-bg/30">
                  <div className="flex items-center gap-2">
                    <ArrowDownWideNarrow className="h-4 w-4 text-muted" />
                    <h3 className="text-sm font-semibold text-foreground">Sorted by Price</h3>
                    <span className="text-xs text-muted">
                      {catChecked}/{catTotal}
                    </span>
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="divide-y divide-card-border">
                {groupItems.map((item) => {
                  const sourceLabel = getSourceLabel(item);

                  return (
                    <div
                      key={item.id}
                      className={`group flex w-full items-center gap-4 px-5 py-3 text-left transition-all hover:bg-tag-bg/20 ${
                        item.checked ? "opacity-40" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(item.id)}
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
                        onClick={() => toggleItem(item.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className={`flex items-center gap-2 ${item.checked ? "line-through" : ""}`}>
                          {item.isFlexible && <span className="text-sm">🧺</span>}
                          <span className="text-sm font-semibold text-foreground">{item.name}</span>
                          {!item.isFlexible && item.quantity > 0 && (
                            <span className="text-xs text-muted">
                              {item.quantity} {item.unit}
                            </span>
                          )}
                          {sourceLabel && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${sourceLabel.color}`}>
                              {sourceLabel.text}
                            </span>
                          )}
                        </div>
                        {item.isFlexible && item.flexibleDescription && !item.checked && (
                          <p className="mt-0.5 text-xs text-muted italic">
                            {item.flexibleDescription}
                          </p>
                        )}
                        {item.notes && !item.checked && (
                          <p className="mt-0.5 text-xs text-muted italic">{item.notes}</p>
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

                      {/* Remove button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                        className="shrink-0 rounded-lg p-1.5 text-muted opacity-0 transition-all hover:text-red-500 hover:bg-red-500/10 group-hover:opacity-100"
                        title="Remove from list"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
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

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear checked items"
        message={`Remove ${checkedCount} checked item${checkedCount !== 1 ? "s" : ""} from your grocery list?`}
        confirmLabel="Clear"
        onConfirm={handleClearChecked}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
