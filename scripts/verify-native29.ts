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
  AudioFocusState,
} from "../src/services/androidWebViewBackgroundMediaAndAutoplayBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative29Verification() {
  console.log("=== STARTING NATIVE-29 MEDIA RESOURCE LIFETIME & MEMORY PRESSURE GOVERNANCE SUITE ===");

  // -------------------------------------------------------------
  // 1. RESOURCE ALLOCATION & PER-TAB ACCOUNTING
  // -------------------------------------------------------------
  console.log("1. Testing Per-Tab Media Resource Accounting...");

  const resourceManager = createAndroidWebViewMediaResourceManager({
    maxTabMediaMemoryBytes: 60 * 1024 * 1024, // 60MB for testing
    maxGlobalMediaMemoryBytes: 150 * 1024 * 1024, // 150MB
    maxVideoDecodersPerTab: 1, // 1 video decoder per tab
    maxGlobalVideoDecoders: 2,
    idleTimeoutMs: 1000, // 1 second for test speed
    maxBackgroundPlaybackDurationMs: 2000, // 2 seconds for test
    defaultAudioBufferBytes: 10 * 1024 * 1024, // 10MB
    defaultVideoBufferBytes: 40 * 1024 * 1024, // 40MB
  });

  const tab1 = "tab-one";
  const tab2 = "tab-two";
  const origin1 = "https://media.one.org";
  const origin2 = "https://media.two.org";

  resourceManager.setActiveForegroundTab(tab1);

  // Tab 1 allocates audio
  const audioAlloc1 = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "audio",
    "https://media.one.org/song.mp3"
  );
  assert(audioAlloc1.success && Boolean(audioAlloc1.resource), "Tab 1 audio resource allocated");
  assert(audioAlloc1.resource?.estimatedMemoryBytes === 10 * 1024 * 1024, "Audio estimated at 10MB");
  assert(!audioAlloc1.resource?.allocatesDecoder, "Audio does not allocate video decoder");

  // Tab 1 allocates video (40MB + 1 video decoder)
  const videoAlloc1 = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "video",
    "https://media.one.org/clip.mp4"
  );
  assert(videoAlloc1.success && Boolean(videoAlloc1.resource), "Tab 1 video resource allocated");
  assert(videoAlloc1.resource?.allocatesDecoder, "Video allocates decoder instance");

  const tab1Account = resourceManager.getTabAccounting(tab1);
  assert(tab1Account.totalMemoryBytes === 50 * 1024 * 1024, "Tab 1 accounting shows 50MB allocated (10MB + 40MB)");
  assert(tab1Account.videoDecoderCount === 1, "Tab 1 video decoder count is 1");

  console.log("✓ Per-tab media resource accounting verified.");

  // -------------------------------------------------------------
  // 2. RESOURCE QUOTA & DECODER LIMIT ENFORCEMENT
  // -------------------------------------------------------------
  console.log("2. Testing Resource Quota & Video Decoder Limits...");

  // Exceeding video decoder limit per tab (limit is 1)
  const videoExceed = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "video",
    "https://media.one.org/clip2.mp4"
  );
  assert(!videoExceed.success && videoExceed.errorCode === "LIMIT_EXCEEDED", "Exceeding video decoders per tab blocked");

  // Exceeding tab memory limit (limit is 60MB, currently at 50MB, allocating 40MB video fails)
  // Even an audio stream (10MB) would take it to 60MB, allocating second 10MB audio would exceed 60MB
  const audioAlloc2 = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "audio",
    "https://media.one.org/song2.mp3"
  );
  assert(audioAlloc2.success, "Tab 1 reaches exactly 60MB limit");

  const audioExceedMemory = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "audio",
    "https://media.one.org/song3.mp3"
  );
  assert(!audioExceedMemory.success && audioExceedMemory.errorCode === "LIMIT_EXCEEDED", "Tab memory quota limit strictly enforced");

  console.log("✓ Resource quotas and decoder limits verified.");

  // -------------------------------------------------------------
  // 3. DUPLICATE RESOURCE CLEANUP & DEDUPLICATION
  // -------------------------------------------------------------
  console.log("3. Testing Duplicate Resource Deduplication...");

  const dupAlloc = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "audio",
    "https://media.one.org/song.mp3"
  );
  assert(dupAlloc.success && dupAlloc.isDeduplicated === true, "Duplicate media resource detected & deduplicated");
  assert(dupAlloc.resource?.resourceId === audioAlloc1.resource?.resourceId, "Returns existing resource handle without memory inflation");

  console.log("✓ Duplicate resource deduplication verified.");

  // -------------------------------------------------------------
  // 4. RESOURCE LIFETIME CONTROL & STALE/IDLE CLEANUP
  // -------------------------------------------------------------
  console.log("4. Testing Resource Lifetime Control & Idle Reclaiming...");

  // Tab 2 (background) allocates audio
  const audioAllocTab2 = resourceManager.allocateMediaResource(
    tab2,
    origin2,
    "audio",
    "https://media.two.org/bg.mp3"
  );
  assert(audioAllocTab2.success, "Tab 2 background audio allocated");

  // Simulate background playback exceeding maxBackgroundPlaybackDurationMs (2000ms)
  const tab2Res = audioAllocTab2.resource!;
  tab2Res.lastActiveAt = Date.now() - 3000;
  resourceManager.updateResourceActivity(tab2Res.resourceId, true);
  assert(tab2Res.state === MediaResourceState.STALE_EXPIRED, "Long-running background playback expired to STALE_EXPIRED");

  // Reclaim stale resources
  const reclaimResult = resourceManager.reclaimIdleAndStaleResources();
  assert(reclaimResult.reclaimedCount >= 1, "Stale background resource reclaimed");
  assert(resourceManager.getResourcesForTab(tab2).length === 0, "Tab 2 resource cleaned up after expiration");

  console.log("✓ Resource lifetime control and idle reclamation verified.");

  // -------------------------------------------------------------
  // 5. MEMORY PRESSURE DETECTION & SAFE CLEANUP
  // -------------------------------------------------------------
  console.log("5. Testing Memory Pressure Detection & Safe Eviction...");

  // Allocate in background tab 2
  const bgAudio2 = resourceManager.allocateMediaResource(
    tab2,
    origin2,
    "audio",
    "https://media.two.org/bg2.mp3"
  );
  assert(bgAudio2.success, "Tab 2 new background audio allocated");

  // Pause it to make it PAUSED_IDLE
  resourceManager.updateResourceActivity(bgAudio2.resource!.resourceId, false);

  // Trigger memory pressure (MODERATE)
  const pressureCleanup = resourceManager.handleMemoryPressure(MemoryPressureLevel.MODERATE);
  assert(pressureCleanup.evictedCount >= 1, "Background paused session evicted under memory pressure");

  // Verify active foreground tab 1 resources were protected
  const tab1Remaining = resourceManager.getResourcesForTab(tab1);
  assert(tab1Remaining.length > 0, "Active foreground tab 1 resources shielded from pressure eviction");

  console.log("✓ Memory pressure detection and safe eviction verified.");

  // -------------------------------------------------------------
  // 6. FOREGROUND / BACKGROUND TRANSITION CONSISTENCY
  // -------------------------------------------------------------
  console.log("6. Testing Foreground / Background Transition Consistency...");

  // Tab 1 currently foreground with video
  const tab1VideoRes = videoAlloc1.resource!;
  assert(tab1VideoRes.state === MediaResourceState.ACTIVE_PLAYING, "Foreground video is ACTIVE_PLAYING");

  // Switch foreground to Tab 2
  resourceManager.setActiveForegroundTab(tab2);
  assert(tab1VideoRes.state === MediaResourceState.BACKGROUND_THROTTLED, "Video throttled when tab moved to background");

  // Switch back to Tab 1
  resourceManager.setActiveForegroundTab(tab1);
  assert(tab1VideoRes.state === MediaResourceState.ACTIVE_PLAYING, "Video restored to ACTIVE_PLAYING when tab returned to foreground");

  console.log("✓ Foreground/background transition consistency verified.");

  // -------------------------------------------------------------
  // 7. PRIVATE TAB RESOURCE ISOLATION & LIFECYCLE CLEANUP
  // -------------------------------------------------------------
  console.log("7. Testing Private Mode Isolation & Lifecycle Cleanups...");

  const privTab = "tab-private-governed";
  const privAlloc = resourceManager.allocateMediaResource(
    privTab,
    "https://secret.org",
    "audio",
    "https://secret.org/audio.mp3",
    true
  );
  assert(privAlloc.success && privAlloc.resource?.isPrivate, "Private media resource allocated");

  // Close private tab
  resourceManager.onTabClosed(privTab, true, 0);
  assert(resourceManager.getResourcesForTab(privTab).length === 0, "Private tab resources purged on close");

  // Navigation cleanup
  resourceManager.onNavigation(tab1, "https://media.one.org/new-page");
  assert(resourceManager.getResourcesForTab(tab1).length === 0, "All resources released on tab navigation");
  assert(resourceManager.getTabAccounting(tab1).totalMemoryBytes === 0, "Tab memory reset to 0 after navigation");

  console.log("✓ Private mode isolation and lifecycle cleanups verified.");

  // -------------------------------------------------------------
  // 8. SECURITY & SSRF MEDIA URL PROTECTION
  // -------------------------------------------------------------
  console.log("8. Testing Security & SSRF Protection...");

  const ssrfAlloc = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "audio",
    "https://169.254.169.254/latest/meta-data"
  );
  assert(!ssrfAlloc.success && ssrfAlloc.errorCode === "SECURITY_ERROR", "SSRF metadata IP blocked");

  const dangerousSchemeAlloc = resourceManager.allocateMediaResource(
    tab1,
    origin1,
    "video",
    "javascript:alert(1)"
  );
  assert(!dangerousSchemeAlloc.success && dangerousSchemeAlloc.errorCode === "SECURITY_ERROR", "javascript: scheme blocked");

  console.log("✓ Security and SSRF protection verified.");

  // -------------------------------------------------------------
  // 9. NATIVE-28 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("9. Testing NATIVE-28 Quick Regression...");

  const govManager = createAndroidWebViewMediaSessionGovernanceManager({
    maxSessionsPerTab: 5,
    maxGlobalAudioSessions: 8,
    duckVolumeLevel: 0.15,
  });

  const regTabA = "reg-tab-a";
  const regTabB = "reg-tab-b";
  govManager.setActiveForegroundTab(regTabA);

  const regSessionA = govManager.requestMediaSession(regTabA, "https://a.com", {
    mediaType: "audio",
    sourceUrl: "https://a.com/a.mp3",
    isMuted: false,
    volume: 1.0,
  });
  assert(regSessionA.success && Boolean(regSessionA.session), "NATIVE-28 reg session A created");

  const regSessionB = govManager.requestMediaSession(regTabB, "https://b.com", {
    mediaType: "audio",
    sourceUrl: "https://b.com/b.mp3",
    isMuted: false,
    volume: 0.8,
  });
  assert(regSessionB.success && Boolean(regSessionB.session), "NATIVE-28 reg session B created");

  // In DUCK_BACKGROUND: background session B is ducked
  const currentRegB = govManager.getSessionById(regSessionB.session!.sessionId);
  assert(currentRegB?.state === MediaSessionState.DUCKED, "NATIVE-28 session B is ducked");
  assert(currentRegB?.effectiveVolume === 0.15, "NATIVE-28 ducked volume is 0.15");

  // Switch to EXCLUSIVE mode
  govManager.setArbitrationMode(AudioArbitrationMode.EXCLUSIVE);
  const exclusiveRegB = govManager.getSessionById(regSessionB.session!.sessionId);
  assert(exclusiveRegB?.state === MediaSessionState.PAUSED_BY_ARBITRATION, "NATIVE-28 exclusive mode pauses background");

  // Pause session A -> session B recovers
  govManager.pauseSession(regSessionA.session!.sessionId, "user");
  const recoveredRegB = govManager.getSessionById(regSessionB.session!.sessionId);
  assert(recoveredRegB?.state === MediaSessionState.PLAYING, "NATIVE-28 session B recovers");

  // Duplicate session check
  const regDup = govManager.requestMediaSession(regTabB, "https://b.com", {
    mediaType: "audio",
    sourceUrl: "https://b.com/b.mp3",
    isMuted: false,
  });
  assert(regDup.success && regDup.isDeduplicated === true, "NATIVE-28 deduplication holds");

  // Cleanup check
  govManager.onTabClosed(regTabB, false, 0);
  assert(govManager.getSessionsForTab(regTabB).length === 0, "NATIVE-28 lifecycle tab close works");

  console.log("✓ NATIVE-28 quick regression passed.");

  // -------------------------------------------------------------
  // 10. NATIVE-27 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("10. Testing NATIVE-27 Quick Regression...");

  const bgMedia = createAndroidWebViewBackgroundMediaManager();

  const evalMuted = bgMedia.evaluateAutoplay("t1", "https://example.com", true, "https://example.com/v.mp4");
  assert(evalMuted.allowed && evalMuted.errorCode === "AUTOPLAY_ALLOWED_MUTED", "NATIVE-27 muted autoplay allowed");

  const evalUnmuted = bgMedia.evaluateAutoplay("t1", "https://example.com", false, "https://example.com/v.mp4");
  assert(!evalUnmuted.allowed && evalUnmuted.errorCode === "AUTOPLAY_BLOCKED_UNMUTED", "NATIVE-27 unmuted blocked without gesture");

  bgMedia.recordUserGesture("t1", "https://example.com");
  const evalWithGest = bgMedia.evaluateAutoplay("t1", "https://example.com", false, "https://example.com/v.mp4");
  assert(evalWithGest.allowed && evalWithGest.errorCode === "AUTOPLAY_ALLOWED", "NATIVE-27 unmuted allowed with gesture");

  assert(!validateMediaUrl("file:///etc/passwd").isValid, "NATIVE-27 file: url rejected");
  assert(!validateMediaUrl("https://10.0.0.1/video.mp4").isValid, "NATIVE-27 private subnet rejected");

  console.log("✓ NATIVE-27 quick regression passed.");

  console.log("=== ALL NATIVE-29, NATIVE-28, AND NATIVE-27 SUITES COMPLETED SUCCESSFULLY ===");
}

runNative29Verification().catch((err) => {
  console.error("NATIVE-29 VERIFICATION FAILED:", err);
  process.exit(1);
});
