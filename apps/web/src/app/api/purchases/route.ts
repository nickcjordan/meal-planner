import { NextResponse } from "next/server";
import { getPurchasePatterns, getSmartPromotionCandidates } from "@meal-planner/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const promotionsOnly = url.searchParams.get("promotions") === "true";
    const limit = parseInt(url.searchParams.get("limit") ?? "8", 10);

    if (promotionsOnly) {
      const candidates = await getSmartPromotionCandidates(limit);
      return NextResponse.json(candidates);
    }

    const patterns = await getPurchasePatterns(limit);
    return NextResponse.json(patterns);
  } catch (err) {
    console.error("GET /api/purchases failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
