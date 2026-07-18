"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional header title; when set, renders standard header chrome. */
  title?: string;
  size?: ModalSize;
  /** Show the header × close button (default true). */
  showClose?: boolean;
  /** Close when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Focus this element on open instead of the first focusable child. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Accessible label when no visible `title` is provided. */
  ariaLabel?: string;
  /** Extra classes for the panel. */
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Accessible modal primitive: backdrop, Escape-to-close, focus trap, scroll
 * lock, focus restore on close, and standard panel chrome. Consolidates the
 * app's hand-rolled dialogs.
 */
export function Modal({
  open,
  onClose,
  title,
  size = "md",
  showClose = true,
  closeOnBackdrop = true,
  initialFocus,
  ariaLabel,
  className,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target = initialFocus?.current ?? getFocusable(panel)[0] ?? panel;
    target?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active) ?? false;
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, initialFocus]);

  if (!open) return null;

  const hasHeader = Boolean(title) || showClose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? ariaLabel}
        tabIndex={-1}
        className={clsx(
          "relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl border border-card-border bg-card shadow-2xl focus:outline-none",
          SIZES[size],
          className,
        )}
      >
        {hasHeader && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            {title ? (
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
            ) : (
              <span aria-hidden="true" />
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 -mt-0.5 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className={clsx("overflow-y-auto px-6 pb-6", hasHeader ? "pt-3" : "pt-6")}>
          {children}
        </div>
      </div>
    </div>
  );
}
