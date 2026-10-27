/**
 * Verification Script for NETFLOW-V2-NATIVE-34:
 * WebView Redirect Chain & Navigation Safety
 */

import {
  createAndroidWebViewRedirectChainManager,
  validateTargetUrlSafety,
  RedirectFailureReason,
  RedirectChainStatus,
} from "../src/services/androidWebViewRedirectChainAndNavigationSafety";

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

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runNative34Suite() {
  console.log("=== STARTING NATIVE-34 WEBVIEW REDIRECT CHAIN & NAVIGATION SAFETY SUITE ===");

  const redirectMgr = createAndroidWebViewRedirectChainManager();

  // -------------------------------------------------------------
  // 1. DANGEROUS SCHEMES & SSRF / INTERNAL DESTINATIONS BLOCKING
  // -------------------------------------------------------------
  console.log("1. Testing Dangerous Schemes & SSRF/Internal Destination Blocking...");

  const dangerousSchemes = [
    "javascript:alert(1)",
    "data:text/html,<h1>PWNED</h1>",
    "file:///etc/passwd",
    "intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;end",
    "content://media/external/images/media/1",
    "about:blank",
    "chrome://version",
    "blob:https://example.com/uuid",
  ];

  for (const ds of dangerousSchemes) {
    const check = validateTargetUrlSafety(ds);
    assert(!check.isSafe, `Dangerous scheme must be blocked: ${ds}`);
    assert(
      check.reason === RedirectFailureReason.DANGEROUS_SCHEME,
      `Reason must be DANGEROUS_SCHEME for: ${ds}`
    );
  }

  const ssrfTargets = [
    "http://127.0.0.1:8080/admin",
    "http://localhost:3000/api",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/internal",
    "http://192.168.1.1/router",
    "http://172.16.0.1/private",
    "http://database.internal/query",
    "http://myhost.local/secret",
  ];

  for (const ssrf of ssrfTargets) {
    const check = validateTargetUrlSafety(ssrf);
    assert(!check.isSafe, `SSRF target must be blocked: ${ssrf}`);
    assert(
      check.reason === RedirectFailureReason.BLOCKED_INTERNAL_DESTINATION,
      `Reason must be BLOCKED_INTERNAL_DESTINATION for: ${ssrf}`
    );
  }

  console.log("✓ Dangerous schemes and SSRF defenses verified.");

  // -------------------------------------------------------------
  // 2. HTTP/HTTPS REDIRECT CHAIN TRACKING WITH PER-HOP AUDITING
  // -------------------------------------------------------------
  console.log("2. Testing Redirect Chain Tracking & Per-Hop Auditing...");

  const tab1 = "tab-redir-1";
  const chain1 = redirectMgr.startChain({
    tabId: tab1,
    initialUrl: "https://short.ly/xyz",
    initialHeaders: { "User-Agent": "NetflowMobile/1.0", "Authorization": "Bearer secret-token" },
  });

  assert(typeof chain1.chainId === "string", "Chain ID created");
  assert(chain1.chainEpoch === 1, "Initial chain epoch is 1");

  // Hop 1: 301 to intermediate
  const hop1 = redirectMgr.recordHop({
    chainId: chain1.chainId,
    tabId: tab1,
    targetUrl: "https://tracker.net/click?id=123",
    statusCode: 301,
  });
  assert(hop1.allowed, "Hop 1 allowed");
  assert(!hop1.isDowngrade, "Hop 1 is not a downgrade");
  assert(hop1.scrubbedHeaders?.["Authorization"] === undefined, "Authorization header scrubbed on cross-origin redirect");

  // Hop 2: 302 to final destination
  const hop2 = redirectMgr.recordHop({
    chainId: chain1.chainId,
    tabId: tab1,
    targetUrl: "https://destination.org/welcome",
    statusCode: 302,
  });
  assert(hop2.allowed, "Hop 2 allowed");

  // Complete chain
  const completeRes = redirectMgr.completeChain({
    chainId: chain1.chainId,
    tabId: tab1,
    finalUrl: "https://destination.org/welcome",
  });
  assert(completeRes.success, "Chain completed successfully");
  assert(completeRes.hopCount === 2, "Chain has exactly 2 hops");

  const state = redirectMgr.getChainState(chain1.chainId);
  assert(state?.status === RedirectChainStatus.COMPLETED, "Chain status is COMPLETED");
  assert(state?.hops.length === 2, "State records 2 hops");
  assert(state?.hops[0].statusCode === 301, "Hop 0 is 301");
  assert(state?.hops[1].statusCode === 302, "Hop 1 is 302");

  console.log("✓ Redirect chain tracking and per-hop auditing verified.");

  // -------------------------------------------------------------
  // 3. REDIRECT LOOP PROTECTION
  // -------------------------------------------------------------
  console.log("3. Testing Redirect Loop Protection...");

  const tabLoop = "tab-redir-loop";
  const chainLoop = redirectMgr.startChain({
    tabId: tabLoop,
    initialUrl: "https://site-a.com/start",
  });

  // Hop A -> B
  const loopHop1 = redirectMgr.recordHop({
    chainId: chainLoop.chainId,
    tabId: tabLoop,
    targetUrl: "https://site-b.com/forward",
    statusCode: 302,
  });
  assert(loopHop1.allowed, "Site A -> Site B allowed");

  // Hop B -> A (Loop!)
  const loopHop2 = redirectMgr.recordHop({
    chainId: chainLoop.chainId,
    tabId: tabLoop,
    targetUrl: "https://site-a.com/start",
    statusCode: 302,
  });
  assert(!loopHop2.allowed, "Circular loop A -> B -> A blocked");
  assert(loopHop2.reason === RedirectFailureReason.REDIRECT_LOOP_DETECTED, "Reason is REDIRECT_LOOP_DETECTED");

  const loopState = redirectMgr.getChainState(chainLoop.chainId);
  assert(loopState?.status === RedirectChainStatus.BLOCKED, "Chain status marked BLOCKED");

  console.log("✓ Redirect loop protection verified.");

  // -------------------------------------------------------------
  // 4. EXCESSIVE REDIRECTS CEILING (MAX 15 HOPS)
  // -------------------------------------------------------------
  console.log("4. Testing Excessive Redirects Ceiling...");

  const tabExcess = "tab-redir-excess";
  const chainExcess = redirectMgr.startChain({
    tabId: tabExcess,
    initialUrl: "https://hop0.org",
  });

  for (let i = 1; i <= 15; i++) {
    const res = redirectMgr.recordHop({
      chainId: chainExcess.chainId,
      tabId: tabExcess,
      targetUrl: `https://hop${i}.org`,
      statusCode: 302,
    });
    assert(res.allowed, `Hop ${i} within ceiling allowed`);
  }

  // 16th Hop: Exceeds limit
  const hop16 = redirectMgr.recordHop({
    chainId: chainExcess.chainId,
    tabId: tabExcess,
    targetUrl: "https://hop16.org",
    statusCode: 302,
  });
  assert(!hop16.allowed, "16th hop blocked");
  assert(hop16.reason === RedirectFailureReason.EXCESSIVE_REDIRECTS, "Reason is EXCESSIVE_REDIRECTS");

  console.log("✓ Excessive redirects ceiling verified.");

  // -------------------------------------------------------------
  // 5. HTTPS -> HTTP DOWNGRADE DETECTION
  // -------------------------------------------------------------
  console.log("5. Testing HTTPS -> HTTP Downgrade Detection & Header Scrubbing...");

  const tabDown = "tab-redir-down";
  const chainDown = redirectMgr.startChain({
    tabId: tabDown,
    initialUrl: "https://secure-bank.com/login",
    initialHeaders: { "Cookie": "session=xyz123", "User-Agent": "NetflowMobile/1.0" },
  });

  const downHop = redirectMgr.recordHop({
    chainId: chainDown.chainId,
    tabId: tabDown,
    targetUrl: "http://insecure-partner.com/callback",
    statusCode: 302,
  });

  assert(downHop.allowed, "Hop allowed with downgrade alert");
  assert(downHop.isDowngrade === true, "Downgrade detected as true");
  assert(downHop.scrubbedHeaders?.["Cookie"] === undefined, "Cookie scrubbed on downgrade");
  assert(downHop.scrubbedHeaders?.["User-Agent"] === "NetflowMobile/1.0", "Non-sensitive headers preserved");

  console.log("✓ HTTPS -> HTTP downgrade detection and header scrubbing verified.");

  // -------------------------------------------------------------
  // 6. RAPID NAVIGATION & STALE CALLBACK PROTECTION
  // -------------------------------------------------------------
  console.log("6. Testing Rapid Navigation & Stale Callback Protection...");

  const tabRace = "tab-redir-race";
  const raceChain = redirectMgr.startChain({
    tabId: tabRace,
    initialUrl: "https://slow-site.com/nav",
  });
  const initialEpoch = raceChain.chainEpoch;

  // User rapidly navigates to another URL before redirect finishes
  const navEpoch = redirectMgr.onTabNavigation(tabRace, "https://fresh-site.com").newEpoch;
  assert(navEpoch > initialEpoch, "Navigation advanced chain epoch");

  // Outdated redirect hop arrives late
  const staleHop = redirectMgr.recordHop({
    chainId: raceChain.chainId,
    tabId: tabRace,
    targetUrl: "https://slow-site.com/deferred-hop",
    statusCode: 302,
  });
  assert(!staleHop.allowed, "Stale epoch redirect hop rejected");
  assert(staleHop.reason === RedirectFailureReason.STALE_CHAIN_EPOCH, "STALE_CHAIN_EPOCH");

  // Attempt to execute callback with outdated epoch
  let executedStale = false;
  const guardedRes = redirectMgr.executeGuardedRedirectCallback(tabRace, initialEpoch, () => {
    executedStale = true;
    return "stale";
  });
  assert(!executedStale, "Stale callback did not execute");
  assert(guardedRes.staleEpochDetected === true, "Stale epoch detected flag true");

  console.log("✓ Rapid navigation & stale callback protection verified.");

  // -------------------------------------------------------------
  // 7. TAB & PRIVATE-TAB ISOLATION
  // -------------------------------------------------------------
  console.log("7. Testing Tab & Ephemeral Private-Tab Isolation...");

  const privTab = "tab-priv-redir";
  const privChain = redirectMgr.startChain({
    tabId: privTab,
    initialUrl: "https://private-auth.org/step1",
    isPrivate: true,
  });

  redirectMgr.recordHop({
    chainId: privChain.chainId,
    tabId: privTab,
    targetUrl: "https://private-auth.org/step2",
    statusCode: 302,
  });

  assert(redirectMgr.getChainState(privChain.chainId) !== null, "Private chain exists while tab open");

  // Close private tab
  const purgeRes = redirectMgr.onTabClosed(privTab, true);
  assert(purgeRes.purgedChainsCount >= 1, "Private chains purged");
  assert(redirectMgr.getChainState(privChain.chainId) === null, "Private chain expunged completely");

  console.log("✓ Tab and private-tab isolation verified.");

  // -------------------------------------------------------------
  // 8. COMPATIBILITY WITH NATIVE-31, NATIVE-30 & NATIVE-29
  // -------------------------------------------------------------
  console.log("8. Testing Compatibility with NATIVE-31, NATIVE-30 & NATIVE-29...");

  const pageSafety = createAndroidWebViewPageStateAndLifecycleSafetyManager();
  pageSafety.registerTab("tab-compat-34", "https://compat.org");
  const pStarted = pageSafety.onPageStarted("tab-compat-34", "https://compat.org");
  assert(pageSafety.getTabRecord("tab-compat-34")?.state === PageLifecycleState.LOADING, "NATIVE-31 LOADING");
  pageSafety.onDOMContentLoaded("tab-compat-34", pStarted.newEpoch);
  pageSafety.onPageFinished("tab-compat-34", pStarted.newEpoch);
  assert(pageSafety.getTabRecord("tab-compat-34")?.state === PageLifecycleState.LOADED, "NATIVE-31 LOADED");

  const renderManager = createAndroidWebViewRenderingResilienceManager();
  renderManager.registerTab("tab-compat-34", "https://compat.org");
  const renderRes = renderManager.executeGuardedRenderCallback("tab-compat-34", 1, () => "render-ok");
  assert(renderRes.isValid && renderRes.executed, "NATIVE-30 rendering ok");

  const mediaManager = createAndroidWebViewMediaResourceManager();
  mediaManager.setActiveForegroundTab("tab-compat-34");
  const alloc = mediaManager.allocateMediaResource("tab-compat-34", "https://compat.org", "audio", "https://compat.org/media.mp3");
  assert(alloc.success, "NATIVE-29 media resource ok");

  console.log("✓ Compatibility with NATIVE-31, NATIVE-30, and NATIVE-29 verified.");

  console.log("\n================================================================================");
  console.log(">>> ALL NATIVE-34 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<");
  console.log("================================================================================\n");
}

runNative34Suite().catch((err) => {
  console.error("NATIVE-34 Verification Failure:", err);
  process.exit(1);
});
