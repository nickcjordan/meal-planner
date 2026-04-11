import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecipe } from "@meal-planner/db";
import { Clock, Users, ExternalLink, Pencil, ArrowLeft } from "lucide-react";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);

  if (!recipe) {
    notFound();
  }

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

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Ingredients</h2>
            <ul className="mt-4 space-y-2.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {ing.quantity} {ing.unit}
                  </span>
                  <span className="text-muted">{ing.name}</span>
                </li>
              ))}
            </ul>
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
