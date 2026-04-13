"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Link2,
  FileText,
  Camera,
  Search,
  List,
  ShoppingCart,
} from "lucide-react";
import { UrlImportForm } from "@/components/UrlImportForm";
import { BulkImportForm } from "@/components/BulkImportForm";
import { JsonImportForm } from "@/components/JsonImportForm";
import { TextImportForm } from "@/components/TextImportForm";
import { ApiSearchForm } from "@/components/ApiSearchForm";

type ImportMethod = "url" | "bulk" | "photo" | "text" | "api" | "json" | "heb";

interface MethodCard {
  id: ImportMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
}

const methods: MethodCard[] = [
  {
    id: "url",
    label: "Import from URL",
    description: "Paste a recipe link from any recipe website",
    icon: <Link2 className="h-5 w-5" />,
    available: true,
  },
  {
    id: "bulk",
    label: "Bulk URL Import",
    description: "Import multiple recipes from a list of URLs",
    icon: <List className="h-5 w-5" />,
    available: true,
  },
  {
    id: "json",
    label: "JSON Import",
    description: "Paste or upload recipe data as JSON",
    icon: <FileText className="h-5 w-5" />,
    available: true,
  },
  {
    id: "photo",
    label: "Photo / Screenshot",
    description:
      "Extract recipes from photos using Claude Code locally",
    icon: <Camera className="h-5 w-5" />,
    available: false,
  },
  {
    id: "text",
    label: "Paste Text",
    description: "Paste recipe text from an email or message",
    icon: <FileText className="h-5 w-5" />,
    available: true,
  },
  {
    id: "api",
    label: "Search Recipe APIs",
    description: "Browse and import from TheMealDB",
    icon: <Search className="h-5 w-5" />,
    available: true,
  },
  {
    id: "heb",
    label: "HEB Recipes",
    description: "Import recipes from HEB.com",
    icon: <ShoppingCart className="h-5 w-5" />,
    available: false,
  },
];

export default function RecipeImportPage() {
  const [activeMethod, setActiveMethod] = useState<ImportMethod>("url");

  return (
    <div>
      <Link
        href="/recipes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to recipes
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-foreground">
        Import Recipes
      </h1>

      {/* Method selector */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {methods.map((method) => (
          <button
            key={method.id}
            onClick={() => method.available && setActiveMethod(method.id)}
            disabled={!method.available}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              activeMethod === method.id
                ? "border-accent bg-accent/5 shadow-sm"
                : method.available
                  ? "border-card-border bg-card hover:border-accent/30 hover:shadow-sm"
                  : "cursor-not-allowed border-card-border bg-card opacity-50"
            }`}
          >
            <div
              className={`mt-0.5 ${activeMethod === method.id ? "text-accent" : "text-muted"}`}
            >
              {method.icon}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                {method.label}
                {!method.available && (
                  <span className="ml-2 text-xs text-muted font-normal">
                    Coming soon
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {method.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Active import form */}
      <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm">
        {activeMethod === "url" && <UrlImportForm />}
        {activeMethod === "bulk" && <BulkImportForm />}
        {activeMethod === "json" && <JsonImportForm />}
        {activeMethod === "text" && <TextImportForm />}
        {activeMethod === "api" && <ApiSearchForm />}
        {!["url", "bulk", "json", "text", "api"].includes(activeMethod) && (
          <div className="py-12 text-center text-muted">
            This import method is coming soon.
          </div>
        )}
      </div>
    </div>
  );
}
