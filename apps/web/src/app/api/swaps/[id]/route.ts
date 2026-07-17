import { NextResponse } from "next/server";
import { removeIngredientSwap, updateIngredientSwap } from "@meal-planner/db";
import type { IngredientSwap } from "@meal-planner/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<IngredientSwap>;
    const updated = await updateIngredientSwap(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Swap not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/swaps/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await removeIngredientSwap(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/swaps/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
