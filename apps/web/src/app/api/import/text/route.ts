import { NextResponse } from "next/server";
import { parseRecipeFromText } from "@meal-planner/import";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body as { text?: string };

    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Provide at least 20 characters of recipe text" },
        { status: 400 },
      );
    }

    const result = await parseRecipeFromText(text.trim());

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 422 },
      );
    }

    return NextResponse.json({ recipe: result.recipe });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Text parsing failed",
      },
      { status: 500 },
    );
  }
}
