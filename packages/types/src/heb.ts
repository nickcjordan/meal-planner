export interface HebStoreConfig {
  storeId: string;
  storeName: string;
  address: string;
  /** Store ZIP, used to region the weekly ad. Absent for the hardcoded default. */
  postalCode?: string;
}

export interface HebCookieRecord {
  cookies: string;
  capturedAt: string;
  storeId: string;
}

export interface HebEnrichmentResult {
  enrichedCount: number;
  failedCount: number;
  totalCount: number;
  failures: Array<{ itemName: string; reason: string }>;
  sessionExpired: boolean;
}
