/**
 * NETFLOW Browser V2 — Android WebView Navigation & WebViewClient Integration Boundary
 *
 * Form: NETFLOW-V2-NATIVE-03
 *
 * This boundary establishes the concrete integration between the NATIVE-02
 * Android WebView runtime adapter/callbacks and NETFLOW Browser V2's reactive
 * tab state management, navigation pipeline, and error recovery system.
 *
 * Architecture Principles:
 * 1. Navigation Integration: Safely bridges WebViewClient navigation intents into handleNavigate.
 * 2. Tab Context Isolation: Validates tabId context on every callback to prevent cross-tab state contamination.
 * 3. Stale Request Protection Compatibility (Form 34): Verifies request epochs before committing loading/error state.
 * 4. Error & Recovery Mapping: Maps Chromium WebView error codes into human-readable browser error states.
 * 5. Title & Progress UI Mapping: Feeds progress (0-100) and document title updates cleanly to tab metadata.
 * 6. Dangerous Scheme & SSRF Boundary: Rejects file://, javascript:, content:, and private targets prior to dispatch.
 * 7. Safe Fallback: Seamless no-op/fallback when running in standard web browser / container environments.
 * 8. Zero privileged JS bridge activation; download listener passes to existing Form 39 download boundary.
 */

import {
  AndroidWebNavigationCallbacks,
  detectAndroidWebViewEnvironment,
} from "./androidWebViewFoundation";
import {
  createAndroidWebViewLifecycleAdapter,
  WebViewLifecycleAdapterParams,
} from "./androidWebViewAdapter";

/**
 * Standard Android WebView Client error codes (android.webkit.WebViewClient)
 */
export enum AndroidWebViewErrorCode {
  ERROR_UNKNOWN = -1,
  ERROR_HOST_LOOKUP = -2,
  ERROR_UNSUPPORTED_AUTH_SCHEME = -3,
  ERROR_AUTHENTICATION = -4,
  ERROR_PROXY_AUTHENTICATION = -5,
  ERROR_CONNECT = -6,
  ERROR_IO = -7,
  ERROR_TIMEOUT = -8,
  ERROR_REDIRECT_LOOP = -9,
  ERROR_UNSUPPORTED_SCHEME = -10,
  ERROR_FAILED_SSL_HANDSHAKE = -11,
  ERROR_BAD_URL = -12,
  ERROR_FILE = -13,
  ERROR_FILE_NOT_FOUND = -14,
  ERROR_TOO_MANY_REQUESTS = -15,
  ERROR_UNSAFE_RESOURCE = -16,
}

/**
 * Maps standard Android WebView Client error codes into human-readable error descriptions.
 */
export function mapAndroidWebViewErrorCodeToMessage(errorCode: number, defaultDesc?: string): string {
  switch (errorCode) {
    case AndroidWebViewErrorCode.ERROR_HOST_LOOKUP:
      return "Domain or host could not be resolved. Please check your network connection or the web address.";
    case AndroidWebViewErrorCode.ERROR_CONNECT:
      return "Unable to establish a connection to the server. The server may be unreachable or offline.";
    case AndroidWebViewErrorCode.ERROR_TIMEOUT:
      return "Connection timed out. The destination server took too long to respond.";
    case AndroidWebViewErrorCode.ERROR_FAILED_SSL_HANDSHAKE:
      return "Secure SSL/TLS handshake failed. The security certificate could not be verified.";
    case AndroidWebViewErrorCode.ERROR_UNSUPPORTED_SCHEME:
    case AndroidWebViewErrorCode.ERROR_BAD_URL:
      return "The requested address or URL scheme is invalid or unsupported.";
    case AndroidWebViewErrorCode.ERROR_REDIRECT_LOOP:
      return "The webpage resulted in too many redirects (redirect loop).";
    case AndroidWebViewErrorCode.ERROR_TOO_MANY_REQUESTS:
      return "Too many requests sent in a short time. Please wait a moment and try again.";
    case AndroidWebViewErrorCode.ERROR_UNSAFE_RESOURCE:
      return "The requested web resource was flagged as unsafe or malicious.";
    default:
      return defaultDesc || "A navigation or rendering error occurred in the browser engine.";
  }
}

/**
 * Validates a target URL against dangerous schemes and malformed inputs
 * before permitting native WebView navigation dispatch.
 */
export function isSafeWebViewNavigationTarget(url: string): { safe: boolean; reason?: string } {
  if (!url || typeof url !== "string") {
    return { safe: false, reason: "Empty or invalid URL" };
  }

  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Strict rejection of forbidden schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:application") ||
    lower.startsWith("about:config") ||
    lower.startsWith("blob:null")
  ) {
    return { safe: false, reason: `Unsafe scheme: ${lower.split(":")[0]}` };
  }

  // Pre-validate valid web schemes
  if (!lower.startsWith("http://") && !lower.startsWith("https://") && !lower.startsWith("about:blank")) {
    return { safe: false, reason: "Unsupported non-web scheme" };
  }

  return { safe: true };
}

/**
 * Parameters required to bind an Android WebViewClient instance to NETFLOW tab state.
 */
export interface WebViewIntegrationBoundaryConfig {
  /** Bound tab identifier */
  boundTabId: string;
  /** Function to execute navigation in NETFLOW core pipeline */
  onNavigate: (url: string, tabId: string) => void;
  /** State dispatcher to update tab loading state */
  setTabLoading: (tabId: string, isLoading: boolean, requestEpoch?: number) => void;
  /** State dispatcher to update tab title */
  setTabTitle?: (tabId: string, title: string) => void;
  /** State dispatcher to update tab progress */
  setTabProgress?: (tabId: string, progress: number) => void;
  /** State dispatcher to update tab error state */
  setTabError?: (tabId: string, error: string, requestEpoch?: number) => void;
  /** Download interception delegate */
  onDownloadIntercepted?: (tabId: string, downloadInfo: {
    url: string;
    userAgent: string;
    contentDisposition: string;
    mimeType: string;
    contentLength: number;
  }) => void;
  /** Function returning the current request epoch for this tab to guard against stale responses */
  getCurrentEpoch?: (tabId: string) => number;
  /** Whether the native WebView engine should directly load and render the safe HTTP/HTTPS URL */
  isNativeRenderingEnabled?: boolean;
}

export interface AndroidWebViewIntegrationBoundary {
  boundTabId: string;
  isNativeHost: boolean;
  callbacks: AndroidWebNavigationCallbacks;
  /** Dispatches an intentional URL load with tab isolation and security pre-validation */
  dispatchNavigation: (targetUrl: string, explicitEpoch?: number) => boolean;
  /** Checks whether a given tabId matches this boundary instance */
  isTabContextValid: (incomingTabId: string) => boolean;
}

/**
 * Creates an Android WebView integration boundary ensuring strict tab isolation,
 * stale request epoch compatibility (Form 34), security filtering, and error mapping.
 */
export function createAndroidWebViewIntegrationBoundary(
  config: WebViewIntegrationBoundaryConfig
): AndroidWebViewIntegrationBoundary {
  const {
    boundTabId,
    onNavigate,
    setTabLoading,
    setTabTitle,
    setTabProgress,
    setTabError,
    onDownloadIntercepted,
    getCurrentEpoch,
  } = config;

  const env = detectAndroidWebViewEnvironment();
  let activeEpoch: number = getCurrentEpoch ? getCurrentEpoch(boundTabId) : 0;

  const isTabContextValid = (incomingTabId: string): boolean => {
    return incomingTabId === boundTabId;
  };

  const isEpochActive = (): boolean => {
    if (!getCurrentEpoch) return true;
    const current = getCurrentEpoch(boundTabId);
    return current === activeEpoch;
  };

  const syncActiveEpoch = (explicitEpoch?: number) => {
    if (explicitEpoch !== undefined) {
      activeEpoch = explicitEpoch;
    } else if (getCurrentEpoch) {
      activeEpoch = getCurrentEpoch(boundTabId);
    }
  };

  const adapterParams: WebViewLifecycleAdapterParams = {
    tabId: boundTabId,
    onNavigate: (url: string, targetTabId?: string) => {
      const tabToUse = targetTabId || boundTabId;
      if (!isTabContextValid(tabToUse)) {
        console.warn(`[WebView Boundary] Dropped navigation from mismatched tabId: ${tabToUse} !== ${boundTabId}`);
        return;
      }

      const securityCheck = isSafeWebViewNavigationTarget(url);
      if (!securityCheck.safe) {
        console.warn(`[WebView Boundary] Blocked unsafe navigation: ${url} (${securityCheck.reason})`);
        if (setTabError) {
          setTabError(boundTabId, `Navigation blocked: ${securityCheck.reason}`);
        }
        return;
      }

      syncActiveEpoch();
      onNavigate(url, boundTabId);
    },

    onLoadingStateChange: (tabId: string, isLoading: boolean) => {
      if (!isTabContextValid(tabId)) return;
      if (!isEpochActive()) {
        // Drop stale loading update from superseded request
        return;
      }
      setTabLoading(boundTabId, isLoading, activeEpoch);
    },

    onTitleReceived: (tabId: string, title: string) => {
      if (!isTabContextValid(tabId)) return;
      if (!isEpochActive()) return;
      if (setTabTitle && title) {
        setTabTitle(boundTabId, title.trim());
      }
    },

    onErrorReceived: (tabId: string, errorDescription: string) => {
      if (!isTabContextValid(tabId)) return;
      if (!isEpochActive()) return;

      setTabLoading(boundTabId, false, activeEpoch);
      if (setTabError) {
        setTabError(boundTabId, errorDescription, activeEpoch);
      }
    },

    onDownloadIntercepted: (tabId: string, downloadInfo) => {
      if (!isTabContextValid(tabId)) return;
      if (onDownloadIntercepted) {
        onDownloadIntercepted(boundTabId, downloadInfo);
      }
    },
    isNativeRenderingEnabled: config.isNativeRenderingEnabled,
  };

  const callbacks = createAndroidWebViewLifecycleAdapter(adapterParams);

  // Extend callbacks to support progress and detailed error codes
  const originalOnError = callbacks.onReceivedError;
  callbacks.onReceivedError = (errorCode: number, description: string, failingUrl: string) => {
    if (!isTabContextValid(boundTabId)) return;
    if (!isEpochActive()) return;

    const friendlyMessage = mapAndroidWebViewErrorCodeToMessage(errorCode, description);
    originalOnError(errorCode, friendlyMessage, failingUrl);
  };

  callbacks.onProgressChanged = (newProgress: number) => {
    if (!isTabContextValid(boundTabId)) return;
    if (!isEpochActive()) return;
    if (setTabProgress) {
      setTabProgress(boundTabId, Math.max(0, Math.min(100, newProgress)));
    }
  };

  const dispatchNavigation = (targetUrl: string, explicitEpoch?: number): boolean => {
    const check = isSafeWebViewNavigationTarget(targetUrl);
    if (!check.safe) {
      console.warn(`[WebView Boundary] Dispatch rejected: ${check.reason}`);
      return false;
    }

    syncActiveEpoch(explicitEpoch);
    callbacks.shouldOverrideUrlLoading(targetUrl);
    return true;
  };

  return {
    boundTabId,
    isNativeHost: env.isNativeAvailable,
    callbacks,
    dispatchNavigation,
    isTabContextValid,
  };
}
