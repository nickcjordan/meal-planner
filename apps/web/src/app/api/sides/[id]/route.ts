import { NextResponse } from "next/server";
import { getSide, updateSide, deleteSide } from "@meal-planner/db";
import type { UpdateSideInput } from "@meal-planner/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const side = await getSide(id);
    if (!side) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(side);
  } catch (err) {
    console.error("GET /api/sides/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateSideInput;
    const side = await updateSide(id, body);
    if (!side) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(side);
  } catch (err) {
    console.error("PUT /api/sides/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = await deleteSide(id);
    if (!deleted) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/sides/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
