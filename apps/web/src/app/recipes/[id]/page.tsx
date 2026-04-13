import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecipe, listDietaryAdaptations, listFamilyMembers } from "@meal-planner/db";
import { Clock, Users, ExternalLink, Pencil, ArrowLeft, FlaskConical } from "lucide-react";
import { IngredientActions } from "@/components/IngredientActions";
import type { DietaryAdaptation, FamilyMember, Ingredient } from "@meal-planner/types";

function findMatchingSwaps(
  ingredients: Ingredient[],
  adaptation: DietaryAdaptation,
  member: FamilyMember | undefined,
) {
  const matches: { ingredient: string; rule: { from: string; to: string; quality: "exact" | "approximate"; condition?: string } }[] = [];
  for (const ing of ingredients) {
    const ingName = ing.name.toLowerCase();
    for (const rule of adaptation.rules) {
      const ruleName = rule.from.toLowerCase();
      if (ingName.includes(ruleName) || ruleName.includes(ingName)) {
        matches.push({ ingredient: ing.name, rule });
      }
    }
  }
  if (matches.length === 0) return null;
  const exact = matches.filter((m) => m.rule.quality === "exact").length;
  const approximate = matches.filter((m) => m.rule.quality === "approximate").length;
  return { memberName: member?.name ?? "Unknown", adaptationName: adaptation.name, matches, exact, approximate };
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, adaptations, members] = await Promise.all([
    getRecipe(id),
    listDietaryAdaptations(),
    listFamilyMembers(),
  ]);

  if (!recipe) {
    notFound();
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const adaptationNotes = adaptations
    .filter((a) => a.isActive)
    .map((a) => findMatchingSwaps(recipe.ingredients, a, memberMap.get(a.memberId)))
    .filter(Boolean);

  return (
    <div>
      <Link
        href="/recipes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to recipes
      </Link>

      <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{recipe.name}</h1>
            <p className="mt-2 text-muted leading-relaxed">{recipe.description}</p>
          </div>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Prep: {recipe.prepTime}m | Cook: {recipe.cookTime}m
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {recipe.servings} servings
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
                className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm"
              >
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div>
                  <span className="font-medium text-foreground">{note!.memberName}:</span>{" "}
                  <span className="text-muted">
                    {note!.matches.length} ingredient{note!.matches.length !== 1 ? "s" : ""} with swaps available
                    {note!.exact > 0 && <span className="text-green-500"> ({note!.exact} exact)</span>}
                    {note!.approximate > 0 && <span className="text-amber-500"> ({note!.approximate} approximate)</span>}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {note!.matches.map((m) => (
                      <span
                        key={m.ingredient}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.rule.quality === "exact"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-amber-500/10 text-amber-500"
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

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Ingredients</h2>
            <IngredientActions ingredients={recipe.ingredients} />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">Steps</h2>
            <ol className="mt-4 space-y-4">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tag-bg text-xs font-semibold text-tag-text">
                    {i + 1}
                  </span>
                  <span className="text-muted leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
