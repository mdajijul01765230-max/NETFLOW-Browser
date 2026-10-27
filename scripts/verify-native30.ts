import {
  createAndroidWebViewRenderingResilienceManager,
  RenderingState,
} from "../src/services/androidWebViewRenderingResilience";

import {
  createAndroidWebViewMediaResourceManager,
  MemoryPressureLevel,
  MediaResourceState,
} from "../src/services/androidWebViewMediaResourceGovernance";

import {
  createAndroidWebViewMediaSessionGovernanceManager,
  AudioArbitrationMode,
  MediaSessionState,
} from "../src/services/androidWebViewMediaSessionGovernance";

import {
  createAndroidWebViewBackgroundMediaManager,
  validateMediaUrl,
} from "../src/services/androidWebViewBackgroundMediaAndAutoplayBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative30Verification() {
  console.log("=== STARTING NATIVE-30 RENDERING & PAGE LIFECYCLE RESILIENCE SUITE ===");

  // -------------------------------------------------------------
  // 1. REGISTRATION & INITIAL RENDERING STATE
  // -------------------------------------------------------------
  console.log("1. Testing Registration & Rendering State Transitions...");

  const manager = createAndroidWebViewRenderingResilienceManager({
    rapidNavigationWindowMs: 1000,
    maxRapidNavigationsBeforeThrottle: 3,
    longRunningRenderSessionAlertMs: 1000, // 1s for testing
    maxRenderListenersPerTab: 5,
    maxAnimationFramesPerTab: 5,
  });

  const tab1 = "tab-r1";
  const tab2 = "tab-r2";
  const privTab = "tab-priv-r";

  // Tab 1 registered as foreground
  const rec1 = manager.registerTab(tab1, "https://example.com/page1", true, false);
  assert(rec1.tabId === tab1, "Tab 1 registered");
  assert(rec1.state === RenderingState.ACTIVE_RENDERING, "Foreground tab starts ACTIVE_RENDERING");
  assert(rec1.renderEpoch === 1, "Initial render epoch is 1");

  // Tab 2 registered as background
  const rec2 = manager.registerTab(tab2, "https://service.org/dashboard", false, false);
  assert(rec2.state === RenderingState.PAUSED_BACKGROUND, "Background tab starts PAUSED_BACKGROUND");

  // Tab switch: Tab 2 becomes foreground
  manager.setForegroundTab(tab2);
  const rec1After = manager.getTabRenderingRecord(tab1);
  const rec2After = manager.getTabRenderingRecord(tab2);
  assert(rec1After?.state === RenderingState.PAUSED_BACKGROUND, "Tab 1 transitions to PAUSED_BACKGROUND on tab switch");
  assert(rec2After?.state === RenderingState.ACTIVE_RENDERING, "Tab 2 transitions to ACTIVE_RENDERING on tab switch");

  console.log("✓ Registration and state transitions verified.");

  // -------------------------------------------------------------
  // 2. STALE RENDER CALLBACK & MONOTONIC EPOCH BARRIER
  // -------------------------------------------------------------
  console.log("2. Testing Stale Render Callback & Epoch Barrier...");

  // Capture current epoch for tab 2
  const currentEpoch = rec2After!.renderEpoch;
  assert(manager.isRenderEpochCurrent(tab2, currentEpoch), "Current epoch is valid");

  let callbackExecuted = false;
  const validExec = manager.executeGuardedRenderCallback(tab2, currentEpoch, () => {
    callbackExecuted = true;
    return "render-paint-success";
  });
  assert(validExec.isValid && validExec.executed && validExec.result === "render-paint-success", "Current epoch callback executes");
  assert(callbackExecuted, "Callback body actually executed");

  // Simulate navigation on tab 2: advances epoch
  const navResult = manager.onNavigation(tab2, "https://service.org/settings");
  assert(navResult.newEpoch === currentEpoch + 1, "Render epoch strictly increments on navigation");
  assert(!manager.isRenderEpochCurrent(tab2, currentEpoch), "Old render epoch is now invalid");

  // Attempt to execute callback with superseded old epoch
  let staleCallbackExecuted = false;
  const staleExec = manager.executeGuardedRenderCallback(tab2, currentEpoch, () => {
    staleCallbackExecuted = true;
    return "stale-render-payload";
  });
  assert(!staleExec.isValid && !staleExec.executed, "Stale render callback rejected");
  assert(staleExec.staleEpochDetected === true, "Stale epoch flag raised");
  assert(!staleCallbackExecuted, "Stale callback body never executed");

  console.log("✓ Stale render callback rejection & epoch barrier verified.");

  // -------------------------------------------------------------
  // 3. ANIMATION FRAME & OBSERVER LIMIT ENFORCEMENT
  // -------------------------------------------------------------
  console.log("3. Testing Animation Frame & Observer Lifecycle Accounting...");

  const activeEpoch = navResult.newEpoch;

  // Register animation frames
  const f1 = manager.registerAnimationFrame(tab2, activeEpoch);
  const f2 = manager.registerAnimationFrame(tab2, activeEpoch);
  assert(f1.success && typeof f1.frameId === "number", "Animation frame 1 registered");
  assert(f2.success && typeof f2.frameId === "number", "Animation frame 2 registered");

  const recTab2Frames = manager.getTabRenderingRecord(tab2);
  assert(recTab2Frames?.activeAnimationFrameCount === 2, "Tab 2 active animation frame count is 2");

  // Cancel frame 1
  assert(manager.cancelAnimationFrame(tab2, f1.frameId!), "Animation frame 1 canceled");
  assert(manager.getTabRenderingRecord(tab2)?.activeAnimationFrameCount === 1, "Active frame count decremented to 1");

  // Register render listeners
  const l1 = manager.registerRenderListener(tab2, activeEpoch, "IntersectionObserver_Hero");
  const l2 = manager.registerRenderListener(tab2, activeEpoch, "ResizeObserver_Card");
  assert(l1.success && typeof l1.listenerId === "string", "Render listener 1 registered");
  assert(l2.success && typeof l2.listenerId === "string", "Render listener 2 registered");
  assert(manager.getTabRenderingRecord(tab2)?.activeRenderListenerCount === 2, "Active listener count is 2");

  // Unregister listener 1
  assert(manager.unregisterRenderListener(tab2, l1.listenerId!), "Listener 1 unregistered");
  assert(manager.getTabRenderingRecord(tab2)?.activeRenderListenerCount === 1, "Active listener count decremented to 1");

  console.log("✓ Animation frame & observer accounting verified.");

  // -------------------------------------------------------------
  // 4. RAPID NAVIGATION & REPEATED RELOAD PROTECTION
  // -------------------------------------------------------------
  console.log("4. Testing Rapid Navigation & Repeated Reload Protection...");

  // Rapidly navigate tab 2 three times within rapidNavigationWindowMs
  const nav1 = manager.onNavigation(tab2, "https://service.org/p1");
  const nav2 = manager.onNavigation(tab2, "https://service.org/p2");
  const nav3 = manager.onNavigation(tab2, "https://service.org/p3");
  assert(nav3.rapidNavDetected, "Rapid navigation burst detected");

  // Verify frames and listeners were completely cleaned up by navigation
  const tab2NavClean = manager.getTabRenderingRecord(tab2);
  assert(tab2NavClean?.activeAnimationFrameCount === 0, "Frames wiped cleanly on navigation");
  assert(tab2NavClean?.activeRenderListenerCount === 0, "Listeners wiped cleanly on navigation");

  // Reload tab 2
  const reloadResult = manager.onReload(tab2);
  assert(reloadResult.newEpoch === nav3.newEpoch + 1, "Reload advances render epoch");

  console.log("✓ Rapid navigation & repeated reload resilience verified.");

  // -------------------------------------------------------------
  // 5. SUSPENSION / FROZEN STATE & STOP LOADING
  // -------------------------------------------------------------
  console.log("5. Testing Tab Suspension (Low-RAM) & Stop Loading...");

  assert(manager.suspendTabRendering(tab2), "Tab 2 rendering suspended");
  assert(manager.getTabRenderingRecord(tab2)?.state === RenderingState.FROZEN_SUSPENDED, "Tab 2 state is FROZEN_SUSPENDED");

  // Attempting to register frame in frozen tab is rejected
  const frozenFrame = manager.registerAnimationFrame(tab2, reloadResult.newEpoch);
  assert(!frozenFrame.success && frozenFrame.reason === "TabFrozenRenderingSuspended", "Animation frame rejected in frozen tab");

  // Resume rendering
  assert(manager.resumeTabRendering(tab2), "Tab 2 rendering resumed");
  assert(manager.getTabRenderingRecord(tab2)?.state === RenderingState.ACTIVE_RENDERING, "Tab 2 restored to ACTIVE_RENDERING");

  // Stop loading cleanup
  manager.registerAnimationFrame(tab2, reloadResult.newEpoch);
  manager.onStopLoading(tab2);
  assert(manager.getTabRenderingRecord(tab2)?.activeAnimationFrameCount === 0, "Frames cleaned up on stopLoading");

  console.log("✓ Tab suspension and stopLoading verified.");

  // -------------------------------------------------------------
  // 6. PRIVATE TAB ISOLATION & LIFECYCLE CLOSURE
  // -------------------------------------------------------------
  console.log("6. Testing Private Tab Isolation & Tab Close...");

  manager.registerTab(privTab, "https://secret.org", false, true);
  const privRec = manager.getTabRenderingRecord(privTab);
  assert(privRec?.isPrivate === true, "Private tab registered with isPrivate: true");

  // Close private tab with remainingPrivateTabs = 0
  manager.onTabClosed(privTab, true, 0);
  assert(manager.getTabRenderingRecord(privTab) === null, "Private tab rendering state purged on close");

  console.log("✓ Private tab isolation and lifecycle closure verified.");

  // -------------------------------------------------------------
  // 7. LONG RUNNING SESSION AUDIT
  // -------------------------------------------------------------
  console.log("7. Testing Long Running Render Health Audit...");

  // Tab 1 started earlier, simulate long running
  const recTab1 = manager.getTabRenderingRecord(tab1)!;
  // Sleep 1050ms to exceed 1000ms alert threshold
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const health = manager.auditRenderingHealth(tab1);
  assert(health.warnings.some((w) => w.includes("LongRunningSessionAlert")), "Long running session alert generated");

  console.log("✓ Long running session audit verified.");

  // -------------------------------------------------------------
  // 8. NATIVE-29 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("8. Testing NATIVE-29 Quick Regression...");

  const mediaResMgr = createAndroidWebViewMediaResourceManager();
  mediaResMgr.setActiveForegroundTab("reg-t1");

  const allocAudio = mediaResMgr.allocateMediaResource("reg-t1", "https://site.org", "audio", "https://site.org/a.mp3");
  assert(allocAudio.success, "NATIVE-29 audio allocation works");

  const allocDup = mediaResMgr.allocateMediaResource("reg-t1", "https://site.org", "audio", "https://site.org/a.mp3");
  assert(allocDup.success && allocDup.isDeduplicated === true, "NATIVE-29 duplicate deduplication works");

  const pressure = mediaResMgr.handleMemoryPressure(MemoryPressureLevel.MODERATE);
  assert(typeof pressure.freedBytes === "number", "NATIVE-29 memory pressure handling works");

  mediaResMgr.onTabClosed("reg-t1", false, 0);
  assert(mediaResMgr.getResourcesForTab("reg-t1").length === 0, "NATIVE-29 lifecycle cleanup works");

  console.log("✓ NATIVE-29 regression passed.");

  // -------------------------------------------------------------
  // 9. NATIVE-28 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("9. Testing NATIVE-28 Quick Regression...");

  const sessionGov = createAndroidWebViewMediaSessionGovernanceManager();
  sessionGov.setActiveForegroundTab("tab-a");

  const sA = sessionGov.requestMediaSession("tab-a", "https://a.org", {
    mediaType: "audio",
    sourceUrl: "https://a.org/song.mp3",
    isMuted: false,
  });
  assert(sA.success, "NATIVE-28 session request works");

  sessionGov.onTabClosed("tab-a", false, 0);
  assert(sessionGov.getSessionsForTab("tab-a").length === 0, "NATIVE-28 session tab close works");

  console.log("✓ NATIVE-28 regression passed.");

  // -------------------------------------------------------------
  // 10. NATIVE-27 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("10. Testing NATIVE-27 Quick Regression...");

  const bgMedia = createAndroidWebViewBackgroundMediaManager();
  const autoEval = bgMedia.evaluateAutoplay("t-auto", "https://vid.org", true, "https://vid.org/v.mp4");
  assert(autoEval.allowed, "NATIVE-27 muted autoplay allowed");

  assert(!validateMediaUrl("file:///etc/hosts").isValid, "NATIVE-27 file scheme blocked");
  assert(!validateMediaUrl("https://169.254.169.254/metadata").isValid, "NATIVE-27 cloud metadata blocked");

  console.log("✓ NATIVE-27 regression passed.");

  console.log("=== ALL NATIVE-30, NATIVE-29, NATIVE-28, AND NATIVE-27 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative30Verification().catch((err) => {
  console.error("NATIVE-30 VERIFICATION FAILED:", err);
  process.exit(1);
});
