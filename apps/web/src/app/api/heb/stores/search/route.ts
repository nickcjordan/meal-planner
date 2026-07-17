import { NextResponse } from "next/server";
import { searchStores } from "heb-sdk-unofficial";
import { getFreshCookies, getHebStore } from "@meal-planner/heb";
import { createSessionFromCookies } from "heb-sdk-unofficial";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "q query parameter is required" },
        { status: 400 },
      );
    }

    // We need cookies for the store search API
    const store = await getHebStore();
    const storeId = store?.storeId ?? "790";
    const cookieHeader = await getFreshCookies(storeId);

    if (!cookieHeader) {
      return NextResponse.json(
        { error: "Could not get HEB session. Try refreshing." },
        { status: 503 },
      );
    }

    const session = createSessionFromCookies(cookieHeader);
    const stores = await searchStores(session, query);

    const results = stores.map((s) => ({
      storeId: s.storeNumber,
      storeName: s.name,
      address: s.address
        ? `${s.address.streetAddress}, ${s.address.city}, ${s.address.state} ${s.address.zip}`
        : "",
      postalCode: s.address?.zip || undefined,
    }));

    return NextResponse.json(results);
  } catch (err) {
    console.error("GET /api/heb/stores/search failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
