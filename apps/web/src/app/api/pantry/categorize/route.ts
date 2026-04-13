import { NextResponse } from "next/server";
import { categorizeItems } from "@meal-planner/import";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { names?: string[] };

    if (!Array.isArray(body.names) || body.names.length === 0) {
      return NextResponse.json(
        { error: "names must be a non-empty array of strings" },
        { status: 400 },
      );
    }

    if (body.names.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 items per request" },
        { status: 400 },
      );
    }

    const results = await categorizeItems(body.names);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("POST /api/pantry/categorize failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
