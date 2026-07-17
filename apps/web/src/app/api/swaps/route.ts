import { NextResponse } from "next/server";
import { listIngredientSwaps, addIngredientSwap } from "@meal-planner/db";
import type { CreateIngredientSwapInput } from "@meal-planner/types";

export async function GET() {
  try {
    const items = await listIngredientSwaps();
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/swaps failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateIngredientSwapInput;
    const item = await addIngredientSwap(body);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/swaps failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
