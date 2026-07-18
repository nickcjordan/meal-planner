import { Skeleton } from "@/components/ui/Skeleton";

export default function ReviewLoading() {
  // Renders inside the review layout PageContainer; content is constrained to match the page.
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-6 h-8 w-72" />
      <Skeleton className="mt-3 h-4 w-32" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
