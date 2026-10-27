/**
 * NETFLOW Browser V2 — Android Chromium-based WebView Architecture Foundation
 *
 * This module establishes the structural contract, settings configuration,
 * Javascript bridge interface, download listeners, and navigation callbacks
 * for running NETFLOW on Android devices via Chromium-powered Android WebView
 * (android.webkit.WebView / WebViewClient / WebChromeClient).
 *
 * Design Goals:
 * 1. Chromium-based Android WebView compatibility contract
 * 2. Safe bidirectional JavaScript Interface bridging (@JavascriptInterface)
 * 3. Page navigation callbacks (shouldOverrideUrlLoading, onPageStarted, onPageFinished, onReceivedError)
 * 4. Safe cookie/session continuity with android.webkit.CookieManager
 * 5. Safe download handling with android.webkit.DownloadListener integration
 * 6. Zero regression to existing web proxy, tab isolation, or desktop/mobile web mode.
 */

export interface AndroidWebViewSettings {
  /** Enables JavaScript execution inside Chromium engine */
  javaScriptEnabled: boolean;
  /** Enables DOM storage (localStorage / sessionStorage) */
  domStorageEnabled: boolean;
  /** Enables database storage API */
  databaseEnabled: boolean;
  /** Disable file scheme access to prevent local file leaks */
  allowFileAccess: boolean;
  /** Disable content scheme access to prevent content provider leaks */
  allowContentAccess: boolean;
  /** Disable file-cross-origin access */
  allowFileAccessFromFileURLs: boolean;
  allowUniversalAccessFromFileURLs: boolean;
  /** Cache mode: LOAD_DEFAULT (respects headers & network state) */
  cacheMode: "LOAD_DEFAULT" | "LOAD_CACHE_ELSE_NETWORK" | "LOAD_NO_CACHE";
  /** Block mixed HTTP content inside HTTPS pages */
  mixedContentMode: "MIXED_CONTENT_NEVER_ALLOW" | "MIXED_CONTENT_COMPATIBILITY_MODE";
  /** Viewport / responsiveness settings */
  useWideViewPort: boolean;
  loadWithOverviewMode: boolean;
  builtInZoomControls: boolean;
  displayZoomControls: boolean;
  /** Custom Chromium User-Agent identifier */
  userAgentString: string;
}

export interface AndroidWebNavigationCallbacks {
  /** Equivalent to WebViewClient.shouldOverrideUrlLoading */
  shouldOverrideUrlLoading: (url: string) => boolean;
  /** Equivalent to WebViewClient.onPageStarted */
  onPageStarted: (url: string) => void;
  /** Equivalent to WebViewClient.onPageFinished */
  onPageFinished: (url: string) => void;
  /** Equivalent to WebViewClient.onReceivedError */
  onReceivedError: (errorCode: number, description: string, failingUrl: string) => void;
  /** Equivalent to WebChromeClient.onProgressChanged */
  onProgressChanged: (newProgress: number) => void;
  /** Equivalent to WebChromeClient.onReceivedTitle */
  onReceivedTitle: (title: string) => void;
  /** Equivalent to DownloadListener.onDownloadStart */
  onDownloadStart: (
    url: string,
    userAgent: string,
    contentDisposition: string,
    mimeType: string,
    contentLength: number
  ) => void;
}

export interface AndroidNativeBridge {
  /** Check if running inside actual Android WebView with injected bridge */
  isNativeAvailable: boolean;
  /** Platform identifier */
  platform: "android_webview" | "web_environment";
  /** Chromium WebView engine version if reported */
  chromiumVersion?: string;
  /** Post message to native host (window.NetflowNativeBridge.postMessage) */
  postMessage: (action: string, payload?: Record<string, any>) => void;
}

/**
 * Standard secure configuration for Android WebView in NETFLOW Browser V2
 */
export const DEFAULT_ANDROID_WEBVIEW_SETTINGS: AndroidWebViewSettings = {
  javaScriptEnabled: true,
  domStorageEnabled: true,
  databaseEnabled: true,
  allowFileAccess: false, // Security: Reject file:// access
  allowContentAccess: false, // Security: Reject content:// access
  allowFileAccessFromFileURLs: false, // Security: Reject file origin reflection
  allowUniversalAccessFromFileURLs: false, // Security: Reject universal origin access
  cacheMode: "LOAD_DEFAULT",
  mixedContentMode: "MIXED_CONTENT_NEVER_ALLOW", // Security: Block mixed content
  useWideViewPort: true,
  loadWithOverviewMode: true,
  builtInZoomControls: true,
  displayZoomControls: false,
  userAgentString:
    "Mozilla/5.0 (Linux; Android 14; Mobile; NETFLOW/2.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
};

/**
 * Inspects the current runtime environment to determine if a native Android
 * Chromium WebView bridge has been injected by the Android host activity.
 */
export function detectAndroidWebViewEnvironment(): AndroidNativeBridge {
  if (typeof window !== "undefined") {
    const win = window as any;
    const isAndroid = typeof navigator !== "undefined" && Boolean(navigator?.userAgent) && /Android/i.test(navigator.userAgent);
    const hasCapacitor = Boolean(win.Capacitor);
    const hasNetflowBridge = Boolean(win.NetflowNativeBridge || win.AndroidBridge);
    const isCapacitorScheme = win.location?.protocol === "capacitor:";
    const isLocalhostOnAndroid = isAndroid && win.location?.hostname === "localhost";

    if (hasNetflowBridge || hasCapacitor || isCapacitorScheme || isLocalhostOnAndroid) {
      return {
        isNativeAvailable: true,
        platform: "android_webview",
        chromiumVersion:
          win.NetflowNativeBridge?.getChromiumVersion
            ? win.NetflowNativeBridge.getChromiumVersion()
            : "Chromium Embedded",
        postMessage: (action: string, payload?: Record<string, any>) => {
          try {
            const bridgeObj = win.NetflowNativeBridge || win.AndroidBridge;
            if (bridgeObj?.onNativeAction) {
              bridgeObj.onNativeAction(JSON.stringify({ action, ...payload }));
            } else if (bridgeObj?.postMessage) {
              bridgeObj.postMessage(JSON.stringify({ action, ...payload }));
            } else if (win?.Capacitor?.Plugins?.NetflowBrowserEngine?.dispatchAction) {
              win.Capacitor.Plugins.NetflowBrowserEngine.dispatchAction({ action, ...payload });
            }
          } catch (e) {
            console.warn("[NETFLOW Android WebView] Failed to post message to host:", e);
          }
        },
      };
    }
  }

  return {
    isNativeAvailable: false,
    platform: "web_environment",
    postMessage: (_action: string, _payload?: Record<string, any>) => {
      // In web environment, safe no-op
    },
  };
}
