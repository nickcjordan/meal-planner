import type { CreateRecipeInput, Recipe } from "@meal-planner/types";

/** Result of extracting a recipe from any source */
export interface ExtractionResult {
  recipe: CreateRecipeInput;
  /** Original image URL before S3 upload */
  sourceImageUrl?: string;
  /** Where the data came from */
  extractionMethod: "jsonld" | "html_fallback" | "api" | "text" | "json";
}

/** Result of the normalization pipeline */
export type NormalizeResult =
  | { success: true; data: CreateRecipeInput }
  | { success: false; errors: string[] };

/** Dedup check result */
export interface DedupMatch {
  type: "exact_url" | "fuzzy_name";
  existingRecipe: Recipe;
  similarity?: number;
}

/** Result returned from import API routes */
export interface ImportResult {
  recipe: CreateRecipeInput;
  imageUrl?: string;
  sourceUrl?: string;
  duplicates: DedupMatch[];
  extractionMethod: string;
}

/** Bulk scan event types (mirrors HEB enrichment pattern) */
export type BulkScanEvent =
  | { type: "start"; total: number }
  | { type: "item_start"; index: number; total: number; url: string }
  | {
      type: "item_done";
      index: number;
      total: number;
      url: string;
      result: ImportResult;
    }
  | {
      type: "item_skip";
      index: number;
      total: number;
      url: string;
      reason: string;
    }
  | {
      type: "item_error";
      index: number;
      total: number;
      url: string;
      error: string;
    }
  | {
      type: "complete";
      imported: number;
      skipped: number;
      errors: number;
    };
