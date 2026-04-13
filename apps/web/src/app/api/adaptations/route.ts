import { NextResponse } from "next/server";
import {
  listDietaryAdaptations,
  listAdaptationsForMember,
  addDietaryAdaptation,
} from "@meal-planner/db";
import type { CreateDietaryAdaptationInput } from "@meal-planner/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("memberId");

    const adaptations = memberId
      ? await listAdaptationsForMember(memberId)
      : await listDietaryAdaptations();

    return NextResponse.json(adaptations);
  } catch (err) {
    console.error("GET /api/adaptations failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateDietaryAdaptationInput;

    if (!body.name?.trim() || !body.memberId?.trim()) {
      return NextResponse.json(
        { error: "name and memberId are required" },
        { status: 400 },
      );
    }

    const adaptation = await addDietaryAdaptation(body);
    return NextResponse.json(adaptation, { status: 201 });
  } catch (err) {
    console.error("POST /api/adaptations failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
