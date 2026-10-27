# NETFLOW Browser V2

**Execution Marker:** `NETFLOW-DOCS-TRUTH-SYNC-01` (Form 6 of 7)  
**Last Updated:** `2026-10-10`

---

## 1. Architecture & Honest Status Summary

NETFLOW Browser V2 is a bilingual (Bengali + English) hybrid browser combining:
* **React 19 + TypeScript UI Shell (`src/App.tsx`, `src/components/*`, `src/services/*`):** Tab management, debounced session persistence (`sessionPersistence.ts`), per-domain site settings (`SitePrivacyOverride`), interactive consent modals (`CameraMicConsentModal`, `GeolocationConsentModal`, `HttpAuthModal`, `JavaScriptDialogModal`, `DownloadConsentModal`, `ContextMenuModal`, `GoogleAuthFallbackModal`), network resilience (`networkEngine.ts`), and Light Mode policies (`lightModeEngine.ts`).
* **Android Capacitor + Multi-Instance `android.webkit.WebView` Native Engine (`android/app/src/main/java/com/netflow/browser/`):** Per-tab native `WebView` management (`NetflowWebViewEngine.java`), native Android `DownloadManager` integration (`NetflowDownloadManager.java`), runtime `WebViewFeature.MULTI_PROFILE` private profile isolation (`"NetflowPrivateProfile"` via `WebViewCompat.setProfile` and `ProfileStore`), and Capacitor bridge (`NetflowBrowserPlugin.java`, `MainActivity.java`).
* **Express Transformation Proxy (`server.ts`):** Handles low-bandwidth modes (`smart-compress`, `text-only`, `reader`), web-preview browsing, and private-tab fallback when `MULTI_PROFILE` is unavailable on a device, using a custom regex HTML sanitizer (`cleanAndSanitizeHtml`) and pre-connect + per-redirect-hop DNS SSRF validation (`resolveAndValidateDnsSafety`).

### Evidence Level Summary (`2026-10-10`)
* **`VERIFIED`**: TypeScript compilation (`npm run lint`), bundle build (`npm run build`), and all 31 automated verification scripts in `scripts/verify-*.ts` pass with exit code `0` (exact output recorded in [`docs/TEST_RESULTS.md`](./docs/TEST_RESULTS.md)).
* **`INFERRED`**: Android Java source semantics (`MainActivity.java`, `NetflowBrowserPlugin.java`, `NetflowWebViewEngine.java`, `NetflowDownloadManager.java`) are verified at the static text/structure level by `scripts/verify-java-static.ts` (`16/16 checks passed, 0 failed`), and inferred against Android SDK 24–36 and `androidx.webkit:webkit:1.14.0` specifications.
* **`NOT VERIFIED`**: Android `javac`/Gradle compilation (`./gradlew assembleDebug lintDebug`), physical Android handset testing (`docs/DEVICE_TEST_PLAN.md`), Widevine DRM playback (`protectedMedia` defaults to `BLOCK`), and live HTTPS backend deployment (`docs/DEPLOY_BACKEND.md`) are **`NOT VERIFIED`**. All 8 gates in [`docs/RELEASE_GATES.md`](./docs/RELEASE_GATES.md) stand at **`NOT DONE`**.

---

## 2. Documentation Map (`docs/`)

* [`docs/TEST_RESULTS.md`](./docs/TEST_RESULTS.md) — Exact printed output, counts, and exit codes from running `npm run lint`, `npm run build`, and all 31 `scripts/verify-*.ts` scripts on `2026-10-10`.
* [`docs/HANDOFF.md`](./docs/HANDOFF.md) — Architecture, Forms 1–5 status and evidence levels, corrected technical claims, and ranked open risks.
* [`docs/CHROME_GAP.md`](./docs/CHROME_GAP.md) — Bilingual (Bengali + English) engineering gap analysis comparing Google Chrome on Android vs. NETFLOW Browser V2.
* [`docs/DEVICE_TEST_PLAN.md`](./docs/DEVICE_TEST_PLAN.md) — Bilingual physical Android phone test checklist (`A-01`–`E-04`).
* [`docs/RELEASE_GATES.md`](./docs/RELEASE_GATES.md) — Release gates checklist (`GATE-01` through `GATE-08`, all currently `NOT DONE`).
* [`docs/RELEASE_PREP_LATER.md`](./docs/RELEASE_PREP_LATER.md) — Post-gate release preparation checklist (**must not be started until all gates in `docs/RELEASE_GATES.md` pass**).
* [`docs/ANDROID_BUILD.md`](./docs/ANDROID_BUILD.md) — Bilingual guide for running `.github/workflows/android-build.yml` and collecting `build.log` / `app-debug.apk`.
* [`docs/DEPLOY_BACKEND.md`](./docs/DEPLOY_BACKEND.md) — Bilingual guide for deploying `server.ts` behind HTTPS with `TRUST_PROXY`, rate limits, and `curl` checks.
* [`docs/NATIVE_CONTRACT.md`](./docs/NATIVE_CONTRACT.md) — JSON event and command contract between `NetflowWebViewEngine.java` and `src/services/nativeBrowserEngine.ts`.
* [`docs/AUDIT_REPORT.md`](./docs/AUDIT_REPORT.md) — Point-in-time read-only audit snapshot (`2026-10-08`).
