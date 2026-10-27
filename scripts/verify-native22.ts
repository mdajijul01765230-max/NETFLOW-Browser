import {
  createAndroidWebViewWebRtcManager,
  validateWebRtcOrigin,
  validateIceServerUrl,
  sanitizeIceCandidate,
} from "../src/services/androidWebViewWebRtcBoundary";
import {
  createAndroidWebViewHttpAuthManager,
  validateAuthTarget,
} from "../src/services/androidWebViewHttpAuthBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative22Verification() {
  console.log("=== STARTING NATIVE-22 WEBRTC & NATIVE-21 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. ORIGIN & ICE SERVER SECURITY & SSRF PROTECTION
  // -------------------------------------------------------------
  console.log("1. Testing Origin & ICE Server Security & SSRF Protection...");

  // Origin security checks
  assert(!validateWebRtcOrigin("javascript:void(0)").isValid, "Origin rejects javascript:");
  assert(!validateWebRtcOrigin("file:///system/webrtc").isValid, "Origin rejects file:");
  assert(!validateWebRtcOrigin("content://media/").isValid, "Origin rejects content:");
  assert(!validateWebRtcOrigin("data:text/html,abc").isValid, "Origin rejects data:");
  assert(!validateWebRtcOrigin("blob:https://test.com/id").isValid, "Origin rejects blob:");
  assert(!validateWebRtcOrigin("about:blank").isValid, "Origin rejects about:");
  assert(!validateWebRtcOrigin("http://insecure-site.com").isValid, "Origin rejects insecure remote HTTP");
  assert(!validateWebRtcOrigin("https://169.254.169.254").isValid, "Origin rejects cloud metadata IP");
  assert(!validateWebRtcOrigin("https://192.168.1.1").isValid, "Origin rejects private IP");
  assert(validateWebRtcOrigin("https://app.example.com").isValid, "Origin accepts valid HTTPS");
  assert(validateWebRtcOrigin("http://localhost:3000").isValid, "Origin accepts localhost HTTP");
  assert(validateWebRtcOrigin("http://127.0.0.1:8080").isValid, "Origin accepts 127.0.0.1 HTTP");

  // ICE Server URL security checks
  assert(!validateIceServerUrl("javascript:void(0)").isValid, "ICE URL rejects javascript:");
  assert(!validateIceServerUrl("file:///etc/hosts").isValid, "ICE URL rejects file:");
  assert(!validateIceServerUrl("http://stun.example.com:3478").isValid, "ICE URL rejects http scheme");
  assert(!validateIceServerUrl("https://turn.example.com:3478").isValid, "ICE URL rejects https scheme");
  assert(!validateIceServerUrl("ws://turn.example.com:3478").isValid, "ICE URL rejects ws scheme");
  assert(!validateIceServerUrl("wss://turn.example.com:3478").isValid, "ICE URL rejects wss scheme");

  // SSRF & private IP subnets blocked in ICE servers
  assert(!validateIceServerUrl("turn:169.254.169.254:3478").isValid, "ICE server blocks cloud metadata IP");
  assert(!validateIceServerUrl("turn:192.168.1.1:3478").isValid, "ICE server blocks 192.168.x.x");
  assert(!validateIceServerUrl("turn:10.0.0.1:3478").isValid, "ICE server blocks 10.x.x.x");
  assert(!validateIceServerUrl("turn:172.20.0.1:3478").isValid, "ICE server blocks 172.16-31.x");
  assert(!validateIceServerUrl("turn:internal.internal:3478").isValid, "ICE server blocks .internal");
  assert(!validateIceServerUrl("turn:mydevice.local:3478").isValid, "ICE server blocks .local");

  // Valid ICE servers accepted
  const stunVal = validateIceServerUrl("stun:stun.l.google.com:19302");
  assert(stunVal.isValid && stunVal.scheme === "stun" && stunVal.port === 19302, "Valid public STUN allowed");

  const turnVal = validateIceServerUrl("turns:turn.example.com:5349");
  assert(turnVal.isValid && turnVal.scheme === "turns" && turnVal.isSecure, "Valid TURNS server allowed");

  const localIceVal = validateIceServerUrl("stun:localhost:3478");
  assert(localIceVal.isValid && localIceVal.isLocalhost, "Localhost STUN allowed for dev");

  // WebRTC LAN IP Leakage protection
  const rawCand = "candidate:1 1 UDP 2122260223 192.168.1.100 54321 typ host";
  const maskedCand = sanitizeIceCandidate(rawCand, true);
  assert(!maskedCand.includes("192.168.1.100"), "Private IP masked in private candidate");
  assert(maskedCand.includes(".local"), "Candidate uses mDNS .local mask");

  console.log("✓ Origin, ICE server validation, SSRF, and IP leakage protection verified.");

  // -------------------------------------------------------------
  // 2. RTCPeerConnection LIFECYCLE & DATACONNECTION
  // -------------------------------------------------------------
  console.log("2. Testing RTCPeerConnection Lifecycle & DataChannel Operations...");

  const rtcMgr = createAndroidWebViewWebRtcManager();

  // Create PeerConnection
  const connResult = rtcMgr.createPeerConnection("tab-rtc-1", "https://call.example.com", {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  assert(connResult.success && Boolean(connResult.connectionId), "PeerConnection created successfully");
  const connId = connResult.connectionId!;

  let session = rtcMgr.getConnection(connId);
  assert(session !== null && session.signalingState === "stable", "Initial signaling state is stable");
  assert(session!.connectionState === "new", "Initial connection state is new");

  // SDP Offer & Local Description
  const offerRes = await rtcMgr.createOffer(connId);
  assert(offerRes.success && offerRes.sdp?.type === "offer", "SDP offer created");

  const setLocalRes = await rtcMgr.setLocalDescription(connId, offerRes.sdp!);
  assert(setLocalRes.success, "Local description set successfully");
  session = rtcMgr.getConnection(connId);
  assert(session!.signalingState === "have-local-offer", "Signaling state transitioned to have-local-offer");
  assert(session!.localCandidates.length > 0, "ICE candidates gathered upon local description");

  // Add Remote Candidate
  const candRes = await rtcMgr.addIceCandidate(connId, {
    candidate: "candidate:2 1 UDP 2122260223 93.184.216.34 54321 typ srflx",
  });
  assert(candRes.success, "Remote ICE candidate added");

  // Remote Description Answer
  const answerSdp = {
    type: "answer" as const,
    sdp: "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 DTLS/SCTP 5000\r\n",
  };
  const setRemoteRes = await rtcMgr.setRemoteDescription(connId, answerSdp);
  assert(setRemoteRes.success, "Remote description set successfully");
  session = rtcMgr.getConnection(connId);
  assert(session!.signalingState === "stable", "Signaling state returned to stable");
  assert(session!.connectionState === "connected", "Connection state is connected");

  // RTCDataChannel Creation & Message Transfer
  const dcRes = rtcMgr.createDataChannel(connId, "chat", { ordered: true });
  assert(dcRes.success && Boolean(dcRes.channel?.id), "DataChannel created");
  const dcId = dcRes.channel!.id;

  const sendRes = rtcMgr.sendDataChannelMessage(connId, dcId, "Hello WebRTC");
  assert(sendRes.success, "DataChannel message sent");
  session = rtcMgr.getConnection(connId);
  const dcSession = session!.dataChannels.get(dcId);
  assert(dcSession?.messagesSent === 1 && dcSession.bytesSent > 0, "Message stats recorded");

  const closeDcRes = rtcMgr.closeDataChannel(connId, dcId);
  assert(closeDcRes, "DataChannel closed");

  console.log("✓ RTCPeerConnection and RTCDataChannel lifecycle verified.");

  // -------------------------------------------------------------
  // 3. MEDIA PERMISSION INTEGRATION (NATIVE-11)
  // -------------------------------------------------------------
  console.log("3. Testing MediaStreamTrack & Permission Integration...");

  // Try adding video track WITHOUT camera permission grant
  const unauthVideoTrack = {
    id: "vid-1",
    kind: "video" as const,
    label: "Front Camera",
    enabled: true,
    muted: false,
    readyState: "live" as const,
  };
  const deniedVideo = rtcMgr.addTrack(connId, unauthVideoTrack, false);
  assert(!deniedVideo.success && deniedVideo.error?.includes("VIDEO_CAPTURE"), "Video track rejected without camera permission");

  // Try adding audio track WITHOUT microphone permission grant
  const unauthAudioTrack = {
    id: "aud-1",
    kind: "audio" as const,
    label: "Built-in Mic",
    enabled: true,
    muted: false,
    readyState: "live" as const,
  };
  const deniedAudio = rtcMgr.addTrack(connId, unauthAudioTrack, false);
  assert(!deniedAudio.success && deniedAudio.error?.includes("AUDIO_CAPTURE"), "Audio track rejected without mic permission");

  // Add tracks WITH explicit permission grant
  const grantedVideo = rtcMgr.addTrack(connId, unauthVideoTrack, true);
  assert(grantedVideo.success && Boolean(grantedVideo.trackId), "Video track added with camera grant");

  const grantedAudio = rtcMgr.addTrack(connId, unauthAudioTrack, true);
  assert(grantedAudio.success && Boolean(grantedAudio.trackId), "Audio track added with mic grant");

  assert(rtcMgr.getActiveTrackCount("tab-rtc-1") === 2, "Active track count matches 2");

  // Remove track
  const removeRes = rtcMgr.removeTrack(connId, grantedVideo.trackId!);
  assert(removeRes.success, "Track removed successfully");
  assert(rtcMgr.getActiveTrackCount("tab-rtc-1") === 1, "Active track count decremented to 1");

  console.log("✓ Media permissions and track management integration verified.");

  // -------------------------------------------------------------
  // 4. TAB / ORIGIN ISOLATION & PRIVATE PROFILE PURGE
  // -------------------------------------------------------------
  console.log("4. Testing Tab & Origin Isolation and Ephemeral Private State Purge...");

  // Create connection on tab-2 (normal profile)
  const tab2Conn = rtcMgr.createPeerConnection("tab-rtc-2", "https://other.com", {}, false);
  assert(tab2Conn.success, "Created connection on tab-2");

  // Create connection on tab-priv (private profile)
  const privConn = rtcMgr.createPeerConnection("tab-priv", "https://secret.com", {}, true);
  assert(privConn.success, "Created connection on private tab");

  // Verify Tab Isolation
  const tab1Conns = rtcMgr.getConnectionsForTab("tab-rtc-1");
  const tab2Conns = rtcMgr.getConnectionsForTab("tab-rtc-2");
  assert(tab1Conns.length === 1 && tab1Conns[0].connectionId === connId, "Tab 1 isolated");
  assert(tab2Conns.length === 1 && tab2Conns[0].connectionId === tab2Conn.connectionId, "Tab 2 isolated");

  // Closing non-last private tab retains private session
  rtcMgr.onTabClosed("tab-priv", true, 1);
  // Connection for closed tab was freed, but private profile not wiped if remainingPrivateTabs > 0

  // Create another private connection on tab-priv-2
  const privConn2 = rtcMgr.createPeerConnection("tab-priv-2", "https://secret2.com", {}, true);
  assert(privConn2.success, "Created second private connection");

  // Closing last private tab completely purges private state
  rtcMgr.onTabClosed("tab-priv-2", true, 0);
  assert(rtcMgr.getConnection(privConn2.connectionId!) === null, "Private connection purged on last private tab close");
  // Normal tab connections remain active
  assert(rtcMgr.getConnection(tab2Conn.connectionId!) !== null, "Normal profile connection remains active");

  console.log("✓ Tab/origin isolation and private profile purge verified.");

  // -------------------------------------------------------------
  // 5. LIFECYCLE & CLEANUP: NAVIGATION, RELOAD, PAUSE, RESUME
  // -------------------------------------------------------------
  console.log("5. Testing Lifecycle & Cleanup Consistency...");

  // Host Pause and Resume
  rtcMgr.onHostPause("tab-rtc-2");
  const pausedSession = rtcMgr.getConnection(tab2Conn.connectionId!);
  assert(pausedSession?.isPaused === true, "Session marked paused on host pause");

  rtcMgr.onHostResume("tab-rtc-2");
  const resumedSession = rtcMgr.getConnection(tab2Conn.connectionId!);
  assert(resumedSession?.isPaused === false, "Session marked active on host resume");

  // Navigation cleanup
  rtcMgr.onNavigation("tab-rtc-2", "https://new-url.com");
  assert(rtcMgr.getConnection(tab2Conn.connectionId!) === null, "PeerConnection cleanly closed on navigation");

  // Reload cleanup
  const reloadConn = rtcMgr.createPeerConnection("tab-reload", "https://reload-site.com");
  assert(reloadConn.success, "Connection created on tab-reload");
  rtcMgr.onReload("tab-reload");
  assert(rtcMgr.getConnection(reloadConn.connectionId!) === null, "PeerConnection closed on reload");

  // Stop Loading cleanup
  const stopConn = rtcMgr.createPeerConnection("tab-stop", "https://stop-site.com");
  assert(stopConn.success, "Connection created on tab-stop");
  rtcMgr.onStopLoading("tab-stop");
  assert(rtcMgr.getConnection(stopConn.connectionId!) === null, "Pending connecting connection closed on stopLoading");

  rtcMgr.destroy();
  console.log("✓ Lifecycle and cleanup consistency verified.");

  // -------------------------------------------------------------
  // 6. NATIVE-21 REGRESSION (HTTP AUTH & CLIENT CERT)
  // -------------------------------------------------------------
  console.log("6. Testing NATIVE-21 HTTP Auth & Client Cert Boundary Regression...");

  // Origin target validation
  assert(!validateAuthTarget("javascript:void(0)").isValid, "Auth rejects javascript:");
  assert(!validateAuthTarget("http://insecure-remote.com").isValid, "Auth rejects insecure remote HTTP");
  assert(!validateAuthTarget("https://169.254.169.254").isValid, "Auth rejects SSRF");
  assert(validateAuthTarget("https://auth.example.com").isValid, "Auth accepts HTTPS");

  let promptState: any = null;
  const authMgr = createAndroidWebViewHttpAuthManager({
    onHttpAuthPromptChange: (p) => {
      promptState = p;
    },
  });

  const authPromise = authMgr.requestHttpAuth("tab-1", "https://auth.example.com", "Realm1", "Basic");
  assert(promptState !== null && promptState.host === "auth.example.com", "HTTP auth prompt emitted");

  authMgr.proceedHttpAuth(promptState.challengeId, "user1", "pass1", true);
  const authRes = await authPromise;
  assert(authRes.authenticated === true && authRes.username === "user1", "HTTP auth proceeded");

  // Cached credential auto-proceed
  const autoAuthRes = await authMgr.requestHttpAuth("tab-1", "https://auth.example.com", "Realm1");
  assert(autoAuthRes.authenticated === true && autoAuthRes.username === "user1", "Cached creds used");

  // Client Cert Challenge
  let certPromptState: any = null;
  const certMgr = createAndroidWebViewHttpAuthManager({
    onClientCertPromptChange: (p) => {
      certPromptState = p;
    },
  });

  const certPromise = certMgr.requestClientCert("tab-cert", "https://mtls.example.com", 443);
  assert(certPromptState !== null && certPromptState.availableCerts.length > 0, "Client cert prompt emitted");
  certMgr.proceedClientCert(certPromptState.challengeId, certPromptState.availableCerts[0].alias);
  const certRes = await certPromise;
  assert(certRes.proceed === true, "Client cert request proceeded");

  authMgr.destroy();
  certMgr.destroy();
  console.log("✓ NATIVE-21 HTTP Auth and Client Certificate regression check PASSED.");

  console.log("=== ALL NATIVE-22 AND NATIVE-21 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative22Verification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
