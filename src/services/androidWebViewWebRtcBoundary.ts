/**
 * NETFLOW Browser V2 — Android WebView WebRTC & RTCPeerConnection Boundary
 *
 * Form: NETFLOW-V2-NATIVE-22
 *
 * This module establishes the secure Android WebView WebRTC & RTCPeerConnection Boundary:
 * 1. RTCPeerConnection & RTCDataChannel lifecycle (signaling, ICE, and connection states)
 * 2. MediaStreamTrack & transceiver abstraction (audio/video track management)
 * 3. Media Permission Integration (NATIVE-11 WebChromeClient.onPermissionRequest for camera/mic)
 * 4. Strict ICE server (STUN/TURN/TURNS) URL validation & security filtering
 * 5. Dangerous scheme blocking (javascript:, file:, content:, data:, blob:, http:, etc.)
 * 6. SSRF & Private Network address blocking (169.254.169.254, 10.x, 192.168.x, 172.16-31.x, .internal, .local)
 * 7. WebRTC IP leakage & mDNS candidate obfuscation protection
 * 8. Strict tab & origin isolation (connections scoped by tabId + origin; ephemeral private profile isolation)
 * 9. Lifecycle consistency: clean teardown on navigation, reload, stopLoading, tab close, host pause/resume
 * 10. Privileged native bridge invariant: pure safe TypeScript boundary without native reflection
 * 11. Reuses NATIVE-05 (Security Policy), NATIVE-09 (Navigation), NATIVE-11 (Media Permissions),
 *     NATIVE-17 (WebSockets), and NATIVE-21 (HTTP Auth / TLS).
 */

export type RTCSignalingState =
  | "stable"
  | "have-local-offer"
  | "have-remote-offer"
  | "have-local-pranswer"
  | "have-remote-pranswer"
  | "closed";

export type RTCIceConnectionState =
  | "new"
  | "checking"
  | "connected"
  | "completed"
  | "failed"
  | "disconnected"
  | "closed";

export type RTCIceGatheringState = "new" | "gathering" | "complete";

export type RTCPeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export type RTCDataChannelState = "connecting" | "open" | "closing" | "closed";

export type RTCSdpType = "offer" | "answer" | "pranswer" | "rollback";

export interface RTCSessionDescriptionInit {
  type: RTCSdpType;
  sdp: string;
}

export interface RTCIceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RTCConfiguration {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: "all" | "relay";
  bundlePolicy?: "balanced" | "max-compat" | "max-bundle";
  rtcpMuxPolicy?: "negotiate" | "require";
  iceCandidatePoolSize?: number;
}

export interface WebRtcTrack {
  id: string;
  kind: "audio" | "video";
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: "live" | "ended";
}

export interface WebRtcDataChannelSession {
  id: string;
  label: string;
  protocol: string;
  state: RTCDataChannelState;
  ordered: boolean;
  maxRetransmits?: number;
  maxPacketLifeTime?: number;
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
}

export interface WebRtcPeerConnectionSession {
  connectionId: string;
  tabId: string;
  origin: string;
  isPrivate: boolean;
  signalingState: RTCSignalingState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  connectionState: RTCPeerConnectionState;
  config: RTCConfiguration;
  validatedIceServers: string[];
  localDescription: RTCSessionDescriptionInit | null;
  remoteDescription: RTCSessionDescriptionInit | null;
  localCandidates: RTCIceCandidateInit[];
  remoteCandidates: RTCIceCandidateInit[];
  tracks: Map<string, WebRtcTrack>;
  dataChannels: Map<string, WebRtcDataChannelSession>;
  createdAt: number;
  connectedAt?: number;
  closedAt?: number;
  isPaused: boolean;
}

export interface WebRtcOriginValidationResult {
  isValid: boolean;
  isSecure: boolean;
  isLocalhost: boolean;
  canonicalOrigin?: string;
  reason?: string;
}

export interface IceServerValidationResult {
  isValid: boolean;
  scheme?: "stun" | "stuns" | "turn" | "turns";
  host?: string;
  port?: number;
  isSecure: boolean;
  isLocalhost: boolean;
  sanitizedUrl?: string;
  reason?: string;
}

/**
 * Validates requesting origin for WebRTC operations.
 * Must be HTTPS or localhost. Dangerous schemes and insecure remote HTTP are blocked.
 */
export function validateWebRtcOrigin(originStr: string): WebRtcOriginValidationResult {
  if (!originStr || typeof originStr !== "string") {
    return { isValid: false, isSecure: false, isLocalhost: false, reason: "Origin is empty" };
  }

  const trimmed = originStr.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("about:")
  ) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Dangerous scheme blocked for WebRTC operations",
    };
  }

  try {
    const parsed = new URL(lower.includes("://") ? lower : `https://${lower}`);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: `Unsupported WebRTC origin protocol: ${protocol}`,
      };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";

    if (isLocalhost) {
      return {
        isValid: true,
        isSecure: true,
        isLocalhost: true,
        canonicalOrigin: `${protocol}//${parsed.host}`,
      };
    }

    if (protocol !== "https:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "Insecure remote HTTP origin blocked from WebRTC APIs",
      };
    }

    // SSRF & private IP targets blocked from WebRTC hosting
    if (
      hostname === "169.254.169.254" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "WebRTC origin blocked on private IP or metadata address",
      };
    }

    return {
      isValid: true,
      isSecure: true,
      isLocalhost: false,
      canonicalOrigin: `${protocol}//${parsed.host}`,
    };
  } catch {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Malformed WebRTC origin URL",
    };
  }
}

/**
 * Validates an ICE server URL (STUN / TURN / TURNS).
 * Blocks dangerous schemes, HTTP/WS endpoints, SSRF targets, and private IP subnets.
 */
export function validateIceServerUrl(serverUrl: string): IceServerValidationResult {
  if (!serverUrl || typeof serverUrl !== "string") {
    return { isValid: false, isSecure: false, isLocalhost: false, reason: "ICE server URL is empty" };
  }

  const trimmed = serverUrl.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous schemes or non-ICE schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("ws:") ||
    lower.startsWith("wss:")
  ) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Invalid ICE server scheme; only stun:, stuns:, turn:, and turns: are allowed",
    };
  }

  const match = lower.match(/^(stuns?|turns?):([^:?#]+)(?::(\d+))?(?:\?.*)?$/);
  if (!match) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Malformed ICE server URL format",
    };
  }

  const scheme = match[1] as "stun" | "stuns" | "turn" | "turns";
  let host = match[2];
  const portStr = match[3];
  const port = portStr ? parseInt(portStr, 10) : scheme.startsWith("turns") || scheme === "stuns" ? 5349 : 3478;

  host = host.replace(/^\[|\]$/g, "");

  const isLocalhost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0";

  // 2. SSRF & private IP subnets
  if (
    host === "169.254.169.254" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "ICE server target blocked: private network, internal domain, or cloud metadata address",
    };
  }

  // Check port validity
  if (isNaN(port) || port < 1 || port > 65535) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "ICE server port out of range",
    };
  }

  const isSecure = scheme === "stuns" || scheme === "turns";
  const sanitizedUrl = `${scheme}:${host}:${port}`;

  return {
    isValid: true,
    scheme,
    host,
    port,
    isSecure,
    isLocalhost,
    sanitizedUrl,
  };
}

/**
 * Sanitizes an ICE candidate string to prevent local LAN IP leakage.
 * In private browsing or high-privacy mode, host IP candidates are masked or mDNS-obfuscated.
 */
export function sanitizeIceCandidate(candidateStr: string, isPrivate: boolean): string {
  if (!candidateStr || typeof candidateStr !== "string") return candidateStr;

  if (isPrivate || candidateStr.includes(" typ host ")) {
    // Obfuscate local private IPv4 addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    return candidateStr
      .replace(/\b192\.168\.\d+\.\d+\b/g, "00000000-0000-0000-0000-000000000000.local")
      .replace(/\b10\.\d+\.\d+\.\d+\b/g, "00000000-0000-0000-0000-000000000000.local")
      .replace(/\b172\.(1[6-9]|2\d|3[01])\.\d+\.\d+\b/g, "00000000-0000-0000-0000-000000000000.local");
  }

  return candidateStr;
}

export interface AndroidWebViewWebRtcManager {
  // RTCPeerConnection Lifecycle
  createPeerConnection: (
    tabId: string,
    origin: string,
    config?: RTCConfiguration,
    isPrivate?: boolean
  ) => { success: boolean; connectionId?: string; session?: WebRtcPeerConnectionSession; error?: string };

  createOffer: (connectionId: string) => Promise<{ success: boolean; sdp?: RTCSessionDescriptionInit; error?: string }>;
  setLocalDescription: (connectionId: string, desc: RTCSessionDescriptionInit) => Promise<{ success: boolean; error?: string }>;
  createAnswer: (connectionId: string) => Promise<{ success: boolean; sdp?: RTCSessionDescriptionInit; error?: string }>;
  setRemoteDescription: (connectionId: string, desc: RTCSessionDescriptionInit) => Promise<{ success: boolean; error?: string }>;
  addIceCandidate: (connectionId: string, candidate: RTCIceCandidateInit) => Promise<{ success: boolean; error?: string }>;

  // MediaStreamTrack & Permission Integration
  addTrack: (
    connectionId: string,
    track: WebRtcTrack,
    hasMediaPermission?: boolean
  ) => { success: boolean; trackId?: string; error?: string };
  removeTrack: (connectionId: string, trackId: string) => { success: boolean; error?: string };

  // RTCDataChannel
  createDataChannel: (
    connectionId: string,
    label: string,
    options?: { ordered?: boolean; maxRetransmits?: number; maxPacketLifeTime?: number; protocol?: string }
  ) => { success: boolean; channel?: WebRtcDataChannelSession; error?: string };
  sendDataChannelMessage: (
    connectionId: string,
    channelId: string,
    data: string | ArrayBuffer
  ) => { success: boolean; error?: string };
  closeDataChannel: (connectionId: string, channelId: string) => boolean;

  // Connection Management & Queries
  closePeerConnection: (connectionId: string) => boolean;
  getConnection: (connectionId: string) => WebRtcPeerConnectionSession | null;
  getConnectionsForTab: (tabId: string) => WebRtcPeerConnectionSession[];
  getActiveTrackCount: (tabId?: string) => number;

  // Lifecycle & Isolation Handlers
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  onHostPause: (tabId?: string) => void;
  onHostResume(tabId?: string): void;
  destroy: () => void;
}

/**
 * Creates the Android WebView WebRTC / RTCPeerConnection Manager.
 */
export function createAndroidWebViewWebRtcManager(): AndroidWebViewWebRtcManager {
  // Map<connectionId, WebRtcPeerConnectionSession>
  const connections = new Map<string, WebRtcPeerConnectionSession>();

  // Map<tabId, Set<connectionId>>
  const tabConnections = new Map<string, Set<string>>();

  const registerTabConnection = (tabId: string, connectionId: string) => {
    let set = tabConnections.get(tabId);
    if (!set) {
      set = new Set<string>();
      tabConnections.set(tabId, set);
    }
    set.add(connectionId);
  };

  const unregisterTabConnection = (tabId: string, connectionId: string) => {
    const set = tabConnections.get(tabId);
    if (set) {
      set.delete(connectionId);
      if (set.size === 0) {
        tabConnections.delete(tabId);
      }
    }
  };

  // -------------------------------------------------------------
  // RTCPeerConnection Lifecycle
  // -------------------------------------------------------------
  const createPeerConnection = (
    tabId: string,
    origin: string,
    config: RTCConfiguration = {},
    isPrivate = false
  ): { success: boolean; connectionId?: string; session?: WebRtcPeerConnectionSession; error?: string } => {
    // 1. Origin Security Validation
    const valOrigin = validateWebRtcOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "Invalid origin for WebRTC" };
    }

    // 2. Validate ICE Servers
    const validatedServers: string[] = [];
    if (config.iceServers && Array.isArray(config.iceServers)) {
      for (const server of config.iceServers) {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        for (const url of urls) {
          const valIce = validateIceServerUrl(url);
          if (!valIce.isValid) {
            return {
              success: false,
              error: `Invalid ICE server [${url}]: ${valIce.reason}`,
            };
          }
          if (valIce.sanitizedUrl) {
            validatedServers.push(valIce.sanitizedUrl);
          }
        }
      }
    }

    const connectionId = `rtc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session: WebRtcPeerConnectionSession = {
      connectionId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      isPrivate,
      signalingState: "stable",
      iceConnectionState: "new",
      iceGatheringState: "new",
      connectionState: "new",
      config: { ...config },
      validatedIceServers: validatedServers,
      localDescription: null,
      remoteDescription: null,
      localCandidates: [],
      remoteCandidates: [],
      tracks: new Map(),
      dataChannels: new Map(),
      createdAt: Date.now(),
      isPaused: false,
    };

    connections.set(connectionId, session);
    registerTabConnection(tabId, connectionId);

    return { success: true, connectionId, session };
  };

  const createOffer = async (
    connectionId: string
  ): Promise<{ success: boolean; sdp?: RTCSessionDescriptionInit; error?: string }> => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    const sdpString = `v=0\r\no=- ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\na=msid-semantic: WMS\r\nm=application 9 DTLS/SCTP 5000\r\nc=IN IP4 127.0.0.1\r\na=sctp-port:5000\r\n`;
    const offer: RTCSessionDescriptionInit = {
      type: "offer",
      sdp: sdpString,
    };

    return { success: true, sdp: offer };
  };

  const setLocalDescription = async (
    connectionId: string,
    desc: RTCSessionDescriptionInit
  ): Promise<{ success: boolean; error?: string }> => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    if (desc.type === "offer") {
      session.signalingState = "have-local-offer";
    } else if (desc.type === "answer") {
      session.signalingState = "stable";
      session.iceConnectionState = "connected";
      session.connectionState = "connected";
      session.connectedAt = Date.now();
    }

    session.localDescription = { ...desc };

    // Simulate ICE candidate gathering
    session.iceGatheringState = "gathering";
    const rawCandidate = `candidate:1 1 UDP 2122260223 192.168.1.100 54321 typ host`;
    const sanitizedCandidate = sanitizeIceCandidate(rawCandidate, session.isPrivate);

    session.localCandidates.push({
      candidate: sanitizedCandidate,
      sdpMid: "0",
      sdpMLineIndex: 0,
    });
    session.iceGatheringState = "complete";

    return { success: true };
  };

  const createAnswer = async (
    connectionId: string
  ): Promise<{ success: boolean; sdp?: RTCSessionDescriptionInit; error?: string }> => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    if (session.signalingState !== "have-remote-offer") {
      return { success: false, error: `Invalid signaling state for createAnswer: ${session.signalingState}` };
    }

    const sdpString = `v=0\r\no=- ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\nm=application 9 DTLS/SCTP 5000\r\nc=IN IP4 127.0.0.1\r\na=sctp-port:5000\r\n`;
    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: sdpString,
    };

    return { success: true, sdp: answer };
  };

  const setRemoteDescription = async (
    connectionId: string,
    desc: RTCSessionDescriptionInit
  ): Promise<{ success: boolean; error?: string }> => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    if (desc.type === "offer") {
      session.signalingState = "have-remote-offer";
    } else if (desc.type === "answer") {
      session.signalingState = "stable";
      session.iceConnectionState = "connected";
      session.connectionState = "connected";
      session.connectedAt = Date.now();
    }

    session.remoteDescription = { ...desc };
    return { success: true };
  };

  const addIceCandidate = async (
    connectionId: string,
    candidate: RTCIceCandidateInit
  ): Promise<{ success: boolean; error?: string }> => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    if (!candidate.candidate) {
      return { success: false, error: "Candidate string is empty" };
    }

    const sanitized = sanitizeIceCandidate(candidate.candidate, session.isPrivate);
    session.remoteCandidates.push({
      ...candidate,
      candidate: sanitized,
    });

    if (session.iceConnectionState === "new") {
      session.iceConnectionState = "checking";
    }

    return { success: true };
  };

  // -------------------------------------------------------------
  // MediaStreamTrack & Permission Integration (NATIVE-11)
  // -------------------------------------------------------------
  const addTrack = (
    connectionId: string,
    track: WebRtcTrack,
    hasMediaPermission = false
  ): { success: boolean; trackId?: string; error?: string } => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    // Permission Verification:
    // Video capture requires camera permission grant (RESOURCE_VIDEO_CAPTURE)
    // Audio capture requires microphone permission grant (RESOURCE_AUDIO_CAPTURE)
    if (track.kind === "video" && !hasMediaPermission) {
      return {
        success: false,
        error: "Permission denied: android.webkit.resource.VIDEO_CAPTURE (Camera) grant required for video track",
      };
    }

    if (track.kind === "audio" && !hasMediaPermission) {
      return {
        success: false,
        error: "Permission denied: android.webkit.resource.AUDIO_CAPTURE (Microphone) grant required for audio track",
      };
    }

    const trackId = track.id || `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const trackObj: WebRtcTrack = {
      ...track,
      id: trackId,
      readyState: "live",
    };

    session.tracks.set(trackId, trackObj);
    return { success: true, trackId };
  };

  const removeTrack = (connectionId: string, trackId: string): { success: boolean; error?: string } => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    const track = session.tracks.get(trackId);
    if (!track) {
      return { success: false, error: "Track not found" };
    }

    track.readyState = "ended";
    session.tracks.delete(trackId);
    return { success: true };
  };

  // -------------------------------------------------------------
  // RTCDataChannel
  // -------------------------------------------------------------
  const createDataChannel = (
    connectionId: string,
    label: string,
    options: { ordered?: boolean; maxRetransmits?: number; maxPacketLifeTime?: number; protocol?: string } = {}
  ): { success: boolean; channel?: WebRtcDataChannelSession; error?: string } => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    const channelId = `dc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const channel: WebRtcDataChannelSession = {
      id: channelId,
      label: label || "data-channel",
      protocol: options.protocol || "",
      state: "open",
      ordered: options.ordered ?? true,
      maxRetransmits: options.maxRetransmits,
      maxPacketLifeTime: options.maxPacketLifeTime,
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
    };

    session.dataChannels.set(channelId, channel);
    return { success: true, channel };
  };

  const sendDataChannelMessage = (
    connectionId: string,
    channelId: string,
    data: string | ArrayBuffer
  ): { success: boolean; error?: string } => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") {
      return { success: false, error: "PeerConnection not found or closed" };
    }

    const channel = session.dataChannels.get(channelId);
    if (!channel || channel.state !== "open") {
      return { success: false, error: "DataChannel not found or not in open state" };
    }

    const byteLen = typeof data === "string" ? new Blob([data]).size : data.byteLength;
    channel.messagesSent += 1;
    channel.bytesSent += byteLen;

    return { success: true };
  };

  const closeDataChannel = (connectionId: string, channelId: string): boolean => {
    const session = connections.get(connectionId);
    if (!session) return false;

    const channel = session.dataChannels.get(channelId);
    if (!channel) return false;

    channel.state = "closed";
    session.dataChannels.delete(channelId);
    return true;
  };

  // -------------------------------------------------------------
  // Teardown & Queries
  // -------------------------------------------------------------
  const closePeerConnection = (connectionId: string): boolean => {
    const session = connections.get(connectionId);
    if (!session || session.connectionState === "closed") return false;

    // End all tracks
    session.tracks.forEach((track) => {
      track.readyState = "ended";
    });
    session.tracks.clear();

    // Close all data channels
    session.dataChannels.forEach((dc) => {
      dc.state = "closed";
    });
    session.dataChannels.clear();

    session.signalingState = "closed";
    session.iceConnectionState = "closed";
    session.iceGatheringState = "complete";
    session.connectionState = "closed";
    session.closedAt = Date.now();

    unregisterTabConnection(session.tabId, connectionId);
    connections.delete(connectionId);
    return true;
  };

  const getConnection = (connectionId: string) => {
    const s = connections.get(connectionId);
    return s ? { ...s } : null;
  };

  const getConnectionsForTab = (tabId: string) => {
    const connIds = tabConnections.get(tabId);
    if (!connIds) return [];
    const list: WebRtcPeerConnectionSession[] = [];
    connIds.forEach((id) => {
      const s = connections.get(id);
      if (s) list.push({ ...s });
    });
    return list;
  };

  const getActiveTrackCount = (tabId?: string): number => {
    let count = 0;
    connections.forEach((s) => {
      if (!tabId || s.tabId === tabId) {
        s.tracks.forEach((t) => {
          if (t.readyState === "live") count += 1;
        });
      }
    });
    return count;
  };

  // -------------------------------------------------------------
  // Lifecycle Handlers
  // -------------------------------------------------------------
  const closeAllForTab = (tabId: string) => {
    const connIds = tabConnections.get(tabId);
    if (!connIds) return;
    const toClose = Array.from(connIds);
    toClose.forEach((id) => {
      closePeerConnection(id);
    });
    tabConnections.delete(tabId);
  };

  const onNavigation = (tabId: string, _newUrl: string) => {
    closeAllForTab(tabId);
  };

  const onReload = (tabId: string) => {
    closeAllForTab(tabId);
  };

  const onStopLoading = (tabId: string) => {
    // Stop pending connecting peer connections
    const connIds = tabConnections.get(tabId);
    if (!connIds) return;
    connIds.forEach((id) => {
      const s = connections.get(id);
      if (s && (s.connectionState === "new" || s.connectionState === "connecting")) {
        closePeerConnection(id);
      }
    });
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    closeAllForTab(tabId);

    // If the last private tab is closed, purge all private WebRTC state
    if (isPrivate && remainingPrivateTabs === 0) {
      const privateIds: string[] = [];
      connections.forEach((s, id) => {
        if (s.isPrivate) privateIds.push(id);
      });
      privateIds.forEach((id) => closePeerConnection(id));
    }
  };

  const onHostPause = (tabId?: string) => {
    connections.forEach((s) => {
      if (!tabId || s.tabId === tabId) {
        s.isPaused = true;
        s.tracks.forEach((track) => {
          track.muted = true;
        });
      }
    });
  };

  const onHostResume = (tabId?: string) => {
    connections.forEach((s) => {
      if (!tabId || s.tabId === tabId) {
        s.isPaused = false;
        s.tracks.forEach((track) => {
          track.muted = false;
        });
      }
    });
  };

  const destroy = () => {
    const allIds = Array.from(connections.keys());
    allIds.forEach((id) => closePeerConnection(id));
    connections.clear();
    tabConnections.clear();
  };

  return {
    createPeerConnection,
    createOffer,
    setLocalDescription,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    addTrack,
    removeTrack,
    createDataChannel,
    sendDataChannelMessage,
    closeDataChannel,
    closePeerConnection,
    getConnection,
    getConnectionsForTab,
    getActiveTrackCount,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    onHostPause,
    onHostResume,
    destroy,
  };
}
