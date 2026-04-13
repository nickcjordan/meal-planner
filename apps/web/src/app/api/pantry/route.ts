import { NextResponse } from "next/server";
import {
  listPantryItems,
  addPantryItem,
  getPantryItemByNormalizedName,
} from "@meal-planner/db";
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

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }

    // Check for duplicates by normalized name
    const existing = await getPantryItemByNormalizedName(body.name);
    if (existing) {
      return NextResponse.json(
        { error: "duplicate", existing },
        { status: 409 },
      );
    }

    const item = await addPantryItem(body);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/pantry failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
