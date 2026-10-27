import {
  createAndroidWebViewBackgroundMediaManager,
  validateMediaUrl,
  AudioFocusState,
} from "../src/services/androidWebViewBackgroundMediaAndAutoplayBoundary";

import {
  createAndroidWebViewClipboardAndShareManager,
  validateClipboardAndShareOrigin,
  detectSensitiveContent,
  validateShareUrl,
} from "../src/services/androidWebViewClipboardAndShareBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative27Verification() {
  console.log("=== STARTING NATIVE-27 BACKGROUND MEDIA & AUTOPLAY + NATIVE-26 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. SECURITY & SSRF PROTECTION FOR MEDIA SOURCES
  // -------------------------------------------------------------
  console.log("1. Testing Security & SSRF Protection for Media Sources...");

  assert(!validateMediaUrl("javascript:alert(1)").isValid, "Rejects javascript: scheme");
  assert(!validateMediaUrl("file:///sdcard/media.mp4").isValid, "Rejects file: scheme");
  assert(!validateMediaUrl("content://media/internal/audio").isValid, "Rejects content: scheme");
  assert(!validateMediaUrl("data:text/html,<script>").isValid, "Rejects dangerous data: scheme");
  assert(!validateMediaUrl("https://169.254.169.254/media.mp3").isValid, "Rejects cloud metadata SSRF");
  assert(!validateMediaUrl("https://192.168.1.100/stream").isValid, "Rejects private IP 192.168.x.x");
  assert(!validateMediaUrl("https://10.0.0.5/audio").isValid, "Rejects private IP 10.x.x.x");
  assert(!validateMediaUrl("https://172.20.0.1/video").isValid, "Rejects private IP 172.16-31.x.x");
  assert(!validateMediaUrl("https://intranet.local/music").isValid, "Rejects .local domain");
  assert(!validateMediaUrl("https://cluster.internal/stream").isValid, "Rejects .internal domain");

  // Valid media URLs
  assert(validateMediaUrl("https://media.netflow.com/stream.mp4").isValid, "Accepts valid HTTPS media");
  assert(validateMediaUrl("http://localhost:3000/audio.mp3").isValid, "Accepts localhost media");
  assert(validateMediaUrl("blob:https://media.netflow.com/uuid-123").isValid, "Accepts blob: URL");
  assert(validateMediaUrl("data:audio/mp3;base64,AAAA").isValid, "Accepts safe data:audio/ URI");

  console.log("✓ Security and SSRF protection for media sources verified.");

  // -------------------------------------------------------------
  // 2. AUTOPLAY POLICY & USER GESTURE REQUIREMENT
  // -------------------------------------------------------------
  console.log("2. Testing Autoplay Policy & User Gesture Requirement...");

  const mediaManager = createAndroidWebViewBackgroundMediaManager({
    allowBackgroundAudio: true,
    autoPauseBackgroundVideo: true,
    duckVolumeLevel: 0.2,
  });

  const tabA = "tab-alpha";
  const originA = "https://media.example.com";
  const originB = "https://other.example.com";
  const safeVideoUrl = "https://media.example.com/video.mp4";

  // Muted autoplay allowed without user gesture
  const mutedEval = mediaManager.evaluateAutoplay(tabA, originA, true, safeVideoUrl);
  assert(mutedEval.allowed && mutedEval.errorCode === "AUTOPLAY_ALLOWED_MUTED", "Muted autoplay allowed without gesture");

  // Unmuted autoplay BLOCKED without user gesture
  const unmutedNoGestureEval = mediaManager.evaluateAutoplay(tabA, originA, false, safeVideoUrl);
  assert(!unmutedNoGestureEval.allowed && unmutedNoGestureEval.errorCode === "AUTOPLAY_BLOCKED_UNMUTED", "Unmuted autoplay blocked without gesture");

  // Record user gesture for originA on tabA
  mediaManager.recordUserGesture(tabA, originA);
  assert(mediaManager.hasUserGesture(tabA, originA), "User gesture recorded");

  // Unmuted autoplay now ALLOWED
  const unmutedWithGestureEval = mediaManager.evaluateAutoplay(tabA, originA, false, safeVideoUrl);
  assert(unmutedWithGestureEval.allowed && unmutedWithGestureEval.errorCode === "AUTOPLAY_ALLOWED", "Unmuted autoplay allowed after user gesture");

  // Tab & Origin isolation of user gesture:
  // Origin B does not have gesture
  assert(!mediaManager.hasUserGesture(tabA, originB), "Origin B isolated from Origin A gesture");
  const originBEval = mediaManager.evaluateAutoplay(tabA, originB, false, safeVideoUrl);
  assert(!originBEval.allowed, "Unmuted autoplay blocked on origin without gesture");

  // Tab B does not inherit Tab A gesture
  assert(!mediaManager.hasUserGesture("tab-beta", originA), "Tab B isolated from Tab A gesture");

  console.log("✓ Autoplay policy and user gesture boundaries verified.");

  // -------------------------------------------------------------
  // 3. PLAYBACK SESSIONS & BACKGROUND MEDIA CONTROL
  // -------------------------------------------------------------
  console.log("3. Testing Playback Sessions & Background Media Control...");

  // Set tabA as foreground
  mediaManager.setForegroundTab(tabA);

  // Play video on tabA
  const videoPlayRes = mediaManager.requestPlayback(
    tabA,
    originA,
    "video",
    safeVideoUrl,
    true // muted
  );
  assert(videoPlayRes.success && Boolean(videoPlayRes.session), "Video playback started in foreground tab");
  const videoSession = videoPlayRes.session!;

  // Play audio on tabA (unmuted, has gesture)
  const audioPlayRes = mediaManager.requestPlayback(
    tabA,
    originA,
    "audio",
    "https://media.example.com/podcast.mp3",
    false // unmuted
  );
  assert(audioPlayRes.success && Boolean(audioPlayRes.session), "Audio playback started in foreground tab");
  const audioSession = audioPlayRes.session!;
  assert(audioSession.audioFocus === AudioFocusState.GAIN, "Unmuted audio acquired audio focus");

  // Switch tab: tabB becomes foreground -> tabA moves to background
  mediaManager.setForegroundTab("tab-beta");

  const tabASessions = mediaManager.getSessionsForTab(tabA);
  const updatedVideoSession = tabASessions.find((s) => s.sessionId === videoSession.sessionId);
  const updatedAudioSession = tabASessions.find((s) => s.sessionId === audioSession.sessionId);

  // Video must be auto-paused in background tab
  assert(updatedVideoSession?.isBackground && !updatedVideoSession.isPlaying, "Background video auto-paused");

  // Audio continues in background tab since allowBackgroundAudio is true
  assert(updatedAudioSession?.isBackground && updatedAudioSession.isPlaying, "Background audio continues playback");

  console.log("✓ Background media control and video auto-pause verified.");

  // -------------------------------------------------------------
  // 4. ANDROID AUDIO FOCUS LIFECYCLE (GAIN, LOSS, DUCK)
  // -------------------------------------------------------------
  console.log("4. Testing Android Audio Focus Lifecycle...");

  // Tab B starts unmuted audio -> requests audio focus
  mediaManager.recordUserGesture("tab-beta", "https://music.example.com");
  const tabBAudioRes = mediaManager.requestPlayback(
    "tab-beta",
    "https://music.example.com",
    "audio",
    "https://music.example.com/song.mp3",
    false // unmuted
  );
  assert(tabBAudioRes.success, "Tab B started unmuted audio");
  assert(tabBAudioRes.session?.audioFocus === AudioFocusState.GAIN, "Tab B holds AUDIOFOCUS_GAIN");

  // Tab A's earlier audio session must have lost audio focus (AUDIOFOCUS_LOSS)
  const tabAAfterLoss = mediaManager.getSessionsForTab(tabA).find((s) => s.sessionId === audioSession.sessionId);
  assert(tabAAfterLoss?.audioFocus === AudioFocusState.LOSS && !tabAAfterLoss.isPlaying, "Tab A lost audio focus and paused");

  // Simulate Transient Ducking on Tab B (e.g. navigation / chime)
  mediaManager.simulateAudioFocusChange(tabBAudioRes.session!.sessionId, AudioFocusState.LOSS_TRANSIENT_CAN_DUCK);
  const duckedSession = mediaManager.getSessionsForTab("tab-beta").find((s) => s.sessionId === tabBAudioRes.session!.sessionId);
  assert(duckedSession?.volume === 0.2, "Volume ducked to 0.2 during transient loss");

  // Restore focus to Tab B
  mediaManager.simulateAudioFocusChange(tabBAudioRes.session!.sessionId, AudioFocusState.GAIN);
  const restoredSession = mediaManager.getSessionsForTab("tab-beta").find((s) => s.sessionId === tabBAudioRes.session!.sessionId);
  assert(restoredSession?.volume === 1.0 && restoredSession.isPlaying, "Volume restored to 1.0 upon regaining focus");

  console.log("✓ Android audio focus lifecycle verified.");

  // -------------------------------------------------------------
  // 5. PRIVATE MODE ISOLATION FOR MEDIA
  // -------------------------------------------------------------
  console.log("5. Testing Private Mode Media Isolation...");

  const privTab = "tab-private-1";
  mediaManager.recordUserGesture(privTab, "https://private.example.com");
  const privMediaRes = mediaManager.requestPlayback(
    privTab,
    "https://private.example.com",
    "audio",
    "https://private.example.com/secret.mp3",
    false,
    true // isPrivate
  );
  assert(privMediaRes.success && privMediaRes.session?.isPrivate, "Private media session initiated");

  // Close private tab
  mediaManager.onTabClosed(privTab, true, 0);

  const privSessionsAfterClose = mediaManager.getSessionsForTab(privTab);
  assert(privSessionsAfterClose.length === 0, "Private media sessions wiped on private tab termination");

  console.log("✓ Private mode media isolation verified.");

  // -------------------------------------------------------------
  // 6. LIFECYCLE & CLEANUPS (NAVIGATION, RELOAD, STOP, CLOSE)
  // -------------------------------------------------------------
  console.log("6. Testing Lifecycle Cleanups...");

  // Navigation stops media and clears gestures
  mediaManager.onNavigation(tabA, "https://new-url.com");
  assert(mediaManager.getSessionsForTab(tabA).length === 0, "All media sessions stopped on navigation");
  assert(!mediaManager.hasUserGesture(tabA, originA), "User gesture cleared on navigation");

  console.log("✓ Lifecycle cleanups verified.");

  // -------------------------------------------------------------
  // 7. NATIVE-26 QUICK REGRESSION (CLIPBOARD & WEB SHARE)
  // -------------------------------------------------------------
  console.log("7. Testing NATIVE-26 Clipboard & Web Share Regression...");

  const clipManager = createAndroidWebViewClipboardAndShareManager();

  // Test origin check regression
  assert(!validateClipboardAndShareOrigin("javascript:alert(1)").isValid, "NATIVE-26 rejects javascript: origin");
  assert(!validateClipboardAndShareOrigin("https://169.254.169.254").isValid, "NATIVE-26 rejects metadata IP");
  assert(validateClipboardAndShareOrigin("https://dashboard.netflow.com").isValid, "NATIVE-26 accepts valid HTTPS");

  // Test sensitive token detection regression
  assert(detectSensitiveContent("-----BEGIN RSA PRIVATE KEY-----").isSensitive, "NATIVE-26 detects RSA key");
  assert(detectSensitiveContent("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abcde").isSensitive, "NATIVE-26 detects JWT");

  // Test canShare regression
  assert(clipManager.canShare({ title: "Test", url: "https://example.com" }), "NATIVE-26 canShare accepts valid share");
  assert(!clipManager.canShare({ url: "javascript:void(0)" }), "NATIVE-26 canShare rejects javascript: URL");

  // Test share URL token stripping
  const urlCheck = validateShareUrl("https://example.com/share?token=secret123&item=45");
  assert(urlCheck.isValid && !urlCheck.sanitizedUrl?.includes("secret123"), "NATIVE-26 strips secret token from share URL");

  console.log("✓ NATIVE-26 regression tests passed completely.");

  console.log("=== ALL NATIVE-27 & NATIVE-26 SUITES COMPLETED SUCCESSFULLY ===");
}

runNative27Verification().catch((err) => {
  console.error("NATIVE-27 VERIFICATION FAILED:", err);
  process.exit(1);
});
