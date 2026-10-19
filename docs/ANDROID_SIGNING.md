> **DEPRECATED (2026-10-19):** this doc describes the old committed-keystore setup. The committed `android/ci-signing.keystore` was removed; release signing is now env-only and fail-closed. See `docs/overhaul/android.md` (Signing) for the current process.

# Android signing identity — how releases stay co-installable

The sideload APKs published by `.github/workflows/android-release.yml` must
all carry the **same signature**, or Android refuses to install a new release
over the old one (the in-app updater in
`android/app/src/main/java/lk/motormila/app/core/updates/` and
`ui/updates/` goes dead and every user must uninstall/reinstall, losing local
data such as the watchlist).

## Current state (dev identity — public, do not trust)

`android/ci-signing.keystore` is **committed to git** with the stock Android
debug credentials (`storePassword=android`, `keyAlias=androiddebugkey`,
`keyPassword=android`, see `android/app/build.gradle.kts`). Anyone who clones
the repo can sign an APK with the same identity, and the released APKs are
therefore **not proof of origin** — they only prove that the bytes came from
this build script.

This identity exists so today's installs keep updating in place. **Do not
delete `ci-signing.keystore` until the first secret-keyed release ships** (that
release must reach all devices *before* the old keystore is removed, or those
devices can never upgrade in place again).

## Migrate to a real identity (explicit manual steps)

Rotation means shipping one release that **keeps the old signature** while the
new one is staged, then cutting over. Concretely:

1. On a machine with JDK 17, generate a real keystore offline:
   `keytool -genkeypair -keystore motormila-release.jks -alias motormila -keyalg RSA -keysize 4096 -validity 10950`
   Use a strong store/key password; keep them in a password manager.
2. Base64 the file: `base64 -w0 motormila-release.jks` (Linux) or
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("motormila-release.jks"))`
   (PowerShell).
3. Add GitHub **Actions secrets** on this repo:
   `ANDROID_KEYSTORE_FILE` (the base64 blob),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
   (matching the Gradle `ANDROID_KEYSTORE_*` names in `build.gradle.kts`).
4. The `android.yml` / `android-release.yml` "Resolve sideload keystore" steps
   check `ANDROID_KEYSTORE_FILE` first, base64-decode it to
   `$HOME/.android/motormila-sideload.keystore`, and pass that path to Gradle
   (falling back to the committed `ci-signing.keystore` when the secret is
   unset). Cut over by setting the secrets; remove `ci-signing.keystore`
   only after the first secret-signed release is installed everywhere.
5. `git rm --cached android/ci-signing.keystore` once cut over, then purge it
   from history together with the tracked DB dumps (`git filter-repo`), since
   the old private key lives in the cloned history.

## CI behaviour matrix

| Secrets set | Signature used | Co-install with today's builds? |
|---|---|---|
| none | committed `ci-signing.keystore` | yes (legacy identity) |
| `ANDROID_KEYSTORE_*` set | secret keystore | **no** — devices must uninstall first |

A secret-keyed release intentionally breaks the legacy co-install chain because
the legacy identity is public. Announce it in the release notes
("uninstall/reinstall required once") and link this doc.