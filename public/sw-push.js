/* Motormila web-push service worker (price-drops / back-in-stock topics).
 * Served as-is from /sw-push.js — no vite.config.ts build changes needed.
 * Registration snippet (see src/hooks/usePush.ts):
 *   if ("serviceWorker" in navigator) {
 *     await navigator.serviceWorker.register("/sw-push.js");
 *   }
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Motormila alert", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Motormila alert";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/sw-badge-72.png",
    tag: data.topic || "alert-match",
    renotify: true,
    data: { url: data.url || "/alerts" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("navigate" in client) return client.navigate(url).then(() => client.focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});
