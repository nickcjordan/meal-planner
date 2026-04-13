"use client";

import Image from "next/image";
import { Search } from "lucide-react";

interface MealDbCardProps {
  result: {
    id: string;
    name: string;
    thumbnail: string;
    category?: string;
    area?: string;
    tags?: string[];
  };
  onClick: () => void;
  disabled?: boolean;
  /** Context the user already knows from browsing — omitted from the card */
  browseContext?: { type: "category" | "area"; value: string };
}

export function MealDbCard({
  result,
  onClick,
  disabled,
  browseContext,
}: MealDbCardProps) {
  const showCategory =
    result.category && browseContext?.type !== "category";
  const showArea = result.area && browseContext?.type !== "area";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col overflow-hidden rounded-xl border border-card-border bg-card text-left transition-all duration-200 hover:shadow-lg hover:border-accent/30 hover:-translate-y-0.5 disabled:opacity-50"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-tag-bg">
        {result.thumbnail ? (
          <Image
            src={result.thumbnail}
            alt={result.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-accent transition-colors line-clamp-2">
          {result.name}
        </h3>

        {(showCategory || showArea) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {showCategory && (
              <span className="rounded-full bg-tag-bg px-2 py-0.5 text-xs font-medium text-tag-text">
                {result.category}
              </span>
            )}
            {showArea && (
              <span className="rounded-full bg-tag-bg px-2 py-0.5 text-xs font-medium text-tag-text">
                {result.area}
              </span>
            )}
          </div>
        )}

        {result.tags && result.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
            {result.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-xs text-muted">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export function MealDbCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="aspect-square w-full animate-pulse bg-tag-bg" />
      <div className="space-y-2 p-3 sm:p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-tag-bg" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-tag-bg" />
      </div>
    </div>
  );
}

export function MealDbEmptyState({ query }: { query?: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <Search className="h-10 w-10 text-muted/40" />
      <p className="mt-3 text-sm text-muted">
        {query
          ? `No recipes found for "${query}"`
          : "No recipes found"}
      </p>
      <p className="mt-1 text-xs text-muted/70">
        Try a different search term, or browse by category above
      </p>
    </div>
  );
}
