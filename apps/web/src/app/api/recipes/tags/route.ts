import { NextResponse } from "next/server";
import { listTags } from "@meal-planner/db";

export async function GET() {
  try {
    const tags = await listTags();
    return NextResponse.json(tags);
  } catch (err) {
    console.error("GET /api/recipes/tags failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
