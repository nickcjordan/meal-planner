export interface FamilyMember {
  id: string;
  name: string;
  /** Role in the family (e.g., "dad", "mom", "daughter", "son") */
  role?: string;
  /** Freeform notes (e.g., "picky eater", "will eat anything") */
  notes?: string;
  /** Set false when member is temporarily away (e.g., out of town) */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateFamilyMemberInput = Omit<FamilyMember, "id" | "createdAt" | "updatedAt"> & {
  isActive?: boolean;
};
