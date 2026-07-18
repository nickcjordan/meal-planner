import Link from "next/link";
import {
  Package,
  RefreshCw,
  Salad,
  ArrowLeftRight,
  Users,
  Store,
  History,
  type LucideIcon,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

interface SettingsSection {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SECTIONS: SettingsSection[] = [
  { href: "/settings/kitchen", label: "My Kitchen", description: "Pantry staples excluded from your shopping lists.", icon: Package },
  { href: "/settings/recurring", label: "Recurring", description: "Items your family buys on a regular schedule.", icon: RefreshCw },
  { href: "/settings/sides", label: "Sides", description: "Curated sides Claude pairs with your meals.", icon: Salad },
  { href: "/settings/swaps", label: "Swaps", description: "Ingredients auto-replaced family-wide when planning.", icon: ArrowLeftRight },
  { href: "/settings/preferences", label: "Family", description: "Members, dietary adaptations, and preferences.", icon: Users },
  { href: "/settings/heb", label: "H-E-B", description: "Your store, real prices, and weekly deals.", icon: Store },
  { href: "/settings/history", label: "History", description: "Past plans and shopping sessions.", icon: History },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Everything Claude uses to plan for your family. Pick a section to manage it."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="block">
              <Card className="h-full transition-colors hover:border-accent">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-accent/10 p-2 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
                    <p className="mt-1 text-xs text-muted">{section.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
