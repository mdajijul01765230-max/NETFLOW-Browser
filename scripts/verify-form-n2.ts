/**
 * Verification Script for FORM-N2 — Native WebView Core Browser Engine Implementation
 *
 * Verifies:
 * 1. Execution path: NETFLOW UI Shell -> Native Browser Engine -> Android Chromium WebView -> Website
 * 2. /api/browse is NEVER the primary engine in full browsing mode on Native Android
 * 3. Per-tab native WebView ownership, lifecycle, WebSettings, WebViewClient, WebChromeClient,
 *    DownloadListener, RenderProcessGone recovery, NetworkCallback, and OAuth fallback
 * 4. Bidirectional TypeScript <-> Native Android bridge & controller behavior
 * 5. UI Shell integration in src/App.tsx and src/components/WebRenderer.tsx
 */

import fs from "node:fs";
import path from "node:path";
import {
  createNativeBrowserEngine,
  resolveBrowserExecutionEngine,
  NativeEngineEventPayload,
} from "../src/services/nativeBrowserEngine";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log("=== FORM-N2: Native WebView Core Browser Engine Verification ===\n");

// 1. Verify Execution Engine Routing Policy
console.log("1. Browser Execution Engine Routing Policy (/api/browse vs Android System WebView)");
{
  const fullNative = resolveBrowserExecutionEngine("full", true);
  assert(
    fullNative === "native_chromium_webview",
    "Normal browsing ('full') on Android uses 'native_chromium_webview' directly without /api/browse"
  );

  const fullWebFallback = resolveBrowserExecutionEngine("full", false);
  assert(
    fullWebFallback === "proxy_fallback",
    "When Android native bridge is absent (web preview), 'full' falls back safely to 'proxy_fallback'"
  );

  const smartCompressNative = resolveBrowserExecutionEngine("smart-compress", true);
  assert(
    smartCompressNative === "native_chromium_webview",
    "Form 54: On Native Android, smart-compress mode uses native_chromium_webview to prevent ERR_CONNECTION_FAILED localhost proxy errors"
  );

  const textOnlyNative = resolveBrowserExecutionEngine("text-only", true);
  assert(
    textOnlyNative === "native_chromium_webview",
    "Form 54: On Native Android, text-only mode uses native_chromium_webview to prevent ERR_CONNECTION_FAILED localhost proxy errors"
  );

  const readerNative = resolveBrowserExecutionEngine("reader", true);
  assert(
    readerNative === "native_chromium_webview",
    "Form 54: On Native Android, reader mode uses native_chromium_webview to prevent ERR_CONNECTION_FAILED localhost proxy errors"
  );
}

// 2. Verify Native Android Java Source Implementation
console.log("\n2. Native Android Java Implementation (NetflowWebViewEngine, NetflowBrowserPlugin, MainActivity)");
{
  const engineJavaPath = path.resolve(
    process.cwd(),
    "android/app/src/main/java/com/netflow/browser/NetflowWebViewEngine.java"
  );
  const pluginJavaPath = path.resolve(
    process.cwd(),
    "android/app/src/main/java/com/netflow/browser/NetflowBrowserPlugin.java"
  );
  const mainActivityPath = path.resolve(
    process.cwd(),
    "android/app/src/main/java/com/netflow/browser/MainActivity.java"
  );
  const layoutXmlPath = path.resolve(
    process.cwd(),
    "android/app/src/main/res/layout/activity_main.xml"
  );

  assert(fs.existsSync(engineJavaPath), "NetflowWebViewEngine.java exists");
  assert(fs.existsSync(pluginJavaPath), "NetflowBrowserPlugin.java exists");
  assert(fs.existsSync(mainActivityPath), "MainActivity.java exists");
  assert(fs.existsSync(layoutXmlPath), "activity_main.xml exists");

  const engineJava = fs.readFileSync(engineJavaPath, "utf-8");
  const pluginJava = fs.readFileSync(pluginJavaPath, "utf-8");
  const mainActivityJava = fs.readFileSync(mainActivityPath, "utf-8");
  const layoutXml = fs.readFileSync(layoutXmlPath, "utf-8");

  // Check core Android Chromium WebView imports and classes
  assert(
    engineJava.includes("import android.webkit.WebView;") &&
      engineJava.includes("import android.webkit.WebViewClient;") &&
      engineJava.includes("import android.webkit.WebChromeClient;") &&
      engineJava.includes("import android.webkit.DownloadListener;"),
    "NetflowWebViewEngine imports real android.webkit.WebView, WebViewClient, WebChromeClient, and DownloadListener"
  );

  assert(
    engineJava.includes("Map<String, TabWebViewHolder> tabHolders") &&
      engineJava.includes("new WebView(activity)"),
    "NetflowWebViewEngine maintains per-tab native WebView ownership (TabWebViewHolder map)"
  );

  assert(
    engineJava.includes("settings.setAllowFileAccess(false)") &&
      engineJava.includes("settings.setAllowContentAccess(false)") &&
      engineJava.includes("WebSettings.MIXED_CONTENT_NEVER_ALLOW") &&
      engineJava.includes("settings.setDomStorageEnabled(true)") &&
      engineJava.includes("settings.setSupportMultipleWindows(true)"),
    "NetflowWebViewEngine configures hardened Chromium WebSettings (file/content access disabled, mixed content blocked, DOM storage & multi-window enabled)"
  );

  assert(
    engineJava.includes("shouldOverrideUrlLoading") &&
      engineJava.includes("onPageStarted") &&
      engineJava.includes("onPageFinished") &&
      engineJava.includes("super.doUpdateVisitedHistory(view, url, isReload)") &&
      !engineJava.includes("super.onUpdateVisitedHistory") &&
      engineJava.includes("onReceivedError") &&
      engineJava.includes("onReceivedHttpError") &&
      engineJava.includes("onReceivedSslError") &&
      engineJava.includes("handler.cancel()") &&
      engineJava.includes("@RequiresApi(Build.VERSION_CODES.O)") &&
      engineJava.includes("onRenderProcessGone"),
    "NetflowWebViewClient implements full navigation, super.doUpdateVisitedHistory, error, SSL cancel, and @RequiresApi(O) onRenderProcessGone"
  );

  assert(
    engineJava.includes("DisplayMetrics metrics = activity.getResources().getDisplayMetrics()") &&
      engineJava.includes("shellWebView.getLocationInWindow") &&
      engineJava.includes("recoverCrashedTabOnShowOnUiThread") &&
      engineJava.includes('"POST".equalsIgnoreCase(holder.lastHttpMethod)') &&
      !engineJava.includes("removeSessionCookies(null)"),
    "NetflowWebViewEngine converts CSS px via DisplayMetrics.density + shell offset, recovers crashed tabs once on show (never reloading POST), and does not call process-wide removeSessionCookies(null)"
  );

  assert(
    engineJava.includes("onReceivedTitle") &&
      engineJava.includes("onProgressChanged") &&
      engineJava.includes("onCreateWindow") &&
      engineJava.includes("onCloseWindow") &&
      engineJava.includes("onShowCustomView") &&
      engineJava.includes("onHideCustomView") &&
      engineJava.includes("onPermissionRequest") &&
      engineJava.includes("onGeolocationPermissionsShowPrompt") &&
      engineJava.includes("onShowFileChooser"),
    "NetflowWebChromeClient implements title, progress, popup windows, fullscreen custom view, permissions, and file chooser"
  );

  assert(
    engineJava.includes("ConnectivityManager.NetworkCallback") &&
      engineJava.includes("registerDefaultNetworkCallback"),
    "NetflowWebViewEngine integrates Android ConnectivityManager.NetworkCallback"
  );

  assert(
    pluginJava.includes('@CapacitorPlugin(name = "NetflowBrowserEngine")') &&
      pluginJava.includes("@JavascriptInterface") &&
      pluginJava.includes("NetflowNativeBridge") &&
      pluginJava.includes("handleOnDestroy") &&
      pluginJava.includes("clearStaticReferences"),
    "NetflowBrowserPlugin exposes CapacitorPlugin and JavascriptInterface ('NetflowNativeBridge') and clears static references on destroy"
  );

  assert(
    mainActivityJava.includes("registerPlugin(NetflowBrowserPlugin.class)") &&
      mainActivityJava.includes("new NetflowWebViewEngine") &&
      mainActivityJava.includes("setupNativeBrowserContainers()") &&
      mainActivityJava.includes("browserEngine.onHostResume()") &&
      mainActivityJava.includes("browserEngine.onHostPause()") &&
      mainActivityJava.includes("browserEngine.onHostDestroy()") &&
      mainActivityJava.includes("NetflowBrowserPlugin.clearStaticReferences"),
    "MainActivity wires NetflowBrowserPlugin, creates programmatic overlay containers, forwards host lifecycle events, and clears static plugin references in onDestroy"
  );

  assert(
    layoutXml.includes('android:id="@+id/netflow_overlay_host"') &&
      layoutXml.includes('android:id="@+id/netflow_webview_container"') &&
      layoutXml.includes('android:id="@+id/netflow_fullscreen_container"'),
    "activity_main.xml defines FrameLayout netflow_overlay_host containing netflow_webview_container and netflow_fullscreen_container"
  );
}

// 3. Verify TypeScript <-> Native Bridge & Controller Behavior
console.log("\n3. TypeScript <-> Native Android Bridge & Per-Tab Controller Verification");
{
  const commandsSent: Array<{ action: string; payload: Record<string, any> }> = [];
  let pageStartedEvents = 0;
  let pageFinishedEvents = 0;
  let popupSpawnedUrl = "";
  let downloadStartedUrl = "";
  let externalAuthUrl = "";
  let errorCapturedCode = "";
  let findMatchesCount = 0;
  let permissionModalResource = "";
  let httpAuthModalHost = "";
  let jsDialogType = "";
  let networkTransportSeen = "";
  let subresourceCountSeen = 0;
  let subresourceCodeSeen: number | string = "";
  let interactiveCapSeen: boolean = false;

  // Attach mock native bridge to globalThis.window
  const g = globalThis as any;
  const prevWindow = g.window;
  g.window = {
    ...(prevWindow || {}),
    NetflowNativeBridge: {
      getChromiumVersion: () => "124.0.6367.82",
      postMessage: (jsonStr: string) => {
        const parsed = JSON.parse(jsonStr);
        commandsSent.push({ action: parsed.action, payload: parsed.payload || parsed });
      },
    },
  };

  let fakeNow = 1000;
  const timers = new Map<number, { fn: () => void; runAt: number }>();
  let nextTimerId = 1;
  const advanceClock = (ms: number) => {
    fakeNow += ms;
    for (const [id, t] of Array.from(timers.entries())) {
      if (t.runAt <= fakeNow) {
        timers.delete(id);
        t.fn();
      }
    }
  };

  const engine = createNativeBrowserEngine({
    clock: {
      now: () => fakeNow,
      setTimeout: (fn, ms) => {
        const id = nextTimerId++;
        timers.set(id, { fn, runAt: fakeNow + ms });
        return id;
      },
      clearTimeout: (id) => {
        timers.delete(id as number);
      },
    },
    onPageStarted: () => {
      pageStartedEvents++;
    },
    onPageFinished: () => {
      pageFinishedEvents++;
    },
    onCreateWindow: (_opener, url) => {
      popupSpawnedUrl = url;
    },
    onDownloadStart: (_tabId, dl) => {
      downloadStartedUrl = dl.url;
    },
    onExternalAuthRequired: (_tabId, url) => {
      externalAuthUrl = url;
    },
    onError: (_tabId, err) => {
      errorCapturedCode = err.errorCode;
    },
    onFindResult: (_tabId, _ord, count) => {
      findMatchesCount = count;
    },
    getSiteOverrides: () => ({
      "example.com": {
        domain: "example.com",
        javascript: "allow",
        popups: "allow",
        geolocation: "ask",
        notifications: "ask",
        camera: "ask",
        microphone: "ask",
        updatedAt: Date.now(),
      },
    }),
    onPermissionAskPrompt: (prompt) => {
      permissionModalResource = prompt.askResources.join(",");
      engine.resolvePermission({ requestId: prompt.requestId, grantedResources: ["camera"] });
    },
    onHttpAuthRequested: (auth) => {
      httpAuthModalHost = auth.host;
      engine.resolveHttpAuth({ requestId: auth.requestId, proceed: false });
    },
    onJsDialogRequested: (dialog) => {
      jsDialogType = dialog.type;
      engine.resolveJsDialog({ requestId: dialog.requestId, confirmed: true });
    },
    onNetworkStateChanged: (state) => {
      networkTransportSeen = state.transport;
    },
    onSubresourceError: (_tabId, _failingUrl, errCode, _state, count) => {
      subresourceCodeSeen = errCode;
      subresourceCountSeen = count || 0;
    },
    onCapabilitiesChanged: (caps) => {
      interactiveCapSeen = caps.interactiveCallbacks;
    },
  });

  assert(engine.isNativeEngineAvailable() === true, "Engine detects active NetflowNativeBridge");
  assert(
    engine.getChromiumEngineVersion() === "124.0.6367.82",
    "Engine queries native Chromium version from Android WebViewPackage"
  );
  assert(
    engine.shouldUseNativeWebView("full") === true &&
      engine.shouldUseNativeWebView("smart-compress") === true &&
      engine.shouldUseNativeWebView("text-only") === true &&
      engine.shouldUseNativeWebView("reader") === true,
    "Form 54: Engine routes all browsing modes to native Android WebView to avoid localhost proxy errors"
  );

  // Create and select tab
  engine.createOrUpdateTab("tab-1", { isPrivate: false, siteMode: "default", zoomLevel: 100 });
  engine.selectTab("tab-1", false);
  assert(
    commandsSent.some((c) => c.action === "SELECT_TAB" && c.payload.tabId === "tab-1"),
    "selectTab dispatches SELECT_TAB to native Android engine"
  );

  // Safe URL load
  const loadRes = engine.loadUrl("tab-1", "https://example.com/app", {
    isPrivate: false,
    siteMode: "desktop",
    zoomLevel: 125,
  });
  assert(
    loadRes.dispatched === true &&
      commandsSent.some(
        (c) =>
          c.action === "LOAD_URL" &&
          c.payload.tabId === "tab-1" &&
          c.payload.url === "https://example.com/app"
      ),
    "loadUrl dispatches LOAD_URL command to native Android WebView"
  );

  // Unsafe scheme blocked before reaching native WebView
  const unsafeRes = engine.loadUrl("tab-1", "javascript:alert(1)");
  assert(
    unsafeRes.dispatched === false && Boolean(errorCapturedCode),
    "Unsafe javascript: URL is blocked before reaching native WebView"
  );

  // Google OAuth URL intercepted for external browser fallback
  const oauthRes = engine.loadUrl(
    "tab-1",
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=123"
  );
  assert(
    oauthRes.dispatched === false &&
      externalAuthUrl.includes("accounts.google.com"),
    "Google OAuth URL is intercepted for safe external-browser fallback"
  );

  // Simulate Native -> TS callbacks via engine.handleNativeEngineEvent
  const emitNative = (ev: NativeEngineEventPayload) => {
    engine.handleNativeEngineEvent(ev);
  };

  emitNative({
    eventType: "onPageStarted",
    tabId: "tab-1",
    url: "https://example.com/app",
    canGoBack: false,
    canGoForward: false,
  });
  emitNative({
    eventType: "onPageFinished",
    tabId: "tab-1",
    url: "https://example.com/app",
    title: "Example SPA",
    canGoBack: true,
    canGoForward: false,
    historyIndex: 1,
    historyUrls: ["https://example.com", "https://example.com/app"],
  });

  const tabState = engine.getTabState("tab-1");
  assert(
    pageStartedEvents === 1 &&
      pageFinishedEvents === 1 &&
      tabState?.title === "Example SPA" &&
      tabState?.canGoBack === true &&
      tabState?.historyUrls.length === 2,
    "Native onPageStarted and onPageFinished events synchronize tab history, title, and navigation state"
  );

  // Simulate popup creation, download start, find result, and render process crash recovery
  emitNative({
    eventType: "onCreateWindow",
    openerTabId: "tab-1",
    targetUrl: "https://example.com/popup",
    isDialog: false,
    isUserGesture: true,
  });
  assert(
    popupSpawnedUrl === "https://example.com/popup",
    "Native onCreateWindow event spawns new popup tab via UI callback"
  );

  emitNative({
    eventType: "onDownloadStart",
    tabId: "tab-1",
    url: "https://example.com/archive.zip",
    userAgent: "Mozilla/5.0",
    contentDisposition: 'attachment; filename="archive.zip"',
    mimeType: "application/zip",
    contentLength: 20480,
  });
  assert(
    downloadStartedUrl === "https://example.com/archive.zip",
    "Native onDownloadStart event routes file download to NETFLOW Download Manager"
  );

  emitNative({
    eventType: "onFindResultReceived",
    tabId: "tab-1",
    activeMatchOrdinal: 1,
    numberOfMatches: 5,
    isDoneCounting: true,
  });
  assert(findMatchesCount === 5, "Native onFindResultReceived event updates Find-in-Page match counter");

  const currentEpoch = engine.getTabState("tab-1")?.requestEpoch ?? 4;
  emitNative({
    eventType: "onCapabilities",
    tabId: "tab-1",
    requestId: "cap-req-1",
    epoch: currentEpoch,
    ts: Date.now(),
    isMainFrame: true,
    origin: "https://example.com",
    lightMode: true,
    subresourceIntercept: true,
    privateIsolation: false,
    interactiveCallbacks: true,
  });
  emitNative({
    eventType: "onPermissionRequested",
    tabId: "tab-1",
    requestId: "perm-req-1",
    epoch: currentEpoch,
    ts: Date.now(),
    isMainFrame: true,
    origin: "https://example.com",
    resources: ["camera"],
  });
  emitNative({
    eventType: "onHttpAuthRequested",
    tabId: "tab-1",
    requestId: "auth-req-1",
    epoch: currentEpoch,
    ts: Date.now(),
    isMainFrame: true,
    origin: "https://example.com",
    host: "example.com",
    realm: "Restricted",
  });
  emitNative({
    eventType: "onJsDialog",
    tabId: "tab-1",
    requestId: "js-req-1",
    epoch: currentEpoch,
    ts: Date.now(),
    isMainFrame: true,
    origin: "https://example.com",
    type: "confirm",
    message: "Proceed?",
    defaultValue: "",
  });
  emitNative({
    eventType: "onNetworkStateChanged",
    tabId: "tab-1",
    requestId: "net-req-1",
    epoch: currentEpoch,
    ts: Date.now(),
    isMainFrame: true,
    origin: "https://example.com",
    validated: true,
    metered: false,
    transport: "wifi",
    downKbps: 25000,
    upKbps: 10000,
  });
  advanceClock(200);
  emitNative({
    eventType: "onSubresourceError",
    tabId: "tab-1",
    requestId: "sub-req-1",
    epoch: currentEpoch,
    ts: Date.now(),
    isMainFrame: false,
    origin: "https://example.com",
    count: 2,
    sampleCode: "LIGHT_MODE_TRACKER_BLOCKED",
  });
  assert(
    Boolean(interactiveCapSeen) &&
      permissionModalResource === "camera" &&
      httpAuthModalHost === "example.com" &&
      jsDialogType === "confirm" &&
      networkTransportSeen === "wifi" &&
      subresourceCountSeen === 2 &&
      subresourceCodeSeen === "LIGHT_MODE_TRACKER_BLOCKED" &&
      commandsSent.some((c) => c.action === "resolvePermission") &&
      commandsSent.some((c) => c.action === "resolveHttpAuth") &&
      commandsSent.some((c) => c.action === "resolveJsDialog"),
    "Native interactive contract events (onCapabilities, onPermissionRequested, onHttpAuthRequested, onJsDialog, onNetworkStateChanged, onSubresourceError) round-trip cleanly"
  );

  emitNative({
    eventType: "onRenderProcessGone",
    tabId: "tab-1",
    didCrash: true,
    failingUrl: "https://example.com/app",
  });
  assert(
    engine.getTabState("tab-1")?.renderProcessGone === true &&
      errorCapturedCode === "ERR_RENDER_PROCESS_GONE",
    "Native onRenderProcessGone event marks crashed state and surfaces recovery UI without crashing host"
  );

  // Close tab
  engine.closeTab("tab-1");
  assert(
    engine.getTabState("tab-1") === undefined &&
      commandsSent.some((c) => c.action === "CLOSE_TAB" && c.payload.tabId === "tab-1"),
    "closeTab destroys native WebView instance and cleans up controller state"
  );

  // Form 54: On native Android, native WebView is forced to avoid ERR_CONNECTION_FAILED proxy errors
  assert(
    engine.isPrivateIsolationSupported() === false &&
      engine.shouldUseNativeWebView("full", true) === true,
    "Form 54: On native Android, shouldUseNativeWebView returns true for all tabs to avoid localhost proxy errors"
  );

  const privFallbackLoad = engine.loadUrl("priv-fallback-1", "https://example.com/private", {
    isPrivate: true,
    siteMode: "default",
    zoomLevel: 100,
  });
  assert(
    privFallbackLoad.dispatched === false &&
      privFallbackLoad.engine === "proxy_fallback" &&
      !commandsSent.some(
        (c) => c.action === "LOAD_URL" && c.payload.tabId === "priv-fallback-1"
      ),
    "When privateIsolation is false, loadUrl on a private tab stays on proxy_fallback and never dispatches native LOAD_URL"
  );

  emitNative({
    eventType: "onCapabilities",
    tabId: "tab-1",
    requestId: "cap-priv-iso-1",
    epoch: 1,
    ts: Date.now(),
    isMainFrame: true,
    origin: "https://example.com",
    lightMode: true,
    subresourceIntercept: true,
    privateIsolation: true,
    interactiveCallbacks: true,
  });

  assert(
    engine.isPrivateIsolationSupported() === true &&
      engine.shouldUseNativeWebView("full", true) === true &&
      engine.shouldUseNativeWebView("smart-compress", true) === true,
    "Form 54: When onCapabilities.privateIsolation is true, shouldUseNativeWebView returns true for all modes"
  );

  engine.createOrUpdateTab("priv-native-1", {
    isPrivate: true,
    siteMode: "default",
    zoomLevel: 100,
  });
  engine.selectTab("priv-native-1", true);
  const privNativeLoad = engine.loadUrl("priv-native-1", "https://example.com/secret", {
    isPrivate: true,
    siteMode: "default",
    zoomLevel: 100,
  });
  assert(
    privNativeLoad.dispatched === true &&
      privNativeLoad.engine === "native_chromium_webview" &&
      commandsSent.some(
        (c) =>
          c.action === "CREATE_OR_UPDATE_TAB" &&
          c.payload.tabId === "priv-native-1" &&
          c.payload.isPrivate === true
      ) &&
      commandsSent.some(
        (c) =>
          c.action === "LOAD_URL" &&
          c.payload.tabId === "priv-native-1" &&
          c.payload.isPrivate === true &&
          c.payload.url === "https://example.com/secret"
      ),
    "When onCapabilities.privateIsolation is true, private tabs dispatch native CREATE_OR_UPDATE_TAB and LOAD_URL with isPrivate=true"
  );

  engine.closeTab("priv-native-1");
  assert(
    commandsSent.some((c) => c.action === "CLOSE_TAB" && c.payload.tabId === "priv-native-1"),
    "Closing a native isolated private tab dispatches CLOSE_TAB so native engine can delete private profile when last private tab closes"
  );

  engine.destroy();
  g.window = prevWindow;
}

// 4. Verify UI Shell & WebRenderer Wiring
console.log("\n4. UI Shell & WebRenderer Wiring (src/App.tsx & src/components/WebRenderer.tsx)");
{
  const appTsx = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");
  const webRendererTsx = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/WebRenderer.tsx"),
    "utf-8"
  );

  assert(
    appTsx.includes("nativeBrowserEngineRef.current?.shouldUseNativeWebView(") &&
      appTsx.includes("nativeBrowserEngineRef.current.loadUrl("),
    "src/App.tsx routes normal browsing through NativeBrowserEngine.loadUrl before /api/browse"
  );

  assert(
    webRendererTsx.includes('id="netflow-android-native-webview-surface"') &&
      webRendererTsx.includes("onSyncNativeViewportBounds"),
    "src/components/WebRenderer.tsx renders #netflow-android-native-webview-surface and synchronizes viewport bounds with native Android WebView"
  );
}

console.log(`\n=== FORM-N2 Verification Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
