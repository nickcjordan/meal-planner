import { NextResponse } from "next/server";
import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";

export async function POST() {
  try {
    const list = await ensureGroceryList();
    const before = list.items.length;
    list.items = list.items.filter((item) => !item.checked);
    const removed = before - list.items.length;

    const saved = await saveGroceryList(list);
    return NextResponse.json({ removed, list: saved });
  } catch (err) {
    console.error("POST /api/grocery/clear-checked failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
