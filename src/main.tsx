import { migrateLegacyStorageKeys } from "./lib/storageMigration";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/layers.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AppPreferencesProvider, preloadSavedLanguage, readSavedLanguage } from "@/lib/appPreferences";

// Error tracking — dynamically imported so the bundle only pays for Sentry
// when VITE_SENTRY_DSN is configured at build time.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
	void import("@sentry/react").then((Sentry) => {
		Sentry.init({
			dsn: sentryDsn,
			environment: import.meta.env.MODE,
			sendDefaultPii: false,
		});
	});
}

migrateLegacyStorageKeys();


function mount() {
	createRoot(document.getElementById("root")!).render(
		<AppPreferencesProvider>
			<AppErrorBoundary>
				<App />
			</AppErrorBoundary>
		</AppPreferencesProvider>
	);
}

// Sinhala/Tamil dictionaries are lazy chunks: for a saved si/ta session wait
// for that chunk so the first render is already in the right language.
// English (the default) mounts synchronously, exactly as before.
if (readSavedLanguage() === "en") mount();
else void preloadSavedLanguage().then(mount);
