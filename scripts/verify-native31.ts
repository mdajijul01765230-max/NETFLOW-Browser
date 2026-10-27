import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  PageLifecycleState,
} from "../src/services/androidWebViewPageStateAndLifecycleSafety";

import {
  createAndroidWebViewRenderingResilienceManager,
  RenderingState,
} from "../src/services/androidWebViewRenderingResilience";

import {
  createAndroidWebViewMediaResourceManager,
  MemoryPressureLevel,
} from "../src/services/androidWebViewMediaResourceGovernance";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative31Verification() {
  console.log("=== STARTING NATIVE-31 PAGE STATE & DOM/JS LIFECYCLE BRIDGE SAFETY SUITE ===");

  // -------------------------------------------------------------
  // 1. PAGE LOAD LIFECYCLE STATE TRACKING
  // -------------------------------------------------------------
  console.log("1. Testing Page Load Lifecycle Tracking (Start -> DOMContentLoaded -> Loaded)...");

  const manager = createAndroidWebViewPageStateAndLifecycleSafetyManager();

  const tab1 = "tab-ls-1";
  const rec1 = manager.registerTab(tab1, "https://example.com/home", false);
  assert(rec1.tabId === tab1, "Tab 1 registered");
  assert(rec1.lifecycleEpoch === 1, "Initial lifecycle epoch is 1");
  assert(rec1.state === PageLifecycleState.LOADING, "Starts in LOADING state");

  // Advance to DOM_CONTENT_LOADED
  const dclSuccess = manager.onDOMContentLoaded(tab1, 1);
  assert(dclSuccess, "DOMContentLoaded accepted for current epoch");
  const rec1Dcl = manager.getTabRecord(tab1);
  assert(rec1Dcl?.state === PageLifecycleState.DOM_CONTENT_LOADED, "State is DOM_CONTENT_LOADED");
  assert(typeof rec1Dcl?.domInteractiveTimestamp === "number", "domInteractiveTimestamp recorded");

  // Advance to LOADED
  const loadSuccess = manager.onPageFinished(tab1, 1);
  assert(loadSuccess, "PageFinished accepted for current epoch");
  const rec1Loaded = manager.getTabRecord(tab1);
  assert(rec1Loaded?.state === PageLifecycleState.LOADED, "State is LOADED");
  assert(typeof rec1Loaded?.loadCompleteTimestamp === "number", "loadCompleteTimestamp recorded");

  console.log("✓ Page load lifecycle state progression verified.");

  // -------------------------------------------------------------
  // 2. STALE DOM/JS CALLBACK BARRIER & EPOCH GUARD
  // -------------------------------------------------------------
  console.log("2. Testing Stale DOM/JS Callback Barrier Across Navigation...");

  let callback1Ran = false;
  const cb1Result = manager.executeGuardedDOMCallback(tab1, 1, "query_button_click", () => {
    callback1Ran = true;
    return "button-clicked";
  });
  assert(cb1Result.isValid && cb1Result.executed && cb1Result.result === "button-clicked", "Current epoch callback executed");
  assert(callback1Ran, "Callback body actually executed");

  // Trigger Navigation: advances epoch to 2
  const navResult = manager.onNavigation(tab1, "https://example.com/profile");
  assert(navResult.newEpoch === 2, "Lifecycle epoch monotonically incremented on navigation");
  const rec1Nav = manager.getTabRecord(tab1);
  assert(rec1Nav?.state === PageLifecycleState.LOADING, "State reset to LOADING upon navigation");
  assert(!manager.isLifecycleEpochCurrent(tab1, 1), "Old epoch is no longer current");

  // Attempt callback with superseded epoch 1
  let staleCallbackRan = false;
  const staleResult = manager.executeGuardedDOMCallback(tab1, 1, "stale_dom_mutation", () => {
    staleCallbackRan = true;
    return "stale-mutation-applied";
  });
  assert(!staleResult.isValid && !staleResult.executed, "Stale callback rejected");
  assert(staleResult.staleEpochDetected === true, "staleEpochDetected flag set");
  assert(!staleCallbackRan, "Stale callback body never executed");

  // Valid callback on new epoch 2
  let callback2Ran = false;
  const cb2Result = manager.executeGuardedDOMCallback(tab1, 2, "new_page_init", () => {
    callback2Ran = true;
    return "new-page-ready";
  });
  assert(cb2Result.isValid && cb2Result.executed && cb2Result.result === "new-page-ready", "New epoch callback executed");
  assert(callback2Ran, "New callback body executed");

  console.log("✓ Stale callback rejection and epoch barrier verified.");

  // -------------------------------------------------------------
  // 3. RAPID NAVIGATION & RELOAD RACE PROTECTION
  // -------------------------------------------------------------
  console.log("3. Testing Rapid Navigation & Reload Race Protection...");

  // Fire rapid navigations
  const navA = manager.onNavigation(tab1, "https://example.com/p1");
  const navB = manager.onNavigation(tab1, "https://example.com/p2");
  const navC = manager.onNavigation(tab1, "https://example.com/p3");
  assert(navC.newEpoch === navB.newEpoch + 1 && navB.newEpoch === navA.newEpoch + 1, "Epoch strictly sequential under rapid navigation");

  // Old asynchronous completion from navA must be rejected
  const lateDcl = manager.onDOMContentLoaded(tab1, navA.newEpoch);
  const lateFinish = manager.onPageFinished(tab1, navA.newEpoch);
  assert(!lateDcl, "Late DOMContentLoaded from prior rapid navigation rejected");
  assert(!lateFinish, "Late PageFinished from prior rapid navigation rejected");

  // Finish current navC
  assert(manager.onDOMContentLoaded(tab1, navC.newEpoch), "Current navC DOMContentLoaded accepted");
  assert(manager.onPageFinished(tab1, navC.newEpoch), "Current navC PageFinished accepted");

  // Reload tab
  const reloadRes = manager.onReload(tab1);
  assert(reloadRes.newEpoch === navC.newEpoch + 1, "Reload strictly increments lifecycle epoch");

  console.log("✓ Rapid navigation and reload race protection verified.");

  // -------------------------------------------------------------
  // 4. STOP LOADING & ERROR LIFECYCLE
  // -------------------------------------------------------------
  console.log("4. Testing Stop Loading and Error Transitions...");

  // Tab 2 for error & abort testing
  const tab2 = "tab-ls-2";
  const rec2 = manager.registerTab(tab2, "https://erroneous.org", false);

  manager.onPageError(tab2, rec2.lifecycleEpoch, "HTTP 502 Bad Gateway");
  const rec2Err = manager.getTabRecord(tab2);
  assert(rec2Err?.state === PageLifecycleState.FAILED_ERROR, "State transitioned to FAILED_ERROR");
  assert(rec2Err?.lastError === "HTTP 502 Bad Gateway", "Error message recorded");

  // Stop loading on a loading tab
  const tab3 = "tab-ls-3";
  const rec3 = manager.registerTab(tab3, "https://slowsite.org", false);
  manager.onStopLoading(tab3);
  const rec3Stop = manager.getTabRecord(tab3);
  assert(rec3Stop?.state === PageLifecycleState.ABORTED_TERMINATED, "Stop loading transitions state to ABORTED_TERMINATED");

  console.log("✓ Stop loading and error states verified.");

  // -------------------------------------------------------------
  // 5. TAB / ORIGIN & PRIVATE MODE ISOLATION
  // -------------------------------------------------------------
  console.log("5. Testing Tab/Origin and Private Mode Isolation...");

  const privTab = "tab-ls-priv";
  manager.registerTab(privTab, "https://secret.org/login", true);
  const privRec = manager.getTabRecord(privTab);
  assert(privRec?.isPrivate === true, "Private tab marked isPrivate: true");
  assert(privRec?.origin === "https://secret.org", "Origin isolated correctly");

  // Close private tab
  manager.onTabClosed(privTab, true, 0);
  assert(manager.getTabRecord(privTab) === null, "Private tab lifecycle state purged on close");

  console.log("✓ Tab/origin and private mode isolation verified.");

  // -------------------------------------------------------------
  // 6. NATIVE-30 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("6. Testing NATIVE-30 Quick Regression (Render Epoch & Tab Isolation)...");

  const renderMgr = createAndroidWebViewRenderingResilienceManager();
  const rTab = "reg-tab-30";
  renderMgr.registerTab(rTab, "https://example.com", true, false);

  let renderCbRan = false;
  const rExec = renderMgr.executeGuardedRenderCallback(rTab, 1, () => {
    renderCbRan = true;
    return "paint-ok";
  });
  assert(rExec.isValid && rExec.executed && renderCbRan, "NATIVE-30 guarded render callback executes");

  renderMgr.onNavigation(rTab, "https://example.com/nav");
  const rStaleExec = renderMgr.executeGuardedRenderCallback(rTab, 1, () => "stale");
  assert(!rStaleExec.isValid && rStaleExec.staleEpochDetected === true, "NATIVE-30 stale render callback rejected");

  renderMgr.onTabClosed(rTab, false, 0);
  assert(renderMgr.getTabRenderingRecord(rTab) === null, "NATIVE-30 tab close cleanup works");

  console.log("✓ NATIVE-30 quick regression passed.");

  // -------------------------------------------------------------
  // 7. NATIVE-29 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("7. Testing NATIVE-29 Quick Regression (Media Resource Lifetime)...");

  const mediaMgr = createAndroidWebViewMediaResourceManager();
  mediaMgr.setActiveForegroundTab("reg-tab-29");
  const allocRes = mediaMgr.allocateMediaResource("reg-tab-29", "https://site.org", "audio", "https://site.org/audio.mp3");
  assert(allocRes.success, "NATIVE-29 media resource allocation works");

  const pressure = mediaMgr.handleMemoryPressure(MemoryPressureLevel.MODERATE);
  assert(typeof pressure.freedBytes === "number", "NATIVE-29 memory pressure handling works");

  mediaMgr.onTabClosed("reg-tab-29", false, 0);
  assert(mediaMgr.getResourcesForTab("reg-tab-29").length === 0, "NATIVE-29 tab close cleanup works");

  console.log("✓ NATIVE-29 quick regression passed.");

  console.log("=== ALL NATIVE-31, NATIVE-30, AND NATIVE-29 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative31Verification().catch((err) => {
  console.error("NATIVE-31 VERIFICATION FAILED:", err);
  process.exit(1);
});
