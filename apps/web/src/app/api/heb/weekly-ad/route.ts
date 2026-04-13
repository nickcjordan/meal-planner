import { NextResponse } from "next/server";
import { getWeeklyAd } from "@meal-planner/heb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postalCode = searchParams.get("zip") ?? "78704";
    const flyerIdParam = searchParams.get("flyerId");
    const flyerId = flyerIdParam ? parseInt(flyerIdParam, 10) : undefined;

    const data = await getWeeklyAd(postalCode, flyerId);

    if (!data) {
      return NextResponse.json(
        { error: "Could not fetch weekly ad" },
        { status: 502 },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/heb/weekly-ad failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
