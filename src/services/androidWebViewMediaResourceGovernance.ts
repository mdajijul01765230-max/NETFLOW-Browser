/**
 * NETFLOW Browser V2 — Android WebView Media Resource Lifetime & Memory Pressure Governance
 *
 * Form: NETFLOW-V2-NATIVE-29
 *
 * This module establishes the media resource lifetime, memory accounting, and memory pressure governance:
 * 1. Resource Lifetime Control:
 *    - Continuous playback duration limits for background media (prevents indefinite battery drain)
 *    - Idle/stale timeouts for paused media sessions (IDLE_TIMEOUT_MS = 300,000ms / 5min)
 * 2. Per-Tab Media Resource Accounting:
 *    - Tracks video decoders, audio/video buffer byte estimations, and per-tab memory quotas
 *    - Tab quota: MAX_TAB_MEDIA_MEMORY_BYTES = 100 MB
 *    - Global quota: MAX_GLOBAL_MEDIA_MEMORY_BYTES = 250 MB
 *    - Max video decoders per tab: MAX_VIDEO_DECODERS_PER_TAB = 2 (Global: 4)
 * 3. Excessive Media Session & Memory Pressure Detection:
 *    - Pressure levels: NORMAL (0), MODERATE (1), CRITICAL (2)
 *    - Automated threshold alerts when approaching or exceeding memory limits
 * 4. Idle / Stale Media Resource Cleanup:
 *    - Automatic or on-demand reclamation of idle, stale, or abandoned media buffers
 * 5. Memory-Pressure-Safe Media Cleanup (onTrimMemory / onMemoryPressure):
 *    - Evicts stale background sessions first, then background video buffers, preserving active foreground playback
 * 6. Background / Foreground Transition Consistency:
 *    - Tracks background duration and enforces resource reduction on background transitions
 * 7. Tab, Canonical-Origin & Private-Tab Isolation:
 *    - Ephemeral accounting for private tabs, purged cleanly on private session end
 * 8. Full Lifecycle Cleanups:
 *    - onNavigation, onReload, onStopLoading, onTabClosed
 * 9. Security & SSRF Protection:
 *    - Rejects dangerous schemes, private subnets, cloud metadata IPs
 * 10. Privileged Native Bridge Invariant:
 *    - Pure safe TypeScript boundary without native reflection.
 */

import { validateMediaUrl } from "./androidWebViewBackgroundMediaAndAutoplayBoundary";

export enum MemoryPressureLevel {
  NORMAL = 0,
  MODERATE = 1,
  CRITICAL = 2,
}

export enum MediaResourceState {
  ACTIVE_PLAYING = "active_playing",
  PAUSED_IDLE = "paused_idle",
  BACKGROUND_THROTTLED = "background_throttled",
  STALE_EXPIRED = "stale_expired",
  EVICTED_PRESSURE = "evicted_pressure",
  RELEASED = "released",
}

export interface TrackedMediaResource {
  resourceId: string;
  tabId: string;
  origin: string;
  mediaType: "audio" | "video";
  sourceUrl: string;
  state: MediaResourceState;
  estimatedMemoryBytes: number;
  allocatesDecoder: boolean;
  isForeground: boolean;
  isPrivate: boolean;
  createdAt: number;
  lastActiveAt: number;
  totalPlaybackDurationMs: number;
}

export interface TabMediaAccounting {
  tabId: string;
  totalMemoryBytes: number;
  videoDecoderCount: number;
  activeSessionCount: number;
  isPrivate: boolean;
  lastUpdated: number;
}

export interface MediaResourceGovernanceConfig {
  maxTabMediaMemoryBytes: number; // e.g. 100 MB
  maxGlobalMediaMemoryBytes: number; // e.g. 250 MB
  maxVideoDecodersPerTab: number; // e.g. 2
  maxGlobalVideoDecoders: number; // e.g. 4
  idleTimeoutMs: number; // e.g. 300,000ms (5 mins)
  maxBackgroundPlaybackDurationMs: number; // e.g. 7,200,000ms (2 hours)
  defaultAudioBufferBytes: number; // e.g. 10 MB
  defaultVideoBufferBytes: number; // e.g. 40 MB
}

export const DEFAULT_RESOURCE_GOVERNANCE_CONFIG: MediaResourceGovernanceConfig = {
  maxTabMediaMemoryBytes: 100 * 1024 * 1024, // 100 MB
  maxGlobalMediaMemoryBytes: 250 * 1024 * 1024, // 250 MB
  maxVideoDecodersPerTab: 2,
  maxGlobalVideoDecoders: 4,
  idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  maxBackgroundPlaybackDurationMs: 2 * 60 * 60 * 1000, // 2 hours
  defaultAudioBufferBytes: 10 * 1024 * 1024, // 10 MB
  defaultVideoBufferBytes: 40 * 1024 * 1024, // 40 MB
};

export interface ResourceAllocationResult {
  success: boolean;
  resource?: TrackedMediaResource;
  isDeduplicated?: boolean;
  errorCode?: "LIMIT_EXCEEDED" | "MEMORY_PRESSURE" | "SECURITY_ERROR";
  reason?: string;
}

export interface AndroidWebViewMediaResourceManager {
  // Tab foreground designation
  setActiveForegroundTab: (tabId: string) => void;
  getActiveForegroundTab: () => string | null;

  // Resource registration and accounting
  allocateMediaResource: (
    tabId: string,
    origin: string,
    mediaType: "audio" | "video",
    sourceUrl: string,
    isPrivate?: boolean
  ) => ResourceAllocationResult;

  updateResourceActivity: (resourceId: string, isPlaying: boolean) => void;
  releaseMediaResource: (resourceId: string) => boolean;

  // Memory pressure & Garbage collection
  handleMemoryPressure: (level: MemoryPressureLevel) => { evictedCount: number; freedBytes: number };
  reclaimIdleAndStaleResources: () => { reclaimedCount: number; freedBytes: number };
  getMemoryPressureLevel: () => MemoryPressureLevel;

  // Query accounting
  getTabAccounting: (tabId: string) => TabMediaAccounting;
  getGlobalMemoryUsageBytes: () => number;
  getGlobalVideoDecoderCount: () => number;
  getResourcesForTab: (tabId: string) => TrackedMediaResource[];

  // Lifecycle Cleanups
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  destroy: () => void;
}

export function createAndroidWebViewMediaResourceManager(
  customConfig: Partial<MediaResourceGovernanceConfig> = {}
): AndroidWebViewMediaResourceManager {
  const config: MediaResourceGovernanceConfig = {
    ...DEFAULT_RESOURCE_GOVERNANCE_CONFIG,
    ...customConfig,
  };

  let activeForegroundTabId: string | null = null;

  // Map<resourceId, TrackedMediaResource>
  const resources = new Map<string, TrackedMediaResource>();

  // Map<tabId, Set<resourceId>>
  const tabResources = new Map<string, Set<string>>();

  const getTabResourceSet = (tabId: string): Set<string> => {
    let set = tabResources.get(tabId);
    if (!set) {
      set = new Set<string>();
      tabResources.set(tabId, set);
    }
    return set;
  };

  // -------------------------------------------------------------
  // 1. Memory Accounting Calculation
  // -------------------------------------------------------------
  const getTabAccounting = (tabId: string): TabMediaAccounting => {
    const set = tabResources.get(tabId);
    let totalBytes = 0;
    let videoDecoderCount = 0;
    let activeSessionCount = 0;
    let isPrivate = false;

    if (set) {
      set.forEach((rId) => {
        const r = resources.get(rId);
        if (r && r.state !== MediaResourceState.RELEASED && r.state !== MediaResourceState.EVICTED_PRESSURE) {
          totalBytes += r.estimatedMemoryBytes;
          if (r.allocatesDecoder) videoDecoderCount++;
          if (r.state === MediaResourceState.ACTIVE_PLAYING) activeSessionCount++;
          if (r.isPrivate) isPrivate = true;
        }
      });
    }

    return {
      tabId,
      totalMemoryBytes: totalBytes,
      videoDecoderCount,
      activeSessionCount,
      isPrivate,
      lastUpdated: Date.now(),
    };
  };

  const getGlobalMemoryUsageBytes = (): number => {
    let globalBytes = 0;
    resources.forEach((r) => {
      if (r.state !== MediaResourceState.RELEASED && r.state !== MediaResourceState.EVICTED_PRESSURE) {
        globalBytes += r.estimatedMemoryBytes;
      }
    });
    return globalBytes;
  };

  const getGlobalVideoDecoderCount = (): number => {
    let count = 0;
    resources.forEach((r) => {
      if (
        r.allocatesDecoder &&
        r.state !== MediaResourceState.RELEASED &&
        r.state !== MediaResourceState.EVICTED_PRESSURE
      ) {
        count++;
      }
    });
    return count;
  };

  const getMemoryPressureLevel = (): MemoryPressureLevel => {
    const globalBytes = getGlobalMemoryUsageBytes();
    const ratio = globalBytes / config.maxGlobalMediaMemoryBytes;

    if (ratio >= 0.9 || getGlobalVideoDecoderCount() >= config.maxGlobalVideoDecoders) {
      return MemoryPressureLevel.CRITICAL;
    }
    if (ratio >= 0.7) {
      return MemoryPressureLevel.MODERATE;
    }
    return MemoryPressureLevel.NORMAL;
  };

  // -------------------------------------------------------------
  // 2. Active Tab Selection
  // -------------------------------------------------------------
  const setActiveForegroundTab = (tabId: string) => {
    activeForegroundTabId = tabId;

    resources.forEach((r) => {
      const isForeground = r.tabId === tabId;
      r.isForeground = isForeground;

      // Background throttling for video
      if (!isForeground && r.mediaType === "video" && r.state === MediaResourceState.ACTIVE_PLAYING) {
        r.state = MediaResourceState.BACKGROUND_THROTTLED;
      } else if (isForeground && r.state === MediaResourceState.BACKGROUND_THROTTLED) {
        r.state = MediaResourceState.ACTIVE_PLAYING;
      }
    });
  };

  const getActiveForegroundTab = (): string | null => activeForegroundTabId;

  // -------------------------------------------------------------
  // 3. Media Resource Allocation
  // -------------------------------------------------------------
  const allocateMediaResource = (
    tabId: string,
    origin: string,
    mediaType: "audio" | "video",
    sourceUrl: string,
    isPrivate = false
  ): ResourceAllocationResult => {
    // 3.1 Validate Media URL
    const urlValidation = validateMediaUrl(sourceUrl);
    if (!urlValidation.isValid) {
      return {
        success: false,
        errorCode: "SECURITY_ERROR",
        reason: urlValidation.reason || "SecurityError: Blocked media source URL",
      };
    }

    const tabSet = getTabResourceSet(tabId);

    // 3.2 Duplicate resource prevention: check if identical resource already exists on this tab
    for (const rId of tabSet) {
      const existing = resources.get(rId);
      if (
        existing &&
        existing.sourceUrl === sourceUrl &&
        existing.mediaType === mediaType &&
        existing.state !== MediaResourceState.RELEASED &&
        existing.state !== MediaResourceState.EVICTED_PRESSURE
      ) {
        existing.lastActiveAt = Date.now();
        return {
          success: true,
          resource: existing,
          isDeduplicated: true,
        };
      }
    }

    // 3.3 Check estimated buffer footprint
    const bufferBytes =
      mediaType === "video" ? config.defaultVideoBufferBytes : config.defaultAudioBufferBytes;
    const tabAccount = getTabAccounting(tabId);

    // Per-tab memory quota check
    if (tabAccount.totalMemoryBytes + bufferBytes > config.maxTabMediaMemoryBytes) {
      return {
        success: false,
        errorCode: "LIMIT_EXCEEDED",
        reason: `ResourceLimitError: Tab exceeded media memory quota (${Math.round(config.maxTabMediaMemoryBytes / 1024 / 1024)}MB)`,
      };
    }

    // Video decoder limits
    if (mediaType === "video") {
      if (tabAccount.videoDecoderCount >= config.maxVideoDecodersPerTab) {
        return {
          success: false,
          errorCode: "LIMIT_EXCEEDED",
          reason: `ResourceLimitError: Tab reached maximum video decoder instances (${config.maxVideoDecodersPerTab})`,
        };
      }

      if (getGlobalVideoDecoderCount() >= config.maxGlobalVideoDecoders) {
        return {
          success: false,
          errorCode: "LIMIT_EXCEEDED",
          reason: `ResourceLimitError: Global video decoder capacity reached (${config.maxGlobalVideoDecoders})`,
        };
      }
    }

    // Global memory quota check
    if (getGlobalMemoryUsageBytes() + bufferBytes > config.maxGlobalMediaMemoryBytes) {
      return {
        success: false,
        errorCode: "MEMORY_PRESSURE",
        reason: "MemoryPressureError: Global media memory quota reached. Reclaim stale resources.",
      };
    }

    const isForeground = tabId === activeForegroundTabId;
    const resourceId = `res-gov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newResource: TrackedMediaResource = {
      resourceId,
      tabId,
      origin: origin.toLowerCase(),
      mediaType,
      sourceUrl,
      state: isForeground
        ? MediaResourceState.ACTIVE_PLAYING
        : mediaType === "video"
        ? MediaResourceState.BACKGROUND_THROTTLED
        : MediaResourceState.ACTIVE_PLAYING,
      estimatedMemoryBytes: bufferBytes,
      allocatesDecoder: mediaType === "video",
      isForeground,
      isPrivate,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      totalPlaybackDurationMs: 0,
    };

    resources.set(resourceId, newResource);
    tabSet.add(resourceId);

    return {
      success: true,
      resource: newResource,
      isDeduplicated: false,
    };
  };

  // -------------------------------------------------------------
  // 4. Resource Activity Tracking & Updates
  // -------------------------------------------------------------
  const updateResourceActivity = (resourceId: string, isPlaying: boolean) => {
    const r = resources.get(resourceId);
    if (!r || r.state === MediaResourceState.RELEASED || r.state === MediaResourceState.EVICTED_PRESSURE) {
      return;
    }

    const now = Date.now();
    if (isPlaying) {
      const delta = now - r.lastActiveAt;
      r.totalPlaybackDurationMs += Math.max(0, delta);
      r.state = r.isForeground ? MediaResourceState.ACTIVE_PLAYING : MediaResourceState.BACKGROUND_THROTTLED;

      // Lifetime control: If running in background beyond maximum allowed duration, expire it
      if (!r.isForeground && r.totalPlaybackDurationMs >= config.maxBackgroundPlaybackDurationMs) {
        r.state = MediaResourceState.STALE_EXPIRED;
      }
    } else {
      r.state = MediaResourceState.PAUSED_IDLE;
    }

    r.lastActiveAt = now;
  };

  const releaseMediaResource = (resourceId: string): boolean => {
    const r = resources.get(resourceId);
    if (!r) return false;

    r.state = MediaResourceState.RELEASED;
    r.estimatedMemoryBytes = 0;
    r.allocatesDecoder = false;

    resources.delete(resourceId);
    const tabSet = tabResources.get(r.tabId);
    if (tabSet) {
      tabSet.delete(resourceId);
    }
    return true;
  };

  // -------------------------------------------------------------
  // 5. Stale / Idle Resource Cleanup
  // -------------------------------------------------------------
  const reclaimIdleAndStaleResources = (): { reclaimedCount: number; freedBytes: number } => {
    const now = Date.now();
    let reclaimedCount = 0;
    let freedBytes = 0;

    resources.forEach((r, rId) => {
      // Reclaim if state is STALE_EXPIRED or paused idle for > idleTimeoutMs
      const isIdleTimeout =
        r.state === MediaResourceState.PAUSED_IDLE && now - r.lastActiveAt > config.idleTimeoutMs;
      const isExpired = r.state === MediaResourceState.STALE_EXPIRED;

      if (isIdleTimeout || isExpired) {
        freedBytes += r.estimatedMemoryBytes;
        releaseMediaResource(rId);
        reclaimedCount++;
      }
    });

    return { reclaimedCount, freedBytes };
  };

  // -------------------------------------------------------------
  // 6. Memory Pressure Eviction
  // -------------------------------------------------------------
  const handleMemoryPressure = (
    level: MemoryPressureLevel
  ): { evictedCount: number; freedBytes: number } => {
    let evictedCount = 0;
    let freedBytes = 0;

    // Phase 1: Reclaim all idle / stale resources first
    const phase1 = reclaimIdleAndStaleResources();
    evictedCount += phase1.reclaimedCount;
    freedBytes += phase1.freedBytes;

    if (level === MemoryPressureLevel.NORMAL) {
      return { evictedCount, freedBytes };
    }

    // Phase 2 (MODERATE or CRITICAL): Evict non-foreground video decoder buffers and paused background audio
    resources.forEach((r, rId) => {
      if (!r.isForeground) {
        if (
          r.state === MediaResourceState.BACKGROUND_THROTTLED ||
          r.state === MediaResourceState.PAUSED_IDLE ||
          r.allocatesDecoder
        ) {
          freedBytes += r.estimatedMemoryBytes;
          r.state = MediaResourceState.EVICTED_PRESSURE;
          releaseMediaResource(rId);
          evictedCount++;
        }
      }
    });

    // Phase 3 (CRITICAL): If still critical, evict any background audio stream
    if (level === MemoryPressureLevel.CRITICAL) {
      resources.forEach((r, rId) => {
        if (!r.isForeground) {
          freedBytes += r.estimatedMemoryBytes;
          r.state = MediaResourceState.EVICTED_PRESSURE;
          releaseMediaResource(rId);
          evictedCount++;
        }
      });
    }

    return { evictedCount, freedBytes };
  };

  // -------------------------------------------------------------
  // 7. Query State
  // -------------------------------------------------------------
  const getResourcesForTab = (tabId: string): TrackedMediaResource[] => {
    const res: TrackedMediaResource[] = [];
    const set = tabResources.get(tabId);
    if (set) {
      set.forEach((rId) => {
        const r = resources.get(rId);
        if (r) res.push({ ...r });
      });
    }
    return res;
  };

  // -------------------------------------------------------------
  // 8. Full Lifecycle Cleanups
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, _newUrl: string) => {
    const set = tabResources.get(tabId);
    if (set) {
      set.forEach((rId) => {
        releaseMediaResource(rId);
      });
      set.clear();
    }
  };

  const onReload = (tabId: string) => {
    onNavigation(tabId, "");
  };

  const onStopLoading = (tabId: string) => {
    // Release any un-started or unreferenced media resources for this tab
    const set = tabResources.get(tabId);
    if (set) {
      set.forEach((rId) => {
        const r = resources.get(rId);
        if (r && r.totalPlaybackDurationMs === 0 && r.state === MediaResourceState.PAUSED_IDLE) {
          releaseMediaResource(rId);
        }
      });
    }
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    onNavigation(tabId, "");
    tabResources.delete(tabId);

    if (activeForegroundTabId === tabId) {
      activeForegroundTabId = null;
    }

    // If closing last private tab, wipe all private media resource accounts
    if (isPrivate && remainingPrivateTabs === 0) {
      resources.forEach((r, rId) => {
        if (r.isPrivate) {
          releaseMediaResource(rId);
        }
      });
    }
  };

  const destroy = () => {
    resources.forEach((_, rId) => releaseMediaResource(rId));
    resources.clear();
    tabResources.clear();
    activeForegroundTabId = null;
  };

  return {
    setActiveForegroundTab,
    getActiveForegroundTab,
    allocateMediaResource,
    updateResourceActivity,
    releaseMediaResource,
    handleMemoryPressure,
    reclaimIdleAndStaleResources,
    getMemoryPressureLevel,
    getTabAccounting,
    getGlobalMemoryUsageBytes,
    getGlobalVideoDecoderCount,
    getResourcesForTab,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
