"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, RefreshCw, Store, Wifi, WifiOff, Newspaper, Search, AlertCircle } from "lucide-react";
import type { HebStoreConfig, WeeklyAdData } from "@meal-planner/types";
import { CardSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { Button, Input, Card, Badge, EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { decodeHtmlEntities } from "@/lib/format";

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
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [showStoreSearch, setShowStoreSearch] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<HebStoreConfig[]>([]);
  const [searchingStores, setSearchingStores] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const [savingStore, setSavingStore] = useState(false);
  const [weeklyAd, setWeeklyAd] = useState<WeeklyAdData | null>(null);
  const [loadingAd, setLoadingAd] = useState(false);
  const [dealFilter, setDealFilter] = useState("");
  const [sortByDeal, setSortByDeal] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchStatus();
    fetchWeeklyAd();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const data = await api<HebStatus>("/api/heb/status");
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
      setWeeklyAd(await api<WeeklyAdData>("/api/heb/weekly-ad"));
    } catch {
      // Non-critical — the deals section renders its own "couldn't load" note.
      setWeeklyAd(null);
    } finally {
      setLoadingAd(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await api("/api/heb/refresh", { method: "POST" });
      await fetchStatus();
      toast("H-E-B session refreshed", "success");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to connect to H-E-B";
      setRefreshError(message);
      toast(message, "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStoreSearch() {
    if (!storeQuery.trim()) return;
    setSearchingStores(true);
    setSearched(false);
    try {
      const data = await api<HebStoreConfig[]>(
        `/api/heb/stores/search?q=${encodeURIComponent(storeQuery)}`,
      );
      setStoreResults(Array.isArray(data) ? data : []);
      setLastSearchedQuery(storeQuery.trim());
      setSearched(true);
    } catch (err) {
      setStoreResults([]);
      toast(err instanceof ApiError ? err.message : "Store search failed", "error");
    } finally {
      setSearchingStores(false);
    }
  }

  async function handleSelectStore(store: HebStoreConfig) {
    setSavingStore(true);
    try {
      await api("/api/heb/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      setStoreResults([]);
      setStoreQuery("");
      setSearched(false);
      setShowStoreSearch(false);
      await fetchStatus();
      toast(`Store set to ${store.storeName}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to set store", "error");
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
  // Connection badge: fresh session, expired session, or never connected.
  const connectionBadge = status?.cookieFresh
    ? { color: "success" as const, label: "Connected" }
    : status?.connected
      ? { color: "warning" as const, label: "Expired" }
      : { color: "neutral" as const, label: "Not connected" };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="H-E-B Integration"
        subtitle="Connect to H-E-B for real product prices, availability, and sale alerts on your shopping lists."
      />

      {/* Connection Status */}
      <Card className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {status?.cookieFresh ? (
              <Wifi className="h-5 w-5 text-success" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {status?.cookieFresh ? "Connected" : "Not connected"}
                </p>
                <Badge color={connectionBadge.color}>{connectionBadge.label}</Badge>
              </div>
              {status?.cookieAge !== undefined && (
                <p className="text-xs text-muted">
                  Session age: {Math.round(status.cookieAge / 1000)}s
                  {!status.cookieFresh && " (expired)"}
                </p>
              )}
            </div>
          </div>
          <Button onClick={handleRefresh} loading={refreshing} className="shrink-0">
            {refreshing ? (
              "Connecting..."
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {status?.connected ? "Refresh Session" : "Connect"}
              </>
            )}
          </Button>
        </div>
        {refreshing && (
          <p className="mt-3 text-xs text-muted">
            Launching Chrome to establish an H-E-B session... This takes about 15 seconds.
          </p>
        )}
        {!refreshing && refreshError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{refreshError}</p>
              <p className="mt-1 text-danger/80">
                Make sure Chrome is installed and reachable, then try again. If it keeps failing,
                H-E-B may be temporarily blocking automated sessions — wait a minute and retry.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Store */}
      <Card className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 text-muted" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{storeName}</p>
                {status && !status.storeConfigured && <Badge color="warning">Default</Badge>}
                {status?.storeConfigured && <Badge color="success">Selected</Badge>}
              </div>
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
            className="shrink-0 text-xs text-muted transition-colors hover:text-foreground"
          >
            {showStoreSearch ? "Cancel" : "Change store"}
          </button>
        </div>

        {showStoreSearch && (
          <div className="mt-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Search by zip code or city..."
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStoreSearch()}
                className="flex-1"
              />
              <Button
                onClick={handleStoreSearch}
                loading={searchingStores}
                disabled={!storeQuery.trim()}
                className="shrink-0"
              >
                Search
              </Button>
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

            {searched && !searchingStores && storeResults.length === 0 && (
              <div className="mt-3">
                <EmptyState
                  icon={Search}
                  title={`No stores found for “${lastSearchedQuery}”`}
                  description="Try a different zip code or city."
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* This Week's Deals */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Newspaper className="h-5 w-5 text-warning" />
            <div>
              <p className="font-medium">
                {weeklyAd?.flyerName ?? "This Week’s Deals"}
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
            Could not load weekly deals. Refresh your session and try again.
          </p>
        )}

        {weeklyAd && weeklyAd.items.length > 0 && (
          <>
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  type="text"
                  placeholder="Filter deals..."
                  value={dealFilter}
                  onChange={(e) => setDealFilter(e.target.value)}
                  className="pl-9"
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
                        alt={decodeHtmlEntities(item.name)}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col justify-center min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {decodeHtmlEntities(item.name)}
                    </p>
                    {item.brand && (
                      <p className="mt-0.5 text-xs text-muted">{decodeHtmlEntities(item.brand)}</p>
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
      </Card>

      {/* Info */}
      <Card className="mt-6 text-sm text-muted">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Sessions are established by launching a headless Chrome browser that
            visits heb.com
          </li>
          <li>No H-E-B account or login is required</li>
          <li>Sessions expire after about 10 minutes</li>
          <li>
            Sessions are auto-refreshed when you enrich a shopping list
          </li>
          <li>
            Product prices and availability are specific to your selected store
          </li>
        </ul>
      </Card>
    </div>
  );
}
