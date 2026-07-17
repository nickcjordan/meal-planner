import type { WeeklyAdData, WeeklyAdItem, WeeklyAdFlyer } from "@meal-planner/types";

const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";
const HEB_MERCHANT_ID = 2467;
const DEFAULT_POSTAL = "78704";

// Not used for filtering anymore — we filter by merchant name instead

interface FlippFlyer {
  id: number;
  name: string;
  merchant: string;
  merchant_id: number;
  categories_csv?: string;
  valid_from: string;
  valid_to: string;
}

interface FlippItem {
  id: number;
  flyer_id: number;
  name?: string;
  brand?: string;
  description?: string;
  price?: string;
  discount?: number;
  cutout_image_url?: string;
  valid_from?: string;
  valid_to?: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a flyer `valid_from`. Date-only strings (`YYYY-MM-DD`) are treated as
 * the start of that day in *local* time rather than UTC midnight.
 */
export function parseValidFrom(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(value + "T00:00:00") : new Date(value);
}

/**
 * Parse a flyer `valid_to`. Date-only strings are treated as the *end* of that
 * day in local time, so an ad valid "through 2026-07-21" stays valid all day on
 * the 21st instead of expiring the evening before in negative-UTC-offset zones.
 */
export function parseValidTo(value: string): Date {
  return DATE_ONLY.test(value)
    ? new Date(value + "T23:59:59.999")
    : new Date(value);
}

async function fetchFlyers(postalCode: string): Promise<FlippFlyer[]> {
  const url = `${FLIPP_BASE}/flyers?locale=en-us&postal_code=${postalCode}&merchant_id=${HEB_MERCHANT_ID}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as { flyers: FlippFlyer[] };
  if (!data.flyers) return [];

  // Filter to currently valid H-E-B flyers only
  // Flipp's merchant_id filter is unreliable — other retailers leak through
  const now = new Date();
  return data.flyers.filter((f) => {
    const from = parseValidFrom(f.valid_from);
    const to = parseValidTo(f.valid_to);
    if (from > now || to < now) return false;
    return f.merchant.toLowerCase().includes("h-e-b") || f.merchant.toLowerCase() === "heb";
  });
}

async function fetchFlyerItems(
  flyerId: number,
  postalCode: string,
): Promise<FlippItem[]> {
  const url = `${FLIPP_BASE}/flyers/${flyerId}?locale=en-us&postal_code=${postalCode}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as { items?: FlippItem[] };
  return data.items ?? [];
}

function toWeeklyAdItem(item: FlippItem): WeeklyAdItem | null {
  if (!item.name) return null;

  return {
    id: item.id,
    name: item.name,
    brand: item.brand || undefined,
    description: item.description || undefined,
    price: item.price || undefined,
    discount: item.discount || undefined,
    imageUrl: item.cutout_image_url || undefined,
    validFrom: item.valid_from ?? "",
    validTo: item.valid_to ?? "",
  };
}

function toFlyerSummary(f: FlippFlyer): WeeklyAdFlyer {
  return {
    id: f.id,
    name: f.name,
    categories: f.categories_csv ?? "",
    validFrom: f.valid_from,
    validTo: f.valid_to,
  };
}

/**
 * Fetch a specific HEB flyer (or the default "Weekly Ad") from Flipp.
 * Returns items + a list of all available flyers for switching.
 */
export async function getWeeklyAd(
  postalCode = DEFAULT_POSTAL,
  flyerId?: number,
): Promise<WeeklyAdData | null> {
  const flyers = await fetchFlyers(postalCode);
  if (flyers.length === 0) return null;

  // Pick the requested flyer, or default to "Weekly Ad" with Groceries category
  let target: FlippFlyer | undefined;
  if (flyerId) {
    target = flyers.find((f) => f.id === flyerId);
  }
  if (!target) {
    target = flyers.find(
      (f) => f.name === "Weekly Ad" && f.categories_csv?.includes("Groceries"),
    );
  }
  if (!target) {
    target = flyers[0];
  }

  const rawItems = await fetchFlyerItems(target.id, postalCode);
  const items = rawItems
    .map(toWeeklyAdItem)
    .filter((item): item is WeeklyAdItem => item !== null);

  return {
    flyerId: target.id,
    flyerName: target.name,
    merchantName: target.merchant,
    validFrom: target.valid_from,
    validTo: target.valid_to,
    items,
    availableFlyers: flyers.map(toFlyerSummary),
  };
}
