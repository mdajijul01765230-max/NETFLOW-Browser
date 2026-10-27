/**
 * Verification Script for NETFLOW-V2-NATIVE-33:
 * Android WebView Request Timeout & Recovery Boundary
 *
 * Requirements tested:
 * 1. WebView request safe timeout detection (connect timeout, stall timeout, hard deadline).
 * 2. Detection of stalled navigation/request vs. active streaming progress (bytes chunk activity extension).
 * 3. Safe failure & recovery state creation upon timeout.
 * 4. Retry/Reload recovery starting with a fresh monotonic lifecycle epoch and progressive backoff.
 * 5. Stale timed-out request & callback barrier across new navigation (outdated callbacks prevented from running).
 * 6. Per-tab request timeout isolation.
 * 7. Private-tab isolation (transient records wiped upon closing final private tab).
 * 8. Integration with NATIVE-31 Page Lifecycle & preservation of NATIVE-30 Rendering & NATIVE-29 Media Governance.
 * 9. Long page load preservation: normal active heavy page loading is not terminated prematurely.
 */

import {
  createAndroidWebViewRequestTimeoutAndRecoveryManager,
  TimeoutStage,
  TimeoutReason,
} from "../src/services/androidWebViewRequestTimeoutAndRecovery";

import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  PageLifecycleState,
} from "../src/services/androidWebViewPageStateAndLifecycleSafety";

import {
  createAndroidWebViewRenderingResilienceManager,
} from "../src/services/androidWebViewRenderingResilience";

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
  console.log("=== STARTING NATIVE-33 WEBVIEW REQUEST TIMEOUT & RECOVERY SUITE ===");

  // ---------------------------------------------------------------------------
  // 1. Test Request Timeout Detection & Staged Progression
  // ---------------------------------------------------------------------------
  console.log("\n1. Testing WebView Request Timeout Detection...");

  const shortTimeoutConfig = {
    connectTimeoutMs: 50,
    inactivityStallMs: 80,
    maxHardDeadlineMs: 200,
    baseRetryBackoffMs: 100,
    maxRetryBackoffMs: 1000,
  };

  const manager = createAndroidWebViewRequestTimeoutAndRecoveryManager(shortTimeoutConfig);
  const tabId1 = "tab-timeout-1";
  manager.registerTab(tabId1, "https://slow-service.org");

  let r1 = manager.getTabRecord(tabId1);
  assert(r1 !== null && r1.stage === TimeoutStage.IDLE, "Initial stage must be IDLE");

  // Start request timeout monitoring
  const startRes = manager.startRequestTimeout(tabId1, "https://slow-service.org");
  assert(startRes.timeoutEpoch === 2, "Timeout epoch incremented to 2");
  assert(startRes.abortSignal !== undefined, "AbortSignal returned");

  r1 = manager.getTabRecord(tabId1);
  assert(r1!.stage === TimeoutStage.MONITORING, "Stage must be MONITORING");

  // Wait for initial connect timeout (50ms)
  await new Promise((resolve) => setTimeout(resolve, 75));

  r1 = manager.getTabRecord(tabId1);
  assert(r1!.stage === TimeoutStage.TIMED_OUT, "Tab should have transitioned to TIMED_OUT");
  assert(
    r1!.lastTimeoutReason === TimeoutReason.INITIAL_CONNECT_TIMEOUT,
    "Reason must be INITIAL_CONNECT_TIMEOUT"
  );
  assert(r1!.recommendedAction !== null, "Recommended recovery action generated");

  console.log("✓ Request timeout detection verified.");

  // ---------------------------------------------------------------------------
  // 2. Test Stalled Navigation vs Active Progress (No Premature Termination)
  // ---------------------------------------------------------------------------
  console.log("\n2. Testing Stalled Navigation vs. Active Streaming Progress...");

  const tabId2 = "tab-stream-2";
  manager.registerTab(tabId2, "https://large-download.org");

  // Start monitoring with 50ms connect timeout
  const streamStart = manager.startRequestTimeout(tabId2, "https://large-download.org");
  const streamEpoch = streamStart.timeoutEpoch;

  // Simulate incoming chunks every 30ms (before 80ms inactivity stall window)
  for (let i = 1; i <= 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const active = manager.recordActivity(tabId2, streamEpoch, 1024 * 10, `chunk-${i}`);
    assert(active === true, `Activity chunk ${i} must be recorded successfully`);
  }

  r1 = manager.getTabRecord(tabId2);
  assert(
    r1!.stage === TimeoutStage.ACTIVITY_EXTENDED,
    "Stage should be ACTIVITY_EXTENDED, NOT timed out during active streaming"
  );
  assert(r1!.bytesTransferred === 1024 * 30, "Bytes transferred tracked accurately");

  // Mark success once complete
  const markedSuccess = manager.markRequestSuccess(tabId2, streamEpoch);
  assert(markedSuccess === true, "Mark request success returns true");

  r1 = manager.getTabRecord(tabId2);
  assert(r1!.stage === TimeoutStage.RECOVERED, "Stage is RECOVERED after successful streaming");

  console.log("✓ Active streaming prevents premature timeout.");

  // ---------------------------------------------------------------------------
  // 3. Test Retry/Reload Recovery with Epoch Advancement & Backoff
  // ---------------------------------------------------------------------------
  console.log("\n3. Testing Retry/Reload Recovery with Monotonic Epochs...");

  // Tab 1 is currently in TIMED_OUT state
  const prevEpoch = manager.getTabRecord(tabId1)!.timeoutEpoch;
  const retryRes = manager.initiateRecovery(tabId1, "RETRY_WITH_BACKOFF");

  assert(retryRes.canProceed === true, "Recovery retry must be allowed to proceed");
  assert(retryRes.newTimeoutEpoch > prevEpoch, "New timeout epoch must strictly advance");
  assert(retryRes.recommendedBackoffMs >= 100, "Progressive backoff calculated");

  r1 = manager.getTabRecord(tabId1);
  assert(r1!.stage === TimeoutStage.RECOVERING_RETRY, "Stage transitioned to RECOVERING_RETRY");
  assert(r1!.retryCount === 1, "Retry count incremented");

  console.log("✓ Retry/reload recovery lifecycle verified.");

  // ---------------------------------------------------------------------------
  // 4. Test Stale Timed-Out Request & Callback Rejection Barrier
  // ---------------------------------------------------------------------------
  console.log("\n4. Testing Stale Request & Callback Barrier Across Navigation...");

  const staleEpoch = prevEpoch; // Old timed out epoch
  const activeEpoch = r1!.timeoutEpoch; // Current retry epoch

  let staleCallbackExecuted = false;
  const staleCall = manager.executeGuardedTimeoutCallback(
    tabId1,
    staleEpoch,
    "applyStaleTimeoutDOMNotice",
    () => {
      staleCallbackExecuted = true;
      return "stale";
    }
  );

  assert(!staleCallbackExecuted, "Stale callback from superseded epoch MUST NOT execute");
  assert(staleCall.staleEpochDetected === true, "Stale epoch must be flagged");
  assert(staleCall.executed === false, "Execution must be denied");

  // Execute with valid current epoch
  let freshExecuted = false;
  const freshCall = manager.executeGuardedTimeoutCallback(
    tabId1,
    activeEpoch,
    "applyFreshCallback",
    () => {
      freshExecuted = true;
      return "fresh";
    }
  );

  assert(freshExecuted, "Valid epoch callback must execute");
  assert(freshCall.executed === true && freshCall.result === "fresh", "Valid callback completed");

  console.log("✓ Stale request & callback rejection barrier verified.");

  // ---------------------------------------------------------------------------
  // 5. Test Rapid Navigation + Timeout Race Protection
  // ---------------------------------------------------------------------------
  console.log("\n5. Testing Rapid Navigation & Timeout Race Protection...");

  const raceTab = "tab-rapid-race";
  manager.registerTab(raceTab, "https://initial.org");

  // Nav 1: starts timeout timer with 50ms connect timeout
  const nav1 = manager.startRequestTimeout(raceTab, "https://nav1.org");
  const nav1Signal = nav1.abortSignal;
  const nav1Epoch = nav1.timeoutEpoch;

  // Rapidly navigate to Nav 2 after 10ms (before Nav 1 timeout fires)
  await new Promise((resolve) => setTimeout(resolve, 10));
  const nav2 = manager.startRequestTimeout(raceTab, "https://nav2.org");
  const nav2Signal = nav2.abortSignal;
  const nav2Epoch = nav2.timeoutEpoch;

  assert(nav1Signal.aborted === true, "Nav 1 abort signal must be aborted immediately upon Nav 2");
  assert(nav2Epoch > nav1Epoch, "Nav 2 must have advanced the timeout epoch");

  // Rapidly navigate to Nav 3 after another 10ms
  await new Promise((resolve) => setTimeout(resolve, 10));
  const nav3 = manager.startRequestTimeout(raceTab, "https://nav3.org");
  const nav3Epoch = nav3.timeoutEpoch;

  assert(nav2Signal.aborted === true, "Nav 2 abort signal must be aborted immediately upon Nav 3");
  assert(nav3Epoch > nav2Epoch, "Nav 3 epoch must strictly advance");

  // Wait long enough for Nav 1's original 50ms timer to have ticked
  await new Promise((resolve) => setTimeout(resolve, 40));

  // Verify that Nav 1's late timer tick did NOT transition Nav 3 to TIMED_OUT
  const raceRecord = manager.getTabRecord(raceTab);
  assert(raceRecord!.timeoutEpoch === nav3Epoch, "Current epoch must remain Nav 3");
  assert(
    raceRecord!.stage === TimeoutStage.MONITORING,
    "Nav 3 must remain in MONITORING stage; stale Nav 1 timer tick must be ignored"
  );

  // Now let Nav 3 finish successfully before its own 50ms deadline
  manager.markRequestSuccess(raceTab, nav3Epoch);
  assert(manager.getTabRecord(raceTab)!.stage === TimeoutStage.RECOVERED, "Nav 3 recovers cleanly");

  console.log("✓ Rapid navigation & timeout race protection verified.");

  // ---------------------------------------------------------------------------
  // 6. Test Tab & Private Mode Isolation
  // ---------------------------------------------------------------------------
  console.log("\n6. Testing Per-Tab and Private-Tab Isolation...");

  const privTab1 = "tab-priv-to-1";
  const privTab2 = "tab-priv-to-2";

  manager.registerTab(privTab1, "https://private.org", true);
  manager.registerTab(privTab2, "https://private2.org", true);

  manager.startRequestTimeout(privTab1, "https://private.org");
  assert(manager.getTabRecord(privTab1)!.stage === TimeoutStage.MONITORING, "Private tab 1 monitoring");
  assert(manager.getTabRecord(privTab2)!.stage === TimeoutStage.IDLE, "Private tab 2 remains IDLE");

  // Close privTab1 (remaining = 1) -> privTab2 still active
  manager.onTabClosed(privTab1, true, 1);
  assert(manager.getTabRecord(privTab1) === null, "Closed private tab 1 record removed");
  assert(manager.getTabRecord(privTab2) !== null, "Private tab 2 retained");

  // Close final privTab2 (remaining = 0) -> all private records wiped
  manager.onTabClosed(privTab2, true, 0);
  assert(manager.getTabRecord(privTab2) === null, "Closed private tab 2 record removed");

  console.log("✓ Per-tab and private-tab isolation verified.");

  // ---------------------------------------------------------------------------
  // 7. Test NATIVE-31, NATIVE-30, and NATIVE-29 Compatibility
  // ---------------------------------------------------------------------------
  console.log("\n7. Testing NATIVE-31 Page State & Lifecycle Compatibility...");

  const pageSafety = createAndroidWebViewPageStateAndLifecycleSafetyManager();
  pageSafety.registerTab("reg-tab-33", "https://reg33.org");
  const pStarted = pageSafety.onPageStarted("reg-tab-33", "https://reg33.org");
  assert(pageSafety.getTabRecord("reg-tab-33")?.state === PageLifecycleState.LOADING, "NATIVE-31 loading state");
  pageSafety.onDOMContentLoaded("reg-tab-33", pStarted.newEpoch);
  pageSafety.onPageFinished("reg-tab-33", pStarted.newEpoch);
  assert(pageSafety.getTabRecord("reg-tab-33")?.state === PageLifecycleState.LOADED, "NATIVE-31 loaded state");

  console.log("✓ NATIVE-31 integration verified.");

  console.log("\n7. Testing NATIVE-30 Rendering Resilience Compatibility...");
  const renderManager = createAndroidWebViewRenderingResilienceManager();
  renderManager.registerTab("reg-render-33", "https://render33.org");
  const rNav = renderManager.onNavigation("reg-render-33", "https://render33.org/page2");
  assert(renderManager.isRenderEpochCurrent("reg-render-33", rNav.newEpoch), "NATIVE-30 render epoch valid");

  console.log("✓ NATIVE-30 compatibility verified.");

  console.log("\n8. Testing NATIVE-29 Media Resource Governance Compatibility...");
  const mediaManager = createAndroidWebViewMediaResourceManager();
  const allocRes = mediaManager.allocateMediaResource(
    "reg-media-33",
    "https://example.com",
    "video",
    "https://example.com/stream.mp4"
  );
  assert(allocRes.success === true, "Media resource allocated");
  const tabAccount = mediaManager.getTabAccounting("reg-media-33");
  assert(tabAccount.totalMemoryBytes > 0, "NATIVE-29 media resource allocation tracked");

  console.log("✓ NATIVE-29 compatibility verified.");

  console.log("\n=== ALL NATIVE-33, NATIVE-31, NATIVE-30, AND NATIVE-29 TESTS COMPLETED SUCCESSFULLY ===");
}

runSuite().catch((err) => {
  console.error("Test execution failure:", err);
  process.exit(1);
});
