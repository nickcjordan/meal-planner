"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Users, Store, History, RefreshCw, ArrowLeftRight, Salad } from "lucide-react";

const SETTINGS_NAV = [
  { href: "/settings/kitchen", label: "My Kitchen", icon: Package },
  { href: "/settings/recurring", label: "Recurring", icon: RefreshCw },
  { href: "/settings/sides", label: "Sides", icon: Salad },
  { href: "/settings/swaps", label: "Swaps", icon: ArrowLeftRight },
  { href: "/settings/preferences", label: "Family", icon: Users },
  { href: "/settings/heb", label: "H-E-B", icon: Store },
  { href: "/settings/history", label: "History", icon: History },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Horizontal tab nav — scrolls horizontally on narrow screens so all
          tabs stay reachable, with a right-edge fade hinting at overflow. */}
      <div className="relative mb-6 border-b border-card-border">
        <div className="flex gap-2 overflow-x-auto pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-tag-bg hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-4 w-10 bg-gradient-to-l from-background to-transparent sm:hidden"
          aria-hidden="true"
        />
      </div>

      {children}
    </div>
  );
}
