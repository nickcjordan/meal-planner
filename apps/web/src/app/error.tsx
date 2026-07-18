"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-danger/10 p-3">
        <AlertTriangle className="h-7 w-7 text-danger" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        An unexpected error occurred. You can try again, or head back home.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted/70">Error ID: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center gap-2">
        <Button variant="primary" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-tag-bg"
        >
          <Home className="h-4 w-4" /> Go home
        </Link>
      </div>
    </div>
  );
}
