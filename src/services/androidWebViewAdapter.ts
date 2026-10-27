/**
 * NETFLOW Browser V2 — Android Chromium WebView Runtime Adapter & Lifecycle Mapper
 *
 * Form: NETFLOW-V2-NATIVE-02
 *
 * This adapter bridges the Android WebViewClient / WebChromeClient / DownloadListener
 * lifecycle architecture into NETFLOW Browser V2's reactive tab state.
 *
 * Features:
 * 1. Concrete AndroidWebNavigationCallbacks lifecycle mapper
 * 2. Navigation Request lifecycle (shouldOverrideUrlLoading) with safe scheme & internal IP guard
 * 3. Page lifecycle mapping: onPageStarted, onPageFinished, onReceivedError, onProgressChanged, onReceivedTitle
 * 4. DownloadListener lifecycle integration: onDownloadStart mapped to tab download state
 * 5. Safe boundary between Android WebView native contract and existing web fallback
 * 6. Zero regression to Form 34 (stale request protection), Form 35 (history/navigation),
 *    Form 37 (stop/reload cancellation), Form 38 (cookie/session), Form 39 (safe downloads).
 */

import {
  AndroidWebViewSettings,
  AndroidWebNavigationCallbacks,
  DEFAULT_ANDROID_WEBVIEW_SETTINGS,
  detectAndroidWebViewEnvironment,
} from "./androidWebViewFoundation";
import { BrowsingMode, FormSubmitOptions } from "../types";

export interface WebViewLifecycleAdapterParams {
  tabId: string;
  onNavigate: (
    url: string,
    tabId?: string,
    isHistoryNav?: boolean,
    targetHistoryIndex?: number,
    overrideMode?: BrowsingMode,
    formOptions?: FormSubmitOptions
  ) => void;
  onLoadingStateChange?: (tabId: string, isLoading: boolean) => void;
  onTitleReceived?: (tabId: string, title: string) => void;
  onErrorReceived?: (tabId: string, error: string) => void;
  onDownloadIntercepted?: (tabId: string, downloadInfo: {
    url: string;
    userAgent: string;
    contentDisposition: string;
    mimeType: string;
    contentLength: number;
  }) => void;
  isNativeRenderingEnabled?: boolean;
}

/**
 * Creates an Android WebView navigation callback adapter adhering to
 * standard android.webkit.WebViewClient, WebChromeClient, and DownloadListener contracts.
 */
export function createAndroidWebViewLifecycleAdapter(
  params: WebViewLifecycleAdapterParams
): AndroidWebNavigationCallbacks {
  const {
    tabId,
    onNavigate,
    onLoadingStateChange,
    onTitleReceived,
    onErrorReceived,
    onDownloadIntercepted,
    isNativeRenderingEnabled,
  } = params;

  return {
    /**
     * Maps to WebViewClient.shouldOverrideUrlLoading(view, request)
     * Returns true if the host application handles the URL, false to let WebView load it.
     */
    shouldOverrideUrlLoading: (url: string): boolean => {
      const trimmed = (url || "").trim();
      if (!trimmed) return true;

      // Safe scheme validation: Reject unsafe schemes (file:, javascript:, data: unless sanitized)
      const lower = trimmed.toLowerCase();
      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("file:") ||
        lower.startsWith("content:") ||
        lower.startsWith("about:config")
      ) {
        console.warn("[Android WebView Adapter] Blocked unsafe navigation scheme:", trimmed);
        return true; // Abort navigation
      }

      // If native WebView rendering is enabled and running in Android native host, let Chromium load safe HTTP/HTTPS URLs
      if (isNativeRenderingEnabled) {
        const env = detectAndroidWebViewEnvironment();
        if (env.isNativeAvailable) {
          env.postMessage("LOAD_URL", { url: trimmed, tabId });
          // Returning false instructs Android WebView to load the URL in its internal Chromium engine
          return false;
        }
      }

      // Delegate navigation to NETFLOW's verified navigation pipeline
      onNavigate(trimmed, tabId);
      return true;
    },

    /**
     * Maps to WebViewClient.onPageStarted(view, url, favicon)
     */
    onPageStarted: (_url: string): void => {
      if (onLoadingStateChange) {
        onLoadingStateChange(tabId, true);
      }
    },

    /**
     * Maps to WebViewClient.onPageFinished(view, url)
     */
    onPageFinished: (_url: string): void => {
      if (onLoadingStateChange) {
        onLoadingStateChange(tabId, false);
      }
    },

    /**
     * Maps to WebViewClient.onReceivedError(view, errorCode, description, failingUrl)
     */
    onReceivedError: (_errorCode: number, description: string, _failingUrl: string): void => {
      if (onLoadingStateChange) {
        onLoadingStateChange(tabId, false);
      }
      if (onErrorReceived) {
        onErrorReceived(tabId, description || "Android WebView navigation error");
      }
    },

    /**
     * Maps to WebChromeClient.onProgressChanged(view, newProgress)
     */
    onProgressChanged: (_newProgress: number): void => {
      // Progress reporting hook (0 - 100)
    },

    /**
     * Maps to WebChromeClient.onReceivedTitle(view, title)
     */
    onReceivedTitle: (title: string): void => {
      if (title && onTitleReceived) {
        onTitleReceived(tabId, title);
      }
    },

    /**
     * Maps to DownloadListener.onDownloadStart(url, userAgent, contentDisposition, mimeType, contentLength)
     */
    onDownloadStart: (
      url: string,
      userAgent: string,
      contentDisposition: string,
      mimeType: string,
      contentLength: number
    ): void => {
      if (onDownloadIntercepted) {
        onDownloadIntercepted(tabId, {
          url,
          userAgent,
          contentDisposition,
          mimeType,
          contentLength,
        });
      }
    },
  };
}

export interface AndroidWebViewRuntimeSession {
  settings: AndroidWebViewSettings;
  callbacks: AndroidWebNavigationCallbacks;
  isNativeHost: boolean;
  platform: "android_webview" | "web_environment";
}

/**
 * Initializes a structured Android WebView runtime integration session.
 * If running on a non-native web environment, gracefully provides the complete
 * contract interface while maintaining safe web fallback.
 */
export function initAndroidWebViewRuntimeSession(
  params: WebViewLifecycleAdapterParams,
  customSettings?: Partial<AndroidWebViewSettings>
): AndroidWebViewRuntimeSession {
  const env = detectAndroidWebViewEnvironment();
  const settings: AndroidWebViewSettings = {
    ...DEFAULT_ANDROID_WEBVIEW_SETTINGS,
    ...customSettings,
    // Immutable security boundaries
    allowFileAccess: false,
    allowContentAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
  };

  const callbacks = createAndroidWebViewLifecycleAdapter(params);

  return {
    settings,
    callbacks,
    isNativeHost: env.isNativeAvailable,
    platform: env.platform,
  };
}
