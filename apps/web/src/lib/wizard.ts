/**
 * Pure logic for the collaborative planning wizard (Phase 2 core).
 *
 * Everything here is React-free and unit-testable: the WizardState machine
 * types, versioned localStorage persistence, the self-contained phase-message
 * builders (PHASE:OPTIONS / DRAFT / ROUNDOUT), the grocery-preview request
 * mapper, deterministic auto-pick, effort/protein meters, the stable input key
 * used to invalidate the roundout prefetch, and the payload → UI-state mappers.
 *
 * Frozen contracts: phase1-shared-contracts.md (backend shapes) and
 * phase2plus-wizard-contracts.md (WizardState + component props).
 */

import type { MealOption } from "@meal-planner/db";
import type {
  MealOptionsPayload,
  PlanDraftPayload,
  WeekRoundoutPayload,
  ProposedStaple,
  ProposedCarryover,
  ProposedSuggestion,
  ProposedExtra,
  DraftSideSuggestion,
} from "@meal-planner/agent";
import type {
  DayOfWeek,
  MealType,
  PlannedSide,
  PlannedMeal,
  MealAdaptationDecision,
  SessionStapleItem,
  CarryoverItem,
  PlanExtra,
  GroceryListItem,
  GroceryItemSource,
  SideComplexity,
  SideCategory,
  SideIngredient,
} from "@meal-planner/types";
import { DAY_ORDER } from "./week";

// ─── Grid / options types ────────────────────────────────────────────────────

/** A grid card = the API's MealOption plus its per-card hints. `aiSuggested`
 *  flags synthetic cards surfaced via a meal_options `addOptions` payload. */
export type MealOptionCard = MealOption & {
  adaptationHints: string[];
  swapHints: string[];
  aiSuggested?: boolean;
};

/** Response shape of GET /api/planning/options (frozen phase1 §2). */
export interface PlanningOptionsResponse {
  weekOf: string;
  options: MealOptionCard[];
  banner: WizardBanner;
  context: {
    activeFamilySize: number;
    restrictions: string[];
    scheduleConstraints: { day: string; note: string }[];
  };
}

export interface WizardBanner {
  awayMembers: string[];
  activeAdaptations: { name: string; memberName: string }[];
  inventoryAlerts: { name: string; status: "out" | "low" }[];
}

/** Client-side grid filters (Step 1). Null = unset. */
export interface WizardFilters {
  complexity: string | null;
  protein: string | null;
  cuisine: string | null;
  maxTime: number | null;
}

export const EMPTY_FILTERS: WizardFilters = {
  complexity: null,
  protein: null,
  cuisine: null,
  maxTime: null,
};

// ─── WizardState machine ─────────────────────────────────────────────────────

export const WIZARD_VERSION = 1 as const;
export const WIZARD_STORAGE_KEY = "meal-planner-wizard-session";

/** Minimal card data persisted for a selected recipe so it can render even when
 *  it drops out of a refetched grid. `cuisine` is a Phase-2 addition (see report)
 *  so the Step-5 cuisine-variety analytic is computable from persisted state. */
export interface SelectedMeta {
  name: string;
  complexity: string;
  protein?: string;
  cuisine?: string;
  totalTime: number;
}

export interface DraftMealUI {
  day: string;
  mealType: string;
  recipeId: string;
  recipeName: string;
  complexity: string;
  dayReasoning: string;
  completenessNote?: string;
  sides: Array<DraftSideSuggestion & { accepted: boolean }>;
  adaptationDecisions: Array<{
    adaptationName: string;
    memberName: string;
    applied: boolean;
    swaps?: { from: string; to: string; quality: string }[];
    skipReason?: string;
    skipNote?: string;
  }>;
}

export interface RoundoutUI {
  /** stableInputKey(selected meals + accepted side names) at fetch time. */
  inputKey: string;
  staples: Array<ProposedStaple & { accepted: boolean }>;
  carryovers: Array<ProposedCarryover>;
  suggestions: Array<ProposedSuggestion & { state: "open" | "accepted" | "dismissed" }>;
  extras: ProposedExtra[];
}

export interface WizardState {
  version: typeof WIZARD_VERSION;
  weekOf: string;
  step: 1 | 2 | 3 | 4;
  /** Only foreground turns write this; prefetch streams never do. */
  plannerSessionId: string | null;
  selectedRecipeIds: string[];
  selectedMeta: Record<string, SelectedMeta>;
  annotations: Record<string, string>;
  draft: DraftMealUI[] | null;
  roundout: RoundoutUI | null;
  excludedIngredients: string[];
  savedSessionId: string | null;
  mergeFailed: boolean;
  savedAt?: string;
}

export function createInitialWizardState(weekOf: string): WizardState {
  return {
    version: WIZARD_VERSION,
    weekOf,
    step: 1,
    plannerSessionId: null,
    selectedRecipeIds: [],
    selectedMeta: {},
    annotations: {},
    draft: null,
    roundout: null,
    excludedIngredients: [],
    savedSessionId: null,
    mergeFailed: false,
  };
}

// ─── Persistence (versioned; debounce handled by caller) ─────────────────────

/** Pure parse + guard — rejects a payload from a different weekOf or an older
 *  schema version (migration safety). Extracted from {@link loadWizardState} so
 *  it is testable without a DOM. */
export function parseWizardState(raw: string | null, weekOf: string): WizardState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    if (parsed.version !== WIZARD_VERSION) return null;
    if (parsed.weekOf !== weekOf) return null;
    return parsed as WizardState;
  } catch {
    return null;
  }
}

export function loadWizardState(weekOf: string): WizardState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return parseWizardState(localStorage.getItem(WIZARD_STORAGE_KEY), weekOf);
  } catch {
    return null;
  }
}

export function saveWizardState(state: WizardState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      WIZARD_STORAGE_KEY,
      JSON.stringify({ ...state, savedAt: new Date().toISOString() }),
    );
  } catch {
    // storage full or unavailable
  }
}

export function clearWizardState(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Phase-message builders (self-contained per phase1 §5) ───────────────────

export interface GridLine {
  name: string;
  id: string;
  complexity: string;
  protein?: string;
}

export interface SelectedMealLine {
  name: string;
  id: string;
  complexity: string;
  protein?: string;
  totalTime: number;
}

/** A due-staple line for the ROUNDOUT message (pass-through of staples-due). */
export interface RoundoutStapleLine {
  name: string;
  style: string;
  category: string;
  quantity?: number;
  unit?: string;
  description?: string;
  frequency: string;
}

function dayIndex(day: string): number {
  const i = DAY_ORDER.indexOf(day as DayOfWeek);
  return i === -1 ? 99 : i;
}

export function buildOptionsRefineMessage(
  weekOf: string,
  grid: GridLine[],
  userText: string,
): string {
  const gridStr = grid
    .map((g) => `${g.name} (${g.id}) | ${g.complexity}${g.protein ? ` | ${g.protein}` : ""}`)
    .join(", ");
  return [
    "PHASE:OPTIONS",
    `weekOf: ${weekOf}`,
    `Current grid (ranked): ${gridStr}`,
    `User request: ${userText}`,
  ].join("\n");
}

export function buildDraftMessage(
  weekOf: string,
  meals: SelectedMealLine[],
  constraintsRecap: string,
): string {
  const mealsStr = meals
    .map((m) => `{${m.name} (${m.id}), ${m.complexity}, ${m.protein ?? "?"}, ${m.totalTime}min}`)
    .join(", ");
  return [
    "PHASE:DRAFT",
    `weekOf: ${weekOf}`,
    `User selected these meals: [${mealsStr}]`,
    `Constraints recap: ${constraintsRecap || "none"}`,
    "Propose a day for each meal and sides/completions via present_plan_draft.",
  ].join("\n");
}

function formatDraftLine(m: DraftMealUI): string {
  const sides = m.sides.filter((s) => s.accepted).map((s) => s.sideName);
  return `${m.day}: ${m.recipeName}${sides.length ? ` (+ ${sides.join(", ")})` : ""}`;
}

function formatStaplesDue(staplesDue: RoundoutStapleLine[]): string {
  return staplesDue
    .map((s) => {
      const qty =
        s.quantity != null && s.unit
          ? ` ${s.quantity} ${s.unit}`
          : s.description
            ? ` (${s.description})`
            : "";
      return `${s.name} [${s.style}, ${s.category}, ${s.frequency}${qty}]`;
    })
    .join(", ");
}

export function buildRoundoutMessage(
  weekOf: string,
  draft: DraftMealUI[],
  staplesDue: RoundoutStapleLine[],
): string {
  const draftStr = [...draft].sort((a, b) => dayIndex(a.day) - dayIndex(b.day)).map(formatDraftLine).join(", ");
  return [
    "PHASE:ROUNDOUT",
    `weekOf: ${weekOf}`,
    `Final draft: [${draftStr}]`,
    `Staples due this week (deterministic, include as-is in groceryStaples): [${formatStaplesDue(staplesDue)}]`,
    "Analyze carryovers, deals, patterns; respond via present_week_roundout.",
  ].join("\n");
}

export interface AdHocContext {
  grid?: GridLine[];
  staplesDue?: RoundoutStapleLine[];
}

/** Ad-hoc chat during any step: same phase header + current-state recap so a
 *  fresh session can serve it (phase1 §5). Delegates to the phase builders where
 *  possible; otherwise appends "User request:" to the current state recap. */
export function buildAdHocMessage(
  step: 1 | 2 | 3 | 4,
  state: WizardState,
  text: string,
  ctx: AdHocContext = {},
): string {
  if (step === 1) {
    return buildOptionsRefineMessage(state.weekOf, ctx.grid ?? [], text);
  }

  const draft = state.draft ?? [];
  const draftStr = [...draft].sort((a, b) => dayIndex(a.day) - dayIndex(b.day)).map(formatDraftLine).join(", ");

  if (step === 2) {
    return [
      "PHASE:DRAFT",
      `weekOf: ${state.weekOf}`,
      `Current draft: [${draftStr}]`,
      `User request: ${text}`,
      "Update the schedule/sides/adaptations via present_plan_draft.",
    ].join("\n");
  }

  // Steps 3 & 4 operate on the roundout / final review — keep them in ROUNDOUT.
  return [
    "PHASE:ROUNDOUT",
    `weekOf: ${state.weekOf}`,
    `Final draft: [${draftStr}]`,
    `Staples due this week (deterministic, include as-is in groceryStaples): [${formatStaplesDue(ctx.staplesDue ?? [])}]`,
    `User request: ${text}`,
    "Respond via present_week_roundout.",
  ].join("\n");
}

// ─── Grocery preview request mapping ─────────────────────────────────────────

export interface WizardPreviewMeal {
  day?: DayOfWeek;
  mealType?: MealType;
  recipeId: string;
  sides?: PlannedSide[];
  adaptations?: MealAdaptationDecision[];
}

export interface GroceryPreviewRequest {
  weekOf: string;
  meals: WizardPreviewMeal[];
  extras?: PlanExtra[];
  groceryStaples?: SessionStapleItem[];
  carryoverItems?: CarryoverItem[];
  excludedIngredients?: string[];
}

export interface GroceryPreviewResponse {
  items: GroceryListItem[];
  count: number;
  warnings: string[];
}

/** What the GroceryRail renders from (PlanningWizard computes it). `loading` is a
 *  preview fetch in flight; `stale` is an optimistic count bump awaiting the next
 *  preview result. */
export interface PreviewState {
  items: GroceryListItem[];
  count: number;
  warnings: string[];
  loading: boolean;
  stale: boolean;
}

function sideToPlanned(side: DraftSideSuggestion): PlannedSide {
  if (side.sideId) {
    return { kind: "ref", sideId: side.sideId };
  }
  return {
    kind: "inline",
    name: side.sideName,
    ingredients: (side.ingredients ?? []) as SideIngredient[],
    complexity: side.complexity as SideComplexity,
    baseIngredient: side.baseIngredient,
    sideCategory: side.sideCategory as SideCategory,
  };
}

function stapleToSession(p: ProposedStaple): SessionStapleItem {
  return {
    name: p.name,
    style: p.style,
    category: p.category,
    quantity: p.quantity,
    unit: p.unit,
    description: p.description,
    frequency: p.frequency,
  };
}

/**
 * Build a GroceryPreviewRequest from the current WizardState.
 * - Step 1 (or before a draft exists): day-less meals from selectedRecipeIds.
 * - Step 2+: scheduled meals with accepted sides + adaptation decisions.
 * - Step 3+: also accepted staples, need-carryovers, accepted item-bearing
 *   suggestions (appended as staples, per legacy handleAcceptSuggestion), extras.
 * excludedIngredients is always forwarded.
 */
export function toPreviewRequest(state: WizardState): GroceryPreviewRequest {
  const excludedIngredients = state.excludedIngredients;

  if (state.step < 2 || !state.draft) {
    return {
      weekOf: state.weekOf,
      meals: state.selectedRecipeIds.map((recipeId) => ({ recipeId })),
      excludedIngredients,
    };
  }

  const meals: WizardPreviewMeal[] = state.draft.map((m) => ({
    day: m.day as DayOfWeek,
    mealType: (m.mealType || "dinner") as MealType,
    recipeId: m.recipeId,
    sides: m.sides.filter((s) => s.accepted).map(sideToPlanned),
    adaptations: m.adaptationDecisions.map((a) => ({
      adaptationName: a.adaptationName,
      applied: a.applied,
    })),
  }));

  if (state.step < 3 || !state.roundout) {
    return { weekOf: state.weekOf, meals, excludedIngredients };
  }

  // Preview only counts need-carryovers (phase1 §3).
  const carryoverItems: CarryoverItem[] = state.roundout.carryovers
    .filter((c) => c.status === "need")
    .map((c) => ({ ...c, status: "need" as const }));

  return {
    weekOf: state.weekOf,
    meals,
    groceryStaples: acceptedStaples(state.roundout),
    carryoverItems,
    extras: state.roundout.extras,
    excludedIngredients,
  };
}

// ─── Session-save mapping (shared with the confirm flow) ─────────────────────

/** Draft → PlannedMeal[] for POST /api/sessions/save (accepted sides only,
 *  per-meal adaptation decisions preserved). Mirrors legacy handleConfirm. */
export function toSavedMeals(draft: DraftMealUI[]): PlannedMeal[] {
  return draft.map((m) => ({
    day: m.day as DayOfWeek,
    mealType: (m.mealType || "dinner") as MealType,
    recipeId: m.recipeId,
    sides: m.sides.filter((s) => s.accepted).map(sideToPlanned),
    adaptations: m.adaptationDecisions.map((a) => ({
      adaptationName: a.adaptationName,
      applied: a.applied,
    })),
  }));
}

/** Accepted staples for preview/save. Accepted item-bearing suggestions are NOT
 *  appended here — the engine pushes them into roundout.staples at accept time so
 *  they're visible and toggleable in the Recurring group (natural undo). */
export function acceptedStaples(roundout: RoundoutUI | null): SessionStapleItem[] {
  if (!roundout) return [];
  return roundout.staples.filter((s) => s.accepted).map(stapleToSession);
}

/** All carryovers with an unresolved default (contract: save defaults undefined
 *  status to "unresolved"). */
export function savedCarryovers(roundout: RoundoutUI | null): CarryoverItem[] {
  if (!roundout) return [];
  return roundout.carryovers.map((c) => ({ ...c, status: c.status ?? "unresolved" }));
}

// ─── Deterministic auto-pick ─────────────────────────────────────────────────

const AUTOPICK_TARGETS: Record<string, number> = { staple: 2, standard: 2, involved: 1 };

/**
 * Deterministic greedy auto-pick of `n` recipes from the ranked grid:
 * score/rank order, skip recentlyMade, avoid a 3rd meal of the same protein,
 * target ~2 staple / 2 standard / 1 involved, and fall back through relaxed
 * passes (drop the target, then the protein rule, then include recentlyMade)
 * so it always returns min(n, available) ids for a stable input order.
 */
export function autoPick(options: MealOptionCard[], n = 5): string[] {
  const fresh = options.filter((o) => !o.recentlyMade);
  const targets = { ...AUTOPICK_TARGETS };
  const picked: string[] = [];
  const pickedSet = new Set<string>();
  const proteinCount = new Map<string, number>();

  const proteinKey = (o: MealOptionCard) => o.primaryProtein?.toLowerCase().trim() ?? "";
  const wouldBeThirdProtein = (o: MealOptionCard) => {
    const k = proteinKey(o);
    if (!k) return false;
    return (proteinCount.get(k) ?? 0) >= 2;
  };
  const take = (o: MealOptionCard) => {
    picked.push(o.id);
    pickedSet.add(o.id);
    const k = proteinKey(o);
    if (k) proteinCount.set(k, (proteinCount.get(k) ?? 0) + 1);
  };

  // Pass 1: honor complexity targets + the no-3rd-protein rule.
  for (const o of fresh) {
    if (picked.length >= n) break;
    if (pickedSet.has(o.id)) continue;
    const bucket = o.complexity;
    if ((targets[bucket] ?? 0) <= 0) continue;
    if (wouldBeThirdProtein(o)) continue;
    take(o);
    targets[bucket] -= 1;
  }
  // Pass 2: drop the complexity targets, keep the protein rule.
  for (const o of fresh) {
    if (picked.length >= n) break;
    if (pickedSet.has(o.id)) continue;
    if (wouldBeThirdProtein(o)) continue;
    take(o);
  }
  // Pass 3: drop the protein rule (still fresh only).
  for (const o of fresh) {
    if (picked.length >= n) break;
    if (pickedSet.has(o.id)) continue;
    take(o);
  }
  // Pass 4: last resort — pull from recentlyMade in rank order.
  for (const o of options) {
    if (picked.length >= n) break;
    if (pickedSet.has(o.id)) continue;
    take(o);
  }

  return picked.slice(0, n);
}

// ─── Meters ──────────────────────────────────────────────────────────────────

export interface Meters {
  staple: number;
  standard: number;
  involved: number;
  proteins: string[];
  total: number;
}

/** Effort counts + distinct proteins across the selected recipes' metadata. */
export function computeMeters(selectedMeta: Record<string, SelectedMeta>): Meters {
  let staple = 0;
  let standard = 0;
  let involved = 0;
  const proteins = new Set<string>();
  const values = Object.values(selectedMeta);
  for (const m of values) {
    if (m.complexity === "staple") staple += 1;
    else if (m.complexity === "involved") involved += 1;
    else standard += 1;
    const p = m.protein?.toLowerCase().trim();
    if (p) proteins.add(p);
  }
  return { staple, standard, involved, proteins: [...proteins], total: values.length };
}

// ─── Stable input key (roundout prefetch invalidation) ───────────────────────

/** Order-insensitive key over selected recipe ids + accepted side names. A
 *  mismatch between the prefetch-time key and the Continue-time key forces a
 *  foreground roundout refetch. */
export function stableInputKey(selectedRecipeIds: string[], acceptedSideNames: string[]): string {
  const ids = [...selectedRecipeIds].sort();
  const sides = [...acceptedSideNames].sort();
  return `${ids.join(",")}|${sides.join(",")}`;
}

/** Convenience: derive the stable key straight from a draft (accepted sides). */
export function draftInputKey(draft: DraftMealUI[]): string {
  const ids = draft.map((m) => m.recipeId);
  const sides = draft.flatMap((m) => m.sides.filter((s) => s.accepted).map((s) => s.sideName));
  return stableInputKey(ids, sides);
}

// ─── Payload → UI-state mappers ──────────────────────────────────────────────

/** plan_draft payload → DraftMealUI[] (seed accepted from preAccepted, seed
 *  adaptationDecisions from ProposedAdaptation.applied). */
export function mapPlanDraft(payload: PlanDraftPayload): DraftMealUI[] {
  return payload.meals.map((m) => ({
    day: m.day,
    mealType: m.mealType || "dinner",
    recipeId: m.recipeId,
    recipeName: m.recipeName,
    complexity: m.complexity,
    dayReasoning: m.dayReasoning,
    completenessNote: m.completenessNote,
    sides: (m.suggestedSides ?? []).map((s) => ({ ...s, accepted: s.preAccepted })),
    adaptationDecisions: (m.adaptations ?? []).map((a) => ({
      adaptationName: a.adaptationName,
      memberName: a.memberName,
      applied: a.applied,
      swaps: a.swaps,
      skipReason: a.skipReason,
      skipNote: a.skipNote,
    })),
  }));
}

/** week_roundout payload → RoundoutUI (staples default accepted, suggestions
 *  start "open"). `inputKey` is captured at REQUEST time by the caller. */
export function mapWeekRoundout(payload: WeekRoundoutPayload, inputKey: string): RoundoutUI {
  return {
    inputKey,
    staples: (payload.groceryStaples ?? []).map((s) => ({ ...s, accepted: true })),
    carryovers: payload.carryoverItems ?? [],
    suggestions: (payload.suggestions ?? []).map((s) => ({ ...s, state: "open" as const })),
    extras: payload.extras ?? [],
  };
}

/** Turn an `addOptions` entry into a synthetic (AI-suggested) grid card. */
export function synthCardFromAddOption(
  a: NonNullable<MealOptionsPayload["addOptions"]>[number],
  rank: number,
): MealOptionCard {
  return {
    id: a.recipeId,
    name: a.recipeName,
    description: "",
    complexity: a.complexity as MealOption["complexity"],
    tags: [],
    totalTime: 0,
    servings: 0,
    avgRating: null,
    lastCookedAt: null,
    recentlyMade: false,
    timesCooked8Weeks: 0,
    score: 0,
    rank,
    adaptationHints: [],
    swapHints: [],
    aiSuggested: true,
  };
}

/** Apply the reorder + addOptions parts of a meal_options payload to the grid.
 *  (Annotations are merged into WizardState separately by the engine.) */
export function applyMealOptionsPayload(
  grid: MealOptionCard[],
  payload: MealOptionsPayload,
): MealOptionCard[] {
  let next = grid;

  if (payload.reorderedRecipeIds && payload.reorderedRecipeIds.length > 0) {
    const byId = new Map(grid.map((c) => [c.id, c]));
    const inReorder = new Set(payload.reorderedRecipeIds);
    const reordered = payload.reorderedRecipeIds
      .map((id) => byId.get(id))
      .filter((c): c is MealOptionCard => Boolean(c));
    const rest = grid.filter((c) => !inReorder.has(c.id));
    next = [...reordered, ...rest];
  }

  if (payload.addOptions && payload.addOptions.length > 0) {
    const existing = new Set(next.map((c) => c.id));
    const additions = payload.addOptions.filter((a) => !existing.has(a.recipeId));
    const base = next.length;
    next = [...next, ...additions.map((a, i) => synthCardFromAddOption(a, base + i + 1))];
  }

  return next;
}

// ─── Grocery-rail source labelling ───────────────────────────────────────────

const DAY_TAG: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

/** Human label for a single grocery item source (rail "source tag" line). */
export function sourceLabel(source: GroceryItemSource): string {
  switch (source.type) {
    case "recipe":
      return source.recipeName;
    case "extra":
      return source.extraName;
    case "staple":
      return `${source.stapleName} · staple`;
    case "carryover":
      return `${source.recipeName} · carryover`;
    case "side": {
      const day = DAY_TAG[source.day] ? `${DAY_TAG[source.day]} ` : "";
      return `${day}${source.sideName} · side`;
    }
    case "adaptation": {
      const origin = source.originRecipeName ?? source.originSideName;
      return origin
        ? `${origin} · adapted (${source.originalIngredient})`
        : `adapted from ${source.originalIngredient}`;
    }
    case "swap":
      return `${source.swapTo} · swapped from ${source.swapFrom}`;
    case "manual":
      return "added manually";
    default:
      return "";
  }
}

/** Exclusion keys for an item, per phase1 §3 (`recipe:{id}:{name}` /
 *  `extra:{name}:{name}` / `side:{day}-{mealType}:{name}`). Only recipe/extra/side
 *  sources are excludable; staple/carryover/manual sources yield no key. */
export function itemExclusionKeys(item: GroceryListItem): string[] {
  const name = item.name.toLowerCase().trim();
  const keys = new Set<string>();
  for (const s of item.sources ?? []) {
    if (s.type === "recipe") keys.add(`recipe:${s.recipeId}:${name}`);
    else if (s.type === "extra") keys.add(`extra:${s.extraName}:${name}`);
    else if (s.type === "side") keys.add(`side:${s.day}-${s.mealType}:${name}`);
  }
  return [...keys];
}

/** De-duplicated, comma-joined source summary for an item's provenance line. */
export function itemSourceSummary(item: GroceryListItem): string {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const s of item.sources ?? []) {
    const label = sourceLabel(s);
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels.join(", ");
}

// ─── Step-5 review analytics (computed here per contract) ────────────────────

export interface ReviewAnalytics {
  effort: { staple: number; standard: number; involved: number };
  cookTimes: { day: string; minutes: number }[];
  proteins: string[];
  cuisines: string[];
  total: number;
}

/**
 * Client-side analytics for the final-review step, computed from the scheduled
 * draft + persisted selectedMeta (phase2plus contract). Denominators are the
 * selected-meal count, not a fixed 7.
 */
export function computeReviewAnalytics(
  draft: DraftMealUI[],
  selectedMeta: Record<string, SelectedMeta>,
): ReviewAnalytics {
  let staple = 0;
  let standard = 0;
  let involved = 0;
  const proteins: string[] = [];
  const cuisines: string[] = [];
  const cookTimes: { day: string; minutes: number }[] = [];

  const ordered = [...draft].sort((a, b) => dayIndex(a.day) - dayIndex(b.day));
  for (const m of ordered) {
    if (m.complexity === "staple") staple += 1;
    else if (m.complexity === "involved") involved += 1;
    else standard += 1;

    const meta = selectedMeta[m.recipeId];
    cookTimes.push({ day: m.day, minutes: meta?.totalTime ?? 0 });
    const p = meta?.protein?.toLowerCase().trim();
    if (p) proteins.push(p);
    const c = meta?.cuisine?.toLowerCase().trim();
    if (c) cuisines.push(c);
  }

  return {
    effort: { staple, standard, involved },
    cookTimes,
    proteins,
    cuisines,
    total: ordered.length,
  };
}
