"use client";

import { useState } from "react";
import { Package, ShoppingCart } from "lucide-react";
import { PantrySection } from "@/components/PantrySection";
import { StaplesSection } from "@/components/StaplesSection";

type Tab = "pantry" | "staples";

const TABS: { id: Tab; label: string; icon: typeof Package; description: string }[] = [
  {
    id: "pantry",
    label: "Always on Hand",
    icon: Package,
    description: "Excluded from shopping lists",
  },
  {
    id: "staples",
    label: "Auto-Buy",
    icon: ShoppingCart,
    description: "Auto-included on shopping lists",
  },
];

export default function KitchenPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pantry");

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Kitchen</h1>
        <p className="mt-1 text-sm text-muted">
          Manage what you always have on hand and what you buy regularly.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                isActive
                  ? "border-accent bg-accent/5 text-foreground"
                  : "border-card-border bg-card text-muted hover:border-accent/30 hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-accent" : ""}`} />
              <div>
                <p className="text-sm font-semibold">{tab.label}</p>
                <p className="text-xs text-muted">{tab.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "pantry" ? <PantrySection /> : <StaplesSection />}
      </div>

      {/* Info footer */}
      <div className="mt-8 rounded-lg border border-card-border bg-card p-6 text-sm text-muted">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>
            <strong>Always on Hand</strong> items (pantry) are{" "}
            <strong>excluded</strong> from shopping lists — Claude knows you
            already have them
          </li>
          <li>
            <strong>Auto-Buy</strong> items (staples) are{" "}
            <strong>included</strong> on shopping lists based on their frequency
          </li>
          <li>
            Smart matching handles variations — &ldquo;chicken breast&rdquo;
            also matches &ldquo;boneless skinless chicken breast&rdquo;
          </li>
          <li>
            You can also manage items through the planning chat: &ldquo;Add
            olive oil to my pantry&rdquo; or &ldquo;Add oat milk as a weekly
            staple&rdquo;
          </li>
        </ul>
      </div>
    </div>
  );
}
