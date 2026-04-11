import { NextResponse } from "next/server";
import { getRecentSessions } from "@meal-planner/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const sessions = await getRecentSessions(limit);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error("GET /api/sessions failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
