/**
 * NETFLOW BROWSER V2 — FORM 9 VERIFICATION SUITE
 * EXECUTION MARKER: NETFLOW-PREVIEW-FINDINGS-FIX-01
 */

import * as fs from "fs";
import * as path from "path";
import {
  resolveRecoveryCenterPresentation,
  resolveEngineStatusPresentation,
  RECOVERY_CHECKLIST_THEME_COLORS,
  computeContrastRatio,
  doesPageDeclareDarkSchemeSupport,
  injectProxiedPageThemeStyle,
} from "../src/components/WebRenderer";
import { translations } from "../src/locales";
import { WebPageErrorInfo } from "../src/types";
import {
  resolveOmniboxInput,
  resolveNativeOmniboxInput,
} from "../src/services/nativeBrowserEngine";
import {
  createAndroidWebViewNetworkResilienceCoordinator,
  createFakeResilienceClock,
} from "../src/services/androidWebViewNetworkResilience";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=================================================================");
console.log("NETFLOW BROWSER V2 — PREVIEW FINDINGS VERIFICATION (FORM 9)");
console.log("Marker: NETFLOW-PREVIEW-FINDINGS-FIX-01");
console.log("=================================================================\n");

// ---------------------------------------------------------------------------
// PART A — HTTP 403/404/429/500/502/503/504 vs ERR_NAME_NOT_RESOLVED
// ---------------------------------------------------------------------------
console.log("1. Part A: Table-driven error code -> title, description, checklist...");

interface ErrorTableCase {
  errorCode: string;
  statusCode?: number;
  kind: WebPageErrorInfo["kind"];
  expectedTitleBn: string;
  expectedTitleEn: string;
  expectedDescBn: string;
  expectedDescEn: string;
  expectedChecklistFirstBn: string;
  expectedChecklistFirstEn: string;
  isHttpCode: boolean;
  isDnsCode: boolean;
}

const PART_A_TABLE: ErrorTableCase[] = [
  {
    errorCode: "HTTP_403_FORBIDDEN",
    statusCode: 403,
    kind: "http_client",
    expectedTitleBn: translations.bn.errorState.forbiddenTitle,
    expectedTitleEn: translations.en.errorState.forbiddenTitle,
    expectedDescBn: translations.bn.errorState.forbiddenDesc,
    expectedDescEn: translations.en.errorState.forbiddenDesc,
    expectedChecklistFirstBn: translations.bn.errorState.forbiddenDesc,
    expectedChecklistFirstEn: translations.en.errorState.forbiddenDesc,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "HTTP_404_NOT_FOUND",
    statusCode: 404,
    kind: "http_client",
    expectedTitleBn: translations.bn.errorState.notFoundTitle,
    expectedTitleEn: translations.en.errorState.notFoundTitle,
    expectedDescBn: translations.bn.errorState.notFoundDesc,
    expectedDescEn: translations.en.errorState.notFoundDesc,
    expectedChecklistFirstBn: translations.bn.errorState.checklistSpelling,
    expectedChecklistFirstEn: translations.en.errorState.checklistSpelling,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "HTTP_429_TOO_MANY_REQUESTS",
    statusCode: 429,
    kind: "http_client",
    expectedTitleBn: translations.bn.errorState.rateLimitedTitle,
    expectedTitleEn: translations.en.errorState.rateLimitedTitle,
    expectedDescBn: translations.bn.errorState.rateLimitedDesc,
    expectedDescEn: translations.en.errorState.rateLimitedDesc,
    expectedChecklistFirstBn: translations.bn.errorState.rateLimitedDesc,
    expectedChecklistFirstEn: translations.en.errorState.rateLimitedDesc,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "HTTP_500_INTERNAL_SERVER_ERROR",
    statusCode: 500,
    kind: "http_server",
    expectedTitleBn: translations.bn.errorState.serverErrorTitle,
    expectedTitleEn: translations.en.errorState.serverErrorTitle,
    expectedDescBn: translations.bn.errorState.serverErrorDesc,
    expectedDescEn: translations.en.errorState.serverErrorDesc,
    expectedChecklistFirstBn: translations.bn.errorState.serverErrorDesc,
    expectedChecklistFirstEn: translations.en.errorState.serverErrorDesc,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "HTTP_502_BAD_GATEWAY",
    statusCode: 502,
    kind: "http_server",
    expectedTitleBn: translations.bn.errorState.badGatewayTitle,
    expectedTitleEn: translations.en.errorState.badGatewayTitle,
    expectedDescBn: translations.bn.errorState.badGatewayDesc,
    expectedDescEn: translations.en.errorState.badGatewayDesc,
    expectedChecklistFirstBn: translations.bn.errorState.badGatewayDesc,
    expectedChecklistFirstEn: translations.en.errorState.badGatewayDesc,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "HTTP_503_SERVICE_UNAVAILABLE",
    statusCode: 503,
    kind: "http_server",
    expectedTitleBn: translations.bn.errorState.serviceUnavailableTitle,
    expectedTitleEn: translations.en.errorState.serviceUnavailableTitle,
    expectedDescBn: translations.bn.errorState.serviceUnavailableDesc,
    expectedDescEn: translations.en.errorState.serviceUnavailableDesc,
    expectedChecklistFirstBn: translations.bn.errorState.serviceUnavailableDesc,
    expectedChecklistFirstEn: translations.en.errorState.serviceUnavailableDesc,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "HTTP_504_GATEWAY_TIMEOUT",
    statusCode: 504,
    kind: "http_server",
    expectedTitleBn: translations.bn.errorState.gatewayTimeoutTitle,
    expectedTitleEn: translations.en.errorState.gatewayTimeoutTitle,
    expectedDescBn: translations.bn.errorState.gatewayTimeoutDesc,
    expectedDescEn: translations.en.errorState.gatewayTimeoutDesc,
    expectedChecklistFirstBn: translations.bn.errorState.gatewayTimeoutDesc,
    expectedChecklistFirstEn: translations.en.errorState.gatewayTimeoutDesc,
    isHttpCode: true,
    isDnsCode: false,
  },
  {
    errorCode: "ERR_NAME_NOT_RESOLVED",
    kind: "dns",
    expectedTitleBn: translations.bn.errorState.dnsTitle,
    expectedTitleEn: translations.en.errorState.dnsTitle,
    expectedDescBn: translations.bn.errorState.dnsDesc,
    expectedDescEn: translations.en.errorState.dnsDesc,
    expectedChecklistFirstBn: translations.bn.errorState.checklistConnection,
    expectedChecklistFirstEn: translations.en.errorState.checklistConnection,
    isHttpCode: false,
    isDnsCode: true,
  },
];

const CABLE_MODEM_WIFI_PATTERN = /cable|modem|router|wi-fi|ওয়াই-ফাই|নেটওয়ার্ক কেবল|মোবাইল ডেটা/i;

for (const row of PART_A_TABLE) {
  const resBn = resolveRecoveryCenterPresentation({
    error: `Error: ${row.errorCode}`,
    errorInfo: {
      errorCode: row.errorCode,
      statusCode: row.statusCode,
      kind: row.kind,
      failedUrl: "https://httpbin.org/status/test",
      timestamp: Date.now(),
    },
    url: "https://httpbin.org/status/test",
    lang: "bn",
    isNavigatorOffline: false,
    networkMedium: "4g",
  });

  const resEn = resolveRecoveryCenterPresentation({
    error: `Error: ${row.errorCode}`,
    errorInfo: {
      errorCode: row.errorCode,
      statusCode: row.statusCode,
      kind: row.kind,
      failedUrl: "https://httpbin.org/status/test",
      timestamp: Date.now(),
    },
    url: "https://httpbin.org/status/test",
    lang: "en",
    isNavigatorOffline: false,
    networkMedium: "4g",
  });

  assert(
    resBn.errorCode === row.errorCode &&
      resEn.errorCode === row.errorCode &&
      resBn.errorTitle === row.expectedTitleBn &&
      resEn.errorTitle === row.expectedTitleEn &&
      resBn.errorDescription === row.expectedDescBn &&
      resEn.errorDescription === row.expectedDescEn &&
      resBn.checklistItems[0] === row.expectedChecklistFirstBn &&
      resEn.checklistItems[0] === row.expectedChecklistFirstEn,
    `[Part A] ${row.errorCode} maps to its own distinct BN+EN title, description, and checklist`,
    JSON.stringify({ resBn, resEn })
  );

  if (row.isHttpCode) {
    const combinedHttpText = [
      resBn.errorTitle,
      resBn.errorDescription,
      ...resBn.checklistItems,
      resEn.errorTitle,
      resEn.errorDescription,
      ...resEn.checklistItems,
    ].join(" ");
    assert(
      !CABLE_MODEM_WIFI_PATTERN.test(combinedHttpText),
      `[Part A] ${row.errorCode} contains no cable/modem/Wi-Fi text for HTTP codes`,
      combinedHttpText
    );
  }

  const hasDnsTextBn =
    resBn.errorTitle === translations.bn.errorState.dnsTitle ||
    resBn.errorDescription === translations.bn.errorState.dnsDesc ||
    resBn.errorTitle.includes("সার্ভারের আইপি ঠিকানা পাওয়া যায়নি");
  const hasDnsTextEn =
    resEn.errorTitle === translations.en.errorState.dnsTitle ||
    resEn.errorDescription === translations.en.errorState.dnsDesc;

  assert(
    hasDnsTextBn === row.isDnsCode &&
      hasDnsTextEn === row.isDnsCode &&
      resBn.isDns === row.isDnsCode &&
      resEn.isDns === row.isDnsCode,
    `[Part A] ${row.errorCode}: DNS text appears only for the DNS code (expected=${row.isDnsCode})`,
    JSON.stringify({ hasDnsTextBn, hasDnsTextEn, isDnsBn: resBn.isDns, isDnsEn: resEn.isDns })
  );
}

// ---------------------------------------------------------------------------
// PART B — Blocked redirects and unsafe targets produce NETFLOW_REDIRECT_BLOCKED
// or NETFLOW_SSRF_BLOCKED, kind 'security', friendly BN+EN text, no cable/modem/Wi-Fi
// checklist, and raw internal reason strings kept only in collapsed technicalDetails
// ---------------------------------------------------------------------------
console.log("\n2. Part B: Redirect & SSRF blocks (kind='security', no raw internal reason in main text)...");

const rawRedirectErr =
  "Redirect blocked: Blocked unsafe redirect target: DANGEROUS_SCHEME (https://example.com/callback?token=secret123)";
const redirectPresBn = resolveRecoveryCenterPresentation({
  error: rawRedirectErr,
  errorInfo: {
    errorCode: "NETFLOW_REDIRECT_BLOCKED",
    kind: "security",
    failedUrl: "https://example.com/login",
    timestamp: Date.now(),
    technicalDetails:
      "Redirect blocked: Blocked unsafe redirect target: DANGEROUS_SCHEME (https://example.com/callback?token=[REDACTED])",
  },
  url: "https://example.com/login?token=secret123",
  lang: "bn",
  isNavigatorOffline: false,
  networkMedium: "4g",
});

const redirectPresEn = resolveRecoveryCenterPresentation({
  error: rawRedirectErr,
  lang: "en",
  url: "https://example.com/login?token=secret123",
  isNavigatorOffline: false,
  networkMedium: "4g",
});

const ssrfPresBn = resolveRecoveryCenterPresentation({
  error: "Blocked unsafe redirect target: PRIVATE_IPV4_TARGET",
  errorInfo: {
    errorCode: "NETFLOW_SSRF_BLOCKED",
    kind: "security",
    failedUrl: "http://127.0.0.1/admin",
    timestamp: Date.now(),
  },
  url: "http://127.0.0.1/admin",
  lang: "bn",
  isNavigatorOffline: false,
  networkMedium: "4g",
});

const ssrfPresEn = resolveRecoveryCenterPresentation({
  error: "Blocked unsafe redirect target: PRIVATE_IPV4_TARGET",
  errorInfo: {
    errorCode: "NETFLOW_SSRF_BLOCKED",
    kind: "security",
    failedUrl: "http://127.0.0.1/admin",
    timestamp: Date.now(),
  },
  url: "http://127.0.0.1/admin",
  lang: "en",
  isNavigatorOffline: false,
  networkMedium: "4g",
});

assert(
  redirectPresBn.errorCode === "NETFLOW_REDIRECT_BLOCKED" &&
    redirectPresEn.errorCode === "NETFLOW_REDIRECT_BLOCKED" &&
    redirectPresBn.effectiveKind === "security" &&
    redirectPresEn.effectiveKind === "security" &&
    ssrfPresBn.errorCode === "NETFLOW_SSRF_BLOCKED" &&
    ssrfPresEn.errorCode === "NETFLOW_SSRF_BLOCKED" &&
    ssrfPresBn.effectiveKind === "security" &&
    ssrfPresEn.effectiveKind === "security",
  "[Part B] Blocked redirects and unsafe targets resolve to NETFLOW_REDIRECT_BLOCKED / NETFLOW_SSRF_BLOCKED with kind 'security'",
  JSON.stringify({ redirectPresBn, redirectPresEn, ssrfPresBn, ssrfPresEn })
);

const mainRedirectTextCombined = [
  redirectPresBn.errorTitle,
  redirectPresBn.errorDescription,
  ...redirectPresBn.checklistItems,
  redirectPresEn.errorTitle,
  redirectPresEn.errorDescription,
  ...redirectPresEn.checklistItems,
  ssrfPresBn.errorTitle,
  ssrfPresBn.errorDescription,
  ...ssrfPresBn.checklistItems,
  ssrfPresEn.errorTitle,
  ssrfPresEn.errorDescription,
  ...ssrfPresEn.checklistItems,
].join(" ");

assert(
  !mainRedirectTextCombined.includes("DANGEROUS_SCHEME") &&
    !mainRedirectTextCombined.includes("PRIVATE_IPV4_TARGET") &&
    !CABLE_MODEM_WIFI_PATTERN.test(mainRedirectTextCombined),
  "[Part B] Friendly BN+EN main text & checklist contain NO raw internal reason strings (DANGEROUS_SCHEME etc.) and NO cable/modem/Wi-Fi checklist",
  mainRedirectTextCombined
);

assert(
  Boolean(redirectPresBn.technicalDetails?.includes("DANGEROUS_SCHEME")) &&
    Boolean(redirectPresEn.technicalDetails?.includes("DANGEROUS_SCHEME")) &&
    !Boolean(redirectPresBn.technicalDetails?.includes("secret123")) &&
    !Boolean(redirectPresEn.technicalDetails?.includes("secret123")) &&
    Boolean(redirectPresEn.technicalDetails?.includes("[REDACTED]")),
  "[Part B] Raw internal reason string (DANGEROUS_SCHEME) is preserved only in collapsed technicalDetails with sensitive URL params redacted",
  JSON.stringify({
    techBn: redirectPresBn.technicalDetails,
    techEn: redirectPresEn.technicalDetails,
  })
);

// ---------------------------------------------------------------------------
// PART C — Omnibox heuristics on the proxy & native paths (shared function, >=30 cases)
// ---------------------------------------------------------------------------
console.log("\n3. Part C: Shared omnibox heuristics (32 table-driven cases)...");

assert(
  resolveOmniboxInput === resolveNativeOmniboxInput,
  "[Part C] resolveOmniboxInput and resolveNativeOmniboxInput are the exact same shared function"
);

interface OmniboxTestCase {
  input: string;
  expectedKind: "url" | "search" | "blocked";
  expectedUrlPrefix?: string;
  expectedErrorCode?: string;
}

const PART_C_OMNIBOX_CASES: OmniboxTestCase[] = [
  // Required explicit cases from prompt
  { input: "বাংলাদেশ আবহাওয়া খবর", expectedKind: "search" },
  { input: "ঢাকা সংবাদ", expectedKind: "search" },
  { input: "x.md", expectedKind: "url", expectedUrlPrefix: "https://x.md" },
  { input: "device_test_plan.md", expectedKind: "search" },
  { input: "DEVICE_TEST_PLAN.md", expectedKind: "search" },
  { input: "docs/CHROME_GAP.md", expectedKind: "search" },
  { input: "status/404", expectedKind: "search" },
  { input: "status", expectedKind: "search" },
  { input: "httpbin.org/status/404", expectedKind: "url", expectedUrlPrefix: "https://httpbin.org/status/404" },
  { input: "192.168.1.1", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "localhost", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "http://good.com@127.0.0.1", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  // Additional cases to exceed 30 total cases covering all rules
  { input: "example.com", expectedKind: "url", expectedUrlPrefix: "https://example.com" },
  { input: "example.com/path/to/page?x=1#top", expectedKind: "url", expectedUrlPrefix: "https://example.com/path/to/page?x=1#top" },
  { input: "sub.domain-name.org:8080/api", expectedKind: "url", expectedUrlPrefix: "https://sub.domain-name.org:8080/api" },
  { input: "https://developer.mozilla.org/en-US/", expectedKind: "url", expectedUrlPrefix: "https://developer.mozilla.org/en-US/" },
  { input: "http://example.org/plain", expectedKind: "url", expectedUrlPrefix: "http://example.org/plain" },
  { input: "how to bake sourdough bread", expectedKind: "search" },
  { input: "example.com with spaces", expectedKind: "search" },
  { input: "my_site.com", expectedKind: "search" },
  { input: "first_label.sub.example.com", expectedKind: "search" },
  { input: "README", expectedKind: "search" },
  { input: "src/App.tsx", expectedKind: "search" },
  { input: "example.123", expectedKind: "search" },
  { input: "example.a", expectedKind: "search" },
  { input: "example.abcdefghijklmnopqrstuvwxyz", expectedKind: "search" },
  { input: "localhost:3000/test", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "127.0.0.1:8080/admin", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "10.0.0.1/router", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "169.254.169.254/latest/meta-data/", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "[::1]:3000", expectedKind: "blocked", expectedErrorCode: "NETFLOW_SSRF_BLOCKED" },
  { input: "javascript:alert(1)", expectedKind: "blocked", expectedErrorCode: "ERR_UNKNOWN_URL_SCHEME" },
];

assert(
  PART_C_OMNIBOX_CASES.length >= 30,
  `[Part C] Table-driven omnibox test has at least 30 cases (count=${PART_C_OMNIBOX_CASES.length})`
);

for (const tc of PART_C_OMNIBOX_CASES) {
  const res = resolveOmniboxInput(tc.input, "google");
  const kindOk = res.kind === tc.expectedKind;
  const prefixOk = tc.expectedUrlPrefix
    ? res.resolvedUrl === tc.expectedUrlPrefix
    : tc.expectedKind === "search"
    ? res.resolvedUrl.startsWith("https://www.google.com/search?q=")
    : true;
  const codeOk = tc.expectedErrorCode ? res.errorCode === tc.expectedErrorCode : true;

  assert(
    kindOk && prefixOk && codeOk,
    `[Part C] Omnibox("${tc.input}") -> kind=${tc.expectedKind}${tc.expectedUrlPrefix ? ` (${tc.expectedUrlPrefix})` : ""}${tc.expectedErrorCode ? ` [${tc.expectedErrorCode}]` : ""}`,
    JSON.stringify(res)
  );
}

// ============================================================================
// PART D — False "Connection restored (Online)" Banner Guard
// ============================================================================
console.log("\n[PART D] Connection Restored Banner — Observed Offline->Online Transition Only:");

{
  const clock = createFakeResilienceClock(10_000);
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-d1",
    initialConnectivity: { online: true, validated: true, transport: "wifi" },
  });

  // 1. Ordinary page load while online -> never shows connectionRestoredBannerActive
  coord.pageStarted("tab-d1", "https://example.com");
  coord.pageFinished("tab-d1", "https://example.com");
  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_000);
  assert(
    coord.getTabState("tab-d1")?.connectionRestoredBannerActive === false,
    "PART D [ordinary page load]: connectionRestoredBannerActive is false"
  );

  // 2. HTTP 404, 503, and DNS error while online -> never shows connectionRestoredBannerActive
  for (const errCode of [
    "HTTP_404_NOT_FOUND",
    "HTTP_503_SERVICE_UNAVAILABLE",
    "ERR_NAME_NOT_RESOLVED",
  ]) {
    coord.pageStarted("tab-d1", "https://httpbin.org/status/404");
    coord.mainFrameError("tab-d1", errCode, {
      url: "https://httpbin.org/status/404",
      description: `Simulated ${errCode}`,
    });
    // Even if a redundant online event arrives while already online
    coord.connectivity({ online: true, validated: true, transport: "wifi" });
    clock.advanceBy(2_000);
    assert(
      coord.getTabState("tab-d1")?.connectionRestoredBannerActive === false,
      `PART D [${errCode} while online]: connectionRestoredBannerActive is false`
    );
  }

  // 3. Observed offline -> online transition while tab is in error/loading state -> shows banner
  coord.pageStarted("tab-d1", "https://example.com/article");
  coord.connectivity({ online: false, validated: false, transport: "offline" });
  clock.advanceBy(2_000);
  assert(
    coord.getTabState("tab-d1")?.connectionRestoredBannerActive === false,
    "PART D [while offline]: connectionRestoredBannerActive is false before online return"
  );

  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_000);
  assert(
    coord.getTabState("tab-d1")?.connectionRestoredBannerActive === true,
    "PART D [offline -> online while loading/error]: connectionRestoredBannerActive is true"
  );

  // 4. Dismissible -> dismissOnlineIndicator sets connectionRestoredBannerActive to false
  coord.dismissOnlineIndicator("tab-d1");
  assert(
    coord.getTabState("tab-d1")?.connectionRestoredBannerActive === false,
    "PART D [dismissible]: dismissOnlineIndicator sets connectionRestoredBannerActive to false"
  );

  // 5. Not repeated for the same transition -> duplicate online events do not re-trigger banner
  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_000);
  assert(
    coord.getTabState("tab-d1")?.connectionRestoredBannerActive === false,
    "PART D [not repeated for same transition]: duplicate online signal does not re-show banner"
  );
}

// ============================================================================
// PART E — Engine Label Honesty (Native Chromium vs Proxy Sandbox)
// ============================================================================
console.log("\n[PART E] Engine Label Honesty — Native Chromium vs Web Preview / Proxy Sandbox:");

{
  const proxyBnLoaded = resolveEngineStatusPresentation({
    isRealAndroidNativeEngineActive: false,
    isFrameLoading: false,
    javascriptBlocked: false,
    lang: "bn",
    tabTitle: "Example",
  });
  assert(
    proxyBnLoaded.engineKind === "web_preview_proxy_sandbox" &&
      proxyBnLoaded.statusLabel === "ফুল মোড • স্যান্ডবক্সে JavaScript" &&
      !proxyBnLoaded.statusLabel.includes("নেটিভ") &&
      !proxyBnLoaded.statusLabel.includes("ক্রোমিয়াম") &&
      !/native|chromium/i.test(proxyBnLoaded.iframeTitle),
    `PART E [proxy_sandbox BN loaded]: statusLabel="${proxyBnLoaded.statusLabel}"`
  );

  const proxyEnLoaded = resolveEngineStatusPresentation({
    isRealAndroidNativeEngineActive: false,
    isFrameLoading: false,
    javascriptBlocked: false,
    lang: "en",
    tabTitle: "Example",
  });
  assert(
    proxyEnLoaded.engineKind === "web_preview_proxy_sandbox" &&
      proxyEnLoaded.statusLabel === "Full Mode • Sandboxed JavaScript" &&
      !/native|chromium/i.test(proxyEnLoaded.statusLabel) &&
      !/native|chromium/i.test(proxyEnLoaded.iframeTitle),
    `PART E [proxy_sandbox EN loaded]: statusLabel="${proxyEnLoaded.statusLabel}"`
  );

  const proxyBnLoading = resolveEngineStatusPresentation({
    isRealAndroidNativeEngineActive: false,
    isFrameLoading: true,
    javascriptBlocked: false,
    lang: "bn",
  });
  assert(
    proxyBnLoading.statusLabel === "ফুল মোড • স্যান্ডবক্সে পেজ লোড হচ্ছে..." &&
      !proxyBnLoading.statusLabel.includes("নেটিভ") &&
      !proxyBnLoading.statusLabel.includes("ক্রোমিয়াম"),
    `PART E [proxy_sandbox BN loading]: statusLabel="${proxyBnLoading.statusLabel}"`
  );

  const nativeBnLoaded = resolveEngineStatusPresentation({
    isRealAndroidNativeEngineActive: true,
    isFrameLoading: false,
    javascriptBlocked: false,
    lang: "bn",
    tabTitle: "Example",
  });
  assert(
    nativeBnLoaded.engineKind === "native_android_webview" &&
      nativeBnLoaded.statusLabel === "নেটিভ ক্রোমিয়াম ইঞ্জিন • সক্রিয় জাভাস্ক্রিপ্ট",
    `PART E [native_android_webview BN loaded]: statusLabel="${nativeBnLoaded.statusLabel}"`
  );

  const nativeEnLoaded = resolveEngineStatusPresentation({
    isRealAndroidNativeEngineActive: true,
    isFrameLoading: false,
    javascriptBlocked: false,
    lang: "en",
    tabTitle: "Example",
  });
  assert(
    nativeEnLoaded.engineKind === "native_android_webview" &&
      nativeEnLoaded.statusLabel === "Native Chromium Engine • Active JavaScript",
    `PART E [native_android_webview EN loaded]: statusLabel="${nativeEnLoaded.statusLabel}"`
  );

  const startPageSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/StartPage.tsx"),
    "utf8"
  );
  assert(
    startPageSrc.includes("const hasRealAndroidBridge = detectAndroidWebViewEnvironment().isNativeAvailable") &&
      startPageSrc.includes("ওয়েব প্রিভিউ • প্রক্সি মোড") &&
      startPageSrc.includes("Web Preview • Proxy Mode"),
    "PART E [StartPage.tsx]: Native Android WebView badge is gated by detectAndroidWebViewEnvironment().isNativeAvailable"
  );

  const optimizerSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/DeviceOptimizerModal.tsx"),
    "utf8"
  );
  assert(
    optimizerSrc.includes("const isNativeBridgeActive = detectAndroidWebViewEnvironment().isNativeAvailable") &&
      optimizerSrc.includes("Web Preview & Proxy Engine") &&
      optimizerSrc.includes("Proxy Sandbox"),
    "PART E [DeviceOptimizerModal.tsx]: Chromium WebView claim is gated by detectAndroidWebViewEnvironment().isNativeAvailable"
  );
}

// ============================================================================
// PART F — Readability (Checklist Box Contrast & Proxied Page Theme Guard)
// ============================================================================
console.log("\n[PART F] Readability — Checklist Contrast Ratio & Proxied Page Style Injection:");

{
  // F.1: Checklist box WCAG 2.1 contrast ratio >= 4.5:1 in light and dark themes
  const lightHeadingContrast = computeContrastRatio(
    RECOVERY_CHECKLIST_THEME_COLORS.light.headingHex,
    RECOVERY_CHECKLIST_THEME_COLORS.light.backgroundHex
  );
  const lightItemContrast = computeContrastRatio(
    RECOVERY_CHECKLIST_THEME_COLORS.light.itemHex,
    RECOVERY_CHECKLIST_THEME_COLORS.light.backgroundHex
  );
  const darkHeadingContrast = computeContrastRatio(
    RECOVERY_CHECKLIST_THEME_COLORS.dark.headingHex,
    RECOVERY_CHECKLIST_THEME_COLORS.dark.backgroundHex
  );
  const darkItemContrast = computeContrastRatio(
    RECOVERY_CHECKLIST_THEME_COLORS.dark.itemHex,
    RECOVERY_CHECKLIST_THEME_COLORS.dark.backgroundHex
  );

  assert(
    lightHeadingContrast >= 4.5,
    `PART F.1 [light heading contrast]: ${lightHeadingContrast}:1 >= 4.5:1 (${RECOVERY_CHECKLIST_THEME_COLORS.light.headingHex} on ${RECOVERY_CHECKLIST_THEME_COLORS.light.backgroundHex})`
  );
  assert(
    lightItemContrast >= 4.5,
    `PART F.1 [light item contrast]: ${lightItemContrast}:1 >= 4.5:1 (${RECOVERY_CHECKLIST_THEME_COLORS.light.itemHex} on ${RECOVERY_CHECKLIST_THEME_COLORS.light.backgroundHex})`
  );
  assert(
    darkHeadingContrast >= 4.5,
    `PART F.1 [dark heading contrast]: ${darkHeadingContrast}:1 >= 4.5:1 (${RECOVERY_CHECKLIST_THEME_COLORS.dark.headingHex} on ${RECOVERY_CHECKLIST_THEME_COLORS.dark.backgroundHex})`
  );
  assert(
    darkItemContrast >= 4.5,
    `PART F.1 [dark item contrast]: ${darkItemContrast}:1 >= 4.5:1 (${RECOVERY_CHECKLIST_THEME_COLORS.dark.itemHex} on ${RECOVERY_CHECKLIST_THEME_COLORS.dark.backgroundHex})`
  );

  // F.2: Proxied page style injection — keep page light unless page declares dark scheme support
  const httpbinSampleHtml = `<!DOCTYPE html><html><head><title>httpbin.org</title><style>body { color: #3b4151; font-family: sans-serif; }</style></head><body><h1>httpbin.org</h1></body></html>`;
  const httpbinResult = injectProxiedPageThemeStyle(httpbinSampleHtml);
  assert(
    !doesPageDeclareDarkSchemeSupport(httpbinSampleHtml) &&
      httpbinResult.supportsDarkScheme === false &&
      httpbinResult.html.includes(":root { color-scheme: light; }") &&
      httpbinResult.html.includes(":where(html, body) { background-color: #ffffff; color: #111827; }") &&
      httpbinResult.html.includes("body { color: #3b4151; font-family: sans-serif; }") &&
      httpbinResult.surfaceThemeClass === "bg-white text-stone-900" &&
      !httpbinResult.surfaceThemeClass.includes("dark:bg-stone-900"),
    "PART F.2 [httpbin.org without dark scheme]: injects light scheme guard, keeps surface light (bg-white), and preserves page CSS"
  );

  const metaDarkHtml = `<!DOCTYPE html><html><head><meta name="color-scheme" content="light dark"><title>Dark Ready</title></head><body>Hello</body></html>`;
  const metaDarkResult = injectProxiedPageThemeStyle(metaDarkHtml);
  assert(
    doesPageDeclareDarkSchemeSupport(metaDarkHtml) &&
      metaDarkResult.supportsDarkScheme === true &&
      metaDarkResult.html.includes(":root { color-scheme: light dark; }") &&
      metaDarkResult.surfaceThemeClass.includes("dark:bg-stone-900"),
    "PART F.2 [page with <meta name='color-scheme' content='light dark'>]: detects dark support and allows dark surface"
  );

  const mediaDarkHtml = `<!DOCTYPE html><html><head><style>@media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }</style></head><body>Dark Media</body></html>`;
  const mediaDarkResult = injectProxiedPageThemeStyle(mediaDarkHtml);
  assert(
    doesPageDeclareDarkSchemeSupport(mediaDarkHtml) &&
      mediaDarkResult.supportsDarkScheme === true &&
      mediaDarkResult.html.includes(":root { color-scheme: light dark; }") &&
      !mediaDarkResult.html.includes("background-color: #ffffff"),
    "PART F.2 [page with @media (prefers-color-scheme: dark)]: detects dark support and does not force white canvas"
  );
}

console.log("\n=================================================================");
console.log(`FORM 9 SUMMARY: ${passed} passed, ${failed} failed`);
console.log("=================================================================");

if (failed > 0) {
  process.exit(1);
}
