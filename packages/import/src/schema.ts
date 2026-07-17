import { z } from "zod";

export const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().min(0),
  unit: z.string().trim(),
  category: z.string().trim().optional(),
  prep: z.string().trim().optional(),
});

export const ingredientSectionSchema = z.object({
  header: z.string().trim().optional(),
  items: z.array(ingredientSchema).min(1),
});

export const stepSectionSchema = z.object({
  header: z.string().trim().optional(),
  steps: z
    .array(z.string().trim())
    .transform((steps) => steps.filter((s) => s.length > 0))
    .pipe(z.array(z.string()).min(1)),
});

export const stepIngredientRefSchema = z.object({
  name: z.string().trim().min(1),
  quantityOverride: z.number().min(0).optional(),
  unit: z.string().trim().optional(),
  prep: z.string().trim().optional(),
});

export const enrichedStepSchema = z.object({
  text: z.string().trim().min(1),
  ingredients: z.array(stepIngredientRefSchema).optional(),
});

export const enrichedStepSectionSchema = z.object({
  header: z.string().trim().optional(),
  steps: z.array(enrichedStepSchema).min(1),
});

export const nutritionalInfoSchema = z.object({
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  fiber: z.number().optional(),
  sodium: z.number().optional(),
});

export const storageInfoSchema = z.object({
  makeAhead: z.string().trim().optional(),
  refrigerate: z.string().trim().optional(),
  freeze: z.string().trim().optional(),
});

export const createRecipeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().default(""),
  ingredientSections: z.array(ingredientSectionSchema).min(1),
  stepSections: z.array(stepSectionSchema).min(1),
  enrichedStepSections: z.array(enrichedStepSectionSchema).optional(),
  cookTime: z.number().int().min(0).default(0),
  prepTime: z.number().int().min(0).default(0),
  inactiveTime: z.number().int().min(0).optional(),
  servings: z.number().int().min(1).default(4),
  yieldDescription: z.string().trim().optional(),
  tags: z
    .array(z.string().trim().toLowerCase())
    .transform((tags) => [...new Set(tags.filter(Boolean))])
    .default([]),
  categories: z
    .array(z.string().trim().toLowerCase())
    .transform((cats) => [...new Set(cats.filter(Boolean))])
    .default([]),
  complexity: z.enum(["staple", "standard", "involved"]).default("standard"),
  notes: z
    .array(z.string().trim())
    .transform((notes) => notes.filter(Boolean))
    .optional(),
  equipment: z
    .array(z.string().trim())
    .transform((items) => items.filter(Boolean))
    .optional(),
  storage: storageInfoSchema.optional(),
  nutritionalInfo: nutritionalInfoSchema.optional(),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
});

export type ValidatedRecipeInput = z.infer<typeof createRecipeInputSchema>;
