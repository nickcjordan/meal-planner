"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PantryItem } from "@meal-planner/types";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  Loader2,
  Sparkles,
  Upload,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { CATEGORY_ORDER, CATEGORY_ICONS, groupByCategory } from "@/lib/categories";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/Skeleton";

interface CategorizationResult {
  input: string;
  displayName: string;
  category: string;
  aliases: string[];
}

interface BulkPreviewItem extends CategorizationResult {
  selected: boolean;
}

interface PantrySuggestion {
  name: string;
  category: string;
  occurrences: number;
  totalWeeks: number;
}

const CATEGORIES = CATEGORY_ORDER;

export function PantrySection() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("pantry");
  const [suggestion, setSuggestion] = useState<CategorizationResult | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewItem[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const [suggestions, setSuggestions] = useState<PantrySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PantryItem | null>(null);
  const { toast } = useToast();

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/pantry")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .finally(() => setLoading(false));

    setSuggestionsLoading(true);
    fetch("/api/pantry/suggestions")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSuggestions(data);
      })
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false));
  }, []);

  const categorizeInput = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setSuggestion(null);
        setDuplicateWarning(null);
        return;
      }

      const normalized = trimmed.toLowerCase();
      const existing = items.find((i) => i.normalizedName === normalized);
      if (existing) {
        setDuplicateWarning(`"${existing.name}" is already in your pantry`);
        setSuggestion(null);
        return;
      }
      setDuplicateWarning(null);

      setCategorizing(true);
      try {
        const res = await fetch("/api/pantry/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [trimmed] }),
        });
        if (res.ok) {
          const data = await res.json();
          const result = data.results?.[0] as CategorizationResult | undefined;
          if (result) {
            setSuggestion(result);
            setCategory(result.category);
          }
        }
      } catch {
        // Silently fail — user can still pick manually
      } finally {
        setCategorizing(false);
      }
    },
    [items],
  );

  function handleNameChange(value: string) {
    setName(value);
    setSuggestion(null);
    setDuplicateWarning(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim()) {
      debounceRef.current = setTimeout(() => categorizeInput(value), 500);
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const itemName = suggestion?.displayName || name.trim();
    if (!itemName) return;

    setAdding(true);
    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemName,
          category,
          aliases: suggestion?.aliases,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setDuplicateWarning(`"${data.existing?.name}" is already in your pantry`);
        return;
      }

      if (res.ok) {
        const item = await res.json();
        setItems((prev) => [...prev, item]);
        setName("");
        setSuggestion(null);
        setCategory("pantry");
        setDuplicateWarning(null);
        inputRef.current?.focus();
        toast("Added to pantry");
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(item: PantryItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await fetch(`/api/pantry/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setDeleteTarget(null);
    toast("Removed from pantry");
  }

  function startEditing(item: PantryItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditNotes(item.notes ?? "");
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pantry/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          category: editCategory,
          notes: editNotes || undefined,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        setEditingId(null);
        toast("Item updated");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkCategorize() {
    const names = bulkText
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (names.length === 0) return;

    setBulkLoading(true);
    try {
      const res = await fetch("/api/pantry/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (res.ok) {
        const data = await res.json();
        const existingNames = new Set(items.map((i) => i.normalizedName));
        setBulkPreview(
          (data.results as CategorizationResult[]).map((r) => ({
            ...r,
            selected: !existingNames.has(r.displayName.toLowerCase()),
          })),
        );
      }
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkAdd() {
    if (!bulkPreview) return;
    const toAdd = bulkPreview.filter((p) => p.selected);
    if (toAdd.length === 0) return;

    setBulkAdding(true);
    try {
      const added: PantryItem[] = [];
      for (const item of toAdd) {
        const res = await fetch("/api/pantry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.displayName,
            category: item.category,
            aliases: item.aliases,
          }),
        });
        if (res.ok) {
          added.push(await res.json());
        }
      }
      setItems((prev) => [...prev, ...added]);
      setBulkPreview(null);
      setBulkText("");
      setShowBulk(false);
      toast(`Added ${added.length} item${added.length !== 1 ? "s" : ""} to pantry`);
    } finally {
      setBulkAdding(false);
    }
  }

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function addSuggestion(s: PantrySuggestion) {
    const res = await fetch("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.name, category: s.category }),
    });
    if (res.ok) {
      const item = await res.json();
      setItems((prev) => [...prev, item]);
      setSuggestions((prev) => prev.filter((p) => p.name !== s.name));
      toast(`Added "${s.name}" to pantry`);
    }
  }

  const filteredItems = search
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.category.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const grouped = groupByCategory(filteredItems);
  const sortedGrouped = Array.from(grouped.entries()).map(
    ([cat, catItems]) =>
      [cat, [...catItems].sort((a, b) => a.name.localeCompare(b.name))] as [string, PantryItem[]],
  );

  if (loading) {
    return <ListSkeleton rows={6} />;
  }

  return (
    <div>
      {/* Header with bulk import button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowBulk(!showBulk)}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-foreground"
        >
          <Upload className="h-4 w-4" />
          Bulk Import
        </button>
      </div>

      {/* Smart Add Form */}
      <form onSubmit={addItem} className="mt-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Type an item name (e.g. olive oil, chicken breast)"
              className="w-full rounded-lg border border-input-border bg-card px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {categorizing && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            )}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-input-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_ICONS[cat] ?? ""} {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={(!name.trim() && !suggestion) || adding || !!duplicateWarning}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
        </div>

        {suggestion && name.trim() && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-muted">
              Will add as{" "}
              <span className="font-semibold text-foreground">{suggestion.displayName}</span> in{" "}
              <span className="font-semibold text-foreground">{suggestion.category}</span>
            </span>
          </div>
        )}
        {duplicateWarning && (
          <p className="mt-2 text-xs text-warning">{duplicateWarning}</p>
        )}
      </form>

      {/* Bulk Import Panel */}
      {showBulk && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Bulk Import</h3>
          <p className="mt-1 text-xs text-muted">
            Paste a list of items separated by commas or new lines. AI will categorize them.
          </p>

          {!bulkPreview ? (
            <>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="salt, pepper, olive oil, flour, garlic, onion, butter, eggs..."
                rows={3}
                className="mt-3 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowBulk(false);
                    setBulkText("");
                  }}
                  className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkCategorize}
                  disabled={!bulkText.trim() || bulkLoading}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {bulkLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Categorize
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {bulkPreview.map((item, idx) => {
                  const isDuplicate = items.some(
                    (i) => i.normalizedName === item.displayName.toLowerCase(),
                  );
                  return (
                    <label
                      key={idx}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        isDuplicate
                          ? "border-card-border opacity-50"
                          : item.selected
                            ? "border-accent/30 bg-accent/5"
                            : "border-card-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected && !isDuplicate}
                        disabled={isDuplicate}
                        onChange={() => {
                          setBulkPreview((prev) =>
                            prev!.map((p, i) =>
                              i === idx ? { ...p, selected: !p.selected } : p,
                            ),
                          );
                        }}
                        className="rounded accent-accent"
                      />
                      <span className="flex-1 text-foreground">{item.displayName}</span>
                      <span className="rounded-full bg-tag-bg px-2 py-0.5 text-[10px] font-semibold text-tag-text">
                        {CATEGORY_ICONS[item.category] ?? ""} {item.category}
                      </span>
                      {isDuplicate && (
                        <span className="text-[10px] text-warning">already in pantry</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => setBulkPreview(null)}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Back to edit
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowBulk(false);
                      setBulkPreview(null);
                      setBulkText("");
                    }}
                    className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkAdd}
                    disabled={bulkAdding || !bulkPreview.some((p) => p.selected)}
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {bulkAdding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add {bulkPreview.filter((p) => p.selected).length} Items
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Search */}
      {items.length > 0 && (
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pantry items..."
            className="w-full rounded-lg border border-input-border bg-card py-2 pl-10 pr-8 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Item count */}
      {items.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
          {search ? ` matching "${search}"` : ""}
          {" across "}
          {sortedGrouped.length} categor{sortedGrouped.length !== 1 ? "ies" : "y"}
        </p>
      )}

      {/* Items grouped by category */}
      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-card-border py-12 text-center">
          <p className="text-sm text-muted">No pantry items yet.</p>
          <p className="mt-1 text-xs text-muted">
            Add your kitchen staples above, or use Bulk Import to add many at once.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-muted">
          No items match &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {sortedGrouped.map(([cat, catItems]) => {
            const isCollapsed = collapsedCategories.has(cat);
            const icon = CATEGORY_ICONS[cat] ?? "📦";
            return (
              <div key={cat}>
                <button
                  onClick={() => toggleCategory(cat)}
                  className="mb-2 flex w-full items-center gap-2 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted" />
                  )}
                  <span className="text-base">{icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {cat}
                  </span>
                  <span className="text-xs text-muted">({catItems.length})</span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-1">
                    {catItems.map((item) =>
                      editingId === item.id ? (
                        <div
                          key={item.id}
                          className="rounded-xl border border-accent/30 bg-card px-4 py-3"
                        >
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 rounded-lg border border-input-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                              autoFocus
                            />
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="rounded-lg border border-input-border bg-background px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {CATEGORY_ICONS[c] ?? ""} {c}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            className="mt-2 w-full rounded-lg border border-input-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-lg px-3 py-1 text-xs text-muted hover:text-foreground"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              disabled={saving || !editName.trim()}
                              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                            >
                              {saving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={item.id}
                          className="group flex items-center justify-between rounded-xl border border-card-border bg-card px-4 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-sm text-foreground">{item.name}</span>
                            {item.notes && (
                              <span className="ml-2 text-xs text-muted">— {item.notes}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => startEditing(item)}
                              className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(item)}
                              className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                              title="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Suggestions from purchase history */}
      {suggestions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Suggested Items
          </h2>
          <p className="mb-3 text-xs text-muted">
            These items appear frequently on your shopping lists but aren&apos;t in your pantry yet.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => addSuggestion(s)}
                className="flex items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:border-accent/50 hover:bg-accent/5"
              >
                <Plus className="h-3.5 w-3.5 text-accent" />
                {s.name}
                <span className="text-[10px] text-muted">
                  ({s.occurrences}/{s.totalWeeks}w)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestionsLoading && !suggestions.length && (
        <div className="mt-6 text-center text-xs text-muted">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          <p className="mt-1">Analyzing purchase history...</p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove item"
        message={`Remove "${deleteTarget?.name}" from your pantry?`}
        confirmLabel="Remove"
        onConfirm={() => deleteTarget && removeItem(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
