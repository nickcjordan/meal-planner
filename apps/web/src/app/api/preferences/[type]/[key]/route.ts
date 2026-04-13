import { NextResponse } from "next/server";
import { removePreference, setPreference } from "@meal-planner/db";
import type { CreatePreferenceInput } from "@meal-planner/types";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ type: string; key: string }> },
) {
  try {
    const { type, key } = await params;
    const body = (await request.json()) as Partial<CreatePreferenceInput>;

    const pref = await setPreference({
      type: (body.type ?? type) as CreatePreferenceInput["type"],
      key: body.key ?? key,
      value: body.value ?? "",
      member: body.member,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    return NextResponse.json(pref);
  } catch (err) {
    console.error("PUT /api/preferences/[type]/[key] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ type: string; key: string }> },
) {
  try {
    const { type, key } = await params;
    await removePreference(type, key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/preferences/[type]/[key] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
