import Link from "next/link";
import { BookOpen, Calendar, History, UtensilsCrossed } from "lucide-react";
import { PageContainer } from "@/components/PageContainer";

export default function Home() {
  return (
    <PageContainer><div className="py-8">
      <h1 className="text-3xl font-bold text-foreground">Welcome to Meal Planner</h1>
      <p className="mt-2 text-muted">
        Plan your family meals for the week with AI-powered suggestions.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/recipes"
          className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
        >
          <BookOpen className="mt-0.5 h-8 w-8 shrink-0 text-accent" />
          <div>
            <h2 className="font-semibold text-foreground">Recipes</h2>
            <p className="mt-1 text-sm text-muted">
              Browse your recipe library, add new recipes, and manage your collection.
            </p>
          </div>
        </Link>

        <Link
          href="/plan"
          className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
        >
          <Calendar className="mt-0.5 h-8 w-8 shrink-0 text-green-500" />
          <div>
            <h2 className="font-semibold text-foreground">Plan a Week</h2>
            <p className="mt-1 text-sm text-muted">
              Start an AI-powered planning session for next week&apos;s meals.
            </p>
          </div>
        </Link>

        <Link
          href="/history"
          className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
        >
          <History className="mt-0.5 h-8 w-8 shrink-0 text-purple-500" />
          <div>
            <h2 className="font-semibold text-foreground">History</h2>
            <p className="mt-1 text-sm text-muted">
              Browse past meal plans, feedback, and shopping lists.
            </p>
          </div>
        </Link>

        <Link
          href="/pantry"
          className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:border-accent/30"
        >
          <UtensilsCrossed className="mt-0.5 h-8 w-8 shrink-0 text-amber-500" />
          <div>
            <h2 className="font-semibold text-foreground">Pantry</h2>
            <p className="mt-1 text-sm text-muted">
              Manage staple items excluded from shopping lists.
            </p>
          </div>
        </Link>
      </div>
    </div></PageContainer>
  );
}
