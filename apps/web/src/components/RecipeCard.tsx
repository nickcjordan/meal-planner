"use client";

import type { Recipe } from "@meal-planner/types";
import { Clock, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group block overflow-hidden rounded-xl border border-card-border bg-card shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
    >
      {recipe.imageUrl ? (
        <div className="relative h-48 w-full overflow-hidden">
          <Image
            src={recipe.imageUrl}
            alt={recipe.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center bg-tag-bg text-muted text-sm">
          No image
        </div>
      )}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
          {recipe.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted leading-relaxed">
          {recipe.description}
        </p>
        <div className="mt-3 flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {recipe.prepTime + recipe.cookTime}m
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {recipe.servings}
          </span>
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-tag-bg px-2.5 py-0.5 text-xs font-medium text-tag-text"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
