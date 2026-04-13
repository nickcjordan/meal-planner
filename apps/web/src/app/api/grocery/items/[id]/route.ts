import { NextResponse } from "next/server";
import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const list = await ensureGroceryList();

    const index = list.items.findIndex((item) => item.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Allow updating: checked, quantity, unit, notes, name, category
    const item = list.items[index];
    if (body.checked !== undefined) item.checked = body.checked;
    if (body.quantity !== undefined) item.quantity = body.quantity;
    if (body.unit !== undefined) item.unit = body.unit;
    if (body.notes !== undefined) item.notes = body.notes;
    if (body.name !== undefined) item.name = body.name;
    if (body.category !== undefined) item.category = body.category;

    const saved = await saveGroceryList(list);
    return NextResponse.json({ item, list: saved });
  } catch (err) {
    console.error("PATCH /api/grocery/items/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const list = await ensureGroceryList();

    const index = list.items.findIndex((item) => item.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    list.items.splice(index, 1);
    const saved = await saveGroceryList(list);

    return NextResponse.json(saved);
  } catch (err) {
    console.error("DELETE /api/grocery/items/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
