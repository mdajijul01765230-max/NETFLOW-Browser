/**
 * NETFLOW BROWSER V2 — FORM B2 (`NETFLOW-RESILIENCE-LIGHTMODE-BUNDLE-01`)
 * PART 4 — Network Resilience Coordinator Verification Suite (`scripts/verify-network-resilience.ts`)
 *
 * Fake-clock deterministic test suite verifying:
 *  1. Stall warning pill at 8s (8,000ms) with no progress/activity
 *  2. Inactivity cutoff (20s) & partial-content rule at progress 39 vs 40 (and DOMContentLoaded)
 *  3. Hard ceiling at 45s default vs 60s on 2G
 *  4. Subresource failures strictly separated and never create a main-frame page error state
 *  5. Light Mode suggestion after 6 (>5) subresource failures while progress < 70% (and autoAdaptToWeakNetwork behavior)
 *  6. Connectivity 1.5s (1,500ms) anti-flap debounce coalesces rapid flapping
 *  7. Validated online: GET auto-resume once after 500ms for active tab with retryCount=0 and no committed content
 *  8. Validated online: no reload when page already has committed content (emits ONLINE_INDICATOR)
 *  9. Validated online: POST never auto-resumes and emits CONFIRM_POST_RETRY
 * 10. Validated online: background tabs never auto-resume
 * 11. Stale-epoch events from superseded loads are strictly ignored
 * 12. Offline fast-fail (<150ms) both via coordinator and evaluateOfflineNavigation
 */

import {
  createAndroidWebViewNetworkResilienceCoordinator,
  createFakeResilienceClock,
  ResilienceSignalEvent,
} from "../src/services/androidWebViewNetworkResilience";
import {
  evaluateOfflineNavigation,
  HONEST_OFFLINE_UNSAVED_MESSAGE_EN,
} from "../src/services/lightModeEngine";

interface TestRow {
  id: number;
  test: string;
  result: "PASS" | "FAIL";
  detail: string;
}

const rows: TestRow[] = [];
let nextId = 1;

function assertTest(test: string, pass: boolean, detail: string) {
  const result: "PASS" | "FAIL" = pass ? "PASS" : "FAIL";
  rows.push({ id: nextId++, test, result, detail });
  if (!pass) {
    throw new Error(`FAIL: ${test} — ${detail}`);
  }
}

console.log("=== NETFLOW BROWSER V2 — VERIFY NETWORK RESILIENCE (PART 1 & PART 3 FAST-FAIL) ===");

// ---------------------------------------------------------------------------
// Test 1: Subresource failures never create a main-frame page error state
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-1",
    onSignal: (s) => signals.push(s),
  });

  coord.pageStarted("tab-1", "https://example.com/news", { method: "GET" });
  coord.progress("tab-1", 30);
  coord.subresourceError("tab-1", { resourceUrl: "https://cdn.example.com/a.png", code: -2 });
  coord.subresourceError("tab-1", { resourceUrl: "https://cdn.example.com/b.woff2", code: -7 });
  coord.subresourceError("tab-1", { resourceUrl: "https://cdn.example.com/c.js", code: -105 });

  const st = coord.getTabState("tab-1")!;
  const pass =
    st.isLoading === true &&
    st.recoveryCenterActive === false &&
    st.lastMainFrameErrorCode === null &&
    st.subresourceFailures === 3 &&
    !signals.some((s) => s.type === "SHOW_RECOVERY_CENTER");

  assertTest(
    "Subresource failures never create a page error state",
    pass,
    `isLoading=${st.isLoading}, recoveryCenterActive=${st.recoveryCenterActive}, lastMainFrameErrorCode=${st.lastMainFrameErrorCode}, subresourceFailures=${st.subresourceFailures}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 2: Stall pill at 8s (STALL_WARNING after 8,000ms of no progress)
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-stall",
    onSignal: (s) => signals.push(s),
  });

  coord.pageStarted("tab-stall", "https://slow.example.com", { method: "GET" });
  coord.progress("tab-stall", 20);

  // At 7,999ms: no stall warning yet
  clock.advanceBy(7_999);
  const before8s = coord.getTabState("tab-stall")!;
  const noStallBefore8s = before8s.stallWarningActive === false;

  // At 8,000ms: STALL_WARNING emitted and active
  clock.advanceBy(1);
  const at8s = coord.getTabState("tab-stall")!;
  const stallAt8s =
    at8s.stallWarningActive === true &&
    signals.some((s) => s.type === "STALL_WARNING" && s.tabId === "tab-stall");

  assertTest(
    "Stall warning pill at 8s (no STALL_WARNING at 7,999ms; active at 8,000ms)",
    noStallBefore8s && stallAt8s,
    `at7999ms=${before8s.stallWarningActive}, at8000ms=${at8s.stallWarningActive}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 3: Cutoff and partial-content rule at progress 39 vs 40 (and DOMContentLoaded)
// ---------------------------------------------------------------------------
{
  // Case A: progress = 39% -> STOP_LOADING + SHOW_RECOVERY_CENTER (not KEEP_PARTIAL_CONTENT)
  const clock39 = createFakeResilienceClock(1_000);
  const signals39: ResilienceSignalEvent[] = [];
  const coord39 = createAndroidWebViewNetworkResilienceCoordinator({
    clock: clock39,
    initialActiveTabId: "tab-39",
    onSignal: (s) => signals39.push(s),
  });

  coord39.pageStarted("tab-39", "https://example.com/p39", { method: "GET" });
  coord39.progress("tab-39", 39);
  clock39.advanceBy(20_000);
  const st39 = coord39.getTabState("tab-39")!;
  const pass39 =
    st39.isLoading === false &&
    st39.recoveryCenterActive === true &&
    st39.partialContentNoticeActive === false &&
    signals39.some((s) => s.type === "STOP_LOADING") &&
    signals39.some((s) => s.type === "SHOW_RECOVERY_CENTER") &&
    !signals39.some((s) => s.type === "KEEP_PARTIAL_CONTENT");
  coord39.destroy();

  // Case B: progress = 40% -> STOP_LOADING + KEEP_PARTIAL_CONTENT (not SHOW_RECOVERY_CENTER)
  const clock40 = createFakeResilienceClock(1_000);
  const signals40: ResilienceSignalEvent[] = [];
  const coord40 = createAndroidWebViewNetworkResilienceCoordinator({
    clock: clock40,
    initialActiveTabId: "tab-40",
    onSignal: (s) => signals40.push(s),
  });

  coord40.pageStarted("tab-40", "https://example.com/p40", { method: "GET" });
  coord40.progress("tab-40", 40);
  clock40.advanceBy(20_000);
  const st40 = coord40.getTabState("tab-40")!;
  const pass40 =
    st40.isLoading === false &&
    st40.partialContentNoticeActive === true &&
    st40.recoveryCenterActive === false &&
    st40.hasCommittedContent === true &&
    signals40.some((s) => s.type === "STOP_LOADING") &&
    signals40.some((s) => s.type === "KEEP_PARTIAL_CONTENT") &&
    !signals40.some((s) => s.type === "SHOW_RECOVERY_CENTER");
  coord40.destroy();

  // Case C: progress = 25% but domContentLoaded = true -> KEEP_PARTIAL_CONTENT
  const clockDom = createFakeResilienceClock(1_000);
  const signalsDom: ResilienceSignalEvent[] = [];
  const coordDom = createAndroidWebViewNetworkResilienceCoordinator({
    clock: clockDom,
    initialActiveTabId: "tab-dom",
    onSignal: (s) => signalsDom.push(s),
  });

  coordDom.pageStarted("tab-dom", "https://example.com/pdom", { method: "GET" });
  coordDom.progress("tab-dom", 25);
  coordDom.domContentLoaded("tab-dom");
  clockDom.advanceBy(20_000);
  const stDom = coordDom.getTabState("tab-dom")!;
  const passDom =
    stDom.partialContentNoticeActive === true &&
    stDom.recoveryCenterActive === false &&
    signalsDom.some((s) => s.type === "KEEP_PARTIAL_CONTENT");
  coordDom.destroy();

  assertTest(
    "Cutoff (20s) partial-content rule at progress 39 (Recovery Center) vs 40 / DOMContentLoaded (Keep Partial)",
    pass39 && pass40 && passDom,
    `progress39_recovery=${pass39}, progress40_keepPartial=${pass40}, domLoaded_keepPartial=${passDom}`
  );
}

// ---------------------------------------------------------------------------
// Test 4: Hard ceiling 45s default vs 60s on 2G despite trickle progress
// ---------------------------------------------------------------------------
{
  // Default 45s hard ceiling
  const clock45 = createFakeResilienceClock(1_000);
  const signals45: ResilienceSignalEvent[] = [];
  const coord45 = createAndroidWebViewNetworkResilienceCoordinator({
    clock: clock45,
    initialActiveTabId: "tab-45",
    initialConnectivity: { online: true, validated: true, transport: "wifi" },
    onSignal: (s) => signals45.push(s),
  });
  coord45.pageStarted("tab-45", "https://example.com/ceiling45", { method: "GET" });
  // Trickle progress every 10s so 20s inactivity cutoff never fires
  for (let step = 1; step <= 4; step++) {
    clock45.advanceBy(10_000);
    coord45.progress("tab-45", step * 10); // 10, 20, 30, 40 at 40s
  }
  const at40s = coord45.getTabState("tab-45")!;
  clock45.advanceBy(5_000); // Total 45,000ms
  const at45s = coord45.getTabState("tab-45")!;
  const pass45 =
    at40s.isLoading === true &&
    at45s.isLoading === false &&
    at45s.cutoffReason === "HARD_CEILING" &&
    at45s.partialContentNoticeActive === true;
  coord45.destroy();

  // 2G 60s hard ceiling
  const clock60 = createFakeResilienceClock(1_000);
  const coord60 = createAndroidWebViewNetworkResilienceCoordinator({
    clock: clock60,
    initialActiveTabId: "tab-60",
    initialConnectivity: { online: true, validated: true, transport: "2g", rttMs: 950 },
  });
  coord60.pageStarted("tab-60", "https://example.com/ceiling60", { method: "GET" });
  for (let step = 1; step <= 5; step++) {
    clock60.advanceBy(10_000);
    coord60.progress("tab-60", step * 10); // 50% at 50s (passed 45s still loading on 2G!)
  }
  const at50sOn2G = coord60.getTabState("tab-60")!;
  clock60.advanceBy(10_000); // Total 60,000ms
  const at60sOn2G = coord60.getTabState("tab-60")!;
  const pass60 =
    at50sOn2G.isLoading === true &&
    at60sOn2G.isLoading === false &&
    at60sOn2G.cutoffReason === "HARD_CEILING";
  coord60.destroy();

  assertTest(
    "Hard ceiling 45s default vs 60s on 2G",
    pass45 && pass60,
    `default45sCutoff=${pass45}, 2gStillLoadingAt50sAndCutoffAt60s=${pass60}`
  );
}

// ---------------------------------------------------------------------------
// Test 5: Light Mode suggestion after 6 (>5) subresource failures while progress < 70%
//         (never auto-apply unless autoAdaptToWeakNetwork is on)
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-lm",
    autoAdaptToWeakNetwork: false,
    onSignal: (s) => signals.push(s),
  });

  coord.pageStarted("tab-lm", "https://heavy.example.com", { method: "GET" });
  coord.progress("tab-lm", 45);

  for (let i = 1; i <= 5; i++) {
    coord.subresourceError("tab-lm", { resourceUrl: `https://heavy.example.com/img${i}.jpg` });
  }
  const after5 = coord.getTabState("tab-lm")!;
  const noSuggestAt5 = after5.suggestLightModeActive === false;

  // 6th failure (> 5) while progress (45%) < 70%
  coord.subresourceError("tab-lm", { resourceUrl: "https://heavy.example.com/img6.jpg" });
  const after6 = coord.getTabState("tab-lm")!;
  const suggestAt6NoAuto =
    after6.suggestLightModeActive === true &&
    after6.lightModeAutoApplied === false &&
    signals.some((s) => s.type === "SUGGEST_LIGHT_MODE") &&
    !signals.some((s) => s.type === "AUTO_APPLY_LIGHT_MODE");

  // Now verify with autoAdaptToWeakNetwork = true
  coord.setAutoAdaptToWeakNetwork(true);
  coord.pageStarted("tab-lm-auto", "https://heavy2.example.com", { method: "GET" });
  coord.progress("tab-lm-auto", 30);
  for (let i = 1; i <= 6; i++) {
    coord.subresourceError("tab-lm-auto", { resourceUrl: `https://heavy2.example.com/res${i}.js` });
  }
  const after6Auto = coord.getTabState("tab-lm-auto")!;
  const autoAppliedWhenSettingOn =
    after6Auto.suggestLightModeActive === true &&
    after6Auto.lightModeAutoApplied === true &&
    signals.some((s) => s.type === "AUTO_APPLY_LIGHT_MODE" && s.tabId === "tab-lm-auto");

  assertTest(
    "Light Mode suggestion after 6 (>5) subresource failures (<70% progress); never auto-applies unless autoAdaptToWeakNetwork is on",
    noSuggestAt5 && suggestAt6NoAuto && autoAppliedWhenSettingOn,
    `at5=${after5.suggestLightModeActive}, at6Suggest=${after6.suggestLightModeActive}, at6AutoOff=${after6.lightModeAutoApplied}, at6AutoOn=${after6Auto.lightModeAutoApplied}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 6: Connectivity 1.5s (1,500ms) anti-flap debounce coalesces flapping
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-flap",
    initialConnectivity: { online: true, validated: true, transport: "wifi" },
    onSignal: (s) => signals.push(s),
  });

  coord.pageStarted("tab-flap", "https://example.com/flap", { method: "GET" });
  coord.progress("tab-flap", 20);

  // Rapidly flap offline -> online -> offline -> online within 1.5s
  coord.connectivity({ online: false, validated: false, transport: "offline" });
  clock.advanceBy(400);
  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(400);
  coord.connectivity({ online: false, validated: false, transport: "offline" });
  clock.advanceBy(400);
  coord.connectivity({ online: true, validated: true, transport: "wifi" });

  // Advance 1,500ms from last flap
  clock.advanceBy(1_500);
  const st = coord.getTabState("tab-flap")!;
  const pass =
    st.isLoading === true &&
    st.fastOfflineActive === false &&
    !signals.some((s) => s.type === "FAST_OFFLINE_STATE");

  assertTest(
    "Connectivity 1.5s anti-flap debounce coalesces rapid offline/online flapping",
    pass,
    `isLoading=${st.isLoading}, fastOfflineActive=${st.fastOfflineActive}, signals=${signals.length}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 7: GET auto-resume once after 500ms on validated online (retryCount=0, no committed content)
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-get",
    initialConnectivity: { online: false, validated: false, transport: "offline" },
    onSignal: (s) => signals.push(s),
  });

  // Start GET while offline -> fast offline state, hasCommittedContent=false, retryCount=0
  coord.pageStarted("tab-get", "https://example.com/article", { method: "GET" });
  const offlineSt = coord.getTabState("tab-get")!;

  // Transition to validated online -> 1,500ms debounce + 500ms auto-reload delay
  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(1_500); // Debounce commits online
  const before500ms = signals.filter((s) => s.type === "AUTO_RELOAD").length;

  clock.advanceBy(500); // 500ms auto-reload timer fires
  const after500ms = signals.filter((s) => s.type === "AUTO_RELOAD").length;
  const stAfterReload = coord.getTabState("tab-get")!;

  // Flap offline and online again without user navigation -> retryCount is now 1, so NO second auto-reload
  coord.connectivity({ online: false, validated: false, transport: "offline" });
  clock.advanceBy(1_500);
  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_000);
  const afterSecondOnline = signals.filter((s) => s.type === "AUTO_RELOAD").length;

  const pass =
    offlineSt.fastOfflineActive === true &&
    before500ms === 0 &&
    after500ms === 1 &&
    stAfterReload.retryCount === 1 &&
    afterSecondOnline === 1;

  assertTest(
    "Validated online auto-reloads active GET tab once after 500ms (retryCount 0 -> 1, never loops)",
    pass,
    `before500ms=${before500ms}, after500ms=${after500ms}, retryCount=${stAfterReload.retryCount}, afterSecondOnline=${afterSecondOnline}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 8: Validated online with committed content: no reload, emits ONLINE_INDICATOR
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-committed",
    initialConnectivity: { online: true, validated: true, transport: "wifi" },
    onSignal: (s) => signals.push(s),
  });

  coord.pageStarted("tab-committed", "https://example.com/read", { method: "GET" });
  coord.progress("tab-committed", 60); // >= 40% marks hasCommittedContent = true
  coord.pageFinished("tab-committed");

  // Go offline (1.5s debounce) then online (1.5s debounce + 500ms)
  coord.connectivity({ online: false, validated: false, transport: "offline" });
  clock.advanceBy(1_500);
  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_500);

  const st = coord.getTabState("tab-committed")!;
  const hasOnlineIndicator =
    st.onlineIndicatorActive === true &&
    signals.some((s) => s.type === "ONLINE_INDICATOR" && s.tabId === "tab-committed");
  const noAutoReload = !signals.some((s) => s.type === "AUTO_RELOAD");

  assertTest(
    "Validated online with committed content never reloads; emits ONLINE_INDICATOR",
    hasOnlineIndicator && noAutoReload,
    `onlineIndicatorActive=${st.onlineIndicatorActive}, autoReloadSignals=${signals.filter((s) => s.type === "AUTO_RELOAD").length}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 9: POST never auto-resumes on validated online and emits CONFIRM_POST_RETRY
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-post",
    initialConnectivity: { online: false, validated: false, transport: "offline" },
    onSignal: (s) => signals.push(s),
  });

  coord.pageStarted("tab-post", "https://example.com/submit", { method: "POST" });

  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_500);

  const st = coord.getTabState("tab-post")!;
  const pass =
    st.confirmPostRetryActive === true &&
    signals.some((s) => s.type === "CONFIRM_POST_RETRY" && s.tabId === "tab-post") &&
    !signals.some((s) => s.type === "AUTO_RELOAD");

  // Verify user decision helper (SAFE_GET)
  const decision = coord.resolvePostRetryDecision("tab-post", "SAFE_GET");
  const decisionPass =
    decision.shouldNavigate === true &&
    decision.method === "GET" &&
    decision.url === "https://example.com/submit";

  assertTest(
    "POST request never auto-resumes on validated online; emits CONFIRM_POST_RETRY",
    pass && decisionPass,
    `confirmPostRetryActive=${st.confirmPostRetryActive}, autoReloadCount=${signals.filter((s) => s.type === "AUTO_RELOAD").length}, safeGetDecision=${decision.method}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 10: Background tabs never auto-resume on validated online
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-active",
    initialConnectivity: { online: false, validated: false, transport: "offline" },
    onSignal: (s) => signals.push(s),
  });

  // Background tab fails while offline
  coord.pageStarted("tab-bg", "https://example.com/bg", { method: "GET" });
  // Active tab has already committed content
  coord.pageStarted("tab-active", "https://example.com/fg", { method: "GET" });
  coord.pageCommitVisible("tab-active", "https://example.com/fg");

  coord.connectivity({ online: true, validated: true, transport: "wifi" });
  clock.advanceBy(2_500);

  const bgAutoReloads = signals.filter(
    (s) => s.type === "AUTO_RELOAD" && s.tabId === "tab-bg"
  ).length;
  const bgState = coord.getTabState("tab-bg")!;

  assertTest(
    "Background tabs never auto-resume on validated online",
    bgAutoReloads === 0 && bgState.retryCount === 0,
    `bgAutoReloads=${bgAutoReloads}, bgRetryCount=${bgState.retryCount}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 11: Stale-epoch events from superseded loads are strictly ignored
// ---------------------------------------------------------------------------
{
  const clock = createFakeResilienceClock(1_000);
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-epoch",
  });

  const start1 = coord.pageStarted("tab-epoch", "https://example.com/first", { method: "GET" });
  const epoch1 = start1.epoch;

  const start2 = coord.pageStarted("tab-epoch", "https://example.com/second", { method: "GET" });
  const epoch2 = start2.epoch;

  // Send progress, subresourceError, mainFrameError, pageFinished with stale epoch1
  const staleProg = coord.progress("tab-epoch", 85, { epoch: epoch1 });
  const staleSub = coord.subresourceError("tab-epoch", {
    resourceUrl: "https://example.com/old.js",
    epoch: epoch1,
  });
  const staleErr = coord.mainFrameError("tab-epoch", -2, {
    url: "https://example.com/first",
    epoch: epoch1,
  });
  const staleFin = coord.pageFinished("tab-epoch", {
    url: "https://example.com/first",
    epoch: epoch1,
  });

  const st = coord.getTabState("tab-epoch")!;
  const pass =
    epoch2 > epoch1 &&
    staleProg.staleEpochIgnored === true &&
    staleSub.staleEpochIgnored === true &&
    staleErr.staleEpochIgnored === true &&
    staleFin.staleEpochIgnored === true &&
    st.url === "https://example.com/second" &&
    st.progress === 0 &&
    st.recoveryCenterActive === false &&
    st.isLoading === true;

  assertTest(
    "Monotonic epoch per tab ignores stale progress, subresourceError, mainFrameError, and pageFinished",
    pass,
    `epoch1=${epoch1}, epoch2=${epoch2}, url=${st.url}, progress=${st.progress}, recovery=${st.recoveryCenterActive}`
  );
  coord.destroy();
}

// ---------------------------------------------------------------------------
// Test 12: Offline fast fail (<150ms) with honest message & saved capsules list
// ---------------------------------------------------------------------------
{
  const t0 = performance.now();
  const clock = createFakeResilienceClock(1_000);
  const signals: ResilienceSignalEvent[] = [];
  const coord = createAndroidWebViewNetworkResilienceCoordinator({
    clock,
    initialActiveTabId: "tab-off",
    initialConnectivity: { online: false, validated: false, transport: "offline" },
    onSignal: (s) => signals.push(s),
  });

  const outcome = coord.pageStarted("tab-off", "https://unseen.example.com/page", {
    method: "GET",
  });
  const evalOut = evaluateOfflineNavigation("https://unseen.example.com/page", [
    {
      id: "cap-1",
      url: "https://saved.example.com/story",
      title: "Saved Story",
      savedAt: Date.now(),
      contentHtml: "<p>Saved offline</p>",
      rawText: "Saved offline",
      byteSize: 24,
    },
  ]);
  const elapsedMs = performance.now() - t0;

  const pass =
    elapsedMs < 150 &&
    outcome.state.isLoading === false &&
    outcome.state.fastOfflineActive === true &&
    signals.some((s) => s.type === "FAST_OFFLINE_STATE") &&
    evalOut.failedFast === true &&
    evalOut.errorCode === "ERR_INTERNET_DISCONNECTED" &&
    evalOut.honestMessageEn === HONEST_OFFLINE_UNSAVED_MESSAGE_EN &&
    evalOut.savedCapsules.length === 1;

  assertTest(
    "Offline navigation to unseen URL fails fast (<150ms) with honest message and saved capsules",
    pass,
    `elapsedMs=${elapsedMs.toFixed(2)}ms, fastOfflineActive=${outcome.state.fastOfflineActive}, msg="${evalOut.honestMessageEn}", capsules=${evalOut.savedCapsules.length}`
  );
  coord.destroy();
}

console.table(rows);
console.log(`ALL ${rows.length}/${rows.length} NETWORK RESILIENCE TESTS PASSED.`);
