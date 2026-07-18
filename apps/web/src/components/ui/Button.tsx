"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and disable the button. */
  loading?: boolean;
}

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-card-border text-foreground hover:bg-tag-bg",
  danger: "bg-danger text-white hover:bg-danger/90",
  ghost: "text-muted hover:bg-tag-bg hover:text-foreground",
  icon: "text-muted hover:bg-tag-bg hover:text-foreground",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "gap-1.5 px-3 py-1.5 text-xs",
  md: "gap-2 px-4 py-2 text-sm",
  lg: "gap-2 px-5 py-2.5 text-sm",
};

// Square padding for the icon-only variant.
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "p-1.5",
  md: "p-2",
  lg: "p-2.5",
};

const SPINNER_SIZES: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-4 w-4",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, ...props },
  ref,
) {
  const isIcon = variant === "icon";
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(BASE, VARIANTS[variant], isIcon ? ICON_SIZES[size] : SIZES[size], className)}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className={clsx("animate-spin", SPINNER_SIZES[size])} />
          {!isIcon && children}
        </>
      ) : (
        children
      )}
    </button>
  );
});
