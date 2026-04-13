import { NextResponse } from "next/server";
import { getHebStore, getHebCookies, deleteHebCookies } from "@meal-planner/heb";

export async function GET() {
  try {
    const store = await getHebStore();
    const cookies = await getHebCookies();

    const connected = !!cookies;
    let cookieAge: number | undefined;

    if (cookies) {
      cookieAge = Date.now() - new Date(cookies.capturedAt).getTime();
    }

    return NextResponse.json({
      connected,
      store: store ?? undefined,
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
