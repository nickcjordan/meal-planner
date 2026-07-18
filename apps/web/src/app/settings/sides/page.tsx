"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, AlertCircle, Salad } from "lucide-react";
import type {
  Side,
  CreateSideInput,
  SideCategory,
  SideComplexity,
  SideIngredient,
} from "@meal-planner/types";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/Skeleton";
import { Button, Input, Select, PageHeader, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const SIDE_CATEGORIES: { value: SideCategory; label: string }[] = [
  { value: "green", label: "Greens / Vegetables" },
  { value: "starch", label: "Starches" },
  { value: "grain", label: "Grains" },
  { value: "bread", label: "Bread" },
  { value: "legume", label: "Legumes" },
  { value: "salad", label: "Salads" },
  { value: "other", label: "Other" },
];

const COMPLEXITY_OPTIONS: { value: SideComplexity; label: string; desc: string }[] = [
  { value: "effortless", label: "Effortless", desc: "Raw, pre-made, no-cook" },
  { value: "simple", label: "Simple", desc: "One-step heat" },
  { value: "prepared", label: "Prepared", desc: "Actual cooking" },
];

const COMPLEXITY_STYLES: Record<string, string> = {
  effortless: "bg-success/15 text-success",
  simple: "bg-accent/15 text-accent",
  prepared: "bg-warning/15 text-warning",
};

export default function SidesSettingsPage() {
  const [sides, setSides] = useState<Side[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<SideCategory | "">("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Side | null>(null);
  const { toast } = useToast();

  const loadSides = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const url = filterCategory ? `/api/sides?category=${encodeURIComponent(filterCategory)}` : "/api/sides";
      const data = await api<Side[]>(url);
      setSides(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load sides");
      setSides([]);
    } finally {
      setLoading(false);
    }
  }, [filterCategory]);

  useEffect(() => {
    loadSides();
  }, [loadSides]);

  async function handleDelete(id: string) {
    try {
      await api(`/api/sides/${id}`, { method: "DELETE" });
      setSides((prev) => prev.filter((s) => s.id !== id));
      toast("Side removed");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to delete side", "error");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleSave(input: CreateSideInput, id?: string) {
    setSaving(true);
    try {
      if (id) {
        const updated = await api<Side>(`/api/sides/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setSides((prev) => prev.map((s) => (s.id === id ? updated : s)));
        setEditingId(null);
        toast("Side updated");
      } else {
        const created = await api<Side>("/api/sides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setSides((prev) => [...prev, created]);
        setShowAddForm(false);
        toast("Side added");
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to save side", "error");
    } finally {
      setSaving(false);
    }
  }

  const grouped = new Map<string, Side[]>();
  for (const side of sides) {
    const cat = side.sideCategory;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(side);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Sides Library"
        subtitle="Curated sides that Claude pairs with your meals. Steamed broccoli, rice, salad — the things that complete a plate."
        actions={
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4" /> Add Side
          </Button>
        }
      />

      {/* Category filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory("")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filterCategory === "" ? "bg-accent text-white" : "bg-tag-bg text-muted hover:text-foreground"
          }`}
        >
          All
        </button>
        {SIDE_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilterCategory(cat.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterCategory === cat.value ? "bg-accent text-white" : "bg-tag-bg text-muted hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mt-4">
          <SideForm
            saving={saving}
            onSave={(input) => handleSave(input)}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Sides list grouped by category */}
      {loading ? (
        <div className="mt-6">
          <ListSkeleton rows={5} />
        </div>
      ) : loadError ? (
        <div className="mt-6">
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load sides"
            description={loadError}
            action={<Button onClick={loadSides}>Retry</Button>}
          />
        </div>
      ) : sides.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Salad}
            title={filterCategory ? "No sides in this category" : "No sides yet"}
            description={
              filterCategory
                ? "Try another category, or add a side to this one."
                : "Add some, or let Claude suggest sides during planning."
            }
            action={
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4" /> Add Side
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {[...grouped.entries()].map(([category, categorySides]) => {
            const catLabel = SIDE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
            return (
              <div key={category}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                  {catLabel}
                </h2>
                <div className="mt-2 space-y-2">
                  {categorySides.map((side) =>
                    editingId === side.id ? (
                      <SideForm
                        key={side.id}
                        initial={side}
                        saving={saving}
                        onSave={(input) => handleSave(input, side.id)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div
                        key={side.id}
                        className="group flex items-center justify-between rounded-lg border border-card-border bg-card px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground truncate">
                                {side.name}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  COMPLEXITY_STYLES[side.complexity] ?? ""
                                }`}
                              >
                                {side.complexity}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-muted truncate">
                              {side.baseIngredient}
                              {side.prepStyle && ` · ${side.prepStyle}`}
                              {side.ingredients.length > 0 &&
                                ` · ${side.ingredients.length} ingredient${side.ingredients.length !== 1 ? "s" : ""}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingId(side.id)}
                            className="rounded p-1.5 text-muted hover:bg-tag-bg hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(side)}
                            className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-card-border bg-card p-6 text-sm text-muted">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>Claude pairs sides from this library with your meals during planning</li>
          <li>You can swap sides on any meal without re-planning the whole week</li>
          <li>Sides you use repeatedly as inline suggestions get auto-promoted here</li>
          <li>Side ingredients are included in your grocery list with source tracking</li>
        </ul>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete side"
        message={`Remove "${deleteTarget?.name}" from your sides library?`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function SideForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Side;
  onSave: (input: CreateSideInput) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [baseIngredient, setBaseIngredient] = useState(initial?.baseIngredient ?? "");
  const [prepStyle, setPrepStyle] = useState(initial?.prepStyle ?? "");
  const [complexity, setComplexity] = useState<SideComplexity>(initial?.complexity ?? "simple");
  const [sideCategory, setSideCategory] = useState<SideCategory>(initial?.sideCategory ?? "green");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [prepNotes, setPrepNotes] = useState(initial?.prepNotes ?? "");
  const [pairingHints, setPairingHints] = useState(initial?.pairingHints?.join(", ") ?? "");
  // Editable ingredient rows — edit mode loads existing ingredients so they carry
  // through to the grocery list. Quantity is held as a string for free typing.
  const [ingredientRows, setIngredientRows] = useState<
    { name: string; quantity: string; unit: string; category: string }[]
  >(
    (initial?.ingredients ?? []).map((ing) => ({
      name: ing.name,
      quantity: String(ing.quantity),
      unit: ing.unit,
      category: ing.category ?? "",
    })),
  );

  // Unsaved-changes guard: snapshot the initial serialized state once (lazy
  // useState), compare on Cancel so a stray click doesn't silently discard a
  // long entry.
  const [initialSnapshot] = useState(() =>
    JSON.stringify({
      name: initial?.name ?? "",
      baseIngredient: initial?.baseIngredient ?? "",
      prepStyle: initial?.prepStyle ?? "",
      complexity: initial?.complexity ?? "simple",
      sideCategory: initial?.sideCategory ?? "green",
      tags: initial?.tags.join(", ") ?? "",
      prepNotes: initial?.prepNotes ?? "",
      pairingHints: initial?.pairingHints?.join(", ") ?? "",
      ingredientRows: (initial?.ingredients ?? []).map((ing) => ({
        name: ing.name,
        quantity: String(ing.quantity),
        unit: ing.unit,
        category: ing.category ?? "",
      })),
    }),
  );
  const currentSnapshot = JSON.stringify({
    name, baseIngredient, prepStyle, complexity, sideCategory, tags, prepNotes, pairingHints, ingredientRows,
  });
  const dirty = currentSnapshot !== initialSnapshot;

  function handleCancel() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onCancel();
  }

  function addIngredientRow() {
    setIngredientRows((prev) => [...prev, { name: "", quantity: "", unit: "", category: "" }]);
  }

  function updateIngredientRow(index: number, field: "name" | "quantity" | "unit" | "category", value: string) {
    setIngredientRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function removeIngredientRow(index: number) {
    setIngredientRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ingredients: SideIngredient[] = ingredientRows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        quantity: Number(row.quantity) || 0,
        unit: row.unit.trim(),
        ...(row.category.trim() ? { category: row.category.trim() } : {}),
      }));
    onSave({
      name: name.trim(),
      baseIngredient: baseIngredient.trim(),
      prepStyle: prepStyle.trim() || undefined,
      complexity,
      ingredients,
      sideCategory,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      pairingHints: pairingHints
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) || undefined,
      prepNotes: prepNotes.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-accent/30 bg-card p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Steamed Broccoli"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Base Ingredient</label>
          <Input
            value={baseIngredient}
            onChange={(e) => setBaseIngredient(e.target.value)}
            placeholder="broccoli"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Prep Style</label>
          <Input
            value={prepStyle}
            onChange={(e) => setPrepStyle(e.target.value)}
            placeholder="steamed"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Complexity</label>
          <Select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as SideComplexity)}
          >
            {COMPLEXITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Category</label>
          <Select
            value={sideCategory}
            onChange={(e) => setSideCategory(e.target.value as SideCategory)}
          >
            {SIDE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Tags (comma-separated)</label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="kid-friendly, asian"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Pairing hints (comma-separated)</label>
          <Input
            value={pairingHints}
            onChange={(e) => setPairingHints(e.target.value)}
            placeholder="stir-fry, grilled-protein"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-muted">Ingredients</label>
          <button
            type="button"
            onClick={addIngredientRow}
            className="flex items-center gap-1 rounded-lg border border-card-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            <Plus className="h-3 w-3" /> Add ingredient
          </button>
        </div>
        {ingredientRows.length === 0 ? (
          <p className="text-xs text-muted">
            No ingredients yet — added ingredients flow into your grocery list.
          </p>
        ) : (
          <div className="space-y-2">
            {ingredientRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={row.name}
                  onChange={(e) => updateIngredientRow(i, "name", e.target.value)}
                  placeholder="broccoli"
                  className="min-w-0 flex-[3]"
                />
                <Input
                  value={row.quantity}
                  onChange={(e) => updateIngredientRow(i, "quantity", e.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                  className="min-w-0 flex-1"
                />
                <Input
                  value={row.unit}
                  onChange={(e) => updateIngredientRow(i, "unit", e.target.value)}
                  placeholder="head"
                  className="min-w-0 flex-1"
                />
                <Input
                  value={row.category}
                  onChange={(e) => updateIngredientRow(i, "category", e.target.value)}
                  placeholder="produce"
                  className="min-w-0 flex-[2]"
                />
                <button
                  type="button"
                  onClick={() => removeIngredientRow(i)}
                  className="shrink-0 rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove ingredient"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">Prep Notes</label>
        <Input
          value={prepNotes}
          onChange={(e) => setPrepNotes(e.target.value)}
          placeholder="Toss with soy sauce in skillet over medium-high, 5 min"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          loading={saving}
          disabled={!name.trim() || !baseIngredient.trim()}
        >
          {initial ? "Update" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
