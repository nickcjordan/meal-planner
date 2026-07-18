import clsx from "clsx";

export type BadgeColor =
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const COLORS: Record<BadgeColor, string> = {
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  neutral: "bg-tag-bg text-tag-text",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
}

/** Rounded-full semantic chip. */
export function Badge({ color = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        COLORS[color],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
