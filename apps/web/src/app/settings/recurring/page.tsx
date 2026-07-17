"use client";

import { StaplesSection } from "@/components/StaplesSection";

export default function RecurringPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Recurring</h1>
        <p className="mt-1 text-sm text-muted">
          Items your family needs on a regular schedule. These are automatically
          suggested for your shopping list based on their frequency.
        </p>
      </div>

      <div className="mt-6">
        <StaplesSection />
      </div>
    </div>
  );
}
