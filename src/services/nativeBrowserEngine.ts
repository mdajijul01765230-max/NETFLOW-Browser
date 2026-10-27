/**
 * NETFLOW Browser V2 — Native Android System WebView / Chromium Core Browser Engine Controller
 *
 * Form: FORM-N2 — Native WebView Core Browser Engine Implementation
 *
 * Execution Path:
 *   NETFLOW UI Shell → Native Browser Engine → Android Chromium WebView (android.webkit.WebView) → Website
 *
 * Core Responsibilities:
 * 1. Primary Engine Selection:
 *    - In normal browsing (`browsingMode === "full"`), Android `android.webkit.WebView` (System Chromium)
 *      is the primary browser engine whenever the Native Android host runtime is available.
 *    - `/api/browse` is NEVER the primary engine for normal Android browsing; it serves strictly as
 *      the Low-Bandwidth / Data Saver / Text-Only / Reader fallback or non-Android web preview fallback.
 * 2. Per-Tab Native WebView Ownership & Lifecycle:
 *    - Tracks and commands isolated native `WebView` instances per `tabId` (`createOrUpdateTab`,
 *      `selectTab`, `closeTab`).
 * 3. WebViewClient & WebChromeClient Event Synchronization:
 *    - Handles `onPageStarted`, `onProgressChanged`, `onReceivedTitle`, `onPageCommitVisible`,
 *      `onPageFinished`, `onHistoryUpdated` (SPA `pushState`/`replaceState`), `onNavigationIntercepted`,
 *      `onReceivedError` (main-frame only), `onReceivedHttpError`, `onReceivedSslError`,
 *      `onRenderProcessGone`, `onCreateWindow` (user-gesture popup/new-tab boundary), `onCloseWindow`,
 *      `onEnterFullscreen` / `onExitFullscreen`, `onDownloadStart`, `onExternalAuthRequired`,
 *      and `onFindResultReceived`.
 * 4. Viewport Bounds & Modal/Overlay Visibility Synchronization:
 *    - Positions the native `WebView` container within the React content area and hides the native view
 *      whenever StartPage, Recovery Center error overlay, Reader/Data-Saver view, or UI modals are open.
 * 5. Security Invariants:
 *    - Zero privileged `@JavascriptInterface` on untrusted content `WebView`s; bridge exists strictly
 *      between the trusted NETFLOW UI Shell and `NetflowBrowserPlugin` / `NetflowWebViewEngine`.
 */

import { BrowsingMode, SearchEngineId, SiteMode, SitePrivacyOverride, WebPageErrorInfo } from "../types";
import { detectAndroidWebViewEnvironment } from "./androidWebViewFoundation";
import {
  isSafeWebViewNavigationTarget,
  mapAndroidWebViewErrorCodeToMessage,
} from "./androidWebViewIntegrationBoundary";
import { validatePopupWindowUrl } from "./androidWebViewPopupWindow";
import { isGoogleAuthOrOAuthUrl } from "./googleAuthFallbackPolicy";

export type BrowserExecutionEngine = "native_chromium_webview" | "proxy_fallback";

export const DEFAULT_SEARCH_ENGINE_ID: SearchEngineId = "google";
export const SEARCH_ENGINE_STORAGE_KEY = "netflow_search_engine_id";

export interface SearchEngineConfig {
  id: SearchEngineId;
  nameEn: string;
  nameBn: string;
  searchUrlTemplate: string;
  buildSearchUrl: (query: string) => string;
}

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngineConfig> = {
  google: {
    id: "google",
    nameEn: "Google",
    nameBn: "গুগল (Google)",
    searchUrlTemplate: "https://www.google.com/search?q=",
    buildSearchUrl: (query: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(String(query || "").trim())}`,
  },
  duckduckgo: {
    id: "duckduckgo",
    nameEn: "DuckDuckGo",
    nameBn: "ডাকডাকগো (DuckDuckGo)",
    searchUrlTemplate: "https://duckduckgo.com/?q=",
    buildSearchUrl: (query: string) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(String(query || "").trim())}`,
  },
  bing: {
    id: "bing",
    nameEn: "Bing",
    nameBn: "বিং (Bing)",
    searchUrlTemplate: "https://www.bing.com/search?q=",
    buildSearchUrl: (query: string) =>
      `https://www.bing.com/search?q=${encodeURIComponent(String(query || "").trim())}`,
  },
};

export interface NativeOmniboxResolution {
  kind: "url" | "search" | "blocked";
  resolvedUrl: string;
  engineId?: SearchEngineId;
  searchQuery?: string;
  errorCode?: string;
  reason?: string;
}

export const INTERACTIVE_REQUEST_TIMEOUT_MS = 30_000;

export type InteractivePermissionResource =
  | "camera"
  | "microphone"
  | "geolocation"
  | "protectedMedia"
  | "other";

export type GrantablePermissionResource =
  | "camera"
  | "microphone"
  | "geolocation"
  | "protectedMedia";

export const MIN_SUPPORTED_CHROMIUM_MAJOR = 110;

export interface NativeEngineCapabilities {
  lightMode: boolean;
  subresourceIntercept: boolean;
  privateIsolation: boolean;
  interactiveCallbacks: boolean;
  chromiumVersion?: string;
  chromiumMajorVersion?: number;
  isOutdatedWebView?: boolean;
}

export type NativeDownloadContractState =
  | "queued"
  | "running"
  | "waiting_network"
  | "paused"
  | "completed"
  | "failed";

export interface NativeDownloadRequestedContractEvent {
  type: "onDownloadRequested";
  tabId: string;
  requestId: string;
  /** Sanitized for display: origin + path only (query and fragment stripped) */
  url: string;
  mimeType: string;
  contentLength: number;
  suggestedFileName: string;
  isPrivate: false;
}

export interface NativeDownloadProgressContractEvent {
  type: "onDownloadProgress";
  downloadId: string;
  tabId?: string;
  requestId?: string;
  state: NativeDownloadContractState;
  bytes: number;
  total: number;
  reasonCode?: string;
  fileName?: string;
  mimeType?: string;
  url?: string;
}

export interface NativeDownloadCompletedContractEvent {
  type: "onDownloadCompleted";
  downloadId: string;
  tabId?: string;
  requestId?: string;
  fileName: string;
  mimeType: string;
  bytes?: number;
  total?: number;
  url?: string;
}

export interface NativeDownloadUnsupportedContractEvent {
  type: "onDownloadUnsupported";
  tabId: string;
  url: string;
  scheme: string;
  reasonCode: string;
  message: string;
}

export interface InteractiveContractClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (id: any) => void;
}

export interface SimulatedInteractiveClock extends InteractiveContractClock {
  advanceBy: (ms: number) => void;
  getPendingTimerCount: () => number;
}

export function createSimulatedInteractiveClock(initialNow = 1_760_000_000_000): SimulatedInteractiveClock {
  let currentNow = initialNow;
  let nextId = 1;
  const timers = new Map<number, { id: number; dueAt: number; fn: () => void }>();

  return {
    now: () => currentNow,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { id, dueAt: currentNow + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout: (id: any) => {
      if (typeof id === "number") {
        timers.delete(id);
      }
    },
    advanceBy: (ms: number) => {
      const targetNow = currentNow + Math.max(0, ms);
      while (true) {
        let earliest: { id: number; dueAt: number; fn: () => void } | null = null;
        for (const t of timers.values()) {
          if (t.dueAt <= targetNow && (!earliest || t.dueAt < earliest.dueAt || (t.dueAt === earliest.dueAt && t.id < earliest.id))) {
            earliest = t;
          }
        }
        if (!earliest) break;
        timers.delete(earliest.id);
        currentNow = earliest.dueAt;
        earliest.fn();
      }
      currentNow = targetNow;
    },
    getPendingTimerCount: () => timers.size,
  };
}

const SYSTEM_INTERACTIVE_CLOCK: InteractiveContractClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export interface NativeViewportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface NativeTabRuntimeState {
  tabId: string;
  isPrivate: boolean;
  currentUrl: string;
  title: string;
  progress: number;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  siteMode: SiteMode;
  zoomLevel: number;
  javascriptAllowed: boolean;
  popupsAllowed: boolean;
  lightMode?: boolean;
  lightModePolicy?: {
    blockNetworkImage: boolean;
    blockWebFonts: boolean;
    blockMediaPreload: boolean;
    blockThirdPartyTrackers: boolean;
    cacheMode: "LOAD_DEFAULT" | "LOAD_CACHE_ELSE_NETWORK" | "LOAD_NO_CACHE" | "LOAD_CACHE_ONLY";
    javaScriptEnabled: true;
  };
  requestEpoch: number;
  renderProcessGone: boolean;
  isFullscreen: boolean;
  findMatchesCount: number;
  findActiveOrdinal: number;
  subresourceErrorCount?: number;
  lastSubresourceSampleCode?: number | string;
  historyUrls: string[];
  historyIndex: number;
  faviconDataUrl?: string;
  sslError?: {
    primaryError: number;
    host: string;
    failingUrl?: string;
  };
}

export type NativeEngineEventType =
  | "onPageStarted"
  | "onPageCommitVisible"
  | "onPageFinished"
  | "onHistoryUpdated"
  | "onNavigationIntercepted"
  | "onProgressChanged"
  | "onReceivedTitle"
  | "onReceivedError"
  | "onReceivedHttpError"
  | "onReceivedSslError"
  | "onHttpAuthRequest"
  | "onHttpAuthRequested"
  | "onRenderProcessGone"
  | "onCreateWindow"
  | "onPopupBlocked"
  | "onCloseWindow"
  | "onEnterFullscreen"
  | "onExitFullscreen"
  | "onPermissionRequest"
  | "onPermissionRequested"
  | "onGeolocationPermissionRequest"
  | "onShowFileChooser"
  | "onFileChooserRequested"
  | "onJsDialog"
  | "onNetworkStateChanged"
  | "onSubresourceError"
  | "onCapabilities"
  | "onDownloadStart"
  | "onDownloadRequested"
  | "onDownloadProgress"
  | "onDownloadCompleted"
  | "onDownloadUnsupported"
  | "onContextMenuRequested"
  | "onFavicon"
  | "onSslError"
  | "onFindResultReceived"
  | "onExternalAuthRequired"
  | "onExternalIntentUrl"
  | "onTabSwitched"
  | "onTabClosed"
  | "onLoadStopped"
  | "onHistoryNavigation";

export type NativeContextMenuHitType =
  | "SRC_ANCHOR_TYPE"
  | "SRC_IMAGE_ANCHOR_TYPE"
  | "IMAGE_TYPE"
  | "link"
  | "image_link"
  | "image";

export interface NativeContextMenuRequestedContractEvent {
  type: NativeContextMenuHitType;
  tabId: string;
  isPrivate?: boolean;
  requestId?: string;
  epoch?: number;
  ts?: number;
  origin?: string;
  linkUrl?: string;
  imageUrl?: string;
}

export type ContextMenuActionId =
  | "open_new_tab"
  | "open_private_tab"
  | "copy_link"
  | "share_link"
  | "download_image";

/**
 * Returns the allowed context menu actions for a link/image long-press event:
 * - In private tabs (`isPrivate === true`, active profile isolation path):
 *   allows ONLY `open_private_tab`, `copy_link`, and `share_link` (never `open_new_tab` or `download_image`).
 * - In regular tabs (`isPrivate === false`):
 *   allows `open_new_tab`, `open_private_tab`, `copy_link`, `share_link`, and `download_image` (when `imageUrl` is present).
 */
export function getContextMenuAllowedActions(
  event: NativeContextMenuRequestedContractEvent | null | undefined,
  isPrivateOverride?: boolean
): ContextMenuActionId[] {
  if (!event) return [];
  const isPrivate = Boolean(isPrivateOverride ?? event.isPrivate);
  const hasEffectiveUrl = Boolean(event.linkUrl || event.imageUrl);
  const hasImageUrl = Boolean(event.imageUrl);
  if (!hasEffectiveUrl) return [];
  if (isPrivate) {
    return ["open_private_tab", "copy_link", "share_link"];
  }
  const actions: ContextMenuActionId[] = [
    "open_new_tab",
    "open_private_tab",
    "copy_link",
    "share_link",
  ];
  if (hasImageUrl) {
    actions.push("download_image");
  }
  return actions;
}

export const MAX_FAVICON_DIMENSION_PX = 48;
export const MAX_FAVICON_BASE64_BYTES = 8 * 1024;

export interface NativeFaviconContractEvent {
  type: "onFavicon";
  tabId: string;
  requestId?: string;
  epoch?: number;
  ts?: number;
  origin?: string;
  faviconBase64: string;
  dataUrl: string;
  width?: number;
  height?: number;
  mimeType?: "image/png";
}

export interface NativeSslErrorContractEvent {
  type: "onSslError";
  tabId: string;
  requestId?: string;
  epoch?: number;
  ts?: number;
  origin?: string;
  primaryError: number;
  host: string;
  failingUrl?: string;
}

export interface NativeEngineEventPayload {
  eventType: NativeEngineEventType | string;
  tabId?: string;
  requestId?: string;
  epoch?: number;
  ts?: number;
  isMainFrame?: boolean;
  openerTabId?: string;
  url?: string;
  targetUrl?: string;
  failingUrl?: string;
  title?: string;
  progress?: number;
  isLoading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isRedirect?: boolean;
  isReload?: boolean;
  hasGesture?: boolean;
  isUserGesture?: boolean;
  hasUserGesture?: boolean;
  acceptTypes?: string[];
  multiple?: boolean;
  capture?: boolean | string;
  isDialog?: boolean;
  isForMainFrame?: boolean;
  errorCode?: number;
  errorKind?: WebPageErrorInfo["kind"];
  statusCode?: number;
  reasonPhrase?: string;
  description?: string;
  reason?: string;
  requestEpoch?: number;
  renderProcessGone?: boolean;
  didCrash?: boolean;
  rendererPriorityAtExit?: number;
  userAgent?: string;
  contentDisposition?: string;
  mimeType?: string;
  contentLength?: number;
  isPrivate?: boolean;
  activeMatchOrdinal?: number;
  numberOfMatches?: number;
  isDoneCounting?: boolean;
  historyUrls?: string[];
  historyIndex?: number;
  host?: string;
  realm?: string;
  origin?: string;
  resources?: string[];
  type?: "alert" | "confirm" | "prompt" | "beforeunload" | NativeContextMenuHitType | string;
  dialogType?: "alert" | "confirm" | "prompt" | "beforeunload";
  message?: string;
  defaultValue?: string;
  timestamp?: number;
  validated?: boolean;
  metered?: boolean;
  transport?: string;
  downKbps?: number;
  upKbps?: number;
  count?: number;
  sampleCode?: number | string;
  lightMode?: boolean;
  subresourceIntercept?: boolean;
  privateIsolation?: boolean;
  interactiveCallbacks?: boolean;
  chromiumVersion?: string;
  webViewVersion?: string;
  chromiumMajorVersion?: number;
  capabilities?: Partial<NativeEngineCapabilities>;
  // Native Download Contract fields (NETFLOW-NATIVE-DOWNLOADS-01)
  downloadId?: string;
  suggestedFileName?: string;
  fileName?: string;
  state?: NativeDownloadContractState | string;
  bytes?: number;
  total?: number;
  reasonCode?: string;
  scheme?: string;
  // Context Menu fields (NETFLOW-CHROME-LIKE-UX-01 Part B)
  linkUrl?: string;
  imageUrl?: string;
  // Favicon fields (NETFLOW-CHROME-LIKE-UX-01 Part C)
  faviconBase64?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  // SSL Error fields (NETFLOW-CHROME-LIKE-UX-01 Part D)
  primaryError?: number;
  sslPrimaryError?: number;
}

export interface NativePermissionPromptRequest {
  requestId: string;
  tabId: string;
  epoch: number;
  ts: number;
  isMainFrame: boolean;
  origin: string;
  domain: string;
  askResources: GrantablePermissionResource[];
  preAllowedResources: GrantablePermissionResource[];
}

export interface NativeJsDialogContractEvent {
  requestId: string;
  tabId: string;
  epoch: number;
  ts: number;
  isMainFrame: boolean;
  origin: string;
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  defaultValue?: string;
}

export interface NativeHttpAuthContractEvent {
  requestId: string;
  tabId: string;
  epoch: number;
  ts: number;
  isMainFrame: boolean;
  origin: string;
  host: string;
  realm: string;
}

export interface NativeNetworkStateContractEvent {
  tabId: string;
  requestId?: string;
  epoch: number;
  ts: number;
  isMainFrame: boolean;
  origin: string;
  validated: boolean;
  metered: boolean;
  transport: string;
  downKbps: number;
  upKbps: number;
}

export interface NativeBrowserEngineCallbacks {
  clock?: InteractiveContractClock;
  getSiteOverrides?: () => Record<string, SitePrivacyOverride>;
  onPageStarted?: (tabId: string, url: string, state: NativeTabRuntimeState) => void;
  onPageCommitVisible?: (tabId: string, url: string, state: NativeTabRuntimeState) => void;
  onPageFinished?: (tabId: string, url: string, title: string, state: NativeTabRuntimeState) => void;
  onHistoryUpdated?: (
    tabId: string,
    url: string,
    title: string,
    isReload: boolean,
    state: NativeTabRuntimeState
  ) => void;
  onProgressChanged?: (tabId: string, progress: number, state: NativeTabRuntimeState) => void;
  onTitleChanged?: (tabId: string, title: string, state: NativeTabRuntimeState) => void;
  onError?: (
    tabId: string,
    errorInfo: WebPageErrorInfo,
    userMessage: string,
    state: NativeTabRuntimeState
  ) => void;
  onSubresourceError?: (
    tabId: string,
    failingUrl: string,
    errorCodeOrStatus: number | string,
    state: NativeTabRuntimeState,
    count?: number
  ) => void;
  onCreateWindow?: (openerTabId: string, targetUrl: string, isUserGesture: boolean) => void;
  onCloseWindow?: (tabId: string) => void;
  onDownloadStart?: (
    tabId: string,
    downloadInfo: {
      url: string;
      userAgent: string;
      contentDisposition: string;
      mimeType: string;
      contentLength: number;
    }
  ) => void;
  onExternalAuthRequired?: (tabId: string, targetUrl: string, reason: string) => void;
  onExternalIntentUrl?: (targetUrl: string) => void;
  onRenderProcessGone?: (tabId: string, didCrash: boolean, failingUrl: string) => void;
  onFullscreenChange?: (tabId: string, isFullscreen: boolean) => void;
  onFindResult?: (
    tabId: string,
    activeMatchOrdinal: number,
    numberOfMatches: number,
    isDoneCounting: boolean
  ) => void;
  // Interactive contract callbacks (NETFLOW-INTERACTIVE-CONTRACT-01)
  onPermissionAskPrompt?: (prompt: NativePermissionPromptRequest) => void;
  onJsDialogRequested?: (dialog: NativeJsDialogContractEvent) => void;
  onHttpAuthRequested?: (auth: NativeHttpAuthContractEvent) => void;
  onNetworkStateChanged?: (net: NativeNetworkStateContractEvent) => void;
  onCapabilitiesChanged?: (capabilities: NativeEngineCapabilities) => void;
  onInteractiveRequestCancelled?: (
    requestId: string,
    tabId: string,
    kind: "permission" | "fileChooser" | "jsDialog" | "httpAuth",
    reason: "timeout_30s" | "navigation" | "tab_closed" | "reload" | "stop_loading"
  ) => void;
  // Native Download Contract callbacks (NETFLOW-NATIVE-DOWNLOADS-01)
  onDownloadRequested?: (event: NativeDownloadRequestedContractEvent) => void;
  onDownloadProgress?: (event: NativeDownloadProgressContractEvent) => void;
  onDownloadCompleted?: (event: NativeDownloadCompletedContractEvent) => void;
  onDownloadUnsupported?: (event: NativeDownloadUnsupportedContractEvent) => void;
  // Chrome-Like UX callbacks (NETFLOW-CHROME-LIKE-UX-01)
  onContextMenuRequested?: (event: NativeContextMenuRequestedContractEvent) => void;
  onFavicon?: (event: NativeFaviconContractEvent, state: NativeTabRuntimeState) => void;
  onSslError?: (event: NativeSslErrorContractEvent, state: NativeTabRuntimeState) => void;
}

export interface NativeLoadUrlOptions {
  isPrivate?: boolean;
  siteMode?: SiteMode;
  zoomLevel?: number;
  javascriptAllowed?: boolean;
  popupsAllowed?: boolean;
  requestEpoch?: number;
  searchEngineId?: SearchEngineId;
}

export interface NativeBrowserEngine {
  isNativeEngineAvailable: () => boolean;
  shouldUseNativeWebView: (
    browsingMode: BrowsingMode,
    isPrivate?: boolean,
    privateIsolationSupported?: boolean
  ) => boolean;
  resolveExecutionEngine: (
    browsingMode: BrowsingMode,
    isPrivate?: boolean,
    privateIsolationSupported?: boolean
  ) => BrowserExecutionEngine;
  getChromiumEngineVersion: () => string;

  // Omnibox & Search Engine (NETFLOW-CHROME-LIKE-UX-01 Part A)
  getSearchEngine: () => SearchEngineId;
  setSearchEngine: (engineId: SearchEngineId) => SearchEngineId;
  resolveOmniboxInput: (rawInput: string, engineId?: SearchEngineId) => NativeOmniboxResolution;

  // Capabilities & Site Overrides
  getCapabilities: () => NativeEngineCapabilities;
  isInteractiveCallbacksSupported: () => boolean;
  isPrivateIsolationSupported: () => boolean;
  setSiteOverrides: (overrides: Record<string, SitePrivacyOverride>) => void;

  // Per-tab lifecycle
  createOrUpdateTab: (
    tabId: string,
    options?: {
      isPrivate?: boolean;
      siteMode?: SiteMode;
      zoomLevel?: number;
      javascriptAllowed?: boolean;
      popupsAllowed?: boolean;
    }
  ) => NativeTabRuntimeState;
  selectTab: (tabId: string, isPrivate?: boolean) => void;
  closeTab: (tabId: string) => void;
  getTabState: (tabId: string) => NativeTabRuntimeState | undefined;
  getTabFavicon: (tabId: string) => string | undefined;
  getAllTabStates: () => NativeTabRuntimeState[];
  getActiveTabId: () => string | null;

  // Navigation & execution
  loadUrl: (
    tabId: string,
    url: string,
    options?: NativeLoadUrlOptions
  ) => {
    dispatched: boolean;
    engine: BrowserExecutionEngine;
    resolvedUrl?: string;
    kind?: "url" | "search" | "blocked";
    reason?: string;
  };
  reload: (tabId: string) => boolean;
  stopLoading: (tabId: string) => void;
  goBack: (tabId: string) => boolean;
  goForward: (tabId: string) => boolean;
  canGoBack: (tabId: string) => boolean;
  canGoForward: (tabId: string) => boolean;

  // In-page features
  findInPage: (tabId: string, query: string) => void;
  findNext: (tabId: string, forward?: boolean) => void;
  clearFindMatches: (tabId: string) => void;
  setZoomLevel: (tabId: string, zoomLevel: number) => void;
  setSiteMode: (tabId: string, siteMode: SiteMode, reloadNow?: boolean) => void;
  setLightMode: (
    tabId: string,
    policy?:
      | boolean
      | {
          lightMode?: boolean;
          blockNetworkImage?: boolean;
          blockWebFonts?: boolean;
          blockMediaPreload?: boolean;
          blockThirdPartyTrackers?: boolean;
          cacheMode?: "LOAD_DEFAULT" | "LOAD_CACHE_ELSE_NETWORK" | "LOAD_NO_CACHE" | "LOAD_CACHE_ONLY";
        }
  ) => {
    supported: boolean;
    pendingNativeWork: boolean;
    tabId: string;
    lightMode: boolean;
    policy: NonNullable<NativeTabRuntimeState["lightModePolicy"]>;
  };
  setLightModePolicy: (
    tabId: string,
    lightMode: boolean,
    policy?: {
      blockNetworkImage?: boolean;
      blockWebFonts?: boolean;
      blockMediaPreload?: boolean;
      blockThirdPartyTrackers?: boolean;
      cacheMode?: "LOAD_DEFAULT" | "LOAD_CACHE_ELSE_NETWORK" | "LOAD_NO_CACHE" | "LOAD_CACHE_ONLY";
    }
  ) => NativeTabRuntimeState;

  // Interactive Contract Outbound Commands (shell -> native)
  resolvePermission: (payload: {
    requestId: string;
    grantedResources: GrantablePermissionResource[];
  }) => boolean;
  resolveFileChooser: (payload: { requestId: string; allow: boolean }) => boolean;
  resolveJsDialog: (payload: {
    requestId: string;
    confirmed: boolean;
    value?: string;
  }) => boolean;
  resolveHttpAuth: (payload: {
    requestId: string;
    proceed: boolean;
    username?: string;
    password?: string;
  }) => boolean;

  // Native Download Contract Outbound Commands (shell -> native)
  resolveDownload: (payload: {
    requestId: string;
    allow: boolean;
    fileName?: string;
  }) => boolean;
  cancelDownload: (payload: { downloadId: string }) => boolean;
  openDownload: (payload: { downloadId: string }) => boolean;
  deleteDownload: (payload: { downloadId: string }) => boolean;
  reconcileDownloads: (payload: { downloadIds: string[] }) => boolean;

  // Context Menu & Native Share / External Browser Commands (NETFLOW-CHROME-LIKE-UX-01)
  isAvailable: () => boolean;
  shareUrl: (
    urlOrPayload: string | { url: string; title?: string },
    title?: string
  ) => boolean;
  downloadImage: (
    tabIdOrPayload: string | { tabId: string; imageUrl?: string; url?: string },
    imageUrl?: string
  ) => boolean;
  openExternalBrowser: (urlOrPayload: string | { url: string }) => boolean;

  // Viewport & modal overlay coordination
  syncViewportBounds: (bounds: NativeViewportBounds) => void;
  setWebViewVisible: (visible: boolean) => void;
  getViewportBounds: () => NativeViewportBounds;

  // Privacy & data clearing
  clearBrowsingData: (options: {
    clearCache?: boolean;
    clearCookies?: boolean;
    clearStorage?: boolean;
    clearHistory?: boolean;
  }) => void;

  // Event processing & subscription
  handleNativeEngineEvent: (payload: NativeEngineEventPayload) => void;
  subscribe: (listener: (payload: NativeEngineEventPayload) => void) => () => void;
  destroy: () => void;
}

/**
 * Sanitizes a download URL for display so only `origin + pathname` are exposed
 * (stripping query parameters, tokens, and fragments).
 */
export function sanitizeDownloadDisplayUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return `${parsed.origin}${parsed.pathname || "/"}`;
    }
    if (protocol === "blob:" || protocol === "data:") {
      return `${protocol}//unsupported`;
    }
    return `${protocol}//`;
  } catch {
    const qIdx = trimmed.indexOf("?");
    const hIdx = trimmed.indexOf("#");
    let cut = trimmed.length;
    if (qIdx >= 0 && qIdx < cut) cut = qIdx;
    if (hIdx >= 0 && hIdx < cut) cut = hIdx;
    return trimmed.slice(0, cut);
  }
}

/**
 * Validates and sanitizes a URL for context menu / share / external browser actions:
 * strictly allows `http://` and `https://` only and blocks SSRF/local/unsafe targets.
 */
export function sanitizeContextMenuHttpUrl(rawUrl?: string | null): string | undefined {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed) || /\s/.test(trimmed)) {
    return undefined;
  }
  const safety = evaluateUrlSafety(trimmed);
  if (!safety.isSafe) {
    return undefined;
  }
  if (!isSafeWebViewNavigationTarget(trimmed).safe) {
    return undefined;
  }
  return trimmed;
}

/**
 * Validates and normalizes a PNG favicon payload (`<= 48px`, `<= 8 KB` base64).
 * Returns `"data:image/png;base64,<base64>"` when valid, or `undefined` when rejected.
 */
export function sanitizeFaviconDataUrl(
  rawInput?: string | null,
  width?: number,
  height?: number,
  mimeType?: string
): string | undefined {
  if (typeof width === "number" && (width <= 0 || width > MAX_FAVICON_DIMENSION_PX)) {
    return undefined;
  }
  if (typeof height === "number" && (height <= 0 || height > MAX_FAVICON_DIMENSION_PX)) {
    return undefined;
  }
  if (
    typeof mimeType === "string" &&
    mimeType.trim() !== "" &&
    mimeType.trim().toLowerCase() !== "image/png"
  ) {
    return undefined;
  }
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return undefined;
  let base64 = trimmed;
  if (/^data:/i.test(trimmed)) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i.exec(trimmed);
    if (!match) return undefined;
    base64 = match[1];
  } else {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
      return undefined;
    }
  }
  if (!base64 || base64.length > MAX_FAVICON_BASE64_BYTES) {
    return undefined;
  }
  return `data:image/png;base64,${base64}`;
}

export interface OmniboxSecurityIndicatorState {
  state: "secure" | "not_secure" | "ssl_warning" | "neutral";
  isHttps: boolean;
  isHttp: boolean;
  hasSslError: boolean;
  labelEn: string;
  labelBn: string;
}

/**
 * Resolves the Omnibox security indicator state:
 * - `"secure"` (lock icon) for `https://`
 * - `"not_secure"` ("Not secure" / "নিরাপদ নয়") for `http://`
 * - `"ssl_warning"` (warning state) when an SSL error occurred
 */
export function resolveOmniboxSecurityState(
  url?: string | null,
  errorInfo?: WebPageErrorInfo | null,
  sslError?: { primaryError: number; host: string } | null
): OmniboxSecurityIndicatorState {
  const hasSslError = Boolean(
    sslError ||
      errorInfo?.kind === "ssl" ||
      (typeof errorInfo?.errorCode === "string" &&
        (errorInfo.errorCode.includes("SSL") || errorInfo.errorCode.includes("CERT")))
  );
  if (hasSslError) {
    return {
      state: "ssl_warning",
      isHttps: false,
      isHttp: false,
      hasSslError: true,
      labelEn: "Certificate Warning (SSL Error)",
      labelBn: "সার্টিফিকেট সতর্কতা (SSL Error)",
    };
  }
  const trimmed = String(url || "").trim().toLowerCase();
  if (!trimmed || trimmed === "about:blank") {
    return {
      state: "neutral",
      isHttps: true,
      isHttp: false,
      hasSslError: false,
      labelEn: "Secure",
      labelBn: "নিরাপদ",
    };
  }
  if (trimmed.startsWith("http://")) {
    return {
      state: "not_secure",
      isHttps: false,
      isHttp: true,
      hasSslError: false,
      labelEn: "Not secure",
      labelBn: "নিরাপদ নয় (Not secure)",
    };
  }
  if (trimmed.startsWith("https://")) {
    return {
      state: "secure",
      isHttps: true,
      isHttp: false,
      hasSslError: false,
      labelEn: "Secure connection (HTTPS)",
      labelBn: "নিরাপদ সংযোগ (HTTPS)",
    };
  }
  return {
    state: "neutral",
    isHttps: false,
    isHttp: false,
    hasSslError: false,
    labelEn: "Not secure",
    labelBn: "নিরাপদ নয় (Not secure)",
  };
}

const MIME_DEFAULT_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/gzip": ".gz",
  "application/x-tar": ".tar",
  "application/json": ".json",
  "application/xml": ".xml",
  "application/vnd.android.package-archive": ".apk",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/octet-stream": ".bin",
  "text/plain": ".txt",
  "text/html": ".html",
  "text/csv": ".csv",
  "text/markdown": ".md",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/**
 * Sanitizes a download file name:
 * - Strips path separators (`/`, `\`), traversal sequences (`..`), and control chars
 * - Adds an extension derived from `mimeType` if missing
 * - Enforces a maximum length of 120 characters while preserving the extension
 */
export function sanitizeDownloadFileName(rawFileName: string, mimeType?: string): string {
  let cleaned = String(rawFileName || "")
    // Replace path separators and control characters
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "_")
    // Remove path traversal dots
    .replace(/\.{2,}/g, ".")
    .trim()
    .replace(/^[.\s_]+|[.\s]+$/g, "");

  if (!cleaned) {
    cleaned = "download";
  }

  const normalizedMime = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  const lastDot = cleaned.lastIndexOf(".");
  const hasValidExt =
    lastDot > 0 &&
    lastDot < cleaned.length - 1 &&
    /^[a-zA-Z0-9]{1,10}$/.test(cleaned.slice(lastDot + 1));

  let ext = "";
  let base = cleaned;
  if (hasValidExt) {
    base = cleaned.slice(0, lastDot);
    ext = cleaned.slice(lastDot);
  } else if (normalizedMime && MIME_DEFAULT_EXTENSION_MAP[normalizedMime]) {
    ext = MIME_DEFAULT_EXTENSION_MAP[normalizedMime];
  } else if (normalizedMime.startsWith("image/")) {
    const sub = normalizedMime.slice("image/".length).replace(/[^a-z0-9]/g, "");
    if (sub) ext = `.${sub.slice(0, 6)}`;
  } else if (normalizedMime.startsWith("text/")) {
    ext = ".txt";
  }

  const maxTotalLen = 120;
  if ((base + ext).length > maxTotalLen) {
    const maxBaseLen = Math.max(1, maxTotalLen - ext.length);
    base = base.slice(0, maxBaseLen).replace(/[.\s_]+$/g, "") || "download";
  }

  return `${base}${ext}`;
}

export function isValidSearchEngineId(value: unknown): value is SearchEngineId {
  return value === "google" || value === "duckduckgo" || value === "bing";
}

/**
 * Loads the persisted search engine ID from storage (defaults to `"google"`).
 * Only the engine ID is ever read or stored.
 */
export function loadPersistedSearchEngineId(
  storage?: Pick<Storage, "getItem"> | null
): SearchEngineId {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof localStorage !== "undefined"
        ? localStorage
        : null;
    const raw = targetStorage?.getItem(SEARCH_ENGINE_STORAGE_KEY);
    const cleaned = String(raw || "").trim().toLowerCase();
    if (isValidSearchEngineId(cleaned)) {
      return cleaned;
    }
  } catch {}
  return DEFAULT_SEARCH_ENGINE_ID;
}

/**
 * Persists ONLY the search engine ID (`"google" | "duckduckgo" | "bing"`) to storage.
 * Never persists queries or URLs.
 */
export function savePersistedSearchEngineId(
  engineId: unknown,
  storage?: Pick<Storage, "setItem"> | null
): SearchEngineId {
  const safeId: SearchEngineId = isValidSearchEngineId(engineId)
    ? engineId
    : DEFAULT_SEARCH_ENGINE_ID;
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof localStorage !== "undefined"
        ? localStorage
        : null;
    targetStorage?.setItem(SEARCH_ENGINE_STORAGE_KEY, safeId);
  } catch {}
  return safeId;
}

/**
 * Builds the direct search engine URL for a search query.
 */
export function buildNativeSearchUrl(
  query: string,
  engineId: SearchEngineId = DEFAULT_SEARCH_ENGINE_ID
): string {
  const safeId: SearchEngineId = isValidSearchEngineId(engineId)
    ? engineId
    : DEFAULT_SEARCH_ENGINE_ID;
  return SEARCH_ENGINES[safeId].buildSearchUrl(query);
}

function percentDecodeHostSafely(input: string): string {
  if (!input || !input.includes("%")) return input || "";
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === "%" && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Normalizes a hostname or IP literal for safety validation (mirrors NetflowWebViewEngine.normalizeHostForSafety):
 * - Percent-decodes hex escapes
 * - Lowercases
 * - Strips surrounding `[` and `]`
 * - Strips IPv6 zone ID (`%...`)
 * - Strips all trailing dots
 */
export function normalizeHostForSafety(rawHost: string): string {
  if (!rawHost || typeof rawHost !== "string") return "";
  let h = percentDecodeHostSafely(rawHost.trim()).toLowerCase();
  if (h.startsWith("[") && h.endsWith("]") && h.length >= 2) {
    h = h.slice(1, -1);
  }
  const zoneIdx = h.indexOf("%");
  if (zoneIdx > 0) {
    h = h.slice(0, zoneIdx);
  }
  h = h.replace(/\.+$/, "");
  return h.trim();
}

function isValidPortString(portStr: string): boolean {
  if (!portStr || !/^\d{1,5}$/.test(portStr)) return false;
  const p = Number.parseInt(portStr, 10);
  return p >= 1 && p <= 65535;
}

function extractHostFromHostPort(hostPort: string): string | null {
  const trimmed = String(hostPort || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const closeIdx = trimmed.indexOf("]");
    if (closeIdx <= 1) return null;
    const inside = trimmed.slice(1, closeIdx);
    const rest = trimmed.slice(closeIdx + 1);
    if (rest) {
      if (!rest.startsWith(":")) return null;
      if (!isValidPortString(rest.slice(1))) return null;
    }
    return inside;
  }
  if (trimmed.includes("[") || trimmed.includes("]")) {
    return null;
  }
  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon >= 0) {
    if (firstColon !== lastColon) {
      return trimmed;
    }
    const portStr = trimmed.slice(firstColon + 1);
    if (!isValidPortString(portStr)) return null;
    return trimmed.slice(0, firstColon);
  }
  return trimmed;
}

function isNumericIpv4Attempt(host: string): boolean {
  if (!host) return false;
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return false;
  for (const p of parts) {
    if (!p) return true;
    if (p.startsWith("0x") || p.startsWith("0X")) {
      if (p.length <= 2 || !/^0x[0-9a-f]+$/i.test(p)) return false;
    } else if (!/^\d+$/.test(p)) {
      return false;
    }
  }
  return true;
}

/**
 * Parses decimal, hex (`0x...`), octal (`0...`), and shortened (1/2/3/4-part) IPv4 literals
 * into a 4-byte array `[b0, b1, b2, b3]`, or `null` if not a valid IPv4 literal.
 */
export function tryParseIpv4LiteralToBytes(rawHost: string): number[] | null {
  if (!rawHost || typeof rawHost !== "string") return null;
  const parts = rawHost.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const values: bigint[] = [];

  for (const part of parts) {
    if (!part) return null;
    let val: bigint;
    if (part.startsWith("0x") || part.startsWith("0X")) {
      if (part.length <= 2 || part.length > 10 || !/^0x[0-9a-f]+$/i.test(part)) {
        return null;
      }
      val = BigInt(part);
    } else if (part.startsWith("0") && part.length > 1) {
      if (part.length > 13 || !/^0[0-7]+$/.test(part)) {
        return null;
      }
      val = BigInt(`0o${part.slice(1)}`);
    } else {
      if (part.length > 10 || !/^\d+$/.test(part)) {
        return null;
      }
      val = BigInt(part);
    }
    if (val < 0n) return null;
    values.push(val);
  }

  let packed: bigint;
  if (parts.length === 1) {
    if (values[0] > 0xffffffffn) return null;
    packed = values[0];
  } else if (parts.length === 2) {
    if (values[0] > 0xffn || values[1] > 0xffffffn) return null;
    packed = (values[0] << 24n) | values[1];
  } else if (parts.length === 3) {
    if (values[0] > 0xffn || values[1] > 0xffn || values[2] > 0xffffn) return null;
    packed = (values[0] << 24n) | (values[1] << 16n) | values[2];
  } else {
    if (
      values[0] > 0xffn ||
      values[1] > 0xffn ||
      values[2] > 0xffn ||
      values[3] > 0xffn
    ) {
      return null;
    }
    packed = (values[0] << 24n) | (values[1] << 16n) | (values[2] << 8n) | values[3];
  }

  return [
    Number((packed >> 24n) & 0xffn),
    Number((packed >> 16n) & 0xffn),
    Number((packed >> 8n) & 0xffn),
    Number(packed & 0xffn),
  ];
}

/**
 * Parses an IPv6 literal (including `::` compression and IPv4-embedded tails like `::ffff:127.0.0.1`)
 * into a 16-byte array without performing any DNS lookups.
 */
export function tryParseIpv6LiteralToBytes(rawHost: string): number[] | null {
  if (!rawHost || typeof rawHost !== "string") return null;
  let h = rawHost.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]") && h.length >= 2) {
    h = h.slice(1, -1);
  }
  const zoneIdx = h.indexOf("%");
  if (zoneIdx > 0) {
    h = h.slice(0, zoneIdx);
  }
  if (!h.includes(":") || h.includes(":::")) return null;

  if (h.includes(".")) {
    const lastColon = h.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4Tail = h.slice(lastColon + 1);
    const v4 = tryParseIpv4LiteralToBytes(ipv4Tail);
    if (!v4) return null;
    const hi = ((v4[0] & 0xff) << 8) | (v4[1] & 0xff);
    const lo = ((v4[2] & 0xff) << 8) | (v4[3] & 0xff);
    h = `${h.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const doubleColon = h.indexOf("::");
  if (doubleColon >= 0 && h.indexOf("::", doubleColon + 2) >= 0) {
    return null;
  }

  let leftParts: string[];
  let rightParts: string[];
  if (doubleColon >= 0) {
    const leftStr = h.slice(0, doubleColon);
    const rightStr = h.slice(doubleColon + 2);
    if (
      leftStr.startsWith(":") ||
      leftStr.endsWith(":") ||
      rightStr.startsWith(":") ||
      rightStr.endsWith(":")
    ) {
      return null;
    }
    leftParts = leftStr ? leftStr.split(":") : [];
    rightParts = rightStr ? rightStr.split(":") : [];
    if (leftParts.length + rightParts.length > 7) return null;
  } else {
    if (h.startsWith(":") || h.endsWith(":")) return null;
    leftParts = h.split(":");
    rightParts = [];
    if (leftParts.length !== 8) return null;
  }

  const out = new Array<number>(16).fill(0);
  for (let i = 0; i < leftParts.length; i++) {
    const g = leftParts[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const val = Number.parseInt(g, 16);
    out[i * 2] = (val >> 8) & 0xff;
    out[i * 2 + 1] = val & 0xff;
  }
  const rightStartGroup = 8 - rightParts.length;
  for (let i = 0; i < rightParts.length; i++) {
    const g = rightParts[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const val = Number.parseInt(g, 16);
    const groupIdx = rightStartGroup + i;
    out[groupIdx * 2] = (val >> 8) & 0xff;
    out[groupIdx * 2 + 1] = val & 0xff;
  }
  return out;
}

export function isPrivateOrReservedIpv4Bytes(b: number[], offset = 0): boolean {
  if (!b || b.length < offset + 4) return false;
  const b0 = b[offset] & 0xff;
  const b1 = b[offset + 1] & 0xff;
  const b2 = b[offset + 2] & 0xff;
  const b3 = b[offset + 3] & 0xff;

  if (b0 === 0 || b0 === 10 || b0 === 127) return true;
  if (b0 === 100 && (b1 & 0xc0) === 64) return true;
  if (b0 === 169 && b1 === 254) return true;
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  if (b0 === 192 && (b1 === 168 || (b1 === 0 && (b2 === 0 || b2 === 2)))) return true;
  if (b0 === 198 && (b1 === 18 || b1 === 19 || (b1 === 51 && b2 === 100))) return true;
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;
  if ((b0 & 0xe0) === 224 || (b0 & 0xf0) === 240 || (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255)) {
    return true;
  }
  return false;
}

export function isPrivateOrReservedIpv6Bytes(raw: number[]): boolean {
  if (!raw || raw.length < 16) return false;
  let first15Zero = true;
  for (let i = 0; i < 15; i++) {
    if (raw[i] !== 0) {
      first15Zero = false;
      break;
    }
  }
  if (first15Zero && (raw[15] === 0 || raw[15] === 1)) return true;

  const b0 = raw[0] & 0xff;
  const b1 = raw[1] & 0xff;
  // ULA fc00::/7
  if ((b0 & 0xfe) === 0xfc) return true;
  // Link-local fe80::/10 and site-local fec0::/10
  if (b0 === 0xfe && ((b1 & 0xc0) === 0x80 || (b1 & 0xc0) === 0xc0)) return true;
  // Multicast ff00::/8
  if (b0 === 0xff) return true;
  // Documentation 2001:db8::/32
  if (b0 === 0x20 && b1 === 0x01 && (raw[2] & 0xff) === 0x0d && (raw[3] & 0xff) === 0xb8) {
    return true;
  }
  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
  let first10Zero = true;
  for (let i = 0; i < 10; i++) {
    if (raw[i] !== 0) {
      first10Zero = false;
      break;
    }
  }
  if (first10Zero) {
    const b10 = raw[10] & 0xff;
    const b11 = raw[11] & 0xff;
    if ((b10 === 0xff && b11 === 0xff) || (b10 === 0 && b11 === 0)) {
      return isPrivateOrReservedIpv4Bytes(raw, 12);
    }
  }
  // NAT64 64:ff9b::/96
  if (b0 === 0x00 && b1 === 0x64 && (raw[2] & 0xff) === 0xff && (raw[3] & 0xff) === 0x9b) {
    return isPrivateOrReservedIpv4Bytes(raw, 12);
  }
  return false;
}

/**
 * Checks whether a hostname or IP literal is localhost, loopback, private, link-local,
 * CGNAT, metadata, or internal (mirrors NetflowWebViewEngine.isPrivateOrReservedHostLiteralOrName).
 */
export function isPrivateOrLocalHostName(rawHost: string): boolean {
  const host = normalizeHostForSafety(rawHost);
  if (!host) return false;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "metadata.goog" ||
    host.endsWith(".google.internal") ||
    host === "instance-data" ||
    host === "instance-data.ec2.internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".localdomain") ||
    host.endsWith(".lan")
  ) {
    return true;
  }

  if (host.includes(":")) {
    const ipv6Bytes = tryParseIpv6LiteralToBytes(host);
    if (!ipv6Bytes) return true;
    return isPrivateOrReservedIpv6Bytes(ipv6Bytes);
  }

  const ipv4Bytes = tryParseIpv4LiteralToBytes(host);
  if (ipv4Bytes) {
    return isPrivateOrReservedIpv4Bytes(ipv4Bytes, 0);
  }
  if (isNumericIpv4Attempt(host)) {
    return true;
  }

  return false;
}

export interface UrlSafetyEvaluation {
  isSafe: boolean;
  isSsrf: boolean;
  normalizedHost: string;
  reason?: string;
}

/**
 * Mirrors NetflowWebViewEngine.evaluateUrlSafety in Java:
 * - Normalizes host (trailing dots, uppercase, percent-encoding, zone IDs)
 * - Detects userinfo tricks (`http://good.com@127.0.0.1`) and backslash authority tricks
 * - Detects decimal, hex, octal, and shortened IPv4 forms, `0.0.0.0`, IPv6 loopback,
 *   ULA `fc00::/7`, link-local `fe80::/10`, IPv4-mapped IPv6, and cloud metadata hosts
 */
export function evaluateUrlSafety(rawUrl: string): UrlSafetyEvaluation {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { isSafe: false, isSsrf: false, normalizedHost: "", reason: "Empty or invalid URL" };
  }
  const trimmed = rawUrl.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) {
      return {
        isSafe: false,
        isSsrf: false,
        normalizedHost: "",
        reason: "Whitespace or control characters not allowed in URL",
      };
    }
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("about:config") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:application") ||
    lower.startsWith("blob:null") ||
    lower.startsWith("vbscript:")
  ) {
    return { isSafe: false, isSsrf: false, normalizedHost: "", reason: "Blocked unsafe URL scheme" };
  }
  if (lower === "about:blank") {
    return { isSafe: true, isSsrf: false, normalizedHost: "" };
  }
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return {
      isSafe: false,
      isSsrf: false,
      normalizedHost: "",
      reason: "Unsupported non-web scheme",
    };
  }

  const schemeEnd = trimmed.indexOf("://");
  const afterScheme = trimmed.slice(schemeEnd + 3);
  if (!afterScheme || afterScheme.startsWith("/") || afterScheme.startsWith("\\")) {
    return {
      isSafe: false,
      isSsrf: false,
      normalizedHost: "",
      reason: "Missing or ambiguous authority in URL",
    };
  }

  let authEnd = afterScheme.length;
  for (let i = 0; i < afterScheme.length; i++) {
    const ch = afterScheme[i];
    if (ch === "/" || ch === "?" || ch === "#") {
      authEnd = i;
      break;
    }
  }
  const rawAuthority = afterScheme.slice(0, authEnd);
  if (!rawAuthority) {
    return { isSafe: false, isSsrf: false, normalizedHost: "", reason: "Missing authority in URL" };
  }

  const hasBackslashInAuthority = rawAuthority.includes("\\");
  const authorityNormalizedSep = rawAuthority.replace(/\\/g, "@");
  const lastAt = authorityNormalizedSep.lastIndexOf("@");
  const hostPort =
    lastAt >= 0 ? authorityNormalizedSep.slice(lastAt + 1) : authorityNormalizedSep;

  if (lastAt >= 0) {
    const userinfoSegments = authorityNormalizedSep.slice(0, lastAt).split("@");
    for (const seg of userinfoSegments) {
      const candidate = extractHostFromHostPort(seg);
      if (candidate) {
        const normCandidate = normalizeHostForSafety(candidate);
        if (normCandidate && isPrivateOrLocalHostName(normCandidate)) {
          return {
            isSafe: false,
            isSsrf: true,
            normalizedHost: normCandidate,
            reason: `Access to local or private network address (${normCandidate}) is blocked for security.`,
          };
        }
      }
    }
  }

  const extractedHost = extractHostFromHostPort(hostPort);
  if (!extractedHost) {
    return {
      isSafe: false,
      isSsrf: false,
      normalizedHost: "",
      reason: "Missing or malformed hostname in URL",
    };
  }
  const normalizedHost = normalizeHostForSafety(extractedHost);
  if (!normalizedHost) {
    return {
      isSafe: false,
      isSsrf: false,
      normalizedHost: "",
      reason: "Missing hostname in URL",
    };
  }

  if (isPrivateOrLocalHostName(normalizedHost)) {
    return {
      isSafe: false,
      isSsrf: true,
      normalizedHost,
      reason: `Access to local or private network address (${normalizedHost}) is blocked for security.`,
    };
  }

  if (hasBackslashInAuthority) {
    return {
      isSafe: false,
      isSsrf: false,
      normalizedHost,
      reason: "Blocked ambiguous backslash in URL authority",
    };
  }

  try {
    const parsed = new URL(trimmed);
    const urlHost = normalizeHostForSafety(parsed.hostname);
    if (!urlHost) {
      return {
        isSafe: false,
        isSsrf: false,
        normalizedHost,
        reason: "Malformed URL hostname",
      };
    }
    if (isPrivateOrLocalHostName(urlHost)) {
      return {
        isSafe: false,
        isSsrf: true,
        normalizedHost: urlHost,
        reason: `Access to local or private network address (${urlHost}) is blocked for security.`,
      };
    }
  } catch {
    return {
      isSafe: false,
      isSsrf: false,
      normalizedHost,
      reason: "Malformed target URL",
    };
  }

  return { isSafe: true, isSsrf: false, normalizedHost };
}

/**
 * Evaluates whether a URL points to a blocked internal/private SSRF network address.
 */
export function isBlockedSsrfHost(rawUrl: string): { blocked: boolean; reason?: string } {
  const res = evaluateUrlSafety(rawUrl);
  if (!res.isSafe) {
    return {
      blocked: true,
      reason: res.reason || "Blocked target URL",
    };
  }
  return { blocked: false };
}

/**
 * Resolves Omnibox input on the Native Android path (NETFLOW-CHROME-LIKE-UX-01 Part A & Form 8 Part B):
 * - Explicit `http://` or `https://` URLs: validated for safety and SSRF; blocked if localhost/private IP.
 * - Unsafe schemes (`javascript:`, `file:`, `data:`, `content:`, `intent:`, etc.): blocked.
 * - Scheme-less `localhost` or private/loopback/link-local IPs (`localhost`, `localhost:3000`, `127.0.0.1`, `192.168.1.1`, `10.0.0.1`, etc.): blocked (`NETFLOW_SSRF_BLOCKED`).
 * - Bengali / Unicode text (`[^\x00-\x7F]`): routed directly to the selected search engine URL.
 * - Scheme-less domains (`example.com`, `example.com/path`, `sub.example.org:8080/a`): normalized to `https://...`.
 * - Any other non-URL text: routed directly to the selected search engine URL.
 */
export function resolveNativeOmniboxInput(
  rawInput: string,
  engineId: SearchEngineId = DEFAULT_SEARCH_ENGINE_ID
): NativeOmniboxResolution {
  const safeEngineId: SearchEngineId = isValidSearchEngineId(engineId)
    ? engineId
    : DEFAULT_SEARCH_ENGINE_ID;
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) {
    return {
      kind: "blocked",
      resolvedUrl: "",
      errorCode: "ERR_INVALID_URL",
      reason: "Empty navigation input",
    };
  }

  if (trimmed.toLowerCase() === "about:blank") {
    return {
      kind: "url",
      resolvedUrl: "about:blank",
    };
  }

  // 1. Check explicit scheme (distinguishing `scheme:...` from `host:port...`)
  const explicitSchemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/s);
  if (explicitSchemeMatch && !/\s/.test(explicitSchemeMatch[1])) {
    const schemeLower = explicitSchemeMatch[1].toLowerCase();
    const rest = explicitSchemeMatch[2];
    const isHostPortPattern =
      schemeLower !== "http" &&
      schemeLower !== "https" &&
      schemeLower !== "javascript" &&
      schemeLower !== "vbscript" &&
      schemeLower !== "data" &&
      schemeLower !== "blob" &&
      schemeLower !== "file" &&
      schemeLower !== "content" &&
      schemeLower !== "intent" &&
      schemeLower !== "about" &&
      schemeLower !== "ftp" &&
      schemeLower !== "ws" &&
      schemeLower !== "wss" &&
      schemeLower !== "mailto" &&
      schemeLower !== "tel" &&
      schemeLower !== "sms" &&
      schemeLower !== "geo" &&
      schemeLower !== "market" &&
      schemeLower !== "chrome" &&
      schemeLower !== "view-source" &&
      /^\d{1,5}(?:[/?#].*)?$/.test(rest);

    if (!isHostPortPattern) {
      if (schemeLower === "http" || schemeLower === "https") {
        // Must start with http:// or https:// and contain no whitespace
        if (!/^https?:\/\//i.test(trimmed) || /\s/.test(trimmed)) {
          return {
            kind: "search",
            resolvedUrl: buildNativeSearchUrl(trimmed, safeEngineId),
            engineId: safeEngineId,
            searchQuery: trimmed,
          };
        }
        // Extract raw authority host before URL constructor punycodes Unicode hostnames
        const rawAfterSlashes = trimmed.replace(/^https?:\/\//i, "");
        const rawAuthority = rawAfterSlashes.split(/[/?#]/)[0] || "";
        if (/[^\x00-\x7F]/.test(rawAuthority)) {
          return {
            kind: "search",
            resolvedUrl: buildNativeSearchUrl(trimmed, safeEngineId),
            engineId: safeEngineId,
            searchQuery: trimmed,
          };
        }
        const safety = evaluateUrlSafety(trimmed);
        if (!safety.isSafe) {
          if (safety.isSsrf) {
            return {
              kind: "blocked",
              resolvedUrl: trimmed,
              errorCode: "NETFLOW_SSRF_BLOCKED",
              reason:
                safety.reason ||
                `Access to local or private network address (${safety.normalizedHost}) is blocked for security.`,
            };
          }
          return {
            kind: "blocked",
            resolvedUrl: trimmed,
            errorCode: "ERR_INVALID_URL",
            reason: safety.reason || "Malformed URL hostname",
          };
        }
        return {
          kind: "url",
          resolvedUrl: trimmed,
        };
      }

      // Known non-http/https scheme (javascript:, file:, content:, intent:, data:, etc.) -> blocked
      const schemeValidation = isSafeWebViewNavigationTarget(trimmed);
      return {
        kind: "blocked",
        resolvedUrl: trimmed,
        errorCode: "ERR_UNKNOWN_URL_SCHEME",
        reason: schemeValidation.reason || `Blocked unsafe URL scheme (${schemeLower}:)`,
      };
    }
  }

  // 2. Scheme-less localhost or private/loopback/link-local IP detection (with optional userinfo@, :port and /path)
  if (!/\s/.test(trimmed)) {
    const rawAuthority = trimmed.split(/[/?#]/)[0] || "";
    const authSep = rawAuthority.replace(/\\/g, "@");
    const lastAt = authSep.lastIndexOf("@");
    const authority = lastAt >= 0 ? authSep.slice(lastAt + 1) : authSep;
    let hostCandidate = extractHostFromHostPort(authority) ?? authority;
    if (authority.startsWith("[")) {
      const closeBracket = authority.indexOf("]");
      if (closeBracket > 0) {
        hostCandidate = authority.slice(1, closeBracket);
      }
    }

    if (isPrivateOrLocalHostName(hostCandidate)) {
      return {
        kind: "blocked",
        resolvedUrl: `http://${trimmed}`,
        errorCode: "NETFLOW_SSRF_BLOCKED",
        reason: `Access to local or private network address (${normalizeHostForSafety(hostCandidate)}) is blocked for security.`,
      };
    }
  }

  // 3. Bengali / Unicode text -> always search
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return {
      kind: "search",
      resolvedUrl: buildNativeSearchUrl(trimmed, safeEngineId),
      engineId: safeEngineId,
      searchQuery: trimmed,
    };
  }

  // 4. Scheme-less domain detection (example.com, example.com/path, sub.example.org:8080/path)
  if (!/\s/.test(trimmed)) {
    const authority = trimmed.split(/[/?#]/)[0] || "";
    let hostOnly = authority;
    let portValid = true;
    const hostPortMatch = authority.match(/^([^:]+):(\d{1,5})$/);
    if (hostPortMatch) {
      hostOnly = hostPortMatch[1];
      const portNum = Number(hostPortMatch[2]);
      portValid = portNum >= 1 && portNum <= 65535;
    } else if (authority.includes(":")) {
      portValid = false;
    }

    if (portValid && hostOnly.includes(".")) {
      const labels = hostOnly.split(".");
      const allLabelsValid =
        labels.length >= 2 &&
        labels.every((lbl) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(lbl));
      const tld = labels[labels.length - 1] || "";
      const isTldAlphaOrPunycode = /^(?:[a-zA-Z]{2,24}|xn--[a-zA-Z0-9]{2,20})$/.test(tld);
      const isPublicIpv4 =
        labels.length === 4 &&
        labels.every((lbl) => /^\d{1,3}$/.test(lbl) && Number(lbl) >= 0 && Number(lbl) <= 255) &&
        !isPrivateOrLocalHostName(hostOnly);

      if ((allLabelsValid && isTldAlphaOrPunycode) || isPublicIpv4) {
        const candidateUrl = `https://${trimmed}`;
        try {
          new URL(candidateUrl);
          return {
            kind: "url",
            resolvedUrl: candidateUrl,
          };
        } catch {}
      }
    }
  }

  // 5. Default: non-URL text goes directly to the selected search engine
  return {
    kind: "search",
    resolvedUrl: buildNativeSearchUrl(trimmed, safeEngineId),
    engineId: safeEngineId,
    searchQuery: trimmed,
  };
}

/**
 * Shared omnibox input resolver used by both the Native Android and Proxy paths
 * (Form 9 Part C: NETFLOW-PREVIEW-FINDINGS-FIX-01).
 */
export const resolveOmniboxInput = resolveNativeOmniboxInput;

/**
 * Parses the major version number from an Android System WebView / Chromium version string
 * (e.g. "124.0.6367.82", "Chromium/108.0.5359.128", or 108).
 * Returns null if no positive integer major version can be parsed.
 */
export function parseChromiumMajorVersion(
  rawVersion?: string | number | null
): number | null {
  if (typeof rawVersion === "number") {
    const intVal = Math.floor(rawVersion);
    return Number.isFinite(intVal) && intVal > 0 ? intVal : null;
  }
  if (typeof rawVersion !== "string") return null;
  const trimmed = rawVersion.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(?:Chromium\/|Chrome\/|^|\s)(\d{2,3})(?:\.\d+|\b)/i);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isFinite(major) && major > 0 ? major : null;
}

/**
 * Returns true if the given Chromium/WebView version has a valid major version below 110.
 */
export function isOutdatedSystemWebView(
  rawVersion?: string | number | null
): boolean {
  const major = parseChromiumMajorVersion(rawVersion);
  return major !== null && major > 0 && major < MIN_SUPPORTED_CHROMIUM_MAJOR;
}

/**
 * Determines the execution engine for a given browsing mode and runtime environment.
 * - On Native Android (isNativeAvailable === true), ALWAYS uses "native_chromium_webview"
 *   regardless of browsingMode to avoid ERR_CONNECTION_FAILED localhost proxy errors.
 * - In web preview environments (where native bridge is absent), routes to "proxy_fallback".
 */
export function resolveBrowserExecutionEngine(
  browsingMode: BrowsingMode,
  isNativeAvailable: boolean,
  isPrivate = false,
  privateIsolationSupported = false
): BrowserExecutionEngine {
  // Force native WebView on Android devices to avoid localhost proxy errors
  if (isNativeAvailable) {
    return "native_chromium_webview";
  }
  // Fallback for web preview
  if (isPrivate && !privateIsolationSupported) {
    return "proxy_fallback";
  }
  return "proxy_fallback";
}

/**
 * Creates the Native Browser Engine controller & bridge instance.
 */
/**
 * Detects whether the native Chromium-powered Android engine is available.
 */
export function isNativeEngineAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const env = detectAndroidWebViewEnvironment();
  if (env.isNativeAvailable) return true;
  const isAndroid = typeof navigator !== "undefined" && Boolean(navigator?.userAgent) && /Android/i.test(navigator.userAgent);
  const hasCapacitor = Boolean((window as any).Capacitor);
  const hasNetflowBridge = Boolean((window as any).NetflowNativeBridge);
  const isCapacitorScheme = (window as any).location?.protocol === "capacitor:";
  const isLocalhostOnAndroid = isAndroid && (window as any).location?.hostname === "localhost";
  if (isAndroid || hasCapacitor || hasNetflowBridge || isCapacitorScheme || isLocalhostOnAndroid) {
    return true;
  }
  return false;
}

export function createNativeBrowserEngine(
  callbacks: NativeBrowserEngineCallbacks = {}
): NativeBrowserEngine {
  const clock: InteractiveContractClock = callbacks.clock || SYSTEM_INTERACTIVE_CLOCK;
  const tabStates = new Map<string, NativeTabRuntimeState>();
  const eventListeners = new Set<(payload: NativeEngineEventPayload) => void>();
  let activeTabId: string | null = null;
  let currentSearchEngineId: SearchEngineId = loadPersistedSearchEngineId();
  let internalSiteOverrides: Record<string, SitePrivacyOverride> = {};
  let capabilities: NativeEngineCapabilities = {
    lightMode: false,
    subresourceIntercept: false,
    privateIsolation: false,
    interactiveCallbacks: false,
  };

  interface PendingInteractiveRequest {
    requestId: string;
    tabId: string;
    kind: "permission" | "fileChooser" | "jsDialog" | "httpAuth";
    epoch: number;
    origin: string;
    createdAt: number;
    timerId: any;
  }

  const pendingInteractiveRequests = new Map<string, PendingInteractiveRequest>();
  const resolvedRequestIds = new Set<string>();
  const seenRequestIds = new Set<string>();

  interface PendingDownloadConsentRequest {
    requestId: string;
    tabId: string;
    url: string;
    mimeType: string;
    contentLength: number;
    suggestedFileName: string;
    timerId?: any;
  }

  const pendingDownloadRequests = new Map<string, PendingDownloadConsentRequest>();
  const resolvedDownloadRequestIds = new Set<string>();

  let currentViewport: NativeViewportBounds = {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    visible: false,
  };

  const getCapabilities = (): NativeEngineCapabilities => ({ ...capabilities });
  const isInteractiveCallbacksSupported = (): boolean => Boolean(capabilities.interactiveCallbacks);
  const isPrivateIsolationSupported = (): boolean => Boolean(capabilities.privateIsolation);

  const setSiteOverrides = (overrides: Record<string, SitePrivacyOverride>): void => {
    internalSiteOverrides = { ...(overrides || {}) };
  };

  const getEffectiveSiteOverrides = (): Record<string, SitePrivacyOverride> => {
    if (callbacks.getSiteOverrides) {
      return callbacks.getSiteOverrides() || {};
    }
    return internalSiteOverrides;
  };

  const extractCleanDomain = (rawUrlOrOrigin: string): string => {
    try {
      const trimmed = (rawUrlOrOrigin || "").trim();
      if (!trimmed) return "";
      const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  const isStrictHttpsOrigin = (rawOrigin: string): boolean => {
    if (!rawOrigin || typeof rawOrigin !== "string") return false;
    const trimmed = rawOrigin.trim();
    if (!trimmed.toLowerCase().startsWith("https://")) return false;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol.toLowerCase() !== "https:") return false;
      if (isBlockedSsrfHost(trimmed).blocked) return false;
      return Boolean(parsed.hostname);
    } catch {
      return false;
    }
  };

  const normalizePermissionResource = (raw: string): InteractivePermissionResource => {
    const trimmed = String(raw || "").trim();
    const lower = trimmed.toLowerCase();
    if (lower === "camera" || trimmed === "android.webkit.resource.VIDEO_CAPTURE") {
      return "camera";
    }
    if (lower === "microphone" || trimmed === "android.webkit.resource.AUDIO_CAPTURE") {
      return "microphone";
    }
    if (lower === "geolocation") {
      return "geolocation";
    }
    if (
      lower === "protectedmedia" ||
      lower === "protected_media" ||
      trimmed === "android.webkit.resource.PROTECTED_MEDIA_ID"
    ) {
      return "protectedMedia";
    }
    return "other";
  };

  const isNativeEngineAvailable = (): boolean => {
    if (typeof window === "undefined") return false;

    const env = detectAndroidWebViewEnvironment();
    if (env.isNativeAvailable) return true;

    // Bulletproof Android detection
    const isAndroid = typeof navigator !== "undefined" && Boolean(navigator?.userAgent) && /Android/i.test(navigator.userAgent);
    const hasCapacitor = Boolean((window as any).Capacitor);
    const hasNetflowBridge = Boolean((window as any).NetflowNativeBridge);
    const isCapacitorScheme = (window as any).location?.protocol === "capacitor:";
    const isLocalhostOnAndroid = isAndroid && (window as any).location?.hostname === "localhost";

    if (isAndroid || hasCapacitor || hasNetflowBridge || isCapacitorScheme || isLocalhostOnAndroid) {
      return true;
    }
    return false;
  };

  const shouldUseNativeWebView = (
    browsingMode: BrowsingMode,
    isPrivate = false,
    privateIsolationSupported?: boolean
  ): boolean => {
    const isolationActive =
      typeof privateIsolationSupported === "boolean"
        ? privateIsolationSupported
        : Boolean(capabilities.privateIsolation);
    return (
      resolveBrowserExecutionEngine(
        browsingMode,
        isNativeEngineAvailable(),
        isPrivate,
        isolationActive
      ) === "native_chromium_webview"
    );
  };

  const resolveExecutionEngine = (
    browsingMode: BrowsingMode,
    isPrivate = false,
    privateIsolationSupported?: boolean
  ): BrowserExecutionEngine => {
    const isolationActive =
      typeof privateIsolationSupported === "boolean"
        ? privateIsolationSupported
        : Boolean(capabilities.privateIsolation);
    return resolveBrowserExecutionEngine(
      browsingMode,
      isNativeEngineAvailable(),
      isPrivate,
      isolationActive
    );
  };

  const getChromiumEngineVersion = (): string => {
    const env = detectAndroidWebViewEnvironment();
    return env.chromiumVersion || "Android System Chromium WebView";
  };

  const getSearchEngine = (): SearchEngineId => currentSearchEngineId;

  const setSearchEngine = (engineId: SearchEngineId): SearchEngineId => {
    currentSearchEngineId = savePersistedSearchEngineId(engineId);
    return currentSearchEngineId;
  };

  const resolveOmniboxInput = (
    rawInput: string,
    engineId?: SearchEngineId
  ): NativeOmniboxResolution => {
    return resolveNativeOmniboxInput(rawInput, engineId || currentSearchEngineId);
  };

  const sendNativeCommand = (action: string, payload: Record<string, any> = {}): void => {
    const env = detectAndroidWebViewEnvironment();
    if (env.isNativeAvailable) {
      env.postMessage(action, payload);
      return;
    }
    if (typeof window !== "undefined") {
      const win = window as any;
      const capPlugin = win?.Capacitor?.Plugins?.NetflowBrowserEngine;
      if (capPlugin && typeof capPlugin.dispatchAction === "function") {
        try {
          capPlugin.dispatchAction({ action, ...payload });
        } catch {}
      }
    }
  };

  const resolvePermission: NativeBrowserEngine["resolvePermission"] = ({
    requestId,
    grantedResources,
  }) => {
    if (!requestId || typeof requestId !== "string") return false;
    const pending = pendingInteractiveRequests.get(requestId);
    if (!pending || pending.kind !== "permission" || resolvedRequestIds.has(requestId)) {
      return false;
    }
    const tabSt = tabStates.get(pending.tabId);
    if (!tabSt || tabSt.requestEpoch !== pending.epoch) {
      clock.clearTimeout(pending.timerId);
      pendingInteractiveRequests.delete(requestId);
      resolvedRequestIds.add(requestId);
      return false;
    }

    clock.clearTimeout(pending.timerId);
    pendingInteractiveRequests.delete(requestId);
    resolvedRequestIds.add(requestId);

    const safeGranted = Array.isArray(grantedResources)
      ? grantedResources.filter(
          (r): r is GrantablePermissionResource =>
            r === "camera" ||
            r === "microphone" ||
            r === "geolocation" ||
            r === "protectedMedia"
        )
      : [];

    sendNativeCommand("resolvePermission", {
      requestId,
      grantedResources: safeGranted,
    });
    return true;
  };

  const resolveFileChooser: NativeBrowserEngine["resolveFileChooser"] = ({ requestId, allow }) => {
    if (!requestId || typeof requestId !== "string") return false;
    const pending = pendingInteractiveRequests.get(requestId);
    if (!pending || pending.kind !== "fileChooser" || resolvedRequestIds.has(requestId)) {
      return false;
    }
    const tabSt = tabStates.get(pending.tabId);
    if (!tabSt || tabSt.requestEpoch !== pending.epoch) {
      clock.clearTimeout(pending.timerId);
      pendingInteractiveRequests.delete(requestId);
      resolvedRequestIds.add(requestId);
      return false;
    }

    clock.clearTimeout(pending.timerId);
    pendingInteractiveRequests.delete(requestId);
    resolvedRequestIds.add(requestId);

    sendNativeCommand("resolveFileChooser", {
      requestId,
      allow: Boolean(allow),
    });
    return true;
  };

  const resolveJsDialog: NativeBrowserEngine["resolveJsDialog"] = ({
    requestId,
    confirmed,
    value,
  }) => {
    if (!requestId || typeof requestId !== "string") return false;
    const pending = pendingInteractiveRequests.get(requestId);
    if (!pending || pending.kind !== "jsDialog" || resolvedRequestIds.has(requestId)) {
      return false;
    }
    const tabSt = tabStates.get(pending.tabId);
    if (!tabSt || tabSt.requestEpoch !== pending.epoch) {
      clock.clearTimeout(pending.timerId);
      pendingInteractiveRequests.delete(requestId);
      resolvedRequestIds.add(requestId);
      return false;
    }

    clock.clearTimeout(pending.timerId);
    pendingInteractiveRequests.delete(requestId);
    resolvedRequestIds.add(requestId);

    const outPayload: Record<string, any> = {
      requestId,
      confirmed: Boolean(confirmed),
    };
    if (value !== undefined) {
      outPayload.value = String(value);
    }

    sendNativeCommand("resolveJsDialog", outPayload);
    return true;
  };

  const resolveHttpAuth: NativeBrowserEngine["resolveHttpAuth"] = ({
    requestId,
    proceed,
    username,
    password,
  }) => {
    if (!requestId || typeof requestId !== "string") return false;
    const pending = pendingInteractiveRequests.get(requestId);
    if (!pending || pending.kind !== "httpAuth" || resolvedRequestIds.has(requestId)) {
      return false;
    }
    const tabSt = tabStates.get(pending.tabId);
    if (!tabSt || tabSt.requestEpoch !== pending.epoch) {
      clock.clearTimeout(pending.timerId);
      pendingInteractiveRequests.delete(requestId);
      resolvedRequestIds.add(requestId);
      return false;
    }

    clock.clearTimeout(pending.timerId);
    pendingInteractiveRequests.delete(requestId);
    resolvedRequestIds.add(requestId);

    // Credentials travel in memory only, never logged or persisted
    if (proceed) {
      sendNativeCommand("resolveHttpAuth", {
        requestId,
        proceed: true,
        username: username ?? "",
        password: password ?? "",
      });
    } else {
      sendNativeCommand("resolveHttpAuth", {
        requestId,
        proceed: false,
      });
    }
    return true;
  };

  const resolveDownload: NativeBrowserEngine["resolveDownload"] = ({
    requestId,
    allow,
    fileName,
  }) => {
    if (!requestId || typeof requestId !== "string") return false;
    const pending = pendingDownloadRequests.get(requestId);
    if (!pending || resolvedDownloadRequestIds.has(requestId)) {
      return false;
    }
    if (pending.timerId !== undefined && pending.timerId !== null) {
      clock.clearTimeout(pending.timerId);
    }
    pendingDownloadRequests.delete(requestId);
    resolvedDownloadRequestIds.add(requestId);

    if (allow) {
      const safeFileName = sanitizeDownloadFileName(
        fileName || pending.suggestedFileName,
        pending.mimeType
      );
      sendNativeCommand("resolveDownload", {
        requestId,
        allow: true,
        fileName: safeFileName,
      });
    } else {
      sendNativeCommand("resolveDownload", {
        requestId,
        allow: false,
      });
    }
    return true;
  };

  const cancelDownload: NativeBrowserEngine["cancelDownload"] = ({ downloadId }) => {
    const trimmed = String(downloadId || "").trim();
    if (!trimmed) return false;
    sendNativeCommand("cancelDownload", { downloadId: trimmed });
    return true;
  };

  const openDownload: NativeBrowserEngine["openDownload"] = ({ downloadId }) => {
    const trimmed = String(downloadId || "").trim();
    if (!trimmed) return false;
    sendNativeCommand("openDownload", { downloadId: trimmed });
    return true;
  };

  const deleteDownload: NativeBrowserEngine["deleteDownload"] = ({ downloadId }) => {
    const trimmed = String(downloadId || "").trim();
    if (!trimmed) return false;
    sendNativeCommand("deleteDownload", { downloadId: trimmed });
    return true;
  };

  const reconcileDownloads: NativeBrowserEngine["reconcileDownloads"] = ({ downloadIds }) => {
    if (!Array.isArray(downloadIds)) return false;
    const cleanIds = downloadIds.map((id) => String(id || "").trim()).filter(Boolean);
    if (cleanIds.length === 0) return false;
    sendNativeCommand("reconcileDownloads", { downloadIds: cleanIds });
    return true;
  };

  const shareUrl: NativeBrowserEngine["shareUrl"] = (urlOrPayload, maybeTitle) => {
    const rawUrl =
      typeof urlOrPayload === "string" ? urlOrPayload : urlOrPayload?.url || "";
    const rawTitle =
      typeof urlOrPayload === "string" ? maybeTitle : urlOrPayload?.title;
    const safeUrl = sanitizeContextMenuHttpUrl(rawUrl);
    if (!safeUrl) return false;
    const safeTitle =
      typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : undefined;
    sendNativeCommand("shareUrl", {
      url: safeUrl,
      ...(safeTitle ? { title: safeTitle } : {}),
    });
    return true;
  };

  const downloadImage: NativeBrowserEngine["downloadImage"] = (
    tabIdOrPayload,
    maybeImageUrl
  ) => {
    const rawTabId =
      typeof tabIdOrPayload === "string"
        ? tabIdOrPayload
        : tabIdOrPayload?.tabId || "";
    const rawImageUrl =
      typeof tabIdOrPayload === "string"
        ? maybeImageUrl
        : tabIdOrPayload?.imageUrl || tabIdOrPayload?.url || "";
    const cleanTabId = String(rawTabId || "").trim();
    if (!cleanTabId) return false;
    const tabSt = tabStates.get(cleanTabId);
    if (tabSt?.isPrivate) return false;
    const safeImageUrl = sanitizeContextMenuHttpUrl(rawImageUrl);
    if (!safeImageUrl) return false;
    sendNativeCommand("downloadImage", {
      tabId: cleanTabId,
      imageUrl: safeImageUrl,
      url: safeImageUrl,
    });
    return true;
  };

  const openExternalBrowser: NativeBrowserEngine["openExternalBrowser"] = (
    urlOrPayload
  ) => {
    const rawUrl =
      typeof urlOrPayload === "string" ? urlOrPayload : urlOrPayload?.url || "";
    const safeUrl = sanitizeContextMenuHttpUrl(rawUrl);
    if (!safeUrl) return false;
    sendNativeCommand("LAUNCH_EXTERNAL_BROWSER", {
      url: safeUrl,
    });
    return true;
  };

  const autoDenyPendingRequest = (
    pending: PendingInteractiveRequest,
    reason: "timeout_30s" | "navigation" | "tab_closed" | "reload" | "stop_loading"
  ): void => {
    if (resolvedRequestIds.has(pending.requestId)) return;
    clock.clearTimeout(pending.timerId);
    pendingInteractiveRequests.delete(pending.requestId);
    resolvedRequestIds.add(pending.requestId);

    if (pending.kind === "permission") {
      sendNativeCommand("resolvePermission", {
        requestId: pending.requestId,
        grantedResources: [],
      });
    } else if (pending.kind === "fileChooser") {
      sendNativeCommand("resolveFileChooser", {
        requestId: pending.requestId,
        allow: false,
      });
    } else if (pending.kind === "jsDialog") {
      sendNativeCommand("resolveJsDialog", {
        requestId: pending.requestId,
        confirmed: false,
      });
    } else if (pending.kind === "httpAuth") {
      sendNativeCommand("resolveHttpAuth", {
        requestId: pending.requestId,
        proceed: false,
      });
    }

    callbacks.onInteractiveRequestCancelled?.(
      pending.requestId,
      pending.tabId,
      pending.kind,
      reason
    );
  };

  const cancelPendingInteractiveRequestsForTab = (
    tabId: string,
    reason: "navigation" | "tab_closed" | "reload" | "stop_loading"
  ): void => {
    const toCancel: PendingInteractiveRequest[] = [];
    for (const req of pendingInteractiveRequests.values()) {
      if (req.tabId === tabId) {
        toCancel.push(req);
      }
    }
    for (const req of toCancel) {
      autoDenyPendingRequest(req, reason);
    }
  };

  const registerPendingInteractiveRequest = (
    requestId: string,
    tabId: string,
    kind: "permission" | "fileChooser" | "jsDialog" | "httpAuth",
    epoch: number,
    origin: string,
    ts: number
  ): PendingInteractiveRequest => {
    seenRequestIds.add(requestId);
    const entry: PendingInteractiveRequest = {
      requestId,
      tabId,
      kind,
      epoch,
      origin,
      createdAt: ts,
      timerId: null,
    };
    entry.timerId = clock.setTimeout(() => {
      const current = pendingInteractiveRequests.get(requestId);
      if (current) {
        autoDenyPendingRequest(current, "timeout_30s");
      }
    }, INTERACTIVE_REQUEST_TIMEOUT_MS);
    pendingInteractiveRequests.set(requestId, entry);
    return entry;
  };

  const ensureTabState = (
    tabId: string,
    init?: Partial<NativeTabRuntimeState>
  ): NativeTabRuntimeState => {
    let st = tabStates.get(tabId);
    if (!st) {
      st = {
        tabId,
        isPrivate: init?.isPrivate ?? false,
        currentUrl: init?.currentUrl ?? "",
        title: init?.title ?? (init?.isPrivate ? "Private Tab" : "New Tab"),
        progress: 0,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        siteMode: init?.siteMode ?? "default",
        zoomLevel: init?.zoomLevel ?? 100,
        javascriptAllowed: init?.javascriptAllowed ?? true,
        popupsAllowed: init?.popupsAllowed ?? true,
        requestEpoch: init?.requestEpoch ?? 1,
        renderProcessGone: false,
        isFullscreen: false,
        findMatchesCount: 0,
        findActiveOrdinal: 0,
        historyUrls: init?.currentUrl ? [init.currentUrl] : [],
        historyIndex: 0,
      };
      tabStates.set(tabId, st);
    } else if (init) {
      if (init.isPrivate !== undefined) st.isPrivate = init.isPrivate;
      if (init.siteMode !== undefined) st.siteMode = init.siteMode;
      if (init.zoomLevel !== undefined) st.zoomLevel = init.zoomLevel;
      if (init.javascriptAllowed !== undefined) st.javascriptAllowed = init.javascriptAllowed;
      if (init.popupsAllowed !== undefined) st.popupsAllowed = init.popupsAllowed;
      if (init.requestEpoch !== undefined) st.requestEpoch = init.requestEpoch;
    }
    return st;
  };

  const createOrUpdateTab: NativeBrowserEngine["createOrUpdateTab"] = (tabId, options = {}) => {
    const state = ensureTabState(tabId, {
      isPrivate: options.isPrivate,
      siteMode: options.siteMode,
      zoomLevel: options.zoomLevel,
      javascriptAllowed: options.javascriptAllowed,
      popupsAllowed: options.popupsAllowed,
    });
    sendNativeCommand("CREATE_OR_UPDATE_TAB", {
      tabId,
      isPrivate: state.isPrivate,
      siteMode: state.siteMode,
      zoomLevel: state.zoomLevel,
      javascriptAllowed: state.javascriptAllowed,
      popupsAllowed: state.popupsAllowed,
    });
    return { ...state, historyUrls: [...state.historyUrls] };
  };

  const selectTab = (tabId: string, isPrivate = false): void => {
    activeTabId = tabId;
    const state = ensureTabState(tabId, { isPrivate });
    sendNativeCommand("SELECT_TAB", { tabId, isPrivate: state.isPrivate });
  };

  const closeTab = (tabId: string): void => {
    cancelPendingInteractiveRequestsForTab(tabId, "tab_closed");
    for (const [reqId, dlReq] of pendingDownloadRequests.entries()) {
      if (dlReq.tabId === tabId) {
        if (dlReq.timerId !== undefined && dlReq.timerId !== null) {
          clock.clearTimeout(dlReq.timerId);
        }
        pendingDownloadRequests.delete(reqId);
        resolvedDownloadRequestIds.add(reqId);
        sendNativeCommand("resolveDownload", { requestId: reqId, allow: false });
      }
    }
    tabStates.delete(tabId);
    if (activeTabId === tabId) {
      activeTabId = null;
    }
    sendNativeCommand("CLOSE_TAB", { tabId });
  };

  const getTabState = (tabId: string): NativeTabRuntimeState | undefined => {
    const st = tabStates.get(tabId);
    return st ? { ...st, historyUrls: [...st.historyUrls] } : undefined;
  };

  const getTabFavicon = (tabId: string): string | undefined => {
    const st = tabStates.get(tabId);
    if (!st || st.isPrivate) return undefined;
    return st.faviconDataUrl;
  };

  const getAllTabStates = (): NativeTabRuntimeState[] => {
    return Array.from(tabStates.values()).map((st) => ({
      ...st,
      historyUrls: [...st.historyUrls],
    }));
  };

  const getActiveTabId = (): string | null => activeTabId;

  const loadUrl: NativeBrowserEngine["loadUrl"] = (tabId, rawUrl, options = {}) => {
    cancelPendingInteractiveRequestsForTab(tabId, "navigation");
    const trimmed = (rawUrl || "").trim();
    const state = ensureTabState(tabId, {
      isPrivate: options.isPrivate,
      siteMode: options.siteMode,
      zoomLevel: options.zoomLevel,
      javascriptAllowed: options.javascriptAllowed,
      popupsAllowed: options.popupsAllowed,
    });

    if (state.isPrivate && !capabilities.privateIsolation) {
      return {
        dispatched: false,
        engine: "proxy_fallback",
        reason:
          "Private tabs do not use shared-profile native WebView until androidx.webkit Profile isolation (N2F-2).",
      };
    }

    if (options.requestEpoch !== undefined) {
      state.requestEpoch = options.requestEpoch;
    } else {
      state.requestEpoch += 1;
    }

    // 1. Resolve Omnibox input on the native path (URLs, scheme-less domains, blocked localhost/private IPs, search queries)
    const omniboxRes = resolveNativeOmniboxInput(
      trimmed,
      options.searchEngineId || currentSearchEngineId
    );
    if (omniboxRes.kind === "blocked") {
      const isSsrf = omniboxRes.errorCode === "NETFLOW_SSRF_BLOCKED";
      const errReason =
        omniboxRes.reason ||
        (isSsrf ? "Blocked internal network SSRF target" : "Blocked unsafe navigation scheme");
      handleNativeEngineEvent({
        eventType: "onReceivedError",
        tabId,
        errorCode: -10,
        errorKind: isSsrf ? "security_ssrf" : "generic",
        description: errReason,
        failingUrl: omniboxRes.resolvedUrl || trimmed,
        isForMainFrame: true,
        requestEpoch: state.requestEpoch,
      });
      return {
        dispatched: false,
        engine: "native_chromium_webview",
        resolvedUrl: omniboxRes.resolvedUrl || trimmed,
        kind: "blocked",
        reason: errReason,
      };
    }

    const finalUrl = omniboxRes.resolvedUrl;

    // 2. Google Sign-In / OAuth external browser boundary
    if (isGoogleAuthOrOAuthUrl(finalUrl)) {
      const reason =
        "Google Sign-In / OAuth requires external system browser for secure authentication.";
      handleNativeEngineEvent({
        eventType: "onExternalAuthRequired",
        tabId,
        targetUrl: finalUrl,
        reason,
      });
      return {
        dispatched: false,
        engine: "native_chromium_webview",
        resolvedUrl: finalUrl,
        kind: omniboxRes.kind,
        reason,
      };
    }

    state.currentUrl = finalUrl;
    state.isLoading = true;
    state.progress = 10;
    state.renderProcessGone = false;

    if (!activeTabId) {
      activeTabId = tabId;
    }

    sendNativeCommand("LOAD_URL", {
      tabId,
      url: finalUrl,
      isPrivate: state.isPrivate,
      siteMode: state.siteMode,
      zoomLevel: state.zoomLevel,
      javascriptAllowed: state.javascriptAllowed,
      popupsAllowed: state.popupsAllowed,
      requestEpoch: state.requestEpoch,
    });

    return {
      dispatched: true,
      engine: "native_chromium_webview",
      resolvedUrl: finalUrl,
      kind: omniboxRes.kind,
    };
  };

  const reload = (tabId: string): boolean => {
    const state = tabStates.get(tabId);
    if (!state || !state.currentUrl) return false;
    cancelPendingInteractiveRequestsForTab(tabId, "reload");
    state.requestEpoch += 1;
    state.isLoading = true;
    state.renderProcessGone = false;
    sendNativeCommand("RELOAD", { tabId, requestEpoch: state.requestEpoch });
    return true;
  };

  const stopLoading = (tabId: string): void => {
    cancelPendingInteractiveRequestsForTab(tabId, "stop_loading");
    const state = tabStates.get(tabId);
    if (state) {
      state.requestEpoch += 1;
      state.isLoading = false;
      state.progress = 0;
    }
    sendNativeCommand("STOP_LOADING", { tabId });
  };

  const canGoBack = (tabId: string): boolean => {
    const state = tabStates.get(tabId);
    if (!state) return false;
    return state.canGoBack || state.historyIndex > 0;
  };

  const canGoForward = (tabId: string): boolean => {
    const state = tabStates.get(tabId);
    if (!state) return false;
    return state.canGoForward || state.historyIndex < state.historyUrls.length - 1;
  };

  const goBack = (tabId: string): boolean => {
    const state = tabStates.get(tabId);
    if (!state || !canGoBack(tabId)) return false;
    cancelPendingInteractiveRequestsForTab(tabId, "navigation");
    state.requestEpoch += 1;
    if (state.historyIndex > 0) {
      state.historyIndex -= 1;
      state.currentUrl = state.historyUrls[state.historyIndex] || state.currentUrl;
      state.canGoBack = state.historyIndex > 0;
      state.canGoForward = state.historyIndex < state.historyUrls.length - 1;
    }
    sendNativeCommand("GO_BACK", { tabId });
    return true;
  };

  const goForward = (tabId: string): boolean => {
    const state = tabStates.get(tabId);
    if (!state || !canGoForward(tabId)) return false;
    cancelPendingInteractiveRequestsForTab(tabId, "navigation");
    state.requestEpoch += 1;
    if (state.historyIndex < state.historyUrls.length - 1) {
      state.historyIndex += 1;
      state.currentUrl = state.historyUrls[state.historyIndex] || state.currentUrl;
      state.canGoBack = state.historyIndex > 0;
      state.canGoForward = state.historyIndex < state.historyUrls.length - 1;
    }
    sendNativeCommand("GO_FORWARD", { tabId });
    return true;
  };

  const findInPage = (tabId: string, query: string): void => {
    const state = tabStates.get(tabId);
    if (state && !query.trim()) {
      state.findMatchesCount = 0;
      state.findActiveOrdinal = 0;
    }
    sendNativeCommand("FIND_IN_PAGE", { tabId, query });
  };

  const findNext = (tabId: string, forward = true): void => {
    sendNativeCommand("FIND_NEXT", { tabId, forward });
  };

  const clearFindMatches = (tabId: string): void => {
    const state = tabStates.get(tabId);
    if (state) {
      state.findMatchesCount = 0;
      state.findActiveOrdinal = 0;
    }
    sendNativeCommand("CLEAR_FIND_MATCHES", { tabId });
  };

  const setZoomLevel = (tabId: string, zoomLevel: number): void => {
    const clamped = Math.max(50, Math.min(200, zoomLevel));
    const state = ensureTabState(tabId);
    state.zoomLevel = clamped;
    sendNativeCommand("SET_ZOOM", { tabId, zoomLevel: clamped });
  };

  const setSiteMode = (tabId: string, siteMode: SiteMode, reloadNow = true): void => {
    const state = ensureTabState(tabId);
    state.siteMode = siteMode;
    sendNativeCommand("SET_SITE_MODE", { tabId, siteMode, reload: reloadNow });
  };

  const setLightModePolicy: NativeBrowserEngine["setLightModePolicy"] = (
    tabId,
    lightMode,
    policy = {}
  ) => {
    setLightMode(tabId, {
      lightMode: Boolean(lightMode),
      ...policy,
    });
    const state = ensureTabState(tabId);
    return { ...state, historyUrls: [...state.historyUrls] };
  };

  /**
   * FORM-B2 PART 2 & FORM 1 OF 6: Feature-detected `setLightMode(tabId, policy)` command.
   * Uses the single documented contract action `setLightMode` everywhere.
   */
  const setLightMode: NativeBrowserEngine["setLightMode"] = (tabId, policyInput) => {
    const isBool = typeof policyInput === "boolean";
    const enabled = isBool
      ? policyInput
      : policyInput?.lightMode ??
        Boolean(
          policyInput?.blockWebFonts ||
            policyInput?.blockMediaPreload ||
            policyInput?.blockNetworkImage ||
            policyInput?.cacheMode === "LOAD_CACHE_ELSE_NETWORK"
        );
    const policyObj = isBool ? {} : policyInput || {};
    const state = ensureTabState(tabId);
    state.lightMode = Boolean(enabled);
    state.lightModePolicy = {
      blockNetworkImage: policyObj.blockNetworkImage ?? false,
      blockWebFonts: policyObj.blockWebFonts ?? Boolean(enabled),
      blockMediaPreload: policyObj.blockMediaPreload ?? Boolean(enabled),
      blockThirdPartyTrackers: policyObj.blockThirdPartyTrackers ?? true,
      cacheMode:
        policyObj.cacheMode ??
        (enabled ? "LOAD_CACHE_ELSE_NETWORK" : "LOAD_DEFAULT"),
      javaScriptEnabled: true,
    };

    const nativeAdvertised = Boolean(capabilities.lightMode);
    if (nativeAdvertised) {
      sendNativeCommand("setLightMode", {
        tabId,
        policy: state.lightModePolicy,
      });
    }

    return {
      supported: nativeAdvertised,
      pendingNativeWork: !nativeAdvertised,
      tabId,
      lightMode: state.lightMode,
      policy: { ...state.lightModePolicy },
    };
  };

  const syncViewportBounds = (bounds: NativeViewportBounds): void => {
    const clampedLeft = Math.max(0, Math.round(bounds.left));
    const clampedTop = Math.max(0, Math.round(bounds.top));
    const clampedWidth = Math.max(0, Math.round(bounds.width));
    const clampedHeight = Math.max(0, Math.round(bounds.height));
    const isVisible = Boolean(bounds.visible && clampedWidth > 0 && clampedHeight > 0);
    currentViewport = {
      left: clampedLeft,
      top: clampedTop,
      width: clampedWidth,
      height: clampedHeight,
      visible: isVisible,
    };
    sendNativeCommand("SET_VIEWPORT_BOUNDS", {
      left: clampedLeft,
      top: clampedTop,
      width: clampedWidth,
      height: clampedHeight,
      visible: isVisible,
    });
  };

  const setWebViewVisible = (visible: boolean): void => {
    currentViewport = { ...currentViewport, visible };
    sendNativeCommand("SET_WEBVIEW_VISIBLE", { visible });
  };

  const getViewportBounds = (): NativeViewportBounds => ({ ...currentViewport });

  const clearBrowsingData: NativeBrowserEngine["clearBrowsingData"] = (options) => {
    sendNativeCommand("CLEAR_BROWSING_DATA", {
      clearCache: options.clearCache ?? true,
      clearCookies: options.clearCookies ?? true,
      clearStorage: options.clearStorage ?? true,
      clearHistory: options.clearHistory ?? true,
    });
  };

  const commitTabHistoryUrl = (state: NativeTabRuntimeState, url: string, isReload = false) => {
    if (!url || url === "about:blank") return;
    const currentAtIdx = state.historyUrls[state.historyIndex];
    if (isReload || currentAtIdx === url) {
      return;
    }
    const truncated = state.historyUrls.slice(0, state.historyIndex + 1);
    truncated.push(url);
    state.historyUrls = truncated;
    state.historyIndex = truncated.length - 1;
    state.canGoBack = state.historyIndex > 0;
    state.canGoForward = false;
  };

  const INTERACTIVE_EVENT_TYPES = new Set<string>([
    "onPermissionRequested",
    "onPermissionRequest",
    "onGeolocationPermissionRequest",
    "onFileChooserRequested",
    "onShowFileChooser",
    "onJsDialog",
    "onHttpAuthRequested",
    "onHttpAuthRequest",
  ]);

  const handleNativeEngineEvent = (payload: NativeEngineEventPayload): void => {
    if (!payload || typeof payload.eventType !== "string" || !payload.eventType) return;

    // 1. Capabilities advertisement (`onCapabilities`)
    if (payload.eventType === "onCapabilities") {
      const capSrc = payload.capabilities || payload;
      const rawVer =
        (capSrc as any).chromiumVersion ??
        (capSrc as any).webViewVersion ??
        payload.chromiumVersion ??
        payload.webViewVersion ??
        getChromiumEngineVersion();
      const explicitMajor =
        (capSrc as any).chromiumMajorVersion ?? payload.chromiumMajorVersion;
      const parsedMajor =
        parseChromiumMajorVersion(explicitMajor) ?? parseChromiumMajorVersion(rawVer);
      const isOutdated =
        parsedMajor !== null && parsedMajor > 0 && parsedMajor < MIN_SUPPORTED_CHROMIUM_MAJOR;

      capabilities = {
        lightMode: Boolean(capSrc.lightMode),
        subresourceIntercept: Boolean(capSrc.subresourceIntercept),
        privateIsolation: Boolean(capSrc.privateIsolation),
        interactiveCallbacks: Boolean(capSrc.interactiveCallbacks),
        ...(typeof rawVer === "string" && rawVer.trim()
          ? { chromiumVersion: rawVer.trim() }
          : {}),
        ...(parsedMajor !== null ? { chromiumMajorVersion: parsedMajor } : {}),
        isOutdatedWebView: isOutdated,
      };
      callbacks.onCapabilitiesChanged?.({ ...capabilities });
      eventListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {}
      });
      return;
    }

    // 2. Network state change (`onNetworkStateChanged`)
    if (payload.eventType === "onNetworkStateChanged") {
      const netTabId = payload.tabId || activeTabId || "";
      const netState = netTabId ? tabStates.get(netTabId) : undefined;
      const evEpoch = payload.epoch ?? payload.requestEpoch ?? netState?.requestEpoch ?? 1;
      if (netState && typeof evEpoch === "number" && evEpoch > 0 && evEpoch < netState.requestEpoch) {
        return;
      }
      callbacks.onNetworkStateChanged?.({
        tabId: netTabId,
        requestId: payload.requestId,
        epoch: evEpoch,
        ts: payload.ts ?? payload.timestamp ?? clock.now(),
        isMainFrame: payload.isMainFrame ?? payload.isForMainFrame ?? true,
        origin: payload.origin || netState?.currentUrl || "",
        validated: Boolean(payload.validated),
        metered: Boolean(payload.metered),
        transport: String(payload.transport || "unknown"),
        downKbps: Number(payload.downKbps ?? 0),
        upKbps: Number(payload.upKbps ?? 0),
      });
      eventListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {}
      });
      return;
    }

    // 3. Interactive Contract Events (`onPermissionRequested`, `onFileChooserRequested`, `onJsDialog`, `onHttpAuthRequested`)
    if (INTERACTIVE_EVENT_TYPES.has(payload.eventType)) {
      const reqId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
      if (!reqId) {
        return; // Missing requestId ignored
      }
      if (
        seenRequestIds.has(reqId) ||
        resolvedRequestIds.has(reqId) ||
        pendingInteractiveRequests.has(reqId)
      ) {
        return; // Duplicate or already-resolved requestId ignored
      }

      const reqTabId = typeof payload.tabId === "string" ? payload.tabId.trim() : "";
      if (!reqTabId) {
        return;
      }
      const tabState = tabStates.get(reqTabId);
      if (!tabState) {
        return; // Unknown tab ignored
      }

      const evEpoch = payload.epoch ?? payload.requestEpoch;
      if (typeof evEpoch === "number" && evEpoch > 0 && evEpoch !== tabState.requestEpoch) {
        return; // Stale epoch ignored
      }

      const effectiveEpoch = tabState.requestEpoch;
      const evTs = payload.ts ?? payload.timestamp ?? clock.now();
      const isMainFrame = payload.isMainFrame ?? payload.isForMainFrame ?? true;
      const origin = (payload.origin || payload.url || tabState.currentUrl || "").trim();

      // Wrong-tab / inactive-tab check
      const isTabActive = activeTabId !== null && reqTabId === activeTabId;

      if (
        payload.eventType === "onFileChooserRequested" ||
        payload.eventType === "onShowFileChooser"
      ) {
        // File chooser: allow ONLY if hasUserGesture === true and the tab is active, else deny
        registerPendingInteractiveRequest(
          reqId,
          reqTabId,
          "fileChooser",
          effectiveEpoch,
          origin,
          evTs
        );
        const hasGesture = Boolean(
          payload.hasUserGesture ?? payload.isUserGesture ?? payload.hasGesture
        );
        const allowFileChooser = Boolean(isTabActive && hasGesture && isMainFrame);
        resolveFileChooser({
          requestId: reqId,
          allow: allowFileChooser,
        });
        return;
      }

      // For permission, JS dialog, and HTTP auth: wrong/background tab is ignored (cannot pop modal over active tab)
      if (!isTabActive) {
        return;
      }

      if (
        payload.eventType === "onPermissionRequested" ||
        payload.eventType === "onPermissionRequest" ||
        payload.eventType === "onGeolocationPermissionRequest"
      ) {
        registerPendingInteractiveRequest(
          reqId,
          reqTabId,
          "permission",
          effectiveEpoch,
          origin,
          evTs
        );

        // HTTPS-only requirement
        if (!isStrictHttpsOrigin(origin)) {
          resolvePermission({ requestId: reqId, grantedResources: [] });
          return;
        }

        const rawResources =
          payload.eventType === "onGeolocationPermissionRequest"
            ? ["geolocation"]
            : Array.isArray(payload.resources)
            ? payload.resources
            : [];

        // Normalize and strip unknown "other" resources; camera, microphone, geolocation, and protectedMedia are governed by siteOverrides (default "block")
        const grantableCandidates: GrantablePermissionResource[] = [];
        for (const r of rawResources) {
          const norm = normalizePermissionResource(r);
          if (
            norm === "camera" ||
            norm === "microphone" ||
            norm === "geolocation" ||
            norm === "protectedMedia"
          ) {
            if (!grantableCandidates.includes(norm)) {
              grantableCandidates.push(norm);
            }
          }
        }

        if (grantableCandidates.length === 0) {
          resolvePermission({ requestId: reqId, grantedResources: [] });
          return;
        }

        const domain = extractCleanDomain(origin);
        if (!domain) {
          resolvePermission({ requestId: reqId, grantedResources: [] });
          return;
        }

        const overrides = getEffectiveSiteOverrides();
        const siteOverride = overrides[domain];

        const preAllowedResources: GrantablePermissionResource[] = [];
        const askResources: GrantablePermissionResource[] = [];

        for (const res of grantableCandidates) {
          const setting = siteOverride?.[res];
          // Default is deny: unset or "block" -> deny
          if (!setting || setting === "block") {
            continue;
          }
          if (setting === "allow") {
            preAllowedResources.push(res);
          } else if (setting === "ask") {
            askResources.push(res);
          }
        }

        // If nothing is allowed or ask, deny immediately
        if (preAllowedResources.length === 0 && askResources.length === 0) {
          resolvePermission({ requestId: reqId, grantedResources: [] });
          return;
        }

        // If all non-blocked resources are "allow" and none are "ask", grant immediately
        if (askResources.length === 0) {
          resolvePermission({ requestId: reqId, grantedResources: preAllowedResources });
          return;
        }

        // Otherwise, invoke interactive ask prompt handler in shell
        if (callbacks.onPermissionAskPrompt) {
          callbacks.onPermissionAskPrompt({
            requestId: reqId,
            tabId: reqTabId,
            epoch: effectiveEpoch,
            ts: evTs,
            isMainFrame,
            origin,
            domain,
            askResources,
            preAllowedResources,
          });
        }
        return;
      }

      if (payload.eventType === "onJsDialog") {
        registerPendingInteractiveRequest(
          reqId,
          reqTabId,
          "jsDialog",
          effectiveEpoch,
          origin,
          evTs
        );
        const dialogType = (payload.type || payload.dialogType || "alert") as
          | "alert"
          | "confirm"
          | "prompt"
          | "beforeunload";
        if (
          dialogType !== "alert" &&
          dialogType !== "confirm" &&
          dialogType !== "prompt" &&
          dialogType !== "beforeunload"
        ) {
          resolveJsDialog({ requestId: reqId, confirmed: false });
          return;
        }
        callbacks.onJsDialogRequested?.({
          requestId: reqId,
          tabId: reqTabId,
          epoch: effectiveEpoch,
          ts: evTs,
          isMainFrame,
          origin,
          type: dialogType,
          message: String(payload.message ?? ""),
          defaultValue: payload.defaultValue,
        });
        return;
      }

      if (
        payload.eventType === "onHttpAuthRequested" ||
        payload.eventType === "onHttpAuthRequest"
      ) {
        registerPendingInteractiveRequest(
          reqId,
          reqTabId,
          "httpAuth",
          effectiveEpoch,
          origin,
          evTs
        );
        const host = String(payload.host || extractCleanDomain(origin) || "").trim();
        const realm = String(payload.realm ?? "").trim();
        if (!host) {
          resolveHttpAuth({ requestId: reqId, proceed: false });
          return;
        }
        callbacks.onHttpAuthRequested?.({
          requestId: reqId,
          tabId: reqTabId,
          epoch: effectiveEpoch,
          ts: evTs,
          isMainFrame,
          origin,
          host,
          realm,
        });
        return;
      }
    }

    // 4. Direct `onSubresourceError` event from contract
    if (payload.eventType === "onSubresourceError") {
      const subTabId = payload.tabId || activeTabId || "";
      const subState = subTabId ? tabStates.get(subTabId) : undefined;
      if (!subState) return;
      const evEpoch = payload.epoch ?? payload.requestEpoch;
      if (typeof evEpoch === "number" && evEpoch > 0 && evEpoch < subState.requestEpoch) {
        return;
      }
      const rawSample = payload.sampleCode ?? payload.errorCode ?? payload.statusCode;
      let code: number | string = -1;
      if (typeof rawSample === "number" && !Number.isNaN(rawSample)) {
        code = rawSample;
      } else if (typeof rawSample === "string" && rawSample.trim().length > 0) {
        code = rawSample.trim();
      }
      const count = Math.max(1, Number(payload.count ?? 1));
      subState.subresourceErrorCount = (subState.subresourceErrorCount ?? 0) + count;
      subState.lastSubresourceSampleCode = code;
      const subUrl = payload.failingUrl || payload.url || payload.origin || "";
      callbacks.onSubresourceError?.(
        subState.tabId,
        subUrl,
        code,
        { ...subState, historyUrls: [...subState.historyUrls] },
        count
      );
      eventListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {}
      });
      return;
    }

    const KNOWN_LIFECYCLE_EVENTS = new Set<string>([
      "onPageStarted",
      "onPageCommitVisible",
      "onPageFinished",
      "onHistoryUpdated",
      "onHistoryNavigation",
      "onTabSwitched",
      "onLoadStopped",
      "onProgressChanged",
      "onReceivedTitle",
      "onReceivedError",
      "onReceivedSslError",
      "onReceivedHttpError",
      "onRenderProcessGone",
      "onCreateWindow",
      "onCloseWindow",
      "onDownloadStart",
      "onDownloadRequested",
      "onDownloadProgress",
      "onDownloadCompleted",
      "onDownloadUnsupported",
      "onContextMenuRequested",
      "onFavicon",
      "onSslError",
      "onExternalAuthRequired",
      "onExternalIntentUrl",
      "onEnterFullscreen",
      "onExitFullscreen",
      "onFindResultReceived",
    ]);

    if (!KNOWN_LIFECYCLE_EVENTS.has(payload.eventType)) {
      // Unknown event kinds ignored safely without mutating state
      return;
    }

    const tabId = payload.tabId || activeTabId || "";
    const state = tabId ? ensureTabState(tabId) : undefined;

    // Guard against stale epoch events for page load / error callbacks
    const lifecycleEpoch = payload.epoch ?? payload.requestEpoch;
    if (
      state &&
      typeof lifecycleEpoch === "number" &&
      lifecycleEpoch > 0 &&
      lifecycleEpoch < state.requestEpoch
    ) {
      return;
    }

    switch (payload.eventType) {
      case "onPageStarted": {
        if (!state) break;
        cancelPendingInteractiveRequestsForTab(state.tabId, "navigation");
        const url = payload.url || state.currentUrl;
        state.currentUrl = url;
        state.isLoading = true;
        state.progress = payload.progress ?? 15;
        state.renderProcessGone = false;
        state.sslError = undefined;
        if (typeof payload.canGoBack === "boolean") state.canGoBack = payload.canGoBack;
        if (typeof payload.canGoForward === "boolean") state.canGoForward = payload.canGoForward;
        callbacks.onPageStarted?.(state.tabId, url, { ...state, historyUrls: [...state.historyUrls] });
        break;
      }

      case "onPageCommitVisible": {
        if (!state) break;
        const url = payload.url || state.currentUrl;
        state.currentUrl = url;
        if (typeof payload.canGoBack === "boolean") state.canGoBack = payload.canGoBack;
        if (typeof payload.canGoForward === "boolean") state.canGoForward = payload.canGoForward;
        callbacks.onPageCommitVisible?.(state.tabId, url, { ...state, historyUrls: [...state.historyUrls] });
        break;
      }

      case "onPageFinished": {
        if (!state) break;
        const url = payload.url || state.currentUrl;
        state.currentUrl = url;
        if (payload.title && payload.title.trim()) {
          state.title = payload.title.trim();
        }
        state.isLoading = false;
        state.progress = 100;
        if (Array.isArray(payload.historyUrls) && payload.historyUrls.length > 0) {
          state.historyUrls = [...payload.historyUrls];
          state.historyIndex = Math.max(
            0,
            Math.min(payload.historyIndex ?? state.historyUrls.length - 1, state.historyUrls.length - 1)
          );
          state.canGoBack = state.historyIndex > 0;
          state.canGoForward = state.historyIndex < state.historyUrls.length - 1;
        } else {
          commitTabHistoryUrl(state, url, false);
          if (typeof payload.canGoBack === "boolean") state.canGoBack = payload.canGoBack;
          if (typeof payload.canGoForward === "boolean") state.canGoForward = payload.canGoForward;
        }
        callbacks.onPageFinished?.(state.tabId, url, state.title, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        break;
      }

      case "onHistoryUpdated":
      case "onHistoryNavigation":
      case "onTabSwitched": {
        if (!state) break;
        const url = payload.url || state.currentUrl;
        state.currentUrl = url;
        if (payload.title && payload.title.trim()) {
          state.title = payload.title.trim();
        }
        if (Array.isArray(payload.historyUrls) && payload.historyUrls.length > 0) {
          state.historyUrls = [...payload.historyUrls];
          state.historyIndex = Math.max(
            0,
            Math.min(payload.historyIndex ?? state.historyUrls.length - 1, state.historyUrls.length - 1)
          );
          state.canGoBack = state.historyIndex > 0;
          state.canGoForward = state.historyIndex < state.historyUrls.length - 1;
        } else {
          commitTabHistoryUrl(state, url, Boolean(payload.isReload));
          if (typeof payload.canGoBack === "boolean") state.canGoBack = payload.canGoBack;
          if (typeof payload.canGoForward === "boolean") state.canGoForward = payload.canGoForward;
        }
        callbacks.onHistoryUpdated?.(
          state.tabId,
          url,
          state.title,
          Boolean(payload.isReload),
          { ...state, historyUrls: [...state.historyUrls] }
        );
        break;
      }

      case "onLoadStopped": {
        if (!state) break;
        cancelPendingInteractiveRequestsForTab(state.tabId, "stop_loading");
        state.isLoading = false;
        break;
      }

      case "onProgressChanged": {
        if (!state) break;
        state.progress = Math.max(0, Math.min(100, payload.progress ?? state.progress));
        callbacks.onProgressChanged?.(state.tabId, state.progress, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        break;
      }

      case "onReceivedTitle": {
        if (!state) break;
        if (payload.title && payload.title.trim()) {
          state.title = payload.title.trim();
          callbacks.onTitleChanged?.(state.tabId, state.title, {
            ...state,
            historyUrls: [...state.historyUrls],
          });
        }
        break;
      }

      case "onSslError":
      case "onReceivedSslError": {
        if (!state) break;
        state.isLoading = false;
        const primaryError =
          typeof payload.primaryError === "number"
            ? payload.primaryError
            : typeof payload.sslPrimaryError === "number"
            ? payload.sslPrimaryError
            : 3;
        const failingUrl = payload.failingUrl || payload.url || state.currentUrl;
        const host = String(payload.host || extractCleanDomain(failingUrl) || "").trim();
        state.sslError = {
          primaryError,
          host,
          failingUrl,
        };
        const sslEv: NativeSslErrorContractEvent = {
          type: "onSslError",
          tabId: state.tabId,
          requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
          epoch: lifecycleEpoch ?? state.requestEpoch,
          ts: payload.ts ?? payload.timestamp ?? clock.now(),
          origin: typeof payload.origin === "string" ? payload.origin : extractCleanDomain(failingUrl),
          primaryError,
          host,
          failingUrl,
        };
        callbacks.onSslError?.(sslEv, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        const friendly =
          "The SSL/TLS certificate presented by this website could not be verified or is untrusted. To protect your credentials and personal data, NETFLOW cancelled the connection. Proceeding past an invalid certificate is strictly disabled.";
        const errorInfo: WebPageErrorInfo = {
          errorCode: "ERR_SSL_PROTOCOL_ERROR",
          kind: "ssl",
          failedUrl: failingUrl,
          timestamp: Date.now(),
          errorDescription: friendly,
          sslPrimaryError: primaryError,
          sslHost: host,
        };
        callbacks.onError?.(state.tabId, errorInfo, friendly, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        break;
      }

      case "onReceivedError": {
        if (!state) break;
        // Subresource errors strictly separated from main-frame errors: notify resilience coordinator, never break page
        if (payload.isForMainFrame === false || payload.isMainFrame === false) {
          const subUrl = payload.failingUrl || payload.url || "";
          const subCode = payload.errorCode ?? -1;
          callbacks.onSubresourceError?.(state.tabId, subUrl, subCode, {
            ...state,
            historyUrls: [...state.historyUrls],
          });
          break;
        }
        state.isLoading = false;
        const code = payload.errorCode ?? -1;
        const failingUrl = payload.failingUrl || payload.url || state.currentUrl;
        const friendly =
          payload.errorKind === "security_ssrf" && payload.description
            ? payload.description
            : mapAndroidWebViewErrorCodeToMessage(code, payload.description);

        let kind: WebPageErrorInfo["kind"] = payload.errorKind || "generic";
        let errorCodeStr = `ERR_WEBVIEW_${Math.abs(code)}`;
        if (code === -2) {
          kind = "dns";
          errorCodeStr = "ERR_NAME_NOT_RESOLVED";
        } else if (code === -6) {
          kind = "connection";
          errorCodeStr = "ERR_CONNECTION_REFUSED";
        } else if (code === -8) {
          kind = "timeout";
          errorCodeStr = "ERR_CONNECTION_TIMED_OUT";
        } else if (code === -11) {
          kind = "ssl";
          errorCodeStr = "ERR_SSL_PROTOCOL_ERROR";
        } else if (kind === "security_ssrf") {
          errorCodeStr = "NETFLOW_SSRF_BLOCKED";
        }

        const errorInfo: WebPageErrorInfo = {
          errorCode: errorCodeStr,
          kind,
          failedUrl: failingUrl,
          timestamp: Date.now(),
          errorDescription: friendly,
        };
        callbacks.onError?.(state.tabId, errorInfo, friendly, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        break;
      }

      case "onReceivedHttpError": {
        if (!state) break;
        const statusCode = payload.statusCode ?? 500;
        if (payload.isForMainFrame === false || payload.isMainFrame === false) {
          if (statusCode >= 400) {
            const subUrl = payload.failingUrl || payload.url || "";
            callbacks.onSubresourceError?.(state.tabId, subUrl, statusCode, {
              ...state,
              historyUrls: [...state.historyUrls],
            });
          }
          break;
        }
        if (statusCode < 400) break;
        state.isLoading = false;
        const failingUrl = payload.failingUrl || payload.url || state.currentUrl;
        const kind: WebPageErrorInfo["kind"] =
          statusCode >= 500 ? "http_server" : "http_client";
        const friendly =
          statusCode === 404
            ? "The requested page was not found on this server (HTTP 404 Not Found)."
            : statusCode === 403
            ? "Access to this website was restricted or denied by the remote server (HTTP 403 Forbidden)."
            : statusCode === 503
            ? "The destination website is temporarily unavailable or undergoing maintenance (HTTP 503)."
            : `The server returned an HTTP ${statusCode} response (${payload.reasonPhrase || "Error"}).`;
        const errorInfo: WebPageErrorInfo = {
          errorCode: `HTTP_${statusCode}`,
          statusCode,
          kind,
          failedUrl: failingUrl,
          timestamp: Date.now(),
          errorDescription: friendly,
        };
        callbacks.onError?.(state.tabId, errorInfo, friendly, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        break;
      }

      case "onRenderProcessGone": {
        if (!state) break;
        state.renderProcessGone = true;
        state.isLoading = false;
        const failingUrl = payload.failingUrl || state.currentUrl;
        callbacks.onRenderProcessGone?.(state.tabId, Boolean(payload.didCrash), failingUrl);
        const errorInfo: WebPageErrorInfo = {
          errorCode: "ERR_RENDER_PROCESS_GONE",
          kind: "generic",
          failedUrl: failingUrl,
          timestamp: Date.now(),
          errorDescription:
            "The webpage rendering process stopped unexpectedly. Reload to restore the page safely.",
        };
        callbacks.onError?.(
          state.tabId,
          errorInfo,
          errorInfo.errorDescription!,
          { ...state, historyUrls: [...state.historyUrls] }
        );
        break;
      }

      case "onCreateWindow": {
        const openerId = payload.openerTabId || tabId;
        const targetUrl = (payload.targetUrl || payload.url || "").trim();
        const isUserGesture = payload.isUserGesture !== false;
        if (!isUserGesture) break;
        const popupValidation = validatePopupWindowUrl(targetUrl);
        if (!popupValidation.isSafe || !popupValidation.sanitizedUrl) break;
        callbacks.onCreateWindow?.(openerId, popupValidation.sanitizedUrl, true);
        break;
      }

      case "onCloseWindow": {
        if (tabId) {
          callbacks.onCloseWindow?.(tabId);
        }
        break;
      }

      case "onDownloadStart": {
        if (!tabId || !payload.url) break;
        callbacks.onDownloadStart?.(tabId, {
          url: payload.url,
          userAgent: payload.userAgent || "",
          contentDisposition: payload.contentDisposition || "",
          mimeType: payload.mimeType || "application/octet-stream",
          contentLength: payload.contentLength ?? 0,
        });
        break;
      }

      case "onDownloadRequested": {
        const reqId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
        if (!tabId || !reqId || !payload.url) break;
        if (
          pendingDownloadRequests.has(reqId) ||
          resolvedDownloadRequestIds.has(reqId)
        ) {
          break;
        }
        const tabSt = tabStates.get(tabId);
        if (payload.isPrivate === true || tabSt?.isPrivate) {
          resolvedDownloadRequestIds.add(reqId);
          sendNativeCommand("resolveDownload", { requestId: reqId, allow: false });
          break;
        }
        const rawSchemeCheck = String(payload.url || "").trim().toLowerCase();
        if (rawSchemeCheck.startsWith("blob:") || rawSchemeCheck.startsWith("data:")) {
          resolvedDownloadRequestIds.add(reqId);
          sendNativeCommand("resolveDownload", { requestId: reqId, allow: false });
          const scheme = rawSchemeCheck.startsWith("blob:") ? "blob" : "data";
          callbacks.onDownloadUnsupported?.({
            type: "onDownloadUnsupported",
            tabId,
            url: sanitizeDownloadDisplayUrl(payload.url),
            scheme,
            reasonCode: "UNSUPPORTED_DOWNLOAD_TYPE",
            message: `${scheme}: downloads are not supported by the native Android system downloader.`,
          });
          break;
        }
        const sanitizedDisplayUrl = sanitizeDownloadDisplayUrl(payload.url);
        const mimeType = String(payload.mimeType || "application/octet-stream").trim();
        const contentLength =
          typeof payload.contentLength === "number" && Number.isFinite(payload.contentLength)
            ? Math.max(0, payload.contentLength)
            : 0;
        const suggestedFileName = sanitizeDownloadFileName(
          payload.suggestedFileName || payload.fileName || "download",
          mimeType
        );

        const dlEntry: PendingDownloadConsentRequest = {
          requestId: reqId,
          tabId,
          url: sanitizedDisplayUrl,
          mimeType,
          contentLength,
          suggestedFileName,
          timerId: null,
        };
        dlEntry.timerId = clock.setTimeout(() => {
          const current = pendingDownloadRequests.get(reqId);
          if (current && !resolvedDownloadRequestIds.has(reqId)) {
            pendingDownloadRequests.delete(reqId);
            resolvedDownloadRequestIds.add(reqId);
            sendNativeCommand("resolveDownload", { requestId: reqId, allow: false });
          }
        }, INTERACTIVE_REQUEST_TIMEOUT_MS);
        pendingDownloadRequests.set(reqId, dlEntry);

        // Omit userAgent strictly per contract Section 3.8
        const contractEvent: NativeDownloadRequestedContractEvent = {
          type: "onDownloadRequested",
          tabId,
          requestId: reqId,
          url: sanitizedDisplayUrl,
          mimeType,
          contentLength,
          suggestedFileName,
          isPrivate: false,
        };
        callbacks.onDownloadRequested?.(contractEvent);
        break;
      }

      case "onDownloadProgress": {
        const downloadId = String(payload.downloadId || "").trim();
        if (!downloadId) break;
        const rawState = String(payload.state || "running").trim();
        const validStates: NativeDownloadContractState[] = [
          "queued",
          "running",
          "waiting_network",
          "paused",
          "completed",
          "failed",
        ];
        const dlState: NativeDownloadContractState = validStates.includes(
          rawState as NativeDownloadContractState
        )
          ? (rawState as NativeDownloadContractState)
          : "running";
        const bytes =
          typeof payload.bytes === "number" && Number.isFinite(payload.bytes)
            ? Math.max(0, payload.bytes)
            : 0;
        const total =
          typeof payload.total === "number" && Number.isFinite(payload.total)
            ? Math.max(-1, payload.total)
            : -1;
        callbacks.onDownloadProgress?.({
          type: "onDownloadProgress",
          downloadId,
          tabId: tabId || undefined,
          requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
          state: dlState,
          bytes,
          total,
          reasonCode: typeof payload.reasonCode === "string" ? payload.reasonCode : undefined,
          fileName: typeof payload.fileName === "string" ? payload.fileName : undefined,
          mimeType: typeof payload.mimeType === "string" ? payload.mimeType : undefined,
          url: typeof payload.url === "string" ? sanitizeDownloadDisplayUrl(payload.url) : undefined,
        });
        break;
      }

      case "onDownloadCompleted": {
        const downloadId = String(payload.downloadId || "").trim();
        if (!downloadId) break;
        const mimeType = String(payload.mimeType || "application/octet-stream").trim();
        const fileName = sanitizeDownloadFileName(
          payload.fileName || payload.suggestedFileName || "download",
          mimeType
        );
        callbacks.onDownloadCompleted?.({
          type: "onDownloadCompleted",
          downloadId,
          tabId: tabId || undefined,
          requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
          fileName,
          mimeType,
          bytes: typeof payload.bytes === "number" ? payload.bytes : undefined,
          total: typeof payload.total === "number" ? payload.total : undefined,
          url: typeof payload.url === "string" ? sanitizeDownloadDisplayUrl(payload.url) : undefined,
        });
        break;
      }

      case "onDownloadUnsupported": {
        if (!tabId) break;
        const scheme = String(payload.scheme || "blob").trim();
        callbacks.onDownloadUnsupported?.({
          type: "onDownloadUnsupported",
          tabId,
          url: sanitizeDownloadDisplayUrl(payload.url || ""),
          scheme,
          reasonCode: String(payload.reasonCode || "UNSUPPORTED_DOWNLOAD_TYPE"),
          message:
            typeof payload.message === "string" && payload.message.trim()
              ? payload.message.trim()
              : `${scheme}: downloads are not supported by the native Android system downloader.`,
        });
        break;
      }

      case "onContextMenuRequested": {
        if (!tabId) break;
        const tabSt = tabStates.get(tabId);
        const isPrivateTab = Boolean(tabSt?.isPrivate || payload.isPrivate === true);
        if (isPrivateTab && !capabilities.privateIsolation) break;
        const evEpoch = payload.epoch ?? payload.requestEpoch;
        if (tabSt && typeof evEpoch === "number" && evEpoch > 0 && evEpoch < tabSt.requestEpoch) {
          break;
        }
        const rawType = String(payload.type || "").trim();
        const allowedTypes: NativeContextMenuHitType[] = [
          "SRC_ANCHOR_TYPE",
          "SRC_IMAGE_ANCHOR_TYPE",
          "IMAGE_TYPE",
          "link",
          "image_link",
          "image",
        ];
        if (!allowedTypes.includes(rawType as NativeContextMenuHitType)) {
          break;
        }
        const safeLinkUrl = sanitizeContextMenuHttpUrl(payload.linkUrl);
        const safeImageUrl = sanitizeContextMenuHttpUrl(payload.imageUrl);
        if (!safeLinkUrl && !safeImageUrl) {
          break;
        }
        if ((rawType === "SRC_ANCHOR_TYPE" || rawType === "link") && !safeLinkUrl) {
          break;
        }
        if ((rawType === "IMAGE_TYPE" || rawType === "image") && !safeImageUrl) {
          break;
        }
        const contextEv: NativeContextMenuRequestedContractEvent = {
          type: rawType as NativeContextMenuHitType,
          tabId,
          isPrivate: isPrivateTab,
          requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
          epoch: evEpoch ?? tabSt?.requestEpoch ?? 1,
          ts: payload.ts ?? payload.timestamp ?? clock.now(),
          origin: typeof payload.origin === "string" ? payload.origin : tabSt?.currentUrl || "",
          ...(safeLinkUrl ? { linkUrl: safeLinkUrl } : {}),
          ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
        };
        callbacks.onContextMenuRequested?.(contextEv);
        break;
      }

      case "onFavicon": {
        if (!state || state.isPrivate || payload.isPrivate === true) {
          break;
        }
        const evEpoch = payload.epoch ?? payload.requestEpoch;
        if (typeof evEpoch === "number" && evEpoch > 0 && evEpoch !== state.requestEpoch) {
          break;
        }
        const safeDataUrl = sanitizeFaviconDataUrl(
          payload.dataUrl || payload.faviconBase64,
          payload.width,
          payload.height,
          payload.mimeType
        );
        if (!safeDataUrl) {
          break;
        }
        const cleanBase64 = safeDataUrl.replace(/^data:image\/png;base64,/i, "");
        state.faviconDataUrl = safeDataUrl;
        const faviconEv: NativeFaviconContractEvent = {
          type: "onFavicon",
          tabId: state.tabId,
          requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
          epoch: evEpoch ?? state.requestEpoch,
          ts: payload.ts ?? payload.timestamp ?? clock.now(),
          origin: typeof payload.origin === "string" ? payload.origin : state.currentUrl || "",
          faviconBase64: cleanBase64,
          dataUrl: safeDataUrl,
          width: typeof payload.width === "number" ? payload.width : undefined,
          height: typeof payload.height === "number" ? payload.height : undefined,
          mimeType: "image/png",
        };
        callbacks.onFavicon?.(faviconEv, {
          ...state,
          historyUrls: [...state.historyUrls],
        });
        break;
      }

      case "onExternalAuthRequired": {
        const targetUrl = payload.targetUrl || payload.url || "";
        if (tabId && targetUrl) {
          if (state) state.isLoading = false;
          callbacks.onExternalAuthRequired?.(
            tabId,
            targetUrl,
            payload.reason || "External browser required for Google Sign-In / OAuth."
          );
        }
        break;
      }

      case "onExternalIntentUrl": {
        const targetUrl = payload.url || payload.targetUrl || "";
        if (targetUrl) {
          callbacks.onExternalIntentUrl?.(targetUrl);
        }
        break;
      }

      case "onEnterFullscreen": {
        if (state) {
          state.isFullscreen = true;
          callbacks.onFullscreenChange?.(state.tabId, true);
        }
        break;
      }

      case "onExitFullscreen": {
        if (state) {
          state.isFullscreen = false;
          callbacks.onFullscreenChange?.(state.tabId, false);
        }
        break;
      }

      case "onFindResultReceived": {
        if (state) {
          state.findActiveOrdinal = payload.activeMatchOrdinal ?? 0;
          state.findMatchesCount = payload.numberOfMatches ?? 0;
          callbacks.onFindResult?.(
            state.tabId,
            state.findActiveOrdinal,
            state.findMatchesCount,
            Boolean(payload.isDoneCounting)
          );
        }
        break;
      }

      default:
        break;
    }

    eventListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {}
    });
  };

  const domEventHandler = (e: Event) => {
    const customEv = e as CustomEvent<NativeEngineEventPayload>;
    if (customEv?.detail && typeof customEv.detail === "object") {
      handleNativeEngineEvent(customEv.detail);
    }
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("netflow:native-engine-event", domEventHandler as EventListener);
  }

  const subscribe = (listener: (payload: NativeEngineEventPayload) => void): (() => void) => {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  };

  const destroy = (): void => {
    for (const req of pendingInteractiveRequests.values()) {
      clock.clearTimeout(req.timerId);
    }
    for (const dlReq of pendingDownloadRequests.values()) {
      if (dlReq.timerId !== undefined && dlReq.timerId !== null) {
        clock.clearTimeout(dlReq.timerId);
      }
    }
    pendingInteractiveRequests.clear();
    pendingDownloadRequests.clear();
    resolvedDownloadRequestIds.clear();
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("netflow:native-engine-event", domEventHandler as EventListener);
    }
    eventListeners.clear();
    tabStates.clear();
    activeTabId = null;
  };

  return {
    isAvailable: isNativeEngineAvailable,
    isNativeEngineAvailable,
    shouldUseNativeWebView,
    resolveExecutionEngine,
    getChromiumEngineVersion,
    getSearchEngine,
    setSearchEngine,
    resolveOmniboxInput,
    getCapabilities,
    isInteractiveCallbacksSupported,
    isPrivateIsolationSupported,
    setSiteOverrides,
    createOrUpdateTab,
    selectTab,
    closeTab,
    getTabState,
    getTabFavicon,
    getAllTabStates,
    getActiveTabId,
    loadUrl,
    reload,
    stopLoading,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    findInPage,
    findNext,
    clearFindMatches,
    setZoomLevel,
    setSiteMode,
    setLightMode,
    setLightModePolicy,
    resolvePermission,
    resolveFileChooser,
    resolveJsDialog,
    resolveHttpAuth,
    resolveDownload,
    cancelDownload,
    openDownload,
    deleteDownload,
    reconcileDownloads,
    shareUrl,
    downloadImage,
    openExternalBrowser,
    syncViewportBounds,
    setWebViewVisible,
    getViewportBounds,
    clearBrowsingData,
    handleNativeEngineEvent,
    subscribe,
    destroy,
  };
}
