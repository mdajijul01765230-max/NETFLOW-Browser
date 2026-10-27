/**
 * NETFLOW BROWSER V2 — FORM 3 OF 7 VERIFICATION SUITE
 * EXECUTION MARKER: NETFLOW-CHROME-LIKE-UX-01
 *
 * Verifies Parts A through G of Form 3 (Chrome-Like UX).
 */

import fs from "node:fs";
import path from "node:path";
import {
  createNativeBrowserEngine,
  resolveNativeOmniboxInput,
  SEARCH_ENGINES,
  SEARCH_ENGINE_STORAGE_KEY,
  loadPersistedSearchEngineId,
  savePersistedSearchEngineId,
  sanitizeContextMenuHttpUrl,
  getContextMenuAllowedActions,
  evaluateUrlSafety,
  normalizeHostForSafety,
  sanitizeFaviconDataUrl,
  MAX_FAVICON_DIMENSION_PX,
  MAX_FAVICON_BASE64_BYTES,
  resolveOmniboxSecurityState,
  parseChromiumMajorVersion,
  isOutdatedSystemWebView,
  MIN_SUPPORTED_CHROMIUM_MAJOR,
  NativeContextMenuRequestedContractEvent,
  NativeFaviconContractEvent,
  NativeSslErrorContractEvent,
  NativeEngineCapabilities,
  NativePermissionPromptRequest,
} from "../src/services/nativeBrowserEngine";
import { SitePrivacyOverride, WebPageErrorInfo } from "../src/types";
import { translations } from "../src/locales";
import {
  buildSessionSnapshotV2,
  validateAndVerifySnapshot,
} from "../src/services/sessionPersistence";

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
console.log("NETFLOW BROWSER V2 — CHROME-LIKE UX VERIFICATION (FORM 3 OF 7)");
console.log("Marker: NETFLOW-CHROME-LIKE-UX-01");
console.log("=================================================================\n");

// ---------------------------------------------------------------------------
// PART A — Omnibox/search on the native path
// ---------------------------------------------------------------------------
console.log("1. Part A: Omnibox/search on the native path...");

assert(
  Boolean(SEARCH_ENGINES.google) &&
    Boolean(SEARCH_ENGINES.duckduckgo) &&
    Boolean(SEARCH_ENGINES.bing) &&
    SEARCH_ENGINES.google.buildSearchUrl("netflow test") ===
      "https://www.google.com/search?q=netflow%20test" &&
    SEARCH_ENGINES.duckduckgo.buildSearchUrl("netflow test") ===
      "https://duckduckgo.com/?q=netflow%20test" &&
    SEARCH_ENGINES.bing.buildSearchUrl("netflow test") ===
      "https://www.bing.com/search?q=netflow%20test",
  "Engines Google (default), DuckDuckGo, and Bing build direct search URLs"
);

// Scheme-less domains -> URL
const domainOnly = resolveNativeOmniboxInput("example.com", "google");
assert(
  domainOnly.kind === "url" && domainOnly.resolvedUrl === "https://example.com",
  "Scheme-less domain (example.com) resolves to https://example.com",
  JSON.stringify(domainOnly)
);

const domainWithPath = resolveNativeOmniboxInput("example.com/path/to/page?x=1", "google");
assert(
  domainWithPath.kind === "url" &&
    domainWithPath.resolvedUrl === "https://example.com/path/to/page?x=1",
  "Scheme-less domain with path (example.com/path) resolves to https URL",
  JSON.stringify(domainWithPath)
);

// Explicit https/http URLs
const explicitHttps = resolveNativeOmniboxInput("https://developer.mozilla.org/en-US/", "google");
assert(
  explicitHttps.kind === "url" &&
    explicitHttps.resolvedUrl === "https://developer.mozilla.org/en-US/",
  "Explicit https URL resolves to URL",
  JSON.stringify(explicitHttps)
);

// Localhost / private IPs treated as blocked
const localhostBlocked = resolveNativeOmniboxInput("localhost:8080/admin", "google");
assert(
  localhostBlocked.kind === "blocked" && localhostBlocked.errorCode === "NETFLOW_SSRF_BLOCKED",
  "Scheme-less localhost is treated as blocked (NETFLOW_SSRF_BLOCKED)",
  JSON.stringify(localhostBlocked)
);

const loopbackBlocked = resolveNativeOmniboxInput("127.0.0.1/status", "google");
assert(
  loopbackBlocked.kind === "blocked" && loopbackBlocked.errorCode === "NETFLOW_SSRF_BLOCKED",
  "Loopback IP (127.0.0.1) is treated as blocked (NETFLOW_SSRF_BLOCKED)",
  JSON.stringify(loopbackBlocked)
);

const privateIpBlocked = resolveNativeOmniboxInput("192.168.1.1", "google");
assert(
  privateIpBlocked.kind === "blocked" && privateIpBlocked.errorCode === "NETFLOW_SSRF_BLOCKED",
  "Private IP (192.168.1.1) is treated as blocked (NETFLOW_SSRF_BLOCKED)",
  JSON.stringify(privateIpBlocked)
);

const rfc1918TenBlocked = resolveNativeOmniboxInput("http://10.0.0.1/router", "google");
assert(
  rfc1918TenBlocked.kind === "blocked" && rfc1918TenBlocked.errorCode === "NETFLOW_SSRF_BLOCKED",
  "Explicit http://10.0.0.1 is treated as blocked (NETFLOW_SSRF_BLOCKED)",
  JSON.stringify(rfc1918TenBlocked)
);

// Bengali / Unicode text -> search
const bengaliQuery = resolveNativeOmniboxInput("বাংলাদেশ আবহাওয়া খবর", "google");
assert(
  bengaliQuery.kind === "search" &&
    bengaliQuery.resolvedUrl.startsWith("https://www.google.com/search?q=") &&
    !bengaliQuery.resolvedUrl.includes("/api/browse"),
  "Bengali / Unicode text resolves directly to search engine URL (never /api/browse)",
  JSON.stringify(bengaliQuery)
);

const bengaliSingleWordWithDot = resolveNativeOmniboxInput("ঢাকা.বাংলা", "duckduckgo");
assert(
  bengaliSingleWordWithDot.kind === "search" &&
    bengaliSingleWordWithDot.resolvedUrl.startsWith("https://duckduckgo.com/?q="),
  "Bengali text with dot resolves to search engine URL on selected engine",
  JSON.stringify(bengaliSingleWordWithDot)
);

// Plain text query -> search on Google, DuckDuckGo, Bing
const plainSearchDd = resolveNativeOmniboxInput("how to bake sourdough", "duckduckgo");
assert(
  plainSearchDd.kind === "search" &&
    plainSearchDd.resolvedUrl === "https://duckduckgo.com/?q=how%20to%20bake%20sourdough",
  "Plain search text uses DuckDuckGo when selected",
  JSON.stringify(plainSearchDd)
);

const plainSearchBing = resolveNativeOmniboxInput("weather today", "bing");
assert(
  plainSearchBing.kind === "search" &&
    plainSearchBing.resolvedUrl === "https://www.bing.com/search?q=weather%20today",
  "Plain search text uses Bing when selected",
  JSON.stringify(plainSearchBing)
);

// Engine integration & storage test (store only the engine id)
const mockStorage = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mockStorage.set(k, v);
  },
  removeItem: (k: string) => {
    mockStorage.delete(k);
  },
  clear: () => mockStorage.clear(),
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() {
    return mockStorage.size;
  },
};

assert(
  loadPersistedSearchEngineId() === "google",
  "Default stored search engine id is 'google'"
);
savePersistedSearchEngineId("duckduckgo");
assert(
  loadPersistedSearchEngineId() === "duckduckgo" &&
    mockStorage.get(SEARCH_ENGINE_STORAGE_KEY) === "duckduckgo",
  "savePersistedSearchEngineId stores ONLY the engine id string ('duckduckgo')"
);

// Native engine loadUrl loads search engine URL directly into native WebView
const sentCommands: Array<{ action: string; payload: Record<string, unknown> }> = [];
const contextMenuEvents: NativeContextMenuRequestedContractEvent[] = [];
(globalThis as unknown as { window: Record<string, unknown> }).window =
  (globalThis as unknown as { window: Record<string, unknown> }).window || {};
(globalThis as unknown as { window: Record<string, unknown> }).window.NetflowNativeBridge = {
  isAvailable: () => true,
  getChromiumVersion: () => "124.0.6367.82",
  postMessage: (jsonStr: string) => {
    const parsed = JSON.parse(jsonStr);
    sentCommands.push({ action: parsed.action, payload: parsed });
  },
};

const faviconEvents: NativeFaviconContractEvent[] = [];
const titleEvents: Array<{ tabId: string; title: string }> = [];
const sslErrorEvents: NativeSslErrorContractEvent[] = [];
const pageErrorEvents: Array<{
  tabId: string;
  errorInfo: WebPageErrorInfo;
  userMessage: string;
}> = [];
const capabilityEvents: NativeEngineCapabilities[] = [];
const permissionAskPrompts: NativePermissionPromptRequest[] = [];
const siteOverridesMap: Record<string, SitePrivacyOverride> = {};

const engine = createNativeBrowserEngine({
  getSiteOverrides: () => siteOverridesMap,
  onCapabilitiesChanged: (caps) => {
    capabilityEvents.push(caps);
  },
  onPermissionAskPrompt: (prompt) => {
    permissionAskPrompts.push(prompt);
  },
  onContextMenuRequested: (ev) => {
    contextMenuEvents.push(ev);
  },
  onFavicon: (ev) => {
    faviconEvents.push(ev);
  },
  onTitleChanged: (tabId, title) => {
    titleEvents.push({ tabId, title });
  },
  onSslError: (ev) => {
    sslErrorEvents.push(ev);
  },
  onError: (tabId, errorInfo, userMessage) => {
    pageErrorEvents.push({ tabId, errorInfo, userMessage });
  },
});
engine.createOrUpdateTab("tab-part-a", { isPrivate: false });
engine.setSearchEngine("bing");

const searchLoadRes = engine.loadUrl("tab-part-a", "বাংলা নাটক ২০২৬");
const lastCmd = sentCommands[sentCommands.length - 1];
assert(
  searchLoadRes.dispatched === true &&
    searchLoadRes.kind === "search" &&
    lastCmd?.action === "LOAD_URL" &&
    typeof lastCmd.payload?.url === "string" &&
    (lastCmd.payload.url as string).startsWith("https://www.bing.com/search?q=") &&
    !(lastCmd.payload.url as string).includes("/api/browse"),
  "nativeBrowserEngine.loadUrl sends non-URL text directly to native WebView search URL (not /api/browse)",
  JSON.stringify({ searchLoadRes, lastCmd })
);

const blockedLoadRes = engine.loadUrl("tab-part-a", "localhost:3000");
assert(
  blockedLoadRes.dispatched === false &&
    Boolean(blockedLoadRes.reason?.includes("local or private network address")),
  "nativeBrowserEngine.loadUrl blocks scheme-less localhost on native path",
  JSON.stringify(blockedLoadRes)
);

// ---------------------------------------------------------------------------
// PART B — Link/image context menu
// ---------------------------------------------------------------------------
console.log("\n2. Part B: Link/image context menu...");

assert(
  sanitizeContextMenuHttpUrl("https://example.com/article?id=42") ===
    "https://example.com/article?id=42" &&
    sanitizeContextMenuHttpUrl("http://example.org/pic.png") ===
      "http://example.org/pic.png" &&
    sanitizeContextMenuHttpUrl("javascript:alert(1)") === undefined &&
    sanitizeContextMenuHttpUrl("file:///sdcard/secret.txt") === undefined &&
    sanitizeContextMenuHttpUrl("http://127.0.0.1/admin") === undefined,
  "sanitizeContextMenuHttpUrl allows http/https only and rejects javascript:, file:, and loopback URLs"
);

// Emit SRC_ANCHOR_TYPE
engine.handleNativeEngineEvent({
  eventType: "onContextMenuRequested",
  tabId: "tab-part-a",
  type: "SRC_ANCHOR_TYPE",
  linkUrl: "https://example.com/news/story",
});
assert(
  contextMenuEvents.length === 1 &&
    contextMenuEvents[0].type === "SRC_ANCHOR_TYPE" &&
    contextMenuEvents[0].linkUrl === "https://example.com/news/story" &&
    contextMenuEvents[0].imageUrl === undefined,
  "onContextMenuRequested handles SRC_ANCHOR_TYPE with http/https linkUrl",
  JSON.stringify(contextMenuEvents[0])
);

// Emit SRC_IMAGE_ANCHOR_TYPE
engine.handleNativeEngineEvent({
  eventType: "onContextMenuRequested",
  tabId: "tab-part-a",
  type: "SRC_IMAGE_ANCHOR_TYPE",
  linkUrl: "https://example.com/gallery",
  imageUrl: "https://cdn.example.com/photo.jpg",
});
assert(
  contextMenuEvents.length === 2 &&
    contextMenuEvents[1].type === "SRC_IMAGE_ANCHOR_TYPE" &&
    contextMenuEvents[1].linkUrl === "https://example.com/gallery" &&
    contextMenuEvents[1].imageUrl === "https://cdn.example.com/photo.jpg",
  "onContextMenuRequested handles SRC_IMAGE_ANCHOR_TYPE with both linkUrl and imageUrl",
  JSON.stringify(contextMenuEvents[1])
);

// Emit IMAGE_TYPE
engine.handleNativeEngineEvent({
  eventType: "onContextMenuRequested",
  tabId: "tab-part-a",
  type: "IMAGE_TYPE",
  imageUrl: "https://cdn.example.com/banner.webp",
});
assert(
  contextMenuEvents.length === 3 &&
    contextMenuEvents[2].type === "IMAGE_TYPE" &&
    contextMenuEvents[2].imageUrl === "https://cdn.example.com/banner.webp",
  "onContextMenuRequested handles IMAGE_TYPE with imageUrl",
  JSON.stringify(contextMenuEvents[2])
);

// Non-http/https URLs in onContextMenuRequested are ignored
engine.handleNativeEngineEvent({
  eventType: "onContextMenuRequested",
  tabId: "tab-part-a",
  type: "SRC_ANCHOR_TYPE",
  linkUrl: "javascript:void(0)",
});
assert(
  contextMenuEvents.length === 3,
  "onContextMenuRequested ignores non-http/https URLs (javascript:void(0))"
);

// Share link command (Android share sheet through the plugin)
const shareOk = engine.shareUrl("https://example.com/news/story", "Story Title");
const shareCmd = sentCommands[sentCommands.length - 1];
assert(
  shareOk === true &&
    shareCmd?.action === "shareUrl" &&
    shareCmd.payload?.url === "https://example.com/news/story",
  "engine.shareUrl dispatches shareUrl command for http/https URLs",
  JSON.stringify(shareCmd)
);
assert(
  engine.shareUrl("javascript:alert(1)") === false,
  "engine.shareUrl rejects non-http/https URLs"
);

// Download image command (through Form 2 flow)
const dlImgOk = engine.downloadImage("tab-part-a", "https://cdn.example.com/photo.jpg");
const dlImgCmd = sentCommands[sentCommands.length - 1];
assert(
  dlImgOk === true &&
    dlImgCmd?.action === "downloadImage" &&
    dlImgCmd.payload?.tabId === "tab-part-a" &&
    dlImgCmd.payload?.url === "https://cdn.example.com/photo.jpg",
  "engine.downloadImage dispatches downloadImage command to trigger Form 2 download flow",
  JSON.stringify(dlImgCmd)
);
assert(
  engine.downloadImage("tab-part-a", "data:image/png;base64,AAAA") === false,
  "engine.downloadImage rejects non-http/https image URLs"
);

// Form 8 Part A (F-03): Private tab context menu behavior under privateIsolation: false vs true
engine.createOrUpdateTab("tab-private-ctx", { isPrivate: true });
engine.handleNativeEngineEvent({
  eventType: "onCapabilities",
  lightMode: true,
  subresourceIntercept: true,
  privateIsolation: false,
  interactiveCallbacks: true,
});
engine.handleNativeEngineEvent({
  eventType: "onContextMenuRequested",
  tabId: "tab-private-ctx",
  type: "SRC_IMAGE_ANCHOR_TYPE",
  linkUrl: "https://example.com/private-link",
  imageUrl: "https://cdn.example.com/private-img.png",
});
assert(
  contextMenuEvents.length === 3,
  "onContextMenuRequested is ignored in private tabs when privateIsolation is NOT active (false)"
);

engine.handleNativeEngineEvent({
  eventType: "onCapabilities",
  lightMode: true,
  subresourceIntercept: true,
  privateIsolation: true,
  interactiveCallbacks: true,
});
engine.handleNativeEngineEvent({
  eventType: "onContextMenuRequested",
  tabId: "tab-private-ctx",
  type: "SRC_IMAGE_ANCHOR_TYPE",
  linkUrl: "https://example.com/private-link",
  imageUrl: "https://cdn.example.com/private-img.png",
});
const privCtxEv = contextMenuEvents[3];
const privAllowedActions = getContextMenuAllowedActions(privCtxEv);
const normalAllowedActions = getContextMenuAllowedActions(contextMenuEvents[1]);
assert(
  contextMenuEvents.length === 4 &&
    privCtxEv?.tabId === "tab-private-ctx" &&
    privCtxEv?.isPrivate === true &&
    privAllowedActions.join(",") === "open_private_tab,copy_link,share_link" &&
    !privAllowedActions.includes("download_image") &&
    !privAllowedActions.includes("open_new_tab") &&
    normalAllowedActions.includes("download_image") &&
    engine.downloadImage("tab-private-ctx", "https://cdn.example.com/private-img.png") === false,
  "Form 8 Part A (F-03): when native privateIsolation is ACTIVE, private tab allows link/image menu with ONLY open_private_tab, copy_link, share_link and NO download_image"
);

// ---------------------------------------------------------------------------
// PART C — Favicon + title
// ---------------------------------------------------------------------------
console.log("\n3. Part C: Favicon + title...");

const samplePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

assert(
  MAX_FAVICON_DIMENSION_PX === 48 && MAX_FAVICON_BASE64_BYTES === 8192,
  "MAX_FAVICON_DIMENSION_PX is 48 and MAX_FAVICON_BASE64_BYTES is 8192 (8 KB)"
);

assert(
  sanitizeFaviconDataUrl(samplePngBase64, 32, 32, "image/png") ===
    `data:image/png;base64,${samplePngBase64}` &&
    sanitizeFaviconDataUrl(samplePngBase64, 64, 64, "image/png") === undefined &&
    sanitizeFaviconDataUrl("A".repeat(8196), 32, 32, "image/png") === undefined &&
    sanitizeFaviconDataUrl(samplePngBase64, 32, 32, "image/jpeg") === undefined,
  "sanitizeFaviconDataUrl enforces <= 48px PNG and <= 8 KB base64 limits"
);

// Emit onFavicon for non-private tab
const currentTabState = engine.getTabState("tab-part-a");
engine.handleNativeEngineEvent({
  eventType: "onFavicon",
  tabId: "tab-part-a",
  epoch: currentTabState?.requestEpoch ?? 1,
  faviconBase64: samplePngBase64,
  width: 32,
  height: 32,
  mimeType: "image/png",
});

assert(
  faviconEvents.length === 1 &&
    faviconEvents[0].tabId === "tab-part-a" &&
    faviconEvents[0].dataUrl === `data:image/png;base64,${samplePngBase64}` &&
    engine.getTabFavicon("tab-part-a") === `data:image/png;base64,${samplePngBase64}`,
  "onFavicon stores favicon in memory per tab and triggers callback",
  JSON.stringify(faviconEvents[0])
);

// Emit onFavicon for private tab -> must be ignored and never stored
engine.createOrUpdateTab("tab-private-c", { isPrivate: true });
engine.handleNativeEngineEvent({
  eventType: "onFavicon",
  tabId: "tab-private-c",
  faviconBase64: samplePngBase64,
  width: 32,
  height: 32,
  mimeType: "image/png",
});

assert(
  faviconEvents.length === 1 && engine.getTabFavicon("tab-private-c") === undefined,
  "onFavicon is never stored or emitted for private tabs"
);

// Session persistence never persists favicon and rejects snapshots containing favicon fields
const snapshot = buildSessionSnapshotV2(
  [
    {
      id: "tab-part-a",
      url: "https://example.com",
      title: "Example Title",
      favicon: `data:image/png;base64,${samplePngBase64}`,
      isPrivate: false,
      isLoading: false,
      history: ["https://example.com"],
      historyIndex: 0,
      zoomLevel: 100,
      siteMode: "default",
      isReaderMode: false,
      isSuspended: false,
    },
  ],
  "tab-part-a"
);

const serializedSnapshot = JSON.stringify(snapshot);
const tamperedSnapshot = JSON.parse(serializedSnapshot);
if (tamperedSnapshot.tabs?.[0]) {
  tamperedSnapshot.tabs[0].favicon = `data:image/png;base64,${samplePngBase64}`;
}
assert(
  !serializedSnapshot.includes("favicon") &&
    !serializedSnapshot.includes(samplePngBase64) &&
    validateAndVerifySnapshot(snapshot) === true &&
    validateAndVerifySnapshot(tamperedSnapshot) === false,
  "Favicon is never persisted in session snapshots and tampered favicon fields are rejected"
);

// Emit onReceivedTitle updates tab title
engine.handleNativeEngineEvent({
  eventType: "onReceivedTitle",
  tabId: "tab-part-a",
  title: "Updated Native Title",
});
assert(
  titleEvents.length === 1 &&
    titleEvents[0].title === "Updated Native Title" &&
    engine.getTabState("tab-part-a")?.title === "Updated Native Title",
  "onReceivedTitle updates tab title in memory and triggers onTitleChanged"
);

// ---------------------------------------------------------------------------
// PART D — Security indicator and SSL errors
// ---------------------------------------------------------------------------
console.log("\n4. Part D: Security indicator and SSL errors...");

const httpsSec = resolveOmniboxSecurityState("https://example.com/secure", null);
const httpSec = resolveOmniboxSecurityState("http://example.com/plain", null);
assert(
  httpsSec.state === "secure" &&
    httpsSec.isHttps === true &&
    httpSec.state === "not_secure" &&
    httpSec.isHttp === true &&
    httpSec.labelEn === "Not secure" &&
    httpSec.labelBn.includes("নিরাপদ নয়"),
  "resolveOmniboxSecurityState returns 'secure' lock for https and 'Not secure' for http"
);

const errorCountBeforeSsl = pageErrorEvents.length;
engine.handleNativeEngineEvent({
  eventType: "onSslError",
  tabId: "tab-part-a",
  primaryError: 3, // SslError.SSL_UNTRUSTED
  host: "expired.badssl.com",
  failingUrl: "https://expired.badssl.com/",
});

const latestPageError = pageErrorEvents[pageErrorEvents.length - 1];
const sslSec = resolveOmniboxSecurityState(
  "https://expired.badssl.com/",
  latestPageError?.errorInfo
);

assert(
  sslErrorEvents.length === 1 &&
    sslErrorEvents[0].tabId === "tab-part-a" &&
    sslErrorEvents[0].primaryError === 3 &&
    sslErrorEvents[0].host === "expired.badssl.com",
  "onSslError emits {tabId, primaryError, host} to shell callback",
  JSON.stringify(sslErrorEvents[0])
);

assert(
  pageErrorEvents.length === errorCountBeforeSsl + 1 &&
    latestPageError?.errorInfo.kind === "ssl" &&
    latestPageError?.errorInfo.errorCode === "ERR_SSL_PROTOCOL_ERROR" &&
    latestPageError?.errorInfo.sslPrimaryError === 3 &&
    latestPageError?.errorInfo.sslHost === "expired.badssl.com" &&
    sslSec.state === "ssl_warning" &&
    sslSec.hasSslError === true,
  "onSslError transitions tab to Recovery Center error of kind 'ssl' and sets omnibox warning state",
  JSON.stringify({ latestPageError, sslSec })
);

// Verify Recovery Center kind="ssl" BN+EN copy and NO "proceed anyway" button in WebRenderer.tsx
const webRendererSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/WebRenderer.tsx"),
  "utf-8"
);
assert(
  Boolean(translations.en.sslErrorTitle) &&
    Boolean(translations.bn.sslErrorTitle) &&
    translations.en.sslErrorExplanation.toLowerCase().includes("certificate") &&
    translations.bn.sslErrorExplanation.includes("সার্টিফিকেট") &&
    webRendererSrc.includes('data-error-kind={isSslError ? "ssl"') &&
    webRendererSrc.includes('id="error-recovery-go-back-btn"') &&
    webRendererSrc.includes('id="error-recovery-go-home-btn"') &&
    !webRendererSrc.includes("handler.proceed"),
  "Recovery Center page of kind 'ssl' has BN+EN certificate explanation, Go back / Home buttons, and NO 'proceed anyway' action"
);

// ---------------------------------------------------------------------------
// PART E — Protected Media (DRM) Per-Site Permissions
// ---------------------------------------------------------------------------
console.log("\n5. Part E: Protected Media (DRM) per-site permissions...");

// 1. Default policy is 'block' when no siteOverride exists
engine.handleNativeEngineEvent({
  eventType: "onPermissionRequest",
  requestId: "perm-drm-default-block",
  tabId: "tab-part-a",
  origin: "https://stream.example.com",
  resources: ["protectedMedia"],
});
const drmBlockCmd = sentCommands[sentCommands.length - 1];
assert(
  drmBlockCmd?.action === "resolvePermission" &&
    drmBlockCmd.payload?.requestId === "perm-drm-default-block" &&
    Array.isArray(drmBlockCmd.payload?.grantedResources) &&
    (drmBlockCmd.payload.grantedResources as string[]).length === 0 &&
    permissionAskPrompts.length === 0,
  "protectedMedia defaults to 'block' when no siteOverride is set (denies immediately without prompt)",
  JSON.stringify(drmBlockCmd)
);

// 2. When siteOverride.protectedMedia === 'allow' on HTTPS, grants protectedMedia
siteOverridesMap["stream.example.com"] = {
  domain: "stream.example.com",
  createdAt: Date.now(),
  protectedMedia: "allow",
};
engine.handleNativeEngineEvent({
  eventType: "onPermissionRequest",
  requestId: "perm-drm-allow",
  tabId: "tab-part-a",
  origin: "https://stream.example.com",
  resources: ["protectedMedia"],
});
const drmAllowCmd = sentCommands[sentCommands.length - 1];
assert(
  drmAllowCmd?.action === "resolvePermission" &&
    drmAllowCmd.payload?.requestId === "perm-drm-allow" &&
    Array.isArray(drmAllowCmd.payload?.grantedResources) &&
    (drmAllowCmd.payload.grantedResources as string[]).includes("protectedMedia"),
  "protectedMedia is granted when siteOverride.protectedMedia === 'allow' on HTTPS",
  JSON.stringify(drmAllowCmd)
);

// 3. When siteOverride.protectedMedia === 'ask' on HTTPS, triggers onPermissionAskPrompt and resolves via resolvePermission
siteOverridesMap["stream.example.com"] = {
  domain: "stream.example.com",
  createdAt: Date.now(),
  protectedMedia: "ask",
};
engine.handleNativeEngineEvent({
  eventType: "onPermissionRequest",
  requestId: "perm-drm-ask",
  tabId: "tab-part-a",
  origin: "https://stream.example.com",
  resources: ["protectedMedia"],
});
assert(
  permissionAskPrompts.length === 1 &&
    permissionAskPrompts[0].requestId === "perm-drm-ask" &&
    permissionAskPrompts[0].askResources.includes("protectedMedia"),
  "protectedMedia triggers onPermissionAskPrompt when siteOverride.protectedMedia === 'ask'",
  JSON.stringify(permissionAskPrompts[0])
);

const resolvedDrmOk = engine.resolvePermission({
  requestId: "perm-drm-ask",
  grantedResources: ["protectedMedia"],
});
const drmAskResolvedCmd = sentCommands[sentCommands.length - 1];
assert(
  resolvedDrmOk === true &&
    drmAskResolvedCmd?.action === "resolvePermission" &&
    drmAskResolvedCmd.payload?.requestId === "perm-drm-ask" &&
    Array.isArray(drmAskResolvedCmd.payload?.grantedResources) &&
    (drmAskResolvedCmd.payload.grantedResources as string[]).includes("protectedMedia"),
  "engine.resolvePermission forwards granted ['protectedMedia'] to native bridge",
  JSON.stringify(drmAskResolvedCmd)
);

// 4. Verify UI & translations for Protected Media (BN+EN + NOT VERIFIED device support disclosure)
const siteSettingsSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/SiteSettingsModal.tsx"),
  "utf-8"
);
const cameraMicModalSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/CameraMicConsentModal.tsx"),
  "utf-8"
);
assert(
  Boolean(translations.en.protectedMediaPermission) &&
    Boolean(translations.bn.protectedMediaPermission) &&
    Boolean(translations.en.protectedMediaDeviceNote) &&
    Boolean(translations.bn.protectedMediaDeviceNote) &&
    siteSettingsSrc.includes('id="select-site-perm-protected-media"') &&
    siteSettingsSrc.includes('id="site-perm-protected-media-note"') &&
    cameraMicModalSrc.includes("protectedMedia") &&
    cameraMicModalSrc.includes('id="protected-media-device-note"'),
  "SiteSettingsModal and CameraMicConsentModal expose Protected Media (DRM) controls with BN+EN copy and NOT VERIFIED device support disclosure"
);

// ---------------------------------------------------------------------------
// PART F — Browser Menu (Share / Copy Link / Open External Browser) & System WebView (< 110) Banner
// ---------------------------------------------------------------------------
console.log("\n6. Part F: Browser menu & System WebView (< Chromium 110) banner...");

const extOk = engine.openExternalBrowser("https://example.com/external-target");
const extCmd = sentCommands[sentCommands.length - 1];
assert(
  extOk === true &&
    (extCmd?.action === "LAUNCH_EXTERNAL_BROWSER" || extCmd?.action === "openExternalBrowser") &&
    extCmd.payload?.url === "https://example.com/external-target" &&
    engine.openExternalBrowser("javascript:alert(1)") === false &&
    engine.openExternalBrowser("http://127.0.0.1/internal") === false,
  "engine.openExternalBrowser dispatches LAUNCH_EXTERNAL_BROWSER for safe http/https URLs and rejects unsafe/loopback URLs",
  JSON.stringify(extCmd)
);

assert(
  MIN_SUPPORTED_CHROMIUM_MAJOR === 110 &&
    parseChromiumMajorVersion("109.0.5414.117") === 109 &&
    parseChromiumMajorVersion("Chromium/124.0.6367.82") === 124 &&
    parseChromiumMajorVersion(95) === 95 &&
    parseChromiumMajorVersion("") === null &&
    isOutdatedSystemWebView("109.0.5414.117") === true &&
    isOutdatedSystemWebView(109) === true &&
    isOutdatedSystemWebView("110.0.5481.65") === false &&
    isOutdatedSystemWebView("124.0.6367.82") === false &&
    isOutdatedSystemWebView(null) === false,
  "parseChromiumMajorVersion and isOutdatedSystemWebView accurately detect System WebView < Chromium 110"
);

// Emit onCapabilities with outdated Chromium 108 -> sets isOutdatedWebView: true
engine.handleNativeEngineEvent({
  eventType: "onCapabilities",
  lightMode: true,
  subresourceIntercept: true,
  privateIsolation: false,
  interactiveCallbacks: true,
  chromiumVersion: "108.0.5359.128",
  chromiumMajorVersion: 108,
});
const outdatedCaps = engine.getCapabilities();
assert(
  outdatedCaps.chromiumVersion === "108.0.5359.128" &&
    outdatedCaps.chromiumMajorVersion === 108 &&
    outdatedCaps.isOutdatedWebView === true,
  "onCapabilities marks isOutdatedWebView=true when Chromium major version < 110 (e.g. 108)",
  JSON.stringify(outdatedCaps)
);

// Emit onCapabilities with modern Chromium 124 -> sets isOutdatedWebView: false
engine.handleNativeEngineEvent({
  eventType: "onCapabilities",
  lightMode: true,
  subresourceIntercept: true,
  privateIsolation: false,
  interactiveCallbacks: true,
  chromiumVersion: "124.0.6367.82",
  chromiumMajorVersion: 124,
});
const modernCaps = engine.getCapabilities();
assert(
  modernCaps.chromiumVersion === "124.0.6367.82" &&
    modernCaps.chromiumMajorVersion === 124 &&
    modernCaps.isOutdatedWebView === false,
  "onCapabilities marks isOutdatedWebView=false when Chromium major version >= 110 (e.g. 124)",
  JSON.stringify(modernCaps)
);

const browserHeaderSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/BrowserHeader.tsx"),
  "utf-8"
);
assert(
  browserHeaderSrc.includes('id="menu-share-page"') &&
    browserHeaderSrc.includes('id="menu-copy-link"') &&
    browserHeaderSrc.includes('id="menu-open-external-browser"') &&
    browserHeaderSrc.includes('id="outdated-webview-banner"') &&
    Boolean(translations.en.webviewOutdatedBanner) &&
    Boolean(translations.bn.webviewOutdatedBanner),
  "BrowserHeader exposes Share Page, Copy Link, Open in External Browser menu actions and non-blocking Outdated System WebView (< 110) banner"
);

// ---------------------------------------------------------------------------
// PART G (Form 8 Part B / F-07) — Table-Driven Main-Frame URL Safety (30 Cases)
// ---------------------------------------------------------------------------
console.log("\n7. Form 8 Part B (F-07): Table-driven URL safety normalization & SSRF checks (30 cases)...");

interface UrlSafetyTestCase {
  label: string;
  url: string;
  expectedSafe: boolean;
  expectedSsrf: boolean;
}

const URL_SAFETY_TABLE_CASES: UrlSafetyTestCase[] = [
  // 1-8: Decimal, hex, octal, and shortened IPv4 forms
  { label: "IPv4 dotted decimal loopback", url: "http://127.0.0.1/admin", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 32-bit decimal integer (2130706433)", url: "http://2130706433/secret", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 32-bit hex integer (0x7f000001)", url: "http://0x7f000001/status", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 dotted hex octets (0x7f.0x0.0x0.0x1)", url: "http://0x7f.0x0.0x0.0x1/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 dotted octal octets (0177.0.0.1)", url: "http://0177.0.0.1/config", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 single octal integer (017700000001)", url: "http://017700000001/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 2-part shortened loopback (127.1)", url: "http://127.1:8080/internal", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 3-part shortened loopback (127.0.1)", url: "http://127.0.1/", expectedSafe: false, expectedSsrf: true },
  // 9-12: 0.0.0.0 and RFC1918 shortened/hex forms
  { label: "IPv4 0.0.0.0 all-zeros", url: "http://0.0.0.0:3000/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 single zero (http://0/)", url: "http://0/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 2-part shortened RFC1918 (10.1)", url: "http://10.1/router", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4 3-part shortened RFC1918 (192.168.257)", url: "http://192.168.257/", expectedSafe: false, expectedSsrf: true },
  // 13-20: IPv6 loopback, unspecified, ULA fc00::/7, link-local fe80::/10, IPv4-mapped IPv6
  { label: "IPv6 compressed loopback [::1]", url: "http://[::1]:8080/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv6 expanded loopback [0:0:0:0:0:0:0:1]", url: "http://[0:0:0:0:0:0:0:1]/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv6 unspecified [::]", url: "http://[::]/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv6 ULA fc00::/7 ([fc00::1])", url: "http://[fc00::1]/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv6 ULA fd00::/8 ([fd12:3456:789a::1])", url: "http://[fd12:3456:789a::1]/api", expectedSafe: false, expectedSsrf: true },
  { label: "IPv6 link-local fe80::/10 ([fe80::1])", url: "http://[fe80::1]/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv6 link-local with zone ID ([fe80::1%25eth0])", url: "http://[fe80::1%25eth0]/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4-mapped IPv6 dotted ([::ffff:127.0.0.1])", url: "http://[::ffff:127.0.0.1]/", expectedSafe: false, expectedSsrf: true },
  { label: "IPv4-mapped IPv6 hex ([::ffff:7f00:1])", url: "http://[::ffff:7f00:1]/", expectedSafe: false, expectedSsrf: true },
  // 22-26: Cloud metadata hosts, trailing-dot, uppercase, userinfo tricks
  { label: "Cloud metadata IPv4 (169.254.169.254)", url: "http://169.254.169.254/latest/meta-data/", expectedSafe: false, expectedSsrf: true },
  { label: "Cloud metadata decimal IPv4 (2852039166)", url: "http://2852039166/latest/meta-data/", expectedSafe: false, expectedSsrf: true },
  { label: "Cloud metadata uppercase + trailing dot (METADATA.GOOGLE.INTERNAL.)", url: "http://METADATA.GOOGLE.INTERNAL./computeMetadata/v1/", expectedSafe: false, expectedSsrf: true },
  { label: "Uppercase + trailing dot localhost (LOCALHOST.)", url: "http://LOCALHOST.:3000/test", expectedSafe: false, expectedSsrf: true },
  { label: "Trailing dot loopback (127.0.0.1.)", url: "http://127.0.0.1./private", expectedSafe: false, expectedSsrf: true },
  { label: "Userinfo trick (http://good.com@127.0.0.1)", url: "http://good.com@127.0.0.1/admin", expectedSafe: false, expectedSsrf: true },
  { label: "Userinfo trick with port & IPv6 (http://good.com:443@[::1]:8080/)", url: "http://good.com:443@[::1]:8080/", expectedSafe: false, expectedSsrf: true },
  // 29-30: Valid public URLs
  { label: "Safe public HTTPS domain", url: "https://example.com/articles?id=1", expectedSafe: true, expectedSsrf: false },
  { label: "Safe public IPv4 literal (93.184.216.34)", url: "https://93.184.216.34/", expectedSafe: true, expectedSsrf: false },
];

let urlTableMismatches: string[] = [];
for (const tc of URL_SAFETY_TABLE_CASES) {
  const res = evaluateUrlSafety(tc.url);
  const omniboxRes = resolveNativeOmniboxInput(tc.url, "google");
  const omniboxMatches = tc.expectedSafe
    ? omniboxRes.kind === "url"
    : omniboxRes.kind === "blocked" && (!tc.expectedSsrf || omniboxRes.errorCode === "NETFLOW_SSRF_BLOCKED");
  if (
    res.isSafe !== tc.expectedSafe ||
    res.isSsrf !== tc.expectedSsrf ||
    !omniboxMatches
  ) {
    urlTableMismatches.push(
      `${tc.label} (${tc.url}): got safety=${JSON.stringify(res)}, omnibox=${JSON.stringify(omniboxRes)}`
    );
  }
}

assert(
  URL_SAFETY_TABLE_CASES.length >= 25 &&
    urlTableMismatches.length === 0 &&
    normalizeHostForSafety("LOCALHOST...") === "localhost",
  `Form 8 Part B (F-07): All ${URL_SAFETY_TABLE_CASES.length} table-driven URL safety & normalization cases pass`,
  urlTableMismatches.join("; ")
);

console.log("\n=================================================================");
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log("=================================================================");

if (failed > 0) {
  process.exit(1);
}
