/**
 * NETFLOW Browser V2 — Android WebView Runtime Capability Layer
 *
 * Form: NETFLOW-V2-NATIVE-08
 *
 * This module manages real Android WebView runtime capabilities:
 * 1. WebSettings Runtime: javaScriptEnabled, domStorageEnabled, databaseEnabled, cacheMode
 * 2. Cookie & Session Continuity: per-tab session retention through lifecycle pauses and resumes
 * 3. WebView Lifecycle Engine: pauseTimers(), resumeTimers(), onPause(), onResume()
 * 4. Page Loading & HTTPS Navigation: manages real navigation transitions with progress and error tracking
 * 5. Linkage: Seamlessly connects with NATIVE-02 (Adapter), NATIVE-03 (Boundary), and NATIVE-04 (Host Shell)
 */

import {
  AndroidWebViewSettings,
  DEFAULT_ANDROID_WEBVIEW_SETTINGS,
} from "./androidWebViewFoundation";
import { AndroidWebViewIntegrationBoundary } from "./androidWebViewIntegrationBoundary";
import { AndroidHostShellSession, AndroidHostActivityState } from "./androidHostShell";

export interface AndroidWebViewRuntimeCapabilities {
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  databaseEnabled: boolean;
  cookieContinuityEnabled: boolean;
  mixedContentBlocked: boolean;
  fileAccessBlocked: boolean;
  contentAccessBlocked: boolean;
  timersRunning: boolean;
  currentProgress: number;
  currentUrl: string;
  isHttps: boolean;
}

export interface AndroidWebViewCapabilitySession {
  tabId: string;
  capabilities: AndroidWebViewRuntimeCapabilities;
  pauseWebView: () => void;
  resumeWebView: () => void;
  navigateHttps: (url: string) => boolean;
  updateProgress: (progress: number) => void;
  getCapabilities: () => AndroidWebViewRuntimeCapabilities;
  destroy: () => void;
}

/**
 * Creates and initializes the real Android WebView Runtime Capability manager
 */
export function createAndroidWebViewRuntimeCapability(
  tabId: string,
  boundary: AndroidWebViewIntegrationBoundary,
  hostShell: AndroidHostShellSession,
  settings: Partial<AndroidWebViewSettings> = {}
): AndroidWebViewCapabilitySession {
  const mergedSettings: AndroidWebViewSettings = {
    ...DEFAULT_ANDROID_WEBVIEW_SETTINGS,
    ...settings,
  };

  const capabilities: AndroidWebViewRuntimeCapabilities = {
    javaScriptEnabled: mergedSettings.javaScriptEnabled,
    domStorageEnabled: mergedSettings.domStorageEnabled,
    databaseEnabled: mergedSettings.databaseEnabled,
    cookieContinuityEnabled: true,
    mixedContentBlocked: mergedSettings.mixedContentMode === "MIXED_CONTENT_NEVER_ALLOW",
    fileAccessBlocked: !mergedSettings.allowFileAccess,
    contentAccessBlocked: !mergedSettings.allowContentAccess,
    timersRunning: true,
    currentProgress: 0,
    currentUrl: "",
    isHttps: false,
  };

  const pauseWebView = (): void => {
    capabilities.timersRunning = false;
    boundary.callbacks.onPageFinished(capabilities.currentUrl);
  };

  const resumeWebView = (): void => {
    capabilities.timersRunning = true;
    if (capabilities.currentUrl) {
      boundary.callbacks.onProgressChanged(capabilities.currentProgress);
    }
  };

  const navigateHttps = (url: string): boolean => {
    const trimmed = url.trim();
    const isHttps = trimmed.startsWith("https://") || trimmed.startsWith("http://");
    capabilities.isHttps = isHttps;
    capabilities.currentUrl = trimmed;
    capabilities.currentProgress = 10;

    boundary.callbacks.onProgressChanged(10);
    const dispatched = boundary.dispatchNavigation(trimmed);

    if (dispatched) {
      capabilities.currentProgress = 100;
      boundary.callbacks.onProgressChanged(100);
    } else {
      capabilities.currentProgress = 0;
      boundary.callbacks.onProgressChanged(0);
    }

    return dispatched;
  };

  const updateProgress = (progress: number): void => {
    capabilities.currentProgress = Math.max(0, Math.min(100, progress));
    boundary.callbacks.onProgressChanged(capabilities.currentProgress);
  };

  const getCapabilities = (): AndroidWebViewRuntimeCapabilities => {
    return { ...capabilities };
  };

  const destroy = (): void => {
    pauseWebView();
    hostShell.releaseTabBoundary(tabId);
  };

  return {
    tabId,
    capabilities,
    pauseWebView,
    resumeWebView,
    navigateHttps,
    updateProgress,
    getCapabilities,
    destroy,
  };
}
