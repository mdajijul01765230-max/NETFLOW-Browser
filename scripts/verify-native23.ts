import {
  createAndroidWebViewDisplayMediaManager,
  validateDisplayMediaOrigin,
  DisplayMediaPrompt,
} from "../src/services/androidWebViewDisplayMediaBoundary";
import {
  createAndroidWebViewWebRtcManager,
  validateWebRtcOrigin,
  validateIceServerUrl,
} from "../src/services/androidWebViewWebRtcBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative23Verification() {
  console.log("=== STARTING NATIVE-23 DISPLAY MEDIA & NATIVE-22 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. ORIGIN SECURITY & SSRF PROTECTION
  // -------------------------------------------------------------
  console.log("1. Testing Origin Security & SSRF Protection for Display Media...");

  assert(!validateDisplayMediaOrigin("javascript:void(0)").isValid, "Rejects javascript:");
  assert(!validateDisplayMediaOrigin("file:///system/screen").isValid, "Rejects file:");
  assert(!validateDisplayMediaOrigin("content://media/screen").isValid, "Rejects content:");
  assert(!validateDisplayMediaOrigin("data:text/html,hack").isValid, "Rejects data:");
  assert(!validateDisplayMediaOrigin("blob:https://test.com/id").isValid, "Rejects blob:");
  assert(!validateDisplayMediaOrigin("about:blank").isValid, "Rejects about:");
  assert(!validateDisplayMediaOrigin("http://insecure-site.com").isValid, "Rejects insecure remote HTTP");
  assert(!validateDisplayMediaOrigin("https://169.254.169.254").isValid, "Rejects cloud metadata IP");
  assert(!validateDisplayMediaOrigin("https://192.168.1.1").isValid, "Rejects private IP (192.168.x.x)");
  assert(!validateDisplayMediaOrigin("https://10.0.0.1").isValid, "Rejects private IP (10.x.x.x)");
  assert(!validateDisplayMediaOrigin("https://172.20.0.1").isValid, "Rejects private IP (172.16-31.x)");
  assert(!validateDisplayMediaOrigin("https://corp.internal").isValid, "Rejects .internal domain");
  assert(!validateDisplayMediaOrigin("https://mybox.local").isValid, "Rejects .local domain");

  // Valid origins
  assert(validateDisplayMediaOrigin("https://app.example.com").isValid, "Accepts valid HTTPS");
  assert(validateDisplayMediaOrigin("http://localhost:3000").isValid, "Accepts localhost HTTP");
  assert(validateDisplayMediaOrigin("http://127.0.0.1:8080").isValid, "Accepts 127.0.0.1 HTTP");

  console.log("✓ Origin security and SSRF protection verified.");

  // -------------------------------------------------------------
  // 2. DISPLAY MEDIA LIFECYCLE & USER CONSENT GATING
  // -------------------------------------------------------------
  console.log("2. Testing Display Media Lifecycle & User Consent Gating...");

  let promptReceived: DisplayMediaPrompt | null = null;
  const dmManager = createAndroidWebViewDisplayMediaManager({
    onDisplayMediaPromptChange: (p) => {
      promptReceived = p;
    },
  });

  // User consent rejection test
  const rejectPromise = dmManager.requestDisplayMedia("tab-dm-1", "https://screen.example.com", {
    video: { displaySurface: "browser" },
  });
  assert(promptReceived !== null, "Prompt emitted to UI");
  assert(promptReceived!.origin === "https://screen.example.com", "Prompt has correct origin");

  dmManager.rejectDisplayMedia(promptReceived!.promptId);
  const rejectRes = await rejectPromise;
  assert(!rejectRes.success && rejectRes.error?.includes("NotAllowedError"), "Rejection returned NotAllowedError");
  assert(promptReceived === null, "Prompt cleared after rejection");

  // User consent approval test (with video and audio)
  const approvePromise = dmManager.requestDisplayMedia("tab-dm-1", "https://screen.example.com", {
    video: { displaySurface: "window" },
    audio: true,
  });
  assert(promptReceived !== null, "Second prompt emitted");

  dmManager.approveDisplayMedia(promptReceived!.promptId, "window", true);
  const approveRes = await approvePromise;
  assert(approveRes.success && Boolean(approveRes.sessionId), "Approval succeeded with sessionId");
  assert(approveRes.tracks?.length === 2, "Returned both video and audio tracks");

  const videoTrack = approveRes.tracks?.find((t) => t.kind === "video");
  const audioTrack = approveRes.tracks?.find((t) => t.kind === "audio");
  assert(videoTrack?.readyState === "live", "Video track is live");
  assert(videoTrack?.settings.displaySurface === "window", "Video surface matches window selection");
  assert(audioTrack?.readyState === "live", "Audio track is live");

  const sessionId = approveRes.sessionId!;
  let session = dmManager.getSession(sessionId);
  assert(session?.state === "active", "Session is in active state");
  assert(dmManager.getActiveCaptureCount("tab-dm-1") === 1, "Active capture count is 1");

  // Stop display media
  const stopRes = dmManager.stopDisplayMedia(sessionId);
  assert(stopRes, "stopDisplayMedia succeeded");
  session = dmManager.getSession(sessionId);
  assert(session === null, "Session purged on stop");
  assert(videoTrack?.readyState === "ended", "Video track transitioned to ended");
  assert(dmManager.getActiveCaptureCount("tab-dm-1") === 0, "Active capture count back to 0");

  console.log("✓ User consent gating, track lifecycle, and stop operations verified.");

  // -------------------------------------------------------------
  // 3. TAB & ORIGIN ISOLATION & PRIVATE PROFILE PURGE
  // -------------------------------------------------------------
  console.log("3. Testing Tab & Origin Isolation and Ephemeral Private State Purge...");

  // Normal tab session
  const normalPromise = dmManager.requestDisplayMedia("tab-normal", "https://normal.com");
  dmManager.approveDisplayMedia(promptReceived!.promptId, "browser", false);
  const normalRes = await normalPromise;
  assert(normalRes.success, "Normal tab capture active");

  // Private tab session
  const privatePromise = dmManager.requestDisplayMedia("tab-priv", "https://private.com", {}, true);
  dmManager.approveDisplayMedia(promptReceived!.promptId, "monitor", false);
  const privateRes = await privatePromise;
  assert(privateRes.success, "Private tab capture active");

  // Verify tab isolation
  const normalSessions = dmManager.getActiveSessionsForTab("tab-normal");
  const privateSessions = dmManager.getActiveSessionsForTab("tab-priv");
  assert(normalSessions.length === 1 && normalSessions[0].sessionId === normalRes.sessionId, "Normal tab isolated");
  assert(privateSessions.length === 1 && privateSessions[0].sessionId === privateRes.sessionId, "Private tab isolated");

  // Closing the last private tab purges private capture sessions
  dmManager.onTabClosed("tab-priv", true, 0);
  assert(dmManager.getSession(privateRes.sessionId!) === null, "Private session purged on last private tab close");
  // Normal session remains intact
  assert(dmManager.getSession(normalRes.sessionId!) !== null, "Normal tab session unaffected");

  console.log("✓ Tab/origin isolation and private profile purge verified.");

  // -------------------------------------------------------------
  // 4. LIFECYCLE & CLEANUP: NAVIGATION, RELOAD, PAUSE, RESUME
  // -------------------------------------------------------------
  console.log("4. Testing Lifecycle & Cleanup Consistency...");

  // Host Activity Pause and Resume
  dmManager.onHostPause("tab-normal");
  let normalSession = dmManager.getSession(normalRes.sessionId!);
  assert(normalSession?.isPaused === true && normalSession?.state === "paused", "Session paused on host pause");

  dmManager.onHostResume("tab-normal");
  normalSession = dmManager.getSession(normalRes.sessionId!);
  assert(normalSession?.isPaused === false && normalSession?.state === "active", "Session resumed on host resume");

  // Navigation cleanup
  dmManager.onNavigation("tab-normal", "https://new-url.com");
  assert(dmManager.getSession(normalRes.sessionId!) === null, "Session cleanly stopped on navigation");

  // Reload cleanup
  const reloadPromise = dmManager.requestDisplayMedia("tab-reload", "https://reload.com");
  dmManager.approveDisplayMedia(promptReceived!.promptId, "browser", false);
  const reloadRes = await reloadPromise;
  assert(reloadRes.success, "Reload test session started");
  dmManager.onReload("tab-reload");
  assert(dmManager.getSession(reloadRes.sessionId!) === null, "Session stopped on reload");

  // StopLoading cleanup
  const inFlightPromise = dmManager.requestDisplayMedia("tab-stop", "https://stop.com");
  assert(promptReceived !== null, "Prompt in flight");
  dmManager.onStopLoading("tab-stop");
  const inFlightRes = await inFlightPromise;
  assert(!inFlightRes.success && inFlightRes.error?.includes("cancelled"), "In-flight prompt cancelled on stopLoading");

  dmManager.destroy();
  console.log("✓ Lifecycle and cleanup consistency verified.");

  // -------------------------------------------------------------
  // 5. NATIVE-22 WEBRTC REGRESSION CHECK
  // -------------------------------------------------------------
  console.log("5. Testing NATIVE-22 WebRTC & RTCPeerConnection Boundary Regression...");

  assert(!validateWebRtcOrigin("javascript:void(0)").isValid, "WebRTC rejects dangerous scheme");
  assert(!validateIceServerUrl("turn:169.254.169.254:3478").isValid, "ICE URL rejects SSRF");

  const rtcMgr = createAndroidWebViewWebRtcManager();
  const rtcConn = rtcMgr.createPeerConnection("tab-rtc", "https://meet.example.com", {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  assert(rtcConn.success && Boolean(rtcConn.connectionId), "RTCPeerConnection created");

  const offer = await rtcMgr.createOffer(rtcConn.connectionId!);
  assert(offer.success && offer.sdp?.type === "offer", "SDP offer created");

  await rtcMgr.setLocalDescription(rtcConn.connectionId!, offer.sdp!);
  const rtcSession = rtcMgr.getConnection(rtcConn.connectionId!);
  assert(rtcSession?.signalingState === "have-local-offer", "Signaling state transitioned to have-local-offer");

  // Verify camera permission gate in WebRTC
  const unauthVideo = {
    id: "v-1",
    kind: "video" as const,
    label: "Cam",
    enabled: true,
    muted: false,
    readyState: "live" as const,
  };
  const deniedTrack = rtcMgr.addTrack(rtcConn.connectionId!, unauthVideo, false);
  assert(!deniedTrack.success, "Unauthorized video track rejected in WebRTC");

  const approvedTrack = rtcMgr.addTrack(rtcConn.connectionId!, unauthVideo, true);
  assert(approvedTrack.success, "Authorized video track added in WebRTC");

  rtcMgr.destroy();
  console.log("✓ NATIVE-22 WebRTC regression check PASSED.");

  console.log("=== ALL NATIVE-23 AND NATIVE-22 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative23Verification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
