# Direct-backend production (no Pages Functions)

Production now uses the same direct route that was verified on the
`direct-backend-admin` preview on 2 Nov 2026, after Suven confirmed sign-in
working there and approved promotion.

- Cloudflare Pages **production** env: `VITE_API_URL` =
  `https://seo292-vehicle-platform-backend.hf.space/api/v1`,
  `VITE_ENABLE_BACKEND_AUTH` = `true`.
- The browser talks straight to the Hugging Face backend. Login uses the
  bearer token from `POST /auth/login` (cookies omitted cross-origin).
- No Pages Function is restored. Production is built by Pages from a
  GitHub push to main, never by direct upload — direct-upload builds
  bypassed the Pages env vars on 1 Nov 2026 and shipped a bundle whose
  login was compiled to `return null`.

Known remaining issue at promotion time: backend `/listings` still returns
500 "Internal server error" (health is primary/ok), so panels depending on
listings may still error after login. That is a backend issue, not a
Pages/Functions issue.

Note on hosting (2 Nov 2026): this does NOT make Motormila "fully on
Cloudflare". Pages hosts the frontend and the static snapshots
(R2 `motormila-snapshots`), but the API itself runs on Hugging Face
Spaces and its primary database is still Neon (`autolens-raw-data`,
`frosty-sound-46661850`); the Cloudflare D1 `motormila-accounts`
database exists but the `feature/cloudflare-db` branch was never merged,
so it is not live.
