import { notFound } from "next/navigation";
import { getRecipe } from "@meal-planner/db";
import { CookingView } from "@/components/CookingView";

export default async function CookPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const recipe = await getRecipe(recipeId);

  if (!recipe) {
    notFound();
  }

  return <CookingView recipe={recipe} />;
}
