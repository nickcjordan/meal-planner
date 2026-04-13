export interface HebStoreConfig {
  storeId: string;
  storeName: string;
  address: string;
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
