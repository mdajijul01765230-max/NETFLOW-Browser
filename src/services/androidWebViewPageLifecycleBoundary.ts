/**
 * NETFLOW Browser V2 — Android WebView JavaScript ↔ Browser Page Lifecycle Boundary
 *
 * Form: NETFLOW-V2-NATIVE-19
 *
 * This module establishes the secure JavaScript ↔ Android WebView Page Lifecycle boundary:
 * 1. W3C Page Lifecycle & Android WebView state synchronization:
 *    - "active" (foreground, visible, user-focused, timers running)
 *    - "passive" (visible, not focused/transitioning)
 *    - "hidden" (background tab, host paused, visibilityState = "hidden")
 *    - "frozen" (suspended/low-RAM, timers suspended, network throttled)
 *    - "terminated" (navigated away or closed, resources purged)
 * 2. Host activity synchronization (Activity onPause/onResume <-> WebSettings pauseTimers/resumeTimers)
 * 3. Background/hidden tab resource limiting (throttling timers, pausing media, suspending background tasks)
 * 4. Safe foreground resume (clean reactivation of timers and event queues)
 * 5. Lifecycle consistency across navigation, reload, stopLoading, and tab close
 * 6. Per-tab lifecycle isolation (each tab owns an independent lifecycle state machine)
 * 7. Stale callback & epoch defense: async callbacks from superseded requests or navigating tabs are safely discarded
 * 8. Linkage: Consumes and coordinates NATIVE-04 (Host Shell), NATIVE-08 (Runtime Settings),
 *    NATIVE-09 (Navigation Control), NATIVE-12 (Media Playback), NATIVE-17 (WebSocket), and NATIVE-18 (Storage/SW).
 */

export type PageLifecycleState =
  | "active"
  | "passive"
  | "hidden"
  | "frozen"
  | "terminated";

export type PageVisibilityState = "visible" | "hidden";

export interface TabLifecycleState {
  tabId: string;
  lifecycleState: PageLifecycleState;
  visibilityState: PageVisibilityState;
  isForeground: boolean;
  timersRunning: boolean;
  mediaPlaybackPermitted: boolean;
  networkThrottled: boolean;
  requestEpoch: number;
  lastStateChange: number;
  url: string;
}

export interface LifecycleTransitionEvent {
  tabId: string;
  previousState: PageLifecycleState;
  newState: PageLifecycleState;
  visibilityState: PageVisibilityState;
  requestEpoch: number;
  timestamp: number;
}

export type LifecycleListener = (event: LifecycleTransitionEvent) => void;

export interface AndroidWebViewPageLifecycleManagerConfig {
  onStateTransition?: (event: LifecycleTransitionEvent) => void;
}

export interface AndroidWebViewPageLifecycleManager {
  // Tab registration & lookup
  registerTab: (tabId: string, initialUrl?: string, isForeground?: boolean) => TabLifecycleState;
  getTabState: (tabId: string) => TabLifecycleState | null;
  getAllTabs: () => TabLifecycleState[];

  // Foreground / Background & Visibility controls
  setForegroundTab: (tabId: string) => boolean;
  suspendTab: (tabId: string) => boolean; // Frozen / Low-RAM suspension
  resumeTab: (tabId: string) => boolean;  // Resume from suspended / hidden to active

  // Host Activity lifecycle sync
  onHostActivityPause: () => void;
  onHostActivityResume: (activeTabId?: string) => void;

  // Navigation, Reload, Stop, Close consistency
  onNavigation: (tabId: string, newUrl: string) => number; // returns new epoch
  onReload: (tabId: string) => number;                     // returns new epoch
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;

  // Stale callback & epoch validation
  isEpochActive: (tabId: string, epoch: number) => boolean;
  executeSafeCallback: <T>(tabId: string, epoch: number, callback: () => T) => { executed: boolean; result?: T; reason?: string };

  // Listener subscription
  addListener: (listener: LifecycleListener) => () => void;
  destroy: () => void;
}

/**
 * Creates the Android WebView JavaScript ↔ Browser Page Lifecycle Manager.
 */
export function createAndroidWebViewPageLifecycleManager(
  config: AndroidWebViewPageLifecycleManagerConfig = {}
): AndroidWebViewPageLifecycleManager {
  // Map of tabId -> TabLifecycleState
  const tabs = new Map<string, TabLifecycleState>();
  // Active foreground tab ID
  let currentForegroundTabId: string | null = null;
  // Host Activity state
  let isHostActivityResumed = true;
  // Listeners
  const listeners = new Set<LifecycleListener>();

  const notifyTransition = (
    tab: TabLifecycleState,
    previousState: PageLifecycleState
  ) => {
    if (previousState === tab.lifecycleState) return;

    const event: LifecycleTransitionEvent = {
      tabId: tab.tabId,
      previousState,
      newState: tab.lifecycleState,
      visibilityState: tab.visibilityState,
      requestEpoch: tab.requestEpoch,
      timestamp: Date.now(),
    };

    if (config.onStateTransition) {
      try {
        config.onStateTransition(event);
      } catch (err) {
        console.error("[Lifecycle Boundary] Listener error:", err);
      }
    }

    listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error("[Lifecycle Boundary] Listener error:", err);
      }
    });
  };

  const registerTab = (
    tabId: string,
    initialUrl = "",
    isForeground = false
  ): TabLifecycleState => {
    const existing = tabs.get(tabId);
    if (existing) {
      return { ...existing };
    }

    const state: PageLifecycleState = isForeground && isHostActivityResumed ? "active" : "hidden";
    const visibility: PageVisibilityState = isForeground && isHostActivityResumed ? "visible" : "hidden";

    const tabState: TabLifecycleState = {
      tabId,
      lifecycleState: state,
      visibilityState: visibility,
      isForeground,
      timersRunning: state === "active",
      mediaPlaybackPermitted: state === "active",
      networkThrottled: state !== "active",
      requestEpoch: 1,
      lastStateChange: Date.now(),
      url: initialUrl,
    };

    tabs.set(tabId, tabState);
    if (isForeground) {
      currentForegroundTabId = tabId;
    }

    return { ...tabState };
  };

  const getTabState = (tabId: string): TabLifecycleState | null => {
    const s = tabs.get(tabId);
    return s ? { ...s } : null;
  };

  const getAllTabs = (): TabLifecycleState[] => {
    return Array.from(tabs.values()).map((s) => ({ ...s }));
  };

  const setForegroundTab = (tabId: string): boolean => {
    const target = tabs.get(tabId);
    if (!target) return false;

    // Transition previous foreground tab to hidden/passive
    if (currentForegroundTabId && currentForegroundTabId !== tabId) {
      const prev = tabs.get(currentForegroundTabId);
      if (prev && prev.lifecycleState !== "terminated") {
        const oldState = prev.lifecycleState;
        prev.isForeground = false;
        prev.visibilityState = "hidden";
        prev.lifecycleState = "hidden";
        prev.timersRunning = false;
        prev.mediaPlaybackPermitted = false;
        prev.networkThrottled = true;
        prev.lastStateChange = Date.now();
        notifyTransition(prev, oldState);
      }
    }

    currentForegroundTabId = tabId;
    const oldState = target.lifecycleState;
    target.isForeground = true;

    if (isHostActivityResumed) {
      target.visibilityState = "visible";
      target.lifecycleState = "active";
      target.timersRunning = true;
      target.mediaPlaybackPermitted = true;
      target.networkThrottled = false;
    } else {
      target.visibilityState = "hidden";
      target.lifecycleState = "hidden";
      target.timersRunning = false;
      target.mediaPlaybackPermitted = false;
      target.networkThrottled = true;
    }

    target.lastStateChange = Date.now();
    notifyTransition(target, oldState);
    return true;
  };

  const suspendTab = (tabId: string): boolean => {
    const target = tabs.get(tabId);
    if (!target || target.lifecycleState === "terminated") return false;

    const oldState = target.lifecycleState;
    target.lifecycleState = "frozen";
    target.visibilityState = "hidden";
    target.timersRunning = false;
    target.mediaPlaybackPermitted = false;
    target.networkThrottled = true;
    target.lastStateChange = Date.now();

    notifyTransition(target, oldState);
    return true;
  };

  const resumeTab = (tabId: string): boolean => {
    const target = tabs.get(tabId);
    if (!target || target.lifecycleState === "terminated") return false;

    return setForegroundTab(tabId);
  };

  const onHostActivityPause = () => {
    isHostActivityResumed = false;

    // Host Activity paused: all tabs transition visibility to hidden and suspend timers (pauseTimers())
    tabs.forEach((tab) => {
      if (tab.lifecycleState !== "terminated") {
        const oldState = tab.lifecycleState;
        tab.visibilityState = "hidden";
        tab.lifecycleState = tab.lifecycleState === "frozen" ? "frozen" : "hidden";
        tab.timersRunning = false;
        tab.mediaPlaybackPermitted = false;
        tab.networkThrottled = true;
        tab.lastStateChange = Date.now();
        notifyTransition(tab, oldState);
      }
    });
  };

  const onHostActivityResume = (activeTabId?: string) => {
    isHostActivityResumed = true;
    const tabToActivate = activeTabId || currentForegroundTabId;

    if (tabToActivate && tabs.has(tabToActivate)) {
      setForegroundTab(tabToActivate);
    }
  };

  const onNavigation = (tabId: string, newUrl: string): number => {
    let tab = tabs.get(tabId);
    if (!tab) {
      tab = registerTab(tabId, newUrl, tabId === currentForegroundTabId);
    }

    tab.requestEpoch += 1;
    tab.url = newUrl;
    tab.lastStateChange = Date.now();

    const oldState = tab.lifecycleState;
    if (tab.isForeground && isHostActivityResumed) {
      tab.lifecycleState = "active";
      tab.visibilityState = "visible";
      tab.timersRunning = true;
      tab.mediaPlaybackPermitted = true;
      tab.networkThrottled = false;
    } else {
      tab.lifecycleState = "hidden";
      tab.visibilityState = "hidden";
      tab.timersRunning = false;
      tab.mediaPlaybackPermitted = false;
      tab.networkThrottled = true;
    }

    notifyTransition(tab, oldState);
    return tab.requestEpoch;
  };

  const onReload = (tabId: string): number => {
    const tab = tabs.get(tabId);
    if (!tab) return 1;

    tab.requestEpoch += 1;
    tab.lastStateChange = Date.now();
    return tab.requestEpoch;
  };

  const onStopLoading = (tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab) return;
    // Invalidate prior request epoch so in-flight responses are rejected
    tab.requestEpoch += 1;
    tab.lastStateChange = Date.now();
  };

  const onTabClosed = (tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab) return;

    const oldState = tab.lifecycleState;
    tab.lifecycleState = "terminated";
    tab.visibilityState = "hidden";
    tab.timersRunning = false;
    tab.mediaPlaybackPermitted = false;
    tab.networkThrottled = true;
    tab.lastStateChange = Date.now();

    notifyTransition(tab, oldState);
    tabs.delete(tabId);

    if (currentForegroundTabId === tabId) {
      currentForegroundTabId = null;
    }
  };

  const isEpochActive = (tabId: string, epoch: number): boolean => {
    const tab = tabs.get(tabId);
    if (!tab || tab.lifecycleState === "terminated") return false;
    return tab.requestEpoch === epoch;
  };

  const executeSafeCallback = <T>(
    tabId: string,
    epoch: number,
    callback: () => T
  ): { executed: boolean; result?: T; reason?: string } => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return { executed: false, reason: "Tab not found or already terminated" };
    }
    if (tab.lifecycleState === "terminated") {
      return { executed: false, reason: "Tab lifecycle is terminated" };
    }
    if (tab.requestEpoch !== epoch) {
      return {
        executed: false,
        reason: `Stale callback epoch: request epoch ${epoch} superseded by current epoch ${tab.requestEpoch}`,
      };
    }

    try {
      const result = callback();
      return { executed: true, result };
    } catch (err: any) {
      return { executed: false, reason: err?.message || "Callback execution failed" };
    }
  };

  const addListener = (listener: LifecycleListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const destroy = () => {
    tabs.forEach((tab) => {
      tab.lifecycleState = "terminated";
      tab.timersRunning = false;
    });
    tabs.clear();
    listeners.clear();
    currentForegroundTabId = null;
  };

  return {
    registerTab,
    getTabState,
    getAllTabs,
    setForegroundTab,
    suspendTab,
    resumeTab,
    onHostActivityPause,
    onHostActivityResume,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    isEpochActive,
    executeSafeCallback,
    addListener,
    destroy,
  };
}
