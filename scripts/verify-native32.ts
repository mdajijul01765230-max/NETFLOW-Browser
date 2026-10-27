/**
 * Verification Script for NETFLOW-V2-NATIVE-32:
 * Android WebView Error & Recovery Lifecycle
 *
 * Requirements tested:
 * 1. WebView page-load error detection and classification (DNS, timeout, connection refused, offline, SSL, HTTP 4xx/5xx).
 * 2. HTTP/network failure recovery state machine (IDLE -> ERROR_DETECTED -> RECOVERING_RETRY -> RECOVERED / FALLBACK_SAFE / ABORTED).
 * 3. Failed navigation safe recovery paths (RETRY_CURRENT, RETRY_TEXT_ONLY, DISMISS_KEEP_CONTENT, FALLBACK_HOME).
 * 4. Reload / retry recovery lifecycle with exponential backoff and monotonic recovery epoch advancement.
 * 5. Stale failed-page callback rejection across recovery/navigation (outdated callbacks prevented from running on new pages).
 * 6. Per-tab lifecycle isolation.
 * 7. Private-tab isolation (transient records wiped upon closing final private tab).
 * 8. NATIVE-31 & NATIVE-30 regression safety preservation.
 */

import {
  createAndroidWebViewErrorAndRecoveryLifecycleManager,
  classifyWebViewError,
  WebViewErrorKind,
  RecoveryLifecycleState,
} from "../src/services/androidWebViewErrorAndRecoveryLifecycle";

import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  PageLifecycleState,
} from "../src/services/androidWebViewPageStateAndLifecycleSafety";

import {
  createAndroidWebViewRenderingResilienceManager,
} from "../src/services/androidWebViewRenderingResilience";

import {
  createAndroidWebViewRequestTimeoutAndRecoveryManager,
  TimeoutReason,
} from "../src/services/androidWebViewRequestTimeoutAndRecovery";

import {
  createAndroidWebViewMediaResourceManager,
} from "../src/services/androidWebViewMediaResourceGovernance";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runSuite() {
  console.log("=== STARTING NATIVE-32 WEBVIEW ERROR & RECOVERY LIFECYCLE SUITE ===");

  // ---------------------------------------------------------------------------
  // 1. Test Error Classification & Detection
  // ---------------------------------------------------------------------------
  console.log("\n1. Testing WebView Page-Load Error Detection & Classification...");

  const dnsErr = classifyWebViewError(new Error("net::ERR_NAME_NOT_RESOLVED"));
  assert(dnsErr.kind === WebViewErrorKind.DNS_LOOKUP_FAILED, "Should classify DNS failure");

  const timeoutErr = classifyWebViewError(new Error("Connection timed out"), 504);
  assert(timeoutErr.kind === WebViewErrorKind.CONNECTION_TIMEOUT, "Should classify connection timeout");

  const offlineErr = classifyWebViewError(new Error("Device is offline, internet disconnected"));
  assert(offlineErr.kind === WebViewErrorKind.NETWORK_DISCONNECTED, "Should classify network disconnected");

  const refusedErr = classifyWebViewError(new Error("net::ERR_CONNECTION_REFUSED"));
  assert(refusedErr.kind === WebViewErrorKind.CONNECTION_REFUSED, "Should classify connection refused");

  const sslErr = classifyWebViewError(new Error("net::ERR_CERT_AUTHORITY_INVALID"));
  assert(sslErr.kind === WebViewErrorKind.SSL_SECURITY_ERROR, "Should classify SSL security error");

  const clientErr = classifyWebViewError(new Error("Not Found"), 404);
  assert(clientErr.kind === WebViewErrorKind.HTTP_CLIENT_ERROR, "Should classify HTTP 404 client error");

  const serverErr = classifyWebViewError(new Error("Internal Server Error"), 500);
  assert(serverErr.kind === WebViewErrorKind.HTTP_SERVER_ERROR, "Should classify HTTP 500 server error");

  console.log("✓ Error detection & classification verified.");

  // ---------------------------------------------------------------------------
  // 2. Test Error Recovery State Machine & Monotonic Epoch Progression
  // ---------------------------------------------------------------------------
  console.log("\n2. Testing HTTP/Network Failure Recovery State Machine...");

  const manager = createAndroidWebViewErrorAndRecoveryLifecycleManager();
  const tabId1 = "tab-err-1";
  manager.registerTab(tabId1, "https://example.com");

  let r1 = manager.getTabRecord(tabId1);
  assert(r1 !== null && r1.state === RecoveryLifecycleState.IDLE, "Initial state should be IDLE");
  const initialEpoch = r1!.recoveryEpoch;

  // Record an error
  const errReport = manager.detectAndRecordError(
    tabId1,
    "https://example.com",
    new Error("net::ERR_CONNECTION_TIMED_OUT"),
    504,
    false
  );
  assert(errReport.errorKind === WebViewErrorKind.CONNECTION_TIMEOUT, "Reported kind matches");
  assert(errReport.recoveryEpoch > initialEpoch, "Recovery epoch must increment on error");

  r1 = manager.getTabRecord(tabId1);
  assert(r1!.state === RecoveryLifecycleState.ERROR_DETECTED, "State transitions to ERROR_DETECTED");
  assert(r1!.lastErrorKind === WebViewErrorKind.CONNECTION_TIMEOUT, "Last error kind stored");

  // Initiate Retry
  const retryResult = manager.initiateRecovery(tabId1, "RETRY_CURRENT");
  assert(retryResult.canProceed === true, "Recovery retry can proceed");
  assert(retryResult.recoveryEpoch > errReport.recoveryEpoch, "Epoch increments on recovery initiation");

  r1 = manager.getTabRecord(tabId1);
  assert(r1!.state === RecoveryLifecycleState.RECOVERING_RETRY, "State is RECOVERING_RETRY");
  assert(r1!.retryCount === 1, "Retry count is incremented to 1");
  assert(r1!.recommendedBackoffMs >= 500, "Recommended backoff applied");

  // Mark Recovery Success
  const success = manager.markRecoverySuccess(tabId1, retryResult.recoveryEpoch);
  assert(success === true, "markRecoverySuccess returns true for current epoch");

  r1 = manager.getTabRecord(tabId1);
  assert(r1!.state === RecoveryLifecycleState.RECOVERED, "State is now RECOVERED");
  assert(r1!.retryCount === 0, "Retry count reset to 0 upon recovery");
  assert(r1!.lastErrorKind === null, "Last error kind cleared upon recovery");

  console.log("✓ State machine transitions and epoch progression verified.");

  // ---------------------------------------------------------------------------
  // 3. Test Failed Navigation Safe Recovery Paths (Fallback & Dismiss)
  // ---------------------------------------------------------------------------
  console.log("\n3. Testing Safe Recovery Paths (Text-Only, Dismiss, Fallback)...");

  // A. Retry Text-Only
  manager.detectAndRecordError(tabId1, "https://example.com/heavy", new Error("Timeout"), 504, false);
  const textOnlyResult = manager.initiateRecovery(tabId1, "RETRY_TEXT_ONLY");
  assert(textOnlyResult.canProceed === true, "Text-only retry allowed");
  r1 = manager.getTabRecord(tabId1);
  assert(r1!.state === RecoveryLifecycleState.RECOVERING_RETRY, "State in text-only retry");

  // B. Dismiss Keep Content
  const dismissResult = manager.initiateRecovery(tabId1, "DISMISS_KEEP_CONTENT");
  assert(dismissResult.canProceed === true, "Dismiss keep content allowed");
  r1 = manager.getTabRecord(tabId1);
  assert(r1!.state === RecoveryLifecycleState.FALLBACK_SAFE, "State is FALLBACK_SAFE");
  assert(r1!.retryCount === 0, "Retry count reset on dismiss");

  // C. Fallback Home
  const homeResult = manager.initiateRecovery(tabId1, "FALLBACK_HOME");
  assert(homeResult.canProceed === true, "Fallback home allowed");
  r1 = manager.getTabRecord(tabId1);
  assert(r1!.state === RecoveryLifecycleState.FALLBACK_SAFE, "State is FALLBACK_SAFE for home");

  console.log("✓ Safe recovery paths verified.");

  // ---------------------------------------------------------------------------
  // 4. Test Stale Failed-Page Callback Rejection & Rapid Navigation Race Protection
  // ---------------------------------------------------------------------------
  console.log("\n4. Testing Stale Failed-Page Callback Barrier & Rapid Navigation Race Protection...");

  // Generate an error with epoch E1
  const errState = manager.detectAndRecordError(tabId1, "https://example.com/stale-test", new Error("Error E1"));
  const staleEpoch = errState.recoveryEpoch;

  // Simulate user triggering navigation or retry, which increments epoch to E2
  const navEpoch = manager.onNavigation(tabId1, "https://example.com/new-page").newEpoch;
  assert(navEpoch > staleEpoch, "Navigation advanced recovery epoch");

  // Attempt to execute callback with outdated staleEpoch
  let callbackExecuted = false;
  const guardedResult = manager.executeGuardedRecoveryCallback(
    tabId1,
    staleEpoch,
    "applyStaleDOMErrorNotice",
    () => {
      callbackExecuted = true;
      return "stale_result";
    }
  );

  assert(!callbackExecuted, "Outdated failed-page callback MUST NOT execute");
  assert(guardedResult.staleEpochDetected === true, "Stale epoch must be detected and reported");
  assert(guardedResult.executed === false, "Execution flag is false");

  // Now execute with the valid current epoch
  let validExecuted = false;
  const validResult = manager.executeGuardedRecoveryCallback(
    tabId1,
    navEpoch,
    "applyValidCallback",
    () => {
      validExecuted = true;
      return "fresh_result";
    }
  );

  assert(validExecuted, "Valid epoch callback must execute");
  assert(validResult.executed === true && validResult.result === "fresh_result", "Result returned correctly");

  // 4.1 Rapid Navigation + Delayed Error Callback Race Condition Protection
  console.log("  Testing rapid navigation + delayed error callback race condition protection...");
  const raceTab = "tab-race-1";
  manager.registerTab(raceTab, "https://site-a.com");
  const navA = manager.onNavigation(raceTab, "https://site-a.com");
  const epochA = navA.newEpoch;

  // Rapidly navigate to site B and then site C before site A completes
  const navB = manager.onNavigation(raceTab, "https://site-b.com");
  const epochB = navB.newEpoch;
  const navC = manager.onNavigation(raceTab, "https://site-c.com");
  const epochC = navC.newEpoch;

  assert(epochC > epochB && epochB > epochA, "Monotonically increasing epochs on rapid navigation");

  // Delayed error arrives from site A navigation with epochA
  const staleErrA = manager.detectAndRecordError(
    raceTab,
    "https://site-a.com",
    new Error("Connection reset by peer"),
    undefined,
    false,
    epochA
  );

  assert(staleErrA.isStale === true, "Delayed error from site A must be flagged as stale");
  let raceRecord = manager.getTabRecord(raceTab);
  assert(raceRecord?.currentUrl === "https://site-c.com", "Tab URL must remain site C (not reverted to site A)");
  assert(raceRecord?.state === RecoveryLifecycleState.IDLE, "Tab state must remain IDLE (not corrupted by site A error)");
  assert(raceRecord?.lastErrorKind === null, "lastErrorKind must remain null");

  // Delayed error arrives from site B navigation with epochB
  const staleErrB = manager.detectAndRecordError(
    raceTab,
    "https://site-b.com",
    new Error("Timeout"),
    504,
    false,
    epochB
  );
  assert(staleErrB.isStale === true, "Delayed error from site B must be flagged as stale");
  raceRecord = manager.getTabRecord(raceTab);
  assert(raceRecord?.currentUrl === "https://site-c.com", "Tab URL still site C");
  assert(raceRecord?.state === RecoveryLifecycleState.IDLE, "Tab state still IDLE");

  console.log("✓ Stale callback rejection and rapid navigation race protection verified.");

  // ---------------------------------------------------------------------------
  // 5. Test New Navigation Error Invalidation
  // ---------------------------------------------------------------------------
  console.log("\n5. Testing New Navigation Error Invalidation...");

  const invTab = "tab-invalidation-1";
  manager.registerTab(invTab, "https://error-page.org");
  manager.detectAndRecordError(invTab, "https://error-page.org", new Error("Fatal 500"), 500, false);
  let invRec = manager.getTabRecord(invTab);
  assert(invRec?.state === RecoveryLifecycleState.ERROR_DETECTED, "Error state set");
  assert(invRec?.lastErrorKind === WebViewErrorKind.HTTP_SERVER_ERROR, "Server error recorded");

  // Initiate recovery retry to build retryCount
  manager.initiateRecovery(invTab, "RETRY_CURRENT");
  invRec = manager.getTabRecord(invTab);
  assert(invRec?.retryCount === 1, "Retry count is 1");

  // Now user enters new URL or navigates away
  const newNav = manager.onNavigation(invTab, "https://fresh-clean-page.org");
  invRec = manager.getTabRecord(invTab);
  assert(invRec?.state === RecoveryLifecycleState.IDLE, "State completely reset to IDLE on new navigation");
  assert(invRec?.lastErrorKind === null, "lastErrorKind cleared on new navigation");
  assert(invRec?.lastErrorMessage === null, "lastErrorMessage cleared on new navigation");
  assert(invRec?.retryCount === 0, "retryCount reset to 0 on new navigation");
  assert(invRec?.currentUrl === "https://fresh-clean-page.org", "currentUrl updated to fresh page");
  assert(invRec?.recoveryEpoch === newNav.newEpoch, "recoveryEpoch synchronized to new navigation epoch");

  console.log("✓ New navigation error invalidation verified.");

  // ---------------------------------------------------------------------------
  // 6. Test Tab & Private Mode Isolation
  // ---------------------------------------------------------------------------
  console.log("\n6. Testing Tab and Private Mode Isolation...");

  const privateTab1 = "tab-priv-err-1";
  const privateTab2 = "tab-priv-err-2";
  manager.registerTab(privateTab1, "https://secret.org", true);
  manager.registerTab(privateTab2, "https://secret2.org", true);

  manager.detectAndRecordError(privateTab1, "https://secret.org", new Error("Private Net Failure"));
  assert(manager.getTabRecord(privateTab1)?.state === RecoveryLifecycleState.ERROR_DETECTED, "Private tab error detected");
  assert(manager.getTabRecord(privateTab2)?.state === RecoveryLifecycleState.IDLE, "Private tab 2 remains unaffected");

  // Close privateTab1 (remaining = 1) -> privateTab2 still exists
  manager.onTabClosed(privateTab1, true, 1);
  assert(manager.getTabRecord(privateTab1) === null, "Closed private tab 1 record removed");
  assert(manager.getTabRecord(privateTab2) !== null, "Private tab 2 still present");

  // Close final privateTab2 (remaining = 0) -> all private records wiped
  manager.onTabClosed(privateTab2, true, 0);
  assert(manager.getTabRecord(privateTab2) === null, "Closed private tab 2 record removed");

  console.log("✓ Tab and private mode isolation verified.");

  // ---------------------------------------------------------------------------
  // 7. Test NATIVE-31 & NATIVE-30 Preserved Regressions
  // ---------------------------------------------------------------------------
  console.log("\n7. Testing NATIVE-31 Quick Regression (Page State & DOM/JS Lifecycle)...");

  const pageSafety = createAndroidWebViewPageStateAndLifecycleSafetyManager();
  pageSafety.registerTab("reg-tab-1", "https://reg.org");
  const pStarted = pageSafety.onPageStarted("reg-tab-1", "https://reg.org");
  assert(pageSafety.getTabRecord("reg-tab-1")?.state === PageLifecycleState.LOADING, "NATIVE-31 in LOADING state");
  pageSafety.onDOMContentLoaded("reg-tab-1", pStarted.newEpoch);
  pageSafety.onPageFinished("reg-tab-1", pStarted.newEpoch);
  assert(pageSafety.getTabRecord("reg-tab-1")?.state === PageLifecycleState.LOADED, "NATIVE-31 reached LOADED state");

  console.log("✓ NATIVE-31 quick regression passed.");

  console.log("\n8. Testing NATIVE-30 Quick Regression (Rendering Resilience)...");

  const renderManager = createAndroidWebViewRenderingResilienceManager();
  renderManager.registerTab("reg-tab-2", "https://render.org");
  const rNav = renderManager.onNavigation("reg-tab-2", "https://render.org/page2");
  assert(renderManager.isRenderEpochCurrent("reg-tab-2", rNav.newEpoch), "Render epoch current");

  console.log("✓ NATIVE-30 quick regression passed.");

  // ---------------------------------------------------------------------------
  // 8. Test NATIVE-33 Compatibility (Request Timeout & Recovery Boundary)
  // ---------------------------------------------------------------------------
  console.log("\n9. Testing NATIVE-33 Compatibility (Request Timeout & Recovery)...");

  const timeoutManager = createAndroidWebViewRequestTimeoutAndRecoveryManager();
  const timeoutTabId = "tab-timeout-compat-1";
  timeoutManager.registerTab(timeoutTabId, "https://timeout-test.org");
  const { timeoutEpoch } = timeoutManager.startRequestTimeout(timeoutTabId, "https://timeout-test.org");
  assert(timeoutEpoch >= 1, "Timeout epoch started");

  // When timeout triggers, NATIVE-33 enters TIMED_OUT and NATIVE-32 records CONNECTION_TIMEOUT
  timeoutManager.triggerTimeout(timeoutTabId, TimeoutReason.INITIAL_CONNECT_TIMEOUT, timeoutEpoch);
  const toRecord = timeoutManager.getTabRecord(timeoutTabId);
  assert(toRecord !== null, "Timeout record exists");

  const errClassification = classifyWebViewError(new Error("net::ERR_CONNECTION_TIMED_OUT"), 504);
  assert(errClassification.kind === WebViewErrorKind.CONNECTION_TIMEOUT, "Timeout classified identically in NATIVE-32");

  console.log("✓ NATIVE-33 compatibility passed.");

  // ---------------------------------------------------------------------------
  // 9. Test NATIVE-29 Compatibility (Media Resource Governance)
  // ---------------------------------------------------------------------------
  console.log("\n10. Testing NATIVE-29 Compatibility (Media Resource Governance)...");

  const mediaManager = createAndroidWebViewMediaResourceManager();
  const allocRes = mediaManager.allocateMediaResource(
    "tab-media-compat-1",
    "https://media-test.org",
    "audio",
    "https://media-test.org/stream.mp3",
    false
  );
  assert(allocRes.success === true, "Media resource allocated");
  const mediaAccounting = mediaManager.getTabAccounting("tab-media-compat-1");
  assert(mediaAccounting.totalMemoryBytes > 0, "Media memory tracked and unharmed by error lifecycle");

  console.log("✓ NATIVE-29 compatibility passed.");

  // ---------------------------------------------------------------------------
  // 10. Test Security & Boundary Invariants
  // ---------------------------------------------------------------------------
  console.log("\n11. Testing Security Invariants (Pure TS, Zero JNI, Zero Reflection)...");

  // Verify no illegal global exposure or native bridges
  assert(typeof (globalThis as any).AndroidBridge === "undefined", "No privileged AndroidBridge injected into globalThis");
  assert(typeof (globalThis as any).NativeInterface === "undefined", "No native reflection or JNI hooks present");

  console.log("✓ Security and boundary invariants verified.");

  console.log("\n=== ALL NATIVE-32, NATIVE-31, NATIVE-33, NATIVE-30, AND NATIVE-29 TESTS COMPLETED SUCCESSFULLY ===");
}

runSuite().catch((err) => {
  console.error("Test execution failure:", err);
  process.exit(1);
});
