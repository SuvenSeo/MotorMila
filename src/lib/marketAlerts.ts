import type { FilterState } from "@/types/car";

const MARKET_ALERTS_KEY = "motormila.market_alerts.v1";
const MAX_ALERTS = 12;

export interface MarketAlert {
  id: string;
  label: string;
  filters: Partial<FilterState>;
  target_price_lkr?: number;
  created_at: string;
  last_checked_at?: string;
  server_id?: number;
}

function safeParseAlerts(raw: string | null): MarketAlert[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || ""),
        label: String(item?.label || "Market alert"),
        filters: typeof item?.filters === "object" && item.filters ? item.filters : {},
        target_price_lkr: Number.isFinite(Number(item?.target_price_lkr)) ? Number(item.target_price_lkr) : undefined,
        created_at: String(item?.created_at || new Date().toISOString()),
        last_checked_at: item?.last_checked_at ? String(item.last_checked_at) : undefined,
      }))
      .filter((item) => item.id && item.label)
      .slice(0, MAX_ALERTS);
  } catch {
    return [];
  }
}

function getAlertStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const storage = window.localStorage;
    if (typeof storage.getItem !== "function" || typeof storage.setItem !== "function") return null;
    return storage;
  } catch {
    return null;
  }
}

function writeAlerts(alerts: MarketAlert[]) {
  const storage = getAlertStorage();
  if (!storage) return;
  try {
    storage.setItem(MARKET_ALERTS_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS)));
  } catch {
    // Storage can fail in private browsing, quota pressure, or constrained test environments.
  }
}

export function loadMarketAlerts(): MarketAlert[] {
  const storage = getAlertStorage();
  if (!storage) return [];
  try {
    return safeParseAlerts(storage.getItem(MARKET_ALERTS_KEY));
  } catch {
    return [];
  }
}

export function summarizeAlertFilters(filters: Partial<FilterState>): string {
  const parts = [
    filters.q ? `"${filters.q}"` : undefined,
    filters.make,
    filters.model,
    filters.district,
    filters.condition ? filters.condition.replace(/_/g, " ") : undefined,
    filters.fuel_type,
    filters.transmission,
    filters.price_min || filters.price_max ? "custom budget" : undefined,
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : "All priced inventory";
}

export function saveMarketAlert(filters: FilterState, targetPrice?: number): MarketAlert[] {
  const alerts = loadMarketAlerts();
  const alert: MarketAlert = {
    id: `alert-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    label: summarizeAlertFilters(filters),
    filters: {
      q: filters.q,
      make: filters.make,
      model: filters.model,
      district: filters.district,
      condition: filters.condition,
      fuel_type: filters.fuel_type,
      transmission: filters.transmission,
      body_type: filters.body_type,
      year_min: filters.year_min,
      year_max: filters.year_max,
      price_min: filters.price_min,
      price_max: filters.price_max,
      mileage_max: filters.mileage_max,
      source: filters.source,
      sort: filters.sort,
      page: 1,
    },
    target_price_lkr: targetPrice && targetPrice > 0 ? targetPrice : undefined,
    created_at: new Date().toISOString(),
  };

  const next = [alert, ...alerts.filter((item) => item.label !== alert.label)].slice(0, MAX_ALERTS);
  writeAlerts(next);
  return next;
}

export function removeMarketAlert(id: string): MarketAlert[] {
  const next = loadMarketAlerts().filter((alert) => alert.id !== id);
  writeAlerts(next);
  return next;
}

export function patchMarketAlertServerId(id: string, serverId: number): MarketAlert[] {
  const alerts = loadMarketAlerts();
  const next = alerts.map((a) => (a.id === id ? { ...a, server_id: serverId } : a));
  writeAlerts(next);
  return next;
}
