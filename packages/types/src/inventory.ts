export type InventoryStatus = "in-stock" | "low" | "out";

export interface InventoryItem {
  name: string;
  status: InventoryStatus;
  /** Freeform quantity description, e.g. "half a bag" */
  quantity?: string;
  notes?: string;
  lastUpdated: string;
}

export type SetInventoryInput = Omit<InventoryItem, "lastUpdated">;
