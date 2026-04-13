export type PreferenceType =
  | "restriction" // Allergies, intolerances
  | "dislike" // Ingredients to avoid
  | "like" // Ingredients/flavors to favor
  | "cuisine" // Cuisine affinities
  | "schedule" // Day-specific constraints
  | "diet"; // Temporary diet programs

export interface FamilyPreference {
  type: PreferenceType;
  /** The subject (e.g., "tree-nuts", "cilantro", "tuesday") */
  key: string;
  /** Details (e.g., "daughter allergic", "soccer night - staples only") */
  value: string;
  /** Linked family member ID */
  memberId?: string;
  /** @deprecated Display-only for un-migrated records. Use memberId instead. */
  member?: string;
  /** For time-bound preferences (diets) */
  startDate?: string;
  /** For time-bound preferences (diets) */
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreatePreferenceInput = Omit<FamilyPreference, "createdAt" | "updatedAt">;
