export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-card-border/50 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-3"
        >
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <CardSkeleton />
      <ListSkeleton />
    </div>
  );
}
