import { Skeleton } from "@/components/ui/Skeleton";

export default function RecipeDetailLoading() {
  // Renders inside the recipes layout PageContainer.
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <div className="mt-6 rounded-xl border border-card-border bg-card p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-3 h-4 w-full max-w-md" />
          </div>
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-9 w-16 rounded-lg" />
            <Skeleton className="h-9 w-16 rounded-lg" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
