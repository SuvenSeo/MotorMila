# Direct-backend preview (no Pages Functions)

Purpose: restore Motormila sign-in and the `/motormila/admin` console without
restoring any Cloudflare Pages Functions, after the 1 Nov 2026 removal.

How it works
- Cloudflare Pages **preview** env only: `VITE_API_URL` is set to the
  Hugging Face backend directly
  (`https://seo292-vehicle-platform-backend.hf.space/api/v1`), and
  `VITE_ENABLE_BACKEND_AUTH` stays `true`.
- The browser then talks straight to HF. Login uses the bearer token returned
  by `POST /auth/login` (cookies are omitted cross-origin, by design in
  `src/lib/authContext.tsx`); CORS already allows `*.motormila.pages.dev`.
- No code change was needed for this route: `src/services/api.ts` already
  falls back to that HF URL when `VITE_API_URL` is unset, and already
  resolves a configured HF URL as-is.

What this branch does NOT change
- Production env vars are untouched, and the production site is untouched.
- No Pages Function is restored. `uses_functions` stays false.
- This does not fix the backend `/listings` 500 (health is `primary`/`ok`,
  but `/listings` still returns "Internal server error" as of 2 Nov 2026),
  so admin panels that depend on listings may still error after login.

Root cause this preview works around
- The live production bundle (ad-hoc direct-upload deploys 22:17 and 23:18 UTC
  on 1 Nov 2026, commit 9234a29c, `commit_dirty: true`) was built outside
  Pages, so the Pages env var `VITE_ENABLE_BACKEND_AUTH=true` never reached
  it. Its compiled login is literally `return null`, which is why both
  `/sign-in` ("Sign-in is not configured for this build") and
  `/motormila/admin` ("backend sign-in is not enabled in this build") fail
  before ever contacting a server. A proper Pages-built preview does not
  have that defect.

To promote this to production later (separate go-ahead required)
- Set the same `VITE_API_URL` on the Pages **production** env and trigger a
  proper GitHub-push Pages build (not a direct upload), then verify the
  live bundle actually contains the backend login path before announcing it.
