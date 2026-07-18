"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ShoppingBasket,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { GroceryStaple, StapleStyle, StapleFrequency } from "@meal-planner/types";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/Skeleton";
import { Button, Input, Select, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const FREQUENCY_LABELS: Record<StapleFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  "as-needed": "As needed",
};

const FREQUENCY_STYLES: Record<StapleFrequency, string> = {
  weekly: "bg-success/15 text-success",
  biweekly: "bg-accent/15 text-accent",
  monthly: "bg-warning/15 text-warning",
  "as-needed": "bg-tag-bg text-muted",
};

const CATEGORIES = [
  "produce",
  "dairy",
  "beverages",
  "meat",
  "bread",
  "snacks",
  "frozen",
  "household",
  "other",
];

interface StapleFormData {
  name: string;
  style: StapleStyle;
  category: string;
  defaultQuantity: string;
  defaultUnit: string;
  description: string;
  frequency: StapleFrequency;
  notes: string;
}

const EMPTY_FORM: StapleFormData = {
  name: "",
  style: "specific",
  category: "other",
  defaultQuantity: "",
  defaultUnit: "",
  description: "",
  frequency: "weekly",
  notes: "",
};

export function StaplesSection() {
  const [staples, setStaples] = useState<GroceryStaple[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StapleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GroceryStaple | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchStaples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchStaples() {
    setLoading(true);
    try {
      const data = await api<GroceryStaple[]>("/api/staples");
      setStaples(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to load recurring items", "error");
      setStaples([]);
    } finally {
      setLoading(false);
    }
  }

  function openAddForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(staple: GroceryStaple) {
    setForm({
      name: staple.name,
      style: staple.style,
      category: staple.category,
      defaultQuantity: staple.defaultQuantity?.toString() ?? "",
      defaultUnit: staple.defaultUnit ?? "",
      description: staple.description ?? "",
      frequency: staple.frequency,
      notes: staple.notes ?? "",
    });
    setEditingId(staple.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        style: form.style,
        category: form.category,
        defaultQuantity: form.defaultQuantity ? parseFloat(form.defaultQuantity) : undefined,
        defaultUnit: form.defaultUnit || undefined,
        description: form.description || undefined,
        frequency: form.frequency,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await api(`/api/staples/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/staples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      setEditingId(null);
      await fetchStaples();
      toast(editingId ? "Item updated" : "Item added");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to save — please try again", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/api/staples/${encodeURIComponent(id)}`, { method: "DELETE" });
      await fetchStaples();
      toast("Item removed");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to remove item", "error");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleToggleActive(staple: GroceryStaple) {
    try {
      await api(`/api/staples/${encodeURIComponent(staple.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !staple.isActive }),
      });
      await fetchStaples();
      toast(staple.isActive ? "Item deactivated" : "Item reactivated");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to update item", "error");
    }
  }

  if (loading) {
    return <ListSkeleton rows={5} />;
  }

  const activeStaples = staples.filter((s) => s.isActive);
  const inactiveStaples = staples.filter((s) => !s.isActive);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button onClick={openAddForm} className="shrink-0 whitespace-nowrap">
          <Plus className="h-4 w-4" /> Add recurring item
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 rounded-xl border border-accent/30 bg-card p-6"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {editingId ? `Edit "${form.name}"` : "Add new recurring item"}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted">Name</label>
              <Input
                className="mt-1"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Whole milk, Fruit for kids"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted">Style</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, style: "specific" })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.style === "specific"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-input-border text-muted hover:text-foreground"
                  }`}
                >
                  Specific
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, style: "flexible" })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.style === "flexible"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-input-border text-muted hover:text-foreground"
                  }`}
                >
                  Flexible
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted">Category</label>
              <Select
                className="mt-1"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted">Frequency</label>
              <Select
                className="mt-1"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as StapleFrequency })}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="as-needed">As needed</option>
              </Select>
            </div>

            {form.style === "specific" ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted">Quantity</label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={form.defaultQuantity}
                    onChange={(e) => setForm({ ...form, defaultQuantity: e.target.value })}
                    placeholder="1"
                    step="any"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Unit</label>
                  <Input
                    className="mt-1"
                    type="text"
                    value={form.defaultUnit}
                    onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
                    placeholder="gallon, 12-pack, bunch..."
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted">
                  Description (shopper guidance)
                </label>
                <Input
                  className="mt-1"
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Grab 2-3 types the kids will eat"
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="text-xs font-medium text-muted">Notes (optional)</label>
              <Input
                className="mt-1"
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. for coffee, for the kids"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowForm(false); setEditingId(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.name.trim()}>
              {editingId ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      )}

      {/* Active Staples */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
          Active ({activeStaples.length})
        </h2>
        {activeStaples.length === 0 && (
          <EmptyState
            icon={ShoppingBasket}
            title="No recurring items configured yet"
            description="Add items your family buys regularly — milk, bananas, etc."
          />
        )}
        <div className="space-y-2">
          {activeStaples.map((staple) => (
            <div
              key={staple.id}
              className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{staple.name}</span>
                  {staple.style === "flexible" && (
                    <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
                      Flexible
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${FREQUENCY_STYLES[staple.frequency]}`}>
                    {FREQUENCY_LABELS[staple.frequency]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {staple.style === "specific"
                    ? [staple.defaultQuantity, staple.defaultUnit].filter(Boolean).join(" ") || staple.category
                    : staple.description || staple.category}
                  {staple.notes ? ` — ${staple.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditForm(staple)}
                  className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-foreground"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleToggleActive(staple)}
                  className="rounded-lg p-1.5 text-success hover:bg-tag-bg"
                  title="Deactivate"
                >
                  <ToggleRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(staple)}
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

      {/* Inactive Staples */}
      {inactiveStaples.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Inactive ({inactiveStaples.length})
          </h2>
          <div className="space-y-2">
            {inactiveStaples.map((staple) => (
              <div
                key={staple.id}
                className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-3 opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{staple.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${FREQUENCY_STYLES[staple.frequency]}`}>
                      {FREQUENCY_LABELS[staple.frequency]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleActive(staple)}
                    className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-success"
                    title="Reactivate"
                  >
                    <ToggleLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(staple)}
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
        title="Delete recurring item"
        message={`Remove "${deleteTarget?.name}" from your recurring items?`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
