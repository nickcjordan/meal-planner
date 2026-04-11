import { NextResponse } from "next/server";
import { getRecipe, updateRecipe, deleteRecipe } from "@meal-planner/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  return NextResponse.json(recipe);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const recipe = await updateRecipe(id, body);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  return NextResponse.json(recipe);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteRecipe(id);
  if (!deleted) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
