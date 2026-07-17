"use client";

import { PantrySection } from "@/components/PantrySection";

export default function KitchenPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Kitchen</h1>
        <p className="mt-1 text-sm text-muted">
          Items you always have on hand. These are excluded from shopping lists
          because Claude knows you already have them.
        </p>
      </div>

      <div className="mt-6">
        <PantrySection />
      </div>

      <div className="mt-8 rounded-lg border border-card-border bg-card p-6 text-sm text-muted">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>
            Pantry items are <strong>excluded</strong> from shopping lists —
            Claude knows you already have them
          </li>
          <li>
            Smart matching handles variations — &ldquo;chicken breast&rdquo;
            also matches &ldquo;boneless skinless chicken breast&rdquo;
          </li>
          <li>
            You can also manage items through the planning chat: &ldquo;Add
            olive oil to my pantry&rdquo;
          </li>
        </ul>
      </div>
    </div>
  );
}
