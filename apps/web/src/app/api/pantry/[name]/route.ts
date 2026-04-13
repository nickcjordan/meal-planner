import { NextResponse } from "next/server";
import { removePantryItem, updatePantryItem } from "@meal-planner/db";
import type { UpdatePantryItemInput } from "@meal-planner/types";

type RouteParams = { params: Promise<{ name: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    // "name" param is actually the pantry item ID
    const { name: id } = await params;
    const body = (await request.json()) as UpdatePantryItemInput;
    const updated = await updatePantryItem(decodeURIComponent(id), body);

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/pantry/[name] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    // "name" param is actually the pantry item ID
    const { name: id } = await params;
    await removePantryItem(decodeURIComponent(id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/pantry/[name] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
