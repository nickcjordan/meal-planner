import { NextResponse } from "next/server";
import { getSession, updateSession } from "@meal-planner/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (err) {
    console.error("GET /api/sessions/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const session = await updateSession(id, body);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (err) {
    console.error("PATCH /api/sessions/[id] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
