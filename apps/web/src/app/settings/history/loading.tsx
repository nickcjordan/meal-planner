import { Skeleton } from "@/components/ui/Skeleton";

export default function HistoryLoading() {
  // Renders inside the settings layout (tab bar already present).
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
