"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Settings, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/plan", label: "Plan" },
  { href: "/week", label: "This Week" },
  { href: "/grocery", label: "Grocery" },
];

const SETTINGS_LINKS = [
  { href: "/settings/kitchen", label: "My Kitchen" },
  { href: "/settings/recurring", label: "Recurring" },
  { href: "/settings/sides", label: "Sides" },
  { href: "/settings/swaps", label: "Swaps" },
  { href: "/settings/preferences", label: "Family" },
  { href: "/settings/heb", label: "H-E-B" },
  { href: "/settings/history", label: "History" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function isSettingsActive(pathname: string) {
  return pathname.startsWith("/settings");
}

export function NavBar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);

  // Close mobile menu when pathname changes
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  // Close menu on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  if (pathname.startsWith("/cook")) return null;

  const linkClass = (href: string) =>
    `transition-colors ${
      isActive(pathname, href)
        ? "text-foreground"
        : "text-muted hover:text-foreground"
    }`;

  return (
    <nav className="border-b border-card-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-foreground">
            Meal Planner
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-6 text-sm font-medium md:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Settings link — desktop */}
          <Link
            href="/settings"
            className={`hidden rounded-lg p-2 transition-colors md:block ${
              isSettingsActive(pathname)
                ? "bg-tag-bg text-foreground"
                : "text-muted hover:bg-tag-bg hover:text-foreground"
            }`}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-tag-bg hover:text-foreground md:hidden"
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-card-border px-6 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(pathname, link.href)
                    ? "bg-tag-bg text-foreground"
                    : "text-muted hover:bg-tag-bg hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="mx-3 my-1 border-t border-card-border" />
            <Link
              href="/settings"
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === "/settings"
                  ? "bg-tag-bg text-foreground"
                  : "text-muted hover:bg-tag-bg hover:text-foreground"
              }`}
            >
              All Settings
            </Link>
            {SETTINGS_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(pathname, link.href)
                    ? "bg-tag-bg text-foreground"
                    : "text-muted hover:bg-tag-bg hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
