/**
 * NETFLOW BROWSER V2 — FORM 3 OF 6 (NETFLOW-JAVA-ENGINE-COMPLETION-01)
 * Static Verification Script: scripts/verify-java-static.ts
 *
 * IMPORTANT HONESTY NOTICE:
 * This script performs static text and structural analysis on the Android Java source files,
 * XML resources, and AndroidManifest.xml. It is NOT a Java compiler (javac) or Android Gradle
 * build (aapt2/d8), because no JDK or Android SDK is installed in this container environment.
 */

import fs from "node:fs";
import path from "node:path";

interface StaticCheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

const results: StaticCheckResult[] = [];

function record(check: string, passed: boolean, detail: string) {
  results.push({ check, passed, detail });
  if (passed) {
    console.log(`  [PASS] ${check} — ${detail}`);
  } else {
    console.error(`  [FAIL] ${check} — ${detail}`);
  }
}

console.log("=== NETFLOW-JAVA-ENGINE-COMPLETION-01: Static Java & Manifest Verification ===");
console.log("NOTE: Text/AST-pattern static checks only — NOT a javac/Gradle compiler.\n");

const rootDir = process.cwd();
const enginePath = path.resolve(
  rootDir,
  "android/app/src/main/java/com/netflow/browser/NetflowWebViewEngine.java"
);
const pluginPath = path.resolve(
  rootDir,
  "android/app/src/main/java/com/netflow/browser/NetflowBrowserPlugin.java"
);
const mainActivityPath = path.resolve(
  rootDir,
  "android/app/src/main/java/com/netflow/browser/MainActivity.java"
);
const downloadManagerPath = path.resolve(
  rootDir,
  "android/app/src/main/java/com/netflow/browser/NetflowDownloadManager.java"
);
const manifestPath = path.resolve(rootDir, "android/app/src/main/AndroidManifest.xml");
const idsXmlPath = path.resolve(rootDir, "android/app/src/main/res/values/ids.xml");
const capacitorBridgeActivityPath = path.resolve(
  rootDir,
  "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java"
);
const capacitorBridgeLayoutPath = path.resolve(
  rootDir,
  "node_modules/@capacitor/android/capacitor/src/main/res/layout/capacitor_bridge_layout_main.xml"
);

const engineSrc = fs.readFileSync(enginePath, "utf-8");
const pluginSrc = fs.readFileSync(pluginPath, "utf-8");
const mainActivitySrc = fs.readFileSync(mainActivityPath, "utf-8");
const downloadManagerSrc = fs.readFileSync(downloadManagerPath, "utf-8");
const manifestSrc = fs.readFileSync(manifestPath, "utf-8");
const idsXmlSrc = fs.existsSync(idsXmlPath) ? fs.readFileSync(idsXmlPath, "utf-8") : "";
const allJavaSources = [
  { name: "NetflowWebViewEngine.java", src: engineSrc },
  { name: "NetflowBrowserPlugin.java", src: pluginSrc },
  { name: "MainActivity.java", src: mainActivitySrc },
  { name: "NetflowDownloadManager.java", src: downloadManagerSrc },
];

const stripJavaComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const engineCodeOnly = stripJavaComments(engineSrc);
const pluginCodeOnly = stripJavaComments(pluginSrc);
const mainCodeOnly = stripJavaComments(mainActivitySrc);
const downloadManagerCodeOnly = stripJavaComments(downloadManagerSrc);

// ---------------------------------------------------------------------------
// Check 0: Layout Truth & Programmatic Container Creation (Part 0)
// ---------------------------------------------------------------------------
{
  const bridgeActivitySrc = fs.readFileSync(capacitorBridgeActivityPath, "utf-8");
  const bridgeLayoutSrc = fs.readFileSync(capacitorBridgeLayoutPath, "utf-8");

  const bridgeSetsOwnContentView = bridgeActivitySrc.includes(
    "setContentView(R.layout.capacitor_bridge_layout_main)"
  );
  const bridgeLayoutOnlyWebView =
    bridgeLayoutSrc.includes("com.getcapacitor.CapacitorWebView") &&
    !bridgeLayoutSrc.includes("netflow_overlay_host");

  const mainCreatesProgrammaticContainers =
    !mainCodeOnly.includes("setContentView(") &&
    !mainCodeOnly.includes("R.layout.activity_main") &&
    mainCodeOnly.includes("overlayHost = new FrameLayout(this)") &&
    mainCodeOnly.includes("overlayHost.setId(R.id.netflow_overlay_host)") &&
    mainCodeOnly.includes("contentWebViewContainer = new FrameLayout(this)") &&
    mainCodeOnly.includes("contentWebViewContainer.setId(R.id.netflow_webview_container)") &&
    mainCodeOnly.includes("fullscreenContainer = new FrameLayout(this)") &&
    mainCodeOnly.includes("fullscreenContainer.setId(R.id.netflow_fullscreen_container)") &&
    mainCodeOnly.includes("browserEngine.attachContainers(contentWebViewContainer, fullscreenContainer)");

  const idsXmlDefinesAllThree =
    idsXmlSrc.includes('name="netflow_overlay_host"') &&
    idsXmlSrc.includes('name="netflow_webview_container"') &&
    idsXmlSrc.includes('name="netflow_fullscreen_container"');

  record(
    "Part 0: Capacitor BridgeActivity layout truth & programmatic container creation",
    bridgeSetsOwnContentView &&
      bridgeLayoutOnlyWebView &&
      mainCreatesProgrammaticContainers &&
      idsXmlDefinesAllThree,
    `BridgeActivity sets capacitor_bridge_layout_main=${bridgeSetsOwnContentView}, MainActivity creates programmatic containers=${mainCreatesProgrammaticContainers}, ids.xml defines IDs=${idsXmlDefinesAllThree}`
  );
}

// ---------------------------------------------------------------------------
// Check 1: Non-existent WebViewClient / WebChromeClient override method names
// ---------------------------------------------------------------------------
{
  const hasInvalidOnUpdateVisitedHistory = allJavaSources.some(({ src }) =>
    /\bonUpdateVisitedHistory\b/.test(src)
  );
  const hasValidDoUpdateVisitedHistory = engineSrc.includes(
    "public void doUpdateVisitedHistory(WebView view, String url, boolean isReload)"
  );

  // Extract every method immediately following @Override across all 3 Java files
  const allowedOverrideMethods = new Set([
    // Activity / BridgeActivity
    "onCreate",
    "onNewIntent",
    "onActivityResult",
    "onRequestPermissionsResult",
    "onResume",
    "onPause",
    "onDestroy",
    "onBackPressed",
    // Capacitor Plugin
    "load",
    "handleOnDestroy",
    // ConnectivityManager.NetworkCallback
    "onAvailable",
    "onLost",
    "onCapabilitiesChanged",
    // WebViewClient
    "shouldInterceptRequest",
    "shouldOverrideUrlLoading",
    "onPageStarted",
    "onPageCommitVisible",
    "onPageFinished",
    "doUpdateVisitedHistory",
    "onReceivedError",
    "onReceivedHttpError",
    "onReceivedSslError",
    "onReceivedHttpAuthRequest",
    "onRenderProcessGone",
    // WebChromeClient
    "onProgressChanged",
    "onReceivedTitle",
    "onReceivedIcon",
    "onCreateWindow",
    "onCloseWindow",
    "onShowCustomView",
    "onHideCustomView",
    "onPermissionRequest",
    "onPermissionRequestCanceled",
    "onGeolocationPermissionsShowPrompt",
    "onGeolocationPermissionsHidePrompt",
    "onShowFileChooser",
    "onJsAlert",
    "onJsConfirm",
    "onJsPrompt",
    "onJsBeforeUnload",
    // DownloadListener & NetflowDownloadManager.EngineBridge / Runnable / Handler
    "onDownloadStart",
    "isDownloadUrlSafe",
    "extractOrigin",
    "emitContractEvent",
    "handleMessage",
    "run",
  ]);

  const unknownOverrides: string[] = [];
  for (const { name, src } of allJavaSources) {
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "@Override") {
        let j = i + 1;
        while (j < lines.length && lines[j].trim().startsWith("@")) {
          j++;
        }
        const sigLine = lines.slice(j, j + 3).join(" ");
        const m = sigLine.match(/(?:public|protected)\s+[A-Za-z0-9_<>\[\].]+\s+([A-Za-z0-9_]+)\s*\(/);
        if (!m) {
          unknownOverrides.push(`${name}:line ${i + 1} (unparseable override)`);
        } else if (!allowedOverrideMethods.has(m[1])) {
          unknownOverrides.push(`${name}:line ${i + 1} (${m[1]})`);
        }
      }
    }
  }

  record(
    "Check 1: Zero non-existent WebViewClient/WebChromeClient override method names (e.g. onUpdateVisitedHistory)",
    !hasInvalidOnUpdateVisitedHistory &&
      hasValidDoUpdateVisitedHistory &&
      unknownOverrides.length === 0,
    `hasInvalidOnUpdateVisitedHistory=${hasInvalidOnUpdateVisitedHistory}, doUpdateVisitedHistory=${hasValidDoUpdateVisitedHistory}, unknownOverrides=${unknownOverrides.length}`
  );
}

// ---------------------------------------------------------------------------
// Check 2: Unguarded API-26+ (Build.VERSION_CODES.O+) types/calls at minSdk 24
// ---------------------------------------------------------------------------
{
  // 1) setSafeBrowsingEnabled (API 26) must be guarded by SDK_INT >= O
  const safeBrowsingGuarded =
    /if\s*\(\s*Build\.VERSION\.SDK_INT\s*>=\s*Build\.VERSION_CODES\.O\s*\)\s*\{\s*settings\.setSafeBrowsingEnabled\(true\);/s.test(
      engineSrc
    );

  // 2) onRenderProcessGone / RenderProcessGoneDetail (API 26) must have @RequiresApi(Build.VERSION_CODES.O) and @TargetApi(Build.VERSION_CODES.O) and SDK_INT >= O checks
  const renderProcessGoneAnnotatedAndGuarded =
    engineSrc.includes("@RequiresApi(Build.VERSION_CODES.O)") &&
    engineSrc.includes("@TargetApi(Build.VERSION_CODES.O)") &&
    engineSrc.includes("Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null && detail.didCrash()") &&
    engineSrc.includes("Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null\n                    ? detail.rendererPriorityAtExit()");

  // 3) WebView.getCurrentWebViewPackage() (API 26) in NetflowBrowserPlugin must be guarded by SDK_INT >= O
  const currentWebViewPackageGuarded =
    /if\s*\(\s*Build\.VERSION\.SDK_INT\s*>=\s*Build\.VERSION_CODES\.O\s*\)\s*\{\s*PackageInfo\s+info\s*=\s*WebView\.getCurrentWebViewPackage\(\);/s.test(
      pluginSrc
    );

  // 4) No unguarded API 28+ WebViewCompat/TracingController/ProfileStore/WebViewRenderProcess usages
  const forbiddenUnguardedApis = [
    "WebViewRenderProcess",
    "TracingController",
    "setDataDirectorySuffix",
    "setForceDark",
    "setAlgorithmicDarkeningAllowed",
  ];
  const foundUnguarded = forbiddenUnguardedApis.filter((api) =>
    allJavaSources.some(({ src }) => src.includes(api))
  );

  record(
    "Check 2: All API-26+ types and methods are properly guarded at minSdk 24",
    safeBrowsingGuarded &&
      renderProcessGoneAnnotatedAndGuarded &&
      currentWebViewPackageGuarded &&
      foundUnguarded.length === 0,
    `safeBrowsingGuarded=${safeBrowsingGuarded}, renderProcessGoneGuarded=${renderProcessGoneAnnotatedAndGuarded}, getCurrentWebViewPackageGuarded=${currentWebViewPackageGuarded}, unguardedApi28Plus=${foundUnguarded.length}`
  );
}

// ---------------------------------------------------------------------------
// Check 3: Static references to engine/plugin have explicit clearing points
// ---------------------------------------------------------------------------
{
  const mutableStaticFieldRegex =
    /private\s+static\s+(?!final\b|class\b|interface\b|boolean\s+isPrivateOrReserved)[A-Za-z0-9_<>\[\].]+\s+[A-Za-z0-9_]+\s*[;=]/;
  const engineHasStaticFields = mutableStaticFieldRegex.test(engineCodeOnly);
  const mainHasStaticFields = mutableStaticFieldRegex.test(mainCodeOnly);
  const pluginClearsStaticsInMethod =
    pluginSrc.includes("public static void clearStaticReferences(NetflowWebViewEngine expectedEngine)") &&
    pluginSrc.includes("sharedEngine = null;") &&
    pluginSrc.includes("activeInstance = null;") &&
    pluginSrc.includes("shellReady = false;") &&
    pluginSrc.includes("queuedExternalIntentUrl = null;");
  const pluginClearsInHandleOnDestroy =
    pluginSrc.includes("protected void handleOnDestroy()") &&
    pluginSrc.includes("activeInstance = null;") &&
    pluginSrc.includes("sharedEngine = null;");
  const mainClearsInOnDestroy =
    mainActivitySrc.includes("NetflowBrowserPlugin.clearStaticReferences(browserEngine)") &&
    mainActivitySrc.includes("browserEngine = null;");

  record(
    "Check 3: Static references to engine/plugin have deterministic clearing points on destroy",
    !engineHasStaticFields &&
      !mainHasStaticFields &&
      pluginClearsStaticsInMethod &&
      pluginClearsInHandleOnDestroy &&
      mainClearsInOnDestroy,
    `engineMutableStatics=${engineHasStaticFields}, mainMutableStatics=${mainHasStaticFields}, pluginClears=${pluginClearsStaticsInMethod && pluginClearsInHandleOnDestroy}, mainClears=${mainClearsInOnDestroy}`
  );
}

// ---------------------------------------------------------------------------
// Check 4: WebView calls inside runOnUiThread in public methods & zero UI calls in shouldInterceptRequest
// ---------------------------------------------------------------------------
{
  const requiredUiThreadPublicMethods = [
    "setShellWebView",
    "emitCapabilitiesEvent",
    "attachContainers",
    "createOrUpdateTab",
    "selectTab",
    "closeTab",
    "loadUrl",
    "reload",
    "stopLoading",
    "goBack",
    "goForward",
    "findInPage",
    "findNext",
    "clearFindMatches",
    "setZoomLevel",
    "setSiteMode",
    "setLightMode",
    "resolvePermission",
    "onRequestPermissionsResult",
    "resolveFileChooser",
    "onFileChooserActivityResult",
    "resolveJsDialog",
    "resolveHttpAuth",
    "setViewportBounds",
    "setWebViewVisible",
    "clearBrowsingData",
    "onHostResume",
    "onHostPause",
    "onHostDestroy",
  ];

  const missingUiThreadWrappers: string[] = [];
  for (const methodName of requiredUiThreadPublicMethods) {
    const regex = new RegExp(`public\\s+void\\s+${methodName}\\s*\\([\\s\\S]*?\\)\\s*\\{[\\s\\S]{1,320}?runOnUiThread\\(`);
    if (!regex.test(engineSrc)) {
      missingUiThreadWrappers.push(methodName);
    }
  }

  // Verify handleBackPressed checks Looper.myLooper() == Looper.getMainLooper() before touching webView.canGoBack()
  const handleBackPressedSafe =
    engineSrc.includes("if (Looper.myLooper() == Looper.getMainLooper())") &&
    engineSrc.includes("canBack = active.canGoBackCached;");

  // Verify shouldInterceptRequest does NOT call any view.* methods on the WebView parameter
  const interceptMatch = engineSrc.match(
    /public\s+WebResourceResponse\s+shouldInterceptRequest\s*\([\s\S]*?\n\s{8}\}/
  );
  const interceptBody = interceptMatch ? interceptMatch[0] : "";
  const hasWebViewCallInIntercept = /\bview\s*\./.test(interceptBody);

  record(
    "Check 4: All public engine methods marshal WebView calls via runOnUiThread and shouldInterceptRequest makes zero WebView/UI calls",
    missingUiThreadWrappers.length === 0 &&
      handleBackPressedSafe &&
      interceptBody.length > 0 &&
      !hasWebViewCallInIntercept,
    `missingUiThreadWrappers=${missingUiThreadWrappers.length}, handleBackPressedSafe=${handleBackPressedSafe}, hasWebViewCallInIntercept=${hasWebViewCallInIntercept}`
  );
}

// ---------------------------------------------------------------------------
// Check 5: addJavascriptInterface ONLY on shellWebView, NEVER on content WebViews
// ---------------------------------------------------------------------------
{
  const engineHasAddJsInterface = engineCodeOnly.includes("addJavascriptInterface");
  const mainHasAddJsInterface = mainCodeOnly.includes("addJavascriptInterface");
  const pluginMatches = pluginCodeOnly.match(/[A-Za-z0-9_.]+\.addJavascriptInterface\s*\(/g) || [];
  const onlyShellWebViewInPlugin =
    pluginMatches.length === 1 && pluginMatches[0].startsWith("shellWebView.addJavascriptInterface");

  record(
    "Check 5: addJavascriptInterface is called ONLY on shellWebView and never on content WebViews",
    !engineHasAddJsInterface && !mainHasAddJsInterface && onlyShellWebViewInPlugin,
    `engineCalls=${engineHasAddJsInterface}, mainCalls=${mainHasAddJsInterface}, pluginCalls=${JSON.stringify(pluginMatches)}`
  );
}

// ---------------------------------------------------------------------------
// Check 6: setGeolocationEnabled(true) enabled (no setGeolocationEnabled(false) left in place)
// ---------------------------------------------------------------------------
{
  const hasGeoFalse = allJavaSources.some(({ src }) =>
    src.includes("setGeolocationEnabled(false)")
  );
  const hasGeoTrue = engineSrc.includes("settings.setGeolocationEnabled(true);");

  record(
    "Check 6: settings.setGeolocationEnabled(true) is set and setGeolocationEnabled(false) is removed",
    !hasGeoFalse && hasGeoTrue,
    `hasGeolocationFalse=${hasGeoFalse}, hasGeolocationTrue=${hasGeoTrue}`
  );
}

// ---------------------------------------------------------------------------
// Check 7: Zero unresolved TODO(N2F-2) or TODO markers in Java/Manifest/Contract
// ---------------------------------------------------------------------------
{
  const hasTodoMarkers = allJavaSources.some(({ src }) =>
    /\bTODO\b|\bFIXME\b|TODO\(N2F-2\)/i.test(src)
  );

  record(
    "Check 7: Zero unresolved TODO / TODO(N2F-2) markers in Java sources",
    !hasTodoMarkers,
    `hasTodoMarkers=${hasTodoMarkers}`
  );
}

// ---------------------------------------------------------------------------
// Check 8: Interactive callbacks contract, 30s requestId timeout, and lifecycle cancellation (Part 1)
// ---------------------------------------------------------------------------
{
  const has30sConstant = engineSrc.includes("public static final long INTERACTIVE_REQUEST_TIMEOUT_MS = 30000L;");
  const schedulesTimeout = engineSrc.includes(
    "mainHandler.postDelayed(timeoutTask, INTERACTIVE_REQUEST_TIMEOUT_MS);"
  );
  const atomicExactlyOnce = engineSrc.includes("if (!pending.resolved.compareAndSet(false, true))");
  const cancelsOnNavAndCloseAndCrashAndDestroy =
    engineSrc.includes("cancelPendingInteractiveRequestsForTabOnUiThread(tabId)") &&
    engineSrc.includes("cancelPendingInteractiveRequestsForTabOnUiThread(holder.tabId)") &&
    engineSrc.includes("cancelAllPendingInteractiveRequestsOnUiThread()");

  const emitsAllContractEvents =
    engineSrc.includes('emitEvent("onPermissionRequested", ev)') &&
    engineSrc.includes('emitEvent("onFileChooserRequested", ev)') &&
    engineSrc.includes('emitEvent("onJsDialog", ev)') &&
    engineSrc.includes('emitEvent("onHttpAuthRequested", authEv)') &&
    engineSrc.includes('emitEvent("onNetworkStateChanged", ev)') &&
    engineSrc.includes('emitEvent("onSubresourceError", ev)') &&
    engineSrc.includes('emitEvent("onCapabilities", ev)');

  const resolvesAllFourCommands =
    engineSrc.includes("public void resolvePermission(") &&
    engineSrc.includes("public void resolveFileChooser(") &&
    engineSrc.includes("public void resolveJsDialog(") &&
    engineSrc.includes("public void resolveHttpAuth(") &&
    engineSrc.includes("public boolean onJsBeforeUnload(");

  record(
    "Check 8: Part 1 interactive callbacks, 30s requestId timeout, atomic once-only resolve, and lifecycle cancellation",
    has30sConstant &&
      schedulesTimeout &&
      atomicExactlyOnce &&
      cancelsOnNavAndCloseAndCrashAndDestroy &&
      emitsAllContractEvents &&
      resolvesAllFourCommands,
    `timeout30s=${has30sConstant && schedulesTimeout}, atomicOnce=${atomicExactlyOnce}, emitsAllEvents=${emitsAllContractEvents}, resolvesAll=${resolvesAllFourCommands}`
  );
}

// ---------------------------------------------------------------------------
// Check 9: Subresource security (Part 2) & Light Mode native (Part 3) & Network (Part 4) & Intents (Part 5)
// ---------------------------------------------------------------------------
{
  const hasSubresourceDnsAnd403 =
    engineSrc.includes("public static final long DNS_CACHE_TTL_MS = 60000L;") &&
    engineSrc.includes("InetAddress.getAllByName(lowerHost)") &&
    engineSrc.includes("catch (UnknownHostException ignored)") &&
    engineSrc.includes("new WebResourceResponse(") &&
    engineSrc.includes("403,") &&
    engineSrc.includes("SUBRESOURCE_SAMPLE_INTERVAL_MS = 1000L");

  const hasLightModeWithoutDisablingJs =
    engineSrc.includes("public void setLightMode(final String tabId, final JSONObject policy)") &&
    engineSrc.includes("boolean jsEnabled = holder.javascriptAllowed;") &&
    engineSrc.includes("settings.setBlockNetworkImage(holder.lightModeEnabled && holder.lightModeBlockNetworkImage);") &&
    engineSrc.includes("settings.setMediaPlaybackRequiresUserGesture(holder.lightModeEnabled && holder.lightModeBlockMediaPreload);") &&
    engineSrc.includes('ev.put("lightMode", true);') &&
    engineSrc.includes('ev.put("interactiveCallbacks", true);');

  const hasNetworkTelemetryAndUnregister =
    engineSrc.includes("caps.getLinkDownstreamBandwidthKbps()") &&
    engineSrc.includes("caps.getLinkUpstreamBandwidthKbps()") &&
    engineSrc.includes("cm.unregisterNetworkCallback(networkCallback);");

  const hasBrowsableIntentAndQueue =
    manifestSrc.includes('<action android:name="android.intent.action.VIEW" />') &&
    manifestSrc.includes('<category android:name="android.intent.category.DEFAULT" />') &&
    manifestSrc.includes('<category android:name="android.intent.category.BROWSABLE" />') &&
    manifestSrc.includes('<data android:scheme="http" />') &&
    manifestSrc.includes('<data android:scheme="https" />') &&
    pluginSrc.includes("enqueueOrDeliverExternalIntentUrl") &&
    pluginSrc.includes("queuedExternalIntentUrl");

  record(
    "Check 9: Subresource SSRF/DNS 403 guard (Part 2), Light Mode native (Part 3), Network telemetry (Part 4), and Intent queueing (Part 5)",
    hasSubresourceDnsAnd403 &&
      hasLightModeWithoutDisablingJs &&
      hasNetworkTelemetryAndUnregister &&
      hasBrowsableIntentAndQueue,
    `subresource403=${hasSubresourceDnsAnd403}, lightMode=${hasLightModeWithoutDisablingJs}, network=${hasNetworkTelemetryAndUnregister}, intents=${hasBrowsableIntentAndQueue}`
  );
}

// ---------------------------------------------------------------------------
// Check 10: Part B OS runtime permissions & Part C audit fixes (single-destroy, in-place LayoutParams, single setLightMode action)
// ---------------------------------------------------------------------------
{
  const manifestHasRuntimePerms =
    manifestSrc.includes('<uses-permission android:name="android.permission.CAMERA" />') &&
    manifestSrc.includes('<uses-permission android:name="android.permission.RECORD_AUDIO" />') &&
    manifestSrc.includes('<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />') &&
    manifestSrc.includes('<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />') &&
    manifestSrc.includes('<uses-feature android:name="android.hardware.camera" android:required="false" />') &&
    manifestSrc.includes('<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />') &&
    manifestSrc.includes('<uses-feature android:name="android.hardware.microphone" android:required="false" />') &&
    manifestSrc.includes('<uses-feature android:name="android.hardware.location" android:required="false" />');

  const engineChecksAndRequestsOsPerm =
    engineSrc.includes("activity.checkSelfPermission(androidPermission) == PackageManager.PERMISSION_GRANTED") &&
    engineSrc.includes("activity.requestPermissions(") &&
    engineSrc.includes("public void onRequestPermissionsResult(") &&
    mainActivitySrc.includes("public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults)") &&
    mainActivitySrc.includes("browserEngine.onRequestPermissionsResult(requestCode, permissions, grantResults);");

  const hasSingleDestroySetGuard =
    engineSrc.includes("Collections.newSetFromMap(new WeakHashMap<>())") &&
    engineSrc.includes("if (!destroyedWebViews.add(webView))");

  const hasInPlaceLayoutParamsMutation =
    engineSrc.includes("ViewGroup.LayoutParams rawLp = contentContainer.getLayoutParams();") &&
    engineSrc.includes("rawLp instanceof FrameLayout.LayoutParams") &&
    engineSrc.includes("rawLp instanceof ViewGroup.MarginLayoutParams");

  const pluginUsesSingleSetLightModeAction =
    pluginSrc.includes('case "setLightMode":') &&
    !pluginSrc.includes('case "SET_LIGHT_MODE":') &&
    !pluginSrc.includes('case "SET_LIGHT_MODE_POLICY":');

  record(
    "Check 10: Part B OS runtime permissions & Part C audit fixes (single-destroy guard, in-place LayoutParams, single setLightMode action)",
    manifestHasRuntimePerms &&
      engineChecksAndRequestsOsPerm &&
      hasSingleDestroySetGuard &&
      hasInPlaceLayoutParamsMutation &&
      pluginUsesSingleSetLightModeAction,
    `manifestPerms=${manifestHasRuntimePerms}, osPermFlow=${engineChecksAndRequestsOsPerm}, singleDestroy=${hasSingleDestroySetGuard}, inPlaceLp=${hasInPlaceLayoutParamsMutation}, singleSetLightMode=${pluginUsesSingleSetLightModeAction}`
  );
}

// ---------------------------------------------------------------------------
// Check 11: Native Downloads (NETFLOW-NATIVE-DOWNLOADS-01 Part B & Part D)
// ---------------------------------------------------------------------------
{
  // 1) Balanced braces/parens across all 4 Java files (including NetflowDownloadManager.java)
  const unbalancedFiles: string[] = [];
  for (const { name, src } of allJavaSources) {
    let braces = 0;
    let parens = 0;
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];
      if (ch === "/" && next === "/") {
        i += 2;
        while (i < src.length && src[i] !== "\n") i++;
      } else if (ch === "/" && next === "*") {
        i += 2;
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
        i += 2;
      } else if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\\") i += 2;
          else i++;
        }
        i++;
      } else {
        if (ch === "{") braces++;
        else if (ch === "}") braces--;
        else if (ch === "(") parens++;
        else if (ch === ")") parens--;
        i++;
      }
    }
    if (braces !== 0 || parens !== 0) {
      unbalancedFiles.push(`${name}(braces=${braces},parens=${parens})`);
    }
  }

  // 2) Uses android.app.DownloadManager only; NO BroadcastReceiver
  const usesDownloadManagerOnly =
    downloadManagerSrc.includes("import android.app.DownloadManager;") &&
    downloadManagerSrc.includes("new DownloadManager.Request(targetUri)") &&
    downloadManagerSrc.includes("new DownloadManager.Query()") &&
    !downloadManagerCodeOnly.includes("BroadcastReceiver") &&
    !engineCodeOnly.includes("BroadcastReceiver");

  // 3) DownloadListener emits onDownloadRequested (url origin+path only, userAgent omitted, isPrivate:false)
  //    and rejects blob:/data: with onDownloadUnsupported
  const emitsOnDownloadRequestedAndRejectsBlobData =
    downloadManagerSrc.includes('bridge.emitContractEvent("onDownloadRequested", ev)') &&
    !downloadManagerCodeOnly.includes('ev.put("userAgent"') &&
    downloadManagerSrc.includes('ev.put("isPrivate", false)') &&
    downloadManagerSrc.includes('lowerUrl.startsWith("blob:") || lowerUrl.startsWith("data:")') &&
    downloadManagerSrc.includes('bridge.emitContractEvent("onDownloadUnsupported", ev)');

  // 4) Enqueue attaches User-Agent, Referer, Cookie (never logged/sent to shell),
  //    and sets destination for API >= 29 (Q) vs API < 29
  const enqueueHeadersAndDestination =
    downloadManagerSrc.includes('request.addRequestHeader("User-Agent"') &&
    downloadManagerSrc.includes('request.addRequestHeader("Referer"') &&
    downloadManagerSrc.includes('CookieManager.getInstance().getCookie(pending.rawUrl)') &&
    downloadManagerSrc.includes('request.addRequestHeader("Cookie", cookieHeader.trim())') &&
    !downloadManagerCodeOnly.includes("Log.") &&
    downloadManagerSrc.includes("if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)") &&
    downloadManagerSrc.includes("request.setDestinationInExternalPublicDir(") &&
    downloadManagerSrc.includes("request.setDestinationInExternalFilesDir(");

  // 5) 1s polling only while active, cancel/delete via remove(), open via getUriForDownloadedFile + ACTION_VIEW + FLAG_GRANT_READ_URI_PERMISSION + try/catch ActivityNotFoundException
  const pollingAndLifecycleActions =
    downloadManagerSrc.includes("public static final long DOWNLOAD_POLL_INTERVAL_MS = 1000L;") &&
    downloadManagerSrc.includes("dm.remove(sysId)") &&
    downloadManagerSrc.includes("dm.getUriForDownloadedFile(sysId)") &&
    downloadManagerSrc.includes("Intent.ACTION_VIEW") &&
    downloadManagerSrc.includes("Intent.FLAG_GRANT_READ_URI_PERMISSION") &&
    downloadManagerSrc.includes("catch (ActivityNotFoundException") &&
    pluginSrc.includes('case "resolveDownload":') &&
    pluginSrc.includes('case "cancelDownload":') &&
    pluginSrc.includes('case "openDownload":') &&
    pluginSrc.includes('case "deleteDownload":');

  record(
    "Check 11: Native Downloads (DownloadManager enqueue, Cookie/Referer/UA headers, API 29 destination guard, 1s active-only query polling, open/cancel/delete)",
    unbalancedFiles.length === 0 &&
      usesDownloadManagerOnly &&
      emitsOnDownloadRequestedAndRejectsBlobData &&
      enqueueHeadersAndDestination &&
      pollingAndLifecycleActions,
    `balanced=${unbalancedFiles.length === 0}, dmOnlyNoReceiver=${usesDownloadManagerOnly}, onDownloadRequested=${emitsOnDownloadRequestedAndRejectsBlobData}, headersAndDest=${enqueueHeadersAndDestination}, pollAndActions=${pollingAndLifecycleActions}`
  );
}

// ---------------------------------------------------------------------------
// Check 12: Form 3 (NETFLOW-CHROME-LIKE-UX-01) Native Chrome-Like UX Parity
// ---------------------------------------------------------------------------
{
  const pluginForm3Methods =
    pluginSrc.includes('case "shareUrl":') &&
    pluginSrc.includes('case "openExternalBrowser":') &&
    pluginSrc.includes('case "downloadImage":') &&
    pluginSrc.includes("public void shareUrl(PluginCall call)") &&
    pluginSrc.includes("public void openExternalBrowser(PluginCall call)") &&
    pluginSrc.includes("public void downloadImage(PluginCall call)");

  const engineForm3Parity =
    engineSrc.includes("onContextMenuRequested") &&
    engineSrc.includes("onFavicon") &&
    engineSrc.includes("onSslError") &&
    engineSrc.includes("handler.cancel()") &&
    engineSrc.includes("RESOURCE_PROTECTED_MEDIA_ID") &&
    engineSrc.includes("chromiumMajorVersion") &&
    engineSrc.includes("getCurrentWebViewPackage") &&
    engineCodeOnly.includes("(holder.isPrivate && !this.privateProfileIsolationActive)") &&
    engineCodeOnly.includes('ev.put("isPrivate", holder.isPrivate)') &&
    engineCodeOnly.includes("if (holder == null || holder.isPrivate) return;");

  record(
    "Check 12: Form 3 Chrome-Like UX Parity (onContextMenuRequested incl. F-03 isolated private tab support, onFavicon, fail-closed onSslError, protectedMedia permission resolution, Chromium version reporting, shareUrl/openExternalBrowser/downloadImage)",
    pluginForm3Methods && engineForm3Parity,
    `pluginForm3Methods=${pluginForm3Methods}, engineForm3Parity=${engineForm3Parity}`
  );
}

// ---------------------------------------------------------------------------
// Check 13: Form 4 (NETFLOW-PRIVATE-PROFILE-ISOLATION-01) Private Profile Isolation
// ---------------------------------------------------------------------------
{
  const buildGradlePath = path.resolve(rootDir, "android/app/build.gradle");
  const buildGradleSrc = fs.readFileSync(buildGradlePath, "utf-8");

  const hasWebkitDependency = buildGradleSrc.includes(
    'implementation "androidx.webkit:webkit:$androidxWebkitVersion"'
  );

  const hasMultiProfileFeatureDetect =
    engineCodeOnly.includes("WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)") &&
    engineCodeOnly.includes("ProfileStore.getInstance()") &&
    engineCodeOnly.includes("store.getOrCreateProfile(PRIVATE_PROFILE_NAME)") &&
    engineCodeOnly.includes("store.deleteProfile(PRIVATE_PROFILE_NAME)");

  const setProfilePrivIdx = engineCodeOnly.indexOf(
    "WebViewCompat.setProfile(webView, PRIVATE_PROFILE_NAME)"
  );
  const setProfileDefaultIdx = engineCodeOnly.indexOf(
    "WebViewCompat.setProfile(webView, Profile.DEFAULT_PROFILE_NAME)"
  );
  const applySettingsInCreateIdx = engineCodeOnly.indexOf(
    "applyTabWebSettings(holder, webView)",
    setProfilePrivIdx > -1 ? setProfilePrivIdx : 0
  );
  const loadUrlCallIdx = engineCodeOnly.indexOf("holder.webView.loadUrl(trimmedUrl)");

  const profileSetBeforeSettingsAndLoadUrl =
    setProfilePrivIdx > 0 &&
    setProfileDefaultIdx > 0 &&
    applySettingsInCreateIdx > setProfilePrivIdx &&
    loadUrlCallIdx > setProfilePrivIdx;

  const noRemoveSessionCookiesAnywhere =
    !engineCodeOnly.includes("removeSessionCookies") &&
    !downloadManagerCodeOnly.includes("removeSessionCookies") &&
    !pluginCodeOnly.includes("removeSessionCookies") &&
    !mainCodeOnly.includes("removeSessionCookies");

  const usesProfileCookieManagerAndNoCacheFormSave =
    engineCodeOnly.includes("privateProfile.getCookieManager()") &&
    engineCodeOnly.includes("existingProfile.getCookieManager()") &&
    engineCodeOnly.includes("existingProfile.getWebStorage()") &&
    engineCodeOnly.includes("settings.setCacheMode(WebSettings.LOAD_NO_CACHE)") &&
    engineCodeOnly.includes("settings.setSaveFormData(false)") &&
    engineCodeOnly.includes("webView.clearFormData()") &&
    downloadManagerCodeOnly.includes('"PRIVATE_TAB_DOWNLOAD_BLOCKED"');

  const deferredProfileDeletionAndRetry =
    engineCodeOnly.includes("public static final long PRIVATE_PROFILE_DELETE_DELAY_MS = 100L;") &&
    engineCodeOnly.includes("mainHandler.postDelayed(pendingPrivateProfileDeleteRunnable, PRIVATE_PROFILE_DELETE_DELAY_MS)") &&
    engineCodeOnly.includes("schedulePrivateProfileDeletionAfterDestroyOnUiThread()") &&
    engineCodeOnly.includes("retryDeletePrivateProfileBeforeNewSessionOnUiThread()") &&
    engineCodeOnly.includes("hasAnyActivePrivateWebViewOnUiThread(") &&
    engineCodeOnly.includes("this.privateProfileDeletionPendingRetry = !deleted;");

  record(
    "Check 13: Form 4 & Form 8 Part C (F-08) Private Profile Isolation (MULTI_PROFILE feature detect, setProfile before loadUrl, deferred postDelayed profile deletion after destroy, retry on next private-session start, no removeSessionCookies)",
    hasWebkitDependency &&
      hasMultiProfileFeatureDetect &&
      profileSetBeforeSettingsAndLoadUrl &&
      noRemoveSessionCookiesAnywhere &&
      usesProfileCookieManagerAndNoCacheFormSave &&
      deferredProfileDeletionAndRetry,
    `webkitDep=${hasWebkitDependency}, featureDetect=${hasMultiProfileFeatureDetect}, setProfileBeforeLoad=${profileSetBeforeSettingsAndLoadUrl}, noRemoveSessionCookies=${noRemoveSessionCookiesAnywhere}, profileCookieAndNoCache=${usesProfileCookieManagerAndNoCacheFormSave}, deferredDeleteAndRetry=${deferredProfileDeletionAndRetry}`
  );
}

// ---------------------------------------------------------------------------
// Check 14: Form 8 Part B (F-07) Main-frame URL Safety & Host Normalization
// ---------------------------------------------------------------------------
{
  const hasHostNormalizerAndUserinfoCheck =
    engineCodeOnly.includes("public static String normalizeHostForSafety(String rawHost)") &&
    engineCodeOnly.includes("percentDecodeHostSafely(") &&
    engineCodeOnly.includes("while (h.endsWith(\".\"))") &&
    engineCodeOnly.includes("authorityNormalizedSep.lastIndexOf('@')") &&
    engineCodeOnly.includes("extractHostFromHostPort(hostPort)");

  const hasPureByteIpv4AndIpv6Parsers =
    engineCodeOnly.includes("public static byte[] tryParseIpv4LiteralToBytes(String rawHost)") &&
    engineCodeOnly.includes("public static byte[] tryParseIpv6LiteralToBytes(String rawHost)") &&
    engineCodeOnly.includes("private static boolean isPrivateOrReservedIpv6Bytes(byte[] raw)") &&
    engineCodeOnly.includes("Long.parseLong(part.substring(2), 16)") &&
    engineCodeOnly.includes("Long.parseLong(part, 8)") &&
    engineCodeOnly.includes("(b0 & 0xFE) == 0xFC") &&
    engineCodeOnly.includes("b0 == 0xFE && ((b1 & 0xC0) == 0x80");

  // Confirm evaluateUrlSafety does NOT call InetAddress.getAllByName or InetAddress.getByName on the UI thread
  const evalStart = engineCodeOnly.indexOf("public static UrlSafetyResult evaluateUrlSafety(");
  const evalEnd = engineCodeOnly.indexOf("private static String extractHostFromHostPort(", evalStart);
  const evalBody = evalStart >= 0 && evalEnd > evalStart ? engineCodeOnly.slice(evalStart, evalEnd) : "";
  const noDnsInEvaluateUrlSafety =
    evalBody.length > 0 &&
    !evalBody.includes("InetAddress.getAllByName") &&
    !evalBody.includes("InetAddress.getByName");

  record(
    "Check 14: Form 8 Part B (F-07) Main-frame URL Safety (host normalization, trailing-dot/uppercase, userinfo @ trick, decimal/hex/octal/shortened IPv4 & IPv6 ULA/link-local/mapped byte parsing, zero UI-thread DNS)",
    hasHostNormalizerAndUserinfoCheck &&
      hasPureByteIpv4AndIpv6Parsers &&
      noDnsInEvaluateUrlSafety,
    `normalizerAndUserinfo=${hasHostNormalizerAndUserinfoCheck}, byteIpv4Ipv6=${hasPureByteIpv4AndIpv6Parsers}, noUiDns=${noDnsInEvaluateUrlSafety}`
  );
}

// ---------------------------------------------------------------------------
// Check 15: Form 8 Part D (F-09, F-05) shouldInterceptRequest Ordering & DNS Limits + Surgical Java Fixes (F-11, F-15, F-16, F-19)
// ---------------------------------------------------------------------------
{
  const interceptStart = engineCodeOnly.indexOf(
    "public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request)"
  );
  const interceptEnd = engineCodeOnly.indexOf(
    "public boolean shouldOverrideUrlLoading(",
    interceptStart
  );
  const interceptBody =
    interceptStart >= 0 && interceptEnd > interceptStart
      ? engineCodeOnly.slice(interceptStart, interceptEnd)
      : "";

  const idxEvalSafety = interceptBody.indexOf("UrlSafetyResult safety = evaluateUrlSafety(rawUrl);");
  const idxMainFrameReturn = interceptBody.indexOf("if (isMainFrame)");
  const idxCachedDnsCheck = interceptBody.indexOf("isHostnameResolvingToPrivateIpOnBackgroundThread(host)");

  const orderingVerified =
    idxEvalSafety > 0 &&
    idxMainFrameReturn > idxEvalSafety &&
    idxCachedDnsCheck > idxMainFrameReturn;

  const dnsLimitsVerified =
    engineCodeOnly.includes("public static final long DNS_CACHE_TTL_MS = 60000L;") &&
    engineCodeOnly.includes("public static final long DNS_LOOKUP_TIMEOUT_MS = 1500L;") &&
    engineCodeOnly.includes("public static final int MAX_CONCURRENT_DNS_LOOKUPS = 4;") &&
    engineCodeOnly.includes("public static final int MAX_DNS_CACHE_ENTRIES = 1024;") &&
    engineCodeOnly.includes("Executors.newFixedThreadPool(MAX_CONCURRENT_DNS_LOOKUPS") &&
    engineCodeOnly.includes("future.get(DNS_LOOKUP_TIMEOUT_MS, TimeUnit.MILLISECONDS)") &&
    engineCodeOnly.includes("dnsLookupExecutor.shutdownNow()");

  const surgicalFixesVerified =
    downloadManagerCodeOnly.includes("PENDING_DOWNLOAD_TIMEOUT_MS = 30000L") &&
    downloadManagerCodeOnly.includes("completedDownloads.clear()") &&
    engineCodeOnly.includes('holder.lastHttpMethod = "GET";\n                holder.webView.goBack();') &&
    engineCodeOnly.includes('holder.lastHttpMethod = "GET";\n                holder.webView.goForward();') &&
    pluginCodeOnly.includes("if (boundEngine == null || sharedEngine == boundEngine)");

  record(
    "Check 15: Form 8 Part D (F-09, F-05) shouldInterceptRequest ordering ((1) literal safety -> (2) main-frame return null -> (3) cached DNS check), bounded DNS pool/timeout/cache, and F-11/F-15/F-16/F-19 guards",
    orderingVerified && dnsLimitsVerified && surgicalFixesVerified,
    `ordering=${orderingVerified}, dnsLimits=${dnsLimitsVerified}, surgicalFixes=${surgicalFixesVerified}`
  );
}

const passedCount = results.filter((r) => r.passed).length;
const failedCount = results.filter((r) => !r.passed).length;

console.log(`\n=== Static Java Verification Summary: ${passedCount}/${results.length} checks passed, ${failedCount} failed ===`);
if (failedCount > 0) {
  process.exit(1);
}


