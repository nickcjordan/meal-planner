import { NextResponse } from "next/server";
import { getFeedbackForSession, saveFeedback, updateSession } from "@meal-planner/db";
import type { CreateFeedbackInput } from "@meal-planner/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const feedback = await getFeedbackForSession(id);
    return NextResponse.json(feedback);
  } catch (err) {
    console.error("GET /api/sessions/[id]/feedback failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const items = body.feedback as CreateFeedbackInput[];

    const saved = [];
    for (const item of items) {
      const feedback = await saveFeedback({ ...item, sessionId: id });
      saved.push(feedback);
    }

    await updateSession(id, { status: "completed" });

    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error("POST /api/sessions/[id]/feedback failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
