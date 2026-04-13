import { NextResponse } from "next/server";
import { updateFamilyMember, removeFamilyMember } from "@meal-planner/db";
import type { CreateFamilyMemberInput } from "@meal-planner/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<CreateFamilyMemberInput>;
    const member = await updateFamilyMember(id, body);
    if (!member) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(member);
  } catch (err) {
    console.error("PATCH /api/members/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await removeFamilyMember(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/members/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
