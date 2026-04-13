import { NextResponse } from "next/server";
import { listFamilyMembers, addFamilyMember } from "@meal-planner/db";
import type { CreateFamilyMemberInput } from "@meal-planner/types";

export async function GET() {
  try {
    const members = await listFamilyMembers();
    return NextResponse.json(members);
  } catch (err) {
    console.error("GET /api/members failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateFamilyMemberInput;

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const member = await addFamilyMember(body);
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    console.error("POST /api/members failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
