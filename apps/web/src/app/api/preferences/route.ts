import { NextResponse } from "next/server";
import { listPreferences, setPreference } from "@meal-planner/db";
import type { CreatePreferenceInput } from "@meal-planner/types";

export async function GET() {
  try {
    const prefs = await listPreferences();
    return NextResponse.json(prefs);
  } catch (err) {
    console.error("GET /api/preferences failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePreferenceInput;

    if (!body.type || !body.key?.trim() || !body.value?.trim()) {
      return NextResponse.json(
        { error: "type, key, and value are required" },
        { status: 400 },
      );
    }

    const pref = await setPreference(body);
    return NextResponse.json(pref, { status: 201 });
  } catch (err) {
    console.error("POST /api/preferences failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
