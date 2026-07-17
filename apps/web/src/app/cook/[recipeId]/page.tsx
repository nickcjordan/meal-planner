import { notFound } from "next/navigation";
import { getRecipe } from "@meal-planner/db";
import { CookingView } from "@/components/CookingView";

export default async function CookPage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ sessionId?: string; day?: string; mealType?: string }>;
}) {
  const { recipeId } = await params;
  const { sessionId, day, mealType } = await searchParams;
  const recipe = await getRecipe(recipeId);

  if (!recipe) {
    notFound();
  }

  return (
    <CookingView
      recipe={recipe}
      sessionId={sessionId}
      mealDay={day}
      mealType={mealType}
    />
  );
}
