import clsx from "clsx";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned actions slot — typically Buttons or Links. */
  actions?: React.ReactNode;
  className?: string;
}

/** Standard page title (+ optional subtitle) with a right-aligned actions slot. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={clsx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
