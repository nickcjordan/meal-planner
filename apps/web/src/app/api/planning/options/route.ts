import { NextResponse } from "next/server";
import {
  getPlanningOptions,
  listDietaryAdaptations,
  listFamilyMembers,
  listInventory,
  listActiveIngredientSwaps,
  listRecipeSummaries,
} from "@meal-planner/db";
import type { MealOption } from "@meal-planner/db";

/**
 * GET /api/planning/options?week=YYYY-MM-DD[&q=...]
 *
 * Step 1 of the planning wizard: the recipe options grid (and its search box).
 * Returns scored + demoted meal options, per-option adaptation/swap hints, a
 * pre-planning banner, and the slice of planning context the UI needs. All data
 * is consolidated server-side from @meal-planner/db (mirrors what PlanningChat's
 * fetchFamilyContext previously assembled from three client fetches).
 */

interface PlanningOptionsResponse {
  weekOf: string;
  options: Array<MealOption & { adaptationHints: string[]; swapHints: string[] }>;
  banner: {
    awayMembers: string[];
    activeAdaptations: { name: string; memberName: string }[];
    inventoryAlerts: { name: string; status: "out" | "low" }[];
  };
  context: {
    activeFamilySize: number;
    restrictions: string[];
    scheduleConstraints: { day: string; note: string }[];
  };
}

/** Case-insensitive containment in either direction — the repo's fuzzy display
 *  match ("milk" hits "lactose-free milk" and vice versa). Display-only hints,
 *  so a loose match is intentional; destructive substitution uses namesMatchExact. */
function fuzzyContains(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (!al || !bl) return false;
  return al.includes(bl) || bl.includes(al);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekOf = searchParams.get("week");
    if (!weekOf) {
      return NextResponse.json({ error: "week is required" }, { status: 400 });
    }
    const q = searchParams.get("q")?.trim();

    const { options, context } = await getPlanningOptions(
      weekOf,
      q ? { query: q } : undefined,
    );

    const [adaptations, members, inventory, swaps, summaries] = await Promise.all([
      listDietaryAdaptations(),
      listFamilyMembers(),
      listInventory(),
      listActiveIngredientSwaps(),
      listRecipeSummaries(),
    ]);

    // MealOption carries no ingredient names (no hydration), so resolve them from
    // the same summaries source for hint computation.
    const ingredientNamesById = new Map<string, string[]>();
    for (const s of summaries) {
      ingredientNamesById.set(s.id, s.ingredientNames ?? []);
    }

    const activeAdaptations = adaptations.filter((a) => a.isActive);
    const memberNameById = new Map(members.map((m) => [m.id, m.name]));

    const optionsWithHints = options.map((option) => {
      const names = ingredientNamesById.get(option.id) ?? [];
      const adaptationHints = activeAdaptations
        .filter((a) => a.rules.some((r) => names.some((n) => fuzzyContains(r.from, n))))
        .map((a) => a.name);
      const swapHints = swaps
        .filter((s) => names.some((n) => fuzzyContains(s.from, n)))
        .map((s) => s.from);
      return {
        ...option,
        adaptationHints: [...new Set(adaptationHints)],
        swapHints: [...new Set(swapHints)],
      };
    });

    const banner: PlanningOptionsResponse["banner"] = {
      awayMembers: members.filter((m) => !m.isActive).map((m) => m.name),
      activeAdaptations: activeAdaptations.map((a) => ({
        name: a.name,
        memberName: memberNameById.get(a.memberId) ?? "Unknown",
      })),
      inventoryAlerts: inventory
        .filter((i) => i.status === "out" || i.status === "low")
        .map((i) => ({ name: i.name, status: i.status as "out" | "low" })),
    };

    const response: PlanningOptionsResponse = {
      weekOf,
      options: optionsWithHints,
      banner,
      context: {
        activeFamilySize: context.activeFamilySize,
        restrictions: context.restrictions,
        scheduleConstraints: context.scheduleConstraints,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/planning/options failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
