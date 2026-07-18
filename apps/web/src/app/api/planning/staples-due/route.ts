import { NextResponse } from "next/server";
import { getStaplesDue } from "@meal-planner/db";

/**
 * GET /api/planning/staples-due?week=YYYY-MM-DD
 *
 * Deterministic "which grocery staples are due this week" data for the wizard's
 * roundout step. Returns { due, asNeeded }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekOf = searchParams.get("week");
    if (!weekOf) {
      return NextResponse.json({ error: "week is required" }, { status: 400 });
    }

    const result = await getStaplesDue(weekOf);
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/planning/staples-due failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
