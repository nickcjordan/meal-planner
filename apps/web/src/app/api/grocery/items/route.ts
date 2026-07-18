import { NextResponse } from "next/server";
import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";
import type { GroceryListItem } from "@meal-planner/types";
import { randomUUID } from "crypto";

interface ItemInput {
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  notes?: string;
}

function buildItem(input: ItemInput, now: string): GroceryListItem {
  return {
    id: randomUUID(),
    name: input.name.trim(),
    quantity: input.quantity ?? 1,
    unit: input.unit ?? "",
    category: input.category ?? "other",
    checked: false,
    sources: [{ type: "manual" }],
    notes: input.notes,
    addedAt: now,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ItemInput & { items?: ItemInput[] };
    const bulk = Array.isArray(body.items);

    // Normalize to a list of inputs, dropping entries without a usable name.
    const inputs = (bulk ? body.items! : [body]).filter((i) => i?.name?.trim());

    if (inputs.length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newItems = inputs.map((i) => buildItem(i, now));

    // Single read-modify-write for all items so concurrent adds can't drop entries.
    const list = await ensureGroceryList();
    list.items.push(...newItems);
    const saved = await saveGroceryList(list);

    // Preserve the single-item response shape for existing callers.
    return bulk
      ? NextResponse.json({ items: newItems, list: saved }, { status: 201 })
      : NextResponse.json({ item: newItems[0], list: saved }, { status: 201 });
  } catch (err) {
    console.error("POST /api/grocery/items failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
