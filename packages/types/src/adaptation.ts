export type AdaptationLeniency = "always" | "when-easy" | "gentle-reminder";

export interface SubstitutionRule {
  id: string;
  /** Original ingredient to match (e.g., "milk", "heavy cream") */
  from: string;
  /** Replacement ingredient (e.g., "lactose-free milk") */
  to: string;
  /** "exact" = direct 1:1 swap, "approximate" = conditional/context-dependent */
  quality: "exact" | "approximate";
  /** When to apply/not apply approximate swaps (e.g., "in soups but not baking") */
  condition?: string;
}

export interface DietaryAdaptation {
  id: string;
  /** FK to FamilyMember */
  memberId: string;
  /** Display name (e.g., "Lactose Intolerance") */
  name: string;
  description?: string;
  /** How aggressively to apply: always, when-easy, gentle-reminder */
  leniency: AdaptationLeniency;
  /** What to do when NOT adapting (e.g., "Take Lactaid pill") */
  skipNote?: string;
  rules: SubstitutionRule[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateDietaryAdaptationInput = Omit<
  DietaryAdaptation,
  "id" | "createdAt" | "updatedAt"
> & {
  isActive?: boolean;
};
