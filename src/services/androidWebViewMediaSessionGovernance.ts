/**
 * NETFLOW Browser V2 — Android WebView Media Session & Multi-Tab Resource Governance
 *
 * Form: NETFLOW-V2-NATIVE-28
 *
 * This module establishes the multi-tab media session governance, competing audio arbitration,
 * per-tab resource/memory limits, duplicate session prevention, and active-tab priority:
 * 1. Multi-Tab Media Session Governance & Active-Tab Priority:
 *    - Active foreground tab possesses highest priority (PRIORITY_HIGH)
 *    - Competing background tabs are arbitrated, ducked, or paused
 * 2. Competing Audio Session Arbitration:
 *    - Policy modes: EXCLUSIVE, DUCK_BACKGROUND, CONCURRENT_MIXED
 *    - Automatic resolution when multiple tabs concurrently request audio
 * 3. Per-Tab & Global Media Resource / Memory Limits:
 *    - Max sessions per tab (MAX_SESSIONS_PER_TAB = 5)
 *    - Max global active audio sessions (MAX_GLOBAL_AUDIO_SESSIONS = 8)
 *    - Memory exhaustion protection against runaway audio/video elements
 * 4. Duplicate Media Session Prevention:
 *    - Deduplicates identical source URL & media type within the same tab/origin
 * 5. Background / Foreground Transition Consistency:
 *    - Smooth volume adjustments and state preservation on tab switching
 * 6. Audio Focus Conflict Handling:
 *    - Translates system audio focus transitions to governed tab media sessions
 * 7. Tab, Canonical-Origin & Private-Mode Isolation:
 *    - Ephemeral private tab sessions, purged cleanly on private session end
 * 8. Lifecycle & Cleanups:
 *    - onNavigation, onReload, onStopLoading, onTabClosed
 * 9. Media URL Security & SSRF Protection:
 *    - Rejects dangerous schemes, private subnets, cloud metadata IPs
 * 10. Privileged Native Bridge Invariant:
 *    - Pure safe TypeScript boundary without reflection.
 */

import { AudioFocusState, validateMediaUrl } from "./androidWebViewBackgroundMediaAndAutoplayBoundary";

export enum MediaPriorityLevel {
  IDLE = 0,
  LOW = 10,
  NORMAL = 50,
  HIGH = 100,
}

export enum AudioArbitrationMode {
  EXCLUSIVE = "exclusive", // Only 1 tab plays unmuted audio (active tab wins)
  DUCK_BACKGROUND = "duck_background", // Background audio is ducked when active plays
  CONCURRENT_MIXED = "concurrent_mixed", // Concurrent playback within resource limits
}

export enum MediaSessionState {
  INITIALIZING = "initializing",
  PLAYING = "playing",
  PAUSED_BY_USER = "paused_by_user",
  PAUSED_BACKGROUND = "paused_background",
  PAUSED_BY_ARBITRATION = "paused_by_arbitration",
  DUCKED = "ducked",
  STOPPED = "stopped",
}

export interface GovernedMediaSession {
  sessionId: string;
  tabId: string;
  origin: string;
  mediaType: "audio" | "video";
  sourceUrl: string;
  state: MediaSessionState;
  isMuted: boolean;
  baseVolume: number; // 0.0 to 1.0 (intended volume)
  effectiveVolume: number; // 0.0 to 1.0 (actual audio level after ducking/arbitration)
  audioFocus: AudioFocusState;
  priority: MediaPriorityLevel;
  isForeground: boolean;
  isPrivate: boolean;
  createdAt: number;
  lastActiveAt: number;
}

export interface MediaGovernanceLimits {
  maxSessionsPerTab: number;
  maxGlobalAudioSessions: number;
  duckVolumeLevel: number;
}

export const DEFAULT_GOVERNANCE_LIMITS: MediaGovernanceLimits = {
  maxSessionsPerTab: 5,
  maxGlobalAudioSessions: 8,
  duckVolumeLevel: 0.15,
};

export interface MediaSessionRequestOptions {
  mediaType: "audio" | "video";
  sourceUrl: string;
  isMuted: boolean;
  volume?: number;
  isPrivate?: boolean;
}

export interface MediaSessionRequestResult {
  success: boolean;
  session?: GovernedMediaSession;
  isDeduplicated?: boolean;
  errorCode?: "LIMIT_EXCEEDED" | "DUPLICATE_ACTIVE" | "SECURITY_ERROR" | "ARBITRATION_REJECTED";
  reason?: string;
}

export interface AndroidWebViewMediaSessionGovernanceManager {
  // Active tab designation
  setActiveForegroundTab: (tabId: string) => void;
  getActiveForegroundTab: () => string | null;

  // Session registration and governance
  requestMediaSession: (
    tabId: string,
    origin: string,
    options: MediaSessionRequestOptions
  ) => MediaSessionRequestResult;

  pauseSession: (sessionId: string, reason?: "user" | "background" | "arbitration") => boolean;
  resumeSession: (sessionId: string) => boolean;
  stopSession: (sessionId: string) => boolean;
  setSessionMuted: (sessionId: string, isMuted: boolean) => boolean;
  setSessionVolume: (sessionId: string, volume: number) => boolean;

  // Arbitration & Policy
  setArbitrationMode: (mode: AudioArbitrationMode) => void;
  getArbitrationMode: () => AudioArbitrationMode;
  recomputeAudioArbitration: () => void;

  // External Audio Focus integration
  handleExternalAudioFocusChange: (newFocus: AudioFocusState) => void;

  // Query state
  getSessionsForTab: (tabId: string) => GovernedMediaSession[];
  getSessionById: (sessionId: string) => GovernedMediaSession | undefined;
  getActiveAudioTabCount: () => number;
  getTotalActiveSessionsCount: () => number;

  // Lifecycle Cleanups
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  destroy: () => void;
}

export function createAndroidWebViewMediaSessionGovernanceManager(
  customLimits: Partial<MediaGovernanceLimits> = {}
): AndroidWebViewMediaSessionGovernanceManager {
  const limits: MediaGovernanceLimits = {
    ...DEFAULT_GOVERNANCE_LIMITS,
    ...customLimits,
  };

  let activeForegroundTabId: string | null = null;
  let arbitrationMode: AudioArbitrationMode = AudioArbitrationMode.DUCK_BACKGROUND;

  // Map<sessionId, GovernedMediaSession>
  const sessions = new Map<string, GovernedMediaSession>();

  // Map<tabId, Set<sessionId>>
  const tabSessionsMap = new Map<string, Set<string>>();

  // Helper: Get or initialize set for tab
  const getTabSessionSet = (tabId: string): Set<string> => {
    let set = tabSessionsMap.get(tabId);
    if (!set) {
      set = new Set<string>();
      tabSessionsMap.set(tabId, set);
    }
    return set;
  };

  // -------------------------------------------------------------
  // 1. Audio Arbitration Engine
  // -------------------------------------------------------------
  const recomputeAudioArbitration = () => {
    const activeForegroundTab = activeForegroundTabId;

    // Check if the active tab is playing unmuted audio
    let foregroundTabPlayingAudio = false;
    sessions.forEach((s) => {
      if (
        s.tabId === activeForegroundTab &&
        s.state === MediaSessionState.PLAYING &&
        !s.isMuted &&
        s.baseVolume > 0
      ) {
        foregroundTabPlayingAudio = true;
      }
    });

    sessions.forEach((session) => {
      // If stopped or paused by user, skip
      if (
        session.state === MediaSessionState.STOPPED ||
        session.state === MediaSessionState.PAUSED_BY_USER
      ) {
        return;
      }

      const isCurrentTabForeground = session.tabId === activeForegroundTab;
      session.isForeground = isCurrentTabForeground;

      // Calculate base priority
      if (isCurrentTabForeground) {
        session.priority = MediaPriorityLevel.HIGH;
      } else if (session.mediaType === "audio" && !session.isMuted) {
        session.priority = MediaPriorityLevel.NORMAL;
      } else {
        session.priority = MediaPriorityLevel.LOW;
      }

      // Background video policy: auto-pause videos in background tab
      if (!isCurrentTabForeground && session.mediaType === "video") {
        if (session.state === MediaSessionState.PLAYING) {
          session.state = MediaSessionState.PAUSED_BACKGROUND;
          session.effectiveVolume = 0.0;
        }
        return;
      }

      // If session is muted or video-only without sound
      if (session.isMuted || session.baseVolume === 0) {
        session.effectiveVolume = 0.0;
        session.audioFocus = AudioFocusState.NONE;
        return;
      }

      // Unmuted Audio Arbitration Logic
      if (isCurrentTabForeground) {
        // Foreground tab receives full volume and audio focus
        session.effectiveVolume = session.baseVolume;
        session.audioFocus = AudioFocusState.GAIN;
        if (session.state === MediaSessionState.DUCKED || session.state === MediaSessionState.PAUSED_BY_ARBITRATION) {
          session.state = MediaSessionState.PLAYING;
        }
      } else {
        // Background tab playing unmuted audio
        if (foregroundTabPlayingAudio) {
          if (arbitrationMode === AudioArbitrationMode.EXCLUSIVE) {
            // Exclude background audio completely
            session.state = MediaSessionState.PAUSED_BY_ARBITRATION;
            session.effectiveVolume = 0.0;
            session.audioFocus = AudioFocusState.LOSS;
          } else if (arbitrationMode === AudioArbitrationMode.DUCK_BACKGROUND) {
            // Duck background audio
            session.state = MediaSessionState.DUCKED;
            session.effectiveVolume = Math.min(session.baseVolume, limits.duckVolumeLevel);
            session.audioFocus = AudioFocusState.LOSS_TRANSIENT_CAN_DUCK;
          } else {
            // Concurrent mixed
            session.state = MediaSessionState.PLAYING;
            session.effectiveVolume = session.baseVolume;
            session.audioFocus = AudioFocusState.GAIN;
          }
        } else {
          // No foreground audio playing: background tab can play at base volume
          session.state = MediaSessionState.PLAYING;
          session.effectiveVolume = session.baseVolume;
          session.audioFocus = AudioFocusState.GAIN;
        }
      }
    });
  };

  // -------------------------------------------------------------
  // 2. Active Tab Management
  // -------------------------------------------------------------
  const setActiveForegroundTab = (tabId: string) => {
    activeForegroundTabId = tabId;
    recomputeAudioArbitration();
  };

  const getActiveForegroundTab = (): string | null => {
    return activeForegroundTabId;
  };

  // -------------------------------------------------------------
  // 3. Media Session Registration & Request Handling
  // -------------------------------------------------------------
  const requestMediaSession = (
    tabId: string,
    origin: string,
    options: MediaSessionRequestOptions
  ): MediaSessionRequestResult => {
    // 3.1 Security validation on media URL
    const urlCheck = validateMediaUrl(options.sourceUrl);
    if (!urlCheck.isValid) {
      return {
        success: false,
        errorCode: "SECURITY_ERROR",
        reason: urlCheck.reason || "SecurityError: Blocked media source URL",
      };
    }

    const tabSessions = getTabSessionSet(tabId);

    // 3.2 Duplicate session prevention: check if identical sourceUrl + mediaType exists in this tab
    for (const existingId of tabSessions) {
      const existingSession = sessions.get(existingId);
      if (
        existingSession &&
        existingSession.sourceUrl === options.sourceUrl &&
        existingSession.mediaType === options.mediaType &&
        existingSession.state !== MediaSessionState.STOPPED
      ) {
        // Deduplicate: refresh existing session and return it
        existingSession.lastActiveAt = Date.now();
        if (options.isMuted !== undefined) {
          existingSession.isMuted = options.isMuted;
        }
        recomputeAudioArbitration();
        return {
          success: true,
          session: existingSession,
          isDeduplicated: true,
        };
      }
    }

    // 3.3 Per-Tab Resource Limits Check
    const activeTabSessionsCount = Array.from(tabSessions).filter((id) => {
      const s = sessions.get(id);
      return s && s.state !== MediaSessionState.STOPPED;
    }).length;

    if (activeTabSessionsCount >= limits.maxSessionsPerTab) {
      return {
        success: false,
        errorCode: "LIMIT_EXCEEDED",
        reason: `ResourceLimitError: Tab exceeded maximum allowed media sessions (${limits.maxSessionsPerTab})`,
      };
    }

    // 3.4 Global Active Audio Sessions Limit Check
    if (!options.isMuted) {
      let currentActiveAudioSessions = 0;
      sessions.forEach((s) => {
        if (!s.isMuted && (s.state === MediaSessionState.PLAYING || s.state === MediaSessionState.DUCKED)) {
          currentActiveAudioSessions++;
        }
      });

      if (currentActiveAudioSessions >= limits.maxGlobalAudioSessions) {
        return {
          success: false,
          errorCode: "LIMIT_EXCEEDED",
          reason: `ResourceLimitError: Global audio mixer reached maximum concurrent active sessions (${limits.maxGlobalAudioSessions})`,
        };
      }
    }

    // 3.5 Create new governed session
    const isForeground = tabId === activeForegroundTabId;
    const baseVolume = options.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
    const sessionId = `media-gov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newSession: GovernedMediaSession = {
      sessionId,
      tabId,
      origin: origin.toLowerCase(),
      mediaType: options.mediaType,
      sourceUrl: options.sourceUrl,
      state: MediaSessionState.PLAYING,
      isMuted: options.isMuted,
      baseVolume,
      effectiveVolume: options.isMuted ? 0.0 : baseVolume,
      audioFocus: options.isMuted ? AudioFocusState.NONE : AudioFocusState.GAIN,
      priority: isForeground ? MediaPriorityLevel.HIGH : MediaPriorityLevel.NORMAL,
      isForeground,
      isPrivate: Boolean(options.isPrivate),
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    sessions.set(sessionId, newSession);
    tabSessions.add(sessionId);

    recomputeAudioArbitration();

    return {
      success: true,
      session: newSession,
      isDeduplicated: false,
    };
  };

  // -------------------------------------------------------------
  // 4. Session Controls: Pause, Resume, Stop, Volume
  // -------------------------------------------------------------
  const pauseSession = (
    sessionId: string,
    reason: "user" | "background" | "arbitration" = "user"
  ): boolean => {
    const session = sessions.get(sessionId);
    if (!session || session.state === MediaSessionState.STOPPED) return false;

    if (reason === "user") {
      session.state = MediaSessionState.PAUSED_BY_USER;
    } else if (reason === "background") {
      session.state = MediaSessionState.PAUSED_BACKGROUND;
    } else {
      session.state = MediaSessionState.PAUSED_BY_ARBITRATION;
    }

    session.effectiveVolume = 0.0;
    session.lastActiveAt = Date.now();
    recomputeAudioArbitration();
    return true;
  };

  const resumeSession = (sessionId: string): boolean => {
    const session = sessions.get(sessionId);
    if (!session || session.state === MediaSessionState.STOPPED) return false;

    session.state = MediaSessionState.PLAYING;
    session.lastActiveAt = Date.now();
    recomputeAudioArbitration();
    return true;
  };

  const stopSession = (sessionId: string): boolean => {
    const session = sessions.get(sessionId);
    if (!session) return false;

    session.state = MediaSessionState.STOPPED;
    session.effectiveVolume = 0.0;
    session.audioFocus = AudioFocusState.NONE;

    sessions.delete(sessionId);
    const tabSessions = tabSessionsMap.get(session.tabId);
    if (tabSessions) {
      tabSessions.delete(sessionId);
    }

    recomputeAudioArbitration();
    return true;
  };

  const setSessionMuted = (sessionId: string, isMuted: boolean): boolean => {
    const session = sessions.get(sessionId);
    if (!session || session.state === MediaSessionState.STOPPED) return false;

    session.isMuted = isMuted;
    recomputeAudioArbitration();
    return true;
  };

  const setSessionVolume = (sessionId: string, volume: number): boolean => {
    const session = sessions.get(sessionId);
    if (!session || session.state === MediaSessionState.STOPPED) return false;

    session.baseVolume = Math.max(0, Math.min(1, volume));
    recomputeAudioArbitration();
    return true;
  };

  // -------------------------------------------------------------
  // 5. Arbitration Policy Configuration
  // -------------------------------------------------------------
  const setArbitrationMode = (mode: AudioArbitrationMode) => {
    arbitrationMode = mode;
    recomputeAudioArbitration();
  };

  const getArbitrationMode = (): AudioArbitrationMode => {
    return arbitrationMode;
  };

  // -------------------------------------------------------------
  // 6. External System Audio Focus Integration
  // -------------------------------------------------------------
  const handleExternalAudioFocusChange = (newFocus: AudioFocusState) => {
    sessions.forEach((session) => {
      if (session.state === MediaSessionState.STOPPED || session.isMuted) return;

      session.audioFocus = newFocus;
      switch (newFocus) {
        case AudioFocusState.GAIN:
          session.effectiveVolume = session.baseVolume;
          if (session.state === MediaSessionState.PAUSED_BY_ARBITRATION) {
            session.state = MediaSessionState.PLAYING;
          }
          break;
        case AudioFocusState.LOSS:
        case AudioFocusState.LOSS_TRANSIENT:
          session.effectiveVolume = 0.0;
          session.state = MediaSessionState.PAUSED_BY_ARBITRATION;
          break;
        case AudioFocusState.LOSS_TRANSIENT_CAN_DUCK:
          session.effectiveVolume = Math.min(session.baseVolume, limits.duckVolumeLevel);
          session.state = MediaSessionState.DUCKED;
          break;
      }
    });
  };

  // -------------------------------------------------------------
  // 7. Querying State
  // -------------------------------------------------------------
  const getSessionsForTab = (tabId: string): GovernedMediaSession[] => {
    const result: GovernedMediaSession[] = [];
    const tabSet = tabSessionsMap.get(tabId);
    if (tabSet) {
      tabSet.forEach((sId) => {
        const s = sessions.get(sId);
        if (s) result.push({ ...s });
      });
    }
    return result;
  };

  const getSessionById = (sessionId: string): GovernedMediaSession | undefined => {
    const s = sessions.get(sessionId);
    return s ? { ...s } : undefined;
  };

  const getActiveAudioTabCount = (): number => {
    const audioTabs = new Set<string>();
    sessions.forEach((s) => {
      if (
        !s.isMuted &&
        s.effectiveVolume > 0 &&
        (s.state === MediaSessionState.PLAYING || s.state === MediaSessionState.DUCKED)
      ) {
        audioTabs.add(s.tabId);
      }
    });
    return audioTabs.size;
  };

  const getTotalActiveSessionsCount = (): number => {
    let count = 0;
    sessions.forEach((s) => {
      if (s.state !== MediaSessionState.STOPPED) {
        count++;
      }
    });
    return count;
  };

  // -------------------------------------------------------------
  // 8. Lifecycle & Cleanups
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, _newUrl: string) => {
    const tabSessions = tabSessionsMap.get(tabId);
    if (tabSessions) {
      tabSessions.forEach((sId) => {
        stopSession(sId);
      });
      tabSessions.clear();
    }
    recomputeAudioArbitration();
  };

  const onReload = (tabId: string) => {
    onNavigation(tabId, "");
  };

  const onStopLoading = (tabId: string) => {
    const tabSessions = tabSessionsMap.get(tabId);
    if (tabSessions) {
      tabSessions.forEach((sId) => {
        const s = sessions.get(sId);
        if (s && s.state === MediaSessionState.INITIALIZING) {
          stopSession(sId);
        }
      });
    }
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    onNavigation(tabId, "");
    tabSessionsMap.delete(tabId);

    // If closing active foreground tab, clear active foreground ref
    if (activeForegroundTabId === tabId) {
      activeForegroundTabId = null;
    }

    // If closing last private tab, wipe all private media sessions across all private storage
    if (isPrivate && remainingPrivateTabs === 0) {
      sessions.forEach((s, sId) => {
        if (s.isPrivate) {
          stopSession(sId);
        }
      });
    }

    recomputeAudioArbitration();
  };

  const destroy = () => {
    sessions.forEach((_, sId) => stopSession(sId));
    sessions.clear();
    tabSessionsMap.clear();
    activeForegroundTabId = null;
  };

  return {
    setActiveForegroundTab,
    getActiveForegroundTab,
    requestMediaSession,
    pauseSession,
    resumeSession,
    stopSession,
    setSessionMuted,
    setSessionVolume,
    setArbitrationMode,
    getArbitrationMode,
    recomputeAudioArbitration,
    handleExternalAudioFocusChange,
    getSessionsForTab,
    getSessionById,
    getActiveAudioTabCount,
    getTotalActiveSessionsCount,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
