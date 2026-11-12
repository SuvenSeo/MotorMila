/**
 * Saved searches ⇄ server market alerts.
 *
 * The backend alert API (/alerts) supports `delivery_mode: "instant" | "digest"`
 * (digest = one 07:00 Asia/Colombo send) and soft-deletes on DELETE, so the
 * UI cadence maps as: Instant → instant, Daily → digest, Off → no server alert
 * (the search stays saved on this device). Anonymous visitors get an alert
 * token from getOrCreateAlertToken(); the server caps free/anon at 1 alert.
 *
 * Note: server alerts match on make / model / district / max price only;
 * other filters (fuel, year, mileage…) are kept on the saved search and
 * applied when it is opened, but do not narrow notifications.
 */
import type { FilterState } from "@/types/car";
import {
  APIError,
  createAlert,
  deleteAlert,
  getOrCreateAlertToken,
  updateAlertChannels,
  type AlertCreateInput,
} from "@/services/api";
import {
  saveSavedSearch,
  updateSavedSearch,
  type SavedSearch,
  type SavedSearchFrequency,
} from "@/utils/savedSearches";
import { trackEvent } from "@/lib/analytics";

export const DEFAULT_SAVED_SEARCH_FREQUENCY: SavedSearchFrequency = "daily";

export type AlertSyncStatus = "saved" | "local" | "limit" | "error";

function alertPayload(filters: Partial<FilterState>, frequency: Exclude<SavedSearchFrequency, "off">): AlertCreateInput {
  return {
    make: filters.make || undefined,
    model: filters.model || undefined,
    district: filters.district || undefined,
    max_price: filters.price_max || undefined,
    delivery_mode: frequency === "instant" ? "instant" : "digest",
  };
}

function statusFromError(error: unknown): AlertSyncStatus {
  return error instanceof APIError && error.status === 429 ? "limit" : "error";
}

/** A readable default name: "Toyota Aqua · Colombo · under Rs 8.5 Mn". */
export function savedSearchLabel(filters: Partial<FilterState>, fallback = "Current search"): string {
  const parts = [filters.make, filters.model, filters.district, filters.q ? `"${filters.q}"` : undefined].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}

/** Save the search locally and, unless Off, create its server alert. */
export async function saveSearchWithAlert(
  name: string,
  filters: Partial<FilterState>,
  frequency: SavedSearchFrequency = DEFAULT_SAVED_SEARCH_FREQUENCY,
): Promise<{ entry: SavedSearch; status: AlertSyncStatus }> {
  const entry = saveSavedSearch(name, filters, { frequency });
  trackEvent("saved_search_created", { frequency });
  if (frequency === "off") return { entry, status: "local" };
  try {
    const created = await createAlert(getOrCreateAlertToken(), alertPayload(filters, frequency));
    const updated = updateSavedSearch(entry.id, { serverAlertId: created.id }) ?? entry;
    return { entry: updated, status: "saved" };
  } catch (error) {
    // Keep it saved on the device, but don't pretend alerts are on.
    const updated = updateSavedSearch(entry.id, { frequency: "off" }) ?? entry;
    return { entry: updated, status: statusFromError(error) };
  }
}

/** Change a saved search's cadence, creating / updating / removing its server alert. */
export async function setSavedSearchFrequency(
  search: SavedSearch,
  frequency: SavedSearchFrequency,
): Promise<{ entry: SavedSearch; status: AlertSyncStatus }> {
  const token = getOrCreateAlertToken();
  try {
    if (frequency === "off") {
      if (search.serverAlertId) await deleteAlert(token, search.serverAlertId).catch(() => undefined);
      const entry = updateSavedSearch(search.id, { frequency: "off", serverAlertId: undefined }) ?? search;
      return { entry, status: "local" };
    }
    if (search.serverAlertId) {
      await updateAlertChannels(token, search.serverAlertId, {
        delivery_mode: frequency === "instant" ? "instant" : "digest",
      });
      const entry = updateSavedSearch(search.id, { frequency }) ?? search;
      return { entry, status: "saved" };
    }
    const created = await createAlert(token, alertPayload(search.filters, frequency));
    const entry = updateSavedSearch(search.id, { frequency, serverAlertId: created.id }) ?? search;
    return { entry, status: "saved" };
  } catch (error) {
    return { entry: search, status: statusFromError(error) };
  }
}

/** Remove the server alert (if any) for a saved search that is being deleted. */
export async function removeSavedSearchAlert(search: SavedSearch): Promise<void> {
  if (!search.serverAlertId) return;
  await deleteAlert(getOrCreateAlertToken(), search.serverAlertId).catch(() => undefined);
}
