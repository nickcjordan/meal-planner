"use client";

import { SwapsSection } from "@/components/SwapsSection";
import { PageHeader } from "@/components/ui";

export default function SwapsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Auto Swaps"
        subtitle="Ingredients that should always be replaced with something simpler, cheaper, or easier to find. Applied automatically when planning meals and building grocery lists."
      />

      <div className="mt-6">
        <SwapsSection />
      </div>

      <div className="mt-8 rounded-lg border border-card-border bg-card p-6 text-sm text-muted">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>
            When a recipe calls for a <strong>swapped ingredient</strong>,
            Claude automatically uses the replacement in the meal plan and
            grocery list.
          </li>
          <li>
            Swaps are applied during <strong>recipe import</strong> too — the
            recipe itself is saved with your preferred ingredients.
          </li>
          <li>
            These are different from <strong>dietary adaptations</strong>, which
            are health-driven and per-person. Auto swaps are family-wide
            convenience preferences.
          </li>
          <li>
            You can also manage swaps in the planning chat: &ldquo;Always use
            onion instead of shallots&rdquo;.
          </li>
        </ul>
      </div>
    </div>
  );
}
