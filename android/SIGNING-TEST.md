# Signing test — CI only, do not merge

Branch-only marker file that exists solely to trigger the `Android`
workflow (`.github/workflows/android.yml`) after the
`ANDROID_KEYSTORE_*` Actions secrets were set on 2026-10-22, so a
CI-built release APK can be checked against the new release key's
certificate fingerprint before any real release tag is cut.

This file is not part of the app and must not be merged to `main`.
