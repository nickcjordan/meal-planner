import { NextResponse } from "next/server";
import { removePantryItem } from "@meal-planner/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    await removePantryItem(decodeURIComponent(name));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/pantry/[name] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
