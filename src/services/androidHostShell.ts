/**
 * NETFLOW Browser V2 — Native Android Host & Shell Foundation
 *
 * Form: NETFLOW-V2-NATIVE-04
 *
 * This module defines the architecture contract and runtime boundary for the
 * Native Android Host Activity / Shell that embeds the Chromium WebView and
 * orchestrates tabs, intent routing, lifecycle events, and security safeguards.
 *
 * Architecture Principles:
 * 1. Host Boundary: Formal contract for Android Activity/Host lifecycle (onCreate, onResume, onPause, onBackPressed, onNewIntent).
 * 2. NATIVE-01 Reuse: Reuses DEFAULT_ANDROID_WEBVIEW_SETTINGS and detectAndroidWebViewEnvironment.
 * 3. NATIVE-02 Reuse: Reuses createAndroidWebViewLifecycleAdapter for standard Chromium WebView callbacks.
 * 4. NATIVE-03 Reuse: Reuses createAndroidWebViewIntegrationBoundary and isSafeWebViewNavigationTarget.
 * 5. Navigation Path Integrity: Intent navigations (e.g. external link click) pre-validated before dispatch.
 * 6. Tab Context Isolation: Host maintains isolated boundaries per active tabId without cross-talk.
 * 7. Form 34 Stale Request Compatibility: Preserves epoch tracking across host-level navigation events.
 * 8. Form 38 Cookie/Session Preservation: Never dumps or exposes tab cookie jars to arbitrary native layers.
 * 9. Form 39 Download Boundary: Passes downloads cleanly to download metadata handler without rewrite.
 * 10. Security & JS Bridge Safety: Privileged JS bridges strictly prohibited (isPrivilegedBridgeEnabled: false).
 * 11. Graceful Fallback: Seamless operation as virtual host when running in web / non-Android environments.
 */

import {
  AndroidWebViewSettings,
  AndroidWebNavigationCallbacks,
  DEFAULT_ANDROID_WEBVIEW_SETTINGS,
  detectAndroidWebViewEnvironment,
} from "./androidWebViewFoundation";
import {
  createAndroidWebViewIntegrationBoundary,
  isSafeWebViewNavigationTarget,
  AndroidWebViewIntegrationBoundary,
  WebViewIntegrationBoundaryConfig,
} from "./androidWebViewIntegrationBoundary";

/**
 * Standard Android Host Activity Lifecycle State
 */
export enum AndroidHostActivityState {
  INITIALIZED = "INITIALIZED",
  CREATED = "CREATED",
  STARTED = "STARTED",
  RESUMED = "RESUMED",
  PAUSED = "PAUSED",
  STOPPED = "STOPPED",
  DESTROYED = "DESTROYED",
}

/**
 * Android Intent actions supported by NETFLOW Host Shell
 */
export type AndroidIntentAction =
  | "android.intent.action.VIEW"
  | "android.intent.action.MAIN"
  | "android.intent.action.WEB_SEARCH";

/**
 * Android Intent payload contract
 */
export interface AndroidHostIntent {
  action: AndroidIntentAction;
  dataUrl?: string;
  categories?: string[];
  flags?: number;
  extras?: Record<string, any>;
}

/**
 * Contract specifying Android Host Activity events and lifecycle hooks
 */
export interface AndroidHostActivityContract {
  state: AndroidHostActivityState;
  onCreate: (intent?: AndroidHostIntent) => void;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onStop: () => void;
  onDestroy: () => void;
  onBackPressed: () => boolean; // Returns true if back navigation handled internally
  onNewIntent: (intent: AndroidHostIntent) => void;
  onRequestPermissionsResult?: (requestCode: number, permissions: string[], grantResults: number[]) => void;
}

/**
 * Configuration for the Native Android Host Shell
 */
export interface AndroidHostShellConfig {
  /** Callback to dispatch navigation to NETFLOW core */
  onNavigate: (url: string, tabId: string) => void;
  /** State dispatcher to update tab loading */
  setTabLoading: (tabId: string, isLoading: boolean, requestEpoch?: number) => void;
  /** State dispatcher to update tab title */
  setTabTitle?: (tabId: string, title: string) => void;
  /** State dispatcher to update tab progress */
  setTabProgress?: (tabId: string, progress: number) => void;
  /** State dispatcher to update tab error */
  setTabError?: (tabId: string, error: string, requestEpoch?: number) => void;
  /** Download interception delegate */
  onDownloadIntercepted?: (tabId: string, downloadInfo: {
    url: string;
    userAgent: string;
    contentDisposition: string;
    mimeType: string;
    contentLength: number;
  }) => void;
  /** Epoch provider for Form 34 stale request protection */
  getCurrentEpoch?: (tabId: string) => number;
  /** Handler for back button navigation in active tab */
  onHandleBackNavigation?: () => boolean;
  /** Whether native WebView rendering is enabled for safe HTTP/HTTPS URLs */
  isNativeRenderingEnabled?: boolean;
}

/**
 * Active Android Host Shell Session instance
 */
export interface AndroidHostShellSession {
  isNativeAvailable: boolean;
  platform: "android_webview" | "web_environment";
  activityState: AndroidHostActivityState;
  webViewSettings: AndroidWebViewSettings;
  isPrivilegedBridgeEnabled: boolean;
  activityContract: AndroidHostActivityContract;
  /** Get or create an isolated integration boundary for a specific tab */
  getTabBoundary: (tabId: string) => AndroidWebViewIntegrationBoundary;
  /** Handle an incoming native Android Intent safely */
  handleIntent: (intent: AndroidHostIntent, targetTabId: string) => { success: boolean; reason?: string };
  /** Clean up resources when a tab is closed */
  releaseTabBoundary: (tabId: string) => void;
}

/**
 * Initializes the Native Android Host/Shell foundation session
 */
export function createAndroidHostShell(config: AndroidHostShellConfig): AndroidHostShellSession {
  const env = detectAndroidWebViewEnvironment();
  const tabBoundaries = new Map<string, AndroidWebViewIntegrationBoundary>();
  let currentActivityState: AndroidHostActivityState = AndroidHostActivityState.INITIALIZED;

  // Privileged JS bridge is strictly disabled for security
  const isPrivilegedBridgeEnabled = false;

  const getTabBoundary = (tabId: string): AndroidWebViewIntegrationBoundary => {
    let boundary = tabBoundaries.get(tabId);
    if (!boundary) {
      const boundaryConfig: WebViewIntegrationBoundaryConfig = {
        boundTabId: tabId,
        onNavigate: config.onNavigate,
        setTabLoading: config.setTabLoading,
        setTabTitle: config.setTabTitle,
        setTabProgress: config.setTabProgress,
        setTabError: config.setTabError,
        onDownloadIntercepted: config.onDownloadIntercepted,
        getCurrentEpoch: config.getCurrentEpoch,
        isNativeRenderingEnabled: config.isNativeRenderingEnabled,
      };
      boundary = createAndroidWebViewIntegrationBoundary(boundaryConfig);
      tabBoundaries.set(tabId, boundary);
    }
    return boundary;
  };

  const releaseTabBoundary = (tabId: string): void => {
    tabBoundaries.delete(tabId);
  };

  const handleIntent = (
    intent: AndroidHostIntent,
    targetTabId: string
  ): { success: boolean; reason?: string } => {
    if (!intent || !intent.action) {
      return { success: false, reason: "Invalid intent specification" };
    }

    if (intent.action === "android.intent.action.VIEW" || intent.action === "android.intent.action.WEB_SEARCH") {
      const targetUrl = (intent.dataUrl || "").trim();
      if (!targetUrl) {
        return { success: false, reason: "Missing target URL in intent" };
      }

      // Security check via NATIVE-03 validator
      const securityCheck = isSafeWebViewNavigationTarget(targetUrl);
      if (!securityCheck.safe) {
        console.warn(`[Android Host Shell] Blocked unsafe intent target: ${targetUrl} (${securityCheck.reason})`);
        return { success: false, reason: securityCheck.reason };
      }

      const boundary = getTabBoundary(targetTabId);
      const dispatched = boundary.dispatchNavigation(targetUrl);
      return { success: dispatched };
    }

    if (intent.action === "android.intent.action.MAIN") {
      return { success: true, reason: "Main launcher action handled" };
    }

    return { success: false, reason: "Unsupported intent action" };
  };

  const activityContract: AndroidHostActivityContract = {
    get state() {
      return currentActivityState;
    },
    onCreate: (intent?: AndroidHostIntent) => {
      currentActivityState = AndroidHostActivityState.CREATED;
      if (intent) {
        // Intent handling deferred to tab initialization
      }
    },
    onStart: () => {
      currentActivityState = AndroidHostActivityState.STARTED;
    },
    onResume: () => {
      currentActivityState = AndroidHostActivityState.RESUMED;
    },
    onPause: () => {
      currentActivityState = AndroidHostActivityState.PAUSED;
    },
    onStop: () => {
      currentActivityState = AndroidHostActivityState.STOPPED;
    },
    onDestroy: () => {
      currentActivityState = AndroidHostActivityState.DESTROYED;
      tabBoundaries.clear();
    },
    onBackPressed: (): boolean => {
      if (config.onHandleBackNavigation) {
        return config.onHandleBackNavigation();
      }
      return false;
    },
    onNewIntent: (intent: AndroidHostIntent) => {
      // In singleTask/singleTop mode, new intents arrive here
      if (intent.dataUrl) {
        // Can be dispatched to active tab by caller
      }
    },
  };

  return {
    isNativeAvailable: env.isNativeAvailable,
    platform: env.platform,
    activityState: currentActivityState,
    webViewSettings: DEFAULT_ANDROID_WEBVIEW_SETTINGS,
    isPrivilegedBridgeEnabled,
    activityContract,
    getTabBoundary,
    handleIntent,
    releaseTabBoundary,
  };
}
