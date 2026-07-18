import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecipe, listDietaryAdaptations, listFamilyMembers, listActiveIngredientSwaps } from "@meal-planner/db";
import { namesMatchExact } from "@meal-planner/import";
import { Clock, Users, ExternalLink, Pencil, ArrowLeft, FlaskConical, ArrowRightLeft, ChefHat } from "lucide-react";
import { RecipeIngredientsSection } from "@/components/RecipeIngredientsSection";
import { RecipeStepsToggle } from "@/components/RecipeStepsToggle";
import { formatMinutes } from "@/lib/format";
import { DeleteRecipeButton } from "@/components/DeleteRecipeButton";
import { RecipeImageUpload } from "@/components/RecipeImageUpload";
import { RecipeEnhanceButton } from "@/components/RecipeEnhanceButton";
import { RecipeFixButton } from "@/components/RecipeFixButton";
import type { DietaryAdaptation, FamilyMember, IngredientSection, IngredientSwap } from "@meal-planner/types";

function findMatchingSwaps(
  ingredientSections: IngredientSection[],
  adaptation: DietaryAdaptation,
  member: FamilyMember | undefined,
) {
  const allIngredients = ingredientSections.flatMap((s) => s.items);
  const matches: { ingredient: string; rule: { from: string; to: string; quality: "exact" | "approximate"; condition?: string } }[] = [];
  for (const ing of allIngredients) {
    for (const rule of adaptation.rules) {
      // These are presented as swaps that apply to the recipe, so require an
      // exact token-set match rather than loose substring containment.
      if (namesMatchExact(ing.name, rule.from)) {
        matches.push({ ingredient: ing.name, rule });
      }
    }
  }
  if (matches.length === 0) return null;
  const exact = matches.filter((m) => m.rule.quality === "exact").length;
  const approximate = matches.filter((m) => m.rule.quality === "approximate").length;
  return { memberName: member?.name ?? "Unknown", adaptationName: adaptation.name, matches, exact, approximate };
}

function findIngredientSwapMatches(
  ingredientSections: IngredientSection[],
  swaps: IngredientSwap[],
) {
  const matches: { ingredient: string; swapTo: string; reason?: string }[] = [];
  for (const section of ingredientSections) {
    for (const item of section.items) {
      for (const swap of swaps) {
        // This claims the ingredient "will be replaced on the grocery list", so
        // it must mirror the destructive import-time rename: exact token-set
        // match only (via the shared matcher used by applySwaps).
        if (namesMatchExact(item.name, swap.from)) {
          matches.push({ ingredient: item.name, swapTo: swap.to, reason: swap.reason });
          break;
        }
      }
    }
  }
  return matches;
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, adaptations, members, activeSwaps] = await Promise.all([
    getRecipe(id),
    listDietaryAdaptations(),
    listFamilyMembers(),
    listActiveIngredientSwaps(),
  ]);

  if (!recipe) {
    notFound();
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const adaptationNotes = adaptations
    .filter((a) => a.isActive)
    .map((a) => findMatchingSwaps(recipe.ingredientSections, a, memberMap.get(a.memberId)))
    .filter(Boolean);

  const swapMatches = findIngredientSwapMatches(recipe.ingredientSections, activeSwaps);

  return (
    <div>
      <Link
        href="/recipes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to recipes
      </Link>

      <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
        <RecipeImageUpload recipeId={recipe.id} imageUrl={recipe.imageUrl} />

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{recipe.name}</h1>
            <p className="mt-2 text-muted leading-relaxed">{recipe.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/cook/${recipe.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              <ChefHat className="h-3.5 w-3.5" /> Cook
            </Link>
            <RecipeFixButton recipeId={recipe.id} />
            <RecipeEnhanceButton recipeId={recipe.id} />
            <Link
              href={`/recipes/${recipe.id}/edit`}
              className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
            <DeleteRecipeButton recipeId={recipe.id} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Prep: {formatMinutes(recipe.prepTime)} | Cook: {formatMinutes(recipe.cookTime)}
            {recipe.inactiveTime ? ` | Rest: ${formatMinutes(recipe.inactiveTime)}` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {recipe.yieldDescription || `${recipe.servings} servings`}
          </span>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-accent hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Source
            </a>
          )}
        </div>

        {recipe.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-tag-bg px-3 py-1 text-xs font-medium text-tag-text"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Adaptation compatibility notes — only show actionable items */}
        {adaptationNotes.length > 0 && (
          <div className="mt-6 space-y-2">
            {adaptationNotes.map((note) => (
              <div
                key={note!.adaptationName}
                className="flex items-start gap-2.5 rounded-lg border border-success/20 bg-success/5 px-4 py-2.5 text-sm"
              >
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div>
                  <span className="font-medium text-foreground">{note!.memberName}:</span>{" "}
                  <span className="text-muted">
                    {note!.matches.length} ingredient{note!.matches.length !== 1 ? "s" : ""} with swaps available
                    {note!.exact > 0 && <span className="text-success"> ({note!.exact} exact)</span>}
                    {note!.approximate > 0 && <span className="text-warning"> ({note!.approximate} approximate)</span>}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {note!.matches.map((m) => (
                      <span
                        key={m.ingredient}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.rule.quality === "exact"
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                        title={m.rule.quality === "approximate" && m.rule.condition ? m.rule.condition : undefined}
                      >
                        {m.ingredient} → {m.rule.to}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auto swap matches */}
        {swapMatches.length > 0 && (
          <div className="mt-6">
            <div className="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info/5 px-4 py-2.5 text-sm">
              <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div>
                <span className="font-medium text-foreground">Auto swaps:</span>{" "}
                <span className="text-muted">
                  {swapMatches.length} ingredient{swapMatches.length !== 1 ? "s" : ""} will be replaced on the grocery list
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {swapMatches.map((m) => (
                    <span
                      key={m.ingredient}
                      className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info"
                      title={m.reason ?? undefined}
                    >
                      {m.ingredient} → {m.swapTo}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {recipe.notes && recipe.notes.length > 0 && (
          <div className="mt-6 space-y-1.5">
            {recipe.notes.map((note, i) => (
              <p key={i} className="text-sm text-muted italic">
                {note}
              </p>
            ))}
          </div>
        )}

        {/* Equipment */}
        {recipe.equipment && recipe.equipment.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Equipment:</span>
            {recipe.equipment.map((item) => (
              <span
                key={item}
                className="rounded-full bg-tag-bg px-3 py-1 text-xs font-medium text-tag-text"
              >
                {item}
              </span>
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <RecipeIngredientsSection
            ingredientSections={recipe.ingredientSections}
            baseServings={recipe.servings}
          />

          <div>
            <RecipeStepsToggle
              stepSections={recipe.stepSections}
              enrichedStepSections={recipe.enrichedStepSections}
              ingredientSections={recipe.ingredientSections}
            />
          </div>
        </div>

        {/* Storage info */}
        {recipe.storage && (recipe.storage.makeAhead || recipe.storage.refrigerate || recipe.storage.freeze) && (
          <div className="mt-8 rounded-lg border border-card-border bg-tag-bg/30 p-4">
            <h3 className="text-sm font-semibold text-foreground">Storage</h3>
            <div className="mt-2 space-y-1 text-sm text-muted">
              {recipe.storage.makeAhead && <p><span className="font-medium text-foreground">Make ahead:</span> {recipe.storage.makeAhead}</p>}
              {recipe.storage.refrigerate && <p><span className="font-medium text-foreground">Refrigerate:</span> {recipe.storage.refrigerate}</p>}
              {recipe.storage.freeze && <p><span className="font-medium text-foreground">Freeze:</span> {recipe.storage.freeze}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
