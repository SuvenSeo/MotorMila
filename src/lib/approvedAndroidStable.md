# Publishing the `/mobile-app` download

`approvedAndroidStable.json` is a **source-reviewed web input**, not a copy of an updater feed. `approved: null` selects the pinned 1.8.0 fallback. Do not edit `fallback` or `signing_cert_sha256` when promoting another version. URLs aren't manifest fields: the page constructs only the versioned APK path on the official R2 origin. The QR opens `/mobile-app`, never an APK directly.

**Promotion trigger:** release-owner review of the exact signed *direct release* bytes. A passing build, a new Gradle version, an `android-v*` tag, an RC link or a preview smoke test is not approval. Record the version/code, digest, signing certificate, byte count, publish time and clean-install/upgrade evidence on the reported Samsung and a second device. Verify Home, browse and retained data after a cold restart. Don't publish a newly rebuilt file under an already tested filename. The 1.8.0 fallback has emulator evidence; that is not a Samsung certification.

In a dedicated PR, set `approved` to a record with the same six fields as `fallback`, using the vetted measurements. Run both checks from the repo root:

```
npm test -- src/test/mobileAppPage.test.ts src/test/mobileAppRender.test.tsx
python src/test/verify_approved_apk.py <downloaded-official-apk> <android-sdk/build-tools/version>
```

The second check needs Python 3.11+, Java and Android SDK build tools; it reads a local file, verifies its size/digest, signer, package and version, and cannot publish or install it. Compare a fresh download from the exact R2 destination with the tested file before enabling acquisition. Only a rebuilt and published website switches the three CTAs, version labels, size, checksum and click attribution. Changing an updater feed cannot promote the page.

**Rollback:** set `approved` back to `null`, rebuild and publish the web page. Independently restore both updater responses to the genuine 1.8.0/21 release metadata (including its own URL/hash; min-supported code 0). The shipped 1.8.0 direct client tries `https://motormila.pages.dev/app/latest-release.json` **before** `/api/v1/releases/app`; an API override alone, or removing the static file while the API still returns 23, does not contain the update. The publisher should freeze Android Release tags/manual dispatches, pin Pages and the API (backend `APP_RELEASE_*` overrides), revalidate caches and read both public responses back, then confirm no update prompt on 21. Don't relabel the 1.8.0 APK as build 23, overwrite APK bytes, or tell existing users to uninstall. Recovery for broken installed builds needs a tested higher-code release; the web is available in the meantime.
