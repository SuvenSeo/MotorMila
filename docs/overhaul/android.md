# Android — flavors, signing, and release process

> Current as of the `overhaul/all-phases` merge (2026-10-19). Replaces the old
> `docs/ANDROID_SIGNING.md`, which described the committed-keystore setup.

## Distribution flavors

`android/app/build.gradle.kts` defines one flavor dimension, `distribution`:

| Flavor   | Channel          | Play Billing | Self-updater | External checkout |
|----------|------------------|--------------|--------------|-------------------|
| `play`   | Google Play      | on           | off          | off               |
| `direct` | GitHub/R2 sideload | off        | on (SHA-256 verified) | on (bank/KOKO/WhatsApp) |

Flavor-specific `BuildConfig` fields (`DISTRIBUTION`, `SELF_UPDATE_ENABLED`,
`EXTERNAL_CHECKOUT_ENABLED`, `PLAY_BILLING_ENABLED`) switch behavior at
runtime. `src/direct/AndroidManifest.xml` adds `REQUEST_INSTALL_PACKAGES`
for the sideload updater only — the `play` flavor must never declare it
(Play policy).

`compileSdk`/`targetSdk` are **36** (Play requires 36 for updates from
1 Nov 2026).

## Signing — env-only, fail-closed

The committed `android/ci-signing.keystore` was removed. Release signing
comes **only** from the environment:

- `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- Play upload key (optional, falls back to the above): `PLAY_UPLOAD_KEYSTORE_FILE`,
  `PLAY_UPLOAD_KEYSTORE_PASSWORD`, `PLAY_UPLOAD_KEY_ALIAS`, `PLAY_UPLOAD_KEY_PASSWORD`

In CI these are the `ANDROID_KEYSTORE_*` / `PLAY_UPLOAD_*` GitHub secrets
(the workflow base64-decodes the keystore to a temp path first). A
`taskGraph.whenReady` check fails **any** release packaging task loudly when
the env is missing — it never falls back to a debug or committed key.
Debug and unit-test tasks are unaffected.

For a non-publishable R8 smoke build (e.g. CI), pass
`-PmotormilaAllowUnsignedRelease=true`.

**Key rotation rule:** every sideload APK must carry the same signature, or
Android refuses to install updates over the old build (users must
uninstall/reinstall and lose local data). Generate the new key **once**,
store it as the secrets above, and never commit it.

## Releasing

`.github/workflows/android-release.yml` (tag `android-v*`):

1. Decodes the keystore secret, assembles `directRelease` + `playRelease`.
2. Uploads the APKs to the GitHub release and R2, updates the release
   manifest (`app/latest-release.json`) consumed by the in-app updater.
3. Never publishes when signing env is missing (fails closed).

`android.yml` runs `:app:testPlayDebugUnitTest` + `:app:testDirectDebugUnitTest`
and Paparazzi goldens on every PR touching `android/`.

## Known build gotcha: Room KSP schema race

`org.gradle.parallel=true` is set, and both flavors share
`$projectDir/schemas` for Room's schema export. Room's `exportSchema()`
reads the schema file back while writing it, so parallel
`kspPlay*Kotlin`/`kspDirect*Kotlin` tasks race and fail with
`IllegalStateException: Empty schema file`. The schema is
flavor-independent, so `build.gradle.kts` serializes the KSP tasks with
`mustRunAfter` instead of disabling parallelism globally. If you add a
third flavor dimension, extend that rule.

Schema export (`exportSchema = true`, `app/schemas/`) backs the migration
tests: every schema bump must commit the new `<version>.json` and add a
`Migration` to `MotormilaMigrations.ALL` — release builds have **no**
destructive migration fallback (debug only).
