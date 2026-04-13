import type { HebProductMatch } from "@meal-planner/types";
import { Tag } from "lucide-react";

export function HebProductInfo({ heb }: { heb: HebProductMatch }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-muted">
        {heb.name}
        {heb.size && <span className="ml-1 text-muted/70">({heb.size})</span>}
      </span>
      {heb.price && (
        <span className="font-medium text-foreground">
          {heb.price.formatted}
        </span>
      )}
      {heb.isOnSale && (
        <span className="flex items-center gap-0.5 rounded bg-red-500/10 px-1.5 py-0.5 text-red-500">
          <Tag className="h-3 w-3" />
          Sale
        </span>
      )}
      {heb.inStock === false && (
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-500">
          Out of stock
        </span>
      )}
    </div>
  );
}
