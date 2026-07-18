import { forwardRef } from "react";
import clsx from "clsx";

/**
 * Shared field styling for Input / Textarea / Select. Focus ring is baked in.
 * Uses the `--input-bg` / `--placeholder` tokens (see globals.css).
 */
export const fieldClassName =
  "w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-placeholder transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={clsx(fieldClassName, className)} {...props} />;
});
