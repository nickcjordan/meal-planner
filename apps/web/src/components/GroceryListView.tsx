"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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
  MapPin,
  Check,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { GroceryList, GroceryListItem, HebEnrichmentResult } from "@meal-planner/types";
import { CATEGORY_ICONS, AISLE_CATEGORY_ORDER, groupByCategory } from "@/lib/categories";
import { useToast } from "@/components/Toast";
import { ConfirmDialog, Button, Card, EmptyState } from "@/components/ui";
import { api, tryApi, ApiError } from "@/lib/api";
import { decodeHtmlEntities } from "@/lib/format";
import { formatWeekOf } from "@/lib/week";

type SortMode = "category" | "aisle" | "price";

type ChipColor = "accent" | "success" | "neutral";

const CHIP_CLASSES: Record<ChipColor, string> = {
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  neutral: "bg-tag-bg text-muted",
};

function getSourceLabel(item: GroceryListItem): { text: string; color: ChipColor } | null {
  if (item.sources.length === 0) return null;

  // Check for adaptation source first — it's the most important indicator
  const adaptSource = item.sources.find((s) => s.type === "adaptation");
  if (adaptSource?.type === "adaptation") {
    return { text: `${adaptSource.adaptationName} swap`, color: "success" };
  }

  const first = item.sources[0];
  if (first.type === "manual") return { text: "manual", color: "neutral" };
  if (first.type === "staple") return { text: "staple", color: "success" };
  if (first.type === "recipe") {
    const recipeCount = item.sources.filter((s) => s.type === "recipe").length;
    const { recipeName } = first;
    return {
      text: recipeCount > 1 ? `${recipeName} +${recipeCount - 1}` : recipeName,
      color: "accent",
    };
  }
  if (first.type === "extra") return { text: first.extraName, color: "accent" };
  return null;
}

// ── Near-duplicate detection (display-only) ────────────────────────────────
// Words that describe a form/quality of an ingredient but don't change what it
// fundamentally is. Two adjacent rows that are identical once these are removed
// (e.g. "fresh cilantro" / "fresh cilantro leaves") read as near-duplicates.
const SIMILARITY_STOPWORDS = new Set([
  "fresh",
  "organic",
  "leaf",
  "leaves",
  "chopped",
  "diced",
  "minced",
  "sliced",
  "whole",
  "large",
  "small",
  "medium",
  "ground",
  "raw",
  "of",
  "the",
]);

function stemToken(token: string): string {
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 2 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Normalized identity key: sorted content tokens with modifiers stripped. */
function similarityKey(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(stemToken)
    .filter((t) => !SIMILARITY_STOPWORDS.has(t));
  return Array.from(new Set(tokens)).sort().join(" ");
}

/**
 * For a sequence of items, flag which ones are near-duplicates of an adjacent
 * neighbor. Returns a boolean array aligned to `items` — true when the item
 * shares its normalized key with the row directly above or below it.
 */
function computeSimilarFlags(items: GroceryListItem[]): boolean[] {
  const keys = items.map((i) => similarityKey(i.name));
  return keys.map(
    (k, idx) =>
      k !== "" &&
      ((idx > 0 && keys[idx - 1] === k) ||
        (idx < keys.length - 1 && keys[idx + 1] === k)),
  );
}

export function GroceryListView() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichStage, setEnrichStage] = useState("");
  const [enrichResult, setEnrichResult] = useState<HebEnrichmentResult | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [hebConnected, setHebConnected] = useState(false);
  const [hebStatusKnown, setHebStatusKnown] = useState(false);
  const [addItemName, setAddItemName] = useState("");
  const [adding, setAdding] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [hideChecked, setHideChecked] = useState(false);
  const [expandedCart, setExpandedCart] = useState<Set<string>>(new Set());
  const [clearingChecked, setClearingChecked] = useState(false);
  const [unmergedSessionId, setUnmergedSessionId] = useState<string | null>(null);
  const [unmergedWeekOf, setUnmergedWeekOf] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { toast } = useToast();

  // Keep the latest list in a ref so toast Undo callbacks (which close over an
  // old render) can rebuild against current state.
  const listRef = useRef<GroceryList | null>(null);
  listRef.current = list;

  // Per-item debounce for toggle saves: one pending timer + desired `checked`
  // value keyed by item id, so toggling several items rapidly never clobbers.
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingChecked = useRef<Map<string, boolean>>(new Map());
  // Single serialized write queue. Every item mutation (checked PATCH and DELETE)
  // hits a whole-list read-modify-write on the server; running two in parallel
  // means the later save clobbers the earlier one, so we chain them.
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Dedupe background write-failure toasts within a short window so a dropped
  // connection doesn't spew one toast per queued mutation.
  const lastWriteErrorAt = useRef(0);

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await tryApi<GroceryList>("/api/grocery");
    if (res.ok) {
      setList(res.data);
    } else {
      setLoadError(res.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadList();

    void tryApi<{ connected?: boolean }>("/api/heb/status").then((res) => {
      setHebConnected(res.ok ? !!res.data.connected : false);
      setHebStatusKnown(true);
    });

    // Check for an unmerged confirmed session so we can offer to import it.
    void tryApi<{ session?: { id?: string; status?: string; weekOf?: string } }>(
      "/api/week/current",
    ).then((res) => {
      if (!res.ok) return;
      const session = res.data.session;
      if (session?.id && session.status === "confirmed") {
        setUnmergedSessionId(session.id);
        setUnmergedWeekOf(session.weekOf ?? null);
      }
    });
  }, [loadList]);

  // Once both list and unmergedSessionId are available, hide the banner if the
  // session was already merged.
  useEffect(() => {
    if (list && unmergedSessionId && list.mergedSessionIds.includes(unmergedSessionId)) {
      setUnmergedSessionId(null);
    }
  }, [list, unmergedSessionId]);

  // Serialize a mutation onto the single write queue so only one item-mutation
  // request is ever in flight. The chain itself never rejects.
  const enqueueWrite = useCallback((task: () => Promise<unknown>) => {
    const run = writeQueueRef.current.then(() => task());
    writeQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  // Surface a background write failure and re-sync from the server so the
  // optimistic UI can't drift silently. Deduped within 4s.
  const handleWriteFailure = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - lastWriteErrorAt.current > 4000) {
        lastWriteErrorAt.current = now;
        toast(message || "Couldn't save your change — refreshing the list", "error");
      }
      void loadList();
    },
    [toast, loadList],
  );

  // Fire a single per-item checked PATCH through the write queue.
  const sendCheckedPatch = useCallback(
    (id: string, checked: boolean) =>
      enqueueWrite(async () => {
        const res = await tryApi(`/api/grocery/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checked }),
        });
        if (!res.ok) handleWriteFailure(res.error.message);
      }),
    [enqueueWrite, handleWriteFailure],
  );

  // Debounce a toggle save for one item without disturbing others' timers.
  const scheduleCheckedSave = useCallback(
    (id: string, checked: boolean) => {
      pendingChecked.current.set(id, checked);
      const existing = pendingTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        pendingTimers.current.delete(id);
        const desired = pendingChecked.current.get(id);
        pendingChecked.current.delete(id);
        if (desired !== undefined) void sendCheckedPatch(id, desired);
      }, 500);
      pendingTimers.current.set(id, timer);
    },
    [sendCheckedPatch],
  );

  // Flush every pending debounce, then await the write-queue tail so every
  // issued item mutation has settled before an action that reads the list.
  const flushPendingSaves = useCallback(async () => {
    for (const [id, timer] of pendingTimers.current) {
      clearTimeout(timer);
      const desired = pendingChecked.current.get(id);
      pendingChecked.current.delete(id);
      if (desired !== undefined) void sendCheckedPatch(id, desired);
    }
    pendingTimers.current.clear();
    await writeQueueRef.current;
  }, [sendCheckedPatch]);

  // Persist a full replacement items array (used by Undo restores). Optimistic,
  // then reconciled with the server's saved copy; rolls back via refetch on
  // failure. Rides the write queue so it can't race in-flight item mutations.
  const persistItems = useCallback(
    (nextItems: GroceryListItem[]) => {
      setList((prev) => (prev ? { ...prev, items: nextItems } : prev));
      void enqueueWrite(async () => {
        const res = await tryApi<GroceryList>("/api/grocery", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: nextItems }),
        });
        if (res.ok) setList(res.data);
        else handleWriteFailure(res.error.message);
      });
    },
    [enqueueWrite, handleWriteFailure],
  );

  function toggleItem(id: string) {
    if (!list) return;
    let nextChecked = false;
    const updated = list.items.map((item) => {
      if (item.id === id) {
        nextChecked = !item.checked;
        return { ...item, checked: nextChecked };
      }
      return item;
    });
    setList({ ...list, items: updated });
    scheduleCheckedSave(id, nextChecked);
  }

  function removeItem(item: GroceryListItem) {
    if (!list) return;
    const id = item.id;
    // Cancel any pending toggle for this item — we're deleting it outright.
    const timer = pendingTimers.current.get(id);
    if (timer) clearTimeout(timer);
    pendingTimers.current.delete(id);
    pendingChecked.current.delete(id);

    const originalIndex = list.items.findIndex((i) => i.id === id);
    const removedSnapshot = list.items[originalIndex] ?? item;
    setList({ ...list, items: list.items.filter((i) => i.id !== id) });

    void enqueueWrite(async () => {
      const res = await tryApi(`/api/grocery/items/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast(`Removed ${removedSnapshot.name}`, "info", {
          action: {
            label: "Undo",
            onClick: () => {
              const current = listRef.current;
              if (!current) return;
              const insertAt = Math.min(originalIndex, current.items.length);
              const restored = [...current.items];
              restored.splice(insertAt, 0, removedSnapshot);
              persistItems(restored);
            },
          },
        });
      } else {
        handleWriteFailure(res.error.message);
      }
    });
  }

  async function handleAddItem() {
    const name = addItemName.trim();
    if (!list || !name || adding) return;
    setAdding(true);
    await flushPendingSaves();
    try {
      // The add rides the write queue too, so a toggle/delete issued while it's
      // in flight lands after it — not racing it.
      const data = (await enqueueWrite(() =>
        api<{ list: GroceryList }>("/api/grocery/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      )) as { list: GroceryList };
      setList(data.list);
      setAddItemName("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add item", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleClearChecked() {
    if (!list) return;
    const removedItems = list.items.filter((i) => i.checked);
    const count = removedItems.length;
    if (count === 0) return;

    setClearingChecked(true);
    setShowClearConfirm(false);
    try {
      await flushPendingSaves();
      const data = (await enqueueWrite(() =>
        api<{ list: GroceryList }>("/api/grocery/clear-checked", { method: "POST" }),
      )) as { list: GroceryList };
      setList(data.list);
      toast(`Cleared ${count} item${count !== 1 ? "s" : ""}`, "success", {
        action: {
          label: "Undo",
          onClick: () => {
            const current = listRef.current;
            if (!current) return;
            // Re-append the exact removed rows (their checked state included).
            persistItems([...current.items, ...removedItems]);
          },
        },
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to clear items", "error");
    } finally {
      setClearingChecked(false);
    }
  }

  async function handleExport() {
    try {
      const text = await api<string>("/api/grocery/export?format=text");
      await navigator.clipboard.writeText(text);
      toast("Copied list to clipboard", "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't copy the list", "error");
    }
  }

  async function handleMerge() {
    if (!unmergedSessionId) return;
    setMerging(true);
    try {
      await flushPendingSaves();
      const data = (await enqueueWrite(() =>
        api<{ list: GroceryList; resynced?: boolean }>("/api/grocery/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: unmergedSessionId }),
        }),
      )) as { list: GroceryList; resynced?: boolean };
      setList(data.list);
      setUnmergedSessionId(null);
      toast(
        data.resynced ? "Grocery list resynced with the updated plan" : "Meal plan added to your list",
        "success",
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add the meal plan", "error");
    } finally {
      setMerging(false);
    }
  }

  async function enrichList() {
    setEnriching(true);
    setEnrichStage("Checking session...");
    setEnrichResult(null);
    setEnrichError(null);
    let sawComplete = false;
    try {
      // Streaming SSE endpoint — read the body directly rather than via api().
      const res = await fetch("/api/grocery/enrich", { method: "POST" });
      if (!res.ok || !res.body) {
        let message = "Could not start H-E-B enrichment. Please try again.";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON body — keep the default message */
        }
        setEnrichError(message);
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
              setEnrichStage("Establishing H-E-B session...");
              break;
            case "session_ready":
              setEnrichStage("Session ready");
              break;
            case "item_start":
              setEnrichStage(`Searching ${event.index + 1} of ${event.total}: ${event.itemName}`);
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

  // ── Loading / error states ──
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-card-border bg-card px-4 py-3"
          >
            <div className="h-5 w-5 animate-pulse rounded bg-card-border/50" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-card-border/50" />
            <div className="flex-1" />
            <div className="h-3 w-16 animate-pulse rounded bg-card-border/50" />
          </div>
        ))}
      </div>
    );
  }

  if (loadError || !list) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load your grocery list"
          description={loadError ?? "Something went wrong. Please try again."}
          action={
            <Button variant="secondary" onClick={() => void loadList()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const checkedCount = list.items.filter((i) => i.checked).length;
  const totalCount = list.items.length;
  const hasEnrichment = list.items.some((i) => i.heb);
  const estimatedTotal = list.items.reduce((sum, item) => sum + (item.heb?.price?.amount ?? 0), 0);
  const checkedTotal = list.items
    .filter((i) => i.checked && i.heb?.price)
    .reduce((sum, item) => sum + (item.heb?.price?.amount ?? 0), 0);
  const progressPercent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
  const nearlyDone = totalCount > 0 && progressPercent >= 80;

  // Determine displayed groups based on sort mode
  let displayGroups: Map<string, GroceryListItem[]>;
  if (sortMode === "price" && hasEnrichment) {
    const sorted = [...list.items].sort(
      (a, b) => (b.heb?.price?.amount ?? 0) - (a.heb?.price?.amount ?? 0),
    );
    displayGroups = new Map([["all", sorted]]);
  } else if (sortMode === "aisle") {
    const hasAisleData = list.items.some((i) => i.heb?.aisleLocation);
    if (hasAisleData) {
      const grouped = new Map<string, GroceryListItem[]>();
      for (const item of list.items) {
        const key = item.heb?.aisleLocation ?? "Other";
        const bucket = grouped.get(key) ?? [];
        bucket.push(item);
        grouped.set(key, bucket);
      }
      const sorted = Array.from(grouped.entries()).sort(([a], [b]) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });
      displayGroups = new Map(sorted);
    } else {
      displayGroups = groupByCategory(list.items, AISLE_CATEGORY_ORDER);
    }
  } else {
    displayGroups = groupByCategory(list.items);
  }

  const showImportBanner = unmergedSessionId && !mergeDismissed;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Import banner (scrolls away) */}
      {showImportBanner && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Plus className="h-4 w-4 shrink-0 text-accent" />
              <span className="text-sm text-foreground truncate">
                <span className="font-semibold">
                  Week of{" "}
                  {unmergedWeekOf
                    ? formatWeekOf(unmergedWeekOf, { month: "long", day: "numeric" })
                    : "this week"}
                </span>{" "}
                meal plan is ready to add.
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" onClick={handleMerge} loading={merging}>
                {!merging && <Plus className="h-3.5 w-3.5" />}
                Add to List
              </Button>
              <Button
                variant="icon"
                size="sm"
                onClick={() => setMergeDismissed(true)}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky top chrome: summary + toolbar */}
      <div className="sticky top-0 z-20 -mt-2 bg-background pt-2 pb-3">
        <Card padding="sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {totalCount > 0 ? (
                <>
                  <span className="text-2xl font-bold text-foreground">{checkedCount}</span>
                  <span className="text-sm text-muted"> / {totalCount} items</span>
                </>
              ) : (
                <span className="text-sm text-muted">No items yet</span>
              )}
            </div>
            {hasEnrichment && estimatedTotal > 0 && (
              <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5">
                <DollarSign className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold text-success">
                  est. ${estimatedTotal.toFixed(2)}
                </span>
                {checkedTotal > 0 && (
                  <span className="ml-1 text-xs text-success/70">
                    (${checkedTotal.toFixed(2)} in cart)
                  </span>
                )}
              </div>
            )}
          </div>

          {totalCount > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-card-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}

          {/* Toolbar */}
          {totalCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Sort toggle */}
              <div className="flex overflow-hidden rounded-lg border border-card-border">
                <button
                  onClick={() => setSortMode("category")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === "category" ? "bg-accent text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Category
                </button>
                <button
                  onClick={() => setSortMode("aisle")}
                  className={`flex items-center gap-1.5 border-l border-card-border px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === "aisle" ? "bg-accent text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Aisle
                </button>
                {hasEnrichment && (
                  <button
                    onClick={() => setSortMode("price")}
                    className={`flex items-center gap-1.5 border-l border-card-border px-3 py-1.5 text-xs font-medium transition-colors ${
                      sortMode === "price" ? "bg-accent text-white" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                    Price
                  </button>
                )}
              </div>

              {/* Hide/show checked */}
              {checkedCount > 0 && (
                <button
                  onClick={() => setHideChecked((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                >
                  {hideChecked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {hideChecked ? "Show checked" : "Hide checked"}
                </button>
              )}

              {/* HEB enrichment / connect link */}
              {hebConnected && !enriching && (
                <button
                  onClick={enrichList}
                  className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {hasEnrichment ? "Refresh H-E-B" : "Get H-E-B prices"}
                </button>
              )}
              {hebStatusKnown && !hebConnected && !enriching && (
                <Link
                  href="/settings/heb"
                  className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-accent"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Connect H-E-B for prices
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
              {enriching && (
                <span className="flex max-w-xs items-center gap-1.5 truncate text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  {enrichStage}
                </span>
              )}

              <div className="flex-1" />

              {/* Export — prominent since the app is local-only */}
              <Button onClick={handleExport}>
                <ClipboardCopy className="h-4 w-4" />
                Copy List
              </Button>

              {/* Clear checked */}
              {checkedCount > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={clearingChecked}
                  className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-50"
                >
                  {clearingChecked ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Clear checked ({checkedCount})
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Enrichment result / error banner */}
        {enrichResult && !enriching && (
          <div className="mt-2 rounded-lg border border-card-border bg-card px-3 py-2 text-xs text-muted">
            Matched {enrichResult.enrichedCount} of {enrichResult.totalCount} items at H-E-B.
            {enrichResult.failedCount > 0 && <span> {enrichResult.failedCount} unmatched.</span>}
            {enrichResult.sessionExpired && (
              <span className="ml-1 text-warning">Session expired — try again.</span>
            )}
          </div>
        )}
        {enrichError && !enriching && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{enrichError}</span>
            {hebConnected && (
              <button
                onClick={enrichList}
                className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loop handoff — nudge toward This Week once mostly done */}
      {nearlyDone && (
        <Card padding="sm" className="mb-4 border-success/30 bg-success/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShoppingCart className="h-4 w-4 shrink-0 text-success" />
              <span className="truncate text-sm text-foreground">
                <span className="font-semibold">Nearly done shopping.</span> Head to this week&apos;s
                plan to start cooking.
              </span>
            </div>
            <Link
              href="/week"
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-success/90"
            >
              This Week
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="Your grocery list is empty"
          description="Add items manually below, or confirm a meal plan to import ingredients."
        />
      )}

      {/* Category sections */}
      <div className="space-y-5">
        {Array.from(displayGroups.entries()).map(([groupKey, groupItems]) => {
          const catChecked = groupItems.filter((i) => i.checked).length;
          const catTotal = groupItems.length;
          const catEstimate = groupItems.reduce((s, i) => s + (i.heb?.price?.amount ?? 0), 0);
          const uncheckedItems = groupItems.filter((i) => !i.checked);
          const checkedItems = groupItems.filter((i) => i.checked);
          const cartExpanded = expandedCart.has(groupKey);
          const similarFlags = computeSimilarFlags(uncheckedItems);

          return (
            <div
              key={groupKey}
              className="overflow-hidden rounded-xl border border-card-border bg-card"
            >
              {/* Group header */}
              <div className="flex items-center justify-between border-b border-card-border bg-tag-bg/30 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  {sortMode === "price" ? (
                    <>
                      <ArrowDownWideNarrow className="h-4 w-4 text-muted" />
                      <h3 className="text-sm font-semibold text-foreground">Sorted by Price</h3>
                    </>
                  ) : (
                    <>
                      {sortMode === "aisle" && (
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent/60" />
                      )}
                      <span className="text-base">{CATEGORY_ICONS[groupKey.toLowerCase()] ?? "🛒"}</span>
                      <h3 className="text-sm font-semibold capitalize text-foreground">{groupKey}</h3>
                    </>
                  )}
                  <span className="text-xs text-muted">
                    {catChecked}/{catTotal}
                  </span>
                </div>
                {hasEnrichment && catEstimate > 0 && (
                  <span className="text-xs font-medium text-muted">${catEstimate.toFixed(2)}</span>
                )}
              </div>

              {/* Unchecked items */}
              <div className="divide-y divide-card-border">
                {uncheckedItems.map((item, idx) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    similar={similarFlags[idx]}
                    continuesCluster={similarFlags[idx] && idx > 0 && similarFlags[idx - 1]}
                    onToggle={() => toggleItem(item.id)}
                    onRemove={() => removeItem(item)}
                  />
                ))}
              </div>

              {/* Checked items → collapsible "In cart" section */}
              {!hideChecked && checkedItems.length > 0 && (
                <div className="border-t border-card-border">
                  <button
                    onClick={() =>
                      setExpandedCart((prev) => {
                        const next = new Set(prev);
                        if (next.has(groupKey)) next.delete(groupKey);
                        else next.add(groupKey);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted transition-colors hover:bg-tag-bg/20 sm:px-5"
                  >
                    {cartExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <Check className="h-3.5 w-3.5 text-success" />
                    In cart ({checkedItems.length})
                  </button>
                  {cartExpanded && (
                    <div className="divide-y divide-card-border">
                      {checkedItems.map((item) => (
                        <GroceryRow
                          key={item.id}
                          item={item}
                          similar={false}
                          continuesCluster={false}
                          onToggle={() => toggleItem(item.id)}
                          onRemove={() => removeItem(item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom add bar */}
      <div className="sticky bottom-0 z-20 mt-4 bg-background pb-4 pt-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={addItemName}
            onChange={(e) => setAddItemName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAddItem()}
            placeholder="Add an item..."
            className="flex-1 rounded-lg border border-input-border bg-input-bg px-4 py-2.5 text-sm text-foreground placeholder:text-placeholder focus:border-accent focus:outline-none"
          />
          <Button
            size="lg"
            onClick={() => void handleAddItem()}
            disabled={!addItemName.trim()}
            loading={adding}
          >
            {!adding && <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear checked items"
        message={`Remove ${checkedCount} checked item${checkedCount !== 1 ? "s" : ""} from your grocery list? You can undo this right after.`}
        confirmLabel="Clear"
        onConfirm={handleClearChecked}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

// ── Item row ────────────────────────────────────────────────────────────────

function GroceryRow({
  item,
  similar,
  continuesCluster,
  onToggle,
  onRemove,
}: {
  item: GroceryListItem;
  similar: boolean;
  continuesCluster: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const sourceLabel = getSourceLabel(item);

  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-tag-bg/20 sm:gap-3 sm:px-5 sm:py-3 ${
        item.checked ? "opacity-40" : ""
      } ${similar ? "border-l-2 border-warning/40 bg-warning/5" : ""}`}
    >
      {/* Checkbox — padded to a ≥40px touch target on phones */}
      <button
        onClick={onToggle}
        aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
        className="-my-1 -ml-1 flex shrink-0 items-center p-2 sm:m-0 sm:p-0"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
            item.checked ? "border-accent bg-accent text-white" : "border-input-border"
          }`}
        >
          {item.checked && (
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
      </button>

      {/* Item details */}
      <button onClick={onToggle} className="min-w-0 flex-1 text-left">
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${item.checked ? "line-through" : ""}`}
        >
          {item.isFlexible && <span className="text-sm">🧺</span>}
          <span className="text-sm font-semibold text-foreground break-words">{item.name}</span>
          {!item.isFlexible && item.quantity > 0 && (
            <span className="text-xs text-muted">
              {item.quantity} {item.unit}
            </span>
          )}
          {sourceLabel && (
            <span
              className={`inline-block max-w-[10rem] shrink-0 truncate rounded-full px-1.5 py-0.5 align-bottom text-[10px] font-semibold ${CHIP_CLASSES[sourceLabel.color]}`}
            >
              {sourceLabel.text}
            </span>
          )}
        </div>
        {continuesCluster && !item.checked && (
          <p className="mt-0.5 text-[10px] font-medium text-warning/80">similar to item above</p>
        )}
        {item.isFlexible && item.flexibleDescription && !item.checked && (
          <p className="mt-0.5 text-xs italic text-muted">{item.flexibleDescription}</p>
        )}
        {item.notes && !item.checked && (
          <p className="mt-0.5 text-xs italic text-muted">{item.notes}</p>
        )}
        {item.heb && !item.checked && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span>{decodeHtmlEntities(item.heb.name)}</span>
            {item.heb.size && <span className="text-muted/60">({item.heb.size})</span>}
          </div>
        )}
      </button>

      {/* Price */}
      {item.heb && !item.checked && (
        <div className="shrink-0 text-right">
          <span className="text-sm font-semibold text-foreground">{item.heb.price?.formatted}</span>
          {item.heb.isOnSale && (
            <div className="mt-0.5 flex items-center justify-end gap-0.5">
              <Tag className="h-3 w-3 text-danger" />
              <span className="text-[10px] font-semibold text-danger">SALE</span>
            </div>
          )}
          {item.heb.inStock === false && (
            <div className="mt-0.5 text-[10px] font-medium text-warning">Out of stock</div>
          )}
        </div>
      )}

      {/* Remove button — always visible and touch-comfortable */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="-my-1 shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        aria-label={`Remove ${item.name}`}
        title="Remove from list"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
