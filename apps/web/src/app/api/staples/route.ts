import { NextResponse } from "next/server";
import { listGroceryStaples, addGroceryStaple } from "@meal-planner/db";
import type { CreateGroceryStapleInput } from "@meal-planner/types";

export async function GET() {
  try {
    const items = await listGroceryStaples();
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/staples failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateGroceryStapleInput;
    const item = await addGroceryStaple(body);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/staples failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
