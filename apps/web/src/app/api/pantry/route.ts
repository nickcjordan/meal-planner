import { NextResponse } from "next/server";
import { listPantryItems, addPantryItem } from "@meal-planner/db";
import type { CreatePantryItemInput } from "@meal-planner/types";

export async function GET() {
  try {
    const items = await listPantryItems();
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/pantry failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePantryItemInput;
    const item = await addPantryItem(body);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/pantry failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
