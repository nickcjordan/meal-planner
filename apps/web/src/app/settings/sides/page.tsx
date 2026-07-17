"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import type {
  Side,
  CreateSideInput,
  SideCategory,
  SideComplexity,
  SideIngredient,
} from "@meal-planner/types";

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
  effortless: "bg-green-500/15 text-green-500",
  simple: "bg-accent/15 text-accent",
  prepared: "bg-amber-500/15 text-amber-500",
};

export default function SidesSettingsPage() {
  const [sides, setSides] = useState<Side[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<SideCategory | "">("");

  useEffect(() => {
    let cancelled = false;
    const url = filterCategory ? `/api/sides?category=${filterCategory}` : "/api/sides";
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setSides(data);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [filterCategory]);

  async function handleDelete(id: string) {
    await fetch(`/api/sides/${id}`, { method: "DELETE" });
    setSides((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSave(input: CreateSideInput, id?: string) {
    if (id) {
      const res = await fetch(`/api/sides/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const updated = await res.json();
      setSides((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
    } else {
      const res = await fetch("/api/sides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const created = await res.json();
      setSides((prev) => [...prev, created]);
      setShowAddForm(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sides Library</h1>
          <p className="mt-1 text-sm text-muted">
            Curated sides that Claude pairs with your meals. Steamed broccoli, rice,
            salad — the things that complete a plate.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" /> Add Side
        </button>
      </div>

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
            onSave={(input) => handleSave(input)}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Sides list grouped by category */}
      {loading ? (
        <div className="mt-8 text-center text-sm text-muted">Loading sides...</div>
      ) : sides.length === 0 ? (
        <div className="mt-8 text-center text-sm text-muted">
          No sides yet. Add some or let Claude suggest sides during planning.
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
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(side.id)}
                            className="rounded p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500"
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
    </div>
  );
}

function SideForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Side;
  onSave: (input: CreateSideInput) => void;
  onCancel: () => void;
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Steamed Broccoli"
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Base Ingredient</label>
          <input
            value={baseIngredient}
            onChange={(e) => setBaseIngredient(e.target.value)}
            placeholder="broccoli"
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Prep Style</label>
          <input
            value={prepStyle}
            onChange={(e) => setPrepStyle(e.target.value)}
            placeholder="steamed"
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Complexity</label>
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as SideComplexity)}
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground"
          >
            {COMPLEXITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Category</label>
          <select
            value={sideCategory}
            onChange={(e) => setSideCategory(e.target.value as SideCategory)}
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground"
          >
            {SIDE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Tags (comma-separated)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="kid-friendly, asian"
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Pairing hints (comma-separated)</label>
          <input
            value={pairingHints}
            onChange={(e) => setPairingHints(e.target.value)}
            placeholder="stir-fry, grilled-protein"
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder"
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
                <input
                  value={row.name}
                  onChange={(e) => updateIngredientRow(i, "name", e.target.value)}
                  placeholder="broccoli"
                  className="min-w-0 flex-[3] rounded-lg border border-input-border bg-input-bg px-2 py-1.5 text-sm text-foreground placeholder:text-placeholder"
                />
                <input
                  value={row.quantity}
                  onChange={(e) => updateIngredientRow(i, "quantity", e.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                  className="min-w-0 flex-1 rounded-lg border border-input-border bg-input-bg px-2 py-1.5 text-sm text-foreground placeholder:text-placeholder"
                />
                <input
                  value={row.unit}
                  onChange={(e) => updateIngredientRow(i, "unit", e.target.value)}
                  placeholder="head"
                  className="min-w-0 flex-1 rounded-lg border border-input-border bg-input-bg px-2 py-1.5 text-sm text-foreground placeholder:text-placeholder"
                />
                <input
                  value={row.category}
                  onChange={(e) => updateIngredientRow(i, "category", e.target.value)}
                  placeholder="produce"
                  className="min-w-0 flex-[2] rounded-lg border border-input-border bg-input-bg px-2 py-1.5 text-sm text-foreground placeholder:text-placeholder"
                />
                <button
                  type="button"
                  onClick={() => removeIngredientRow(i)}
                  className="shrink-0 rounded p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500"
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
        <input
          value={prepNotes}
          onChange={(e) => setPrepNotes(e.target.value)}
          placeholder="Toss with soy sauce in skillet over medium-high, 5 min"
          className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || !baseIngredient.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> {initial ? "Update" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-tag-bg"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </form>
  );
}
