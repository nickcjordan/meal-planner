import { NextResponse } from "next/server";
import { refreshSession, getHebStore } from "@meal-planner/heb";

export async function POST() {
  try {
    const store = await getHebStore();
    const cookies = await refreshSession(store.storeId);

    if (!cookies) {
      return NextResponse.json(
        { error: "Session refresh failed. Chrome may not be available." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      cookieLength: cookies.length,
      capturedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("POST /api/heb/refresh failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
