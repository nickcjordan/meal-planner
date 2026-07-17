"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, RefreshCw, Store, Wifi, WifiOff, Newspaper, Search } from "lucide-react";
import type { HebStoreConfig, WeeklyAdData } from "@meal-planner/types";
import { CardSkeleton } from "@/components/Skeleton";

interface HebStatus {
  connected: boolean;
  store?: HebStoreConfig;
  /** True when a real store has been chosen (vs the hardcoded default). */
  storeConfigured?: boolean;
  cookieAge?: number;
  cookieFresh?: boolean;
}

/**
 * Parse a deal price for *sorting*. Only plainly-numeric strings (optionally
 * `$`-prefixed) yield a number; promo strings like "2/$5" return null so they
 * sort to the bottom instead of misparsing.
 */
function parseDealPrice(price: string | undefined): number | null {
  if (!price) return null;
  const cleaned = price.replace(/^\$/, "").trim();
  return /^\d+(\.\d+)?$/.test(cleaned) ? parseFloat(cleaned) : null;
}

/**
 * Render a deal price. Plain numbers get a `$` prefix; anything already
 * containing a `$` or non-numeric (e.g. "2/$5", "BOGO") renders verbatim so we
 * never produce a double "$".
 */
function formatDealPrice(price: string): string {
  return /^\d+(\.\d+)?$/.test(price.trim()) ? `$${price}` : price;
}

export default function HebSettingsPage() {
  const [status, setStatus] = useState<HebStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showStoreSearch, setShowStoreSearch] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<HebStoreConfig[]>([]);
  const [searchingStores, setSearchingStores] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [weeklyAd, setWeeklyAd] = useState<WeeklyAdData | null>(null);
  const [loadingAd, setLoadingAd] = useState(false);
  const [dealFilter, setDealFilter] = useState("");
  const [sortByDeal, setSortByDeal] = useState(true);

  useEffect(() => {
    fetchStatus();
    fetchWeeklyAd();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/heb/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWeeklyAd() {
    setLoadingAd(true);
    try {
      const res = await fetch("/api/heb/weekly-ad");
      if (res.ok) {
        setWeeklyAd(await res.json());
      }
    } catch {
      // silent — deals section just won't show
    } finally {
      setLoadingAd(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/heb/refresh", { method: "POST" });
      if (res.ok) {
        await fetchStatus();
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStoreSearch() {
    if (!storeQuery.trim()) return;
    setSearchingStores(true);
    try {
      const res = await fetch(
        `/api/heb/stores/search?q=${encodeURIComponent(storeQuery)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setStoreResults(data);
      }
    } finally {
      setSearchingStores(false);
    }
  }

  async function handleSelectStore(store: HebStoreConfig) {
    setSavingStore(true);
    try {
      const res = await fetch("/api/heb/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      if (res.ok) {
        setStoreResults([]);
        setStoreQuery("");
        setShowStoreSearch(false);
        await fetchStatus();
      }
    } finally {
      setSavingStore(false);
    }
  }

  const filteredDeals = useMemo(() => {
    if (!weeklyAd) return [];
    let items = weeklyAd.items;

    if (dealFilter.trim()) {
      const q = dealFilter.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.brand?.toLowerCase().includes(q),
      );
    }

    if (sortByDeal) {
      items = [...items].sort((a, b) => {
        // Items with discount % first (highest first)
        if (a.discount && b.discount) return b.discount - a.discount;
        if (a.discount) return -1;
        if (b.discount) return 1;
        // Then items with a parseable price (lowest first); unparsable/missing
        // prices sink to the bottom.
        const pa = parseDealPrice(a.price);
        const pb = parseDealPrice(b.price);
        if (pa !== null && pb !== null) return pa - pb;
        if (pa !== null) return -1;
        if (pb !== null) return 1;
        return 0;
      });
    }

    return items;
  }, [weeklyAd, dealFilter, sortByDeal]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const storeName = status?.store?.storeName ?? "H-E-B";
  const storeId = status?.store?.storeId ?? "790";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">H-E-B Integration</h1>
      <p className="mt-2 text-sm text-muted">
        Connect to HEB for real product prices, availability, and sale alerts on
        your shopping lists.
      </p>

      {/* Connection Status */}
      <div className="mt-8 rounded-lg border border-card-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status?.cookieFresh ? (
              <Wifi className="h-5 w-5 text-success" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted" />
            )}
            <div>
              <p className="font-medium">
                {status?.cookieFresh ? "Connected" : "Not connected"}
              </p>
              {status?.cookieAge !== undefined && (
                <p className="text-xs text-muted">
                  Session age: {Math.round(status.cookieAge / 1000)}s
                  {!status.cookieFresh && " (expired)"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {status?.connected ? "Refresh Session" : "Connect"}
              </>
            )}
          </button>
        </div>
        {refreshing && (
          <p className="mt-3 text-xs text-muted">
            Launching Chrome to establish HEB session... This takes about 15
            seconds.
          </p>
        )}
      </div>

      {/* Store */}
      <div className="mt-6 rounded-lg border border-card-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 text-muted" />
            <div>
              <p className="text-sm font-medium">{storeName}</p>
              {status?.store?.address ? (
                <p className="text-xs text-muted">{status.store.address}</p>
              ) : (
                <p className="text-xs text-muted">Store #{storeId}</p>
              )}
              {status && !status.storeConfigured && (
                <p className="mt-0.5 text-xs text-warning">
                  Using default store — choose yours for accurate prices and deals
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowStoreSearch(!showStoreSearch)}
            className="text-xs text-muted transition-colors hover:text-foreground"
          >
            {showStoreSearch ? "Cancel" : "Change store"}
          </button>
        </div>

        {showStoreSearch && (
          <div className="mt-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search by zip code or city..."
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStoreSearch()}
                className="flex-1 rounded-lg border border-input-border bg-background px-4 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleStoreSearch}
                disabled={searchingStores || !storeQuery.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {searchingStores ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </div>

            {storeResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {storeResults.map((store) => (
                  <button
                    key={store.storeId}
                    onClick={() => handleSelectStore(store)}
                    disabled={savingStore}
                    className="flex w-full items-center justify-between rounded-lg border border-card-border bg-background px-4 py-3 text-left text-sm transition-colors hover:border-accent disabled:opacity-50"
                  >
                    <div>
                      <p className="font-medium">{store.storeName}</p>
                      <p className="text-xs text-muted">{store.address}</p>
                    </div>
                    <span className="text-xs text-muted">#{store.storeId}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* This Week's Deals */}
      <div className="mt-6 rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Newspaper className="h-5 w-5 text-warning" />
            <div>
              <p className="font-medium">
                {weeklyAd?.flyerName ?? "This Week\u2019s Deals"}
              </p>
              {weeklyAd && (
                <p className="text-xs text-muted">
                  Valid {new Date(weeklyAd.validFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" – "}
                  {new Date(weeklyAd.validTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" · "}{weeklyAd.items.length} items
                </p>
              )}
            </div>
          </div>
        </div>


        {loadingAd && (
          <div className="mt-4 flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        )}

        {!loadingAd && !weeklyAd && (
          <p className="mt-4 text-sm text-muted">
            Could not load weekly deals.
          </p>
        )}

        {weeklyAd && weeklyAd.items.length > 0 && (
          <>
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Filter deals..."
                  value={dealFilter}
                  onChange={(e) => setDealFilter(e.target.value)}
                  className="w-full rounded-lg border border-input-border bg-background py-2 pl-9 pr-4 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <button
                onClick={() => setSortByDeal(!sortByDeal)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  sortByDeal
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-input-border text-muted hover:text-foreground"
                }`}
              >
                Best deals first
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredDeals.map((item) => (
                <div
                  key={item.id}
                  className="relative flex gap-4 rounded-lg border border-card-border bg-background p-4"
                >
                  {item.discount && (
                    <span className="absolute right-3 top-3 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                      {item.discount}% off
                    </span>
                  )}
                  {item.imageUrl && (
                    <div className="flex h-32 w-32 shrink-0 items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col justify-center min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {item.name}
                    </p>
                    {item.brand && (
                      <p className="mt-0.5 text-xs text-muted">{item.brand}</p>
                    )}
                    <div className="mt-2">
                      {item.price && (
                        <p className="text-lg font-bold text-success">
                          {formatDealPrice(item.price)}
                        </p>
                      )}
                      {!item.price && item.discount && (
                        <p className="text-sm font-semibold text-danger">
                          {item.discount}% off
                        </p>
                      )}
                      {!item.price && !item.discount && (
                        <p className="text-xs text-muted italic">
                          See store for price
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredDeals.length === 0 && dealFilter && (
              <p className="mt-3 text-center text-sm text-muted">
                No deals matching &ldquo;{dealFilter}&rdquo;
              </p>
            )}
          </>
        )}
      </div>

      {/* Info */}
      <div className="mt-6 rounded-lg border border-card-border bg-card p-6 text-sm text-muted">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Sessions are established by launching a headless Chrome browser that
            visits heb.com
          </li>
          <li>No HEB account or login is required</li>
          <li>Sessions expire after about 10 minutes</li>
          <li>
            Sessions are auto-refreshed when you enrich a shopping list
          </li>
          <li>
            Product prices and availability are specific to your selected store
          </li>
        </ul>
      </div>
    </div>
  );
}
