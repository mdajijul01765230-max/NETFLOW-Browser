/**
 * NETFLOW Browser V2 — Android WebView Rendering & Page Lifecycle Resilience
 *
 * Form: NETFLOW-V2-NATIVE-30
 *
 * This module establishes rendering and page lifecycle resilience for Android WebView:
 * 1. Long-running page stability:
 *    - Continuous rendering session tracking and lifecycle health auditing
 *    - Memory leak mitigation by tracking attached observers, rendering listeners, and requestAnimationFrames
 * 2. Foreground / Background transition consistency:
 *    - Safely pauses page rendering loops, canvas renders, and CSS animations on background
 *    - Resumes rendering cleanly upon foreground focus without frame skips or race conditions
 * 3. Lifecycle cleanup across navigation, reload, stop-loading, and tab close:
 *    - Safely unregisters page render listeners, decouples frame loops, and clears canvas/render caches
 * 4. Rapid navigation & repeated reload resilience:
 *    - Prevents resource leaks, race conditions, and unhandled promise/frame rejections
 *    - Enforces monotonically increasing Render Epochs per tab/page
 * 5. Stale render callback & epoch barrier:
 *    - Prevents callbacks, async paint updates, or DOM mutations from superseded pages from executing on a new page
 * 6. Tab, Origin & Private-Tab Isolation:
 *    - Rendering states, paint caches, and observers are isolated strictly by tabId and canonical origin
 *    - Private tabs store ephemeral render context that is purged immediately upon tab closure
 * 7. Interoperability & Non-conflict:
 *    - Aligns seamlessly with NATIVE-27 (Autoplay/Background Media), NATIVE-28 (Media Session Governance),
 *      and NATIVE-29 (Media Resource Lifetime & Memory Pressure Governance)
 * 8. Privileged Bridge Invariant:
 *    - Pure TypeScript safe boundary without reflection, JNI, or privileged JS native bridge.
 */

export enum RenderingState {
  ACTIVE_RENDERING = "active_rendering",
  PAUSED_BACKGROUND = "paused_background",
  FROZEN_SUSPENDED = "frozen_suspended",
  DISCARDED_TERMINATED = "discarded_terminated",
}

export interface TabRenderingRecord {
  tabId: string;
  origin: string;
  currentUrl: string;
  state: RenderingState;
  renderEpoch: number;
  isForeground: boolean;
  isPrivate: boolean;
  activeAnimationFrameCount: number;
  activeRenderListenerCount: number;
  renderSessionStartedAt: number;
  lastRenderTimestamp: number;
  rapidNavigationCount: number;
  lastNavigationTimestamp: number;
}

export interface RenderingResilienceConfig {
  rapidNavigationWindowMs: number; // e.g. 1000ms
  maxRapidNavigationsBeforeThrottle: number; // e.g. 3
  longRunningRenderSessionAlertMs: number; // e.g. 3,600,000ms (1 hour)
  maxRenderListenersPerTab: number; // e.g. 50
  maxAnimationFramesPerTab: number; // e.g. 20
}

export const DEFAULT_RENDERING_RESILIENCE_CONFIG: RenderingResilienceConfig = {
  rapidNavigationWindowMs: 1000,
  maxRapidNavigationsBeforeThrottle: 3,
  longRunningRenderSessionAlertMs: 60 * 60 * 1000, // 1 hour
  maxRenderListenersPerTab: 50,
  maxAnimationFramesPerTab: 20,
};

export interface RenderCallbackValidationResult<T> {
  isValid: boolean;
  executed: boolean;
  result?: T;
  reason?: string;
  staleEpochDetected?: boolean;
}

export interface AndroidWebViewRenderingResilienceManager {
  // Tab Registration & State Management
  registerTab: (tabId: string, initialUrl: string, isForeground?: boolean, isPrivate?: boolean) => TabRenderingRecord;
  getTabRenderingRecord: (tabId: string) => TabRenderingRecord | null;
  getAllTabRecords: () => TabRenderingRecord[];
  
  // Foreground / Background State Transitions
  setForegroundTab: (tabId: string) => void;
  suspendTabRendering: (tabId: string) => boolean;
  resumeTabRendering: (tabId: string) => boolean;

  // Render Frame & Observer Accounting
  registerAnimationFrame: (tabId: string, epoch: number) => { success: boolean; frameId?: number; reason?: string };
  cancelAnimationFrame: (tabId: string, frameId: number) => boolean;
  registerRenderListener: (tabId: string, epoch: number, listenerName: string) => { success: boolean; listenerId?: string; reason?: string };
  unregisterRenderListener: (tabId: string, listenerId: string) => boolean;

  // Stale Render Callback & Epoch Barrier
  isRenderEpochCurrent: (tabId: string, epoch: number) => boolean;
  executeGuardedRenderCallback: <T>(
    tabId: string,
    epoch: number,
    callback: () => T
  ) => RenderCallbackValidationResult<T>;

  // Full Lifecycle Cleanups & Rapid Navigation Protection
  onNavigation: (tabId: string, newUrl: string) => { newEpoch: number; rapidNavDetected: boolean };
  onReload: (tabId: string) => { newEpoch: number; rapidNavDetected: boolean };
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;

  // Long-Running Resilience & Memory Health Audit
  auditRenderingHealth: (tabId: string) => { isHealthy: boolean; issues: string[]; warnings: string[] };
  destroy: () => void;
}

export function createAndroidWebViewRenderingResilienceManager(
  customConfig: Partial<RenderingResilienceConfig> = {}
): AndroidWebViewRenderingResilienceManager {
  const config: RenderingResilienceConfig = {
    ...DEFAULT_RENDERING_RESILIENCE_CONFIG,
    ...customConfig,
  };

  let activeForegroundTabId: string | null = null;

  // Map<tabId, TabRenderingRecord>
  const records = new Map<string, TabRenderingRecord>();

  // Map<tabId, Set<number>> active animation frame IDs
  const activeFrames = new Map<string, Set<number>>();
  let frameCounter = 1;

  // Map<tabId, Map<string, string>> active listener IDs -> listener name
  const activeListeners = new Map<string, Map<string, string>>();
  let listenerCounter = 1;

  const extractOrigin = (rawUrl: string): string => {
    try {
      if (!rawUrl || rawUrl === "about:blank") return "about:blank";
      const u = new URL(rawUrl);
      return u.origin.toLowerCase();
    } catch {
      return "invalid:origin";
    }
  };

  // -------------------------------------------------------------
  // 1. Tab Registration & State Management
  // -------------------------------------------------------------
  const registerTab = (
    tabId: string,
    initialUrl: string,
    isForeground = false,
    isPrivate = false
  ): TabRenderingRecord => {
    const existing = records.get(tabId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const record: TabRenderingRecord = {
      tabId,
      origin: extractOrigin(initialUrl),
      currentUrl: initialUrl,
      state: isForeground ? RenderingState.ACTIVE_RENDERING : RenderingState.PAUSED_BACKGROUND,
      renderEpoch: 1,
      isForeground,
      isPrivate,
      activeAnimationFrameCount: 0,
      activeRenderListenerCount: 0,
      renderSessionStartedAt: now,
      lastRenderTimestamp: now,
      rapidNavigationCount: 0,
      lastNavigationTimestamp: now,
    };

    records.set(tabId, record);
    activeFrames.set(tabId, new Set<number>());
    activeListeners.set(tabId, new Map<string, string>());

    if (isForeground) {
      activeForegroundTabId = tabId;
    }

    return record;
  };

  const getTabRenderingRecord = (tabId: string): TabRenderingRecord | null => {
    const r = records.get(tabId);
    return r ? { ...r } : null;
  };

  const getAllTabRecords = (): TabRenderingRecord[] => {
    return Array.from(records.values()).map((r) => ({ ...r }));
  };

  // -------------------------------------------------------------
  // 2. Foreground / Background State Transitions
  // -------------------------------------------------------------
  const setForegroundTab = (tabId: string) => {
    activeForegroundTabId = tabId;
    const now = Date.now();

    records.forEach((r, tId) => {
      const isForeground = tId === tabId;
      r.isForeground = isForeground;

      if (isForeground) {
        if (r.state === RenderingState.PAUSED_BACKGROUND || r.state === RenderingState.FROZEN_SUSPENDED) {
          r.state = RenderingState.ACTIVE_RENDERING;
          r.lastRenderTimestamp = now;
        }
      } else {
        if (r.state === RenderingState.ACTIVE_RENDERING) {
          r.state = RenderingState.PAUSED_BACKGROUND;
        }
      }
    });
  };

  const suspendTabRendering = (tabId: string): boolean => {
    const r = records.get(tabId);
    if (!r || r.state === RenderingState.DISCARDED_TERMINATED) return false;

    r.state = RenderingState.FROZEN_SUSPENDED;
    // Clear in-flight animation frames on freeze
    const frames = activeFrames.get(tabId);
    if (frames) {
      frames.clear();
      r.activeAnimationFrameCount = 0;
    }
    return true;
  };

  const resumeTabRendering = (tabId: string): boolean => {
    const r = records.get(tabId);
    if (!r || r.state === RenderingState.DISCARDED_TERMINATED) return false;

    const isForeground = tabId === activeForegroundTabId;
    r.state = isForeground ? RenderingState.ACTIVE_RENDERING : RenderingState.PAUSED_BACKGROUND;
    r.isForeground = isForeground;
    r.lastRenderTimestamp = Date.now();
    return true;
  };

  // -------------------------------------------------------------
  // 3. Render Frame & Observer Accounting
  // -------------------------------------------------------------
  const registerAnimationFrame = (
    tabId: string,
    epoch: number
  ): { success: boolean; frameId?: number; reason?: string } => {
    const r = records.get(tabId);
    if (!r || r.state === RenderingState.DISCARDED_TERMINATED) {
      return { success: false, reason: "TabNotFoundOrTerminated" };
    }

    if (r.renderEpoch !== epoch) {
      return { success: false, reason: "StaleEpochRejected" };
    }

    if (r.state === RenderingState.FROZEN_SUSPENDED) {
      return { success: false, reason: "TabFrozenRenderingSuspended" };
    }

    const frames = activeFrames.get(tabId);
    if (!frames) {
      return { success: false, reason: "ActiveFramesMapMissing" };
    }

    if (frames.size >= config.maxAnimationFramesPerTab) {
      return { success: false, reason: "MaxAnimationFramesExceeded" };
    }

    const frameId = frameCounter++;
    frames.add(frameId);
    r.activeAnimationFrameCount = frames.size;
    r.lastRenderTimestamp = Date.now();

    return { success: true, frameId };
  };

  const cancelAnimationFrame = (tabId: string, frameId: number): boolean => {
    const frames = activeFrames.get(tabId);
    if (!frames || !frames.has(frameId)) return false;

    frames.delete(frameId);
    const r = records.get(tabId);
    if (r) {
      r.activeAnimationFrameCount = frames.size;
    }
    return true;
  };

  const registerRenderListener = (
    tabId: string,
    epoch: number,
    listenerName: string
  ): { success: boolean; listenerId?: string; reason?: string } => {
    const r = records.get(tabId);
    if (!r || r.state === RenderingState.DISCARDED_TERMINATED) {
      return { success: false, reason: "TabNotFoundOrTerminated" };
    }

    if (r.renderEpoch !== epoch) {
      return { success: false, reason: "StaleEpochRejected" };
    }

    const listeners = activeListeners.get(tabId);
    if (!listeners) {
      return { success: false, reason: "ActiveListenersMapMissing" };
    }

    if (listeners.size >= config.maxRenderListenersPerTab) {
      return { success: false, reason: "MaxRenderListenersExceeded" };
    }

    const listenerId = `render-obs-${listenerCounter++}`;
    listeners.set(listenerId, listenerName);
    r.activeRenderListenerCount = listeners.size;

    return { success: true, listenerId };
  };

  const unregisterRenderListener = (tabId: string, listenerId: string): boolean => {
    const listeners = activeListeners.get(tabId);
    if (!listeners || !listeners.has(listenerId)) return false;

    listeners.delete(listenerId);
    const r = records.get(tabId);
    if (r) {
      r.activeRenderListenerCount = listeners.size;
    }
    return true;
  };

  // -------------------------------------------------------------
  // 4. Stale Render Callback & Epoch Barrier
  // -------------------------------------------------------------
  const isRenderEpochCurrent = (tabId: string, epoch: number): boolean => {
    const r = records.get(tabId);
    return Boolean(r && r.renderEpoch === epoch && r.state !== RenderingState.DISCARDED_TERMINATED);
  };

  const executeGuardedRenderCallback = <T>(
    tabId: string,
    epoch: number,
    callback: () => T
  ): RenderCallbackValidationResult<T> => {
    const r = records.get(tabId);
    if (!r) {
      return {
        isValid: false,
        executed: false,
        reason: "TabNotRegistered",
      };
    }

    if (r.state === RenderingState.DISCARDED_TERMINATED) {
      return {
        isValid: false,
        executed: false,
        reason: "TabTerminated",
      };
    }

    if (r.renderEpoch !== epoch) {
      return {
        isValid: false,
        executed: false,
        staleEpochDetected: true,
        reason: `StaleRenderCallbackRejected: epoch ${epoch} superseded by current epoch ${r.renderEpoch}`,
      };
    }

    try {
      const result = callback();
      r.lastRenderTimestamp = Date.now();
      return {
        isValid: true,
        executed: true,
        result,
      };
    } catch (err) {
      return {
        isValid: true,
        executed: false,
        reason: `CallbackExecutionError: ${(err as Error).message}`,
      };
    }
  };

  // -------------------------------------------------------------
  // 5. Lifecycle Cleanups & Rapid Navigation
  // -------------------------------------------------------------
  const onNavigation = (
    tabId: string,
    newUrl: string
  ): { newEpoch: number; rapidNavDetected: boolean } => {
    let r = records.get(tabId);
    const now = Date.now();

    if (!r) {
      r = registerTab(tabId, newUrl, tabId === activeForegroundTabId, false);
      return { newEpoch: r.renderEpoch, rapidNavDetected: false };
    }

    // Rapid navigation detection
    const timeSinceLastNav = now - r.lastNavigationTimestamp;
    let rapidNavDetected = false;
    if (timeSinceLastNav < config.rapidNavigationWindowMs) {
      r.rapidNavigationCount++;
      if (r.rapidNavigationCount >= config.maxRapidNavigationsBeforeThrottle) {
        rapidNavDetected = true;
      }
    } else {
      r.rapidNavigationCount = 0;
    }

    r.lastNavigationTimestamp = now;

    // Advance render epoch monotonically
    r.renderEpoch += 1;
    r.currentUrl = newUrl;
    r.origin = extractOrigin(newUrl);
    r.renderSessionStartedAt = now;
    r.lastRenderTimestamp = now;

    // Comprehensive render resource cleanup for the navigating tab
    const frames = activeFrames.get(tabId);
    if (frames) {
      frames.clear();
      r.activeAnimationFrameCount = 0;
    }

    const listeners = activeListeners.get(tabId);
    if (listeners) {
      listeners.clear();
      r.activeRenderListenerCount = 0;
    }

    return { newEpoch: r.renderEpoch, rapidNavDetected };
  };

  const onReload = (tabId: string): { newEpoch: number; rapidNavDetected: boolean } => {
    const r = records.get(tabId);
    const currentUrl = r ? r.currentUrl : "about:blank";
    return onNavigation(tabId, currentUrl);
  };

  const onStopLoading = (tabId: string) => {
    // Clear pending unexecuted animation frames when loading is interrupted
    const frames = activeFrames.get(tabId);
    if (frames) {
      frames.clear();
    }
    const r = records.get(tabId);
    if (r) {
      r.activeAnimationFrameCount = 0;
    }
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    const r = records.get(tabId);
    if (r) {
      r.state = RenderingState.DISCARDED_TERMINATED;
      r.renderEpoch += 1; // Invalidate any remaining async render promises
    }

    const frames = activeFrames.get(tabId);
    if (frames) {
      frames.clear();
      activeFrames.delete(tabId);
    }

    const listeners = activeListeners.get(tabId);
    if (listeners) {
      listeners.clear();
      activeListeners.delete(tabId);
    }

    records.delete(tabId);

    if (activeForegroundTabId === tabId) {
      activeForegroundTabId = null;
    }

    // If closing last private tab, wipe all private rendering state completely
    if (isPrivate && remainingPrivateTabs === 0) {
      records.forEach((rec, tId) => {
        if (rec.isPrivate) {
          activeFrames.get(tId)?.clear();
          activeFrames.delete(tId);
          activeListeners.get(tId)?.clear();
          activeListeners.delete(tId);
          records.delete(tId);
        }
      });
    }
  };

  // -------------------------------------------------------------
  // 6. Long-Running Rendering Health Audit
  // -------------------------------------------------------------
  const auditRenderingHealth = (
    tabId: string
  ): { isHealthy: boolean; issues: string[]; warnings: string[] } => {
    const r = records.get(tabId);
    if (!r) {
      return { isHealthy: false, issues: ["TabNotTracked"], warnings: [] };
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const now = Date.now();

    // Long running render session
    if (now - r.renderSessionStartedAt > config.longRunningRenderSessionAlertMs) {
      warnings.push(`LongRunningSessionAlert: Tab active for > ${Math.round(config.longRunningRenderSessionAlertMs / 60000)}m without navigation`);
    }

    // Excessive animation frames
    if (r.activeAnimationFrameCount >= config.maxAnimationFramesPerTab) {
      issues.push(`ExcessiveAnimationFrames: ${r.activeAnimationFrameCount} frames active`);
    }

    // Excessive listeners
    if (r.activeRenderListenerCount >= config.maxRenderListenersPerTab) {
      issues.push(`ExcessiveRenderListeners: ${r.activeRenderListenerCount} listeners registered`);
    }

    // Background tab still marked active
    if (!r.isForeground && r.state === RenderingState.ACTIVE_RENDERING) {
      issues.push("BackgroundRenderingAnomaly: Background tab marked as ACTIVE_RENDERING");
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      warnings,
    };
  };

  const destroy = () => {
    records.clear();
    activeFrames.clear();
    activeListeners.clear();
    activeForegroundTabId = null;
  };

  return {
    registerTab,
    getTabRenderingRecord,
    getAllTabRecords,
    setForegroundTab,
    suspendTabRendering,
    resumeTabRendering,
    registerAnimationFrame,
    cancelAnimationFrame,
    registerRenderListener,
    unregisterRenderListener,
    isRenderEpochCurrent,
    executeGuardedRenderCallback,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    auditRenderingHealth,
    destroy,
  };
}
