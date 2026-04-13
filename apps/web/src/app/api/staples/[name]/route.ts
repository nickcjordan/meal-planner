import { NextResponse } from "next/server";
import { removeGroceryStaple, updateGroceryStaple } from "@meal-planner/db";
import type { GroceryStaple } from "@meal-planner/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    // "name" in the URL is actually the staple ID
    const { name: id } = await params;
    const body = (await request.json()) as Partial<GroceryStaple>;
    const updated = await updateGroceryStaple(decodeURIComponent(id), body);
    if (!updated) {
      return NextResponse.json({ error: "Staple not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/staples/[name] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    // "name" in the URL is actually the staple ID
    const { name: id } = await params;
    await removeGroceryStaple(decodeURIComponent(id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/staples/[name] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
