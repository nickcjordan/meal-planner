import { NextResponse } from "next/server";
import {
  saveHebStore,
  getHebStore,
  getHebStoreIfConfigured,
} from "@meal-planner/heb";

export async function GET() {
  try {
    // `getHebStore` always returns *a* store (falling back to the hardcoded
    // default); `storeConfigured` tells the client whether it is a real
    // user-chosen store or that default.
    const configured = await getHebStoreIfConfigured();
    const store = configured ?? (await getHebStore());
    return NextResponse.json({ ...store, storeConfigured: configured !== null });
  } catch (err) {
    console.error("GET /api/heb/store failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { storeId, storeName, address, postalCode } = await request.json();

    if (!storeId || !storeName) {
      return NextResponse.json(
        { error: "storeId and storeName are required" },
        { status: 400 },
      );
    }

    await saveHebStore({
      storeId,
      storeName,
      address: address ?? "",
      ...(postalCode ? { postalCode } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/heb/store failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
