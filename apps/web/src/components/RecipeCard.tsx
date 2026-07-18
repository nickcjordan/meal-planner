"use client";

import { useState } from "react";
import type { Recipe } from "@meal-planner/types";
import { Clock, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { RecipePlaceholder } from "./RecipePlaceholder";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(recipe.imageUrl) && !imgError;

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group block overflow-hidden rounded-xl border border-card-border bg-card shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
    >
      <div className="h-40 w-full overflow-hidden">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/recipes/${recipe.id}/image`}
            alt={recipe.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <RecipePlaceholder
            recipe={recipe}
            className="h-full w-full transition-transform group-hover:scale-105"
          />
        )}
      </div>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-accent">
          {recipe.name}
        </h3>
        {recipe.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {recipe.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatMinutes(recipe.prepTime + recipe.cookTime)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {recipe.servings}
          </span>
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} color="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
