import { forwardRef } from "react";
import clsx from "clsx";
import { fieldClassName } from "./Input";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={clsx(fieldClassName, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
});
