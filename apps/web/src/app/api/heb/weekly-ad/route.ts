import { NextResponse } from "next/server";
import { getWeeklyAd, getHebStore } from "@meal-planner/heb";

const DEFAULT_POSTAL = "78704";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flyerIdParam = searchParams.get("flyerId");
    const flyerId = flyerIdParam ? parseInt(flyerIdParam, 10) : undefined;

    // Region the ad to the selected store's ZIP; an explicit `zip` query param
    // overrides, and the hardcoded default backs both up.
    const store = await getHebStore();
    const postalCode =
      searchParams.get("zip") ?? store.postalCode ?? DEFAULT_POSTAL;

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
