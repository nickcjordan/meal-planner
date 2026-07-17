"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ArrowRightLeft,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { IngredientSwap } from "@meal-planner/types";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/Skeleton";

const CATEGORIES = [
  "produce",
  "dairy",
  "pantry",
  "meat",
  "spices",
  "other",
];

const CATEGORY_STYLES: Record<string, string> = {
  produce: "bg-success/15 text-success",
  dairy: "bg-info/15 text-info",
  pantry: "bg-warning/15 text-warning",
  meat: "bg-danger/15 text-danger",
  spices: "bg-accent/15 text-accent",
  other: "bg-tag-bg text-muted",
};

interface SwapFormData {
  from: string;
  to: string;
  category: string;
  reason: string;
}

const EMPTY_FORM: SwapFormData = {
  from: "",
  to: "",
  category: "other",
  reason: "",
};

const COMMON_SWAPS: { from: string; to: string; category: string; reason: string }[] = [
  { from: "shallots", to: "yellow onion", category: "produce", reason: "overpriced, hard to find" },
  { from: "leeks", to: "green onions", category: "produce", reason: "expensive, often wasted" },
  { from: "cr\u00e8me fra\u00eeche", to: "sour cream", category: "dairy", reason: "nearly identical, always in stock" },
  { from: "mascarpone", to: "cream cheese", category: "dairy", reason: "easier to find, similar texture" },
  { from: "ghee", to: "butter", category: "dairy", reason: "simpler, always on hand" },
  { from: "flat-leaf parsley", to: "curly parsley", category: "produce", reason: "whatever is available" },
  { from: "fresh dill", to: "dried dill", category: "spices", reason: "fresh goes bad too quickly" },
  { from: "fresh thyme", to: "dried thyme", category: "spices", reason: "dried works fine in most recipes" },
  { from: "pancetta", to: "bacon", category: "meat", reason: "always have bacon, pancetta is specialty" },
  { from: "sambal oelek", to: "sriracha", category: "pantry", reason: "already in the fridge" },
  { from: "mirin", to: "rice vinegar + sugar", category: "pantry", reason: "one less bottle to buy" },
  { from: "white wine", to: "chicken broth", category: "pantry", reason: "don't keep cooking wine" },
];

export function SwapsSection() {
  const [swaps, setSwaps] = useState<IngredientSwap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SwapFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IngredientSwap | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addingSuggestions, setAddingSuggestions] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSwaps();
  }, []);

  async function fetchSwaps() {
    setLoading(true);
    try {
      const res = await fetch("/api/swaps");
      const data = await res.json();
      setSwaps(data);
    } finally {
      setLoading(false);
    }
  }

  function openAddForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(swap: IngredientSwap) {
    setForm({
      from: swap.from,
      to: swap.to,
      category: swap.category,
      reason: swap.reason ?? "",
    });
    setEditingId(swap.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.from.trim() || !form.to.trim()) return;
    setSaving(true);

    try {
      const payload = {
        from: form.from.trim(),
        to: form.to.trim(),
        category: form.category,
        reason: form.reason || undefined,
      };
      const res = editingId
        ? await fetch(`/api/swaps/${encodeURIComponent(editingId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/swaps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        toast("Failed to save — please try again");
        return;
      }
      setShowForm(false);
      setEditingId(null);
      await fetchSwaps();
      toast(editingId ? "Swap updated" : "Swap added");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/swaps/${encodeURIComponent(id)}`, { method: "DELETE" });
    await fetchSwaps();
    setDeleteTarget(null);
    toast("Swap removed");
  }

  async function handleToggleActive(swap: IngredientSwap) {
    await fetch(`/api/swaps/${encodeURIComponent(swap.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !swap.isActive }),
    });
    await fetchSwaps();
    toast(swap.isActive ? "Swap deactivated" : "Swap reactivated");
  }

  /** Filter suggestions to exclude ones already added (match by from+to) */
  function getAvailableSuggestions() {
    const existing = new Set(
      swaps.map((s) => `${s.from.toLowerCase()}|${s.to.toLowerCase()}`),
    );
    return COMMON_SWAPS.filter(
      (s) => !existing.has(`${s.from.toLowerCase()}|${s.to.toLowerCase()}`),
    );
  }

  async function addSuggestion(suggestion: typeof COMMON_SWAPS[number]) {
    const res = await fetch("/api/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: suggestion.from,
        to: suggestion.to,
        category: suggestion.category,
        reason: suggestion.reason,
      }),
    });
    if (res.ok) {
      await fetchSwaps();
      toast(`Added: ${suggestion.from} \u2192 ${suggestion.to}`);
    }
  }

  async function addAllSuggestions() {
    const available = getAvailableSuggestions();
    if (available.length === 0) return;
    setAddingSuggestions(true);
    try {
      await Promise.all(
        available.map((s) =>
          fetch("/api/swaps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from: s.from,
              to: s.to,
              category: s.category,
              reason: s.reason,
            }),
          }),
        ),
      );
      await fetchSwaps();
      setShowSuggestions(false);
      toast(`Added ${available.length} common swaps`);
    } finally {
      setAddingSuggestions(false);
    }
  }

  if (loading) {
    return <ListSkeleton rows={5} />;
  }

  const activeSwaps = swaps.filter((s) => s.isActive);
  const inactiveSwaps = swaps.filter((s) => !s.isActive);

  // Group active swaps by category
  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    items: activeSwaps.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  const availableSuggestions = getAvailableSuggestions();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-end gap-2">
        {availableSuggestions.length > 0 && (
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
          >
            <Sparkles className="h-4 w-4" /> Common swaps
          </button>
        )}
        <button
          onClick={openAddForm}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Add swap
        </button>
      </div>

      {/* Common Swaps Suggestions Panel */}
      {showSuggestions && availableSuggestions.length > 0 && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Common swaps ({availableSuggestions.length} available)
            </h3>
            <button
              onClick={addAllSuggestions}
              disabled={addingSuggestions}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {addingSuggestions ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add all
            </button>
          </div>
          <div className="space-y-1.5">
            {availableSuggestions.map((s) => (
              <div
                key={`${s.from}-${s.to}`}
                className="flex items-center gap-3 rounded-lg border border-card-border bg-background px-4 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{s.from}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted" />
                    <span className="font-medium text-foreground">{s.to}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_STYLES[s.category] ?? CATEGORY_STYLES.other}`}
                    >
                      {s.category}
                    </span>
                  </div>
                  {s.reason && (
                    <p className="mt-0.5 text-xs text-muted">{s.reason}</p>
                  )}
                </div>
                <button
                  onClick={() => addSuggestion(s)}
                  className="rounded-lg p-1.5 text-accent hover:bg-accent/10"
                  title="Add this swap"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 rounded-xl border border-accent/30 bg-card p-6"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {editingId ? "Edit swap" : "Add new swap"}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted">From (original ingredient)</label>
              <input
                type="text"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                placeholder="e.g. shallots"
                className="mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted">To (replacement)</label>
              <input
                type="text"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                placeholder="e.g. yellow onion"
                className="mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted">Reason (optional)</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. overpriced, hard to find"
                className="mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.from.trim() || !form.to.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Update" : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* Active Swaps — grouped by category */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
          Active ({activeSwaps.length})
        </h2>
        {activeSwaps.length === 0 && (
          <div className="rounded-xl border border-dashed border-card-border py-12 text-center">
            <ArrowRightLeft className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-3 text-sm text-muted">No auto swaps configured yet.</p>
            <p className="text-xs text-muted mt-1">
              Add ingredient swaps to simplify your grocery shopping — shallots to onion, etc.
            </p>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.category} className="mt-4 first:mt-0">
            <h3 className="mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
              {group.category} ({group.items.length})
            </h3>
            <div className="space-y-2">
              {group.items.map((swap) => (
                <div
                  key={swap.id}
                  className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{swap.from}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted" />
                      <span className="text-sm font-semibold text-foreground">{swap.to}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_STYLES[swap.category] ?? CATEGORY_STYLES.other}`}
                      >
                        {swap.category}
                      </span>
                    </div>
                    {swap.reason && (
                      <p className="mt-0.5 text-xs text-muted">{swap.reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditForm(swap)}
                      className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(swap)}
                      className="rounded-lg p-1.5 text-success hover:bg-tag-bg"
                      title="Deactivate"
                    >
                      <ToggleRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(swap)}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Inactive Swaps */}
      {inactiveSwaps.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Inactive ({inactiveSwaps.length})
          </h2>
          <div className="space-y-2">
            {inactiveSwaps.map((swap) => (
              <div
                key={swap.id}
                className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-3 opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{swap.from}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted" />
                    <span className="text-sm font-medium text-foreground">{swap.to}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleActive(swap)}
                    className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-success"
                    title="Reactivate"
                  >
                    <ToggleLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(swap)}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete swap"
        message={`Remove "${deleteTarget?.from} \u2192 ${deleteTarget?.to}" from your auto swaps?`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
