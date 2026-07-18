import type { HebProductMatch } from "@meal-planner/types";
import { Tag } from "lucide-react";
import { decodeHtmlEntities } from "@/lib/format";

/**
 * Compact inline H-E-B product detail: name, size, price, sale/stock chips.
 * Names are HTML-decoded here as a safety net for data persisted before the
 * source-side decode in `packages/heb` landed.
 */
export function HebProductInfo({ heb }: { heb: HebProductMatch }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-muted">
        {decodeHtmlEntities(heb.name)}
        {heb.size && <span className="ml-1 text-muted/70">({heb.size})</span>}
      </span>
      {heb.price && (
        <span className="font-medium text-foreground">{heb.price.formatted}</span>
      )}
      {heb.isOnSale && (
        <span className="flex items-center gap-0.5 rounded bg-danger/10 px-1.5 py-0.5 text-danger">
          <Tag className="h-3 w-3" />
          Sale
        </span>
      )}
      {heb.inStock === false && (
        <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning">
          Out of stock
        </span>
      )}
    </div>
  );
}
