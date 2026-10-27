// NETFLOW implementation execution test
// NETFLOW NATIVE-38 CONTINUATION TEST
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { TabBar } from "./components/TabBar";
import { BrowserHeader } from "./components/BrowserHeader";
import { StartPage } from "./components/StartPage";
import {
  WebRenderer,
  FramePermissionRequest,
  FramePermissionResult,
  SitePermissionKind,
} from "./components/WebRenderer";
import { AiAssistantModal } from "./components/AiAssistantModal";
import { NetworkManagerModal } from "./components/NetworkManagerModal";
import { PrivacyShieldModal } from "./components/PrivacyShieldModal";
import { DeviceOptimizerModal } from "./components/DeviceOptimizerModal";
import { OfflineCapsulesModal } from "./components/OfflineCapsulesModal";
import { HistoryModal } from "./components/HistoryModal";
import { ClearBrowsingDataModal, ClearBrowsingDataOptions } from "./components/ClearBrowsingDataModal";
import { BookmarksModal } from "./components/BookmarksModal";
import { NetflowPromiseModal } from "./components/NetflowPromiseModal";
import { TabSwitcherModal } from "./components/TabSwitcherModal";
import { MobileBottomBar } from "./components/MobileBottomBar";
import { ReleaseNotesModal } from "./components/ReleaseNotesModal";
import { SiteSettingsModal } from "./components/SiteSettingsModal";
import { DownloadsModal } from "./components/DownloadsModal";
import { DownloadConsentModal } from "./components/DownloadConsentModal";
import { GeolocationConsentModal } from "./components/GeolocationConsentModal";
import { NotificationConsentModal } from "./components/NotificationConsentModal";
import { JavaScriptDialogModal } from "./components/JavaScriptDialogModal";
import { HttpAuthConsentModal } from "./components/HttpAuthConsentModal";
import {
  CameraMicConsentModal,
  CameraMicConsentPrompt,
  MediaConsentResource,
} from "./components/CameraMicConsentModal";
import { HttpAuthModal, NativeHttpAuthModalPrompt } from "./components/HttpAuthModal";
import { DisplayMediaConsentModal } from "./components/DisplayMediaConsentModal";
import { BlobDownloadConsentModal } from "./components/BlobDownloadConsentModal";
import { GeneratedFileDownloadModal } from "./components/GeneratedFileDownloadModal";
import { ClipboardAndShareConsentModal } from "./components/ClipboardAndShareConsentModal";
import { GoogleAuthFallbackModal } from "./components/GoogleAuthFallbackModal";
import { ContextMenuModal } from "./components/ContextMenuModal";
import { AuthModal } from "./components/AuthModal";
import {
  isGoogleAuthOrOAuthUrl,
  launchSafeExternalBrowser,
  classifyGoogleAuthFlow,
  GoogleAuthFallbackPrompt,
} from "./services/googleAuthFallbackPolicy";
import { extractYouTubeVideoId, isYouTubeUrl, toYouTubeDisplayUrl } from "./utils/youtubeHelper";

import {
  BrowserTab,
  BrowsingMode,
  NetworkState,
  NetworkType,
  NetworkMedium,
  NetworkTransitionEvent,
  NetworkEnginePolicy,
  PendingNetworkRequest,
  Smart4GPreferenceState,
  CallSafeState,
  PrivacyConfig,
  PerformanceConfig,
  OfflineCapsule,
  HistoryEntry,
  Bookmark,
  FormSubmitOptions,
  SitePrivacyOverride,
  SiteMode,
  SearchEngineId,
  WebPageErrorInfo,
} from "./types";
import { DEFAULT_BOOKMARKS } from "./data/bookmarks";
import { Language, translations } from "./locales";
import { getCleanDomain, sanitizeUrlForErrorDisplay, redactTechnicalDetailsForDiagnostics, formatBytes } from "./utils/formatters";
import { apiFetch } from "./utils/apiClient";
import {
  DEFAULT_NETWORK_POLICY,
  getMediumDisplayName,
  isWeakNetwork,
} from "./services/networkEngine";
import {
  createAndroidWebViewPopupManager,
  AndroidWebViewPopupManager,
} from "./services/androidWebViewPopupWindow";
import {
  createAndroidDownloadManager,
  AndroidDownloadManager,
  DownloadConsentPrompt,
} from "./services/androidWebViewDownloadBoundary";
import {
  createAndroidWebViewGeolocationManager,
  AndroidWebViewGeolocationManager,
  GeolocationConsentPrompt,
  validateGeolocationOrigin,
} from "./services/androidWebViewGeolocationPermission";
import {
  createAndroidWebViewNotificationManager,
  AndroidWebViewNotificationManager,
  NotificationConsentPrompt,
  validateNotificationOrigin,
} from "./services/androidWebViewNotificationPermission";
import {
  createAndroidWebViewMediaPermissionManager,
  AndroidWebViewMediaPermissionManager,
  AndroidMediaResource,
  validateMediaRequestOrigin,
} from "./services/androidWebViewMediaPermission";
import {
  createAndroidWebViewWebSocketManager,
  AndroidWebViewWebSocketManager,
} from "./services/androidWebViewWebSocketBoundary";
import {
  createAndroidWebViewStorageManager,
  AndroidWebViewStorageManager,
} from "./services/androidWebViewStorageAndServiceWorkerBoundary";
import {
  createAndroidWebViewPageLifecycleManager,
  AndroidWebViewPageLifecycleManager,
} from "./services/androidWebViewPageLifecycleBoundary";
import {
  createAndroidWebViewDialogManager,
  AndroidWebViewDialogManager,
  JavaScriptDialogPrompt,
} from "./services/androidWebViewDialogBoundary";
import {
  createAndroidWebViewHttpAuthManager,
  AndroidWebViewHttpAuthManager,
  HttpAuthPrompt,
  ClientCertPrompt,
} from "./services/androidWebViewHttpAuthBoundary";
import {
  createAndroidWebViewWebRtcManager,
  AndroidWebViewWebRtcManager,
} from "./services/androidWebViewWebRtcBoundary";
import {
  createAndroidWebViewDisplayMediaManager,
  AndroidWebViewDisplayMediaManager,
  DisplayMediaPrompt,
} from "./services/androidWebViewDisplayMediaBoundary";
import {
  createAndroidWebViewBlobDownloadManager,
  AndroidWebViewBlobDownloadManager,
  BlobDownloadConsentPrompt,
} from "./services/androidWebViewBlobDownloadBoundary";
import {
  createAndroidWebViewFileSystemManager,
  AndroidWebViewFileSystemManager,
  GeneratedFileDownloadPrompt,
} from "./services/androidWebViewFileSystemBoundary";
import {
  createAndroidWebViewClipboardAndShareManager,
  AndroidWebViewClipboardAndShareManager,
  ClipboardConsentPrompt,
  ShareConsentPrompt,
} from "./services/androidWebViewClipboardAndShareBoundary";
import {
  createAndroidWebViewMediaPlaybackManager,
  AndroidWebViewMediaPlaybackManager,
} from "./services/androidWebViewMediaPlayback";
import {
  createAndroidWebViewBackgroundMediaManager,
  AndroidWebViewBackgroundMediaManager,
} from "./services/androidWebViewBackgroundMediaAndAutoplayBoundary";
import {
  createAndroidWebViewMediaSessionGovernanceManager,
  AndroidWebViewMediaSessionGovernanceManager,
} from "./services/androidWebViewMediaSessionGovernance";
import {
  createAndroidWebViewMediaResourceManager,
  AndroidWebViewMediaResourceManager,
} from "./services/androidWebViewMediaResourceGovernance";
import {
  createAndroidWebViewRenderingResilienceManager,
  AndroidWebViewRenderingResilienceManager,
} from "./services/androidWebViewRenderingResilience";
import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  AndroidWebViewPageStateAndLifecycleSafetyManager,
} from "./services/androidWebViewPageStateAndLifecycleSafety";
import {
  createAndroidWebViewErrorAndRecoveryLifecycleManager,
  AndroidWebViewErrorAndRecoveryLifecycleManager,
} from "./services/androidWebViewErrorAndRecoveryLifecycle";
import {
  createAndroidWebViewRequestTimeoutAndRecoveryManager,
  AndroidWebViewRequestTimeoutAndRecoveryManager,
  TimeoutReason,
} from "./services/androidWebViewRequestTimeoutAndRecovery";
import {
  createAndroidWebViewDownloadRequestLifecycleManager,
  AndroidWebViewDownloadRequestLifecycleManager,
  DownloadLifecycleState,
} from "./services/androidWebViewDownloadRequestLifecycle";
import {
  createAndroidWebViewDownloadCompletionIntegrityManager,
  AndroidWebViewDownloadCompletionIntegrityManager,
} from "./services/androidWebViewDownloadCompletionIntegrity";
import {
  createAndroidWebViewDownloadRecoveryAuditManager,
  AndroidWebViewDownloadRecoveryAuditManager,
} from "./services/androidWebViewDownloadRecoveryAudit";
import {
  createAndroidWebViewDownloadResumptionManager,
  AndroidWebViewDownloadResumptionManager,
  RangeResponseClassification,
} from "./services/androidWebViewDownloadResumption";
import {
  createAndroidWebViewDownloadPersistenceManager,
  AndroidWebViewDownloadPersistenceManager,
  DownloadRecoveryState,
  PersistedDownloadRecord,
} from "./services/androidWebViewDownloadPersistenceAndRecovery";
import {
  createAndroidWebViewRedirectChainManager,
  AndroidWebViewRedirectChainManager,
} from "./services/androidWebViewRedirectChainAndNavigationSafety";
import {
  createAndroidWebViewNavigationController,
  AndroidWebViewNavigationController,
} from "./services/androidWebViewNavigationControl";
import {
  createSessionPersistenceEngine,
  SessionPersistenceEngine,
  SessionLoadResult,
  SessionTabRuntime,
  isScrollCapturableForTab,
  doesUrlMatchDomain,
} from "./services/sessionPersistence";
import {
  createNativeBrowserEngine,
  NativeBrowserEngine,
  NativeViewportBounds,
  NativeEngineCapabilities,
  GrantablePermissionResource,
  sanitizeDownloadFileName,
  NativeDownloadRequestedContractEvent,
  NativeContextMenuRequestedContractEvent,
  loadPersistedSearchEngineId,
  savePersistedSearchEngineId,
  resolveNativeOmniboxInput,
} from "./services/nativeBrowserEngine";
import {
  createAndroidWebViewNetworkResilienceCoordinator,
  AndroidWebViewNetworkResilienceCoordinator,
  TabResilienceState,
} from "./services/androidWebViewNetworkResilience";
import {
  buildLightModePolicy,
  canUseProxyFallback,
  resolveEffectiveBrowsingMode,
  computeHonestPageStats,
  findMatchingOfflineCapsule,
  buildSafeOfflineCapsule,
  createOfflineNavigationQueue,
  OfflineNavigationQueueManager,
  PROXY_FALLBACK_BLOCKED_MESSAGE_BN,
  PROXY_FALLBACK_BLOCKED_MESSAGE_EN,
} from "./services/lightModeEngine";

// Redact sensitive query parameters, basic auth credentials, and OAuth fragment tokens before storing in browsing history
function sanitizeUrlForHistory(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const sensitiveKeys = ["password", "pass", "pwd", "secret", "token", "apikey", "auth", "credential", "session"];
    let changed = false;

    // 1. Redact HTTP Basic Auth / UserInfo credentials in URL
    if (u.password) {
      u.password = "[REDACTED]";
      changed = true;
    }

    // 2. Redact query searchParams
    for (const key of Array.from(u.searchParams.keys())) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        u.searchParams.set(key, "[REDACTED]");
        changed = true;
      }
    }

    // 3. Redact OAuth fragment tokens in hash (#access_token=..., #id_token=...)
    if (u.hash && sensitiveKeys.some((s) => u.hash.toLowerCase().includes(s))) {
      try {
        const hashParams = new URLSearchParams(u.hash.replace(/^#/, ""));
        let hashChanged = false;
        for (const key of Array.from(hashParams.keys())) {
          if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
            hashParams.set(key, "[REDACTED]");
            hashChanged = true;
          }
        }
        if (hashChanged) {
          u.hash = "#" + hashParams.toString();
          changed = true;
        }
      } catch {
        // Safe no-op on non-query hash format
      }
    }

    return changed ? u.href : rawUrl;
  } catch {
    return rawUrl;
  }
}

// Session persistence metadata schema (strictly non-private, no DOM/POST bodies/credentials)
interface PersistedTabSession {
  id: string;
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
  isReaderMode?: boolean;
  zoomLevel?: number;
  siteMode?: SiteMode;
}

// Recently closed tab recovery schema
interface RecentlyClosedTab {
  id: string;
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
  isReaderMode: boolean;
  closedAt: number;
}

// URL safety validator: allows valid http:, https:, empty start URL, or standard web domains without scheme
function isValidSafeUrl(urlStr: string): boolean {
  if (!urlStr) return true;
  const trimmed = urlStr.trim();
  if (!trimmed) return true;
  if (!trimmed.includes("://")) {
    return !trimmed.startsWith("javascript:") && !trimmed.startsWith("data:") && !trimmed.startsWith("file:");
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Robust localStorage parsing helpers ensuring corrupted, null, or malformed data never crashes the browser UI
function safeGetArray<T>(key: string, validator: (item: any) => boolean, fallback: T[]): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return fallback;
    const validItems = parsed.filter(validator);
    return validItems.length > 0 || parsed.length === 0 ? validItems : fallback;
  } catch {
    return fallback;
  }
}

function safeGetObject<T extends Record<string, any>>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function safeGetNumber(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeGetLanguage(key: string, fallback: Language): Language {
  try {
    const stored = localStorage.getItem(key);
    return stored === "en" || stored === "bn" ? stored : fallback;
  } catch {
    return fallback;
  }
}

// Safely restore persistent non-private tab session from localStorage
function safeGetPersistedTabs(): BrowserTab[] {
  const defaultInitialTab: BrowserTab = {
    id: "tab-initial-1",
    url: "",
    title: "New Tab",
    history: [""],
    historyIndex: 0,
    isLoading: false,
    isPrivate: false,
    isReaderMode: false,
    isSuspended: false,
  };

  try {
    const raw = localStorage.getItem("netflow_tabs_session");
    if (!raw) return [defaultInitialTab];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultInitialTab];

    const validatedTabs: BrowserTab[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.id !== "string" || !item.id.trim()) continue;

      const safeUrl =
        typeof item.url === "string" && isValidSafeUrl(item.url)
          ? sanitizeUrlForHistory(item.url)
          : "";
      const safeTitle =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 100)
          : safeUrl
          ? "Restored Tab"
          : "New Tab";

      let safeHistory: string[] = [];
      if (Array.isArray(item.history)) {
        safeHistory = item.history
          .filter((h: any) => typeof h === "string" && isValidSafeUrl(h))
          .map((h: string) => sanitizeUrlForHistory(h))
          .slice(-50);
      }
      if (safeHistory.length === 0) {
        safeHistory = [safeUrl];
      }

      const rawIndex =
        typeof item.historyIndex === "number" ? item.historyIndex : safeHistory.length - 1;
      const safeIndex = Math.max(0, Math.min(rawIndex, safeHistory.length - 1));

      validatedTabs.push({
        id: item.id,
        url: safeUrl,
        title: safeTitle,
        history: safeHistory,
        historyIndex: safeIndex,
        isLoading: false,
        isPrivate: false, // Never restore private tabs
        isReaderMode: Boolean(item.isReaderMode),
        isSuspended: false,
        zoomLevel:
          typeof item.zoomLevel === "number" && item.zoomLevel >= 50 && item.zoomLevel <= 200
            ? Math.round(item.zoomLevel)
            : 100,
        siteMode:
          item.siteMode === "desktop" || item.siteMode === "mobile" ? item.siteMode : "default",
      });
    }

    return validatedTabs.length > 0 ? validatedTabs : [defaultInitialTab];
  } catch {
    return [defaultInitialTab];
  }
}

// Safely restore active tab ID matching one of the restored tabs
function safeGetActiveTabId(availableTabs: BrowserTab[]): string {
  try {
    const saved = localStorage.getItem("netflow_active_tab_id");
    if (saved && availableTabs.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {}
  return availableTabs[0]?.id || "tab-initial-1";
}

export default function App() {
  // Localization: default to Bengali (বাংলা) as requested by user prompt, persisted and toggleable to English
  const [lang, setLang] = useState<Language>(() => safeGetLanguage("netflow_lang", "bn"));

  useEffect(() => {
    try {
      localStorage.setItem("netflow_lang", lang);
    } catch {}
  }, [lang]);

  // Browsing Mode
  const [browsingMode, setBrowsingMode] = useState<BrowsingMode>("smart-compress");

  // Network State
  const [networkState, setNetworkState] = useState<NetworkState>({
    type: "auto",
    medium: "wifi",
    effectiveType: "4g",
    downlinkMbps: 10,
    rttMs: 45,
    isOnline: true,
    internetAvailable: true,
    isMetered: false,
    saveDataEnabled: false,
    signalStrengthPercent: 92,
    isSimulated: false,
  });

  // Smart Network Policy
  const [networkPolicy, setNetworkPolicy] = useState<NetworkEnginePolicy>(DEFAULT_NETWORK_POLICY);

  // Network Transitions log (Handover & Recovery Audit)
  const [transitions, setTransitions] = useState<NetworkTransitionEvent[]>([
    {
      id: "trans-init",
      timestamp: Date.now() - 240000,
      fromMedium: "cellular_4g",
      toMedium: "wifi",
      reason: "Initial connectivity established (Wi-Fi Unmetered)",
      preservedFormsCount: 1,
      recoveryActionTaken: "Validated gateway and initialized state preservation engine",
    },
  ]);

  // Transition Notice Banner & Timer Lifecycle
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const showTransitionNotice = useCallback((msg: string, durationMs = 5000) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setTransitionNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      setTransitionNotice(null);
      noticeTimerRef.current = null;
    }, durationMs);
  }, []);

  const handleDismissTransitionNotice = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setTransitionNotice(null);
  }, []);

  const clearCallTimers = useCallback(() => {
    callTimersRef.current.forEach((t) => clearTimeout(t));
    callTimersRef.current = [];
  }, []);

  // Pending Network Requests for controlled recovery (FORM-B2 PART 3: Offline Queue Manager)
  const offlineQueueManagerRef = useRef<OfflineNavigationQueueManager | null>(null);
  if (!offlineQueueManagerRef.current) {
    offlineQueueManagerRef.current = createOfflineNavigationQueue();
  }
  const [pendingRequests, setPendingRequests] = useState<PendingNetworkRequest[]>(() =>
    offlineQueueManagerRef.current?.getQueue() || []
  );
  const [showQueueConfirmBanner, setShowQueueConfirmBanner] = useState<boolean>(false);

  // Privacy & Hardware Security Config
  const [privacyConfig, setPrivacyConfig] = useState<PrivacyConfig>({
    blockTrackers: true,
    blockAds: true,
    blockHeavyImages: false,
    spoofFingerprint: true,
    httpsOnly: true,
    zeroTelemetry: true,
  });

  // Omnibox Search Engine ID (persisted as engine ID only: "google" | "duckduckgo" | "bing")
  const [searchEngineId, setSearchEngineId] = useState<SearchEngineId>(() =>
    loadPersistedSearchEngineId()
  );
  const searchEngineIdRef = useRef<SearchEngineId>(searchEngineId);
  searchEngineIdRef.current = searchEngineId;

  const handleSetSearchEngine = useCallback((nextEngineId: SearchEngineId) => {
    const saved = savePersistedSearchEngineId(nextEngineId);
    searchEngineIdRef.current = saved;
    setSearchEngineId(saved);
    nativeBrowserEngineRef.current?.setSearchEngine(saved);
  }, []);

  // Low-end Performance Config
  const [performanceConfig, setPerformanceConfig] = useState<PerformanceConfig>({
    lowRamMode: true,
    maxActiveTabs: 4,
    batterySaver: false,
    darkAmoledMode: false,
    autoSuspendMinutes: 5,
    dailyDataBudgetMb: 200,
  });

  // Bookmarks (Persisted to localStorage with malformed/corrupted data protection & URL safety)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() =>
    safeGetArray<Bookmark>(
      "netflow_bookmarks",
      (b) =>
        Boolean(
          b &&
            typeof b === "object" &&
            typeof b.id === "string" &&
            typeof b.url === "string" &&
            isValidSafeUrl(b.url)
        ),
      DEFAULT_BOOKMARKS
    ).map((b) => ({
      ...b,
      url: sanitizeUrlForHistory(b.url),
      title: (b.title || b.url).slice(0, 100),
    }))
  );

  useEffect(() => {
    try {
      localStorage.setItem("netflow_bookmarks", JSON.stringify(bookmarks));
    } catch {}
  }, [bookmarks]);

  // Offline Capsules (Persisted to localStorage with corruption protection)
  const [offlineCapsules, setOfflineCapsules] = useState<OfflineCapsule[]>(() =>
    safeGetArray<OfflineCapsule>(
      "netflow_capsules",
      (c) =>
        Boolean(
          c &&
            typeof c === "object" &&
            typeof c.id === "string" &&
            typeof c.url === "string" &&
            typeof c.htmlContent === "string"
        ),
      []
    )
  );

  // History (Persisted to localStorage with corruption protection)
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    safeGetArray<HistoryEntry>(
      "netflow_history",
      (h) => Boolean(h && typeof h === "object" && typeof h.id === "string" && typeof h.url === "string"),
      []
    )
  );

  // Per-Site Privacy Overrides (Persisted to localStorage with corruption protection)
  const [siteOverrides, setSiteOverrides] = useState<Record<string, SitePrivacyOverride>>(() =>
    safeGetObject<Record<string, SitePrivacyOverride>>("netflow_site_overrides", {})
  );
  const siteOverridesRef = useRef<Record<string, SitePrivacyOverride>>(siteOverrides);
  siteOverridesRef.current = siteOverrides;

  // Total session savings (Persisted to localStorage with non-finite/negative number protection)
  const [totalSavedBytes, setTotalSavedBytes] = useState<number>(() =>
    safeGetNumber("netflow_saved_bytes", 2480000)
  );

  const [totalTrackersBlocked, setTotalTrackersBlocked] = useState<number>(34);

  // Tabs Management with crash-safe V2 session restore
  const sessionEngineRef = useRef<SessionPersistenceEngine | null>(null);
  if (!sessionEngineRef.current) {
    sessionEngineRef.current = createSessionPersistenceEngine();
  }
  const initialSessionRef = useRef<SessionLoadResult | null>(null);
  if (!initialSessionRef.current) {
    initialSessionRef.current = sessionEngineRef.current.loadSession();
  }

  const [tabs, setTabs] = useState<SessionTabRuntime[]>(
    () => initialSessionRef.current?.tabs || safeGetPersistedTabs()
  );
  const tabsRef = useRef<SessionTabRuntime[]>(tabs);
  tabsRef.current = tabs;
  const [activeTabId, setActiveTabId] = useState<string>(
    () => initialSessionRef.current?.activeTabId || safeGetActiveTabId(tabs)
  );
  const [showSessionRestoredBanner, setShowSessionRestoredBanner] = useState<boolean>(
    () => Boolean(initialSessionRef.current?.wasRestored)
  );
  const [postRestorePromptTabId, setPostRestorePromptTabId] = useState<string | null>(() =>
    initialSessionRef.current?.activeTabRequiresPostConfirm
      ? initialSessionRef.current.activeTabId
      : null
  );
  const restoredScrollPendingRef = useRef<Set<string>>(
    new Set(
      (initialSessionRef.current?.tabs || [])
        .filter((t) => typeof t.scrollY === "number" && t.scrollY > 0)
        .map((t) => t.id)
    )
  );
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<RecentlyClosedTab[]>([]);
  const inFlightControllersRef = useRef<Map<string, AbortController>>(new Map());
  const tabRequestEpochRef = useRef<Map<string, number>>(new Map());

  // Modals state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [networkModalTab, setNetworkModalTab] = useState<
    "engine" | "smart4g" | "callsafe" | "transitions" | "modes" | "boundaries"
  >("engine");

  // Smart 4G Preference state
  const [smart4GState, setSmart4GState] = useState<Smart4GPreferenceState>({
    enabled: true,
    voiceCallActive: false,
    degradationStatus: "optimal_4g",
    unnecessaryReconnectsPrevented: 14,
    sessionsPreservedCount: 3,
    antiFlappingDampeningActive: true,
  });

  // Call-Safe Architecture state
  const [callSafeState, setCallSafeState] = useState<CallSafeState>({
    currentPhase: "idle",
    callerOrRecipient: "+880 1711-000000",
    callStartTime: null,
    networkBeforeCall: "cellular_4g",
    networkAfterCall: null,
    callsHandledSuccessfully: 5,
    sessionsSafelyResumed: 5,
    forcedLteForbiddenAcknowledged: true,
  });

  const handleOpenNetworkModal = (
    tab: "engine" | "smart4g" | "callsafe" | "transitions" | "modes" | "boundaries" = "engine"
  ) => {
    setNetworkModalTab(tab);
    setIsNetworkModalOpen(true);
  };
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isSiteSettingsModalOpen, setIsSiteSettingsModalOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isDownloadsModalOpen, setIsDownloadsModalOpen] = useState(false);
  const [persistedDownloads, setPersistedDownloads] = useState<PersistedDownloadRecord[]>([]);
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [isTabSwitcherOpen, setIsTabSwitcherOpen] = useState(false);
  const [isPromiseModalOpen, setIsPromiseModalOpen] = useState(false);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
  const [isFindInPageOpen, setIsFindInPageOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [recoveryResetEpoch, setRecoveryResetEpoch] = useState(0);
  const [promiseModalTab, setPromiseModalTab] = useState<
    "covenant" | "values" | "workbench" | "boundaries"
  >("values");
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);

  const handleOpenPromiseModal = (
    tab: "covenant" | "values" | "workbench" | "boundaries" = "values"
  ) => {
    setPromiseModalTab(tab);
    setIsPromiseModalOpen(true);
  };

  // Active tab reference
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  const restoreClosedTabRef = useRef<(() => void) | null>(null);
  const zoomInRef = useRef<(() => void) | null>(null);
  const zoomOutRef = useRef<(() => void) | null>(null);
  const zoomResetRef = useRef<(() => void) | null>(null);
  const handleNavigateRef = useRef<((url: string, tabId?: string, isHistoryNav?: boolean) => void) | null>(null);

  // Keyboard shortcut: Ctrl+F / Cmd+F for Find in Page, Ctrl+Shift+T / Cmd+Shift+T to restore closed tab, Ctrl+(+/-/0) for Zoom, Ctrl+J / Cmd+J for Downloads Manager
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        restoreClosedTabRef.current?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsDownloadsModalOpen((prev) => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (activeTab && activeTab.url) {
          e.preventDefault();
          setIsFindInPageOpen((prev) => !prev);
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomInRef.current?.();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        zoomOutRef.current?.();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        zoomResetRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  // Load persisted non-private downloads on initial mount and reconcile with Android DownloadManager
  useEffect(() => {
    try {
      const list = downloadPersistenceManagerRef.current.loadPersistedDownloads();
      setPersistedDownloads(list);
      const reconcileIds = list
        .filter(
          (d) =>
            !d.isPrivate &&
            d.lifecycleState !== DownloadLifecycleState.COMPLETED &&
            d.lifecycleState !== DownloadLifecycleState.FAILED
        )
        .map((d) => d.downloadId);
      if (reconcileIds.length > 0) {
        nativeBrowserEngineRef.current?.reconcileDownloads({ downloadIds: reconcileIds });
      }
    } catch {}
  }, []);

  // Save capsules & history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("netflow_capsules", JSON.stringify(offlineCapsules));
    } catch {}
  }, [offlineCapsules]);

  useEffect(() => {
    try {
      localStorage.setItem("netflow_history", JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem("netflow_site_overrides", JSON.stringify(siteOverrides));
    } catch {}
  }, [siteOverrides]);

  useEffect(() => {
    try {
      localStorage.setItem("netflow_saved_bytes", String(totalSavedBytes));
    } catch {}
  }, [totalSavedBytes]);

  // SESSION-V2: Debounced (250ms) atomic session persistence on tab / navigation / mode changes
  useEffect(() => {
    sessionEngineRef.current?.scheduleSave(tabs, activeTabId, browsingMode);
  }, [tabs, activeTabId, browsingMode]);

  // FORM 30 (Fix 4): Session Restore Auto-Fetch
  // After a tab is successfully restored, trigger a lightweight auto-fetch for the active tab: handleNavigate(activeTab.url, activeTab.id, true)
  // Ensure isLoading is set to true during this fetch to prevent white screen.
  const sessionRestoreAutoFetchedRef = useRef(false);
  useEffect(() => {
    if (sessionRestoreAutoFetchedRef.current) return;
    if (activeTab && activeTab.url && activeTab.url.trim() && !activeTab.contentHtml) {
      if (activeTab.lastMethod === "POST") {
        setPostRestorePromptTabId(activeTab.id);
      } else {
        sessionRestoreAutoFetchedRef.current = true;
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTab.id ? { ...t, isLoading: true } : t))
        );
        setTimeout(() => {
          handleNavigateRef.current?.(activeTab.url, activeTab.id, true);
        }, 0);
      }
    }
  }, [activeTab]);

  // SESSION-V2: Attach visibilitychange=hidden, pagehide, and dirty-only periodic checkpoint listeners
  useEffect(() => {
    const engine = sessionEngineRef.current;
    if (!engine) return;
    const detach = engine.attachLifecycleListeners();
    return () => {
      engine.flushNow(tabsRef.current, activeTabId, browsingMode);
      detach();
    };
  }, [activeTabId, browsingMode]);

  // SESSION-V2: Capture scrollY on host-owned non-iframe renderer without touching iframe sandbox
  useEffect(() => {
    const current = tabsRef.current.find((t) => t.id === activeTabId);
    if (!current || !isScrollCapturableForTab(current, browsingMode)) {
      return;
    }

    const container = document.getElementById("netflow_webview_container");
    if (!container) return;

    // If this tab had a restored scrollY pending after content load, apply it once
    if (
      !current.isLoading &&
      current.contentHtml &&
      restoredScrollPendingRef.current.has(current.id) &&
      typeof current.scrollY === "number" &&
      current.scrollY > 0
    ) {
      restoredScrollPendingRef.current.delete(current.id);
      requestAnimationFrame(() => {
        try {
          container.scrollTop = current.scrollY || 0;
        } catch {}
      });
    }

    const handleScroll = () => {
      const nextScrollY = Math.max(0, Math.round(container.scrollTop || 0));
      let changed = false;
      tabsRef.current = tabsRef.current.map((t) => {
        if (t.id !== activeTabId) return t;
        if (!isScrollCapturableForTab(t, browsingMode)) {
          if (t.scrollY !== null) {
            changed = true;
            return { ...t, scrollY: null };
          }
          return t;
        }
        if (t.scrollY !== nextScrollY) {
          changed = true;
          return { ...t, scrollY: nextScrollY };
        }
        return t;
      });
      if (changed) {
        sessionEngineRef.current?.markDirty(tabsRef.current, activeTabId, browsingMode);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [activeTabId, activeTab?.url, activeTab?.contentHtml, activeTab?.isLoading, activeTab?.isNativeWebView, activeTab?.renderMode, browsingMode]);

  // Download Persistence & Interrupted-Download Recovery Reconciliation on startup
  useEffect(() => {
    try {
      downloadPersistenceManagerRef.current.purgeCorruptedRecords();
      const audit = downloadPersistenceManagerRef.current.auditPersistenceIntegrity();
      if (audit.interruptedCount > 0 || audit.resumableCount > 0) {
        // Interrupted downloads reconciled and ready for recovery
      }
    } catch (e) {
      console.warn("[DownloadPersistence] Initialization reconciliation error:", e);
    }
  }, []);

  // Clean up any remaining in-flight abort controllers and timers on unmount
  useEffect(() => {
    return () => {
      inFlightControllersRef.current.forEach((ctrl) => {
        try {
          ctrl.abort();
        } catch {}
      });
      inFlightControllersRef.current.clear();
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
      callTimersRef.current.forEach((t) => clearTimeout(t));
      callTimersRef.current = [];
    };
  }, []);

  // Detect real connection if available (Form 9 Part D: explicit offline/online transition handling)
  useEffect(() => {
    const handleBrowserOnline = () => {
      setNetworkState((prev) => ({
        ...prev,
        isOnline: true,
        internetAvailable: true,
        ...(prev.medium === "offline" && !prev.isSimulated ? { medium: "wifi" } : {}),
      }));
    };
    const handleBrowserOffline = () => {
      setNetworkState((prev) => ({
        ...prev,
        isOnline: false,
        internetAvailable: false,
      }));
    };

    window.addEventListener("online", handleBrowserOnline);
    window.addEventListener("offline", handleBrowserOffline);

    const navConn = (navigator as any).connection;
    let handleConnChange: (() => void) | null = null;
    if (navConn) {
      handleConnChange = () => {
        setNetworkState((prev) => {
          if (prev.isSimulated) return prev;
          const effType = navConn.effectiveType || "4g";
          return {
            ...prev,
            effectiveType: effType,
            downlinkMbps: navConn.downlink || 10,
            rttMs: navConn.rtt || 45,
            type: effType.includes("2g") ? "2g" : effType.includes("3g") ? "3g" : "4g",
          };
        });
      };
      navConn.addEventListener("change", handleConnChange);
      handleConnChange();
    }

    return () => {
      window.removeEventListener("online", handleBrowserOnline);
      window.removeEventListener("offline", handleBrowserOffline);
      if (navConn && handleConnChange) {
        navConn.removeEventListener("change", handleConnChange);
      }
    };
  }, []);

  // Low-RAM manager: auto-suspend background tabs if limit exceeded
  useEffect(() => {
    if (!performanceConfig.lowRamMode) return;
    const maxActive = performanceConfig.maxActiveTabs;
    if (tabs.length <= maxActive) return;

    // Find tabs other than activeTab to put to sleep
    setTabs((currentTabs) => {
      let activeCount = 0;
      return currentTabs.map((tab) => {
        if (tab.id === activeTabId) {
          activeCount++;
          return { ...tab, isSuspended: false };
        }
        if (activeCount < maxActive) {
          activeCount++;
          return tab;
        }
        // NATIVE-17: Suspend persistent connections for background low-RAM tabs
        webSocketManagerRef.current.onHostPause(tab.id);
        // NATIVE-18: Suspend background tasks for background low-RAM tabs
        storageManagerRef.current.onHostPause(tab.id);
        // NATIVE-19: Suspend page lifecycle to "frozen" state for background low-RAM tab
        pageLifecycleManagerRef.current.suspendTab(tab.id);
        // NATIVE-30: Suspend rendering and clear active animation frames for background low-RAM tab
        renderingResilienceManagerRef.current.suspendTabRendering(tab.id);
        return { ...tab, isSuspended: true };
      });
    });
  }, [activeTabId, tabs.length, performanceConfig.lowRamMode, performanceConfig.maxActiveTabs]);

  // Stop loading in-flight request
  const handleStopLoading = useCallback((tabId = activeTabId) => {
    tabRequestEpochRef.current.set(tabId, (tabRequestEpochRef.current.get(tabId) || 0) + 1);
    const controller = inFlightControllersRef.current.get(tabId);
    if (controller) {
      controller.abort();
      inFlightControllersRef.current.delete(tabId);
    }
    // NATIVE-17: Abort pending connecting WebSockets on stop loading
    webSocketManagerRef.current.onStopLoading(tabId);
    // NATIVE-19: Invalidate pending lifecycle callbacks on stop loading
    pageLifecycleManagerRef.current.onStopLoading(tabId);
    // NATIVE-20: Dismiss and auto-cancel pending JavaScript dialogs on stop loading
    dialogManagerRef.current.onStopLoading(tabId);
    // NATIVE-21: Cancel pending HTTP authentication and client certificate challenges on stop loading
    httpAuthManagerRef.current.onStopLoading(tabId);
    // NATIVE-22: Cancel pending connecting WebRTC peer connections on stop loading
    webRtcManagerRef.current.onStopLoading(tabId);
    // NATIVE-23: Cancel pending Display Media consent prompts on stop loading
    displayMediaManagerRef.current.onStopLoading(tabId);
    // NATIVE-24: Cancel pending Blob downloads on stop loading
    blobDownloadManagerRef.current.onStopLoading(tabId);
    // NATIVE-25: Cancel pending generated file downloads and in-flight FileReaders on stop loading
    fileSystemManagerRef.current.onStopLoading(tabId);
    // NATIVE-26: Cancel pending clipboard and share consent prompts on stop loading
    clipboardAndShareManagerRef.current.onStopLoading(tabId);
    // NATIVE-11/15/16: Cancel pending media, geolocation, and notification prompts on stop loading
    geolocationManagerRef.current.onNavigation(tabId, "");
    notificationManagerRef.current.onNavigation(tabId, "");
    mediaPermissionManagersRef.current.get(tabId)?.onNavigation("");
    // NATIVE-12: Pause active media playback and exit custom view on stop loading
    getMediaPlaybackManager(tabId).pauseAllMedia();
    // NATIVE-27: Clean up pending media preloads on stop loading
    backgroundMediaManagerRef.current.onStopLoading(tabId);
    // NATIVE-28: Cancel in-flight uninitialized media sessions on stop loading
    mediaSessionGovernanceManagerRef.current.onStopLoading(tabId);
    // NATIVE-29: Reclaim unstarted or unreferenced media resources on stop loading
    mediaResourceManagerRef.current.onStopLoading(tabId);
    // NATIVE-30: Clean up pending unexecuted animation frames and rendering observers on stop loading
    renderingResilienceManagerRef.current.onStopLoading(tabId);
    // NATIVE-31: Transition page state to aborted and cancel pending DOM/JS lifecycle callbacks
    pageLifecycleSafetyManagerRef.current.onStopLoading(tabId);
    // NATIVE-32: Transition recovering errors to aborted and cancel in-flight recovery callbacks on stop loading
    errorRecoveryLifecycleManagerRef.current.onStopLoading(tabId);
    // NATIVE-33: Abort active request timeout timer and transition stage to ABORTED on stop loading
    requestTimeoutManagerRef.current.onStopLoading(tabId);
    // NATIVE-35: Invalidate pending download requests and abort in-flight transfers on stop loading
    downloadRequestLifecycleManagerRef.current.getDownloadsForTab(tabId).forEach((d) => {
      if (d.state !== DownloadLifecycleState.COMPLETED && d.state !== DownloadLifecycleState.FAILED && !d.isPrivate) {
        downloadPersistenceManagerRef.current.markDownloadInterrupted(d.downloadId, "Tab navigation interruption");
      }
    });
    downloadRequestLifecycleManagerRef.current.onTabNavigation(tabId, "");
    // NATIVE-36: Cleanup in-flight temporary staging downloads on stop loading
    downloadCompletionIntegrityManagerRef.current.onTabNavigation(tabId);
    // NATIVE-37: Advance download recovery audit epoch on stop loading
    downloadRecoveryAuditManagerRef.current.onTabNavigation(tabId);
    // NATIVE-38: Advance download resumption epoch and pause active streams on stop loading
    downloadResumptionManagerRef.current.onTabNavigation(tabId);
    // NATIVE-40A: Stop loading on navigation controller
    const navCtrlStop = navigationControllersRef.current.get(tabId);
    if (navCtrlStop) {
      navCtrlStop.stopLoading();
    }
    // FORM-N2: Stop loading on native Android Chromium WebView engine
    nativeBrowserEngineRef.current?.stopLoading(tabId);
    // FORM-B2: Notify network resilience coordinator of stop loading
    resilienceCoordinatorRef.current?.onStopLoading(tabId);
    setResilienceUiTick((n) => n + 1);
    // NATIVE-34: Abort active redirect chain on stop loading
    redirectChainManagerRef.current.onTabNavigation(tabId, "");
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const previousUrl = t.history[t.historyIndex] ?? "";
        return {
          ...t,
          url: t.contentHtml ? previousUrl || t.url : previousUrl,
          isLoading: false,
        };
      })
    );
  }, [activeTabId]);

  // Navigate URL function
  const handleNavigate = useCallback(
    async (
      targetUrl: string,
      tabId = activeTabId,
      isHistoryNav = false,
      targetHistoryIndex?: number,
      overrideMode?: BrowsingMode,
      formOptions?: FormSubmitOptions
    ) => {
      const trimmed = targetUrl.trim();
      if (!trimmed) return;

      if (tabId && tabId !== activeTabId) {
        setActiveTabId(tabId);
      }

      if (tabId === activeTabId) {
        setIsFindInPageOpen(false);
      }

      // Check if this navigation will execute on the Native Android WebView path
      const preNavTab = tabs.find((t) => t.id === tabId);
      const preDomain = getCleanDomain(trimmed);
      const preOverride = preDomain ? siteOverrides[preDomain] : undefined;
      const preModeInfo = resolveEffectiveBrowsingMode({
        globalMode: browsingMode,
        explicitOverrideMode: overrideMode,
        tabLightMode: preNavTab?.lightMode,
        tabOverrideMode: preNavTab?.tabBrowsingMode,
        isReaderModeTab: overrideMode ? overrideMode === "reader" : preNavTab?.isReaderMode,
        siteOverride: preOverride,
        networkState,
        autoAdaptToWeakNetwork: networkPolicy.autoAdaptToWeakNetwork,
      });
      const isNativeOmniboxPath = Boolean(
        nativeBrowserEngineRef.current?.shouldUseNativeWebView(
          preModeInfo.effectiveMode,
          Boolean(preNavTab?.isPrivate)
        )
      );

      // URL scheme normalization & Shared Omnibox Search/URL routing (NETFLOW-CHROME-LIKE-UX-01 Part A & Form 9 Part C)
      const omniboxRes = resolveNativeOmniboxInput(trimmed, searchEngineIdRef.current);
      let normalizedUrl = trimmed;
      if (isNativeOmniboxPath) {
        if (omniboxRes.kind === "blocked") {
          const blockedEpoch = (tabRequestEpochRef.current.get(tabId) || 0) + 1;
          tabRequestEpochRef.current.set(tabId, blockedEpoch);
          nativeBrowserEngineRef.current?.loadUrl(tabId, trimmed, {
            isPrivate: Boolean(preNavTab?.isPrivate),
            siteMode: preNavTab?.siteMode || "default",
            zoomLevel: preNavTab?.zoomLevel || 100,
            requestEpoch: blockedEpoch,
            searchEngineId: searchEngineIdRef.current,
          });
          return;
        }
        normalizedUrl = omniboxRes.resolvedUrl;
      } else if (omniboxRes.kind === "url") {
        normalizedUrl = omniboxRes.resolvedUrl;
      } else if (omniboxRes.kind === "search") {
        normalizedUrl = omniboxRes.searchQuery || trimmed;
      } else {
        normalizedUrl = omniboxRes.resolvedUrl || trimmed;
      }

      // FORM 56 / 53 Task 1 & 2: YouTube URL Interceptor & Direct Routing
      const ytVideoId = extractYouTubeVideoId(normalizedUrl);
      if (ytVideoId && !normalizedUrl.includes("/embed/")) {
        normalizedUrl = `https://www.youtube.com/embed/${ytVideoId}`;
      }

      if (isYouTubeUrl(normalizedUrl)) {
        if (ytVideoId) {
          // Commit directly to YouTube Embed Player without unneeded proxy call
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id !== tabId) return t;
              const safeHist = t.history || [];
              const nextHist = isHistoryNav ? safeHist : [...safeHist.slice(0, (t.historyIndex ?? 0) + 1), normalizedUrl];
              const nextIdx = isHistoryNav ? (targetHistoryIndex ?? t.historyIndex ?? 0) : nextHist.length - 1;
              return {
                ...t,
                url: normalizedUrl,
                title: "YouTube Player",
                contentHtml: "",
                isLoading: false,
                error: undefined,
                errorInfo: undefined,
                history: nextHist,
                historyIndex: nextIdx,
                isNativeWebView: false,
                renderMode: "native_webview",
              };
            })
          );
          return;
        } else {
          // Commit directly to Smart YouTube Fallback Portal
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id !== tabId) return t;
              const safeHist = t.history || [];
              const nextHist = isHistoryNav ? safeHist : [...safeHist.slice(0, (t.historyIndex ?? 0) + 1), normalizedUrl];
              const nextIdx = isHistoryNav ? (targetHistoryIndex ?? t.historyIndex ?? 0) : nextHist.length - 1;
              return {
                ...t,
                url: normalizedUrl,
                title: "YouTube",
                contentHtml: "",
                isLoading: false,
                error: undefined,
                errorInfo: undefined,
                history: nextHist,
                historyIndex: nextIdx,
                isNativeWebView: false,
                renderMode: "sanitized_html",
              };
            })
          );
          return;
        }
      }

      // Controlled Safe Google Sign-In & OAuth External-Browser Fallback
      // Intercepts navigation before fetching proxy to prevent credential exposure & broken rendering
      if (isGoogleAuthOrOAuthUrl(normalizedUrl)) {
        const promptId = `google-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setGoogleAuthPrompt({
          id: promptId,
          tabId,
          targetUrl: normalizedUrl,
          sourceDomain: getCleanDomain(normalizedUrl),
          serviceName: classifyGoogleAuthFlow(normalizedUrl).serviceName,
          reason:
            "Proxy rendering does not support dynamic client-side JavaScript execution required by Google OAuth / Sign-in. Opening in an external browser ensures secure, direct authentication.",
          timestamp: Date.now(),
        });

        // Ensure tab is not left in an active loading spinner
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  isLoading: false,
                }
              : t
          )
        );
        return;
      }

      // Safe Blob and binary Data URI delegation: Download directly rather than routing to proxy server
      if (
        normalizedUrl.startsWith("blob:") ||
        (normalizedUrl.startsWith("data:") && !normalizedUrl.startsWith("data:text/html"))
      ) {
        handleInitiateDownload(normalizedUrl);
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  isLoading: false,
                }
              : t
          )
        );
        return;
      }

      // Assign an incremental request epoch for this specific tab to strictly protect against stale responses
      const requestEpoch = (tabRequestEpochRef.current.get(tabId) || 0) + 1;
      tabRequestEpochRef.current.set(tabId, requestEpoch);

      // Cancel any ongoing fetch on this tab
      const existingCtrl = inFlightControllersRef.current.get(tabId);
      if (existingCtrl) {
        existingCtrl.abort();
      }
      const controller = new AbortController();
      inFlightControllersRef.current.set(tabId, controller);

      // NATIVE-15: Revoke non-retained geolocation grants and cancel pending geolocation prompts on navigation
      geolocationManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-16: Revoke non-retained notification grants and cancel pending notification prompts on navigation
      notificationManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-11: Revoke media permission grants and clear pending requests on navigation
      mediaPermissionManagersRef.current.get(tabId)?.onNavigation(normalizedUrl);

      // NATIVE-17: Close persistent WebSocket connections on navigation away
      webSocketManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-18: Maintain storage and Service Worker boundary consistency on navigation
      const currentNavTab = tabs.find((t) => t.id === tabId);
      storageManagerRef.current.onNavigation(tabId, currentNavTab?.url || "", normalizedUrl, currentNavTab?.isPrivate);

      // NATIVE-19: Sync page lifecycle state machine and increment epoch on navigation
      pageLifecycleManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-20: Dismiss and auto-cancel pending JavaScript dialogs on navigation away
      dialogManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-21: Cancel pending HTTP authentication and client certificate challenges on navigation
      httpAuthManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-22: Close all WebRTC peer connections and media tracks on navigation
      webRtcManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-23: Stop all active Display Media screen capture sessions on navigation
      displayMediaManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-24: Revoke and purge all Object URLs and abort pending blob downloads on navigation
      blobDownloadManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-25: Abort in-flight FileReaders and purge generated files on navigation
      fileSystemManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-26: Cancel pending clipboard and share consent prompts on navigation
      clipboardAndShareManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-12: Exit custom view / fullscreen and stop media playback on navigation
      getMediaPlaybackManager(tabId).onNavigationOrStop();

      // NATIVE-27: Release audio focus and stop active media playback on navigation
      backgroundMediaManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-28: Stop and terminate all governed media sessions on navigation
      mediaSessionGovernanceManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-29: Release media decoders and buffers on navigation
      mediaResourceManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-30: Increment render epoch, clear animation frames & render listeners on navigation
      renderingResilienceManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-31: Advance lifecycle epoch, track loading start, and invalidate prior DOM/JS callbacks
      const { newEpoch: pageLifecycleEpoch } = pageLifecycleSafetyManagerRef.current.onPageStarted(tabId, normalizedUrl);

      // NATIVE-32: Advance recovery epoch, reset error state, and invalidate prior error recovery callbacks on navigation
      const { newEpoch: errorRecoveryEpoch } = errorRecoveryLifecycleManagerRef.current.onNavigation(tabId, normalizedUrl);

      // NATIVE-33: Advance request timeout epoch, cancel prior timeout timer and start timeout monitoring
      const { timeoutEpoch } = requestTimeoutManagerRef.current.startRequestTimeout(tabId, normalizedUrl, {
        isPrivate: currentNavTab?.isPrivate,
      });

      // NATIVE-35: Advance download lifecycle epoch and cancel pending/in-flight download requests on navigation
      downloadRequestLifecycleManagerRef.current.getDownloadsForTab(tabId).forEach((d) => {
        if (d.state !== DownloadLifecycleState.COMPLETED && d.state !== DownloadLifecycleState.FAILED && !d.isPrivate) {
          downloadPersistenceManagerRef.current.markDownloadInterrupted(d.downloadId, "Tab navigation interruption");
        }
      });
      downloadRequestLifecycleManagerRef.current.onTabNavigation(tabId, normalizedUrl);

      // NATIVE-36: Cleanup in-flight temporary staging downloads on navigation
      downloadCompletionIntegrityManagerRef.current.onTabNavigation(tabId);

      // NATIVE-37: Advance download recovery audit epoch on navigation
      downloadRecoveryAuditManagerRef.current.onTabNavigation(tabId);

      // NATIVE-38: Advance download resumption epoch and pause active streams on navigation
      downloadResumptionManagerRef.current.onTabNavigation(tabId);

      // NATIVE-34: Advance redirect chain epoch and reset active redirect chain on navigation
      redirectChainManagerRef.current.onTabNavigation(tabId, normalizedUrl);
      redirectChainManagerRef.current.startChain({
        tabId,
        initialUrl: normalizedUrl,
        isPrivate: currentNavTab?.isPrivate,
      });

      // NATIVE-40A: Signal page started on navigation controller
      const navCtrlStart = navigationControllersRef.current.get(tabId);
      if (navCtrlStart) {
        navCtrlStart.onPageStarted(normalizedUrl);
      }

      const navMethod: "GET" | "POST" = formOptions?.method === "POST" ? "POST" : "GET";
      setPostRestorePromptTabId((prev) => (prev === tabId ? null : prev));

      // FORM-B2: Record navigation start in network resilience coordinator
      resilienceCoordinatorRef.current?.pageStarted(tabId, normalizedUrl, {
        method: navMethod,
        isPrivate: Boolean(currentNavTab?.isPrivate),
      });
      setResilienceUiTick((n) => n + 1);

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                url: normalizedUrl,
                isLoading: true,
                error: undefined,
                errorInfo: undefined,
                partialContentNotice: false,
                isSuspended: false,
                translation: undefined,
                lastMethod: navMethod,
                ...(overrideMode ? { tabBrowsingMode: overrideMode, lightMode: overrideMode !== "full" } : {}),
              }
            : t
        )
      );

      try {
        const targetDomain = getCleanDomain(normalizedUrl);
        const targetOverride = siteOverrides[targetDomain];
        const resolvedModeInfo = resolveEffectiveBrowsingMode({
          globalMode: browsingMode,
          explicitOverrideMode: overrideMode,
          tabLightMode: currentNavTab?.lightMode,
          tabOverrideMode: currentNavTab?.tabBrowsingMode,
          isReaderModeTab: overrideMode ? overrideMode === "reader" : currentNavTab?.isReaderMode,
          siteOverride: targetOverride,
          networkState,
          autoAdaptToWeakNetwork: networkPolicy.autoAdaptToWeakNetwork,
        });
        const mode = resolvedModeInfo.effectiveMode;

        // Check if device is completely offline
        if (!navigator.onLine || networkState.medium === "offline") {
          const matchingOfflineCap = findMatchingOfflineCapsule(normalizedUrl, offlineCapsules);
          if (matchingOfflineCap && !currentNavTab?.isPrivate) {
            resilienceCoordinatorRef.current?.pageFinished(tabId, normalizedUrl);
            setResilienceUiTick((n) => n + 1);
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      url: matchingOfflineCap.url,
                      title: `[Offline] ${matchingOfflineCap.title}`,
                      contentHtml: matchingOfflineCap.contentHtml,
                      rawText: matchingOfflineCap.rawText,
                      isLoading: false,
                      error: undefined,
                      errorInfo: undefined,
                      stats: computeHonestPageStats({
                        originalBytes: matchingOfflineCap.byteSize,
                        transferredBytes: 0,
                        loadTimeMs: 8,
                        isHttps: matchingOfflineCap.url.startsWith("https://"),
                      }),
                    }
                  : t
              )
            );
            return;
          }
          const offlineErr: any = new Error(
            lang === "bn"
              ? "আপনি বর্তমানে অফলাইনে আছেন। ইন্টারনেট সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।"
              : "You are currently offline. Please reconnect to mobile data or Wi-Fi."
          );
          offlineErr.kind = "offline";
          offlineErr.errorCode = "ERR_INTERNET_DISCONNECTED";
          throw offlineErr;
        }

        const shouldBlockTrackers = targetOverride?.allowTrackers ? false : privacyConfig.blockTrackers;
        const proxyAllowedForTarget = canUseProxyFallback(normalizedUrl, {
          isPrivate: currentNavTab?.isPrivate,
          lightMode: resolvedModeInfo.lightMode,
          lastMethod: navMethod,
        });

        // FORM-N2 & FORM-B2: Primary Browser Engine Execution Path on Native Android (System Chromium WebView)
        // Normal non-private browsing (mode === "full") or sensitive/login/checkout/bank URLs (!proxyAllowedForTarget)
        // execute directly in Android android.webkit.WebView; LightModePolicy is applied without disabling JS.
        if (
          nativeBrowserEngineRef.current?.shouldUseNativeWebView(
            mode,
            Boolean(currentNavTab?.isPrivate)
          ) ||
          (nativeBrowserEngineRef.current?.isNativeEngineAvailable() &&
            (!currentNavTab?.isPrivate || nativeCapabilities.privateIsolation) &&
            !proxyAllowedForTarget)
        ) {
          nativeBrowserEngineRef.current.setLightMode(tabId, {
            lightMode: resolvedModeInfo.lightMode,
            ...resolvedModeInfo.policy,
          });
          const dispatchRes = nativeBrowserEngineRef.current.loadUrl(tabId, normalizedUrl, {
            isPrivate: Boolean(currentNavTab?.isPrivate),
            siteMode: currentNavTab?.siteMode || "default",
            zoomLevel: currentNavTab?.zoomLevel || 100,
            javascriptAllowed: targetOverride?.javascript !== "block",
            popupsAllowed: targetOverride?.popups !== "block",
            requestEpoch,
          });
          if (!dispatchRes.dispatched) {
            requestTimeoutManagerRef.current.onStopLoading(tabId);
            return;
          }
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    url: normalizedUrl,
                    isNativeWebView: true,
                    renderMode: "native_webview",
                    lightMode: resolvedModeInfo.lightMode,
                    lightModePolicy: resolvedModeInfo.policy,
                    isLoading: true,
                    isReaderMode: false,
                    error: undefined,
                    errorInfo: undefined,
                    scrollY: null,
                  }
                : t
            )
          );
          return;
        }

        // Form 57: Guard against localhost proxy calls on native Android APK
        if (nativeBrowserEngineRef.current?.isNativeEngineAvailable()) {
          console.warn("[NETFLOW Navigation] Blocked proxy fallback on Native Android host.");
          return;
        }

        const res = await apiFetch("/api/browse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            url: normalizedUrl,
            mode,
            blockTrackers: shouldBlockTrackers,
            blockImages: privacyConfig.blockHeavyImages || mode === "text-only",
            httpMethod: formOptions?.method || "GET",
            postBody: formOptions?.postBody,
            postContentType: formOptions?.contentType,
            tabId,
            siteMode: currentNavTab?.siteMode || "default",
            searchEngineId: searchEngineIdRef.current,
          }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        const isStale = () =>
          controller.signal.aborted ||
          tabRequestEpochRef.current.get(tabId) !== requestEpoch ||
          inFlightControllersRef.current.get(tabId) !== controller ||
          !requestTimeoutManagerRef.current.isEpochCurrent(tabId, timeoutEpoch);

        // If this request was aborted or superseded by a newer navigation on this tab, discard response
        if (isStale()) {
          return;
        }

        if (!res.ok || !data?.success) {
          const httpStatus =
            typeof data?.statusCode === "number"
              ? data.statusCode
              : !res.ok
              ? res.status
              : undefined;
          const userFriendlyError =
            data?.error ||
            (httpStatus === 504
              ? "Connection timed out. The destination server took too long to respond."
              : httpStatus === 503
              ? "The destination website is temporarily unavailable or undergoing maintenance (HTTP 503)."
              : httpStatus === 502
              ? "Upstream gateway failure (HTTP 502). Invalid response from the remote server."
              : httpStatus === 500
              ? "Target website encountered an internal server error (HTTP 500)."
              : httpStatus === 429
              ? "Upstream rate limit reached (HTTP 429 Too Many Requests)."
              : httpStatus === 403
              ? "Access to this website was restricted or denied by the remote server (HTTP 403 Forbidden)."
              : httpStatus === 404
              ? "The requested page was not found on this server (HTTP 404 Not Found)."
              : httpStatus === 400
              ? "Please enter a valid website address."
              : "Could not connect to the destination server. Please check your network and try again.");
          const customErr: any = new Error(userFriendlyError);
          customErr.statusCode = httpStatus;
          customErr.errorCode = data?.errorCode;
          customErr.errorCategory = data?.errorCategory;
          throw customErr;
        }

        // Re-verify controller and epoch are still active before committing tab state and history
        if (isStale()) {
          return;
        }

        // NATIVE-34: Complete redirect chain on navigation success with hop validation BEFORE marking pageFinished
        const activeChain = redirectChainManagerRef.current.getActiveChainForTab(tabId);
        if (activeChain) {
          const isInternalSearchScheme =
            typeof data.url === "string" && data.url.startsWith("search://");
          if (data.url && data.url !== normalizedUrl && !isInternalSearchScheme) {
            const hopResult = redirectChainManagerRef.current.recordHop({
              chainId: activeChain.chainId,
              tabId,
              targetUrl: data.url,
              statusCode: 302,
            });
            if (!hopResult.allowed) {
              const blockReason = hopResult.errorMessage || "Unsafe redirect target blocked";
              redirectChainManagerRef.current.abortChain(activeChain.chainId, blockReason);
              const friendlyRedirectMsg =
                translations[lang]?.errorState?.redirectBlockDesc ||
                "This web address or redirect target was blocked by NETFLOW security protection.";
              const redirectErrorInfo: WebPageErrorInfo = {
                errorCode: "NETFLOW_REDIRECT_BLOCKED",
                kind: "security",
                failedUrl: sanitizeUrlForErrorDisplay(normalizedUrl),
                timestamp: Date.now(),
                retryAttempts: 0,
                hasCachedContent: Boolean(currentNavTab?.contentHtml),
                hasOfflineCapsule: Boolean(
                  findMatchingOfflineCapsule(normalizedUrl, offlineCapsules) ||
                    findMatchingOfflineCapsule(currentNavTab?.url, offlineCapsules)
                ),
                errorDescription: friendlyRedirectMsg,
                technicalDetails: redactTechnicalDetailsForDiagnostics(
                  `Redirect blocked: ${blockReason}`
                ),
              };
              resilienceCoordinatorRef.current?.mainFrameError(
                tabId,
                redirectErrorInfo.errorCode,
                {
                  url: normalizedUrl,
                  description: friendlyRedirectMsg,
                }
              );
              setResilienceUiTick((n) => n + 1);
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === tabId
                    ? {
                        ...t,
                        isLoading: false,
                        error: friendlyRedirectMsg,
                        errorInfo: redirectErrorInfo,
                      }
                    : t
                )
              );
              return;
            }
          }
          if (!isInternalSearchScheme) {
            redirectChainManagerRef.current.completeChain({
              chainId: activeChain.chainId,
              tabId,
              finalUrl: data.url || normalizedUrl,
            });
          }
        }

        // NATIVE-31: Transition page lifecycle state to DOM_CONTENT_LOADED and LOADED for current epoch
        pageLifecycleSafetyManagerRef.current.onDOMContentLoaded(tabId, pageLifecycleEpoch);
        pageLifecycleSafetyManagerRef.current.onPageFinished(tabId, pageLifecycleEpoch);

        // NATIVE-32: Mark recovery success on successful page content arrival
        const currentRecEpoch = errorRecoveryLifecycleManagerRef.current.getTabRecord(tabId)?.recoveryEpoch || 1;
        errorRecoveryLifecycleManagerRef.current.markRecoverySuccess(tabId, currentRecEpoch);

        // NATIVE-33: Mark request success and clear timeout monitors
        requestTimeoutManagerRef.current.markRequestSuccess(tabId, timeoutEpoch);

        // FORM-B2: Signal pageFinished on network resilience coordinator
        resilienceCoordinatorRef.current?.pageFinished(tabId, data.url || normalizedUrl);
        setResilienceUiTick((n) => n + 1);
        const honestStats = computeHonestPageStats(data.stats);

        // If destination server redirected into a Google Auth or OAuth flow
        if (data.url && isGoogleAuthOrOAuthUrl(data.url)) {
          const promptId = `google-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setGoogleAuthPrompt({
            id: promptId,
            tabId,
            targetUrl: data.url,
            sourceDomain: getCleanDomain(data.url),
            serviceName: classifyGoogleAuthFlow(data.url).serviceName,
            reason:
              "The target website redirected to Google Sign-In / OAuth. This flow requires an external browser to complete securely.",
            timestamp: Date.now(),
          });
        }

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;

            const currentHistoryUrl = t.history[t.historyIndex];
            const isDuplicateConsecutive = !isHistoryNav && currentHistoryUrl === data.url;

            const updatedHistory = isHistoryNav
              ? t.history
              : isDuplicateConsecutive
              ? [...t.history.slice(0, t.historyIndex + 1)]
              : [...t.history.slice(0, t.historyIndex + 1), data.url];
            const updatedIndex = isHistoryNav
              ? (targetHistoryIndex ?? t.historyIndex)
              : isDuplicateConsecutive
              ? t.historyIndex
              : updatedHistory.length - 1;

            const isFullBrowsingMode = (mode as BrowsingMode) === "full";
            const isIframeRender = Boolean(
              (data.isNativeWebView ?? isFullBrowsingMode) ||
                (data.renderMode ?? (isFullBrowsingMode ? "native_webview" : "sanitized_html")) ===
                  "native_webview"
            );

            return {
              ...t,
              url: data.url,
              title: data.title || normalizedUrl,
              contentHtml: data.contentHtml,
              rawText: data.rawText,
              stats: honestStats,
              securityAudit: data.securityAudit,
              downloadMetadata: data.downloadMetadata,
              isNativeWebView: data.isNativeWebView ?? isFullBrowsingMode,
              renderMode: data.renderMode ?? (isFullBrowsingMode ? "native_webview" : "sanitized_html"),
              lightMode: resolvedModeInfo.lightMode,
              lightModePolicy: resolvedModeInfo.policy,
              unblockedImages: [],
              partialContentNotice: false,
              history: updatedHistory,
              historyIndex: updatedIndex,
              isLoading: false,
              isReaderMode: mode === "reader",
              lastMethod: navMethod,
              scrollY: isIframeRender
                ? null
                : isHistoryNav && typeof t.scrollY === "number"
                ? t.scrollY
                : 0,
            };
          })
        );

        // NATIVE-40A: Keep controller history state consistent with tabs state
        const navCtrlFinish = navigationControllersRef.current.get(tabId);
        if (navCtrlFinish) {
          const currentTab = tabs.find((t) => t.id === tabId);
          const currentHistoryUrl = currentTab?.history[currentTab.historyIndex];
          const isDuplicateConsecutive = !isHistoryNav && currentHistoryUrl === data.url;
          const updatedHistory = isHistoryNav
            ? (currentTab?.history || [data.url])
            : isDuplicateConsecutive
            ? [...(currentTab?.history || []).slice(0, (currentTab?.historyIndex || 0) + 1)]
            : [...(currentTab?.history || []).slice(0, (currentTab?.historyIndex || 0) + 1), data.url];
          const updatedIndex = isHistoryNav
            ? (targetHistoryIndex ?? (currentTab?.historyIndex || 0))
            : isDuplicateConsecutive
            ? (currentTab?.historyIndex || 0)
            : updatedHistory.length - 1;
          navCtrlFinish.syncHistoryState(updatedHistory, updatedIndex);
          navCtrlFinish.onPageFinished(data.url);
        }

        // Update statistics (honest non-negative accounting; private tabs do not persist cumulative savings)
        const currentTab = tabs.find((t) => t.id === tabId);
        if (!currentTab?.isPrivate) {
          if (honestStats.savedBytes > 0) {
            setTotalSavedBytes((prev) => prev + honestStats.savedBytes);
          }
          if (honestStats.trackersBlocked > 0) {
            setTotalTrackersBlocked((prev) => prev + honestStats.trackersBlocked);
          }
        }

        // Add to history if not private tab, not history navigation, and not consecutive duplicate reload
        const priorHistoryUrl = currentTab?.history[currentTab.historyIndex];
        const isDuplicateReload = priorHistoryUrl === data.url;

        if (!currentTab?.isPrivate && !isHistoryNav && !isDuplicateReload) {
          const safeHistoryUrl = sanitizeUrlForHistory(data.url);
          setHistory((prev) => [
            {
              id: `hist-${Date.now()}`,
              title: data.title || normalizedUrl,
              url: safeHistoryUrl,
              timestamp: Date.now(),
              savedBytes: honestStats.savedBytes,
            },
            ...prev.slice(0, 99),
          ]);
        }
      } catch (err: any) {
        // If this request was superseded by a newer navigation on this tab, discard error completely
        if (
          tabRequestEpochRef.current.get(tabId) !== requestEpoch ||
          inFlightControllersRef.current.get(tabId) !== controller
        ) {
          return;
        }

        if (err.name === "AbortError" || controller.signal.aborted) {
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id !== tabId) return t;
              const previousUrl = t.history[t.historyIndex] ?? "";
              return {
                ...t,
                url: t.contentHtml ? previousUrl || t.url : previousUrl,
                isLoading: false,
              };
            })
          );
          return;
        }
        const rawMsg = err?.message || "";
        const lowerRawMsg = rawMsg.toLowerCase();
        const isNetworkFetchFailure =
          lowerRawMsg.includes("fetch failed") ||
          lowerRawMsg.includes("failed to fetch") ||
          lowerRawMsg.includes("networkerror") ||
          lowerRawMsg.includes("load failed");
        const isHandledNavigationError = Boolean(
          (err as any)?.statusCode ||
            (err as any)?.errorCode ||
            (err as any)?.kind === "offline" ||
            isNetworkFetchFailure
        );
        if (isHandledNavigationError) {
          console.info("[NETFLOW Recovery Center] Handled navigation error:", {
            statusCode: (err as any)?.statusCode ?? null,
            errorCode: (err as any)?.errorCode ?? "ERR_CONNECTION_FAILED",
            targetUrl: sanitizeUrlForErrorDisplay(normalizedUrl),
          });
        } else {
          console.error("Unexpected Browse Exception:", err);
        }
        const isTechnicalOrJson =
          rawMsg.includes("Unexpected token") ||
          rawMsg.includes("JSON") ||
          rawMsg.includes("<!DOCTYPE") ||
          isNetworkFetchFailure;

        const defaultFailureMsg =
          translations[lang]?.errorState?.defaultNetworkFailure ||
          "Network request failed. Please check your internet connection and try again.";

        const safeErrorMessage =
          isTechnicalOrJson || !rawMsg
            ? defaultFailureMsg
            : rawMsg;

        const detectedStatus = (err as any)?.statusCode;

        // NATIVE-31: Record page error and cancel pending callbacks
        pageLifecycleSafetyManagerRef.current.onPageError(tabId, pageLifecycleEpoch, safeErrorMessage);

        // NATIVE-32: Classify error, record recovery state, advance recovery epoch and clear stale callbacks
        const recResult = errorRecoveryLifecycleManagerRef.current.detectAndRecordError(
          tabId,
          normalizedUrl,
          err,
          detectedStatus,
          Boolean(currentNavTab?.contentHtml),
          errorRecoveryEpoch
        );
        if (recResult.isStale) {
          return;
        }

        // NATIVE-33: Trigger request timeout state and record safe failure if timed out, or stop active timer on non-timeout failure
        const isTimeout =
          (err as any)?.name === "AbortError" ||
          (err as any)?.errorCode === "ERR_CONNECTION_TIMED_OUT" ||
          (err as any)?.errorCategory === "timeout" ||
          detectedStatus === 504 ||
          rawMsg.toLowerCase().includes("timeout") ||
          rawMsg.toLowerCase().includes("timed out");
        if (isTimeout) {
          requestTimeoutManagerRef.current.triggerTimeout(
            tabId,
            TimeoutReason.INITIAL_CONNECT_TIMEOUT,
            timeoutEpoch
          );
        } else {
          requestTimeoutManagerRef.current.onStopLoading(tabId);
        }

        // NATIVE-34: Abort active redirect chain on navigation failure
        const activeChain = redirectChainManagerRef.current.getActiveChainForTab(tabId);
        if (activeChain) {
          redirectChainManagerRef.current.abortChain(activeChain.chainId, safeErrorMessage);
        }

        // NATIVE-40A: Signal error on navigation controller
        const navCtrlErr = navigationControllersRef.current.get(tabId);
        if (navCtrlErr) {
          navCtrlErr.onReceivedError(detectedStatus || 500, safeErrorMessage, normalizedUrl);
        }

        const isOfflineDetected =
          !navigator.onLine ||
          networkState.medium === "offline" ||
          (err as any)?.kind === "offline" ||
          rawMsg.toLowerCase().includes("offline") ||
          rawMsg.toLowerCase().includes("disconnected");

        let resolvedKind: WebPageErrorInfo["kind"] = "generic";
        let resolvedErrorCode = "ERR_CONNECTION_FAILED";

        if (isOfflineDetected) {
          resolvedKind = "offline";
          resolvedErrorCode = "ERR_INTERNET_DISCONNECTED";
        } else if (
          (err as any)?.errorCode === "NETFLOW_REDIRECT_BLOCKED" ||
          rawMsg.toLowerCase().includes("redirect blocked") ||
          rawMsg.toLowerCase().includes("redirect hop blocked") ||
          rawMsg.toLowerCase().includes("redirect loop") ||
          rawMsg.toLowerCase().includes("redirect downgrade") ||
          rawMsg.toLowerCase().includes("redirect to an internal")
        ) {
          resolvedKind = "security";
          resolvedErrorCode = "NETFLOW_REDIRECT_BLOCKED";
        } else if (
          (err as any)?.errorCode === "NETFLOW_SSRF_BLOCKED" ||
          (err as any)?.errorCategory === "ssrf" ||
          rawMsg.toLowerCase().includes("restricted uri") ||
          rawMsg.toLowerCase().includes("ssrf") ||
          rawMsg.toLowerCase().includes("loopback") ||
          rawMsg.toLowerCase().includes("internal, local")
        ) {
          resolvedKind = "security";
          resolvedErrorCode = "NETFLOW_SSRF_BLOCKED";
        } else if (
          (err as any)?.errorCode === "ERR_NAME_NOT_RESOLVED" ||
          (err as any)?.errorCategory === "dns" ||
          rawMsg.toLowerCase().includes("dns") ||
          rawMsg.toLowerCase().includes("name_not_resolved") ||
          rawMsg.toLowerCase().includes("enotfound") ||
          rawMsg.toLowerCase().includes("domain not found")
        ) {
          resolvedKind = "dns";
          resolvedErrorCode = "ERR_NAME_NOT_RESOLVED";
        } else if (
          (err as any)?.errorCode === "ERR_CONNECTION_REFUSED" ||
          (err as any)?.errorCode === "ERR_SSL_PROTOCOL_ERROR" ||
          (err as any)?.errorCategory === "connection" ||
          rawMsg.toLowerCase().includes("refused") ||
          rawMsg.toLowerCase().includes("econnrefused") ||
          rawMsg.toLowerCase().includes("connection reset") ||
          rawMsg.toLowerCase().includes("econnreset")
        ) {
          resolvedKind = "connection";
          resolvedErrorCode = (err as any)?.errorCode || "ERR_CONNECTION_REFUSED";
        } else if (detectedStatus === 404 || (err as any)?.errorCode === "HTTP_404_NOT_FOUND") {
          resolvedKind = "http_client";
          resolvedErrorCode = "HTTP_404_NOT_FOUND";
        } else if (detectedStatus === 403 || rawMsg.toLowerCase().includes("403") || rawMsg.toLowerCase().includes("forbidden")) {
          resolvedKind = "http_client";
          resolvedErrorCode = "HTTP_403_FORBIDDEN";
        } else if (detectedStatus === 429 || rawMsg.toLowerCase().includes("429") || rawMsg.toLowerCase().includes("rate limit") || rawMsg.toLowerCase().includes("throttl")) {
          resolvedKind = "http_client";
          resolvedErrorCode = "HTTP_429_TOO_MANY_REQUESTS";
        } else if (detectedStatus === 500) {
          resolvedKind = "http_server";
          resolvedErrorCode = "HTTP_500_INTERNAL_SERVER_ERROR";
        } else if (detectedStatus === 502 && (err as any)?.errorCode !== "ERR_CONNECTION_FAILED") {
          resolvedKind = "http_server";
          resolvedErrorCode = "HTTP_502_BAD_GATEWAY";
        } else if (detectedStatus === 503) {
          resolvedKind = "http_server";
          resolvedErrorCode = "HTTP_503_SERVICE_UNAVAILABLE";
        } else if (
          detectedStatus === 504 ||
          rawMsg.toLowerCase().includes("timeout") ||
          rawMsg.toLowerCase().includes("timed out")
        ) {
          resolvedKind = "timeout";
          resolvedErrorCode =
            (err as any)?.errorCode === "HTTP_504_GATEWAY_TIMEOUT" ||
            (detectedStatus === 504 && (err as any)?.errorCode !== "ERR_CONNECTION_TIMED_OUT")
              ? "HTTP_504_GATEWAY_TIMEOUT"
              : "ERR_CONNECTION_TIMED_OUT";
        } else if (
          rawMsg.toLowerCase().includes("restricted network") ||
          rawMsg.toLowerCase().includes("carrier")
        ) {
          resolvedKind = "restricted_network";
          resolvedErrorCode = "NETFLOW_RESTRICTED_NETWORK";
        } else if (detectedStatus && detectedStatus >= 500 && (err as any)?.errorCode !== "ERR_CONNECTION_FAILED") {
          resolvedKind = "http_server";
          resolvedErrorCode = `HTTP_${detectedStatus}_SERVER_ERROR`;
        } else if (detectedStatus && detectedStatus >= 400) {
          resolvedKind = "http_client";
          resolvedErrorCode = `HTTP_${detectedStatus}_CLIENT_ERROR`;
        }

        const finalErrorCode = (err as any)?.errorCode || resolvedErrorCode;
        const isSecurityOrRedirectError =
          finalErrorCode === "NETFLOW_REDIRECT_BLOCKED" ||
          finalErrorCode === "NETFLOW_SSRF_BLOCKED" ||
          resolvedKind === "security" ||
          (err as any)?.kind === "security_ssrf";
        const friendlyDisplayMessage =
          finalErrorCode === "NETFLOW_REDIRECT_BLOCKED"
            ? translations[lang]?.errorState?.redirectBlockDesc ||
              "This web address or redirect target was blocked by NETFLOW security protection."
            : finalErrorCode === "NETFLOW_SSRF_BLOCKED"
            ? translations[lang]?.errorState?.securityBlockDesc ||
              "Access to internal, loopback, or unsafe destination blocked by SSRF defense."
            : safeErrorMessage;

        const errorInfoObj: WebPageErrorInfo = {
          errorCode: finalErrorCode,
          statusCode: detectedStatus,
          kind: resolvedKind,
          failedUrl: sanitizeUrlForErrorDisplay(normalizedUrl),
          timestamp: Date.now(),
          retryAttempts: recResult.record.retryCount,
          hasCachedContent: Boolean(currentNavTab?.contentHtml),
          hasOfflineCapsule: Boolean(
            findMatchingOfflineCapsule(normalizedUrl, offlineCapsules) ||
              findMatchingOfflineCapsule(currentNavTab?.url, offlineCapsules)
          ),
          errorDescription: friendlyDisplayMessage,
          ...(isSecurityOrRedirectError && rawMsg
            ? { technicalDetails: redactTechnicalDetailsForDiagnostics(rawMsg) }
            : {}),
        };

        resilienceCoordinatorRef.current?.mainFrameError(tabId, errorInfoObj.errorCode, {
          url: normalizedUrl,
          description: friendlyDisplayMessage,
          statusCode: detectedStatus,
        });
        setResilienceUiTick((n) => n + 1);

        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  isLoading: false,
                  error: friendlyDisplayMessage,
                  errorInfo: errorInfoObj,
                }
              : t
          )
        );
      } finally {
        if (inFlightControllersRef.current.get(tabId) === controller) {
          inFlightControllersRef.current.delete(tabId);
        }
      }
    },
    [activeTabId, browsingMode, privacyConfig, tabs, networkState.medium, lang]
  );
  handleNavigateRef.current = handleNavigate;

  // Safe initial session active tab restoration (does not execute untrusted actions or auto-resubmit POST)
  const initialRestoreTriggeredRef = useRef(false);
  useEffect(() => {
    if (initialRestoreTriggeredRef.current) return;
    initialRestoreTriggeredRef.current = true;

    const initialActive = tabs.find((t) => t.id === activeTabId) || tabs[0];
    if (
      initialActive &&
      initialActive.url &&
      initialActive.url.trim() &&
      !initialActive.contentHtml
    ) {
      if (initialActive.lastMethod === "POST") {
        setPostRestorePromptTabId(initialActive.id);
      } else {
        // FORM 30 (Fix 4): Ensure isLoading is set to true during this fetch
        setTabs((prev) =>
          prev.map((t) =>
            t.id === initialActive.id ? { ...t, isLoading: true } : t
          )
        );
        handleNavigate(initialActive.url, initialActive.id, true, initialActive.historyIndex);
      }
    }
  }, [handleNavigate, tabs, activeTabId]);

  // NATIVE-13: Android WebView Secure Popup & New-Window Manager
  const popupManagerRef = useRef<AndroidWebViewPopupManager>(
    createAndroidWebViewPopupManager({
      onSpawnTab: () => {},
      onCloseTab: () => {},
    })
  );
  const recentPopupsRef = useRef<Map<string, number>>(new Map());

  // NATIVE-14 & NETFLOW-NATIVE-DOWNLOADS-01: Android WebView External Download & File Save Boundary
  const [downloadPrompt, setDownloadPrompt] = useState<DownloadConsentPrompt | null>(null);
  const nativeDownloadRequestsRef = useRef<Map<string, NativeDownloadRequestedContractEvent>>(
    new Map()
  );
  const nativeApprovedByRequestIdRef = useRef<
    Map<
      string,
      {
        tabId: string;
        url: string;
        fileName: string;
        mimeType: string;
        totalBytes: number;
      }
    >
  >(new Map());
  const downloadManagerRef = useRef<AndroidDownloadManager>(
    createAndroidDownloadManager({
      onDownloadStatusChanged: (meta) => {
        if (meta.status === "pending_user_consent") {
          const prompt = downloadManagerRef.current.getUserConsentPrompt(meta.downloadId);
          setDownloadPrompt(prompt);
        }
      },
    })
  );

  // NATIVE-15: Android WebView JavaScript Geolocation Permission Boundary
  const [geolocationPrompt, setGeolocationPrompt] = useState<GeolocationConsentPrompt | null>(null);
  const geolocationManagerRef = useRef<AndroidWebViewGeolocationManager>(
    createAndroidWebViewGeolocationManager({
      onPromptStateChange: (prompt) => {
        setGeolocationPrompt(prompt);
      },
    })
  );

  // NATIVE-16: Android WebView Web Notification Permission Boundary
  const [notificationPrompt, setNotificationPrompt] = useState<NotificationConsentPrompt | null>(null);
  const notificationManagerRef = useRef<AndroidWebViewNotificationManager>(
    createAndroidWebViewNotificationManager({
      onPromptStateChange: (prompt) => {
        setNotificationPrompt(prompt);
      },
    })
  );

  // NATIVE-17: Android WebView WebSocket & Persistent Connection Boundary
  const webSocketManagerRef = useRef<AndroidWebViewWebSocketManager>(
    createAndroidWebViewWebSocketManager()
  );

  // NATIVE-18: Android WebView Service Worker & Storage Persistence Boundary
  const storageManagerRef = useRef<AndroidWebViewStorageManager>(
    createAndroidWebViewStorageManager()
  );

  // NATIVE-19: Android WebView JavaScript ↔ Browser Page Lifecycle Boundary
  const pageLifecycleManagerRef = useRef<AndroidWebViewPageLifecycleManager>(
    createAndroidWebViewPageLifecycleManager()
  );

  // NATIVE-20: Android WebView JavaScript Dialog / Window Prompt Boundary
  const [dialogPrompt, setDialogPrompt] = useState<JavaScriptDialogPrompt | null>(null);
  const dialogManagerRef = useRef<AndroidWebViewDialogManager>(
    createAndroidWebViewDialogManager({
      onPromptStateChange: (prompt) => {
        setDialogPrompt(prompt);
      },
    })
  );

  // NATIVE-21: Android WebView HTTP Authentication & Client Certificate Boundary
  const [httpAuthPrompt, setHttpAuthPrompt] = useState<HttpAuthPrompt | null>(null);
  const [clientCertPrompt, setClientCertPrompt] = useState<ClientCertPrompt | null>(null);
  const httpAuthManagerRef = useRef<AndroidWebViewHttpAuthManager>(
    createAndroidWebViewHttpAuthManager({
      onHttpAuthPromptChange: (prompt) => {
        setHttpAuthPrompt(prompt);
      },
      onClientCertPromptChange: (prompt) => {
        setClientCertPrompt(prompt);
      },
    })
  );

  // NETFLOW-INTERACTIVE-CONTRACT-01: Dedicated Camera/Mic/DRM Consent Modal, Native HttpAuthModal & Capabilities State
  const [cameraMicPrompt, setCameraMicPrompt] = useState<CameraMicConsentPrompt | null>(null);
  const cameraMicResolverRef = useRef<
    Map<string, (granted: Array<MediaConsentResource>) => void>
  >(new Map());
  const [nativeHttpAuthPrompt, setNativeHttpAuthPrompt] =
    useState<NativeHttpAuthModalPrompt | null>(null);
  const [nativeCapabilities, setNativeCapabilities] = useState<NativeEngineCapabilities>({
    lightMode: false,
    subresourceIntercept: false,
    privateIsolation: false,
    interactiveCallbacks: false,
  });
  const [dismissedOutdatedWebView, setDismissedOutdatedWebView] = useState(false);

  const requestCameraMicModalConsent = useCallback(
    (
      requestId: string,
      tabId: string,
      origin: string,
      resources: Array<MediaConsentResource>
    ): Promise<Array<MediaConsentResource>> => {
      return new Promise((resolve) => {
        cameraMicResolverRef.current.set(requestId, resolve);
        let isLocalhost = false;
        try {
          const parsed = new URL(origin.includes("://") ? origin : `https://${origin}`);
          isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        } catch {}
        setCameraMicPrompt({
          requestId,
          tabId,
          origin,
          resources,
          isLocalhost,
        });
      });
    },
    []
  );

  const handleApproveCameraMicModal = useCallback(
    (requestId: string, grantedResources: Array<MediaConsentResource>) => {
      const resolver = cameraMicResolverRef.current.get(requestId);
      if (resolver) {
        cameraMicResolverRef.current.delete(requestId);
        resolver(grantedResources);
      }
      setCameraMicPrompt((prev) => (prev?.requestId === requestId ? null : prev));
    },
    []
  );

  const handleDenyCameraMicModal = useCallback((requestId: string) => {
    const resolver = cameraMicResolverRef.current.get(requestId);
    if (resolver) {
      cameraMicResolverRef.current.delete(requestId);
      resolver([]);
    }
    setCameraMicPrompt((prev) => (prev?.requestId === requestId ? null : prev));
  }, []);

  const handleSubmitNativeHttpAuthModal = useCallback(
    (requestId: string, username: string, password: string) => {
      setNativeHttpAuthPrompt((prev) => (prev?.requestId === requestId ? null : prev));
      nativeBrowserEngineRef.current?.resolveHttpAuth({
        requestId,
        proceed: true,
        username,
        password,
      });
    },
    []
  );

  const handleCancelNativeHttpAuthModal = useCallback((requestId: string) => {
    setNativeHttpAuthPrompt((prev) => (prev?.requestId === requestId ? null : prev));
    nativeBrowserEngineRef.current?.resolveHttpAuth({
      requestId,
      proceed: false,
    });
  }, []);

  // NATIVE-22: Android WebView WebRTC & RTCPeerConnection Boundary
  const webRtcManagerRef = useRef<AndroidWebViewWebRtcManager>(
    createAndroidWebViewWebRtcManager()
  );

  // NATIVE-23: Android WebView Display Media & Screen Capture Boundary
  const [displayMediaPrompt, setDisplayMediaPrompt] = useState<DisplayMediaPrompt | null>(null);
  const displayMediaManagerRef = useRef<AndroidWebViewDisplayMediaManager>(
    createAndroidWebViewDisplayMediaManager({
      onDisplayMediaPromptChange: (prompt) => {
        setDisplayMediaPrompt(prompt);
      },
    })
  );

  // NATIVE-24: Android WebView Advanced Blob & Object-URL File Handling Boundary
  const [blobDownloadPrompt, setBlobDownloadPrompt] = useState<BlobDownloadConsentPrompt | null>(null);
  const blobDownloadManagerRef = useRef<AndroidWebViewBlobDownloadManager>(
    createAndroidWebViewBlobDownloadManager({
      onBlobConsentPromptChange: (prompt) => {
        setBlobDownloadPrompt(prompt);
      },
    })
  );

  // NATIVE-25: Android WebView JavaScript File System & File API / Download Boundary
  const [fileDownloadPrompt, setFileDownloadPrompt] = useState<GeneratedFileDownloadPrompt | null>(null);
  const fileSystemManagerRef = useRef<AndroidWebViewFileSystemManager>(
    createAndroidWebViewFileSystemManager({
      onDownloadConsentPromptChange: (prompt) => {
        setFileDownloadPrompt(prompt);
      },
    })
  );

  // NATIVE-26: Android WebView Clipboard & Web Share API Boundary
  const [clipboardPrompt, setClipboardPrompt] = useState<ClipboardConsentPrompt | null>(null);
  const [sharePrompt, setSharePrompt] = useState<ShareConsentPrompt | null>(null);
  const [googleAuthPrompt, setGoogleAuthPrompt] = useState<GoogleAuthFallbackPrompt | null>(null);
  const clipboardAndShareManagerRef = useRef<AndroidWebViewClipboardAndShareManager>(
    createAndroidWebViewClipboardAndShareManager({
      onClipboardConsentPromptChange: (prompt) => {
        setClipboardPrompt(prompt);
      },
      onShareConsentPromptChange: (prompt) => {
        setSharePrompt(prompt);
      },
    })
  );

  // NATIVE-11: Android WebView Secure Media Permission Manager (Camera & Microphone)
  const mediaPermissionManagersRef = useRef<Map<string, AndroidWebViewMediaPermissionManager>>(
    new Map()
  );
  const getMediaPermissionManager = useCallback((tabId: string): AndroidWebViewMediaPermissionManager => {
    let mgr = mediaPermissionManagersRef.current.get(tabId);
    if (!mgr) {
      mgr = createAndroidWebViewMediaPermissionManager(tabId);
      mediaPermissionManagersRef.current.set(tabId, mgr);
    }
    return mgr;
  }, []);

  // NATIVE-12: Android WebView Media Playback & Fullscreen Manager
  const mediaPlaybackManagersRef = useRef<Map<string, AndroidWebViewMediaPlaybackManager>>(
    new Map()
  );
  const getMediaPlaybackManager = useCallback((tabId: string): AndroidWebViewMediaPlaybackManager => {
    let mgr = mediaPlaybackManagersRef.current.get(tabId);
    if (!mgr) {
      mgr = createAndroidWebViewMediaPlaybackManager(tabId);
      mediaPlaybackManagersRef.current.set(tabId, mgr);
    }
    return mgr;
  }, []);

  // NATIVE-27: Android WebView Background Media & Autoplay Policy Boundary
  const backgroundMediaManagerRef = useRef<AndroidWebViewBackgroundMediaManager>(
    createAndroidWebViewBackgroundMediaManager()
  );

  // NATIVE-28: Android WebView Media Session & Multi-Tab Resource Governance
  const mediaSessionGovernanceManagerRef = useRef<AndroidWebViewMediaSessionGovernanceManager>(
    createAndroidWebViewMediaSessionGovernanceManager()
  );

  // NATIVE-29: Android WebView Media Resource Lifetime & Memory Pressure Governance
  const mediaResourceManagerRef = useRef<AndroidWebViewMediaResourceManager>(
    createAndroidWebViewMediaResourceManager()
  );

  // NATIVE-30: Android WebView Rendering & Page Lifecycle Resilience
  const renderingResilienceManagerRef = useRef<AndroidWebViewRenderingResilienceManager>(
    createAndroidWebViewRenderingResilienceManager()
  );

  // NATIVE-31: Android WebView Page State & DOM/JS Lifecycle Bridge Safety
  const pageLifecycleSafetyManagerRef = useRef<AndroidWebViewPageStateAndLifecycleSafetyManager>(
    createAndroidWebViewPageStateAndLifecycleSafetyManager()
  );

  // NATIVE-32: Android WebView Error & Recovery Lifecycle
  const errorRecoveryLifecycleManagerRef = useRef<AndroidWebViewErrorAndRecoveryLifecycleManager>(
    createAndroidWebViewErrorAndRecoveryLifecycleManager()
  );

  // NATIVE-33: Android WebView Request Timeout & Recovery Boundary
  const requestTimeoutManagerRef = useRef<AndroidWebViewRequestTimeoutAndRecoveryManager>(
    createAndroidWebViewRequestTimeoutAndRecoveryManager()
  );

  // NATIVE-35: Android WebView Download Request Routing & Safe Download Lifecycle
  const downloadRequestLifecycleManagerRef = useRef<AndroidWebViewDownloadRequestLifecycleManager>(
    createAndroidWebViewDownloadRequestLifecycleManager()
  );

  // NATIVE-36: Android WebView Download Completion Integrity & Safe Finalization
  const downloadCompletionIntegrityManagerRef = useRef<AndroidWebViewDownloadCompletionIntegrityManager>(
    createAndroidWebViewDownloadCompletionIntegrityManager()
  );

  // NATIVE-37: Android WebView Download Completion Integrity & Recovery Audit
  const downloadRecoveryAuditManagerRef = useRef<AndroidWebViewDownloadRecoveryAuditManager>(
    createAndroidWebViewDownloadRecoveryAuditManager()
  );

  // NATIVE-38: Android WebView Download Resumption & HTTP Range Boundary
  const downloadResumptionManagerRef = useRef<AndroidWebViewDownloadResumptionManager>(
    createAndroidWebViewDownloadResumptionManager()
  );

  // Android WebView Download Persistence & Recovery Boundary
  const downloadPersistenceManagerRef = useRef<AndroidWebViewDownloadPersistenceManager>(
    createAndroidWebViewDownloadPersistenceManager()
  );

  // NATIVE-34: Android WebView Redirect Chain & Navigation Safety Boundary
  const redirectChainManagerRef = useRef<AndroidWebViewRedirectChainManager>(
    createAndroidWebViewRedirectChainManager()
  );

  // FORM-B2: Android WebView & Proxy Network Resilience Coordinator
  const [resilienceUiTick, setResilienceUiTick] = useState(0);
  const resilienceCoordinatorRef = useRef<AndroidWebViewNetworkResilienceCoordinator | null>(null);
  if (!resilienceCoordinatorRef.current) {
    resilienceCoordinatorRef.current = createAndroidWebViewNetworkResilienceCoordinator({
      initialActiveTabId: activeTabId,
      autoAdaptToWeakNetwork: networkPolicy.autoAdaptToWeakNetwork,
      onSignal: (ev) => {
        setResilienceUiTick((n) => n + 1);
        if (ev.type === "STOP_LOADING") {
          const ctrl = inFlightControllersRef.current.get(ev.tabId);
          if (ctrl) {
            ctrl.abort();
            inFlightControllersRef.current.delete(ev.tabId);
          }
          nativeBrowserEngineRef.current?.stopLoading(ev.tabId);
        } else if (ev.type === "KEEP_PARTIAL_CONTENT") {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === ev.tabId
                ? {
                    ...t,
                    isLoading: false,
                    partialContentNotice: true,
                    error: undefined,
                    errorInfo: undefined,
                  }
                : t
            )
          );
        } else if (ev.type === "SHOW_RECOVERY_CENTER" || ev.type === "FAST_OFFLINE_STATE") {
          const isOfflineEv = ev.type === "FAST_OFFLINE_STATE" || ev.errorCode === "ERR_INTERNET_DISCONNECTED";
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id !== ev.tabId) return t;
              if (t.error && t.errorInfo) {
                return { ...t, isLoading: false };
              }
              return {
                ...t,
                isLoading: false,
                error: isOfflineEv
                  ? "You are offline; this page is not saved on your device."
                  : "Connection timed out. The page took too long to respond.",
                errorInfo: {
                  errorCode: String(ev.errorCode || (isOfflineEv ? "ERR_INTERNET_DISCONNECTED" : "ERR_CONNECTION_TIMED_OUT")),
                  kind: isOfflineEv ? "offline" : "timeout",
                  failedUrl: t.url || ev.url,
                  timestamp: Date.now(),
                  hasCachedContent: Boolean(t.contentHtml),
                },
              };
            })
          );
        } else if (ev.type === "AUTO_APPLY_LIGHT_MODE") {
          const policy = buildLightModePolicy({ lightMode: true, browsingMode: "smart-compress" });
          nativeBrowserEngineRef.current?.setLightModePolicy(ev.tabId, true, policy);
          setTabs((prev) =>
            prev.map((t) =>
              t.id === ev.tabId
                ? {
                    ...t,
                    lightMode: true,
                    lightModePolicy: policy,
                    tabBrowsingMode: "smart-compress",
                  }
                : t
            )
          );
        } else if (ev.type === "AUTO_RELOAD") {
          if (ev.url) {
            handleNavigateRef.current?.(ev.url, ev.tabId);
          }
        } else if (ev.type === "CONFIRM_POST_RETRY") {
          setPostRestorePromptTabId(ev.tabId);
        }
      },
    });
  }

  useEffect(() => {
    resilienceCoordinatorRef.current?.setActiveTabId(activeTabId);
    setResilienceUiTick((n) => n + 1);
  }, [activeTabId]);

  useEffect(() => {
    resilienceCoordinatorRef.current?.setAutoAdaptToWeakNetwork(
      Boolean(networkPolicy.autoAdaptToWeakNetwork)
    );
  }, [networkPolicy.autoAdaptToWeakNetwork]);

  useEffect(() => {
    const isNowValidatedOnline = Boolean(
      networkState.isOnline &&
        networkState.internetAvailable &&
        networkState.medium !== "offline"
    );
    resilienceCoordinatorRef.current?.connectivity({
      online: Boolean(networkState.isOnline && networkState.medium !== "offline"),
      validated: isNowValidatedOnline,
      metered: Boolean(networkState.isMetered),
      transport: networkState.medium,
      rttMs: networkState.rttMs,
      downlinkMbps: networkState.downlinkMbps,
    });

    if (isNowValidatedOnline && offlineQueueManagerRef.current) {
      const drainDecision = offlineQueueManagerRef.current.onValidatedOnline();
      setPendingRequests(offlineQueueManagerRef.current.getQueue());
      if (drainDecision.action === "AUTO_OPEN_SINGLE" && drainDecision.itemsToOpen[0]) {
        const single = drainDecision.itemsToOpen[0];
        setShowQueueConfirmBanner(false);
        handleNavigateRef.current?.(single.url, single.tabId || activeTabId);
      } else if (drainDecision.action === "CONFIRM_MULTIPLE_QUEUED") {
        setShowQueueConfirmBanner(true);
      }
    }
  }, [
    networkState.isOnline,
    networkState.internetAvailable,
    networkState.isMetered,
    networkState.medium,
    networkState.rttMs,
    networkState.downlinkMbps,
    activeTabId,
  ]);

  // FORM-N2: Native Android System WebView / Chromium Core Browser Engine
  const [nativeFindResults, setNativeFindResults] = useState<
    Record<string, { activeMatchOrdinal: number; numberOfMatches: number }>
  >({});
  const [contextMenuPrompt, setContextMenuPrompt] =
    useState<NativeContextMenuRequestedContractEvent | null>(null);
  const nativeBrowserEngineRef = useRef<NativeBrowserEngine | null>(null);
  if (!nativeBrowserEngineRef.current) {
    nativeBrowserEngineRef.current = createNativeBrowserEngine({
      getSiteOverrides: () => siteOverridesRef.current,
      onCapabilitiesChanged: (caps) => {
        // Capability gating: if interactiveCallbacks is false, nothing is claimed in the UI
        setNativeCapabilities(caps);
      },
      onNetworkStateChanged: (net) => {
        resilienceCoordinatorRef.current?.connectivity({
          online: Boolean(net.validated || net.transport !== "none"),
          validated: net.validated,
          metered: net.metered,
          transport: net.transport,
          downlinkMbps: net.downKbps > 0 ? net.downKbps / 1000 : undefined,
        });
        setResilienceUiTick((n) => n + 1);
      },
      onPermissionAskPrompt: async (prompt) => {
        const finalGranted: GrantablePermissionResource[] = [...prompt.preAllowedResources];
        const askGeo = prompt.askResources.includes("geolocation");
        const askMedia = prompt.askResources.filter(
          (r): r is MediaConsentResource =>
            r === "camera" || r === "microphone" || r === "protectedMedia"
        );

        if (askGeo) {
          const geoAllowed = await new Promise<boolean>((resolve) => {
            const res = geolocationManagerRef.current.onGeolocationPermissionsShowPrompt(
              prompt.origin,
              {
                invoke: (_origin, allow) => {
                  const latest = siteOverridesRef.current[prompt.domain]?.geolocation;
                  resolve(Boolean(allow && (latest === "ask" || latest === "allow")));
                },
              },
              prompt.tabId
            );
            if (!res.success && !res.requestId) {
              resolve(false);
            }
          });
          geolocationManagerRef.current.onNavigation(prompt.tabId, "");
          if (geoAllowed && !finalGranted.includes("geolocation")) {
            finalGranted.push("geolocation");
          }
        }

        if (askMedia.length > 0) {
          const mediaMgr = getMediaPermissionManager(prompt.tabId);
          const camMicOnly = askMedia.filter(
            (r): r is "camera" | "microphone" => r === "camera" || r === "microphone"
          );
          const androidResources = camMicOnly.map((r) =>
            r === "camera"
              ? AndroidMediaResource.VIDEO_CAPTURE
              : AndroidMediaResource.AUDIO_CAPTURE
          );
          const mediaReq =
            androidResources.length > 0
              ? mediaMgr.requestPermissions(prompt.origin, androidResources)
              : null;
          const userGrantedMedia = await requestCameraMicModalConsent(
            prompt.requestId,
            prompt.tabId,
            prompt.origin,
            askMedia
          );
          const camOk =
            userGrantedMedia.includes("camera") &&
            (siteOverridesRef.current[prompt.domain]?.camera === "ask" ||
              siteOverridesRef.current[prompt.domain]?.camera === "allow");
          const micOk =
            userGrantedMedia.includes("microphone") &&
            (siteOverridesRef.current[prompt.domain]?.microphone === "ask" ||
              siteOverridesRef.current[prompt.domain]?.microphone === "allow");
          const drmOk =
            userGrantedMedia.includes("protectedMedia") &&
            (siteOverridesRef.current[prompt.domain]?.protectedMedia === "ask" ||
              siteOverridesRef.current[prompt.domain]?.protectedMedia === "allow");

          if (mediaReq) {
            if (camOk || micOk) {
              const dec = mediaMgr.decidePermission(mediaReq.requestId, true, camOk, micOk);
              if (
                dec.grantedResources.includes(AndroidMediaResource.VIDEO_CAPTURE) &&
                !finalGranted.includes("camera")
              ) {
                finalGranted.push("camera");
              }
              if (
                dec.grantedResources.includes(AndroidMediaResource.AUDIO_CAPTURE) &&
                !finalGranted.includes("microphone")
              ) {
                finalGranted.push("microphone");
              }
            } else {
              mediaMgr.denyPermission(mediaReq.requestId, "User denied camera/microphone consent");
            }
            mediaMgr.onNavigation("");
          }

          if (drmOk && !finalGranted.includes("protectedMedia")) {
            finalGranted.push("protectedMedia");
          }
        }

        nativeBrowserEngineRef.current?.resolvePermission({
          requestId: prompt.requestId,
          grantedResources: finalGranted,
        });
      },
      onJsDialogRequested: async (dlg) => {
        if (dlg.type === "alert") {
          const res = await dialogManagerRef.current.requestAlert(
            dlg.tabId,
            dlg.origin,
            dlg.message,
            dlg.epoch
          );
          nativeBrowserEngineRef.current?.resolveJsDialog({
            requestId: dlg.requestId,
            confirmed: Boolean(res.shown),
          });
        } else if (dlg.type === "confirm") {
          const res = await dialogManagerRef.current.requestConfirm(
            dlg.tabId,
            dlg.origin,
            dlg.message,
            dlg.epoch
          );
          nativeBrowserEngineRef.current?.resolveJsDialog({
            requestId: dlg.requestId,
            confirmed: Boolean(res.confirmed),
          });
        } else if (dlg.type === "prompt") {
          const res = await dialogManagerRef.current.requestPrompt(
            dlg.tabId,
            dlg.origin,
            dlg.message,
            dlg.defaultValue,
            dlg.epoch
          );
          nativeBrowserEngineRef.current?.resolveJsDialog({
            requestId: dlg.requestId,
            confirmed: res.value !== null,
            value: res.value ?? undefined,
          });
        } else if (dlg.type === "beforeunload") {
          const res = await dialogManagerRef.current.requestBeforeUnload(
            dlg.tabId,
            dlg.origin,
            dlg.message,
            dlg.epoch
          );
          nativeBrowserEngineRef.current?.resolveJsDialog({
            requestId: dlg.requestId,
            confirmed: Boolean(res.proceed),
          });
        }
      },
      onHttpAuthRequested: (auth) => {
        setNativeHttpAuthPrompt({
          requestId: auth.requestId,
          tabId: auth.tabId,
          host: auth.host,
          realm: auth.realm,
          origin: auth.origin,
        });
      },
      onInteractiveRequestCancelled: (requestId, tabId, kind) => {
        if (kind === "permission") {
          const resolver = cameraMicResolverRef.current.get(requestId);
          if (resolver) {
            cameraMicResolverRef.current.delete(requestId);
            resolver([]);
          }
          setCameraMicPrompt((prev) =>
            prev?.requestId === requestId || prev?.tabId === tabId ? null : prev
          );
          geolocationManagerRef.current.onNavigation(tabId, "");
          setGeolocationPrompt((prev) => (prev?.tabId === tabId ? null : prev));
        } else if (kind === "jsDialog") {
          dialogManagerRef.current.onStopLoading(tabId);
          setDialogPrompt((prev) => (prev?.tabId === tabId ? null : prev));
        } else if (kind === "httpAuth") {
          setNativeHttpAuthPrompt((prev) =>
            prev?.requestId === requestId || prev?.tabId === tabId ? null : prev
          );
        }
      },
      onPageStarted: (tabId, url, state) => {
        pageLifecycleSafetyManagerRef.current.onPageStarted(tabId, url);
        resilienceCoordinatorRef.current?.pageStarted(tabId, url, {
          method: "GET",
          isPrivate: state.isPrivate,
        });
        setResilienceUiTick((n) => n + 1);
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  url,
                  isLoading: true,
                  isNativeWebView: true,
                  renderMode: "native_webview",
                  error: undefined,
                  errorInfo: undefined,
                  partialContentNotice: false,
                }
              : t
          )
        );
      },
      onPageCommitVisible: (tabId, url) => {
        resilienceCoordinatorRef.current?.pageCommitVisible(tabId, url);
        setResilienceUiTick((n) => n + 1);
      },
      onProgressChanged: (tabId, progressVal) => {
        resilienceCoordinatorRef.current?.progress(tabId, progressVal, {
          domContentLoaded: progressVal >= 80,
        });
        setResilienceUiTick((n) => n + 1);
      },
      onPageFinished: (tabId, url, title, nativeState) => {
        requestTimeoutManagerRef.current.onStopLoading(tabId);
        const recEpoch = errorRecoveryLifecycleManagerRef.current.getTabRecord(tabId)?.recoveryEpoch || 1;
        errorRecoveryLifecycleManagerRef.current.markRecoverySuccess(tabId, recEpoch);
        resilienceCoordinatorRef.current?.pageFinished(tabId, url);
        setResilienceUiTick((n) => n + 1);
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            const currentHistoryUrl = t.history[t.historyIndex];
            const isDuplicate = currentHistoryUrl === url;
            const updatedHistory =
              nativeState.historyUrls.length > 0
                ? nativeState.historyUrls
                : isDuplicate
                ? [...t.history.slice(0, t.historyIndex + 1)]
                : [...t.history.slice(0, t.historyIndex + 1), url];
            const updatedIndex =
              nativeState.historyUrls.length > 0
                ? nativeState.historyIndex
                : isDuplicate
                ? t.historyIndex
                : updatedHistory.length - 1;
            const resolvedTitle = title && title !== "New Tab" ? title : t.title || url;
            return {
              ...t,
              url,
              title: resolvedTitle,
              history: updatedHistory,
              historyIndex: updatedIndex,
              isLoading: false,
              isNativeWebView: true,
              renderMode: "native_webview",
              error: undefined,
              errorInfo: undefined,
              scrollY: null,
            };
          })
        );
        const navCtrl = navigationControllersRef.current.get(tabId);
        if (navCtrl) {
          if (nativeState.historyUrls.length > 0) {
            navCtrl.syncHistoryState(nativeState.historyUrls, nativeState.historyIndex);
          }
          navCtrl.onPageFinished(url);
        }
        const tabObj = tabsRef.current.find((t) => t.id === tabId);
        if (tabObj && !tabObj.isPrivate && url && url !== "about:blank") {
          const safeHistoryUrl = sanitizeUrlForHistory(url);
          setHistory((prev) => {
            if (prev[0]?.url === safeHistoryUrl) return prev;
            return [
              {
                id: `hist-${Date.now()}`,
                title: title && title !== "New Tab" ? title : url,
                url: safeHistoryUrl,
                timestamp: Date.now(),
                savedBytes: 0,
              },
              ...prev.slice(0, 99),
            ];
          });
        }
      },
      onHistoryUpdated: (tabId, url, title, isReload, nativeState) => {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            const currentHistoryUrl = t.history[t.historyIndex];
            const isDuplicate = isReload || currentHistoryUrl === url;
            const updatedHistory =
              nativeState.historyUrls.length > 0
                ? nativeState.historyUrls
                : isDuplicate
                ? t.history
                : [...t.history.slice(0, t.historyIndex + 1), url];
            const updatedIndex =
              nativeState.historyUrls.length > 0
                ? nativeState.historyIndex
                : isDuplicate
                ? t.historyIndex
                : updatedHistory.length - 1;
            return {
              ...t,
              url,
              title: title && title !== "New Tab" ? title : t.title,
              history: updatedHistory,
              historyIndex: updatedIndex,
            };
          })
        );
      },
      onTitleChanged: (tabId, title) => {
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, title } : t))
        );
      },
      onError: (tabId, errorInfo, userMessage) => {
        requestTimeoutManagerRef.current.onStopLoading(tabId);
        resilienceCoordinatorRef.current?.mainFrameError(tabId, errorInfo.errorCode, {
          url: errorInfo.failedUrl,
          description: userMessage,
          statusCode: errorInfo.statusCode,
        });
        setResilienceUiTick((n) => n + 1);
        const navCtrl = navigationControllersRef.current.get(tabId);
        if (navCtrl) {
          navCtrl.onReceivedError(errorInfo.statusCode || -1, userMessage, errorInfo.failedUrl);
        }
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  url: errorInfo.failedUrl || t.url,
                  isLoading: false,
                  error: userMessage,
                  errorInfo,
                }
              : t
          )
        );
      },
      onSubresourceError: (tabId, failingUrl, errorCodeOrStatus) => {
        // Strictly separated: subresource failure NEVER sets tab.error or tab.errorInfo
        resilienceCoordinatorRef.current?.subresourceError(tabId, {
          resourceUrl: failingUrl,
          code: errorCodeOrStatus,
        });
        setResilienceUiTick((n) => n + 1);
      },
      onCreateWindow: (openerTabId, targetUrl) => {
        handleOpenPopupTabRef.current?.(targetUrl, openerTabId);
      },
      onCloseWindow: (tabId) => {
        handleCloseTabRef.current?.(tabId);
      },
      onDownloadStart: (_tabId, dlInfo) => {
        let filename: string | undefined;
        if (dlInfo.contentDisposition) {
          const match = dlInfo.contentDisposition.match(/filename\*?=["']?(?:UTF-8'')?([^"';\r\n]+)/i);
          if (match?.[1]) {
            try {
              filename = decodeURIComponent(match[1].trim());
            } catch {
              filename = match[1].trim();
            }
          }
        }
        handleInitiateDownloadRef.current?.(dlInfo.url, filename);
      },
      onDownloadRequested: (ev) => {
        nativeDownloadRequestsRef.current.set(ev.requestId, ev);
        const ext = ev.suggestedFileName.includes(".")
          ? "." + ev.suggestedFileName.split(".").pop()!.toLowerCase()
          : "";
        const dangerousExts = new Set([
          ".apk",
          ".exe",
          ".bat",
          ".cmd",
          ".sh",
          ".jar",
          ".dex",
          ".so",
          ".msi",
        ]);
        const isDangerous =
          dangerousExts.has(ext) ||
          ev.mimeType.toLowerCase() === "application/vnd.android.package-archive";
        setDownloadPrompt({
          downloadId: ev.requestId,
          nativeRequestId: ev.requestId,
          tabId: ev.tabId,
          filename: ev.suggestedFileName,
          mimeType: ev.mimeType,
          contentLengthFormatted:
            ev.contentLength > 0 ? formatBytes(ev.contentLength) : "Unknown size",
          domain: getCleanDomain(ev.url),
          displayUrl: ev.url,
          isExecutableOrDangerous: isDangerous,
          securityWarning: isDangerous
            ? "This file is an executable or Android package (.apk). Only save if you trust the origin."
            : undefined,
        });
      },
      onDownloadProgress: (ev) => {
        const approved = ev.requestId
          ? nativeApprovedByRequestIdRef.current.get(ev.requestId)
          : undefined;
        let existing = downloadPersistenceManagerRef.current.getPersistedDownload(ev.downloadId);
        if (!existing) {
          const safeUrl = ev.url || approved?.url || "https://download.local/file";
          const safeName = sanitizeDownloadFileName(
            ev.fileName || approved?.fileName || "download",
            ev.mimeType || approved?.mimeType
          );
          const mime = ev.mimeType || approved?.mimeType || "application/octet-stream";
          const totalBytes =
            ev.total > 0 ? ev.total : approved?.totalBytes && approved.totalBytes > 0 ? approved.totalBytes : -1;
          downloadPersistenceManagerRef.current.persistDownload({
            downloadId: ev.downloadId,
            tabId: ev.tabId || approved?.tabId || activeTabId,
            requestEpoch: 1,
            sourceUrl: safeUrl,
            sanitizedUrl: safeUrl,
            domain: getCleanDomain(safeUrl) || "web",
            filename: safeName,
            sanitizedFilename: safeName,
            extension: safeName.includes(".") ? "." + safeName.split(".").pop()! : "",
            mimeType: mime,
            totalBytes,
            state: DownloadLifecycleState.DOWNLOADING,
            isPrivate: false,
            isDangerousExtension: false,
            startTime: Date.now(),
            abortController: null,
            progress: {
              bytesDownloaded: ev.bytes,
              totalBytes,
              percentage: totalBytes > 0 ? Math.round((ev.bytes / totalBytes) * 100) : 0,
              speedBps: 0,
              estimatedRemainingMs: 0,
              lastUpdateTime: Date.now(),
            },
          });
          existing = downloadPersistenceManagerRef.current.getPersistedDownload(ev.downloadId);
        }

        if (ev.state === "queued" || ev.state === "running") {
          downloadPersistenceManagerRef.current.updateDownloadProgress(
            ev.downloadId,
            ev.bytes,
            ev.total > 0 ? ev.total : undefined,
            DownloadLifecycleState.DOWNLOADING
          );
        } else if (ev.state === "waiting_network" || ev.state === "paused") {
          downloadPersistenceManagerRef.current.updateDownloadProgress(
            ev.downloadId,
            ev.bytes,
            ev.total > 0 ? ev.total : undefined
          );
          downloadPersistenceManagerRef.current.markDownloadInterrupted(
            ev.downloadId,
            ev.reasonCode || ev.state
          );
        } else if (ev.state === "completed") {
          downloadPersistenceManagerRef.current.updateDownloadProgress(
            ev.downloadId,
            ev.bytes,
            ev.total > 0 ? ev.total : ev.bytes
          );
          downloadPersistenceManagerRef.current.markDownloadCompleted(ev.downloadId);
        } else if (ev.state === "failed") {
          downloadPersistenceManagerRef.current.markDownloadFailed(
            ev.downloadId,
            ev.reasonCode || "Native download failed"
          );
        }

        try {
          setPersistedDownloads(downloadPersistenceManagerRef.current.loadPersistedDownloads());
        } catch {}
      },
      onDownloadCompleted: (ev) => {
        const approved = ev.requestId
          ? nativeApprovedByRequestIdRef.current.get(ev.requestId)
          : undefined;
        const existing = downloadPersistenceManagerRef.current.getPersistedDownload(ev.downloadId);
        if (!existing) {
          const safeUrl = ev.url || approved?.url || "https://download.local/file";
          const safeName = sanitizeDownloadFileName(
            ev.fileName || approved?.fileName || "download",
            ev.mimeType
          );
          const finalBytes = ev.bytes ?? ev.total ?? approved?.totalBytes ?? 0;
          downloadPersistenceManagerRef.current.persistDownload({
            downloadId: ev.downloadId,
            tabId: ev.tabId || approved?.tabId || activeTabId,
            requestEpoch: 1,
            sourceUrl: safeUrl,
            sanitizedUrl: safeUrl,
            domain: getCleanDomain(safeUrl) || "web",
            filename: safeName,
            sanitizedFilename: safeName,
            extension: safeName.includes(".") ? "." + safeName.split(".").pop()! : "",
            mimeType: ev.mimeType || "application/octet-stream",
            totalBytes: finalBytes,
            state: DownloadLifecycleState.DOWNLOADING,
            isPrivate: false,
            isDangerousExtension: false,
            startTime: Date.now(),
            abortController: null,
            progress: {
              bytesDownloaded: finalBytes,
              totalBytes: finalBytes,
              percentage: 100,
              speedBps: 0,
              estimatedRemainingMs: 0,
              lastUpdateTime: Date.now(),
            },
          });
        } else if (typeof ev.bytes === "number" && ev.bytes > 0) {
          downloadPersistenceManagerRef.current.updateDownloadProgress(
            ev.downloadId,
            ev.bytes,
            ev.total && ev.total > 0 ? ev.total : ev.bytes
          );
        }
        downloadPersistenceManagerRef.current.markDownloadCompleted(ev.downloadId);
        if (ev.requestId) {
          nativeApprovedByRequestIdRef.current.delete(ev.requestId);
        }
        try {
          setPersistedDownloads(downloadPersistenceManagerRef.current.loadPersistedDownloads());
        } catch {}
        showTransitionNotice(
          lang === "bn"
            ? `ডাউনলোড সম্পন্ন: ${ev.fileName}`
            : `Download completed: ${ev.fileName}`,
          3000
        );
      },
      onDownloadUnsupported: (ev) => {
        showTransitionNotice(
          lang === "bn"
            ? `অসমর্থিত ডাউনলোড ধরন (${ev.scheme}:): ${ev.message}`
            : ev.message,
          4000
        );
      },
      onContextMenuRequested: (ev) => {
        setContextMenuPrompt(ev);
      },
      onFavicon: (ev) => {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === ev.tabId && !t.isPrivate
              ? { ...t, favicon: ev.dataUrl }
              : t
          )
        );
      },
      onExternalAuthRequired: (tabId, targetUrl) => {
        const promptId = `google-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setGoogleAuthPrompt({
          id: promptId,
          tabId,
          targetUrl,
          sourceDomain: getCleanDomain(targetUrl),
          serviceName: classifyGoogleAuthFlow(targetUrl).serviceName,
          reason:
            "Google Sign-In / OAuth requires interactive JavaScript and direct authentication session continuity in the system external browser.",
          timestamp: Date.now(),
        });
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  url: t.history[t.historyIndex] ?? "",
                  isLoading: false,
                }
              : t
          )
        );
      },
      onExternalIntentUrl: (targetUrl) => {
        if (targetUrl) {
          handleNavigateRef.current?.(targetUrl);
        }
      },
      onFindResult: (tabId, activeMatchOrdinal, numberOfMatches) => {
        setNativeFindResults((prev) => ({
          ...prev,
          [tabId]: { activeMatchOrdinal, numberOfMatches },
        }));
      },
    });
  }
  const handleOpenPopupTabRef = useRef<((url: string, openerTabId?: string) => void) | null>(null);
  const handleCloseTabRef = useRef<((tabId: string) => void) | null>(null);
  const handleInitiateDownloadRef = useRef<((url: string, filename?: string) => void) | null>(null);

  // NATIVE-40A: Android WebView Navigation Control Boundary (per-tab controller mapping)
  const navigationControllersRef = useRef<Map<string, AndroidWebViewNavigationController>>(
    new Map()
  );
  const isDispatchingNavigationRef = useRef(false);

  const getOrCreateNavigationController = useCallback(
    (tabId: string): AndroidWebViewNavigationController => {
      let controller = navigationControllersRef.current.get(tabId);
      if (!controller) {
        const targetTab = tabs.find((t) => t.id === tabId);
        controller = createAndroidWebViewNavigationController({
          tabId,
          initialUrl: targetTab?.url || "about:blank",
          onNavigate: (navUrl, targetTabId, isHistoryNav, targetHistoryIndex) => {
            if (isDispatchingNavigationRef.current) return;
            try {
              isDispatchingNavigationRef.current = true;
              if (!navUrl) {
                // Return to Start Page
                setTabs((prev) =>
                  prev.map((t) =>
                    t.id === targetTabId
                      ? {
                          ...t,
                          url: "",
                          title: t.isPrivate ? "Private Tab" : "New Tab",
                          contentHtml: undefined,
                          rawText: undefined,
                          error: undefined,
                          errorInfo: undefined,
                          isLoading: false,
                          historyIndex: targetHistoryIndex ?? 0,
                        }
                      : t
                  )
                );
              } else {
                handleNavigate(navUrl, targetTabId, isHistoryNav, targetHistoryIndex);
              }
            } finally {
              isDispatchingNavigationRef.current = false;
            }
          },
          onLoadingChange: (tId, isLoading) => {
            setTabs((prev) =>
              prev.map((t) => (t.id === tId ? { ...t, isLoading } : t))
            );
          },
        });
        if (targetTab) {
          controller.syncHistoryState(targetTab.history, targetTab.historyIndex);
        }
        navigationControllersRef.current.set(tabId, controller);
      }
      return controller;
    },
    [tabs, handleNavigate]
  );

  // New tab
  const handleNewTab = (isPrivate = false) => {
    const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTab: BrowserTab = {
      id: newId,
      url: "",
      title: isPrivate ? "Private Tab" : "New Tab",
      history: [""],
      historyIndex: 0,
      isLoading: false,
      isPrivate,
      isReaderMode: false,
      isSuspended: false,
      zoomLevel: 100,
      siteMode: "default",
    };
    pageLifecycleManagerRef.current.registerTab(newId, "", true);
    pageLifecycleManagerRef.current.setForegroundTab(newId);
    // NATIVE-30: Register tab in rendering resilience manager
    renderingResilienceManagerRef.current.registerTab(newId, "", true, isPrivate);
    renderingResilienceManagerRef.current.setForegroundTab(newId);
    // NATIVE-31: Register tab in page lifecycle safety manager
    pageLifecycleSafetyManagerRef.current.registerTab(newId, "", isPrivate);
    // NATIVE-32: Register tab in error and recovery lifecycle manager
    errorRecoveryLifecycleManagerRef.current.registerTab(newId, "", isPrivate);
    // NATIVE-33: Register tab in request timeout and recovery manager
    requestTimeoutManagerRef.current.registerTab(newId, "", isPrivate);
    // FORM-N2: Register & select tab in Native Browser Engine
    nativeBrowserEngineRef.current?.createOrUpdateTab(newId, {
      isPrivate,
      siteMode: "default",
      zoomLevel: 100,
    });
    nativeBrowserEngineRef.current?.selectTab(newId, isPrivate);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  // NATIVE-13: Handle secure popup / new window spawn from window.open or target="_blank"
  const handleOpenPopupTab = useCallback(
    (targetUrl: string, openerTabId = activeTabId) => {
      if (!targetUrl || typeof targetUrl !== "string") return;

      // 1. Controlled Safe Google Sign-In & OAuth External-Browser Fallback
      if (isGoogleAuthOrOAuthUrl(targetUrl)) {
        const promptId = `google-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let domain = "";
        try {
          domain = new URL(targetUrl).hostname;
        } catch {
          domain = "accounts.google.com";
        }
        setGoogleAuthPrompt({
          id: promptId,
          tabId: openerTabId,
          targetUrl,
          flowType: classifyGoogleAuthFlow(targetUrl),
          domain,
          timestamp: Date.now(),
        });
        return;
      }

      // 2. Prevent duplicate popup / new-tab creation storms within 750ms for same target
      const dedupKey = `${openerTabId}::${targetUrl}`;
      const now = Date.now();
      const lastSpawn = recentPopupsRef.current.get(dedupKey) || 0;
      if (now - lastSpawn < 750) {
        return;
      }
      recentPopupsRef.current.set(dedupKey, now);

      // Clean up old entries from recentPopupsRef
      if (recentPopupsRef.current.size > 50) {
        for (const [k, t] of recentPopupsRef.current) {
          if (now - t > 5000) recentPopupsRef.current.delete(k);
        }
      }

      const result = popupManagerRef.current.handleCreateWindow({
        openerTabId,
        targetUrl,
        isUserGesture: true,
      });

      if (!result.allowed || !result.newTabId || !result.targetUrl) {
        console.warn("[NATIVE-13] Blocked popup / new-window target:", result.reason);
        return;
      }

      const openerTab = tabs.find((t) => t.id === openerTabId);
      const isPrivate = openerTab ? openerTab.isPrivate : false;

      const newId = result.newTabId;
      const newTab: BrowserTab = {
        id: newId,
        url: result.targetUrl,
        title: "New Tab",
        history: [result.targetUrl],
        historyIndex: 0,
        isLoading: true,
        isPrivate,
        isReaderMode: false,
        isSuspended: false,
        zoomLevel: 100,
        siteMode: openerTab?.siteMode || "default",
      };

      pageLifecycleManagerRef.current.registerTab(newId, result.targetUrl, true);
      pageLifecycleManagerRef.current.setForegroundTab(newId);
      renderingResilienceManagerRef.current.registerTab(newId, result.targetUrl, true, isPrivate);
      renderingResilienceManagerRef.current.setForegroundTab(newId);
      pageLifecycleSafetyManagerRef.current.registerTab(newId, result.targetUrl, isPrivate);
      errorRecoveryLifecycleManagerRef.current.registerTab(newId, result.targetUrl, isPrivate);
      requestTimeoutManagerRef.current.registerTab(newId, result.targetUrl, isPrivate);

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);

      // Navigate newly spawned isolated tab
      handleNavigate(result.targetUrl, newId);
    },
    [activeTabId, tabs, handleNavigate]
  );

  // FORM-3 Part B: Context menu handlers (open in new tab, open in private tab on proxy path, copy, share, download image)
  const handleContextMenuOpenInNewTab = useCallback(
    (targetUrl: string) => {
      setContextMenuPrompt(null);
      if (!targetUrl) return;
      const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newTab: BrowserTab = {
        id: newId,
        url: targetUrl,
        title: "New Tab",
        history: [targetUrl],
        historyIndex: 0,
        isLoading: true,
        isPrivate: false,
        isReaderMode: false,
        isSuspended: false,
        zoomLevel: 100,
        siteMode: "default",
      };
      pageLifecycleManagerRef.current.registerTab(newId, targetUrl, true);
      pageLifecycleManagerRef.current.setForegroundTab(newId);
      renderingResilienceManagerRef.current.registerTab(newId, targetUrl, true, false);
      renderingResilienceManagerRef.current.setForegroundTab(newId);
      pageLifecycleSafetyManagerRef.current.registerTab(newId, targetUrl, false);
      errorRecoveryLifecycleManagerRef.current.registerTab(newId, targetUrl, false);
      requestTimeoutManagerRef.current.registerTab(newId, targetUrl, false);
      nativeBrowserEngineRef.current?.createOrUpdateTab(newId, {
        isPrivate: false,
        siteMode: "default",
        zoomLevel: 100,
      });
      nativeBrowserEngineRef.current?.selectTab(newId, false);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);
      handleNavigate(targetUrl, newId);
    },
    [handleNavigate]
  );

  const handleContextMenuOpenInPrivateTab = useCallback(
    (targetUrl: string) => {
      setContextMenuPrompt(null);
      if (!targetUrl) return;
      const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newTab: BrowserTab = {
        id: newId,
        url: targetUrl,
        title: "Private Tab",
        history: [targetUrl],
        historyIndex: 0,
        isLoading: true,
        isPrivate: true,
        isReaderMode: false,
        isSuspended: false,
        zoomLevel: 100,
        siteMode: "default",
      };
      pageLifecycleManagerRef.current.registerTab(newId, targetUrl, true);
      pageLifecycleManagerRef.current.setForegroundTab(newId);
      renderingResilienceManagerRef.current.registerTab(newId, targetUrl, true, true);
      renderingResilienceManagerRef.current.setForegroundTab(newId);
      pageLifecycleSafetyManagerRef.current.registerTab(newId, targetUrl, true);
      errorRecoveryLifecycleManagerRef.current.registerTab(newId, targetUrl, true);
      requestTimeoutManagerRef.current.registerTab(newId, targetUrl, true);
      if (nativeBrowserEngineRef.current?.getCapabilities().privateIsolation) {
        nativeBrowserEngineRef.current.createOrUpdateTab(newId, {
          isPrivate: true,
          siteMode: "default",
          zoomLevel: 100,
        });
      }
      nativeBrowserEngineRef.current?.selectTab(newId, true);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);
      handleNavigate(targetUrl, newId);
    },
    [handleNavigate]
  );

  const handleContextMenuCopyLink = useCallback(
    async (targetUrl: string) => {
      setContextMenuPrompt(null);
      if (!targetUrl) return;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(targetUrl);
        }
      } catch {}
      showTransitionNotice(
        lang === "bn"
          ? translations.bn.contextMenuCopiedToast
          : translations.en.contextMenuCopiedToast,
        2500
      );
    },
    [lang]
  );

  const handleContextMenuShareLink = useCallback(
    (targetUrl: string) => {
      setContextMenuPrompt(null);
      if (!targetUrl) return;
      const sharedNatively = nativeBrowserEngineRef.current?.shareUrl(
        targetUrl,
        activeTab?.title || ""
      );
      if (!sharedNatively && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        navigator.share({ url: targetUrl, title: activeTab?.title || "" }).catch(() => {});
      }
    },
    [activeTab?.title]
  );

  const handleContextMenuDownloadImage = useCallback(
    (firstArg: string, secondArg: string) => {
      setContextMenuPrompt(null);
      const isFirstUrl = /^https?:\/\//i.test(firstArg);
      const imageUrl = isFirstUrl ? firstArg : secondArg;
      const tabId = isFirstUrl ? secondArg : firstArg;
      if (!imageUrl) return;
      const targetTab = tabs.find((t) => t.id === tabId);
      if (targetTab?.isPrivate) return;
      if (targetTab && !targetTab.isPrivate && nativeBrowserEngineRef.current?.isAvailable()) {
        // Trigger Form 2 native download consent flow
        nativeBrowserEngineRef.current.downloadImage(tabId, imageUrl);
      } else {
        handleInitiateDownloadRef.current?.(imageUrl);
      }
    },
    [tabs]
  );

  // FORM-3 Part F: Browser Menu Share, Copy Link, and Open in External Browser handlers
  const handleMenuSharePage = useCallback(() => {
    if (!activeTab?.url) return;
    handleContextMenuShareLink(toYouTubeDisplayUrl(activeTab.url));
  }, [activeTab?.url, handleContextMenuShareLink]);

  const handleMenuCopyLink = useCallback(() => {
    if (!activeTab?.url) return;
    handleContextMenuCopyLink(toYouTubeDisplayUrl(activeTab.url));
  }, [activeTab?.url, handleContextMenuCopyLink]);

  const handleMenuOpenExternalBrowser = useCallback(() => {
    if (!activeTab?.url) return;
    const openedNatively = nativeBrowserEngineRef.current?.openExternalBrowser(activeTab.url);
    if (!openedNatively) {
      launchSafeExternalBrowser(activeTab.url);
    }
  }, [activeTab?.url]);

  // NATIVE-19: Synchronize Browser Host window visibility with Page Lifecycle (pauseTimers / resumeTimers)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        pageLifecycleManagerRef.current.onHostActivityPause();
      } else {
        pageLifecycleManagerRef.current.onHostActivityResume(activeTabId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeTabId]);

  // Close tab
  const handleCloseTab = (idToClose: string) => {
    // Notify popup manager if this tab was a popup window session
    popupManagerRef.current.handleCloseWindow(idToClose);

    // Cancel and decouple any pending downloads for this closed tab
    downloadManagerRef.current.cancelDownloadsForTab(idToClose);

    // Cancel pending geolocation prompts and revoke grants for this closed tab
    geolocationManagerRef.current.onTabClosed(idToClose);

    // Cancel pending notification prompts and revoke grants for this closed tab
    notificationManagerRef.current.onTabClosed(idToClose);

    // NATIVE-17: Terminate persistent WebSockets for this closed tab
    webSocketManagerRef.current.onTabClosed(idToClose);

    // NATIVE-18: Purge tab sessionStorage and ephemeral private storage if last private tab
    const closingTab = tabs.find((t) => t.id === idToClose);
    const remainingPrivates = tabs.filter((t) => t.isPrivate && t.id !== idToClose).length;
    storageManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-19: Terminate page lifecycle and wipe all tab listeners
    pageLifecycleManagerRef.current.onTabClosed(idToClose);

    // NATIVE-20: Dismiss and purge all pending dialogs and flood records for closed tab
    dialogManagerRef.current.onTabClosed(idToClose);

    // NATIVE-21: Cancel pending HTTP auth/client cert challenges; purge private credentials if last private tab
    httpAuthManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-22: Close all WebRTC peer connections and media tracks for closed tab; purge private WebRTC state
    webRtcManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-23: Stop all Display Media screen capture sessions for closed tab; purge private capture sessions
    displayMediaManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-24: Revoke and purge all Object URLs and pending blob downloads for closed tab; purge private blobs
    blobDownloadManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-25: Abort readers, release allocated files and purge private file memory for closed tab
    fileSystemManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-26: Cancel pending clipboard & share prompts, wipe private ephemeral clipboard on close
    clipboardAndShareManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-11: Destroy media permission manager on tab close
    mediaPermissionManagersRef.current.get(idToClose)?.destroy();
    mediaPermissionManagersRef.current.delete(idToClose);

    // NATIVE-12: Destroy media playback manager on tab close
    mediaPlaybackManagersRef.current.get(idToClose)?.destroy();
    mediaPlaybackManagersRef.current.delete(idToClose);

    // NATIVE-27: Release audio focus, stop media playback and purge private media states on close
    backgroundMediaManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-28: Stop and terminate all governed media sessions and purge private media state on tab close
    mediaSessionGovernanceManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-29: Release media resources, decoders, and purge private resource accounts on tab close
    mediaResourceManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-30: Invalidate render epoch, clear frames/listeners & purge private rendering state on tab close
    renderingResilienceManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-31: Invalidate page lifecycle epoch, clear DOM/JS callbacks & purge private page state on tab close
    pageLifecycleSafetyManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-32: Invalidate recovery epoch, clear callbacks & purge private error state on tab close
    errorRecoveryLifecycleManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-33: Invalidate timeout epoch, clear timers & purge private timeout state on tab close
    requestTimeoutManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-35: Invalidate download epoch, cancel pending downloads & purge private download state on tab close
    downloadRequestLifecycleManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate, remainingPrivates);

    // NATIVE-36: Cleanup staging files and expunge private completed downloads on tab close
    downloadCompletionIntegrityManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate);

    // NATIVE-37: Cleanup tab recovery audit epochs on tab close
    downloadRecoveryAuditManagerRef.current.onTabClosed(idToClose);

    // NATIVE-38: Clean up tab resumption sessions & private state on tab close
    downloadResumptionManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate);

    // NATIVE-34: Invalidate redirect chain epoch and purge private redirect states on tab close
    redirectChainManagerRef.current.onTabClosed(idToClose, closingTab?.isPrivate);

    // NATIVE-40A: Destroy navigation controller on tab close
    const navController = navigationControllersRef.current.get(idToClose);
    if (navController) {
      navController.destroy();
      navigationControllersRef.current.delete(idToClose);
    }

    // FORM-N2: Close and destroy per-tab Native Android WebView
    nativeBrowserEngineRef.current?.closeTab(idToClose);
    // FORM-B2: Clean up per-tab resilience state and timers
    resilienceCoordinatorRef.current?.onTabClosed(idToClose);

    // Abort if loading
    const ctrl = inFlightControllersRef.current.get(idToClose);
    if (ctrl) {
      ctrl.abort();
      inFlightControllersRef.current.delete(idToClose);
    }
    tabRequestEpochRef.current.delete(idToClose);

    // Clean up isolated session cookies for this closed tab
    apiFetch("/api/cookies/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: idToClose }),
    }).catch(() => {});

    // NATIVE-HISTORY: Push non-private closed tab to recentlyClosedTabs stack
    if (
      closingTab &&
      !closingTab.isPrivate &&
      (closingTab.url || closingTab.history.some((h) => Boolean(h && h !== "")))
    ) {
      const safeUrl = isValidSafeUrl(closingTab.url) ? sanitizeUrlForHistory(closingTab.url) : "";
      const safeHistory = (closingTab.history || [""])
        .filter((h) => isValidSafeUrl(h))
        .map((h) => sanitizeUrlForHistory(h));

      if (safeUrl || safeHistory.some(Boolean)) {
        setRecentlyClosedTabs((prev) => [
          {
            id: closingTab.id,
            url: safeUrl,
            title: closingTab.title || "Closed Tab",
            history: safeHistory.length > 0 ? safeHistory : [safeUrl],
            historyIndex: Math.max(
              0,
              Math.min(closingTab.historyIndex, (safeHistory.length || 1) - 1)
            ),
            isReaderMode: Boolean(closingTab.isReaderMode),
            closedAt: Date.now(),
          },
          ...prev.slice(0, 9),
        ]);
      }
    }

    if (tabs.length <= 1) {
      // Reset single tab to home
      const resetId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setTabs([
        {
          id: resetId,
          url: "",
          title: "New Tab",
          history: [""],
          historyIndex: 0,
          isLoading: false,
          isPrivate: false,
          isReaderMode: false,
          isSuspended: false,
        },
      ]);
      setActiveTabId(resetId);
      return;
    }

    const index = tabs.findIndex((t) => t.id === idToClose);
    const newTabs = tabs.filter((t) => t.id !== idToClose);
    setTabs(newTabs);

    if (activeTabId === idToClose) {
      const nextTab = newTabs[Math.max(0, index - 1)];
      setActiveTabId(nextTab.id);
    }
  };

  // Close all other tabs (controlled memory release, preserves active tab state)
  const handleCloseOtherTabs = (keepTabId = activeTabId) => {
    // NATIVE-HISTORY: Push non-private closed tabs to recentlyClosedTabs stack
    const otherClosed = tabs.filter(
      (t) =>
        t.id !== keepTabId &&
        !t.isPrivate &&
        (t.url || t.history.some((h) => Boolean(h && h !== "")))
    );
    if (otherClosed.length > 0) {
      const newClosedEntries: RecentlyClosedTab[] = otherClosed.map((t) => {
        const safeUrl = isValidSafeUrl(t.url) ? sanitizeUrlForHistory(t.url) : "";
        const safeHistory = (t.history || [""])
          .filter((h) => isValidSafeUrl(h))
          .map((h) => sanitizeUrlForHistory(h));
        return {
          id: t.id,
          url: safeUrl,
          title: t.title || "Closed Tab",
          history: safeHistory.length > 0 ? safeHistory : [safeUrl],
          historyIndex: Math.max(0, Math.min(t.historyIndex, (safeHistory.length || 1) - 1)),
          isReaderMode: Boolean(t.isReaderMode),
          closedAt: Date.now(),
        };
      });
      setRecentlyClosedTabs((prev) => [...newClosedEntries, ...prev].slice(0, 10));
    }

    tabs.forEach((t) => {
      if (t.id !== keepTabId) {
        downloadManagerRef.current.cancelDownloadsForTab(t.id);
        geolocationManagerRef.current.onTabClosed(t.id);
        notificationManagerRef.current.onTabClosed(t.id);
        webSocketManagerRef.current.onTabClosed(t.id);
        storageManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        pageLifecycleManagerRef.current.onTabClosed(t.id);
        dialogManagerRef.current.onTabClosed(t.id);
        httpAuthManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        webRtcManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        displayMediaManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        blobDownloadManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        fileSystemManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        clipboardAndShareManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        mediaPermissionManagersRef.current.get(t.id)?.destroy();
        mediaPermissionManagersRef.current.delete(t.id);
        mediaPlaybackManagersRef.current.get(t.id)?.destroy();
        mediaPlaybackManagersRef.current.delete(t.id);
        backgroundMediaManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        mediaSessionGovernanceManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        mediaResourceManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        renderingResilienceManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        pageLifecycleSafetyManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        errorRecoveryLifecycleManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        requestTimeoutManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        downloadRequestLifecycleManagerRef.current.onTabClosed(t.id, t.isPrivate, keptTab?.isPrivate ? 1 : 0);
        downloadCompletionIntegrityManagerRef.current.onTabClosed(t.id, t.isPrivate);
        downloadRecoveryAuditManagerRef.current.onTabClosed(t.id);
        downloadResumptionManagerRef.current.onTabClosed(t.id, t.isPrivate);
        redirectChainManagerRef.current.onTabClosed(t.id, t.isPrivate);
        const nav = navigationControllersRef.current.get(t.id);
        if (nav) {
          nav.destroy();
          navigationControllersRef.current.delete(t.id);
        }
        nativeBrowserEngineRef.current?.closeTab(t.id);
        resilienceCoordinatorRef.current?.onTabClosed(t.id);
        const ctrl = inFlightControllersRef.current.get(t.id);
        if (ctrl) {
          ctrl.abort();
          inFlightControllersRef.current.delete(t.id);
        }
        tabRequestEpochRef.current.delete(t.id);
      }
    });

    const keptTab = tabs.find((t) => t.id === keepTabId);
    if (keptTab) {
      setTabs([{ ...keptTab, isSuspended: false }]);
      setActiveTabId(keepTabId);
    }
  };

  // Restore most recently closed tab (NATIVE-HISTORY-RESTORE)
  const handleRestoreClosedTab = useCallback(() => {
    setRecentlyClosedTabs((prev) => {
      if (prev.length === 0) return prev;
      const [restored, ...remaining] = prev;
      const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const restoredHistory =
        restored.history.length > 0 ? [...restored.history] : [restored.url || ""];
      const newTab: BrowserTab = {
        id: newTabId,
        url: restored.url,
        title: restored.title,
        history: restoredHistory,
        historyIndex: Math.max(0, Math.min(restored.historyIndex, restoredHistory.length - 1)),
        isLoading: false,
        isPrivate: false,
        isReaderMode: restored.isReaderMode,
        isSuspended: false,
      };

      setTabs((currentTabs) => [...currentTabs, newTab]);
      setActiveTabId(newTabId);

      if (restored.url && isValidSafeUrl(restored.url)) {
        setTimeout(() => {
          handleNavigate(restored.url, newTabId, true, newTab.historyIndex);
        }, 50);
      }

      return remaining;
    });
  }, [handleNavigate]);

  // NATIVE-14 & NATIVE-35: Download Handlers
  const handleInitiateDownload = useCallback(
    (url: string, declaredFilename?: string) => {
      const active = tabs.find((t) => t.id === activeTabId) || tabs[0];
      const epoch = tabRequestEpochRef.current.get(activeTabId) || 1;

      // NATIVE-35: Route, validate & protect against race conditions
      const routeResult = downloadRequestLifecycleManagerRef.current.handleDownloadRequest({
        url,
        tabId: activeTabId,
        suggestedFilename: declaredFilename,
        isPrivate: active?.isPrivate,
      });

      if (!routeResult.accepted) {
        if (routeResult.blockReason === "RATE_LIMIT_EXCEEDED") {
          showTransitionNotice(
            lang === "bn"
              ? "ডাউনলোড ইতিমধ্যে প্রক্রিয়াধীন রয়েছে"
              : "Download already in progress",
            2500
          );
        } else if (routeResult.blockReason) {
          showTransitionNotice(
            lang === "bn"
              ? `নিরাপত্তা কারণে ডাউনলোড বাতিল: ${routeResult.message || "অনিরাপদ উৎস"}`
              : `Download blocked for safety: ${routeResult.message || "Unsafe target"}`,
            4000
          );
        }
        return;
      }

      // NATIVE-36: Create temporary staging record for completion integrity tracking
      downloadCompletionIntegrityManagerRef.current.createStagingDownload({
        downloadId: routeResult.downloadId || `dl-${Date.now()}`,
        tabId: activeTabId,
        destinationFilename: declaredFilename || "download.bin",
        isPrivate: active?.isPrivate,
      });

      // Persist durable download record if non-private
      if (!active?.isPrivate && routeResult.downloadId) {
        const dlRecord = downloadRequestLifecycleManagerRef.current.getDownloadRecord(routeResult.downloadId);
        const stgRecord = downloadCompletionIntegrityManagerRef.current.getStagingByDownloadId(routeResult.downloadId);
        if (dlRecord) {
          downloadPersistenceManagerRef.current.persistDownload(dlRecord, stgRecord);
          try {
            setPersistedDownloads(downloadPersistenceManagerRef.current.loadPersistedDownloads());
          } catch {}
        }
      }

      const res = downloadManagerRef.current.initiateDownload({
        url,
        tabId: activeTabId,
        contentDisposition: declaredFilename ? `attachment; filename="${declaredFilename}"` : undefined,
        isUserGesture: true,
        isPrivateTab: active?.isPrivate,
        requestEpoch: epoch,
      });

      if (!res.success) {
        console.warn("[NATIVE-14] Download rejected:", res.reason);
      }
    },
    [activeTabId, tabs, lang]
  );

  // Keep restoreClosedTabRef and native engine callback refs synchronized with latest handlers
  useEffect(() => {
    restoreClosedTabRef.current = handleRestoreClosedTab;
    handleOpenPopupTabRef.current = handleOpenPopupTab;
    handleCloseTabRef.current = handleCloseTab;
    handleInitiateDownloadRef.current = handleInitiateDownload;
    handleNavigateRef.current = handleNavigate;
  }, [handleRestoreClosedTab, handleOpenPopupTab, handleCloseTab, handleInitiateDownload, handleNavigate]);

  const handleApproveDownload = (downloadId: string, customFileName?: string) => {
    const nativeReqId = downloadPrompt?.nativeRequestId;
    if (nativeReqId || nativeDownloadRequestsRef.current.has(downloadId)) {
      const reqId = nativeReqId || downloadId;
      const reqMeta = nativeDownloadRequestsRef.current.get(reqId);
      const safeFileName = sanitizeDownloadFileName(
        customFileName || downloadPrompt?.filename || reqMeta?.suggestedFileName || "download",
        downloadPrompt?.mimeType || reqMeta?.mimeType
      );
      nativeApprovedByRequestIdRef.current.set(reqId, {
        tabId: reqMeta?.tabId || downloadPrompt?.tabId || activeTabId,
        url: reqMeta?.url || downloadPrompt?.displayUrl || "https://download.local/file",
        fileName: safeFileName,
        mimeType: reqMeta?.mimeType || downloadPrompt?.mimeType || "application/octet-stream",
        totalBytes: reqMeta?.contentLength ?? -1,
      });
      nativeDownloadRequestsRef.current.delete(reqId);
      nativeBrowserEngineRef.current?.resolveDownload({
        requestId: reqId,
        allow: true,
        fileName: safeFileName,
      });
      setDownloadPrompt(null);
      return;
    }

    // NATIVE-35: Approve download in safe lifecycle
    downloadRequestLifecycleManagerRef.current.approveDownloadConsent(downloadId);

    // NATIVE-36: Finalize download with integrity validation & collision protection
    const stg = downloadCompletionIntegrityManagerRef.current.getStagingByDownloadId(downloadId);
    let finalSaveFilename: string | undefined;
    let finalizedRecord: any = undefined;
    if (stg) {
      downloadCompletionIntegrityManagerRef.current.appendChunk({
        stagingId: stg.stagingId,
        tabId: stg.tabId,
        chunkSize: Math.max(1024, stg.expectedBytes > 0 ? stg.expectedBytes : 1024),
        isFinalChunk: true,
      });

      const finResult = downloadCompletionIntegrityManagerRef.current.finalizeDownload({
        stagingId: stg.stagingId,
        tabId: stg.tabId,
      });

      if (finResult.success && finResult.record) {
        finalSaveFilename = finResult.record.finalFilename;
        finalizedRecord = finResult.record;
      }
    }

    // NATIVE-37: Guarded completion callback ensuring idempotency, epoch validation, and safe finalization
    const currentEpoch = downloadRecoveryAuditManagerRef.current.getTabEpoch(activeTabId);
    const token = `comp-token-${downloadId}-${Date.now()}`;
    downloadRecoveryAuditManagerRef.current.executeGuardedCompletionCallback({
      downloadId,
      tabId: activeTabId,
      callbackEpoch: currentEpoch,
      completionToken: token,
      lifecycleMgr: downloadRequestLifecycleManagerRef.current,
      callback: () => {
        const res = downloadManagerRef.current.approveDownload(downloadId);
        if (res.success && res.metadata) {
          const saveName = finalSaveFilename || res.metadata.filename;
          // Safe, user-initiated file save without privileged native access
          const link = document.createElement("a");
          link.href = res.metadata.sanitizedUrl;
          link.download = saveName;
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          downloadManagerRef.current.completeDownload(downloadId);
          downloadRequestLifecycleManagerRef.current.completeDownload(downloadId);
          downloadPersistenceManagerRef.current.markDownloadCompleted(downloadId, finalizedRecord);
          try {
            setPersistedDownloads(downloadPersistenceManagerRef.current.loadPersistedDownloads());
          } catch {}
        }
      },
    });
    setDownloadPrompt(null);
  };

  // Downloads Manager Handlers
  const handleRemoveDownload = useCallback(
    (downloadId: string) => {
      const existing = downloadPersistenceManagerRef.current.getPersistedDownload(downloadId);
      if (
        existing &&
        (existing.lifecycleState === DownloadLifecycleState.DOWNLOADING ||
          existing.lifecycleState === DownloadLifecycleState.STARTING ||
          existing.lifecycleState === DownloadLifecycleState.VALIDATING ||
          existing.lifecycleState === DownloadLifecycleState.PENDING_CONSENT ||
          existing.lifecycleState === DownloadLifecycleState.PAUSED)
      ) {
        nativeBrowserEngineRef.current?.cancelDownload({ downloadId });
      } else {
        nativeBrowserEngineRef.current?.deleteDownload({ downloadId });
      }
      downloadPersistenceManagerRef.current.removePersistedDownload(downloadId);
      setPersistedDownloads((prev) => prev.filter((d) => d.downloadId !== downloadId));
      showTransitionNotice(
        lang === "bn"
          ? translations.bn.downloadRemovedNotice
          : translations.en.downloadRemovedNotice,
        2500
      );
    },
    [lang]
  );

  const handleClearAllDownloads = useCallback(() => {
    downloadPersistenceManagerRef.current.clearAllNonPrivatePersistedRecords();
    setPersistedDownloads([]);
    showTransitionNotice(
      lang === "bn"
        ? translations.bn.allDownloadsClearedNotice
        : translations.en.allDownloadsClearedNotice,
      3000
    );
  }, [lang]);

  const handleRejectDownload = (downloadId: string) => {
    const nativeReqId = downloadPrompt?.nativeRequestId;
    if (nativeReqId || nativeDownloadRequestsRef.current.has(downloadId)) {
      const reqId = nativeReqId || downloadId;
      nativeDownloadRequestsRef.current.delete(reqId);
      nativeBrowserEngineRef.current?.resolveDownload({
        requestId: reqId,
        allow: false,
      });
      setDownloadPrompt(null);
      return;
    }

    // NATIVE-36: Cancel and cleanup staging artifacts
    const stg = downloadCompletionIntegrityManagerRef.current.getStagingByDownloadId(downloadId);
    if (stg) {
      downloadCompletionIntegrityManagerRef.current.cancelAndCleanupStaging(stg.stagingId, "User rejected download consent");
    }
    downloadRequestLifecycleManagerRef.current.rejectDownloadConsent(downloadId, "User rejected download consent");
    downloadManagerRef.current.rejectDownload(downloadId);
    downloadPersistenceManagerRef.current.markDownloadFailed(downloadId, "User rejected download consent");
    setDownloadPrompt(null);
  };

  // NATIVE-38: Download Resumption & HTTP Range Boundary handlers
  const handlePauseDownload = useCallback(
    (downloadId: string, tabId = activeTabId) => {
      const res = downloadResumptionManagerRef.current.pauseDownload(
        downloadId,
        tabId,
        downloadCompletionIntegrityManagerRef.current,
        downloadRequestLifecycleManagerRef.current
      );
      if (res.success) {
        downloadPersistenceManagerRef.current.markDownloadInterrupted(downloadId, "User paused download");
      }
      return res;
    },
    [activeTabId]
  );

  const handleResumeDownload = useCallback(
    (
      downloadId: string,
      tabId = activeTabId,
      serverClassification?: RangeResponseClassification
    ) => {
      return downloadResumptionManagerRef.current.resumeDownload(
        downloadId,
        tabId,
        downloadCompletionIntegrityManagerRef.current,
        downloadRequestLifecycleManagerRef.current,
        serverClassification
      );
    },
    [activeTabId]
  );

  // Download Persistence & Interrupted-Download Recovery Handlers
  const handleEvaluateDownloadRecovery = useCallback((downloadId: string) => {
    return downloadPersistenceManagerRef.current.evaluateRecovery(downloadId);
  }, []);

  const handleResumePersistedDownload = useCallback(
    (downloadId: string) => {
      const recResult = downloadPersistenceManagerRef.current.reconnectToLifecycle(
        downloadId,
        downloadRequestLifecycleManagerRef.current,
        downloadCompletionIntegrityManagerRef.current,
        downloadResumptionManagerRef.current
      );
      if (recResult.success) {
        return handleResumeDownload(downloadId);
      }
      return { success: false, error: recResult.error };
    },
    [handleResumeDownload]
  );

  // NATIVE-15: Geolocation Handlers
  const handleApproveGeolocation = (requestId: string, retain: boolean) => {
    const promptTabId = geolocationPrompt?.tabId;
    const promptOrigin = geolocationPrompt?.origin;
    geolocationManagerRef.current.decidePermission(requestId, true, retain);
    if (!retain && promptTabId && promptOrigin) {
      // Never persist an un-retained "ask" answer across subsequent requests
      geolocationManagerRef.current.onNavigation(promptTabId, promptOrigin);
    }
    setGeolocationPrompt(null);
  };

  const handleRejectGeolocation = (requestId: string) => {
    geolocationManagerRef.current.decidePermission(requestId, false, false);
    setGeolocationPrompt(null);
  };

  // NATIVE-16: Notification Handlers
  const handleApproveNotification = (requestId: string, retain: boolean) => {
    const promptTabId = notificationPrompt?.tabId;
    notificationManagerRef.current.decidePermission(requestId, true, retain);
    if (!retain && promptTabId) {
      // Never persist an un-retained "ask" answer across subsequent requests
      notificationManagerRef.current.onTabClosed(promptTabId);
    }
    setNotificationPrompt(null);
  };

  const handleDenyNotification = (requestId: string) => {
    notificationManagerRef.current.decidePermission(requestId, false, false);
    setNotificationPrompt(null);
  };

  const handleDismissNotification = (requestId: string) => {
    notificationManagerRef.current.dismissOrCancelPermission(requestId, "User dismissed notification dialog");
    setNotificationPrompt(null);
  };

  // FORM 6: Per-Site Permission Enforcement Handler (consults live siteOverrides + permission managers)
  const handleRequestSitePermission = useCallback(
    async (req: FramePermissionRequest): Promise<FramePermissionResult> => {
      if (!req || typeof req !== "object" || typeof req.tabId !== "string" || typeof req.kind !== "string") {
        return { allowed: false, state: "denied", reason: "Malformed permission request" };
      }

      const kind = req.kind.trim().toLowerCase() as SitePermissionKind;
      if (
        kind !== "camera" &&
        kind !== "microphone" &&
        kind !== "geolocation" &&
        kind !== "notifications"
      ) {
        return {
          allowed: false,
          state: "denied",
          reason: `Unknown permission kind '${kind}' denied by policy`,
        };
      }

      const targetTab = tabsRef.current.find((t) => t.id === req.tabId);
      const tabUrl = (targetTab?.url || req.url || "").trim();
      if (!tabUrl) {
        return { allowed: false, state: "denied", reason: "Missing tab URL for permission check" };
      }

      const domain = getCleanDomain(tabUrl);
      if (!domain) {
        return { allowed: false, state: "denied", reason: "Invalid domain for permission check" };
      }

      // Always re-read live siteOverrides per request (never use stale decisions)
      const currentOverride = siteOverridesRef.current[domain];
      const rawSetting = currentOverride?.[kind];

      // Default is deny: block or unset -> deny immediately, no prompt
      if (!rawSetting || rawSetting === "block") {
        return {
          allowed: false,
          state: "denied",
          reason:
            rawSetting === "block"
              ? `Permission '${kind}' is explicitly blocked for ${domain}`
              : `Permission '${kind}' is blocked by default (unset) for ${domain}`,
        };
      }

      if (rawSetting !== "ask" && rawSetting !== "allow") {
        return {
          allowed: false,
          state: "denied",
          reason: `Invalid site override setting for '${kind}'`,
        };
      }

      const isHttpsUrl = tabUrl.toLowerCase().startsWith("https://");

      // Helper to validate secure (HTTPS) origin per manager
      const checkSecureOrigin = (): { isSecure: boolean; reason?: string } => {
        if (!isHttpsUrl) {
          return { isSecure: false, reason: `Permission '${kind}' requires a secure HTTPS origin` };
        }
        if (kind === "geolocation") {
          const check = validateGeolocationOrigin(tabUrl);
          return { isSecure: check.isSecure, reason: check.reason };
        }
        if (kind === "notifications") {
          const check = validateNotificationOrigin(tabUrl);
          return { isSecure: check.isSecure, reason: check.reason };
        }
        const check = validateMediaRequestOrigin(tabUrl);
        return { isSecure: check.isSecure, reason: check.reason };
      };

      const originSecurity = checkSecureOrigin();
      if (!originSecurity.isSecure) {
        return {
          allowed: false,
          state: "denied",
          reason: originSecurity.reason || "Secure HTTPS origin required",
        };
      }

      // ALLOW path: require secure (HTTPS) origin, then invoke the manager's grant path
      if (rawSetting === "allow") {
        if (kind === "geolocation") {
          let granted = false;
          const promptRes = geolocationManagerRef.current.onGeolocationPermissionsShowPrompt(
            tabUrl,
            {
              invoke: (_origin, allow) => {
                granted = allow;
              },
            },
            req.tabId
          );
          if (promptRes.success && promptRes.requestId) {
            const dec = geolocationManagerRef.current.decidePermission(
              promptRes.requestId,
              true,
              false
            );
            granted = dec.allow;
          }
          // Clear transient grant so subsequent changes to siteOverrides take effect immediately
          geolocationManagerRef.current.onNavigation(req.tabId, "");
          return {
            allowed: granted,
            state: granted ? "granted" : "denied",
            reason: granted
              ? "Geolocation granted via manager allow path on secure HTTPS origin"
              : "Geolocation rejected by manager policy",
          };
        }

        if (kind === "notifications") {
          let resolvedPerm: "default" | "granted" | "denied" = "denied";
          const reqRes = notificationManagerRef.current.requestPermission(
            tabUrl,
            req.tabId,
            (perm) => {
              resolvedPerm = perm;
            }
          );
          if (reqRes.success && reqRes.requestId) {
            const dec = notificationManagerRef.current.decidePermission(
              reqRes.requestId,
              true,
              false
            );
            resolvedPerm = dec.permission;
          } else if (reqRes.permission) {
            resolvedPerm = reqRes.permission;
          }
          // Clear transient grant so subsequent changes to siteOverrides take effect immediately
          notificationManagerRef.current.onTabClosed(req.tabId);
          return {
            allowed: resolvedPerm === "granted",
            state: resolvedPerm === "granted" ? "granted" : "denied",
            reason:
              resolvedPerm === "granted"
                ? "Notifications granted via manager allow path on secure HTTPS origin"
                : "Notifications rejected by manager policy",
          };
        }

        // Camera or Microphone allow path via mediaPermissionManager
        const mediaMgr = getMediaPermissionManager(req.tabId);
        const resource =
          kind === "camera"
            ? AndroidMediaResource.VIDEO_CAPTURE
            : AndroidMediaResource.AUDIO_CAPTURE;
        const mediaReq = mediaMgr.requestPermissions(tabUrl, [resource]);
        const decision = mediaMgr.decidePermission(
          mediaReq.requestId,
          true,
          kind === "camera",
          kind === "microphone"
        );
        // Clear transient grant so subsequent changes to siteOverrides take effect immediately
        mediaMgr.onNavigation("");
        return {
          allowed: decision.granted,
          state: decision.granted ? "granted" : "denied",
          reason:
            decision.reason ||
            (decision.granted
              ? `Media (${kind}) granted via manager allow path on secure HTTPS origin`
              : `Media (${kind}) rejected by manager policy`),
        };
      }

      // ASK path:
      // For permissions.query (queryOnly === true), report current state ("granted" if retained in manager, else "prompt") without opening modal
      if (req.queryOnly) {
        if (kind === "geolocation") {
          const hasGrant = geolocationManagerRef.current.hasActiveGrant(req.tabId, tabUrl);
          return {
            allowed: hasGrant,
            state: hasGrant ? "granted" : "prompt",
            reason: hasGrant
              ? "Geolocation previously retained in active tab session"
              : "Geolocation requires interactive user consent (ask)",
          };
        }
        if (kind === "notifications") {
          const permState = notificationManagerRef.current.getPermissionState(tabUrl, req.tabId);
          return {
            allowed: permState === "granted",
            state: permState === "granted" ? "granted" : "prompt",
            reason:
              permState === "granted"
                ? "Notifications previously retained in active tab session"
                : "Notifications require interactive user consent (ask)",
          };
        }
        return {
          allowed: false,
          state: "prompt",
          reason: `Media (${kind}) requires interactive user consent (ask)`,
        };
      }

      // Interactive ASK path -> existing consent modal via the manager
      if (kind === "geolocation") {
        return new Promise<FramePermissionResult>((resolve) => {
          const res = geolocationManagerRef.current.onGeolocationPermissionsShowPrompt(
            tabUrl,
            {
              invoke: (_origin, allow) => {
                // Re-read live siteOverride when modal resolves
                const latestSetting = siteOverridesRef.current[domain]?.geolocation;
                const finalAllow = Boolean(
                  allow && (latestSetting === "ask" || latestSetting === "allow")
                );
                resolve({
                  allowed: finalAllow,
                  state: finalAllow ? "granted" : "denied",
                  reason: finalAllow
                    ? "User approved geolocation consent"
                    : "User denied geolocation consent",
                });
              },
            },
            req.tabId
          );
          if (!res.success && !res.requestId) {
            resolve({
              allowed: false,
              state: "denied",
              reason: res.reason || "Geolocation prompt rejected",
            });
          }
        });
      }

      if (kind === "notifications") {
        return new Promise<FramePermissionResult>((resolve) => {
          const res = notificationManagerRef.current.requestPermission(
            tabUrl,
            req.tabId,
            (perm) => {
              // Re-read live siteOverride when modal resolves
              const latestSetting = siteOverridesRef.current[domain]?.notifications;
              const isStillPermitted = latestSetting === "ask" || latestSetting === "allow";
              const finalAllowed = Boolean(perm === "granted" && isStillPermitted);
              const finalState = !isStillPermitted
                ? "denied"
                : perm === "granted"
                ? "granted"
                : perm === "default"
                ? "default"
                : "denied";
              resolve({
                allowed: finalAllowed,
                state: finalState,
                reason: finalAllowed
                  ? "User approved notification consent"
                  : "User denied or dismissed notification consent",
              });
            }
          );
          if (!res.success && !res.requestId && res.permission !== "granted") {
            resolve({
              allowed: false,
              state: "denied",
              reason: res.reason || "Notification prompt rejected",
            });
          }
        });
      }

      // Camera or Microphone interactive ASK path: mediaPermissionManager + dedicated CameraMicConsentModal
      const mediaMgr = getMediaPermissionManager(req.tabId);
      const resource =
        kind === "camera"
          ? AndroidMediaResource.VIDEO_CAPTURE
          : AndroidMediaResource.AUDIO_CAPTURE;
      const mediaReq = mediaMgr.requestPermissions(tabUrl, [resource]);

      const userGrantedMedia = await requestCameraMicModalConsent(
        mediaReq.requestId,
        req.tabId,
        tabUrl,
        [kind]
      );

      const latestMediaSetting = siteOverridesRef.current[domain]?.[kind];
      const approved = Boolean(
        userGrantedMedia.includes(kind) &&
          (latestMediaSetting === "ask" || latestMediaSetting === "allow")
      );
      const decision = approved
        ? mediaMgr.decidePermission(
            mediaReq.requestId,
            true,
            kind === "camera",
            kind === "microphone"
          )
        : mediaMgr.denyPermission(mediaReq.requestId, "User denied media consent");

      // Never persist an "ask" answer for media permissions
      mediaMgr.onNavigation("");

      return {
        allowed: decision.granted,
        state: decision.granted ? "granted" : "denied",
        reason:
          decision.reason ||
          (decision.granted ? "User approved media consent" : "User denied media consent"),
      };
    },
    [getMediaPermissionManager, requestCameraMicModalConsent]
  );

  // NATIVE-20: JavaScript Dialog Handlers
  const handleConfirmDialog = (dialogId: string, promptValue?: string, suppressFuture?: boolean) => {
    dialogManagerRef.current.confirmDialog(dialogId, promptValue, suppressFuture);
    setDialogPrompt(null);
  };

  const handleCancelDialog = (dialogId: string, suppressFuture?: boolean) => {
    dialogManagerRef.current.cancelDialog(dialogId, suppressFuture);
    setDialogPrompt(null);
  };

  // NATIVE-21: HTTP Auth & Client Certificate Handlers
  const handleSubmitHttpAuth = (challengeId: string, username: string, pass: string, save: boolean) => {
    httpAuthManagerRef.current.proceedHttpAuth(challengeId, username, pass, save);
    setHttpAuthPrompt(null);
  };

  const handleCancelHttpAuth = (challengeId: string) => {
    httpAuthManagerRef.current.cancelHttpAuth(challengeId);
    setHttpAuthPrompt(null);
  };

  const handleSubmitClientCert = (challengeId: string, certAlias: string) => {
    httpAuthManagerRef.current.proceedClientCert(challengeId, certAlias);
    setClientCertPrompt(null);
  };

  const handleCancelClientCert = (challengeId: string) => {
    httpAuthManagerRef.current.cancelClientCert(challengeId);
    setClientCertPrompt(null);
  };

  const handleIgnoreClientCert = (challengeId: string) => {
    httpAuthManagerRef.current.ignoreClientCert(challengeId);
    setClientCertPrompt(null);
  };

  // NATIVE-23: Display Media / Screen Capture Handlers
  const handleApproveDisplayMedia = (
    promptId: string,
    surface: import("./services/androidWebViewDisplayMediaBoundary").DisplayCaptureSurface,
    includeAudio: boolean
  ) => {
    displayMediaManagerRef.current.approveDisplayMedia(promptId, surface, includeAudio);
    setDisplayMediaPrompt(null);
  };

  const handleRejectDisplayMedia = (promptId: string) => {
    displayMediaManagerRef.current.rejectDisplayMedia(promptId);
    setDisplayMediaPrompt(null);
  };

  // NATIVE-24: Advanced Blob / Object-URL File Download Handlers
  const handleApproveBlobDownload = (downloadId: string) => {
    blobDownloadManagerRef.current.approveBlobDownload(downloadId);
    setBlobDownloadPrompt(null);
  };

  const handleRejectBlobDownload = (downloadId: string) => {
    blobDownloadManagerRef.current.rejectBlobDownload(downloadId);
    setBlobDownloadPrompt(null);
  };

  // NATIVE-25: Generated File Download Handlers
  const handleApproveGeneratedFileDownload = (downloadId: string) => {
    fileSystemManagerRef.current.approveGeneratedFileDownload(downloadId);
    setFileDownloadPrompt(null);
  };

  const handleRejectGeneratedFileDownload = (downloadId: string) => {
    fileSystemManagerRef.current.rejectGeneratedFileDownload(downloadId);
    setFileDownloadPrompt(null);
  };

  // NATIVE-26: Clipboard and Web Share Handlers
  const handleApproveClipboard = (promptId: string) => {
    clipboardAndShareManagerRef.current.approveClipboardPrompt(promptId);
    setClipboardPrompt(null);
  };

  const handleRejectClipboard = (promptId: string) => {
    clipboardAndShareManagerRef.current.rejectClipboardPrompt(promptId);
    setClipboardPrompt(null);
  };

  const handleApproveShare = (promptId: string) => {
    clipboardAndShareManagerRef.current.approveSharePrompt(promptId);
    setSharePrompt(null);
  };

  const handleRejectShare = (promptId: string) => {
    clipboardAndShareManagerRef.current.rejectSharePrompt(promptId);
    setSharePrompt(null);
  };

  // Google Sign-In & OAuth Safe External-Browser Fallback Handlers
  const handleApproveGoogleAuthFallback = useCallback((targetUrl: string, promptId: string) => {
    launchSafeExternalBrowser(targetUrl);
    setGoogleAuthPrompt((prev) => (prev?.id === promptId ? null : prev));
  }, []);

  const handleCancelGoogleAuthFallback = useCallback((promptId: string) => {
    setGoogleAuthPrompt((prev) => (prev?.id === promptId ? null : prev));
  }, []);

  const handleTriggerGoogleAuthFallback = useCallback((targetUrl: string, tabId: string) => {
    const promptId = `google-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setGoogleAuthPrompt({
      id: promptId,
      tabId,
      targetUrl,
      sourceDomain: getCleanDomain(targetUrl),
      serviceName: classifyGoogleAuthFlow(targetUrl).serviceName,
      reason:
        "Google Sign-In / OAuth requires interactive JavaScript and direct authentication session continuity. Opening in an external browser ensures secure login without proxy interference.",
      timestamp: Date.now(),
    });
  }, []);

  // Switch tab & wake up if sleeping
  const handleSelectTab = (id: string) => {
    setIsFindInPageOpen(false);
    setActiveTabId(id);
    // NATIVE-17: Resume persistent connections for awakened tab
    webSocketManagerRef.current.onHostResume(id);
    // NATIVE-18: Resume storage and Service Worker tasks for awakened tab
    storageManagerRef.current.onHostResume(id);
    // NATIVE-19: Transition awakened tab to active foreground in page lifecycle
    pageLifecycleManagerRef.current.setForegroundTab(id);
    // NATIVE-27: Set foreground tab for media autoplay and background policy
    backgroundMediaManagerRef.current.setForegroundTab(id);
    // NATIVE-28: Set active foreground tab for media session governance and audio arbitration
    mediaSessionGovernanceManagerRef.current.setActiveForegroundTab(id);
    // NATIVE-29: Set active foreground tab for media resource lifetime & memory accounting
    mediaResourceManagerRef.current.setActiveForegroundTab(id);
    // NATIVE-30: Resume rendering for awakened tab and pause background rendering
    renderingResilienceManagerRef.current.setForegroundTab(id);
    // FORM-N2: Switch active tab in Native Browser Engine
    const selectedTabObj = tabs.find((t) => t.id === id);
    nativeBrowserEngineRef.current?.selectTab(id, Boolean(selectedTabObj?.isPrivate));
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isSuspended: false } : t))
    );

    // Lazy load restored tab content on switch if not yet loaded (never auto-resubmit POST or re-trigger a failed uncommitted navigation)
    const targetTab = tabs.find((t) => t.id === id);
    if (
      targetTab &&
      targetTab.url &&
      isValidSafeUrl(targetTab.url) &&
      !targetTab.contentHtml &&
      !targetTab.isLoading &&
      !targetTab.error &&
      !targetTab.errorInfo
    ) {
      if (targetTab.lastMethod === "POST") {
        setPostRestorePromptTabId(targetTab.id);
      } else {
        handleNavigate(targetTab.url, targetTab.id, true, targetTab.historyIndex);
      }
    }
  };

  // Helper: detect if a tab is in a failed (uncommitted) navigation state where history[historyIndex] holds the last committed URL
  const isTabInFailedUncommittedNav = (tab?: BrowserTab | null): boolean => {
    if (!tab) return false;
    const committedUrl = tab.history[tab.historyIndex] ?? "";
    return (
      Boolean(tab.error || tab.errorInfo) &&
      (tab.url !== committedUrl || Boolean(tab.contentHtml))
    );
  };

  const canTabGoBack = Boolean(
    activeTab && (activeTab.historyIndex > 0 || isTabInFailedUncommittedNav(activeTab))
  );

  // Back & Forward with full stack preservation (NATIVE-40A Controller Integration)
  const handleGoBack = () => {
    if (!activeTab) return;
    const committedUrl = activeTab.history[activeTab.historyIndex] ?? "";
    const isFailedUncommitted = isTabInFailedUncommittedNav(activeTab);
    if (!isFailedUncommitted && activeTab.historyIndex <= 0) return;

    // Cancel any in-flight request via the existing epoch mechanism and reset retry cooldown / recovery state
    tabRequestEpochRef.current.set(
      activeTab.id,
      (tabRequestEpochRef.current.get(activeTab.id) || 0) + 1
    );
    const ctrl = inFlightControllersRef.current.get(activeTab.id);
    if (ctrl) {
      ctrl.abort();
      inFlightControllersRef.current.delete(activeTab.id);
    }
    errorRecoveryLifecycleManagerRef.current.onNavigation(activeTab.id, committedUrl);
    requestTimeoutManagerRef.current.onStopLoading(activeTab.id);
    setRecoveryResetEpoch((n) => n + 1);

    const navController = getOrCreateNavigationController(activeTab.id);

    // When the tab is in a failed (uncommitted) navigation state, Back returns to history[historyIndex] without decrementing
    if (isFailedUncommitted) {
      navController.syncHistoryState(activeTab.history, activeTab.historyIndex);
      if (!committedUrl) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  url: "",
                  title: t.isPrivate ? "Private Tab" : "New Tab",
                  contentHtml: undefined,
                  rawText: undefined,
                  error: undefined,
                  errorInfo: undefined,
                  isLoading: false,
                  historyIndex: activeTab.historyIndex,
                }
              : t
          )
        );
      } else if (activeTab.contentHtml) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  url: committedUrl,
                  error: undefined,
                  errorInfo: undefined,
                  isLoading: false,
                  historyIndex: activeTab.historyIndex,
                }
              : t
          )
        );
      } else {
        handleNavigate(committedUrl, activeTab.id, true, activeTab.historyIndex);
      }
      return;
    }

    navController.syncHistoryState(activeTab.history, activeTab.historyIndex);
    if (
      nativeBrowserEngineRef.current?.shouldUseNativeWebView(browsingMode, activeTab.isPrivate) &&
      activeTab.isNativeWebView &&
      Boolean(activeTab.history[activeTab.historyIndex - 1])
    ) {
      nativeBrowserEngineRef.current.goBack(activeTab.id);
    }
    const handled = navController.goBack();
    if (!handled) {
      const newIndex = activeTab.historyIndex - 1;
      const prevUrl = activeTab.history[newIndex];

      if (!prevUrl) {
        // Return to Start Page
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  url: "",
                  title: t.isPrivate ? "Private Tab" : "New Tab",
                  contentHtml: undefined,
                  rawText: undefined,
                  error: undefined,
                  errorInfo: undefined,
                  isLoading: false,
                  historyIndex: newIndex,
                }
              : t
          )
        );
      } else {
        handleNavigate(prevUrl, activeTab.id, true, newIndex);
      }
    }
  };

  const handleGoForward = () => {
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return;
    tabRequestEpochRef.current.set(
      activeTab.id,
      (tabRequestEpochRef.current.get(activeTab.id) || 0) + 1
    );
    const ctrl = inFlightControllersRef.current.get(activeTab.id);
    if (ctrl) {
      ctrl.abort();
      inFlightControllersRef.current.delete(activeTab.id);
    }
    const targetNextUrl = activeTab.history[activeTab.historyIndex + 1] ?? "";
    errorRecoveryLifecycleManagerRef.current.onNavigation(activeTab.id, targetNextUrl);
    requestTimeoutManagerRef.current.onStopLoading(activeTab.id);
    setRecoveryResetEpoch((n) => n + 1);

    if (
      nativeBrowserEngineRef.current?.shouldUseNativeWebView(browsingMode, activeTab.isPrivate) &&
      activeTab.isNativeWebView &&
      Boolean(targetNextUrl)
    ) {
      nativeBrowserEngineRef.current.goForward(activeTab.id);
    }

    const navController = getOrCreateNavigationController(activeTab.id);
    navController.syncHistoryState(activeTab.history, activeTab.historyIndex);
    const handled = navController.goForward();
    if (!handled) {
      const newIndex = activeTab.historyIndex + 1;
      const nextUrl = activeTab.history[newIndex];

      if (!nextUrl) {
        // Forward to Start Page
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  url: "",
                  title: t.isPrivate ? "Private Tab" : "New Tab",
                  contentHtml: undefined,
                  rawText: undefined,
                  error: undefined,
                  errorInfo: undefined,
                  isLoading: false,
                  historyIndex: newIndex,
                }
              : t
          )
        );
      } else {
        handleNavigate(nextUrl, activeTab.id, true, newIndex);
      }
    }
  };

  const handleReload = (overrideMode?: BrowsingMode) => {
    if (activeTab?.url) {
      // NATIVE-32: Track retry/recovery initiation
      errorRecoveryLifecycleManagerRef.current.initiateRecovery(
        activeTab.id,
        overrideMode === "text-only" ? "RETRY_TEXT_ONLY" : "RETRY_CURRENT"
      );
      // NATIVE-33: Initiate timeout retry recovery with progressive backoff and new epoch
      requestTimeoutManagerRef.current.initiateRecovery(
        activeTab.id,
        overrideMode === "text-only" ? "RETRY_TEXT_ONLY" : "RETRY_WITH_BACKOFF"
      );
      handleNavigate(
        activeTab.url,
        activeTab.id,
        true,
        activeTab.historyIndex,
        overrideMode
      );
    }
  };

  const handleDismissError = (tabId = activeTabId) => {
    // NATIVE-32: Record safe fallback action when dismissing error to keep existing content
    if (tabId) {
      errorRecoveryLifecycleManagerRef.current.initiateRecovery(tabId, "DISMISS_KEEP_CONTENT");
      // NATIVE-33: Record safe fallback action when dismissing error to keep existing content
      requestTimeoutManagerRef.current.initiateRecovery(tabId, "DISMISS_KEEP_CONTENT");
    }
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const priorUrl = t.history[t.historyIndex] || t.url;
        return {
          ...t,
          url: priorUrl,
          error: undefined,
          errorInfo: undefined,
          isLoading: false,
        };
      })
    );
  };

  const handleDismissTranslationError = (tabId = activeTabId) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId && t.translation
          ? {
              ...t,
              translation: {
                ...t.translation,
                error: undefined,
              },
            }
          : t
      )
    );
  };

  const handleGoHome = () => {
    if (!activeTab) return;
    // NATIVE-32: Record fallback to home and reset recovery state
    errorRecoveryLifecycleManagerRef.current.initiateRecovery(activeTab.id, "FALLBACK_HOME");
    errorRecoveryLifecycleManagerRef.current.onNavigation(activeTab.id, "");
    // NATIVE-33: Record fallback to home in timeout boundary and stop active timers
    requestTimeoutManagerRef.current.initiateRecovery(activeTab.id, "FALLBACK_HOME");
    requestTimeoutManagerRef.current.onStopLoading(activeTab.id);
    const ctrl = inFlightControllersRef.current.get(activeTab.id);
    if (ctrl) {
      ctrl.abort();
      inFlightControllersRef.current.delete(activeTab.id);
    }
    tabRequestEpochRef.current.set(activeTab.id, (tabRequestEpochRef.current.get(activeTab.id) || 0) + 1);
    setRecoveryResetEpoch((n) => n + 1);

    const committedAtCurrent = activeTab.history[activeTab.historyIndex] ?? "";
    const isCommittedHome = committedAtCurrent === "";
    const newHistory = isCommittedHome
      ? activeTab.history.slice(0, activeTab.historyIndex + 1)
      : [...activeTab.history.slice(0, activeTab.historyIndex + 1), ""];
    const newIndex = isCommittedHome
      ? activeTab.historyIndex
      : newHistory.length - 1;

    const navController = getOrCreateNavigationController(activeTab.id);
    navController.syncHistoryState(newHistory, newIndex);

    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? {
              ...t,
              url: "",
              title: t.isPrivate ? "Private Tab" : "New Tab",
              contentHtml: undefined,
              rawText: undefined,
              error: undefined,
              errorInfo: undefined,
              isLoading: false,
              history: newHistory,
              historyIndex: newIndex,
            }
          : t
      )
    );
  };

  // Toggle Reader Mode
  const handleToggleReaderMode = () => {
    const willBeReader = !activeTab.isReaderMode;
    const newMode: BrowsingMode = willBeReader ? "reader" : "smart-compress";
    setBrowsingMode(newMode);
    if (activeTab.url) {
      handleNavigate(
        activeTab.url,
        activeTab.id,
        true,
        activeTab.historyIndex,
        newMode
      );
    }
  };

  // One-Tap Full-Page Translation (Bengali ↔ English)
  const handleTranslatePage = useCallback(
    async (targetLangChoice?: "bn" | "en") => {
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab || !currentTab.contentHtml || currentTab.isLoading) return;

      const targetTabId = currentTab.id;
      const targetUrl = currentTab.url;
      const initialEpoch = tabRequestEpochRef.current.get(targetTabId) || 0;

      const rawSnippet = currentTab.rawText?.slice(0, 1000) || currentTab.title || "";
      const hasBengali = /[\u0980-\u09FF]/.test(rawSnippet);
      const targetLang: "bn" | "en" = targetLangChoice || (hasBengali ? "en" : "bn");

      // If already translated and cached for this target, instantly toggle back to it!
      if (
        currentTab.translation?.translatedHtml &&
        currentTab.translation.targetLang === targetLang
      ) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === targetTabId
              ? {
                  ...t,
                  translation: {
                    ...t.translation!,
                    isTranslated: true,
                    isTranslating: false,
                  },
                }
              : t
          )
        );
        return;
      }

      // Mark tab as translating
      setTabs((prev) =>
        prev.map((t) =>
          t.id === targetTabId
            ? {
                ...t,
                translation: {
                  ...(t.translation || {
                    originalHtml: t.contentHtml || "",
                    originalTitle: t.title,
                  }),
                  isTranslated: false,
                  isTranslating: true,
                  targetLang,
                  error: undefined,
                },
              }
            : t
        )
      );

      try {
        const res = await apiFetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html: currentTab.contentHtml,
            title: currentTab.title,
            targetLang,
            sourceLang: hasBengali ? "bn" : "en",
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Translation request failed");
        }

        // Verify that tab hasn't navigated or changed epoch while translation was in flight
        const currentEpoch = tabRequestEpochRef.current.get(targetTabId) || 0;
        if (currentEpoch !== initialEpoch) {
          return; // Tab navigated away; discard stale translation
        }

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== targetTabId || t.url !== targetUrl) return t;
            return {
              ...t,
              translation: {
                isTranslated: true,
                isTranslating: false,
                targetLang: data.targetLang || targetLang,
                originalHtml: t.translation?.originalHtml || t.contentHtml || "",
                originalTitle: t.translation?.originalTitle || t.title,
                translatedHtml: data.translatedHtml,
                translatedTitle: data.translatedTitle,
              },
            };
          })
        );
      } catch (err: any) {
        // Discard error if tab navigated away
        const currentEpoch = tabRequestEpochRef.current.get(targetTabId) || 0;
        if (currentEpoch !== initialEpoch) {
          return;
        }

        console.error("Translation error:", err);
        const defaultTranslationErrMsg =
          translations[lang]?.translationError ||
          "Could not complete translation. Please try again.";
        const rawErr = err?.message || "";
        const isTechnical =
          !rawErr ||
          rawErr.includes("Failed to fetch") ||
          rawErr.includes("Unexpected token") ||
          rawErr.includes("NetworkError");

        const displayErr = isTechnical ? defaultTranslationErrMsg : rawErr;

        setTabs((prev) =>
          prev.map((t) =>
            t.id === targetTabId && t.url === targetUrl
              ? {
                  ...t,
                  translation: {
                    ...(t.translation || {
                      originalHtml: t.contentHtml || "",
                      originalTitle: t.title,
                      targetLang,
                    }),
                    isTranslating: false,
                    isTranslated: false,
                    error: displayErr,
                  },
                }
              : t
          )
        );
      }
    },
    [activeTabId, tabs, lang]
  );

  // Instant toggle between original and translated page
  const handleToggleTranslation = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId || !t.translation) return t;
        return {
          ...t,
          translation: {
            ...t.translation,
            isTranslated: !t.translation.isTranslated,
          },
        };
      })
    );
  }, [activeTabId]);

  // URL normalization for duplicate-free bookmark checks
  const normalizeUrl = (u: string) =>
    u.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();

  const isCurrentPageBookmarked = useMemo(() => {
    if (!activeTab || !activeTab.url) return false;
    const normActive = normalizeUrl(activeTab.url);
    return bookmarks.some((b) => normalizeUrl(b.url) === normActive);
  }, [activeTab, bookmarks]);

  // Toggle bookmark for currently viewed page
  const handleToggleBookmark = useCallback(() => {
    if (!activeTab || !activeTab.url || !isValidSafeUrl(activeTab.url)) return;
    const safeUrl = sanitizeUrlForHistory(activeTab.url);
    const normActive = normalizeUrl(safeUrl);
    const existing = bookmarks.find((b) => normalizeUrl(b.url) === normActive);
    if (existing) {
      setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
    } else {
      const cleanTitle =
        activeTab.title && activeTab.title !== "New Tab"
          ? activeTab.title.trim().slice(0, 100)
          : getCleanDomain(safeUrl) || safeUrl;
      const newBookmark: Bookmark = {
        id: `bm-${Date.now()}`,
        title: cleanTitle,
        url: safeUrl,
        category: "knowledge",
        iconName: "Bookmark",
        isDefault: false,
      };
      setBookmarks((prev) => [newBookmark, ...prev]);
    }
  }, [activeTab, bookmarks]);

  // Remove individual bookmark
  const handleRemoveBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // Clear all bookmarks
  const handleClearBookmarks = useCallback(() => {
    setBookmarks([]);
  }, []);

  // Delete individual browsing history entry
  const handleDeleteHistoryEntry = useCallback(
    (id: string) => {
      const targetEntry = history.find((h) => h.id === id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (targetEntry?.url && sessionEngineRef.current) {
        const clearRes = sessionEngineRef.current.purgeAndResaveForClear(
          tabsRef.current,
          activeTabId,
          { type: "single_url", url: targetEntry.url },
          browsingMode
        );
        tabsRef.current = clearRes.tabs;
        setTabs(clearRes.tabs);
      }
    },
    [history, activeTabId, browsingMode]
  );

  // Clear all browsing history
  const handleClearHistory = useCallback(() => {
    setHistory([]);
    setRecentlyClosedTabs([]);
    try {
      localStorage.removeItem("netflow_history");
    } catch {}
    if (sessionEngineRef.current) {
      const clearRes = sessionEngineRef.current.purgeAndResaveForClear(
        tabsRef.current,
        activeTabId,
        { type: "all_time" },
        browsingMode
      );
      tabsRef.current = clearRes.tabs;
      setTabs(clearRes.tabs);
    }
  }, [activeTabId, browsingMode]);

  // Page Zoom / Text Scaling Controls (Range: 50% - 200%, per-tab isolated)
  const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

  const handleZoomIn = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        const current = t.zoomLevel || 100;
      const next = ZOOM_LEVELS.find((z) => z > current) ?? 200;
      const clamped = Math.min(200, next);
      nativeBrowserEngineRef.current?.setZoomLevel(t.id, clamped);
      return { ...t, zoomLevel: clamped };
      })
    );
  }, [activeTabId]);

  const handleZoomOut = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        const current = t.zoomLevel || 100;
        const next = [...ZOOM_LEVELS].reverse().find((z) => z < current) ?? 50;
        const clamped = Math.max(50, next);
        nativeBrowserEngineRef.current?.setZoomLevel(t.id, clamped);
        return { ...t, zoomLevel: clamped };
      })
    );
  }, [activeTabId]);

  const handleZoomReset = useCallback(() => {
    nativeBrowserEngineRef.current?.setZoomLevel(activeTabId, 100);
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, zoomLevel: 100 } : t))
    );
  }, [activeTabId]);

  zoomInRef.current = handleZoomIn;
  zoomOutRef.current = handleZoomOut;
  zoomResetRef.current = handleZoomReset;

  // Per-tab Site Mode Control (Default, Desktop Site, Mobile Site)
  const handleSetSiteMode = useCallback(
    (mode: SiteMode, targetTabId = activeTabId) => {
      nativeBrowserEngineRef.current?.setSiteMode(targetTabId, mode, false);
      setTabs((prev) =>
        prev.map((t) => (t.id === targetTabId ? { ...t, siteMode: mode } : t))
      );
      // Auto-reload the tab if it has an active URL so the new User-Agent takes effect
      const currentTab = tabs.find((t) => t.id === targetTabId);
      if (currentTab?.url && isValidSafeUrl(currentTab.url)) {
        setTimeout(() => {
          handleNavigate(currentTab.url, targetTabId, false, currentTab.historyIndex);
        }, 0);
      }
    },
    [activeTabId, tabs, handleNavigate]
  );

  // Save current page to Offline Capsule (private tabs do not persist capsules to shared storage)
  const handleSaveToOfflineCapsule = () => {
    if (!activeTab || !activeTab.url || !activeTab.contentHtml) return;
    const capsule = buildSafeOfflineCapsule({
      title: activeTab.title || activeTab.url,
      url: activeTab.url,
      contentHtml: activeTab.contentHtml,
      rawText: activeTab.rawText || "",
      isPrivateTab: activeTab.isPrivate,
    });
    if (!capsule) return;

    setOfflineCapsules((prev) => {
      const filtered = prev.filter((c) => c.url !== capsule.url);
      return [capsule, ...filtered];
    });
  };

  // Open Capsule (honest stats: savedBytes === byteSize, 0 network bytes transferred)
  const handleOpenCapsule = (cap: OfflineCapsule) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? {
              ...t,
              url: cap.url,
              title: `[Offline] ${cap.title}`,
              contentHtml: cap.contentHtml,
              rawText: cap.rawText,
              isLoading: false,
              error: undefined,
              errorInfo: undefined,
              stats: computeHonestPageStats({
                originalBytes: cap.byteSize,
                transferredBytes: 0,
                loadTimeMs: 12,
                trackersBlocked: 0,
                scriptsBlocked: 0,
                isHttps: cap.url.startsWith("https://"),
              }),
            }
          : t
      )
    );
  };

  // Tap-to-load single image in Text-Only / Light Mode without full page reload
  const handleLoadSingleImage = useCallback(
    (imgUrl: string, targetTabId = activeTabId) => {
      if (!imgUrl) return;
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== targetTabId) return t;
          const existing = t.unblockedImages || [];
          const nextUnblocked = existing.includes(imgUrl) ? existing : [...existing, imgUrl];
          let updatedHtml = t.contentHtml;
          if (updatedHtml) {
            const escapedUrl = imgUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const btnRegex = new RegExp(
              `<button[^>]*data-netflow-load-img=["']${escapedUrl}["'][^>]*>[\\s\\S]*?<\\/button>`,
              "gi"
            );
            const safeAttr = imgUrl.replace(/"/g, "&quot;");
            updatedHtml = updatedHtml.replace(
              btnRegex,
              `<img src="${safeAttr}" alt="Loaded image" loading="lazy" decoding="async" class="max-w-full h-auto rounded my-1" />`
            );
          }
          return {
            ...t,
            unblockedImages: nextUnblocked,
            contentHtml: updatedHtml,
          };
        })
      );
    },
    [activeTabId]
  );

  // FORM-B2 PART 2: Per-tab Light Mode toggle (persisted as boolean in sessionPersistence)
  const handleToggleTabLightMode = useCallback(
    (targetTabId = activeTabId) => {
      const targetTab = tabsRef.current.find((t) => t.id === targetTabId);
      const nextLightMode = !Boolean(targetTab?.lightMode);
      const policy = buildLightModePolicy({
        lightMode: nextLightMode,
        browsingMode: nextLightMode ? "smart-compress" : "full",
      });
      nativeBrowserEngineRef.current?.setLightMode(targetTabId, {
        lightMode: nextLightMode,
        ...policy,
      });
      nativeBrowserEngineRef.current?.setLightModePolicy(targetTabId, nextLightMode, policy);
      setTabs((prev) => {
        const nextTabs = prev.map((t) =>
          t.id === targetTabId
            ? {
                ...t,
                lightMode: nextLightMode,
                lightModePolicy: policy,
                tabBrowsingMode: (nextLightMode ? "smart-compress" : "full") as BrowsingMode,
              }
            : t
        );
        tabsRef.current = nextTabs;
        sessionEngineRef.current?.scheduleSave(nextTabs, activeTabId, browsingMode);
        return nextTabs;
      });
      showTransitionNotice(
        lang === "bn"
          ? nextLightMode
            ? "এই ট্যাবে লাইট মোড চালু করা হয়েছে (জাভাস্ক্রিপ্ট সচল)"
            : "এই ট্যাবে লাইট মোড বন্ধ করা হয়েছে"
          : nextLightMode
          ? "Light Mode enabled for this tab (JavaScript stays enabled)"
          : "Light Mode disabled for this tab",
        3000
      );
    },
    [activeTabId, lang, showTransitionNotice]
  );

  // FORM-B2 PART 3: Queue sanitized URL when offline (excludes private tabs, max 20)
  const handleQueueWhenOnline = useCallback(
    (rawUrl: string, targetTabId = activeTabId) => {
      const targetTab = tabsRef.current.find((t) => t.id === targetTabId);
      if (!targetTab || targetTab.isPrivate || !offlineQueueManagerRef.current) return;
      const res = offlineQueueManagerRef.current.enqueueWhenOnline(rawUrl, {
        id: targetTab.id,
        isPrivate: targetTab.isPrivate,
      });
      if (res.queued) {
        setPendingRequests(res.queue);
        showTransitionNotice(
          lang === "bn"
            ? "অনলাইনে এলে খোলার জন্য নিরাপদ URL কিউতে রাখা হয়েছে"
            : "Sanitized URL queued to open when online",
          3500
        );
      }
    },
    [activeTabId, lang, showTransitionNotice]
  );

  const inFlightSavePageRef = useRef<boolean>(false);

  // Chrome-like Save Page As...
  const handleSavePage = useCallback(() => {
    const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
    if (inFlightSavePageRef.current) {
      showTransitionNotice(
        lang === "bn"
          ? "পৃষ্ঠা সংরক্ষণ ইতিমধ্যেই প্রক্রিয়াধীন"
          : "Save page already in progress",
        2000
      );
      return;
    }
    if (!currentTab || (!currentTab.url && !currentTab.contentHtml)) {
      showTransitionNotice(
        lang === "bn" ? translations.bn.noPageToSave : translations.en.noPageToSave,
        2500
      );
      return;
    }

    inFlightSavePageRef.current = true;
    try {
      const rawTitle = currentTab.title || "";
      const cleanUrl = sanitizeUrlForHistory(currentTab.url || "");

      // Generate safe filename: remove path traversal, null bytes, dangerous characters
      let baseName = rawTitle.trim() && rawTitle !== "New Tab" ? rawTitle.trim() : "";
      if (!baseName && currentTab.url) {
        try {
          const u = new URL(currentTab.url);
          baseName = u.hostname + (u.pathname.length > 1 ? u.pathname.replace(/\//g, "-") : "");
        } catch {
          baseName = "webpage";
        }
      }
      if (!baseName) baseName = "webpage";

      baseName = baseName
        .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^[-_.]+|[-_.]+$/g, "")
        .slice(0, 50);
      if (!baseName) baseName = "webpage";
      const filename = `${baseName}.html`;

      // Redact sensitive inputs / passwords / secret tokens before saving
      let contentToSave = currentTab.contentHtml || currentTab.rawText || "";
      contentToSave = contentToSave
        .replace(/<input[^>]*type=["']password["'][^>]*>/gi, '<input type="password" value="" disabled placeholder="[PASSWORD REDACTED]">')
        .replace(/<input[^>]*name=["'](?:password|pass|token|secret|auth|apikey)["'][^>]*>/gi, '<input type="text" value="" disabled placeholder="[CREDENTIAL REDACTED]">');

      const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${rawTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>
  <!-- Saved with NETFLOW Browser V2 on ${new Date().toISOString()} -->
  <!-- Source URL: ${cleanUrl} -->
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1c1917; }
    img { max-width: 100%; height: auto; }
    header.saved-header { border-bottom: 1px solid #e7e5e4; padding-bottom: 1rem; margin-bottom: 1.5rem; font-size: 0.875rem; color: #78716c; }
    header.saved-header a { color: #059669; }
  </style>
</head>
<body>
  <header class="saved-header">
    <div><strong>Saved Page:</strong> ${rawTitle.replace(/</g, "&lt;")}</div>
    ${cleanUrl ? `<div><strong>Source:</strong> <a href="${cleanUrl}">${cleanUrl}</a></div>` : ""}
    <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
  </header>
  <main>
    ${contentToSave}
  </main>
</body>
</html>`;

      const blob = new Blob([htmlDocument], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 10000);

      showTransitionNotice(
        lang === "bn"
          ? `${translations.bn.pageSavedSuccess}: ${filename}`
          : `${translations.en.pageSavedSuccess}: ${filename}`,
        3000
      );
    } catch (err) {
      console.error("[NETFLOW] Failed to save page", err);
    } finally {
      setTimeout(() => {
        inFlightSavePageRef.current = false;
      }, 600);
    }
  }, [activeTabId, tabs, lang]);

  // Chrome-like Print Page
  const handlePrintPage = useCallback(() => {
    const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
    if (!currentTab || (!currentTab.url && !currentTab.contentHtml)) {
      showTransitionNotice(
        lang === "bn" ? translations.bn.noPageToPrint : translations.en.noPageToPrint,
        2500
      );
      return;
    }

    showTransitionNotice(
      lang === "bn" ? translations.bn.pagePrintNotice : translations.en.pagePrintNotice,
      1500
    );

    // 1. Try interactive iframe printing if active
    const activeFrame = document.querySelector<HTMLIFrameElement>("#interactive-chromium-frame");
    if (activeFrame && activeFrame.contentWindow) {
      try {
        activeFrame.contentWindow.focus();
        activeFrame.contentWindow.print();
        return;
      } catch {
        // Cross-origin restriction fallback
      }
    }

    // 2. Prepare clean, sanitized printable HTML for the current page
    const sanitizedTitle = (currentTab.title || "Document").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sanitizedUrl = sanitizeUrlForHistory(currentTab.url || "");
    const printDate = new Date().toLocaleString();

    let contentToPrint = currentTab.contentHtml || currentTab.rawText || "";
    contentToPrint = contentToPrint
      .replace(/<input[^>]*type=["']password["'][^>]*>/gi, '<span style="color:#888;font-style:italic;">[PASSWORD REDACTED]</span>')
      .replace(/<input[^>]*name=["'](?:password|pass|token|secret|auth|apikey)["'][^>]*>/gi, '<span style="color:#888;font-style:italic;">[CREDENTIAL REDACTED]</span>');

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.style.visibility = "hidden";
    printFrame.setAttribute("aria-hidden", "true");
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${sanitizedTitle}</title>
  <style>
    @page { margin: 1.5cm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .netflow-print-header {
      border-bottom: 1px solid #ccc;
      padding-bottom: 8px;
      margin-bottom: 16px;
      font-size: 9pt;
      color: #555;
      display: flex;
      justify-content: space-between;
    }
    .netflow-print-footer {
      border-top: 1px solid #eee;
      padding-top: 8px;
      margin-top: 24px;
      font-size: 8pt;
      color: #777;
      text-align: center;
    }
    img { max-width: 100%; height: auto; }
    a { color: #000; text-decoration: underline; }
    input[type="password"] { display: none !important; }
  </style>
</head>
<body>
  <div class="netflow-print-header">
    <strong>${sanitizedTitle}</strong>
    <span>${printDate}</span>
  </div>
  <div class="netflow-print-body">
    ${contentToPrint}
  </div>
  <div class="netflow-print-footer">
    ${sanitizedUrl ? `Source: ${sanitizedUrl} &bull; ` : ""}Printed via NETFLOW Browser V2
  </div>
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch (e) {
        window.print();
      } finally {
        setTimeout(() => {
          if (printFrame.parentNode) {
            printFrame.parentNode.removeChild(printFrame);
          }
        }, 5000);
      }
    }, 250);
  }, [activeTabId, tabs, lang]);

  // Global Ctrl+P & Ctrl+S Keyboard Shortcut Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (!isCmdOrCtrl) return;

      const activeEl = document.activeElement;
      const isEditing =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrintPage();
      } else if (e.key.toLowerCase() === "s" && !isEditing) {
        e.preventDefault();
        handleSavePage();
      } else if (e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        setIsClearDataModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrintPage, handleSavePage]);

  // Speed test
  const handleRunSpeedTest = async () => {
    setIsTestingSpeed(true);
    const start = Date.now();
    try {
      await apiFetch("/api/health");
      const rtt = Date.now() - start;
      setNetworkState((prev) => ({
        ...prev,
        rttMs: rtt,
      }));
    } catch {
      setNetworkState((prev) => ({ ...prev, rttMs: 999 }));
    } finally {
      setIsTestingSpeed(false);
    }
  };

  // Network override & medium switcher
  const handleSetNetworkType = (type: NetworkType, medium?: NetworkMedium) => {
    const prevMedium = networkState.medium;
    if (type === "auto") {
      setNetworkState((prev) => ({
        ...prev,
        type: "auto",
        medium: "wifi",
        isSimulated: false,
        isOnline: navigator.onLine,
        internetAvailable: navigator.onLine,
        isMetered: false,
      }));
      return;
    }

    const determinedMedium: NetworkMedium =
      medium ||
      (type === "offline"
        ? "offline"
        : type === "2g"
        ? "cellular_2g"
        : type === "3g"
        ? "cellular_3g"
        : type === "5g"
        ? "cellular_5g"
        : "wifi");

    const simulatedRtt =
      determinedMedium === "cellular_2g"
        ? 620
        : determinedMedium === "cellular_3g"
        ? 210
        : determinedMedium === "cellular_4g"
        ? 52
        : determinedMedium === "cellular_5g"
        ? 18
        : determinedMedium === "wifi"
        ? 22
        : 0;

    const isOnline = determinedMedium !== "offline";

    setNetworkState((prev) => ({
      ...prev,
      type,
      medium: determinedMedium,
      isSimulated: true,
      isOnline,
      internetAvailable: isOnline,
      isMetered: determinedMedium !== "wifi" && determinedMedium !== "offline",
      rttMs: simulatedRtt,
    }));

    // Record transition event
    if (prevMedium !== determinedMedium) {
      const newEvent: NetworkTransitionEvent = {
        id: `trans-${Date.now()}`,
        timestamp: Date.now(),
        fromMedium: prevMedium,
        toMedium: determinedMedium,
        reason: `Network profile switched to ${getMediumDisplayName(determinedMedium, lang)}`,
        preservedFormsCount: 1,
        recoveryActionTaken:
          determinedMedium === "offline"
            ? "Freezed active form drafts and deferred network requests"
            : determinedMedium === "cellular_2g"
            ? "Throttled background sync & switched to Text-First"
            : "Controlled recovery: Re-validated gateway & resumed queues",
      };
      setTransitions((prev) => [newEvent, ...prev.slice(0, 19)]);
      showTransitionNotice(
        `Switched to ${getMediumDisplayName(determinedMedium, lang)} • State Preserved`,
        4500
      );
    }

    // Auto switch mode to text-only if 2g and policy permits
    if (determinedMedium === "cellular_2g" && networkPolicy.autoAdaptTo2G) {
      setBrowsingMode("text-only");
    }
  };

  // State preservation & transition simulator
  const handleSimulateTransition = (
    from: NetworkMedium,
    to: NetworkMedium,
    reason: string
  ) => {
    // Preserve forms on active tab if enabled
    if (networkPolicy.preserveFormsOnTransition && activeTab) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                preservedForm: {
                  formId: `form-${t.id}`,
                  fieldValues: { url: t.url, searchDraft: t.url },
                  lastModified: Date.now(),
                  scrollPosition: 0,
                },
              }
            : t
        )
      );
    }

    const simulatedRtt =
      to === "cellular_2g"
        ? 620
        : to === "cellular_3g"
        ? 210
        : to === "cellular_4g"
        ? 52
        : to === "wifi"
        ? 18
        : 0;

    const isOnline = to !== "offline";

    setNetworkState((prev) => ({
      ...prev,
      medium: to,
      type:
        to === "cellular_2g"
          ? "2g"
          : to === "cellular_3g"
          ? "3g"
          : to === "cellular_5g"
          ? "5g"
          : to === "wifi"
          ? "4g"
          : to === "offline"
          ? "offline"
          : "4g",
      isOnline,
      internetAvailable: isOnline,
      isMetered: to !== "wifi" && to !== "offline",
      rttMs: simulatedRtt,
      isSimulated: true,
    }));

    const newEvent: NetworkTransitionEvent = {
      id: `trans-${Date.now()}`,
      timestamp: Date.now(),
      fromMedium: from,
      toMedium: to,
      reason,
      preservedFormsCount: 1,
      recoveryActionTaken:
        to === "offline"
          ? "Drafts frozen & network queue paused"
          : to === "cellular_2g"
          ? "Auto-adapted to Text-Only & throttled heavy preloads"
          : "Validated connection; queued requests processed smoothly",
    };

    setTransitions((prev) => [newEvent, ...prev.slice(0, 19)]);
    showTransitionNotice(
      `Transition: ${getMediumDisplayName(from, lang)} → ${getMediumDisplayName(to, lang)} • State Preserved`,
      5000
    );

    if (to === "cellular_2g" && networkPolicy.autoAdaptTo2G) {
      setBrowsingMode("text-only");
    }
  };

  // Controlled recovery on reconnection
  const handleControlledRecovery = () => {
    setNetworkState((prev) => ({
      ...prev,
      medium: "wifi",
      type: "4g",
      isOnline: true,
      internetAvailable: true,
      isMetered: false,
      rttMs: 24,
      isSimulated: true,
    }));

    const recoveryEvent: NetworkTransitionEvent = {
      id: `recovery-${Date.now()}`,
      timestamp: Date.now(),
      fromMedium: networkState.medium,
      toMedium: "wifi",
      reason: "Controlled recovery triggered after connection reinstatement",
      preservedFormsCount: 1,
      recoveryActionTaken:
        "Drained pending request queue with 80ms pacing; revalidated active tab with zero data loss",
    };

    setTransitions((prev) => [recoveryEvent, ...prev.slice(0, 19)]);
    showTransitionNotice(
      "Controlled Recovery complete: Active tab revalidated with zero data loss",
      5000
    );

    // If active tab was loading or error, gracefully reload
    if (activeTab?.url) {
      handleNavigate(activeTab.url, activeTab.id, true, activeTab.historyIndex);
    }
  };

  // Smart 4G Preference Handlers
  const handleSimulate4GDegradation = () => {
    if (activeTab) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                preservedForm: {
                  formId: `form-${t.id}`,
                  fieldValues: { url: t.url, searchDraft: t.url },
                  lastModified: Date.now(),
                  scrollPosition: 0,
                },
              }
            : t
        )
      );
    }

    setSmart4GState((prev) => ({
      ...prev,
      degradationStatus: "degraded_signal",
      sessionsPreservedCount: prev.sessionsPreservedCount + 1,
      unnecessaryReconnectsPrevented: prev.unnecessaryReconnectsPrevented + 1,
    }));

    const degradationEvent: NetworkTransitionEvent = {
      id: `smart4g-instability-${Date.now()}`,
      timestamp: Date.now(),
      fromMedium: networkState.medium,
      toMedium: networkState.medium,
      reason: "4G Temporary Signal Instability detected • Preserving session state",
      preservedFormsCount: 1,
      recoveryActionTaken:
        "Anti-Flapping throttled reconnect storm; active form drafts locked safely",
    };
    setTransitions((prev) => [degradationEvent, ...prev.slice(0, 19)]);

    showTransitionNotice(
      lang === "bn"
        ? "৪জি সিগন্যালে সাময়িক অস্থিরতা শনাক্ত: ব্রাউজিং সেশন ও ফর্ম ড্রাফট নিরাপদ সংরক্ষিত (Anti-Flapping সচল)"
        : "4G Signal Instability Detected: Browsing session & form draft preserved (Anti-Flapping active)",
      5000
    );
  };

  const handleSimulateVoiceCall = () => {
    setSmart4GState((prev) => {
      const nextCallActive = !prev.voiceCallActive;
      const voiceEvent: NetworkTransitionEvent = {
        id: `voice-call-${Date.now()}`,
        timestamp: Date.now(),
        fromMedium: networkState.medium,
        toMedium: nextCallActive ? "cellular_3g" : "cellular_4g",
        reason: nextCallActive
          ? "Carrier Voice Call Active (CSFB / VoLTE Handover)"
          : "Carrier Voice Call Ended • Returning to LTE Preference",
        preservedFormsCount: 1,
        recoveryActionTaken: nextCallActive
          ? "Deferring strictly to Android & carrier rules; background data throttled"
          : "Standard high-quality mobile data preference resumed",
      };
      setTransitions((all) => [voiceEvent, ...all.slice(0, 19)]);

      showTransitionNotice(
        nextCallActive
          ? (lang === "bn"
              ? "ভয়েস কল সক্রিয়: Android ও ক্যারিয়ারের নিয়ম অনুযায়ী ব্যাকগ্রাউন্ড ডেটা নিয়ন্ত্রিত (CSFB/VoLTE)"
              : "Voice Call Active: Network deferring to Android & carrier policy (background data throttled)")
          : (lang === "bn"
              ? "ভয়েস কল সম্পন্ন: উপলব্ধ উচ্চমানের ৪জি সংযোগের প্রতি স্বাভাবিক অগ্রাধিকার পুনর্বহাল"
              : "Voice Call Ended: Restored standard high-quality 4G connection preference"),
        5000
      );

      return {
        ...prev,
        voiceCallActive: nextCallActive,
      };
    });
  };

  const handleTrigger4GRecovery = () => {
    setNetworkState((prev) => ({
      ...prev,
      medium: "cellular_4g",
      type: "4g",
      isOnline: true,
      internetAvailable: true,
      isMetered: true,
      rttMs: 46,
      isSimulated: true,
    }));

    setSmart4GState((prev) => ({
      ...prev,
      degradationStatus: "optimal_4g",
      voiceCallActive: false,
      unnecessaryReconnectsPrevented: prev.unnecessaryReconnectsPrevented + 2,
    }));

    const recoveryEvent: NetworkTransitionEvent = {
      id: `recovery-4g-${Date.now()}`,
      timestamp: Date.now(),
      fromMedium: networkState.medium,
      toMedium: "cellular_4g",
      reason: "Controlled 4G Recovery: High-quality LTE/4G link restored without connection flapping",
      preservedFormsCount: 1,
      recoveryActionTaken:
        "Restored LTE preference; smoothly processed queued network requests without modem thrashing",
    };

    setTransitions((prev) => [recoveryEvent, ...prev.slice(0, 19)]);
    showTransitionNotice(
      lang === "bn"
        ? "৪জি নিয়ন্ত্রিত রিকভারি সম্পন্ন: উচ্চমানের সংযোগে মসৃণ প্রত্যাবর্তন ও সেশন ভ্যালিডেশন"
        : "4G Controlled Recovery Complete: Seamless link re-establishment & session validation",
      5000
    );
  };

  // CALL-SAFE ARCHITECTURE Handlers
  const handleSimulateCall = (type: "incoming" | "outgoing") => {
    clearCallTimers();
    const mediumBefore = networkState.medium;
    setCallSafeState((prev) => ({
      ...prev,
      currentPhase: type === "incoming" ? "incoming_call" : "outgoing_call",
      callerOrRecipient:
        type === "incoming"
          ? "+880 1712-345678 (Incoming Call)"
          : "+880 1912-987654 (Outgoing Call)",
      callStartTime: Date.now(),
      networkBeforeCall: mediumBefore,
    }));

    setSmart4GState((prev) => ({
      ...prev,
      voiceCallActive: true,
      sessionsPreservedCount: prev.sessionsPreservedCount + 1,
    }));

    const callTimer = setTimeout(() => {
      setCallSafeState((prev) => ({
        ...prev,
        currentPhase: "active_call",
      }));
    }, 700);
    callTimersRef.current.push(callTimer);

    const callEvent: NetworkTransitionEvent = {
      id: `call-start-${Date.now()}`,
      timestamp: Date.now(),
      fromMedium: networkState.medium,
      toMedium: networkState.medium === "cellular_4g" ? "cellular_3g" : networkState.medium,
      reason: `Call-Safe Trigger: ${
        type === "incoming" ? "Incoming" : "Outgoing"
      } voice call active. Handled normally by Android & cellular carrier.`,
      preservedFormsCount: 1,
      recoveryActionTaken:
        "Radio priority yielded to native voice telephony. Browsing session and draft states safely preserved.",
    };

    setTransitions((prev) => [callEvent, ...prev.slice(0, 19)]);
    showTransitionNotice(
      lang === "bn"
        ? "কল-সেফ সক্রিয়: স্বাভাবিক ভয়েস কল চলছে (রেডিও প্রায়োরিটি হ্যান্ডওভার • সেশন সুরক্ষিত)"
        : "Call-Safe Active: Voice call in progress (Radio priority yielded • Session preserved)",
      6000
    );
  };

  const handleEndCall = () => {
    clearCallTimers();
    setCallSafeState((prev) => ({
      ...prev,
      currentPhase: "rechecking_network",
    }));

    showTransitionNotice(
      lang === "bn"
        ? "কল শেষ: NETFLOW নেটওয়ার্ক স্টেট ও ল্যাটেন্সি পুনঃপরীক্ষা করছে..."
        : "Call Ended: NETFLOW rechecking network state & latency RTT...",
      5000
    );

    const resumeTimer = setTimeout(() => {
      setCallSafeState((prev) => ({
        ...prev,
        currentPhase: "resuming_browsing",
        networkAfterCall: prev.networkBeforeCall,
        callsHandledSuccessfully: prev.callsHandledSuccessfully + 1,
        sessionsSafelyResumed: prev.sessionsSafelyResumed + 1,
      }));

      setSmart4GState((prev) => ({
        ...prev,
        voiceCallActive: false,
      }));

      const idleTimer = setTimeout(() => {
        setCallSafeState((prev) => ({
          ...prev,
          currentPhase: "idle",
        }));
      }, 800);
      callTimersRef.current.push(idleTimer);

      const endEvent: NetworkTransitionEvent = {
        id: `call-end-${Date.now()}`,
        timestamp: Date.now(),
        fromMedium: "cellular_3g",
        toMedium: "cellular_4g",
        reason:
          "Call-Safe Recovery: Voice call ended. Network rechecked and data session resumed automatically.",
        preservedFormsCount: 1,
        recoveryActionTaken:
          "High-quality cellular link verified. Preserved form drafts and sockets resumed without page loss.",
      };

      setTransitions((prev) => [endEvent, ...prev.slice(0, 19)]);
      showTransitionNotice(
        lang === "bn"
          ? "কল-সেফ রিকভারি সম্পন্ন: স্বাভাবিক ব্রাউজিং সেশন অক্ষতভাবে রিজিউম করা হয়েছে।"
          : "Call-Safe Recovery Complete: Browsing session safely resumed without loss.",
        5000
      );
    }, 1000);
    callTimersRef.current.push(resumeTimer);
  };

  // Clear cache (legacy quick-clear via Privacy Shield)
  const handleClearCache = () => {
    setHistory([]);
    setOfflineCapsules([]);
    setSiteOverrides({});
    setRecentlyClosedTabs([]);
    setShowSessionRestoredBanner(false);
    offlineQueueManagerRef.current?.clearQueue();
    setPendingRequests([]);
    setShowQueueConfirmBanner(false);
    try {
      localStorage.removeItem("netflow_history");
      localStorage.removeItem("netflow_capsules");
      localStorage.removeItem("netflow_site_overrides");
      if (sessionEngineRef.current) {
        const clearRes = sessionEngineRef.current.purgeAndResaveForClear(
          tabsRef.current,
          activeTabId,
          { type: "all_time" },
          browsingMode
        );
        tabsRef.current = clearRes.tabs;
        setTabs(clearRes.tabs);
      }
    } catch {}
    // Clear in-memory server session cookies
    apiFetch("/api/cookies/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
    setTotalSavedBytes(0);
    setTotalTrackersBlocked(0);
  };

  // Granular Chrome-like Clear Browsing Data Handler
  const handleClearBrowsingData = useCallback(
    (options: ClearBrowsingDataOptions) => {
      const now = Date.now();
      let cutoffTimestamp = 0;
      if (options.timeRange === "last_hour") {
        cutoffTimestamp = now - 60 * 60 * 1000;
      } else if (options.timeRange === "last_24h") {
        cutoffTimestamp = now - 24 * 60 * 60 * 1000;
      } else if (options.timeRange === "last_7d") {
        cutoffTimestamp = now - 7 * 24 * 60 * 60 * 1000;
      }

      // 1. Clear History & Persisted V2 Session History (scoped by timeRange or all-time)
      if (options.history || options.cache || options.cookies) {
        offlineQueueManagerRef.current?.clearQueue();
        setPendingRequests([]);
        setShowQueueConfirmBanner(false);
      }
      if (options.history) {
        if (cutoffTimestamp === 0) {
          setHistory([]);
          setRecentlyClosedTabs([]);
          setShowSessionRestoredBanner(false);
          try {
            localStorage.removeItem("netflow_history");
          } catch {}
          if (sessionEngineRef.current) {
            const clearRes = sessionEngineRef.current.purgeAndResaveForClear(
              tabsRef.current,
              activeTabId,
              { type: "all_time" },
              browsingMode
            );
            tabsRef.current = clearRes.tabs;
            setTabs(clearRes.tabs);
          }
        } else {
          const clearedUrls = history
            .filter((h) => (h.timestamp || 0) >= cutoffTimestamp)
            .map((h) => h.url);
          const clearedSet = new Set(clearedUrls);
          const survivingUrls = history
            .filter((h) => (h.timestamp || 0) < cutoffTimestamp && !clearedSet.has(h.url))
            .map((h) => h.url);

          setHistory((prev) => prev.filter((h) => (h.timestamp || 0) < cutoffTimestamp));
          setRecentlyClosedTabs((prev) =>
            prev.filter((r) => (r.closedAt || 0) < cutoffTimestamp)
          );

          if (sessionEngineRef.current) {
            const clearRes = sessionEngineRef.current.purgeAndResaveForClear(
              tabsRef.current,
              activeTabId,
              {
                type: "time_range",
                cutoffTimestamp,
                clearedUrls,
                survivingUrls,
              },
              browsingMode
            );
            tabsRef.current = clearRes.tabs;
            setTabs(clearRes.tabs);
          }
        }
      }

      // 2. Clear Cached Data & Offline Capsules
      if (options.cache) {
        if (cutoffTimestamp === 0) {
          setOfflineCapsules([]);
          try {
            localStorage.removeItem("netflow_capsules");
          } catch {}
        } else {
          setOfflineCapsules((prev) => prev.filter((c) => (c.savedAt || 0) < cutoffTimestamp));
        }
        // Reset non-essential runtime performance caches
        setTotalSavedBytes(0);
        setTotalTrackersBlocked(0);
      }

      // 3. Clear Cookies and Active Server Session Data
      if (options.cookies || options.cache || options.history) {
        nativeBrowserEngineRef.current?.clearBrowsingData({
          clearCookies: Boolean(options.cookies),
          clearCache: Boolean(options.cache),
          clearStorage: Boolean(options.cookies || options.cache),
          clearHistory: Boolean(options.history),
        });
      }
      if (options.cookies) {
        apiFetch("/api/cookies/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
      }

      // 4. Clear Site Overrides & Domain Permissions
      if (options.siteOverrides) {
        tabsRef.current.forEach((t) => {
          geolocationManagerRef.current.onTabClosed(t.id);
          notificationManagerRef.current.onTabClosed(t.id);
          mediaPermissionManagersRef.current.get(t.id)?.onNavigation("");
        });
        if (cutoffTimestamp === 0) {
          siteOverridesRef.current = {};
          setSiteOverrides({});
          try {
            localStorage.removeItem("netflow_site_overrides");
          } catch {}
        } else {
          setSiteOverrides((prev) => {
            const next: Record<string, SitePrivacyOverride> = {};
            for (const [domain, override] of Object.entries(prev) as [
              string,
              SitePrivacyOverride,
            ][]) {
              if ((override.createdAt || 0) < cutoffTimestamp) {
                next[domain] = override;
              }
            }
            siteOverridesRef.current = next;
            return next;
          });
        }
      }

      showTransitionNotice(
        lang === "bn"
          ? translations.bn.dataClearedSuccess
          : translations.en.dataClearedSuccess,
        3000
      );
    },
    [lang, activeTabId, browsingMode, history]
  );

  // Per-site data clearing (Chrome-like site data control)
  const handleClearSingleSiteData = useCallback(
    (domain: string) => {
      if (!domain) return;
      const cleanDomain = domain.toLowerCase().replace(/^\./, "");

      // Clear server-side cookie jar entries matching this domain
      apiFetch("/api/cookies/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cleanDomain }),
      }).catch(() => {});

      // Clear history entries matching this domain
      setHistory((prev) => prev.filter((h) => !doesUrlMatchDomain(h.url, cleanDomain)));

      // Clear recently closed tabs matching this domain
      setRecentlyClosedTabs((prev) =>
        prev.filter(
          (r) =>
            !doesUrlMatchDomain(r.url, cleanDomain) &&
            !(r.history || []).some((h) => doesUrlMatchDomain(h, cleanDomain))
        )
      );

      // Clear offline capsules matching this domain
      setOfflineCapsules((prev) => prev.filter((c) => !doesUrlMatchDomain(c.url, cleanDomain)));

      // Remove site-specific permission overrides and revoke any cached tab grants for this domain
      tabsRef.current.forEach((t) => {
        if (t.url && doesUrlMatchDomain(t.url, cleanDomain)) {
          geolocationManagerRef.current.onTabClosed(t.id);
          notificationManagerRef.current.onTabClosed(t.id);
          mediaPermissionManagersRef.current.get(t.id)?.onNavigation("");
        }
      });
      setSiteOverrides((prev) => {
        const next = { ...prev };
        delete next[cleanDomain];
        siteOverridesRef.current = next;
        return next;
      });

      // Purge domain URLs from persisted V2 session (primary, backup, temp, legacy) and update open tabs
      if (sessionEngineRef.current) {
        const clearRes = sessionEngineRef.current.purgeAndResaveForClear(
          tabsRef.current,
          activeTabId,
          { type: "single_site", domain: cleanDomain },
          browsingMode
        );
        tabsRef.current = clearRes.tabs;
        setTabs(clearRes.tabs);
      }

      showTransitionNotice(
        lang === "bn"
          ? `${cleanDomain}: ${translations.bn.siteDataCleared}`
          : `${cleanDomain}: ${translations.en.siteDataCleared}`,
        3000
      );
    },
    [lang, activeTabId, browsingMode]
  );

  // Update or remove per-site privacy override
  const handleUpdateSiteOverride = useCallback(
    (domain: string, override: Partial<SitePrivacyOverride> | null) => {
      const cleanDomain = domain.toLowerCase().replace(/^\./, "");
      // Immediately clear any in-memory manager grants for tabs on this domain so changes take effect without stale decisions
      tabsRef.current.forEach((t) => {
        if (!t.url || getCleanDomain(t.url) === cleanDomain || getCleanDomain(t.url) === domain) {
          geolocationManagerRef.current.onTabClosed(t.id);
          notificationManagerRef.current.onTabClosed(t.id);
          mediaPermissionManagersRef.current.get(t.id)?.onNavigation("");
        }
      });
      setSiteOverrides((prev) => {
        const next = { ...prev };
        if (!override) {
          delete next[domain];
        } else {
          next[domain] = {
            domain,
            createdAt: Date.now(),
            ...(prev[domain] || {}),
            ...override,
          };
        }
        siteOverridesRef.current = next;
        return next;
      });
    },
    []
  );

  const isCurrentCapsuleSaved = useMemo(() => {
    if (!activeTab?.url) return false;
    return Boolean(findMatchingOfflineCapsule(activeTab.url, offlineCapsules));
  }, [activeTab?.url, offlineCapsules]);

  const activeTabResilience: TabResilienceState | null = useMemo(() => {
    void resilienceUiTick;
    return resilienceCoordinatorRef.current?.getTabState(activeTabId) || null;
  }, [activeTabId, resilienceUiTick]);

  const sleepingTabsCount = tabs.filter((t) => t.isSuspended).length;
  const isNativeWithUrl = Boolean(
    nativeBrowserEngineRef.current?.isNativeEngineAvailable() && activeTab?.url
  );

  return (
    <div
      id="netflow-app-root"
      className={`flex flex-col h-screen w-screen overflow-hidden ${
        isNativeWithUrl
          ? "bg-transparent text-stone-900 dark:text-white"
          : performanceConfig.darkAmoledMode
          ? "dark bg-black text-white"
          : "bg-stone-100 text-stone-900"
      }`}
    >
      {/* 1. Top Tab Bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onNewTab={handleNewTab}
        lang={lang}
      />

      {/* 2. Omnibox Navigation Header */}
      <BrowserHeader
        url={toYouTubeDisplayUrl(activeTab?.url || "")}
        canGoBack={canTabGoBack}
        canGoForward={
          activeTab?.historyIndex < (activeTab?.history.length || 1) - 1
        }
        isLoading={activeTab?.isLoading || false}
        browsingMode={browsingMode}
        networkState={networkState}
        activeStats={activeTab?.stats}
        totalSavedBytes={totalSavedBytes}
        lang={lang}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onGoHome={handleGoHome}
        onStopLoading={handleStopLoading}
        onToggleReaderMode={handleToggleReaderMode}
        isReaderModeActive={activeTab?.isReaderMode || false}
        isLightModeActive={Boolean(activeTab?.lightMode)}
        onToggleLightMode={() => handleToggleTabLightMode(activeTab?.id)}
        onOpenNetworkModal={handleOpenNetworkModal}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
        onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
        onOpenOfflineModal={() => setIsOfflineModalOpen(true)}
        onOpenHistoryModal={() => setIsHistoryModalOpen(true)}
        onOpenBookmarksModal={() => setIsBookmarksModalOpen(true)}
        isCurrentPageBookmarked={isCurrentPageBookmarked}
        onToggleBookmark={handleToggleBookmark}
        bookmarksCount={bookmarks.length}
        tabsCount={tabs.length}
        onOpenTabSwitcher={() => setIsTabSwitcherOpen(true)}
        onOpenFindInPage={() => setIsFindInPageOpen(true)}
        onOpenPromiseModal={handleOpenPromiseModal}
        onOpenReleaseNotes={() => setIsReleaseNotesOpen(true)}
        onToggleLanguage={() => setLang(lang === "bn" ? "en" : "bn")}
        onTranslatePage={() => handleTranslatePage()}
        isPageTranslated={activeTab?.translation?.isTranslated}
        isTranslating={activeTab?.translation?.isTranslating}
        transitionNotice={transitionNotice}
        onDismissTransitionNotice={handleDismissTransitionNotice}
        currentZoom={activeTab?.zoomLevel || 100}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        siteMode={activeTab?.siteMode || "default"}
        onSetSiteMode={handleSetSiteMode}
        onPrintPage={handlePrintPage}
        onSavePage={handleSavePage}
        onOpenClearData={() => setIsClearDataModalOpen(true)}
        siteOverride={
          activeTab?.url ? siteOverrides[getCleanDomain(activeTab.url)] : undefined
        }
        onOpenSiteSettings={() => setIsSiteSettingsModalOpen(true)}
        onOpenDownloadsModal={() => setIsDownloadsModalOpen(true)}
        downloadsCount={persistedDownloads.length}
        searchEngineId={searchEngineId}
        onSetSearchEngine={handleSetSearchEngine}
        errorInfo={activeTab?.errorInfo}
        onSharePage={handleMenuSharePage}
        onCopyLink={handleMenuCopyLink}
        onOpenExternalBrowser={handleMenuOpenExternalBrowser}
        isOutdatedWebView={Boolean(
          nativeCapabilities.isOutdatedWebView && !dismissedOutdatedWebView
        )}
        chromiumMajorVersion={nativeCapabilities.chromiumMajorVersion ?? null}
        onDismissOutdatedWebView={() => setDismissedOutdatedWebView(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Call-Safe Active Telephony Notification Banner */}
      {(callSafeState.currentPhase === "active_call" ||
        callSafeState.currentPhase === "incoming_call" ||
        callSafeState.currentPhase === "outgoing_call" ||
        callSafeState.currentPhase === "rechecking_network") && (
        <div
          id="call-safe-active-banner"
          className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white px-3 sm:px-4 py-2 text-xs flex items-center justify-between gap-2 border-b border-blue-500/40 shadow-sm z-20"
        >
          <div className="flex items-center gap-2 min-w-0">
            {callSafeState.currentPhase === "rechecking_network" ? (
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            )}
            <span className="font-bold truncate text-[11px] sm:text-xs">
              {callSafeState.currentPhase === "incoming_call"
                ? `📞 Incoming Call (${callSafeState.callerOrRecipient})`
                : callSafeState.currentPhase === "outgoing_call"
                ? `📱 Outgoing Call (${callSafeState.callerOrRecipient})`
                : callSafeState.currentPhase === "rechecking_network"
                ? "🔄 Call Ended: Rechecking network state & link quality..."
                : `📞 Voice Call Active (${callSafeState.callerOrRecipient})`}
            </span>
            <span className="hidden md:inline text-[10px] text-blue-200 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-400/30">
              Android + Carrier Telephony Priority • Session Protected
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenNetworkModal("callsafe")}
              className="px-2.5 py-1 rounded-md bg-blue-700 hover:bg-blue-600 text-white text-[10px] sm:text-[11px] font-semibold transition-colors cursor-pointer"
            >
              {lang === "bn" ? "কল-সেফ কনসোল" : "Call-Safe Console"}
            </button>
            {callSafeState.currentPhase !== "rechecking_network" && (
              <button
                type="button"
                onClick={handleEndCall}
                className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer"
              >
                {lang === "bn" ? "কল শেষ করুন" : "End Call"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Session Restored Dismissible Banner */}
      {showSessionRestoredBanner && (
        <div
          id="netflow-session-restored-banner"
          className="bg-emerald-950/90 text-emerald-100 px-3 sm:px-4 py-1.5 text-xs flex items-center justify-between gap-2 border-b border-emerald-700/50 z-20"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-medium truncate">
              {lang === "bn" ? "সেশন পুনরুদ্ধার করা হয়েছে (Session restored)" : "Session restored"}
            </span>
          </div>
          <button
            id="btn-dismiss-session-restored"
            type="button"
            onClick={() => setShowSessionRestoredBanner(false)}
            className="px-2 py-0.5 rounded bg-emerald-900 hover:bg-emerald-800 text-emerald-200 text-[11px] font-medium transition-colors cursor-pointer shrink-0"
          >
            {lang === "bn" ? "বন্ধ করুন" : "Dismiss"}
          </button>
        </div>
      )}

      {/* POST Tab Restore Confirmation Banner (Prevents Automatic Form Resubmission) */}
      {activeTab &&
        activeTab.url &&
        (postRestorePromptTabId === activeTab.id ||
          (activeTab.lastMethod === "POST" && !activeTab.contentHtml && !activeTab.isLoading)) && (
          <div
            id="netflow-post-restore-banner"
            className="bg-amber-950/95 text-amber-100 px-3 sm:px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/50 z-20"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="font-medium truncate">
                {lang === "bn"
                  ? "ফর্ম পুনরায় জমা দেওয়া রোধ করতে এই ট্যাবটি স্বয়ংক্রিয়ভাবে রিলোড করা হয়নি।"
                  : "Form submission tab was not reloaded automatically to prevent duplicate POST."}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="btn-post-restore-get"
                type="button"
                onClick={() => {
                  setPostRestorePromptTabId(null);
                  handleNavigate(
                    activeTab.url,
                    activeTab.id,
                    true,
                    activeTab.historyIndex,
                    undefined,
                    { method: "GET" }
                  );
                }}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors cursor-pointer"
              >
                {lang === "bn" ? "নতুন করে লোড (GET)" : "Load page fresh (GET)"}
              </button>
              <button
                id="btn-post-restore-back"
                type="button"
                onClick={() => {
                  setPostRestorePromptTabId(null);
                  if (activeTab.historyIndex > 0) {
                    handleGoBack();
                  } else {
                    handleGoHome();
                  }
                }}
                className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 text-[11px] font-medium transition-colors cursor-pointer"
              >
                {lang === "bn" ? "পেছনে যান" : "Go back"}
              </button>
            </div>
          </div>
        )}

      {/* FORM-B2: Non-Blocking Slow Connection / Subresource Overload Pill */}
      {activeTab &&
        (activeTabResilience?.stallWarningActive ||
          activeTabResilience?.suggestLightModeActive) && (
          <div
            id="netflow-resilience-slow-pill"
            role="status"
            aria-live="polite"
            className="bg-amber-950/95 text-amber-100 px-3 sm:px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/60 z-20"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="font-semibold truncate">
                {activeTabResilience?.suggestLightModeActive
                  ? translations[lang].resilience.subresourceSlowLabel
                  : translations[lang].resilience.slowConnectionLabel}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="btn-resilience-text-only"
                type="button"
                onClick={() => {
                  if (activeTab.url && !canUseProxyFallback(activeTab.url, activeTab)) {
                    showTransitionNotice(
                      lang === "bn"
                        ? PROXY_FALLBACK_BLOCKED_MESSAGE_BN
                        : PROXY_FALLBACK_BLOCKED_MESSAGE_EN,
                      5000
                    );
                    return;
                  }
                  resilienceCoordinatorRef.current?.dismissPill(activeTab.id);
                  setResilienceUiTick((n) => n + 1);
                  setBrowsingMode("text-only");
                  const policy = buildLightModePolicy({
                    lightMode: true,
                    browsingMode: "text-only",
                  });
                  nativeBrowserEngineRef.current?.setLightMode(activeTab.id, {
                    lightMode: true,
                    ...policy,
                  });
                  nativeBrowserEngineRef.current?.setLightModePolicy(activeTab.id, true, policy);
                  setTabs((prev) =>
                    prev.map((t) =>
                      t.id === activeTab.id
                        ? {
                            ...t,
                            lightMode: true,
                            lightModePolicy: policy,
                            tabBrowsingMode: "text-only",
                          }
                        : t
                    )
                  );
                  if (activeTab.url) {
                    handleNavigate(
                      activeTab.url,
                      activeTab.id,
                      true,
                      activeTab.historyIndex,
                      "text-only"
                    );
                  }
                }}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors cursor-pointer"
              >
                {translations[lang].resilience.btnTextOnly}
              </button>
              <button
                id="btn-resilience-light-mode"
                type="button"
                onClick={() => {
                  resilienceCoordinatorRef.current?.dismissPill(activeTab.id);
                  setResilienceUiTick((n) => n + 1);
                  setBrowsingMode("smart-compress");
                  const policy = buildLightModePolicy({
                    lightMode: true,
                    browsingMode: "smart-compress",
                  });
                  nativeBrowserEngineRef.current?.setLightMode(activeTab.id, {
                    lightMode: true,
                    ...policy,
                  });
                  nativeBrowserEngineRef.current?.setLightModePolicy(activeTab.id, true, policy);
                  setTabs((prev) =>
                    prev.map((t) =>
                      t.id === activeTab.id
                        ? {
                            ...t,
                            lightMode: true,
                            lightModePolicy: policy,
                            tabBrowsingMode: "smart-compress",
                          }
                        : t
                    )
                  );
                  if (activeTab.url) {
                    handleNavigate(
                      activeTab.url,
                      activeTab.id,
                      true,
                      activeTab.historyIndex,
                      "smart-compress"
                    );
                  }
                }}
                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition-colors cursor-pointer"
              >
                {translations[lang].resilience.btnLightMode}
              </button>
              <button
                id="btn-resilience-stop"
                type="button"
                onClick={() => {
                  resilienceCoordinatorRef.current?.dismissPill(activeTab.id);
                  setResilienceUiTick((n) => n + 1);
                  handleStopLoading(activeTab.id);
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 text-[11px] font-medium transition-colors cursor-pointer"
              >
                {translations[lang].resilience.btnStop}
              </button>
              <button
                id="btn-resilience-dismiss"
                type="button"
                onClick={() => {
                  resilienceCoordinatorRef.current?.dismissPill(activeTab.id);
                  setResilienceUiTick((n) => n + 1);
                }}
                className="px-1.5 py-0.5 rounded hover:bg-amber-900 text-amber-300 text-[11px] transition-colors cursor-pointer"
                title={translations[lang].resilience.btnDismiss}
              >
                ✕
              </button>
            </div>
          </div>
        )}

      {/* FORM-B2: Dismissible Partial Content Notice Banner */}
      {activeTab &&
        (activeTab.partialContentNotice || activeTabResilience?.partialContentNoticeActive) && (
          <div
            id="netflow-partial-content-banner"
            role="status"
            className="bg-stone-900 text-stone-200 px-3 sm:px-4 py-1.5 text-xs flex items-center justify-between gap-2 border-b border-stone-700 z-20"
          >
            <span className="truncate">
              {translations[lang].resilience.partialContentNotice}
            </span>
            <button
              id="btn-dismiss-partial-content"
              type="button"
              onClick={() => {
                resilienceCoordinatorRef.current?.dismissPartialContentNotice(activeTab.id);
                setResilienceUiTick((n) => n + 1);
                setTabs((prev) =>
                  prev.map((t) =>
                    t.id === activeTab.id ? { ...t, partialContentNotice: false } : t
                  )
                );
              }}
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] shrink-0 cursor-pointer"
            >
              {translations[lang].resilience.btnDismiss}
            </button>
          </div>
        )}

      {/* FORM-B2 & FORM-9 PART D: Validated Online Restored Indicator (shown ONLY after observed offline->online transition while loading or in error state) */}
      {activeTab && activeTabResilience?.connectionRestoredBannerActive && (
        <div
          id="netflow-online-restored-pill"
          role="status"
          className="bg-emerald-950/90 text-emerald-100 px-3 sm:px-4 py-1 text-xs flex items-center justify-between gap-2 border-b border-emerald-700/50 z-20"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-medium">
              {translations[lang].resilience.onlineRestoredIndicator}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              resilienceCoordinatorRef.current?.dismissOnlineIndicator(activeTab.id);
              setResilienceUiTick((n) => n + 1);
            }}
            className="text-emerald-300 hover:text-white text-[11px] px-1.5 py-0.5 cursor-pointer"
          >
            {translations[lang].resilience.btnDismiss}
          </button>
        </div>
      )}

      {/* FORM-B2 PART 3: Multiple Queued Pages Confirmation Banner on Validated Online */}
      {showQueueConfirmBanner && pendingRequests.length > 1 && (
        <div
          id="netflow-offline-queue-confirm-banner"
          role="status"
          className="bg-emerald-950/95 text-emerald-100 px-3 sm:px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-emerald-700/60 z-20"
        >
          <span className="font-medium truncate">
            {lang === "bn"
              ? `আপনি আবার অনলাইনে আছেন। কিউতে থাকা ${pendingRequests.length}টি পৃষ্ঠা কি এখন খুলতে চান?`
              : `You are back online. Open ${pendingRequests.length} queued pages now?`}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-confirm-open-queued"
              type="button"
              onClick={() => {
                const items = offlineQueueManagerRef.current?.confirmOpenAllQueued() || [];
                setPendingRequests([]);
                setShowQueueConfirmBanner(false);
                if (items.length > 0) {
                  handleNavigate(items[0].url, items[0].tabId || activeTabId);
                }
              }}
              className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
            >
              {lang === "bn" ? "সব খুলুন" : "Open queued"}
            </button>
            <button
              id="btn-dismiss-queued"
              type="button"
              onClick={() => {
                offlineQueueManagerRef.current?.dismissPendingConfirmation();
                setShowQueueConfirmBanner(false);
              }}
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] cursor-pointer"
            >
              {translations[lang].resilience.btnDismiss}
            </button>
          </div>
        </div>
      )}

      {/* FORM-B2: Honest Offline Banner + Saved Offline Capsules List */}
      {(!networkState.isOnline || networkState.medium === "offline") && activeTab?.url && (
        <div
          id="netflow-honest-offline-banner"
          role="alert"
          className="bg-sky-950/95 text-sky-100 px-3 sm:px-4 py-2 text-xs flex flex-col gap-1.5 border-b border-sky-700/60 z-20"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
              <span className="font-semibold truncate">
                {isCurrentCapsuleSaved
                  ? translations[lang].resilience.offlineSavedBanner
                  : translations[lang].resilience.offlineNotSavedBanner}
              </span>
            </div>
            {offlineCapsules.length > 0 && (
              <button
                type="button"
                onClick={() => setIsOfflineModalOpen(true)}
                className="px-2 py-0.5 rounded bg-sky-800 hover:bg-sky-700 text-white text-[11px] font-medium shrink-0 cursor-pointer"
              >
                {lang === "bn"
                  ? `সংরক্ষিত ক্যাপসুল (${offlineCapsules.length})`
                  : `Saved Capsules (${offlineCapsules.length})`}
              </button>
            )}
          </div>
          {offlineCapsules.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              <span className="text-[11px] text-sky-300 shrink-0">
                {translations[lang].resilience.savedOfflineCapsulesHeading}
              </span>
              {offlineCapsules.slice(0, 5).map((cap) => (
                <button
                  key={cap.id}
                  type="button"
                  onClick={() => handleOpenCapsule(cap)}
                  className="px-2 py-0.5 rounded bg-sky-900/90 hover:bg-sky-800 text-sky-100 border border-sky-700/70 text-[11px] truncate max-w-[180px] shrink-0 cursor-pointer"
                  title={cap.url}
                >
                  {cap.title || cap.url}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Main Browser Canvas */}
      <main id="netflow-viewport" className={`flex-1 flex flex-col min-h-0 relative ${isNativeWithUrl ? "bg-transparent" : ""}`}>
        {!activeTab?.url ? (
          <StartPage
            bookmarks={bookmarks}
            offlineCapsules={offlineCapsules}
            networkState={networkState}
            browsingMode={browsingMode}
            totalSavedBytes={totalSavedBytes}
            lang={lang}
            onNavigate={handleNavigate}
            onSetBrowsingMode={setBrowsingMode}
            onOpenCapsule={handleOpenCapsule}
            onOpenNetworkModal={handleOpenNetworkModal}
            onOpenAiModal={() => setIsAiModalOpen(true)}
            onOpenPromiseModal={handleOpenPromiseModal}
            onOpenBookmarksModal={() => setIsBookmarksModalOpen(true)}
            onOpenReleaseNotes={() => setIsReleaseNotesOpen(true)}
          />
        ) : (
          <WebRenderer
            key={`${activeTab.id}-${recoveryResetEpoch}`}
            tab={activeTab}
            browsingMode={browsingMode}
            lang={lang}
            onNavigate={handleNavigate}
            onRetry={handleReload}
            onSetBrowsingMode={setBrowsingMode}
            onToggleReaderMode={handleToggleReaderMode}
            onOpenAiModal={() => setIsAiModalOpen(true)}
            onSaveToOfflineCapsule={handleSaveToOfflineCapsule}
            isCapsuleSaved={isCurrentCapsuleSaved}
            onExplainPhrase={() => setIsAiModalOpen(true)}
            onGoHome={handleGoHome}
            onCancelLoading={handleStopLoading}
            onGoBack={handleGoBack}
            canGoBack={canTabGoBack}
            onDismissError={() => handleDismissError(activeTab.id)}
            onDismissTranslationError={() => handleDismissTranslationError(activeTab.id)}
            isFindInPageOpen={isFindInPageOpen}
            onOpenFindInPage={() => setIsFindInPageOpen(true)}
            onCloseFindInPage={() => setIsFindInPageOpen(false)}
            onTranslatePage={handleTranslatePage}
            onToggleTranslation={handleToggleTranslation}
            onOpenNewTab={handleOpenPopupTab}
            onDownloadStart={handleInitiateDownload}
            onGoogleAuthFallback={handleTriggerGoogleAuthFallback}
            onZoomReset={handleZoomReset}
            siteMode={activeTab?.siteMode || "default"}
            onSetSiteMode={handleSetSiteMode}
            siteOverride={
              activeTab?.url ? siteOverrides[getCleanDomain(activeTab.url)] : undefined
            }
            onRequestPermission={handleRequestSitePermission}
            onOpenOfflineCapsule={() => {
              const targetUrl = activeTab?.url || activeTab?.errorInfo?.failedUrl;
              const cap = findMatchingOfflineCapsule(targetUrl, offlineCapsules);
              if (cap) handleOpenCapsule(cap);
            }}
            isOfflineCapsuleAvailable={Boolean(
              findMatchingOfflineCapsule(activeTab?.url, offlineCapsules) ||
                (activeTab?.errorInfo &&
                  findMatchingOfflineCapsule(activeTab.errorInfo.failedUrl, offlineCapsules))
            )}
            offlineCapsules={offlineCapsules}
            onOpenSpecificCapsule={(capsuleId) => {
              const cap = offlineCapsules.find((c) => c.id === capsuleId);
              if (cap) handleOpenCapsule(cap);
            }}
            onLoadSingleImage={(imgUrl) => handleLoadSingleImage(imgUrl, activeTab.id)}
            onQueueWhenOnline={(url) => handleQueueWhenOnline(url, activeTab.id)}
            isUrlQueuedForOnline={pendingRequests.some(
              (req) => req.tabId === activeTab.id && req.url === activeTab.url
            )}
            onToggleLightMode={() => handleToggleTabLightMode(activeTab.id)}
            networkState={networkState}
            isNativeAndroidEngineAvailable={nativeBrowserEngineRef.current?.isNativeEngineAvailable()}
            privateIsolationSupported={nativeCapabilities.privateIsolation}
            onSyncNativeViewportBounds={(bounds: NativeViewportBounds) => {
              const anyModalOpen = Boolean(
                isAiModalOpen ||
                  isNetworkModalOpen ||
                  isPrivacyModalOpen ||
                  isDeviceModalOpen ||
                  isOfflineModalOpen ||
                  isHistoryModalOpen ||
                  isClearDataModalOpen ||
                  isBookmarksModalOpen ||
                  isPromiseModalOpen ||
                  isReleaseNotesOpen ||
                  isTabSwitcherOpen ||
                  isSiteSettingsModalOpen ||
                  isDownloadsModalOpen ||
                  downloadPrompt ||
                  geolocationPrompt ||
                  notificationPrompt ||
                  cameraMicPrompt ||
                  dialogPrompt ||
                  httpAuthPrompt ||
                  nativeHttpAuthPrompt ||
                  clientCertPrompt ||
                  displayMediaPrompt ||
                  blobDownloadPrompt ||
                  fileDownloadPrompt ||
                  clipboardPrompt ||
                  sharePrompt ||
                  googleAuthPrompt
              );
              nativeBrowserEngineRef.current?.syncViewportBounds({
                ...bounds,
                visible: Boolean(bounds.visible && !anyModalOpen && activeTab?.url),
              });
            }}
            onNativeFindInPage={(tId, q) => nativeBrowserEngineRef.current?.findInPage(tId, q)}
            onNativeFindNext={(tId, forward) => nativeBrowserEngineRef.current?.findNext(tId, forward)}
            onNativeClearFind={(tId) => nativeBrowserEngineRef.current?.clearFindMatches(tId)}
            nativeFindResult={activeTab ? nativeFindResults[activeTab.id] : undefined}
          />
        )}
      </main>

      {/* 4. Mobile Thumb-Zone Bottom Navigation Bar (< md viewports) */}
      <MobileBottomBar
        canGoBack={canTabGoBack}
        canGoForward={
          activeTab
            ? activeTab.historyIndex < activeTab.history.length - 1
            : false
        }
        tabsCount={tabs.length}
        lang={lang}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onGoHome={handleGoHome}
        onOpenTabSwitcher={() => setIsTabSwitcherOpen(true)}
        onOpenBookmarksModal={() => setIsBookmarksModalOpen(true)}
        onOpenHistoryModal={() => setIsHistoryModalOpen(true)}
        onOpenNetworkModal={handleOpenNetworkModal}
        onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
        onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
        onOpenOfflineModal={() => setIsOfflineModalOpen(true)}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onOpenFindInPage={() => setIsFindInPageOpen(true)}
        onOpenPromiseModal={handleOpenPromiseModal}
        onOpenReleaseNotes={() => setIsReleaseNotesOpen(true)}
        onToggleLanguage={() => setLang(lang === "bn" ? "en" : "bn")}
        onTranslatePage={() => handleTranslatePage()}
        isPageTranslated={activeTab?.translation?.isTranslated}
        currentZoom={activeTab?.zoomLevel || 100}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        siteMode={activeTab?.siteMode || "default"}
        onSetSiteMode={handleSetSiteMode}
        onPrintPage={handlePrintPage}
        onSavePage={handleSavePage}
        onOpenClearData={() => setIsClearDataModalOpen(true)}
        onOpenSiteSettings={() => setIsSiteSettingsModalOpen(true)}
        onOpenDownloadsModal={() => setIsDownloadsModalOpen(true)}
        downloadsCount={persistedDownloads.length}
      />

      {/* 5. Modals & Drawers */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        activeTab={activeTab}
        networkState={networkState}
        lang={lang}
        onTranslatePage={handleTranslatePage}
        onToggleTranslation={handleToggleTranslation}
      />

      <NetworkManagerModal
        isOpen={isNetworkModalOpen}
        onClose={() => setIsNetworkModalOpen(false)}
        networkState={networkState}
        browsingMode={browsingMode}
        totalSavedBytes={totalSavedBytes}
        lang={lang}
        onSetBrowsingMode={setBrowsingMode}
        onSetNetworkType={handleSetNetworkType}
        onRunSpeedTest={handleRunSpeedTest}
        isTestingSpeed={isTestingSpeed}
        transitions={transitions}
        onSimulateTransition={handleSimulateTransition}
        onControlledRecovery={handleControlledRecovery}
        pendingRequests={pendingRequests}
        policy={networkPolicy}
        onUpdatePolicy={(partial) =>
          setNetworkPolicy((prev) => ({ ...prev, ...partial }))
        }
        onOpenPromiseModal={() => handleOpenPromiseModal("values")}
        initialTab={networkModalTab}
        smart4GState={smart4GState}
        onSimulate4GDegradation={handleSimulate4GDegradation}
        onSimulateVoiceCall={handleSimulateVoiceCall}
        onTrigger4GRecovery={handleTrigger4GRecovery}
        onToggleAntiFlapping={() =>
          setNetworkPolicy((prev) => ({
            ...prev,
            antiFlappingProtection: !prev.antiFlappingProtection,
          }))
        }
        callSafeState={callSafeState}
        onSimulateCall={handleSimulateCall}
        onEndCall={handleEndCall}
      />

      <PrivacyShieldModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
        privacyConfig={privacyConfig}
        onUpdateConfig={(partial) =>
          setPrivacyConfig((prev) => ({ ...prev, ...partial }))
        }
        onClearCache={handleClearCache}
        totalTrackersBlocked={totalTrackersBlocked}
        totalSavedBytes={totalSavedBytes}
        lang={lang}
        currentUrl={activeTab?.url || ""}
        siteOverride={
          activeTab?.url ? siteOverrides[getCleanDomain(activeTab.url)] : undefined
        }
        onUpdateSiteOverride={handleUpdateSiteOverride}
        onOpenClearData={() => setIsClearDataModalOpen(true)}
        onOpenSiteSettings={() => setIsSiteSettingsModalOpen(true)}
        searchEngineId={searchEngineId}
        onSetSearchEngine={handleSetSearchEngine}
      />

      <SiteSettingsModal
        isOpen={isSiteSettingsModalOpen}
        onClose={() => setIsSiteSettingsModalOpen(false)}
        domain={activeTab?.url ? getCleanDomain(activeTab.url) : ""}
        url={activeTab?.url || ""}
        siteOverride={
          activeTab?.url ? siteOverrides[getCleanDomain(activeTab.url)] : undefined
        }
        onUpdateSiteOverride={handleUpdateSiteOverride}
        onClearSiteData={handleClearSingleSiteData}
        lang={lang}
      />

      <DeviceOptimizerModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        config={performanceConfig}
        onUpdateConfig={(partial) =>
          setPerformanceConfig((prev) => ({ ...prev, ...partial }))
        }
        sleepingTabsCount={sleepingTabsCount}
        totalTabsCount={tabs.length}
        lang={lang}
      />

      <OfflineCapsulesModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
        capsules={offlineCapsules}
        onOpenCapsule={handleOpenCapsule}
        onDeleteCapsule={(id) =>
          setOfflineCapsules((prev) => prev.filter((c) => c.id !== id))
        }
        onClearAllCapsules={() => setOfflineCapsules([])}
        lang={lang}
      />

      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        history={history}
        onNavigate={handleNavigate}
        onDeleteEntry={handleDeleteHistoryEntry}
        onClearHistory={handleClearHistory}
        onOpenClearData={() => setIsClearDataModalOpen(true)}
        lang={lang}
      />

      <DownloadsModal
        isOpen={isDownloadsModalOpen}
        onClose={() => setIsDownloadsModalOpen(false)}
        downloads={persistedDownloads}
        onRemoveDownload={handleRemoveDownload}
        onClearAllDownloads={handleClearAllDownloads}
        onRedownload={(url, filename) => handleInitiateDownload(url, filename)}
        onOpenFile={(url, downloadId) => {
          if (
            downloadId &&
            (nativeBrowserEngineRef.current?.isNativeEngineAvailable() || /^\d+$/.test(downloadId))
          ) {
            nativeBrowserEngineRef.current?.openDownload({ downloadId });
            return;
          }
          if (url && isValidSafeUrl(url)) {
            handleNavigate(url);
          }
        }}
        lang={lang}
      />

      <ClearBrowsingDataModal
        isOpen={isClearDataModalOpen}
        onClose={() => setIsClearDataModalOpen(false)}
        onConfirmClear={handleClearBrowsingData}
        historyCount={history.length}
        capsulesCount={offlineCapsules.length}
        cookiesCount={activeTab?.stats?.cookiesDetected ?? 0}
        overridesCount={Object.keys(siteOverrides).length}
        currentDomain={activeTab?.url ? getCleanDomain(activeTab.url) : undefined}
        onClearSiteData={handleClearSingleSiteData}
        lang={lang}
      />

      <BookmarksModal
        isOpen={isBookmarksModalOpen}
        onClose={() => setIsBookmarksModalOpen(false)}
        bookmarks={bookmarks}
        onNavigate={handleNavigate}
        onRemoveBookmark={handleRemoveBookmark}
        onClearBookmarks={handleClearBookmarks}
        lang={lang}
      />

      <NetflowPromiseModal
        isOpen={isPromiseModalOpen}
        onClose={() => setIsPromiseModalOpen(false)}
        lang={lang}
        initialTab={promiseModalTab}
      />

      <TabSwitcherModal
        isOpen={isTabSwitcherOpen}
        onClose={() => setIsTabSwitcherOpen(false)}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          handleSelectTab(id);
          setIsTabSwitcherOpen(false);
        }}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onNewTab={(isPrivate) => {
          handleNewTab(isPrivate);
          setIsTabSwitcherOpen(false);
        }}
        onRestoreClosedTab={handleRestoreClosedTab}
        recentlyClosedCount={recentlyClosedTabs.length}
        lang={lang}
      />

      <ReleaseNotesModal
        isOpen={isReleaseNotesOpen}
        onClose={() => setIsReleaseNotesOpen(false)}
        lang={lang}
      />

      <DownloadConsentModal
        isOpen={Boolean(downloadPrompt)}
        prompt={downloadPrompt}
        onApprove={handleApproveDownload}
        onReject={handleRejectDownload}
        lang={lang}
      />

      <GeolocationConsentModal
        isOpen={Boolean(geolocationPrompt)}
        prompt={geolocationPrompt}
        onApprove={handleApproveGeolocation}
        onReject={handleRejectGeolocation}
        lang={lang}
      />

      <NotificationConsentModal
        isOpen={Boolean(notificationPrompt)}
        prompt={notificationPrompt}
        onApprove={handleApproveNotification}
        onDeny={handleDenyNotification}
        onDismiss={handleDismissNotification}
        lang={lang}
      />

      <CameraMicConsentModal
        isOpen={Boolean(cameraMicPrompt)}
        prompt={cameraMicPrompt}
        onApprove={handleApproveCameraMicModal}
        onDeny={handleDenyCameraMicModal}
        lang={lang}
      />

      <JavaScriptDialogModal
        isOpen={Boolean(dialogPrompt)}
        prompt={dialogPrompt}
        onConfirm={handleConfirmDialog}
        onCancel={handleCancelDialog}
        lang={lang}
      />

      <HttpAuthModal
        isOpen={Boolean(nativeHttpAuthPrompt)}
        prompt={nativeHttpAuthPrompt}
        onSubmit={handleSubmitNativeHttpAuthModal}
        onCancel={handleCancelNativeHttpAuthModal}
        lang={lang}
      />

      <HttpAuthConsentModal
        isOpen={Boolean(httpAuthPrompt || clientCertPrompt)}
        httpAuthPrompt={httpAuthPrompt}
        clientCertPrompt={clientCertPrompt}
        onSubmitHttpAuth={handleSubmitHttpAuth}
        onCancelHttpAuth={handleCancelHttpAuth}
        onSubmitClientCert={handleSubmitClientCert}
        onCancelClientCert={handleCancelClientCert}
        onIgnoreClientCert={handleIgnoreClientCert}
        lang={lang}
      />

      <DisplayMediaConsentModal
        isOpen={Boolean(displayMediaPrompt)}
        prompt={displayMediaPrompt}
        onApprove={handleApproveDisplayMedia}
        onReject={handleRejectDisplayMedia}
        lang={lang}
      />

      <BlobDownloadConsentModal
        isOpen={Boolean(blobDownloadPrompt)}
        prompt={blobDownloadPrompt}
        onApprove={handleApproveBlobDownload}
        onReject={handleRejectBlobDownload}
        lang={lang}
      />

      <GeneratedFileDownloadModal
        isOpen={Boolean(fileDownloadPrompt)}
        prompt={fileDownloadPrompt}
        onApprove={handleApproveGeneratedFileDownload}
        onReject={handleRejectGeneratedFileDownload}
        lang={lang}
      />

      <ClipboardAndShareConsentModal
        clipboardPrompt={clipboardPrompt}
        sharePrompt={sharePrompt}
        onApproveClipboard={handleApproveClipboard}
        onRejectClipboard={handleRejectClipboard}
        onApproveShare={handleApproveShare}
        onRejectShare={handleRejectShare}
        lang={lang}
      />

      <GoogleAuthFallbackModal
        isOpen={Boolean(googleAuthPrompt)}
        prompt={googleAuthPrompt}
        onApprove={handleApproveGoogleAuthFallback}
        onCancel={handleCancelGoogleAuthFallback}
        lang={lang}
      />

      <ContextMenuModal
        isOpen={Boolean(contextMenuPrompt)}
        prompt={contextMenuPrompt}
        isPrivate={Boolean(
          contextMenuPrompt?.isPrivate ||
            tabs.find((t) => t.id === contextMenuPrompt?.tabId)?.isPrivate
        )}
        lang={lang}
        onOpenInNewTab={handleContextMenuOpenInNewTab}
        onOpenInPrivateTab={handleContextMenuOpenInPrivateTab}
        onCopyLink={handleContextMenuCopyLink}
        onShareLink={handleContextMenuShareLink}
        onDownloadImage={handleContextMenuDownloadImage}
        onCancel={() => setContextMenuPrompt(null)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        lang={lang}
      />
    </div>
  );
}
