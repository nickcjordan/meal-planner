import { NextResponse } from "next/server";
import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";
import type { GroceryListItem } from "@meal-planner/types";

export async function GET() {
  try {
    const list = await ensureGroceryList();
    return NextResponse.json(list);
  } catch (err) {
    console.error("GET /api/grocery failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const existing = await ensureGroceryList();

    const list = await saveGroceryList({
      ...existing,
      items: body.items as GroceryListItem[],
    });

    return NextResponse.json(list);
  } catch (err) {
    console.error("PATCH /api/grocery failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
