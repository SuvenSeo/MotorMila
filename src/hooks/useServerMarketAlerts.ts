import { useCallback, useEffect, useState } from "react";

import {
  createAlert,
  deleteAlert,
  getAlerts,
  getOrCreateAlertToken,
  updateAlertChannels,
  type AlertChannelsUpdateInput,
  type AlertCreateInput,
  type ServerMarketAlert,
} from "@/services/api";
import { trackEvent } from "@/lib/analytics";

export interface UseServerMarketAlertsResult {
  alerts: ServerMarketAlert[];
  loading: boolean;
  error: string | null;
  token: string;
  refresh: () => Promise<void>;
  create: (data: AlertCreateInput) => Promise<ServerMarketAlert>;
  remove: (id: number) => Promise<void>;
  updateChannels?: (id: number, data: AlertChannelsUpdateInput) => Promise<ServerMarketAlert>;
}

export function useServerMarketAlerts(): UseServerMarketAlertsResult {
  const [alerts, setAlerts] = useState<ServerMarketAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token] = useState<string>(() => getOrCreateAlertToken());

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getAlerts(token);
      setAlerts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (data: AlertCreateInput) => {
      const created = await createAlert(token, data);
      await refresh();
      trackEvent("alert_created", {
        make: data.make,
        model: data.model,
        district: data.district,
      });
      return created;
    },
    [token, refresh],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteAlert(token, id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    },
    [token],
  );

  const updateChannels = useCallback(
    async (id: number, data: AlertChannelsUpdateInput) => {
      const updated = await updateAlertChannels(token, id, data);
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      trackEvent("alert_channels_updated", { alert_id: id, ...data });
      return updated;
    },
    [token],
  );

  return { alerts, loading, error, token, refresh, create, remove, updateChannels };
}
