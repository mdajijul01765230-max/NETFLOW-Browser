# NETFLOW Browser V2 — Automated Verification Results (`docs/TEST_RESULTS.md`)

**Execution Marker:** `NETFLOW-DOCS-TRUTH-SYNC-01` (Form 6 of 7 — Part A), `NETFLOW-AUDIT-FINDINGS-FIX-02` (Form 8 — Part G) & `NETFLOW-PREVIEW-FINDINGS-FIX-01` (Form 9 — Part G)  
**Execution Date:** `2026-10-11`

---

## 1. Evidence Level & Scope Disclosure

* **`VERIFIED`**: Every command and script listed in the table below was executed in this workspace container on `2026-10-11` and exited with code `0`. The `Counts as Printed` column copies the exact final summary output printed by each command.
* **`INFERRED`**: `scripts/verify-java-static.ts` performs static text and structural checks over `android/app/src/main/java/com/netflow/browser/*.java`, `android/app/build.gradle`, `res/values/ids.xml`, and `AndroidManifest.xml`. It is **not** a Java compiler (`javac`) or Android Gradle build.
* **`NOT VERIFIED`**: Android APK compilation (`./gradlew assembleDebug lintDebug`) and physical Android handset execution are **NOT VERIFIED** in this environment because no JDK or Android SDK is installed in the container. Furthermore, `scripts/verify-native18.ts` through `scripts/verify-native38.ts` verify standalone TypeScript policy models (`src/services/androidWebView*.ts`), not live Android System WebView enforcement.

---

## 2. Exact Verification Execution Table (Part A, Form 8 Part G & Form 9 Part G)

| Script / Command | Exit Code | Counts as Printed | Date |
| :--- | :---: | :--- | :---: |
| `npm run lint` (`tsc --noEmit`) | `0` | `LINT_EXIT=0` | `2026-10-11` |
| `npm run build` (`vite build && esbuild server.ts ...`) | `0` | `✓ built in 7.30s` / `dist/server.cjs 123.3kb` / `⚡ Done in 33ms` (`BUILD_EXIT=0`) | `2026-10-11` |
| `scripts/verify-backend-hardening.ts` | `0` | `Summary: 15/15 passed.` | `2026-10-11` |
| `scripts/verify-chrome-like-ux.ts` | `0` | `SUMMARY: 48 passed, 0 failed` | `2026-10-11` |
| `scripts/verify-form-n2.ts` | `0` | `=== FORM-N2 Verification Summary: 40 passed, 0 failed ===` | `2026-10-11` |
| `scripts/verify-interactive-contract.ts` | `0` | `=== NETFLOW-INTERACTIVE-CONTRACT-01 Summary: 36 passed, 0 failed ===` | `2026-10-11` |
| `scripts/verify-java-static.ts` | `0` | `=== Static Java Verification Summary: 16/16 checks passed, 0 failed ===` | `2026-10-11` |
| `scripts/verify-light-mode-fallback.ts` | `0` | `ALL 10/10 LIGHT MODE, FALLBACK & QUEUE TESTS PASSED.` | `2026-10-11` |
| `scripts/verify-native18.ts` | `0` | `=== ALL NATIVE-18 AND NATIVE-17 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native19.ts` | `0` | `=== ALL NATIVE-19 AND NATIVE-18 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native20.ts` | `0` | `=== ALL NATIVE-20 AND NATIVE-19 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native21.ts` | `0` | `=== ALL NATIVE-21 AND NATIVE-18 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native22.ts` | `0` | `=== ALL NATIVE-22 AND NATIVE-21 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native23.ts` | `0` | `=== ALL NATIVE-23 AND NATIVE-22 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native24.ts` | `0` | `=== ALL NATIVE-24 AND NATIVE-14 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native25.ts` | `0` | `=== ALL NATIVE-25 & NATIVE-24 REGRESSION SUITES PASSED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native26.ts` | `0` | `=== ALL NATIVE-26 & NATIVE-25 SUITES COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native27.ts` | `0` | `=== ALL NATIVE-27 & NATIVE-26 SUITES COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native28.ts` | `0` | `=== ALL NATIVE-28 & NATIVE-27 SUITES COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native29.ts` | `0` | `=== ALL NATIVE-29, NATIVE-28, AND NATIVE-27 SUITES COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native30.ts` | `0` | `=== ALL NATIVE-30, NATIVE-29, NATIVE-28, AND NATIVE-27 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native31.ts` | `0` | `=== ALL NATIVE-31, NATIVE-30, AND NATIVE-29 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native32.ts` | `0` | `=== ALL NATIVE-32, NATIVE-31, NATIVE-33, NATIVE-30, AND NATIVE-29 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native33.ts` | `0` | `=== ALL NATIVE-33, NATIVE-31, NATIVE-30, AND NATIVE-29 TESTS COMPLETED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-native34.ts` | `0` | `>>> ALL NATIVE-34 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<` | `2026-10-11` |
| `scripts/verify-native35.ts` | `0` | `>>> ALL NATIVE-35 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<` | `2026-10-11` |
| `scripts/verify-native36.ts` | `0` | `>>> ALL NATIVE-36 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<` | `2026-10-11` |
| `scripts/verify-native37.ts` | `0` | `>>> ALL NATIVE-37 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<` | `2026-10-11` |
| `scripts/verify-native38.ts` | `0` | `>>> ALL NATIVE-38 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<` | `2026-10-11` |
| `scripts/verify-native-downloads.ts` | `0` | `TOTAL: 30 \| PASSED: 30 \| FAILED: 0` | `2026-10-11` |
| `scripts/verify-network-resilience.ts` | `0` | `ALL 12/12 NETWORK RESILIENCE TESTS PASSED.` | `2026-10-11` |
| `scripts/verify-preview-findings.ts` | `0` | `FORM 9 SUMMARY: 82 passed, 0 failed` | `2026-10-11` |
| `scripts/verify-session-persistence.ts` | `0` | `=== ALL NETFLOW SESSION PERSISTENCE ENGINE V2 CHECKS PASSED SUCCESSFULLY ===` | `2026-10-11` |
| `scripts/verify-smoke.ts` | `0` | `Summary: 14 PASS, 2 PARTIAL, 0 FAIL, 0 NOT TESTABLE` | `2026-10-11` |

---

## 3. Form 9 (`NETFLOW-PREVIEW-FINDINGS-FIX-01`) Progress Notes

* **PART A (`COMPLETED`)**: Fixed HTTP 404 (`HTTP_404_NOT_FOUND`) vs DNS (`ERR_NAME_NOT_RESOLVED`) classification and error presentation in `src/components/WebRenderer.tsx` (`resolveRecoveryCenterPresentation`) and `src/locales.ts`. Added distinct BN+EN titles, descriptions, and checklists for `403`, `404`, `429`, `500`, `502`, `503`, `504` and verified DNS text appears only for `ERR_NAME_NOT_RESOLVED` and HTTP codes contain no cable/modem/Wi-Fi text (`scripts/verify-preview-findings.ts`: 23/23 Part A checks passed).
* **PART B (`COMPLETED`)**: Reproduced `"status/404"`, `"DEVICE_TEST_PLAN.md"`, `"docs/CHROME_GAP.md"` against the live local server (`/api/browse` returned `HTTP 200` with `url: "search://..."`, which `src/App.tsx:1556` passed to `redirectChainManagerRef.current.recordHop`, triggering `Blocked unsafe redirect target: DANGEROUS_SCHEME` without setting `errorInfo`). Updated `src/App.tsx`, `src/components/WebRenderer.tsx`, and `src/utils/formatters.ts` so blocked redirects and unsafe targets produce `NETFLOW_REDIRECT_BLOCKED` / `NETFLOW_SSRF_BLOCKED`, `kind: "security"`, friendly BN+EN text with no cable/modem/Wi-Fi checklist, and raw internal reason strings kept only inside collapsed `technicalDetails` with sensitive URL params redacted (`scripts/verify-preview-findings.ts`: 26/26 cumulative checks passed).
* **PART C (`COMPLETED`)**: Unified omnibox heuristics (`resolveOmniboxInput` / `resolveNativeOmniboxInput` in `src/services/nativeBrowserEngine.ts`) across both the native path (`src/App.tsx`, `src/services/nativeBrowserEngine.ts`) and the proxy path (`src/App.tsx`, `server.ts`). Non-URL inputs (whitespace, first host label outside `[a-z0-9-]`, no dot and no scheme unless `localhost`/IP literal, invalid TLD outside 2-24 alphabetic chars) route to search while `localhost`/IP literals/unsafe targets remain blocked with `NETFLOW_SSRF_BLOCKED`. Added 32-case table-driven test in `scripts/verify-preview-findings.ts` (`60/60` cumulative checks passed).
* **PART D (`COMPLETED`)**: Restricted "Connection restored (Online)" banner (`connectionRestoredBannerActive` in `src/services/androidWebViewNetworkResilience.ts`, `src/App.tsx`, and `src/components/WebRenderer.tsx`) to activate only after an observed `offline -> online` transition while a tab is loading or in error state, never on ordinary page loads or 404/503/DNS errors, with dismissal and single-transition deduplication (`scripts/verify-preview-findings.ts`: 8/8 Part D checks passed, `68/68` cumulative).
* **PART E (`COMPLETED`)**: Gated all native/Chromium engine UI labels (`resolveEngineStatusPresentation` in `src/components/WebRenderer.tsx`, `src/components/StartPage.tsx`, and `src/components/DeviceOptimizerModal.tsx`) so `"নেটিভ ক্রোমিয়াম ইঞ্জিন • সক্রিয় জাভাস্ক্রিপ্ট"` appears only when the real Android native bridge is active and the tab uses it, and `"ফুল মোড • স্যান্ডবক্সে JavaScript"` / `"Full Mode • Sandboxed JavaScript"` appears in Web Preview or proxy full mode (`scripts/verify-preview-findings.ts`: 7/7 Part E checks passed, `75/75` cumulative).
* **PART F (`COMPLETED`)**: Fixed Recovery Center checklist box contrast (`bg-stone-100 dark:bg-stone-800`, `text-stone-900 dark:text-stone-100`, contrast `16.03:1` light / `13.9:1` dark, plus `--color-stone-850` / `--color-stone-750` in `src/index.css`) and added `doesPageDeclareDarkSchemeSupport` + `injectProxiedPageThemeStyle` in `src/components/WebRenderer.tsx` so proxied pages without dark-scheme declarations stay light (`color-scheme: light`, `bg-white text-stone-900`) without overriding page CSS (`scripts/verify-preview-findings.ts`: 7/7 Part F checks passed, `82/82` cumulative; visual result on phone is `NOT VERIFIED`).
* **PART G (`COMPLETED`)**: Added Section 3.1 `"Preview findings (phone screenshots, 2026-10-11)"` in `docs/HANDOFF.md` documenting all 6 findings with root causes, fixes, and evidence levels; ran `npm run lint`, `npm run build`, and all 32 `scripts/verify-*.ts` suites (all exiting `0`) and recorded their exact printed output in `docs/TEST_RESULTS.md`.

