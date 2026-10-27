/**
 * NETFLOW Browser V2 — Android WebView Background Media & Autoplay Policy Boundary
 *
 * Form: NETFLOW-V2-NATIVE-27
 *
 * This module establishes the secure WebView Background Media, Autoplay Policy,
 * and Audio Focus Lifecycle boundary:
 * 1. Autoplay Policy:
 *    - Muted autoplay permitted without user gesture
 *    - Unmuted autoplay strictly requires prior user-gesture activation per origin
 *    - Rejection of unmuted autoplay with AUTOPLAY_BLOCKED_UNMUTED policy
 * 2. Background-Tab Media Control:
 *    - Auto-pausing video playback when tab transitions to background to conserve CPU/battery
 *    - Policy-governed background audio control with user preference
 * 3. Android Audio Focus Lifecycle:
 *    - AUDIOFOCUS_GAIN (1): Full audio volume (1.0)
 *    - AUDIOFOCUS_LOSS (-1): Permanent loss; pause/stop playback
 *    - AUDIOFOCUS_LOSS_TRANSIENT (-2): Temporary loss; pause playback
 *    - AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK (-3): Ducking; volume lowered to 0.2
 * 4. Tab, Request, and Canonical-Origin Isolation
 * 5. Private-Mode Isolation: Ephemeral media session states, never persisted
 * 6. Full Lifecycle Cleanup: onNavigation, onReload, onStopLoading, onTabClosed
 * 7. Security & SSRF Protection: Rejects dangerous schemes, private subnets, metadata IPs
 * 8. Privileged Native Bridge Invariant: Pure safe TypeScript boundary without native reflection
 */

export enum AudioFocusState {
  NONE = 0,
  GAIN = 1,
  LOSS = -1,
  LOSS_TRANSIENT = -2,
  LOSS_TRANSIENT_CAN_DUCK = -3,
}

export interface MediaPlaybackSession {
  sessionId: string;
  tabId: string;
  origin: string;
  mediaType: "audio" | "video";
  sourceUrl: string;
  isMuted: boolean;
  isPlaying: boolean;
  isBackground: boolean;
  volume: number; // 0.0 to 1.0
  audioFocus: AudioFocusState;
  hasUserGesture: boolean;
  isPrivate: boolean;
  startedAt: number;
}

export interface AutoplayEvaluationResult {
  allowed: boolean;
  requiresMuted: boolean;
  reason?: string;
  errorCode?: "AUTOPLAY_ALLOWED" | "AUTOPLAY_ALLOWED_MUTED" | "AUTOPLAY_BLOCKED_UNMUTED" | "SECURITY_ERROR";
}

export interface BackgroundMediaPolicyConfig {
  allowBackgroundAudio: boolean;
  autoPauseBackgroundVideo: boolean;
  duckVolumeLevel: number; // default 0.2
}

export const DEFAULT_MEDIA_POLICY_CONFIG: BackgroundMediaPolicyConfig = {
  allowBackgroundAudio: true,
  autoPauseBackgroundVideo: true,
  duckVolumeLevel: 0.2,
};

/**
 * Validates a media URL against dangerous schemes and SSRF targets.
 */
export function validateMediaUrl(urlStr: string): { isValid: boolean; reason?: string } {
  if (!urlStr || typeof urlStr !== "string") {
    return { isValid: false, reason: "Media URL is empty" };
  }

  const trimmed = urlStr.trim().toLowerCase();

  // Block dangerous schemes
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:") ||
    trimmed.startsWith("data:text/html")
  ) {
    return { isValid: false, reason: "Dangerous scheme rejected in media source" };
  }

  // Safe data URIs for media
  if (trimmed.startsWith("data:audio/") || trimmed.startsWith("data:video/")) {
    return { isValid: true };
  }

  // Blob URLs
  if (trimmed.startsWith("blob:")) {
    return { isValid: true };
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return { isValid: false, reason: `Unsupported protocol: ${protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";

    if (
      !isLocalhost &&
      (hostname === "169.254.169.254" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".local"))
    ) {
      return { isValid: false, reason: "SSRF target or private subnet blocked in media source" };
    }

    return { isValid: true };
  } catch {
    return { isValid: false, reason: "Malformed media URL" };
  }
}

export interface AndroidWebViewBackgroundMediaManager {
  // User Gesture Management
  recordUserGesture: (tabId: string, origin: string) => void;
  hasUserGesture: (tabId: string, origin: string) => boolean;

  // Autoplay Evaluation
  evaluateAutoplay: (
    tabId: string,
    origin: string,
    isMuted: boolean,
    sourceUrl: string
  ) => AutoplayEvaluationResult;

  // Playback Session Management
  requestPlayback: (
    tabId: string,
    origin: string,
    mediaType: "audio" | "video",
    sourceUrl: string,
    isMuted: boolean,
    isPrivate?: boolean
  ) => { success: boolean; session?: MediaPlaybackSession; reason?: string };

  pausePlayback: (sessionId: string) => boolean;
  resumePlayback: (sessionId: string) => boolean;
  stopPlayback: (sessionId: string) => boolean;

  // Background / Foreground Tab Transitions
  setForegroundTab: (tabId: string) => void;
  setBackgroundTab: (tabId: string) => void;

  // Android Audio Focus Lifecycle
  requestAudioFocus: (sessionId: string) => AudioFocusState;
  abandonAudioFocus: (sessionId: string) => void;
  simulateAudioFocusChange: (sessionId: string, newFocus: AudioFocusState) => void;

  // Queries
  getSessionsForTab: (tabId: string) => MediaPlaybackSession[];
  getActiveAudioTabCount: () => number;

  // Lifecycle & Cleanups
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  destroy: () => void;
}

export function createAndroidWebViewBackgroundMediaManager(
  config: Partial<BackgroundMediaPolicyConfig> = {}
): AndroidWebViewBackgroundMediaManager {
  const effectiveConfig: BackgroundMediaPolicyConfig = {
    ...DEFAULT_MEDIA_POLICY_CONFIG,
    ...config,
  };

  // Map<tabId, Set<canonicalOrigin>> - Tracks origins with valid user gesture
  const userGestureRegistry = new Map<string, Set<string>>();

  // Active media sessions: Map<sessionId, MediaPlaybackSession>
  const activeSessions = new Map<string, MediaPlaybackSession>();

  // Currently focused session (holds AUDIOFOCUS_GAIN)
  let currentFocusedSessionId: string | null = null;

  // Tab foreground status: tabId of currently active foreground tab
  let foregroundTabId: string | null = null;

  // -------------------------------------------------------------
  // 1. User Gesture Tracking
  // -------------------------------------------------------------
  const recordUserGesture = (tabId: string, origin: string) => {
    let origins = userGestureRegistry.get(tabId);
    if (!origins) {
      origins = new Set<string>();
      userGestureRegistry.set(tabId, origins);
    }
    origins.add(origin.toLowerCase());
  };

  const hasUserGesture = (tabId: string, origin: string): boolean => {
    const origins = userGestureRegistry.get(tabId);
    if (!origins) return false;
    return origins.has(origin.toLowerCase());
  };

  // -------------------------------------------------------------
  // 2. Autoplay Policy Evaluation
  // -------------------------------------------------------------
  const evaluateAutoplay = (
    tabId: string,
    origin: string,
    isMuted: boolean,
    sourceUrl: string
  ): AutoplayEvaluationResult => {
    const valUrl = validateMediaUrl(sourceUrl);
    if (!valUrl.isValid) {
      return {
        allowed: false,
        requiresMuted: false,
        reason: valUrl.reason,
        errorCode: "SECURITY_ERROR",
      };
    }

    // Muted autoplay is always permitted
    if (isMuted) {
      return {
        allowed: true,
        requiresMuted: true,
        reason: "Muted media autoplay is permitted without user gesture",
        errorCode: "AUTOPLAY_ALLOWED_MUTED",
      };
    }

    // Unmuted autoplay requires prior user gesture on this tab & origin
    if (hasUserGesture(tabId, origin)) {
      return {
        allowed: true,
        requiresMuted: false,
        reason: "Unmuted autoplay permitted due to prior user gesture",
        errorCode: "AUTOPLAY_ALLOWED",
      };
    }

    // Blocked unmuted autoplay
    return {
      allowed: false,
      requiresMuted: true,
      reason: "Autoplay with sound is blocked. User gesture is required.",
      errorCode: "AUTOPLAY_BLOCKED_UNMUTED",
    };
  };

  // -------------------------------------------------------------
  // 3. Audio Focus Management
  // -------------------------------------------------------------
  const requestAudioFocus = (sessionId: string): AudioFocusState => {
    const targetSession = activeSessions.get(sessionId);
    if (!targetSession) return AudioFocusState.NONE;

    // If another session currently holds audio focus, revoke it
    if (currentFocusedSessionId && currentFocusedSessionId !== sessionId) {
      const prevSession = activeSessions.get(currentFocusedSessionId);
      if (prevSession && prevSession.isPlaying) {
        prevSession.audioFocus = AudioFocusState.LOSS;
        prevSession.isPlaying = false;
        prevSession.volume = 0.0;
      }
    }

    targetSession.audioFocus = AudioFocusState.GAIN;
    targetSession.volume = 1.0;
    currentFocusedSessionId = sessionId;
    return AudioFocusState.GAIN;
  };

  const abandonAudioFocus = (sessionId: string) => {
    const targetSession = activeSessions.get(sessionId);
    if (targetSession) {
      targetSession.audioFocus = AudioFocusState.NONE;
    }
    if (currentFocusedSessionId === sessionId) {
      currentFocusedSessionId = null;
    }
  };

  const simulateAudioFocusChange = (sessionId: string, newFocus: AudioFocusState) => {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    session.audioFocus = newFocus;

    switch (newFocus) {
      case AudioFocusState.GAIN:
        session.volume = 1.0;
        session.isPlaying = true;
        break;
      case AudioFocusState.LOSS:
      case AudioFocusState.LOSS_TRANSIENT:
        session.isPlaying = false;
        session.volume = 0.0;
        break;
      case AudioFocusState.LOSS_TRANSIENT_CAN_DUCK:
        // Lower volume (ducking)
        session.volume = effectiveConfig.duckVolumeLevel;
        break;
      case AudioFocusState.NONE:
        session.isPlaying = false;
        break;
    }
  };

  // -------------------------------------------------------------
  // 4. Playback Session Management
  // -------------------------------------------------------------
  const requestPlayback = (
    tabId: string,
    origin: string,
    mediaType: "audio" | "video",
    sourceUrl: string,
    isMuted: boolean,
    isPrivate = false
  ): { success: boolean; session?: MediaPlaybackSession; reason?: string } => {
    const autoplayCheck = evaluateAutoplay(tabId, origin, isMuted, sourceUrl);
    if (!autoplayCheck.allowed) {
      return { success: false, reason: autoplayCheck.reason };
    }

    const isTabInBackground = foregroundTabId !== null && foregroundTabId !== tabId;

    // Check background video auto-pause policy
    if (isTabInBackground && mediaType === "video" && effectiveConfig.autoPauseBackgroundVideo) {
      return {
        success: false,
        reason: "Video playback in background tab is disallowed by policy",
      };
    }

    const sessionId = `media-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session: MediaPlaybackSession = {
      sessionId,
      tabId,
      origin: origin.toLowerCase(),
      mediaType,
      sourceUrl,
      isMuted,
      isPlaying: true,
      isBackground: isTabInBackground,
      volume: isMuted ? 0.0 : 1.0,
      audioFocus: isMuted ? AudioFocusState.NONE : AudioFocusState.GAIN,
      hasUserGesture: hasUserGesture(tabId, origin),
      isPrivate,
      startedAt: Date.now(),
    };

    activeSessions.set(sessionId, session);

    if (!isMuted) {
      requestAudioFocus(sessionId);
    }

    return { success: true, session };
  };

  const pausePlayback = (sessionId: string): boolean => {
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    session.isPlaying = false;
    return true;
  };

  const resumePlayback = (sessionId: string): boolean => {
    const session = activeSessions.get(sessionId);
    if (!session) return false;

    // If tab is in background and it is a video, check policy
    if (session.isBackground && session.mediaType === "video" && effectiveConfig.autoPauseBackgroundVideo) {
      return false;
    }

    session.isPlaying = true;
    if (!session.isMuted) {
      requestAudioFocus(sessionId);
    }
    return true;
  };

  const stopPlayback = (sessionId: string): boolean => {
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    abandonAudioFocus(sessionId);
    session.isPlaying = false;
    activeSessions.delete(sessionId);
    return true;
  };

  // -------------------------------------------------------------
  // 5. Background / Foreground Transitions
  // -------------------------------------------------------------
  const setForegroundTab = (tabId: string) => {
    foregroundTabId = tabId;

    activeSessions.forEach((session) => {
      if (session.tabId === tabId) {
        session.isBackground = false;
      } else {
        // Tab moved to background
        session.isBackground = true;
        if (session.mediaType === "video" && effectiveConfig.autoPauseBackgroundVideo) {
          session.isPlaying = false;
        } else if (session.mediaType === "audio" && !effectiveConfig.allowBackgroundAudio) {
          session.isPlaying = false;
          abandonAudioFocus(session.sessionId);
        }
      }
    });
  };

  const setBackgroundTab = (tabId: string) => {
    activeSessions.forEach((session) => {
      if (session.tabId === tabId) {
        session.isBackground = true;
        if (session.mediaType === "video" && effectiveConfig.autoPauseBackgroundVideo) {
          session.isPlaying = false;
        } else if (session.mediaType === "audio" && !effectiveConfig.allowBackgroundAudio) {
          session.isPlaying = false;
          abandonAudioFocus(session.sessionId);
        }
      }
    });
  };

  // -------------------------------------------------------------
  // 6. Queries
  // -------------------------------------------------------------
  const getSessionsForTab = (tabId: string): MediaPlaybackSession[] => {
    const res: MediaPlaybackSession[] = [];
    activeSessions.forEach((s) => {
      if (s.tabId === tabId) res.push({ ...s });
    });
    return res;
  };

  const getActiveAudioTabCount = (): number => {
    const audioTabs = new Set<string>();
    activeSessions.forEach((s) => {
      if (s.isPlaying && !s.isMuted) {
        audioTabs.add(s.tabId);
      }
    });
    return audioTabs.size;
  };

  // -------------------------------------------------------------
  // 7. Lifecycle Cleanups
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, _newUrl: string) => {
    // Stop all media playback for this tab on navigation
    activeSessions.forEach((s, sId) => {
      if (s.tabId === tabId) {
        stopPlayback(sId);
      }
    });
    // Clear user gesture tokens for this tab on navigation
    userGestureRegistry.delete(tabId);
  };

  const onReload = (tabId: string) => {
    onNavigation(tabId, "");
  };

  const onStopLoading = (tabId: string) => {
    // Stop any in-flight un-started media
    activeSessions.forEach((s, sId) => {
      if (s.tabId === tabId && !s.isPlaying) {
        stopPlayback(sId);
      }
    });
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    onNavigation(tabId, "");

    // If closing last private tab, wipe all private media states
    if (isPrivate && remainingPrivateTabs === 0) {
      activeSessions.forEach((s, sId) => {
        if (s.isPrivate) {
          stopPlayback(sId);
        }
      });
    }
  };

  const destroy = () => {
    activeSessions.forEach((_, sId) => stopPlayback(sId));
    activeSessions.clear();
    userGestureRegistry.clear();
    currentFocusedSessionId = null;
    foregroundTabId = null;
  };

  return {
    recordUserGesture,
    hasUserGesture,
    evaluateAutoplay,
    requestPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    setForegroundTab,
    setBackgroundTab,
    requestAudioFocus,
    abandonAudioFocus,
    simulateAudioFocusChange,
    getSessionsForTab,
    getActiveAudioTabCount,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
