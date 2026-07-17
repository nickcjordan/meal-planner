import { NextResponse } from "next/server";
import { searchSides } from "@meal-planner/db";
import type { Side, SideCategory, SideComplexity } from "@meal-planner/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as SideCategory | null;
    const complexity = searchParams.get("complexity") as SideComplexity | null;
    const currentSideIdsParam = searchParams.get("currentSideIds");
    const weekSideIdsParam = searchParams.get("weekSideIds");

    const currentSideIds = new Set(currentSideIdsParam?.split(",").filter(Boolean) ?? []);
    const weekSideIds = new Set(weekSideIdsParam?.split(",").filter(Boolean) ?? []);

    const allCandidates = await searchSides({
      category: category ?? undefined,
      complexity: complexity ?? undefined,
    });

    const filtered = allCandidates.filter((s) => !currentSideIds.has(s.id));

    const poolSiblings: (Side & { isPoolSibling: true })[] = [];
    const libraryCandidates: (Side & { isPoolSibling: false })[] = [];

    for (const side of filtered) {
      if (weekSideIds.has(side.id)) {
        poolSiblings.push({ ...side, isPoolSibling: true });
      } else {
        libraryCandidates.push({ ...side, isPoolSibling: false });
      }
    }

    const results = [...poolSiblings, ...libraryCandidates].slice(0, 6);

    return NextResponse.json(results);
  } catch (err) {
    console.error("GET /api/sides/alternatives failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
