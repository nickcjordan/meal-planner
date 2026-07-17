import { NextResponse } from "next/server";
import { ensureGroceryList, saveGroceryList, recordPurchases } from "@meal-planner/db";

export async function POST() {
  try {
    const list = await ensureGroceryList();
    const before = list.items.length;
    const checkedItems = list.items.filter((item) => item.checked);

    // Record the checked items as purchases *before* deleting them, so
    // purchase-pattern analytics survive the clear.
    await recordPurchases(
      checkedItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      })),
      new Date().toISOString(),
    );

    list.items = list.items.filter((item) => !item.checked);
    const removed = before - list.items.length;

    const saved = await saveGroceryList(list);
    return NextResponse.json({ removed, list: saved });
  } catch (err) {
    console.error("POST /api/grocery/clear-checked failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
