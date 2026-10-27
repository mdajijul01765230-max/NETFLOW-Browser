/**
 * NETFLOW Browser V2 — Android WebView Navigation Control Boundary
 *
 * Form: NETFLOW-V2-NATIVE-09
 *
 * This module establishes the real Android WebView Navigation Control layer,
 * synchronizing:
 * 1. Back Navigation (canGoBack / goBack)
 * 2. Forward Navigation (canGoForward / goForward)
 * 3. Reload Navigation (reload with request transaction preservation)
 * 4. Stop / Cancel Navigation (stopLoading with stale-response protection)
 * 5. New Navigation (transaction epoch invalidation & dispatch)
 * 6. Navigation Callback State Consistency (onPageStarted, onPageFinished, error, progress)
 * 7. Tab Isolation (per-tab transaction lifecycle & history state boundary)
 * 8. Existing Linkage: Consumes NATIVE-02/03/04/07/08 without reimplementing them.
 */

import { AndroidWebViewIntegrationBoundary } from "./androidWebViewIntegrationBoundary";
import { AndroidHostShellSession } from "./androidHostShell";
import { AndroidWebViewHostSession } from "./androidWebViewHost";

export interface AndroidTabHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
}

export interface AndroidWebViewNavigationControlConfig {
  tabId: string;
  initialUrl?: string;
  onNavigate: (
    url: string,
    tabId: string,
    isHistoryNav?: boolean,
    targetHistoryIndex?: number
  ) => void;
  onLoadingChange: (tabId: string, isLoading: boolean, requestEpoch: number) => void;
  onErrorChange?: (tabId: string, error: string, requestEpoch: number) => void;
  onProgressChange?: (tabId: string, progress: number) => void;
  onTitleChange?: (tabId: string, title: string) => void;
}

export interface AndroidWebViewNavigationController {
  tabId: string;
  currentUrl: string;
  currentHistoryIndex: number;
  history: AndroidTabHistoryEntry[];
  requestEpoch: number;
  isLoading: boolean;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => boolean;
  goForward: () => boolean;
  reload: () => boolean;
  stopLoading: () => void;
  loadUrl: (url: string) => boolean;
  syncHistoryState: (historyUrls: string[], currentIndex: number) => void;
  onPageStarted: (url: string) => void;
  onPageFinished: (url: string) => void;
  onReceivedProgress: (progress: number) => void;
  onReceivedTitle: (title: string) => void;
  onReceivedError: (errorCode: number, description: string, failingUrl: string) => void;
  destroy: () => void;
}

/**
 * Creates an Android WebView Navigation Controller for a specific tab
 */
export function createAndroidWebViewNavigationController(
  config: AndroidWebViewNavigationControlConfig,
  boundary?: AndroidWebViewIntegrationBoundary
): AndroidWebViewNavigationController {
  const tabId = config.tabId;
  let currentUrl = config.initialUrl?.trim() || "about:blank";
  let history: AndroidTabHistoryEntry[] = [
    { url: currentUrl, title: "New Tab", timestamp: Date.now() },
  ];
  let currentHistoryIndex = 0;
  let requestEpoch = 0;
  let isLoading = false;
  let isDispatchingCallback = false;

  const canGoBack = (): boolean => currentHistoryIndex > 0;
  const canGoForward = (): boolean => currentHistoryIndex < history.length - 1;

  /**
   * Synchronizes controller's internal history stack and position with external tab state
   */
  const syncHistoryState = (historyUrls: string[], currentIndex: number): void => {
    if (!Array.isArray(historyUrls) || historyUrls.length === 0) {
      history = [{ url: currentUrl || "about:blank", title: "New Tab", timestamp: Date.now() }];
      currentHistoryIndex = 0;
      return;
    }
    history = historyUrls.map((u, idx) => {
      const existing = history[idx];
      return {
        url: u,
        title: existing && existing.url === u ? existing.title : (u || "New Tab"),
        timestamp: existing && existing.url === u ? existing.timestamp : Date.now(),
      };
    });
    currentHistoryIndex = Math.max(0, Math.min(currentIndex, history.length - 1));
    currentUrl = history[currentHistoryIndex]?.url || "";
  };

  const stopLoading = (): void => {
    if (isLoading) {
      isLoading = false;
      // Invalidate current epoch so any delayed response is dropped
      requestEpoch += 1;
      config.onLoadingChange(tabId, false, requestEpoch);
      config.onProgressChange?.(tabId, 0);
    }
  };

  const loadUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;

    // Boundary validation (dangerous schemes, etc.)
    if (boundary) {
      const allowed = boundary.dispatchNavigation(trimmed);
      if (!allowed) {
        config.onErrorChange?.(tabId, "Blocked unsafe navigation target", requestEpoch);
        return false;
      }
    }

    // Invalidate previous transaction epoch
    requestEpoch += 1;
    const thisEpoch = requestEpoch;
    isLoading = true;
    currentUrl = trimmed;

    // Update history stack (truncate forward history on new navigation)
    history = history.slice(0, currentHistoryIndex + 1);
    history.push({ url: trimmed, title: trimmed, timestamp: Date.now() });
    currentHistoryIndex = history.length - 1;

    config.onLoadingChange(tabId, true, thisEpoch);
    config.onProgressChange?.(tabId, 10);
    if (isDispatchingCallback) return false;
    try {
      isDispatchingCallback = true;
      config.onNavigate(trimmed, tabId, false);
    } finally {
      isDispatchingCallback = false;
    }
    return true;
  };

  const goBack = (): boolean => {
    if (!canGoBack() || isDispatchingCallback) return false;
    requestEpoch += 1;
    const thisEpoch = requestEpoch;
    currentHistoryIndex -= 1;
    const targetEntry = history[currentHistoryIndex];
    currentUrl = targetEntry.url;
    isLoading = true;

    config.onLoadingChange(tabId, true, thisEpoch);
    config.onProgressChange?.(tabId, 10);
    try {
      isDispatchingCallback = true;
      config.onNavigate(targetEntry.url, tabId, true, currentHistoryIndex);
    } finally {
      isDispatchingCallback = false;
    }
    return true;
  };

  const goForward = (): boolean => {
    if (!canGoForward() || isDispatchingCallback) return false;
    requestEpoch += 1;
    const thisEpoch = requestEpoch;
    currentHistoryIndex += 1;
    const targetEntry = history[currentHistoryIndex];
    currentUrl = targetEntry.url;
    isLoading = true;

    config.onLoadingChange(tabId, true, thisEpoch);
    config.onProgressChange?.(tabId, 10);
    try {
      isDispatchingCallback = true;
      config.onNavigate(targetEntry.url, tabId, true, currentHistoryIndex);
    } finally {
      isDispatchingCallback = false;
    }
    return true;
  };

  const reload = (): boolean => {
    if (!currentUrl || currentUrl === "about:blank" || isDispatchingCallback) return false;
    requestEpoch += 1;
    const thisEpoch = requestEpoch;
    isLoading = true;

    config.onLoadingChange(tabId, true, thisEpoch);
    config.onProgressChange?.(tabId, 10);
    try {
      isDispatchingCallback = true;
      config.onNavigate(currentUrl, tabId, false);
    } finally {
      isDispatchingCallback = false;
    }
    return true;
  };

  const onPageStarted = (url: string): void => {
    isLoading = true;
    currentUrl = url;
    config.onLoadingChange(tabId, true, requestEpoch);
    config.onProgressChange?.(tabId, 15);
  };

  const onPageFinished = (url: string): void => {
    isLoading = false;
    currentUrl = url;
    config.onLoadingChange(tabId, false, requestEpoch);
    config.onProgressChange?.(tabId, 100);
  };

  const onReceivedProgress = (progress: number): void => {
    config.onProgressChange?.(tabId, Math.max(0, Math.min(100, progress)));
  };

  const onReceivedTitle = (title: string): void => {
    if (history[currentHistoryIndex]) {
      history[currentHistoryIndex].title = title;
    }
    config.onTitleChange?.(tabId, title);
  };

  const onReceivedError = (errorCode: number, description: string, failingUrl: string): void => {
    isLoading = false;
    config.onLoadingChange(tabId, false, requestEpoch);
    config.onErrorChange?.(tabId, `[Error ${errorCode}] ${description}`, requestEpoch);
  };

  const destroy = (): void => {
    stopLoading();
    history = [];
  };

  return {
    get tabId() { return tabId; },
    get currentUrl() { return currentUrl; },
    get currentHistoryIndex() { return currentHistoryIndex; },
    get history() { return history; },
    get requestEpoch() { return requestEpoch; },
    get isLoading() { return isLoading; },
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    reload,
    stopLoading,
    loadUrl,
    syncHistoryState,
    onPageStarted,
    onPageFinished,
    onReceivedProgress,
    onReceivedTitle,
    onReceivedError,
    destroy,
  };
}
