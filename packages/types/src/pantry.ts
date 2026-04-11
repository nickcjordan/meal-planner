export interface PantryItem {
  name: string;
  category: string;
  isDefault: boolean;
}

export type CreatePantryItemInput = Omit<PantryItem, "isDefault"> & {
  isDefault?: boolean;
};
