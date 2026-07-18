import { forwardRef } from "react";
import clsx from "clsx";

export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

/** Standard surface: rounded-xl border + card background + subtle shadow. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "md", className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={clsx(
        "rounded-xl border border-card-border bg-card shadow-sm",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
