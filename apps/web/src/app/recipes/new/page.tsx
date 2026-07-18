import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RecipeForm } from "@/components/RecipeForm";
import { PageHeader } from "@/components/ui";

export default function NewRecipePage() {
  return (
    <div>
      <Link
        href="/recipes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to recipes
      </Link>
      <PageHeader title="Add New Recipe" className="mb-6" />
      <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
        <RecipeForm />
      </div>
    </div>
  );
}
