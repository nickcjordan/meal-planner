import { NextResponse } from "next/server";
import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";
import type { GroceryListItem } from "@meal-planner/types";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, quantity, unit, category, notes } = body as {
      name: string;
      quantity?: number;
      unit?: string;
      category?: string;
      notes?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const list = await ensureGroceryList();
    const now = new Date().toISOString();

    const newItem: GroceryListItem = {
      id: randomUUID(),
      name: name.trim(),
      quantity: quantity ?? 1,
      unit: unit ?? "",
      category: category ?? "other",
      checked: false,
      sources: [{ type: "manual" }],
      notes,
      addedAt: now,
    };

    list.items.push(newItem);
    const saved = await saveGroceryList(list);

    return NextResponse.json({ item: newItem, list: saved }, { status: 201 });
  } catch (err) {
    console.error("POST /api/grocery/items failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
