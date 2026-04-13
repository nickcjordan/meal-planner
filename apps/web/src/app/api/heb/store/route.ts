import { NextResponse } from "next/server";
import { saveHebStore, getHebStore } from "@meal-planner/heb";

export async function GET() {
  try {
    const store = await getHebStore();
    if (!store) {
      return NextResponse.json({ error: "No store configured" }, { status: 404 });
    }
    return NextResponse.json(store);
  } catch (err) {
    console.error("GET /api/heb/store failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { storeId, storeName, address } = await request.json();

    if (!storeId || !storeName) {
      return NextResponse.json(
        { error: "storeId and storeName are required" },
        { status: 400 },
      );
    }

    await saveHebStore({ storeId, storeName, address: address ?? "" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/heb/store failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
