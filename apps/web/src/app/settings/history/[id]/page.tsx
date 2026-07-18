import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { getSession, getFeedbackForSession, getRecipe, getShoppingList } from "@meal-planner/db";
import type { ShoppingList } from "@meal-planner/types";
import { WeekCalendar } from "@/components/WeekCalendar";
import { StarRating } from "@/components/StarRating";
import { HebProductInfo } from "@/components/HebProductInfo";
import { PageHeader, Card, Badge, Button } from "@/components/ui";
import { DeleteSessionButton } from "@/components/DeleteSessionButton";
import { CATEGORY_ICONS, groupByCategory } from "@/lib/categories";
import { formatWeekOf } from "@/lib/week";

const STATUS_COLOR = {
  draft: "neutral",
  confirmed: "accent",
  completed: "success",
} as const;

function ShoppingSnapshot({ list }: { list: ShoppingList }) {
  const groups = groupByCategory(list.items);
  const totalCount = list.items.length;

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">Items this plan added to the grocery list</h2>
        <Badge color="neutral">{totalCount} item{totalCount !== 1 ? "s" : ""}</Badge>
      </div>
      <p className="mb-4 text-xs text-muted">
        A snapshot of the consolidated ingredients this week&apos;s plan contributed to your
        grocery list, after pantry and exclusion filtering. Read-only.
      </p>

      <div className="space-y-4">
        {Array.from(groups.entries()).map(([category, catItems]) => (
          <Card key={category} padding="none" className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-card-border bg-tag-bg/30 px-5 py-3">
              <span className="text-base">{CATEGORY_ICONS[category.toLowerCase()] ?? "🛒"}</span>
              <h3 className="text-sm font-semibold capitalize text-foreground">{category}</h3>
              <span className="text-xs text-muted">{catItems.length}</span>
            </div>
            <div className="divide-y divide-card-border">
              {catItems.map((item, i) => (
                <div
                  key={`${item.name}-${item.unit}-${i}`}
                  className={`flex items-start gap-3 px-5 py-3 ${item.checked ? "opacity-50" : ""}`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      item.checked ? "border-accent bg-accent text-white" : "border-input-border"
                    }`}
                    aria-label={item.checked ? "Checked" : "Unchecked"}
                  >
                    {item.checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`flex items-center gap-2 ${item.checked ? "line-through" : ""}`}>
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                      {item.quantity > 0 && (
                        <span className="text-xs text-muted">
                          {item.quantity} {item.unit}
                        </span>
                      )}
                    </div>
                    {item.heb && <HebProductInfo heb={item.heb} />}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  // Load recipe names
  const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
  const recipes: Record<string, string> = {};
  for (const rid of recipeIds) {
    const recipe = await getRecipe(rid);
    if (recipe) recipes[rid] = recipe.name;
  }

  const feedback = await getFeedbackForSession(id);
  const shoppingList = await getShoppingList(id);

  const weekLabel = formatWeekOf(session.weekOf, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <Link
        href="/settings/history"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to history
      </Link>

      <PageHeader
        title={`Week of ${weekLabel}`}
        subtitle={`${session.meals.length} meal${session.meals.length !== 1 ? "s" : ""}`}
        className="mb-6"
        actions={
          <>
            <Badge color={STATUS_COLOR[session.status as keyof typeof STATUS_COLOR] ?? "neutral"}>
              {session.status}
            </Badge>
            {session.status === "confirmed" && (
              <Link href={`/review/${session.id}`}>
                <Button size="sm">Review Meals</Button>
              </Link>
            )}
            <DeleteSessionButton sessionId={session.id} weekLabel={weekLabel} />
          </>
        }
      />

      {session.summary && (
        <p className="mb-6 text-sm leading-relaxed text-muted">{session.summary}</p>
      )}

      <WeekCalendar session={session} recipes={recipes} />

      {feedback.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Feedback</h2>
          <div className="space-y-3">
            {feedback.map((fb) => (
              <Card key={fb.recipeId} padding="sm" className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {recipes[fb.recipeId] ?? fb.recipeId}
                  </span>
                  <span className="ml-2 text-xs text-muted">{fb.wasMade ? "Made" : "Skipped"}</span>
                  {fb.comment && <p className="mt-1 text-sm text-muted">{fb.comment}</p>}
                </div>
                {fb.wasMade && <StarRating value={fb.rating} readonly />}
              </Card>
            ))}
          </div>
        </div>
      )}

      {shoppingList && shoppingList.items.length > 0 && <ShoppingSnapshot list={shoppingList} />}
    </div>
  );
}
