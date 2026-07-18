import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA — typically a Button or Link. */
  action?: React.ReactNode;
  className?: string;
}

/** Icon + title + description + optional CTA, on a standard card surface. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-card-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <Icon className="mx-auto h-12 w-12 text-muted/30" />}
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
