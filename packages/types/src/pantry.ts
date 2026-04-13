export interface PantryItem {
  id: string;
  name: string;
  normalizedName: string;
  category: string;
  aliases?: string[];
  notes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreatePantryItemInput = Omit<
  PantryItem,
  "id" | "isDefault" | "normalizedName" | "createdAt" | "updatedAt"
> & {
  isDefault?: boolean;
};

export type UpdatePantryItemInput = Partial<
  Omit<PantryItem, "id" | "normalizedName" | "createdAt" | "updatedAt">
>;
