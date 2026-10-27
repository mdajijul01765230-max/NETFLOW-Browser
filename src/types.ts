export type BrowsingMode = "full" | "smart-compress" | "text-only" | "reader";

export type NetworkType = "auto" | "2g" | "3g" | "4g" | "5g" | "offline";

export interface FormSubmitOptions {
  method?: "GET" | "POST";
  postBody?: string;
  contentType?: string;
}

export interface PageStats {
  originalBytes: number;
  transferredBytes: number;
  savedBytes: number;
  savedPercentage: number;
  loadTimeMs: number;
  trackersBlocked: number;
  scriptsBlocked: number;
  isHttps: boolean;
}

export interface SecurityAudit {
  protocol: string;
  certificateValid: boolean;
  trackerCount: number;
  riskLevel: "safe" | "medium_trackers" | "unencrypted";
  cookiesDetected: number;
}

export interface PageTranslation {
  isTranslated: boolean;
  targetLang: "bn" | "en";
  originalHtml: string;
  originalTitle?: string;
  translatedHtml?: string;
  translatedTitle?: string;
  isTranslating?: boolean;
  error?: string;
}

export interface DownloadMetadata {
  isDownload: boolean;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  formattedSize: string;
  downloadUrl: string;
  isImagePreview: boolean;
}

export type SiteMode = "default" | "desktop" | "mobile";

export type SearchEngineId = "google" | "duckduckgo" | "bing";

export interface WebPageErrorInfo {
  errorCode: string;
  statusCode?: number;
  kind:
    | "offline"
    | "dns"
    | "connection"
    | "timeout"
    | "http_client"
    | "http_server"
    | "restricted_network"
    | "security_ssrf"
    | "security"
    | "ssl"
    | "generic";
  failedUrl: string;
  timestamp: number;
  retryAttempts?: number;
  hasCachedContent?: boolean;
  hasOfflineCapsule?: boolean;
  errorDescription?: string;
  technicalDetails?: string;
  sslPrimaryError?: number;
  sslHost?: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  contentHtml?: string;
  rawText?: string;
  isLoading: boolean;
  error?: string;
  errorInfo?: WebPageErrorInfo;
  history: string[];
  historyIndex: number;
  isPrivate: boolean;
  isReaderMode: boolean;
  isSuspended: boolean;
  stats?: PageStats;
  securityAudit?: SecurityAudit;
  translation?: PageTranslation;
  downloadMetadata?: DownloadMetadata;
  zoomLevel?: number;
  siteMode?: SiteMode;
  isNativeWebView?: boolean;
  renderMode?: "native_webview" | "sanitized_html";
  lightMode?: boolean;
  lightModePolicy?: import("./services/lightModeEngine").LightModePolicy;
  tabBrowsingMode?: BrowsingMode;
  unblockedImages?: string[];
  partialContentNotice?: boolean;
  lastMethod?: "GET" | "POST" | "HEAD";
}

export interface OfflineCapsule {
  id: string;
  title: string;
  url: string;
  savedAt: number;
  contentHtml: string;
  rawText: string;
  byteSize: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: "news" | "knowledge" | "tools" | "essential";
  iconName: string;
  isDefault?: boolean;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  timestamp: number;
  savedBytes: number;
}

export type NetworkMedium =
  | "wifi"
  | "cellular_5g"
  | "cellular_4g"
  | "cellular_3g"
  | "cellular_2g"
  | "offline";

export interface NetworkState {
  type: NetworkType;
  medium: NetworkMedium;
  effectiveType: string;
  downlinkMbps: number;
  rttMs: number;
  isOnline: boolean;
  isSimulated: boolean;
  isMetered: boolean;
  saveDataEnabled: boolean;
  internetAvailable: boolean;
  signalStrengthPercent: number;
}

export interface NetworkTransitionEvent {
  id: string;
  timestamp: number;
  fromMedium: NetworkMedium;
  toMedium: NetworkMedium;
  reason: string;
  statePreserved?: boolean;
  preservedFormsCount?: number;
  recoveryActionTaken?: string;
}

export interface PendingNetworkRequest {
  id: string;
  url: string;
  tabId: string;
  priority: "high" | "normal" | "low";
  queuedAt: number;
  retryCount: number;
  status: "queued" | "retrying" | "recovered" | "paused";
}

export interface PreservedFormState {
  tabId: string;
  url: string;
  draftFields: Record<string, string>;
  scrollPosition: number;
  savedAt: number;
}

export interface NetworkEnginePolicy {
  autoAdaptToWeakNetwork: boolean;
  autoAdaptTo2G?: boolean;
  preserveFormsOnTransition: boolean;
  controlledRecoveryQueue: boolean;
  throttleBackgroundPollingOn2G: boolean;
  notifyOnNetworkHandover: boolean;
  smart4GPreferenceEnabled?: boolean;
  antiFlappingProtection?: boolean;
}

export interface Smart4GPreferenceState {
  enabled: boolean;
  voiceCallActive: boolean;
  degradationStatus: "optimal_4g" | "degraded_signal" | "voice_call_fallback" | "recovering" | "carrier_constrained";
  unnecessaryReconnectsPrevented: number;
  sessionsPreservedCount: number;
  antiFlappingDampeningActive: boolean;
}

export type CallPhase =
  | "idle"
  | "incoming_call"
  | "outgoing_call"
  | "active_call"
  | "rechecking_network"
  | "resuming_browsing";

export interface CallSafeState {
  currentPhase: CallPhase;
  callerOrRecipient: string;
  callStartTime: number | null;
  networkBeforeCall: string;
  networkAfterCall: string | null;
  callsHandledSuccessfully: number;
  sessionsSafelyResumed: number;
  forcedLteForbiddenAcknowledged: boolean;
}

export interface PrivacyConfig {
  blockTrackers: boolean;
  blockAds: boolean;
  blockHeavyImages: boolean;
  spoofFingerprint: boolean;
  httpsOnly: boolean;
  zeroTelemetry: boolean;
}

export type SitePermissionState = "allow" | "block" | "ask";

export interface SitePrivacyOverride {
  domain: string;
  camera?: SitePermissionState;
  microphone?: SitePermissionState;
  geolocation?: SitePermissionState;
  notifications?: SitePermissionState;
  protectedMedia?: SitePermissionState;
  javascript?: "allow" | "block";
  popups?: "allow" | "block";
  allowTrackers?: boolean;
  allowHeavyImages?: boolean;
  preferredMode?: BrowsingMode;
  createdAt?: number;
}

export interface PerformanceConfig {
  lowRamMode: boolean;
  maxActiveTabs: number;
  batterySaver: boolean;
  darkAmoledMode: boolean;
  autoSuspendMinutes: number;
  dailyDataBudgetMb: number;
}

export type { AndroidWebViewSettings, AndroidWebNavigationCallbacks, AndroidNativeBridge } from "./services/androidWebViewFoundation";
export type { WebViewLifecycleAdapterParams, AndroidWebViewRuntimeSession } from "./services/androidWebViewAdapter";
export type {
  WebViewIntegrationBoundaryConfig,
  AndroidWebViewIntegrationBoundary,
} from "./services/androidWebViewIntegrationBoundary";
export { AndroidWebViewErrorCode } from "./services/androidWebViewIntegrationBoundary";
export type {
  AndroidHostIntent,
  AndroidHostActivityContract,
  AndroidHostShellConfig,
  AndroidHostShellSession,
} from "./services/androidHostShell";
export { AndroidHostActivityState } from "./services/androidHostShell";
export type {
  AndroidPermission,
  AndroidManifestPolicySpec,
} from "./services/androidSecurityPolicy";
export {
  PermissionSecurityStatus,
  NETFLOW_ANDROID_MANIFEST_POLICY,
  evaluatePermissionSecurity,
  evaluateRuntimePermissionRequest,
  validateHostExternalIntent,
  evaluateNativeBridgeSafety,
  evaluateCookieSessionIsolationPolicy,
} from "./services/androidSecurityPolicy";
export type {
  AndroidHostEmbedContract,
  AndroidToolchainReadiness,
} from "./services/androidHostProjectReadiness";
export {
  DEFAULT_ANDROID_HOST_EMBED_CONTRACT,
  evaluateAndroidHostEmbedContract,
  evaluateAndroidToolchainReadiness,
} from "./services/androidHostProjectReadiness";
export type {
  AndroidWebViewHostConfig,
  AndroidWebViewHostSession,
} from "./services/androidWebViewHost";
export { createAndroidWebViewHost } from "./services/androidWebViewHost";
export type {
  AndroidWebViewRuntimeCapabilities,
  AndroidWebViewCapabilitySession,
} from "./services/androidWebViewRuntimeCapabilities";
export { createAndroidWebViewRuntimeCapability } from "./services/androidWebViewRuntimeCapabilities";
export type {
  AndroidTabHistoryEntry,
  AndroidWebViewNavigationControlConfig,
  AndroidWebViewNavigationController,
} from "./services/androidWebViewNavigationControl";
export { createAndroidWebViewNavigationController } from "./services/androidWebViewNavigationControl";
export {
  AndroidFileChooserMode,
  sanitizeUploadedFileName,
  matchesMimeOrExtension,
  createAndroidWebViewFileChooserManager,
} from "./services/androidWebViewFileChooser";
export type {
  AndroidFileChooserParams,
  AndroidSelectedFile,
  AndroidFileChooserSession,
  AndroidFileChooserResult,
  AndroidWebViewFileChooserManager,
} from "./services/androidWebViewFileChooser";
export {
  AndroidMediaResource,
  validateMediaRequestOrigin,
  createAndroidWebViewMediaPermissionManager,
} from "./services/androidWebViewMediaPermission";
export type {
  AndroidPermissionRequest,
  AndroidPermissionDecision,
  AndroidMediaPermissionState,
  AndroidWebViewMediaPermissionManager,
} from "./services/androidWebViewMediaPermission";
export {
  validateMediaSourceUrl,
  createAndroidWebViewMediaPlaybackManager,
} from "./services/androidWebViewMediaPlayback";
export type {
  AndroidMediaPlaybackItem,
  AndroidCustomViewSession,
  AndroidWebViewMediaPlaybackManager,
} from "./services/androidWebViewMediaPlayback";
export {
  validatePopupWindowUrl,
  createAndroidWebViewPopupManager,
} from "./services/androidWebViewPopupWindow";
export type {
  AndroidCreateWindowRequest,
  AndroidPopupWindowSession,
  AndroidCreateWindowResult,
  AndroidWebViewPopupManager,
  AndroidWebViewPopupManagerConfig,
} from "./services/androidWebViewPopupWindow";
export {
  createNativeBrowserEngine,
  resolveBrowserExecutionEngine,
  isBlockedSsrfHost,
} from "./services/nativeBrowserEngine";
export type {
  BrowserExecutionEngine,
  NativeViewportBounds,
  NativeTabRuntimeState,
  NativeEngineEventType,
  NativeEngineEventPayload,
  NativeBrowserEngineCallbacks,
  NativeLoadUrlOptions,
  NativeBrowserEngine,
} from "./services/nativeBrowserEngine";
export {
  RESILIENCE_THRESHOLDS,
  createFakeResilienceClock,
  createAndroidWebViewNetworkResilienceCoordinator,
} from "./services/androidWebViewNetworkResilience";
export type {
  HttpRequestMethod,
  ResilienceClock,
  FakeResilienceClock,
  ResilienceConnectivityInput,
  ResilienceSignalType,
  ResilienceSignalEvent,
  TabResilienceState,
  ResilienceCoordinatorConfig,
  AndroidWebViewNetworkResilienceCoordinator,
} from "./services/androidWebViewNetworkResilience";
export {
  DEFAULT_LIGHT_MODE_POLICY,
  TEXT_ONLY_LIGHT_MODE_POLICY,
  STANDARD_BROWSER_POLICY,
  buildLightModePolicy,
  canUseProxyFallback,
  normalizeBrowsingMode,
  resolveEffectiveBrowsingMode,
  resolveLightModeFallbackRoute,
  transformHtmlForMode,
  computeHonestPageStats,
  normalizeCapsuleUrl,
  findMatchingOfflineCapsule,
  buildSafeOfflineCapsule,
} from "./services/lightModeEngine";
export type {
  ModeInputAlias,
  LightModeCacheMode,
  LightModePolicy,
  ProxyFallbackTabContext,
  ResolveModeParams,
  ResolvedModeResult,
  LightModeRouteDecision,
} from "./services/lightModeEngine";


