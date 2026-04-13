import { z } from "zod";

export const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().min(0),
  unit: z.string().trim(),
  category: z.string().trim().optional(),
});

export const nutritionalInfoSchema = z.object({
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  fiber: z.number().optional(),
  sodium: z.number().optional(),
});

export const createRecipeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().default(""),
  ingredients: z.array(ingredientSchema).min(1),
  steps: z
    .array(z.string().trim())
    .transform((steps) => steps.filter((s) => s.length > 0))
    .pipe(z.array(z.string()).min(1)),
  cookTime: z.number().int().min(0).default(0),
  prepTime: z.number().int().min(0).default(0),
  servings: z.number().int().min(1).default(4),
  tags: z
    .array(z.string().trim().toLowerCase())
    .transform((tags) => [...new Set(tags.filter(Boolean))])
    .default([]),
  categories: z
    .array(z.string().trim().toLowerCase())
    .transform((cats) => [...new Set(cats.filter(Boolean))])
    .default([]),
  complexity: z.enum(["staple", "standard", "involved"]).default("standard"),
  nutritionalInfo: nutritionalInfoSchema.optional(),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
});

export type ValidatedRecipeInput = z.infer<typeof createRecipeInputSchema>;
