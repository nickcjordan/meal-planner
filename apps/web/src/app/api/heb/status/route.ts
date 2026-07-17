import { NextResponse } from "next/server";
import {
  getHebStore,
  getHebStoreIfConfigured,
  getHebCookies,
  deleteHebCookies,
} from "@meal-planner/heb";

export async function GET() {
  try {
    const configured = await getHebStoreIfConfigured();
    const store = configured ?? (await getHebStore());
    const cookies = await getHebCookies();

    const connected = !!cookies;
    let cookieAge: number | undefined;

    if (cookies) {
      cookieAge = Date.now() - new Date(cookies.capturedAt).getTime();
    }

    return NextResponse.json({
      connected,
      store,
      // True only when a real store record exists in DynamoDB, so the UI can
      // distinguish a user-chosen store from the hardcoded default fallback.
      storeConfigured: configured !== null,
      cookieAge,
      cookieFresh: cookieAge !== undefined && cookieAge < 10 * 60 * 1000,
    });
  } catch (err) {
    console.error("GET /api/heb/status failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteHebCookies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/heb/status failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
