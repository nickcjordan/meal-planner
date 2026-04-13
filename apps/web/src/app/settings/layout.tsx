"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Users, Store } from "lucide-react";

const SETTINGS_NAV = [
  { href: "/settings/kitchen", label: "My Kitchen", icon: Package },
  { href: "/settings/preferences", label: "Family", icon: Users },
  { href: "/settings/heb", label: "H-E-B", icon: Store },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Horizontal tab nav for settings */}
      <div className="mb-6 flex gap-2 border-b border-card-border pb-4">
        {SETTINGS_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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

      {children}
    </div>
  );
}
