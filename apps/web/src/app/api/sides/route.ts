import { NextResponse } from "next/server";
import { listSides, searchSides, createSide } from "@meal-planner/db";
import type { CreateSideInput, SideCategory, SideComplexity } from "@meal-planner/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as SideCategory | null;
    const complexity = searchParams.get("complexity") as SideComplexity | null;
    const tag = searchParams.get("tag");
    const query = searchParams.get("q");

    const hasFilters = category || complexity || tag || query;

    const sides = hasFilters
      ? await searchSides({
          category: category ?? undefined,
          complexity: complexity ?? undefined,
          tags: tag ? [tag] : undefined,
          query: query ?? undefined,
        })
      : await listSides();

    return NextResponse.json(sides);
  } catch (err) {
    console.error("GET /api/sides failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSideInput;

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!body.baseIngredient?.trim()) {
      return NextResponse.json({ error: "baseIngredient is required" }, { status: 400 });
    }

    // `tags` is required by CreateSideInput but raw API callers may omit it.
    // Default to [] and reject non-array values (createSide would 500 otherwise).
    if (body.tags === undefined) {
      body.tags = [];
    } else if (!Array.isArray(body.tags)) {
      return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
    }

    const side = await createSide(body);
    return NextResponse.json(side, { status: 201 });
  } catch (err) {
    console.error("POST /api/sides failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
