"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Settings, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/plan", label: "Plan" },
  { href: "/week", label: "This Week" },
  { href: "/grocery", label: "Grocery" },
];

const SETTINGS_LINKS = [
  { href: "/settings/kitchen", label: "My Kitchen" },
  { href: "/settings/preferences", label: "Family" },
  { href: "/settings/heb", label: "H-E-B" },
];

const SETTINGS_SECONDARY = [
  { href: "/history", label: "History" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function isSettingsActive(pathname: string) {
  return (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/history")
  );
}

export function NavBar() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close menus when pathname changes (React-endorsed derived state pattern)
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    if (settingsOpen) setSettingsOpen(false);
    if (mobileOpen) setMobileOpen(false);
  }

  // Close dropdown on click outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);

  // Close menus on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
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
          {/* Settings dropdown — desktop */}
          <div ref={dropdownRef} className="relative hidden md:block">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`rounded-lg p-2 transition-colors ${
                isSettingsActive(pathname)
                  ? "bg-tag-bg text-foreground"
                  : "text-muted hover:bg-tag-bg hover:text-foreground"
              }`}
              aria-label="Settings"
              aria-expanded={settingsOpen}
            >
              <Settings className="h-5 w-5" />
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-card-border bg-card py-1 shadow-lg">
                {SETTINGS_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive(pathname, link.href)
                        ? "bg-tag-bg text-foreground"
                        : "text-muted hover:bg-tag-bg hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="mx-4 my-1 border-t border-card-border" />
                {SETTINGS_SECONDARY.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive(pathname, link.href)
                        ? "bg-tag-bg text-foreground"
                        : "text-muted hover:bg-tag-bg hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

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
            {SETTINGS_SECONDARY.map((link) => (
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
