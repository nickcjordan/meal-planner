"use client";

import { StaplesSection } from "@/components/StaplesSection";
import { PageHeader } from "@/components/ui";

export default function RecurringPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Recurring"
        subtitle="Items your family needs on a regular schedule. These are automatically suggested for your shopping list based on their frequency."
      />

      <div className="mt-6">
        <StaplesSection />
      </div>
    </div>
  );
}
