// One-time migration of pre-rename localStorage keys ("autolens.*") to their
// "motormila.*" equivalents. Imported first in src/main.tsx so it runs before
// any module reads storage. Copy-then-delete: existing sessions, watchlists,
// alert tokens and preferences survive the rename untouched.
//
// Safe to keep indefinitely — after the first run every legacy key is gone and
// this becomes a no-op. Remove once no active install can still carry the old
// names. (Session-only chunk-reload guards are intentionally excluded: both
// readers already dual-read the legacy sessionStorage key.)

const KEY_RENAMES: Array<readonly [legacy: string, current: string]> = [
  ["autolens.auth_token", "motormila.auth_token"],
  ["autolens.auth_user", "motormila.auth_user"],
  ["autolens.watchlist.ids", "motormila.watchlist.ids"],
  ["autolens_theme_mode", "motormila_theme_mode"],
  ["autolens_language", "motormila_language"],
  ["autolens.market_alerts.v1", "motormila.market_alerts.v1"],
  ["autolens.feedback.offline.v1", "motormila.feedback.offline.v1"],
  ["autolens.alert_token.v1", "motormila.alert_token.v1"],
  ["autolens_chat_v2", "motormila_chat_v2"],
  ["autolens_chat_tooltip_seen", "motormila_chat_tooltip_seen"],
];

export function migrateLegacyStorageKeys(): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const storage = window.localStorage;
    for (const [legacy, current] of KEY_RENAMES) {
      try {
        if (storage.getItem(current) !== null) {
          // Current key already set — legacy value is stale, drop it.
          storage.removeItem(legacy);
          continue;
        }
        const value = storage.getItem(legacy);
        if (value !== null) storage.setItem(current, value);
        storage.removeItem(legacy);
      } catch {
        // Per-key failures (quota, privacy mode) must not block the rest.
      }
    }
  } catch {
    // Storage entirely unavailable — nothing to migrate.
  }
}
