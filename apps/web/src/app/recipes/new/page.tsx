import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RecipeForm } from "@/components/RecipeForm";

export default function NewRecipePage() {
  return (
    <div>
      <Link
        href="/recipes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to recipes
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Add New Recipe</h1>
      <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
        <RecipeForm />
      </div>
    </div>
  );
}
