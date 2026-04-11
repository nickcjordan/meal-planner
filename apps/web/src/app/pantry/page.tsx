"use client";

import { useState, useEffect } from "react";
import type { PantryItem } from "@meal-planner/types";
import { Plus, Trash2 } from "lucide-react";

const CATEGORIES = [
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

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("pantry");

  useEffect(() => {
    fetch("/api/pantry")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await fetch("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), category }),
    });

    if (res.ok) {
      const item = await res.json();
      setItems((prev) => [...prev, item]);
      setName("");
    }
  }

  async function removeItem(itemName: string) {
    await fetch(`/api/pantry/${encodeURIComponent(itemName)}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.name !== itemName));
  }

  // Group by category
  const grouped = new Map<string, PantryItem[]>();
  for (const item of items) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  if (loading) {
    return <div className="py-16 text-center text-muted">Loading pantry items...</div>;
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-foreground">Pantry Items</h1>
      <p className="mb-6 text-sm text-muted">
        Items you always have on hand. These are excluded from shopping lists.
      </p>

      <form onSubmit={addItem} className="mb-8 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name (e.g. salt, olive oil)"
          className="flex-1 rounded-lg border border-input-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-input-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {items.length === 0 ? (
        <p className="py-8 text-center text-muted">
          No pantry items yet. Add your kitchen staples above.
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {cat}
              </h3>
              <div className="space-y-1">
                {catItems.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-lg border border-card-border bg-card px-4 py-3"
                  >
                    <span className="text-sm text-foreground">{item.name}</span>
                    <button
                      onClick={() => removeItem(item.name)}
                      className="text-muted transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
