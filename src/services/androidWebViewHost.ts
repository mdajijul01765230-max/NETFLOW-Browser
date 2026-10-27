/**
 * NETFLOW Browser V2 — Real Android WebView Host Layer
 *
 * Form: NETFLOW-V2-NATIVE-07
 *
 * This module establishes the real Android WebView Host layer, integrating:
 * 1. NATIVE-02: Android WebView lifecycle adapter (onPageStarted, onPageFinished, error, progress, title)
 * 2. NATIVE-03: Android WebView integration boundary (safe URL validation, error codes, navigation filtering)
 * 3. NATIVE-04: Android Host Activity lifecycle (state management, back press, intent routing)
 * 4. Preservation: Preserves NETFLOW tab transaction, navigation, and stale-request protection intact.
 * 5. Environment Guard: Transparently falls back to virtual host when native Android runtime is not present.
 */

import {
  AndroidWebNavigationCallbacks,
  DEFAULT_ANDROID_WEBVIEW_SETTINGS,
  detectAndroidWebViewEnvironment,
} from "./androidWebViewFoundation";
import {
  createAndroidHostShell,
  AndroidHostShellSession,
  AndroidHostActivityState,
  AndroidHostIntent,
} from "./androidHostShell";
import { AndroidWebViewIntegrationBoundary } from "./androidWebViewIntegrationBoundary";

export interface AndroidWebViewHostConfig {
  tabId: string;
  onNavigate: (url: string, tabId: string) => void;
  setTabLoading: (tabId: string, isLoading: boolean, requestEpoch?: number) => void;
  setTabTitle?: (tabId: string, title: string) => void;
  setTabProgress?: (tabId: string, progress: number) => void;
  setTabError?: (tabId: string, error: string, requestEpoch?: number) => void;
  onDownloadIntercepted?: (tabId: string, downloadInfo: {
    url: string;
    userAgent: string;
    contentDisposition: string;
    mimeType: string;
    contentLength: number;
  }) => void;
  getCurrentEpoch?: (tabId: string) => number;
  isNativeRenderingEnabled?: boolean;
}

export interface AndroidWebViewHostSession {
  tabId: string;
  isNativeAvailable: boolean;
  isNativeRenderingEnabled: boolean;
  callbacks: AndroidWebNavigationCallbacks;
  boundary: AndroidWebViewIntegrationBoundary;
  shell: AndroidHostShellSession;
  loadUrl: (url: string) => boolean;
  stopLoading: () => void;
  reload: (currentUrl: string) => boolean;
  handleHostIntent: (intent: AndroidHostIntent) => { success: boolean; reason?: string };
  getHostActivityState: () => AndroidHostActivityState;
  destroy: () => void;
}

/**
 * Creates and connects the real Android WebView Host layer
 */
export function createAndroidWebViewHost(
  config: AndroidWebViewHostConfig
): AndroidWebViewHostSession {
  const env = detectAndroidWebViewEnvironment();

  // 1. Initialize NATIVE-04 Host Shell
  const shell = createAndroidHostShell({
    onNavigate: config.onNavigate,
    setTabLoading: config.setTabLoading,
    setTabTitle: config.setTabTitle,
    setTabProgress: config.setTabProgress,
    setTabError: config.setTabError,
    onDownloadIntercepted: config.onDownloadIntercepted,
    getCurrentEpoch: config.getCurrentEpoch,
    isNativeRenderingEnabled: config.isNativeRenderingEnabled,
  });

  // Transition host shell activity to RESUMED
  shell.activityContract.onCreate();
  shell.activityContract.onStart();
  shell.activityContract.onResume();

  // 2. Link NATIVE-03 Integration Boundary (which internally links NATIVE-02 adapter callbacks)
  const boundary = shell.getTabBoundary(config.tabId);
  const callbacks = boundary.callbacks;

  // 3. Navigation Dispatcher
  const loadUrl = (url: string): boolean => {
    callbacks.onPageStarted(url);
    const success = boundary.dispatchNavigation(url);
    if (!success) {
      callbacks.onReceivedError(-2, "Failed to dispatch navigation: unsafe or invalid target", url);
      callbacks.onPageFinished(url);
      return false;
    }

    if (env.isNativeAvailable && config.isNativeRenderingEnabled) {
      env.postMessage("LOAD_URL", { url, tabId: config.tabId });
    }

    return true;
  };

  const stopLoading = (): void => {
    config.setTabLoading(config.tabId, false);
  };

  const reload = (currentUrl: string): boolean => {
    return loadUrl(currentUrl);
  };

  const handleHostIntent = (intent: AndroidHostIntent): { success: boolean; reason?: string } => {
    return shell.handleIntent(intent, config.tabId);
  };

  const getHostActivityState = (): AndroidHostActivityState => {
    return shell.activityContract.state;
  };

  const destroy = (): void => {
    stopLoading();
    shell.releaseTabBoundary(config.tabId);
    shell.activityContract.onPause();
    shell.activityContract.onStop();
    shell.activityContract.onDestroy();
  };

  return {
    tabId: config.tabId,
    isNativeAvailable: env.isNativeAvailable,
    isNativeRenderingEnabled: Boolean(config.isNativeRenderingEnabled && env.isNativeAvailable),
    callbacks,
    boundary,
    shell,
    loadUrl,
    stopLoading,
    reload,
    handleHostIntent,
    getHostActivityState,
    destroy,
  };
}
