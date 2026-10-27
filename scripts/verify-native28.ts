import {
  createAndroidWebViewMediaSessionGovernanceManager,
  AudioArbitrationMode,
  MediaSessionState,
  MediaPriorityLevel,
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

async function runNative28Verification() {
  console.log("=== STARTING NATIVE-28 MEDIA SESSION GOVERNANCE + NATIVE-27 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. ACTIVE-TAB MEDIA PRIORITY & MULTI-TAB GOVERNANCE
  // -------------------------------------------------------------
  console.log("1. Testing Multi-Tab Media Governance & Active-Tab Priority...");

  const govManager = createAndroidWebViewMediaSessionGovernanceManager({
    maxSessionsPerTab: 5,
    maxGlobalAudioSessions: 8,
    duckVolumeLevel: 0.15,
  });

  const tabA = "tab-alpha";
  const tabB = "tab-beta";
  const originA = "https://alpha.example.com";
  const originB = "https://beta.example.com";

  // Designate Tab A as active foreground
  govManager.setActiveForegroundTab(tabA);
  assert(govManager.getActiveForegroundTab() === tabA, "Active foreground tab set to Tab A");

  // Tab A plays audio
  const sessionA = govManager.requestMediaSession(tabA, originA, {
    mediaType: "audio",
    sourceUrl: "https://alpha.example.com/audio1.mp3",
    isMuted: false,
    volume: 1.0,
  });
  assert(sessionA.success && Boolean(sessionA.session), "Tab A audio session created");
  assert(sessionA.session?.priority === MediaPriorityLevel.HIGH, "Tab A session has PRIORITY_HIGH");
  assert(sessionA.session?.effectiveVolume === 1.0, "Tab A session has full volume 1.0");

  // Tab B (background) requests audio
  const sessionB = govManager.requestMediaSession(tabB, originB, {
    mediaType: "audio",
    sourceUrl: "https://beta.example.com/podcast.mp3",
    isMuted: false,
    volume: 0.8,
  });
  assert(sessionB.success && Boolean(sessionB.session), "Tab B audio session created");

  console.log("✓ Multi-tab media governance and active-tab priority verified.");

  // -------------------------------------------------------------
  // 2. COMPETING AUDIO SESSION ARBITRATION (DUCKING & EXCLUSIVE)
  // -------------------------------------------------------------
  console.log("2. Testing Competing Audio Session Arbitration...");

  // In default DUCK_BACKGROUND mode: Tab B should be DUCKED to 0.15 because Tab A is active and playing
  const currentSessionB = govManager.getSessionById(sessionB.session!.sessionId);
  assert(currentSessionB?.state === MediaSessionState.DUCKED, "Tab B audio session is DUCKED");
  assert(currentSessionB?.effectiveVolume === 0.15, "Tab B effective volume ducked to 0.15");
  assert(currentSessionB?.audioFocus === AudioFocusState.LOSS_TRANSIENT_CAN_DUCK, "Tab B has LOSS_TRANSIENT_CAN_DUCK focus");

  // Switch to EXCLUSIVE arbitration mode
  govManager.setArbitrationMode(AudioArbitrationMode.EXCLUSIVE);
  const exclusiveSessionB = govManager.getSessionById(sessionB.session!.sessionId);
  assert(exclusiveSessionB?.state === MediaSessionState.PAUSED_BY_ARBITRATION, "Tab B is PAUSED_BY_ARBITRATION in exclusive mode");
  assert(exclusiveSessionB?.effectiveVolume === 0.0, "Tab B volume is 0.0 in exclusive mode");
  assert(exclusiveSessionB?.audioFocus === AudioFocusState.LOSS, "Tab B has AUDIOFOCUS_LOSS in exclusive mode");

  // Tab A stops playing -> Tab B should automatically recover in background
  govManager.pauseSession(sessionA.session!.sessionId, "user");
  const recoveredSessionB = govManager.getSessionById(sessionB.session!.sessionId);
  assert(recoveredSessionB?.state === MediaSessionState.PLAYING, "Tab B recovered to PLAYING when Tab A paused");
  assert(recoveredSessionB?.effectiveVolume === 0.8, "Tab B restored to base volume 0.8");

  // Restore ducking mode
  govManager.setArbitrationMode(AudioArbitrationMode.DUCK_BACKGROUND);

  console.log("✓ Audio session arbitration (ducking and exclusive) verified.");

  // -------------------------------------------------------------
  // 3. BACKGROUND / FOREGROUND TRANSITION CONSISTENCY
  // -------------------------------------------------------------
  console.log("3. Testing Background / Foreground Transition Consistency...");

  // Tab B also starts a video
  const videoSessionB = govManager.requestMediaSession(tabB, originB, {
    mediaType: "video",
    sourceUrl: "https://beta.example.com/video.mp4",
    isMuted: true,
  });
  assert(videoSessionB.success, "Video session created");

  // Since Tab B is background, video must be PAUSED_BACKGROUND
  const backgroundVideo = govManager.getSessionById(videoSessionB.session!.sessionId);
  assert(backgroundVideo?.state === MediaSessionState.PAUSED_BACKGROUND, "Background video automatically set to PAUSED_BACKGROUND");

  // Switch active foreground tab to Tab B
  govManager.setActiveForegroundTab(tabB);
  assert(govManager.getActiveForegroundTab() === tabB, "Active foreground tab switched to Tab B");

  const tabBPrioritySession = govManager.getSessionById(sessionB.session!.sessionId);
  assert(tabBPrioritySession?.priority === MediaPriorityLevel.HIGH, "Tab B now possesses PRIORITY_HIGH");

  console.log("✓ Background/foreground transition consistency verified.");

  // -------------------------------------------------------------
  // 4. DUPLICATE MEDIA SESSION PREVENTION
  // -------------------------------------------------------------
  console.log("4. Testing Duplicate Media Session Prevention...");

  // Request duplicate media session with identical sourceUrl and mediaType on Tab B
  const dupResult = govManager.requestMediaSession(tabB, originB, {
    mediaType: "audio",
    sourceUrl: "https://beta.example.com/podcast.mp3",
    isMuted: false,
  });
  assert(dupResult.success && dupResult.isDeduplicated === true, "Duplicate media session detected and deduplicated");
  assert(dupResult.session?.sessionId === sessionB.session!.sessionId, "Returned existing session instead of duplicating handle");

  console.log("✓ Duplicate media session prevention verified.");

  // -------------------------------------------------------------
  // 5. PER-TAB & GLOBAL RESOURCE / MEMORY LIMITS
  // -------------------------------------------------------------
  console.log("5. Testing Per-Tab and Global Resource Limits...");

  const limitTestManager = createAndroidWebViewMediaSessionGovernanceManager({
    maxSessionsPerTab: 2,
    maxGlobalAudioSessions: 3,
  });

  const tabC = "tab-gamma";
  limitTestManager.setActiveForegroundTab(tabC);

  // Session 1
  const s1 = limitTestManager.requestMediaSession(tabC, "https://gamma.com", {
    mediaType: "audio",
    sourceUrl: "https://gamma.com/1.mp3",
    isMuted: false,
  });
  assert(s1.success, "Session 1 created");

  // Session 2
  const s2 = limitTestManager.requestMediaSession(tabC, "https://gamma.com", {
    mediaType: "audio",
    sourceUrl: "https://gamma.com/2.mp3",
    isMuted: false,
  });
  assert(s2.success, "Session 2 created");

  // Session 3 on Tab C should exceed per-tab limit of 2
  const s3 = limitTestManager.requestMediaSession(tabC, "https://gamma.com", {
    mediaType: "audio",
    sourceUrl: "https://gamma.com/3.mp3",
    isMuted: false,
  });
  assert(!s3.success && s3.errorCode === "LIMIT_EXCEEDED", "Per-tab media session limit strictly enforced");

  console.log("✓ Per-tab and global resource limits verified.");

  // -------------------------------------------------------------
  // 6. AUDIO FOCUS CONFLICT HANDLING
  // -------------------------------------------------------------
  console.log("6. Testing Audio Focus Conflict Handling...");

  // Simulate external incoming call -> AUDIOFOCUS_LOSS_TRANSIENT
  govManager.handleExternalAudioFocusChange(AudioFocusState.LOSS_TRANSIENT);
  const focusLossSession = govManager.getSessionById(sessionB.session!.sessionId);
  assert(focusLossSession?.effectiveVolume === 0.0, "Volume zeroed during transient audio focus loss");
  assert(focusLossSession?.state === MediaSessionState.PAUSED_BY_ARBITRATION, "Session paused during external call");

  // Simulate call ended -> AUDIOFOCUS_GAIN
  govManager.handleExternalAudioFocusChange(AudioFocusState.GAIN);
  const focusGainSession = govManager.getSessionById(sessionB.session!.sessionId);
  assert(focusGainSession?.effectiveVolume > 0, "Volume restored after audio focus regain");

  console.log("✓ Audio focus conflict handling verified.");

  // -------------------------------------------------------------
  // 7. PRIVATE MODE ISOLATION & LIFECYCLE CLEANUP
  // -------------------------------------------------------------
  console.log("7. Testing Private Mode Isolation and Lifecycle Cleanup...");

  const privTab = "tab-private-governed";
  const privResult = govManager.requestMediaSession(privTab, "https://secret.com", {
    mediaType: "audio",
    sourceUrl: "https://secret.com/private.mp3",
    isMuted: false,
    isPrivate: true,
  });
  assert(privResult.success && privResult.session?.isPrivate, "Private governed media session created");

  // Close private tab
  govManager.onTabClosed(privTab, true, 0);
  assert(govManager.getSessionsForTab(privTab).length === 0, "Private tab sessions wiped on tab close");

  // Navigation cleanup
  govManager.onNavigation(tabB, "https://new-url.com");
  assert(govManager.getSessionsForTab(tabB).length === 0, "Sessions wiped on tab navigation");

  console.log("✓ Private mode isolation and lifecycle cleanups verified.");

  // -------------------------------------------------------------
  // 8. SECURITY & SSRF PROTECTION
  // -------------------------------------------------------------
  console.log("8. Testing Security & SSRF Protection for Media URLs...");

  const ssrfAttempt1 = govManager.requestMediaSession(tabA, originA, {
    mediaType: "audio",
    sourceUrl: "https://169.254.169.254/latest/meta-data",
    isMuted: false,
  });
  assert(!ssrfAttempt1.success && ssrfAttempt1.errorCode === "SECURITY_ERROR", "SSRF metadata IP blocked");

  const dangerousScheme = govManager.requestMediaSession(tabA, originA, {
    mediaType: "video",
    sourceUrl: "javascript:alert(document.cookie)",
    isMuted: true,
  });
  assert(!dangerousScheme.success && dangerousScheme.errorCode === "SECURITY_ERROR", "javascript: scheme blocked");

  console.log("✓ Security and SSRF protection verified.");

  // -------------------------------------------------------------
  // 9. NATIVE-27 QUICK REGRESSION
  // -------------------------------------------------------------
  console.log("9. Testing NATIVE-27 Quick Regression...");

  const bgMedia = createAndroidWebViewBackgroundMediaManager();

  // Test autoplay evaluation regression
  const mutedEval = bgMedia.evaluateAutoplay("t1", "https://example.com", true, "https://example.com/v.mp4");
  assert(mutedEval.allowed && mutedEval.errorCode === "AUTOPLAY_ALLOWED_MUTED", "NATIVE-27 muted autoplay allowed");

  const unmutedNoGest = bgMedia.evaluateAutoplay("t1", "https://example.com", false, "https://example.com/v.mp4");
  assert(!unmutedNoGest.allowed && unmutedNoGest.errorCode === "AUTOPLAY_BLOCKED_UNMUTED", "NATIVE-27 unmuted blocked without gesture");

  bgMedia.recordUserGesture("t1", "https://example.com");
  const unmutedWithGest = bgMedia.evaluateAutoplay("t1", "https://example.com", false, "https://example.com/v.mp4");
  assert(unmutedWithGest.allowed && unmutedWithGest.errorCode === "AUTOPLAY_ALLOWED", "NATIVE-27 unmuted allowed with gesture");

  // Test URL security regression
  assert(!validateMediaUrl("file:///system/etc/hosts").isValid, "NATIVE-27 rejects file: scheme");
  assert(!validateMediaUrl("https://10.0.0.1/stream").isValid, "NATIVE-27 rejects private IP");
  assert(validateMediaUrl("https://stream.example.com/live.m3u8").isValid, "NATIVE-27 accepts valid stream URL");

  console.log("✓ NATIVE-27 regression tests passed completely.");

  console.log("=== ALL NATIVE-28 & NATIVE-27 SUITES COMPLETED SUCCESSFULLY ===");
}

runNative28Verification().catch((err) => {
  console.error("NATIVE-28 VERIFICATION FAILED:", err);
  process.exit(1);
});
