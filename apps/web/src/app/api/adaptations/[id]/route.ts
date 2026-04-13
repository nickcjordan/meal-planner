import { NextResponse } from "next/server";
import { updateDietaryAdaptation, removeDietaryAdaptation } from "@meal-planner/db";
import type { CreateDietaryAdaptationInput } from "@meal-planner/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<CreateDietaryAdaptationInput>;
    const adaptation = await updateDietaryAdaptation(id, body);
    if (!adaptation) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(adaptation);
  } catch (err) {
    console.error("PATCH /api/adaptations/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await removeDietaryAdaptation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/adaptations/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
