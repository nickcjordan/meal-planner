import { forwardRef } from "react";
import clsx from "clsx";
import { fieldClassName } from "./Input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={clsx(fieldClassName, "resize-y", className)} {...props} />;
});
