/**
 * NETFLOW BROWSER V2 — FORM B2 (`NETFLOW-RESILIENCE-LIGHTMODE-BUNDLE-01`)
 * PART 1 — Network Resilience Coordinator (`src/services/androidWebViewNetworkResilience.ts`)
 *
 * Coordinates Android WebView & proxy navigation resilience using an injectable clock/timers
 * and reusing existing NATIVE-31, NATIVE-32, NATIVE-33, NATIVE-34 managers and `networkEngine.ts`.
 *
 * Key Invariants:
 * 1. Main-frame vs subresource strictly separated: a subresource failure NEVER creates a page error state.
 * 2. STALL_WARNING after 8s (8,000ms) with no progress/activity;
 *    inactivity cutoff 20s (20,000ms);
 *    hard ceiling 45s (45,000ms), or 60s (60,000ms) on 2G.
 *    On cutoff: emit STOP_LOADING. If progress >= 40 or DOM content loaded: KEEP_PARTIAL_CONTENT
 *    (dismissible notice), else show the existing Recovery Center state (SHOW_RECOVERY_CENTER).
 * 3. >5 subresource failures while main progress < 70%: emit SUGGEST_LIGHT_MODE
 *    (never auto-apply unless the user setting `autoAdaptToWeakNetwork` is on).
 * 4. Connectivity: 1.5s (1,500ms) anti-flap debounce;
 *    offline -> fast offline state (no endless spinner);
 *    on validated online: ONLY the active tab, ONLY if its last request was GET/HEAD,
 *    it never committed content, and retryCount is 0 -> one auto-reload after 500ms.
 *    If the page already has committed content: no reload, just an Online indicator (ONLINE_INDICATOR).
 *    If lastMethod is POST: NEVER auto-reload; emit CONFIRM_POST_RETRY (user chooses safe GET or retry).
 * 5. Monotonic epoch per tab so late events from superseded loads are strictly ignored.
 */

import { BrowsingMode, NetworkMedium } from "../types";
import { DEFAULT_NETWORK_POLICY, isWeakNetwork } from "./networkEngine";
import {
  AndroidWebViewPageStateAndLifecycleSafetyManager,
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
} from "./androidWebViewPageStateAndLifecycleSafety";
import {
  AndroidWebViewErrorAndRecoveryLifecycleManager,
  createAndroidWebViewErrorAndRecoveryLifecycleManager,
} from "./androidWebViewErrorAndRecoveryLifecycle";
import {
  AndroidWebViewRequestTimeoutAndRecoveryManager,
  createAndroidWebViewRequestTimeoutAndRecoveryManager,
  TimeoutReason,
} from "./androidWebViewRequestTimeoutAndRecovery";
import {
  AndroidWebViewRedirectChainManager,
  createAndroidWebViewRedirectChainManager,
} from "./androidWebViewRedirectChainAndNavigationSafety";

export const RESILIENCE_THRESHOLDS = {
  STALL_WARNING_MS: 8_000,
  INACTIVITY_CUTOFF_MS: 20_000,
  HARD_CEILING_DEFAULT_MS: 45_000,
  HARD_CEILING_2G_MS: 60_000,
  CONNECTIVITY_DEBOUNCE_MS: 1_500,
  ONLINE_AUTO_RELOAD_DELAY_MS: 500,
  PARTIAL_CONTENT_MIN_PROGRESS: 40,
  SUBRESOURCE_FAILURE_THRESHOLD: 5, // > 5 (i.e. 6+)
  SUBRESOURCE_MAX_PROGRESS_FOR_SUGGEST: 70, // < 70%
} as const;

export type HttpRequestMethod = "GET" | "HEAD" | "POST";

export interface ResilienceClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (id: any) => void;
}

export interface FakeResilienceClock extends ResilienceClock {
  advanceBy: (deltaMs: number) => void;
  setNow: (timestampMs: number) => void;
  getPendingTimersCount: () => number;
  clearAllTimers: () => void;
}

/**
 * Deterministic fake clock + timer scheduler for unit/integration testing.
 */
export function createFakeResilienceClock(initialNowMs = 1_000): FakeResilienceClock {
  let currentTime = initialNowMs;
  let nextTimerId = 1;
  interface ScheduledTask {
    id: number;
    runAt: number;
    seq: number;
    fn: () => void;
  }
  const tasks = new Map<number, ScheduledTask>();
  let seqCounter = 1;

  const now = () => currentTime;

  const setTimeoutFn = (fn: () => void, ms: number): number => {
    const id = nextTimerId++;
    const delay = Math.max(0, Number.isFinite(ms) ? ms : 0);
    tasks.set(id, {
      id,
      runAt: currentTime + delay,
      seq: seqCounter++,
      fn,
    });
    return id;
  };

  const clearTimeoutFn = (id: any): void => {
    if (typeof id === "number") {
      tasks.delete(id);
    }
  };

  const advanceBy = (deltaMs: number): void => {
    const targetTime = currentTime + Math.max(0, deltaMs);
    while (true) {
      let earliest: ScheduledTask | null = null;
      for (const task of tasks.values()) {
        if (task.runAt <= targetTime) {
          if (
            !earliest ||
            task.runAt < earliest.runAt ||
            (task.runAt === earliest.runAt && task.seq < earliest.seq)
          ) {
            earliest = task;
          }
        }
      }
      if (!earliest) {
        break;
      }
      tasks.delete(earliest.id);
      currentTime = earliest.runAt;
      earliest.fn();
    }
    currentTime = targetTime;
  };

  const setNow = (timestampMs: number): void => {
    currentTime = timestampMs;
  };

  const getPendingTimersCount = (): number => tasks.size;

  const clearAllTimers = (): void => {
    tasks.clear();
  };

  return {
    now,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    advanceBy,
    setNow,
    getPendingTimersCount,
    clearAllTimers,
  };
}

export const createSimulatedResilienceClock = createFakeResilienceClock;

export const SYSTEM_RESILIENCE_CLOCK: ResilienceClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => {
    if (id !== null && id !== undefined) {
      clearTimeout(id);
    }
  },
};

export interface ResilienceConnectivityInput {
  online: boolean;
  validated?: boolean;
  metered?: boolean;
  transport?: NetworkMedium | "2g" | "3g" | "4g" | "5g" | "wifi" | "offline" | string;
  rttMs?: number;
  downlinkMbps?: number;
}

export type ResilienceSignalType =
  | "STALL_WARNING"
  | "STOP_LOADING"
  | "KEEP_PARTIAL_CONTENT"
  | "SHOW_RECOVERY_CENTER"
  | "SUGGEST_LIGHT_MODE"
  | "AUTO_APPLY_LIGHT_MODE"
  | "FAST_OFFLINE_STATE"
  | "AUTO_RELOAD"
  | "ONLINE_INDICATOR"
  | "CONFIRM_POST_RETRY";

export interface ResilienceSignalEvent {
  type: ResilienceSignalType;
  tabId: string;
  epoch: number;
  url: string;
  timestamp: number;
  progress: number;
  domContentLoaded: boolean;
  subresourceFailures: number;
  lastMethod: HttpRequestMethod;
  retryCount: number;
  reason?: string;
  errorCode?: string | number;
  recommendedMode?: BrowsingMode;
}

export interface TabResilienceState {
  tabId: string;
  url: string;
  epoch: number;
  isPrivate: boolean;
  isLoading: boolean;
  progress: number;
  domContentLoaded: boolean;
  hasCommittedContent: boolean;
  lastMethod: HttpRequestMethod;
  retryCount: number;
  subresourceFailures: number;
  loadStartedAt: number;
  lastActivityAt: number;
  stallWarningActive: boolean;
  stallWarningDismissed: boolean;
  suggestLightModeActive: boolean;
  lightModeAutoApplied: boolean;
  partialContentNoticeActive: boolean;
  recoveryCenterActive: boolean;
  fastOfflineActive: boolean;
  confirmPostRetryActive: boolean;
  onlineIndicatorActive: boolean;
  /** Form 9 Part D: true ONLY after an observed offline->online transition that happened while a tab was loading or in error state */
  connectionRestoredBannerActive: boolean;
  lastMainFrameErrorCode: string | number | null;
  lastMainFrameErrorDescription: string | null;
  cutoffReason: "INACTIVITY_CUTOFF" | "HARD_CEILING" | "OFFLINE_FAST_FAIL" | null;
}

export interface ResilienceCoordinatorConfig {
  clock?: ResilienceClock;
  initialActiveTabId?: string;
  autoAdaptToWeakNetwork?: boolean;
  initialConnectivity?: ResilienceConnectivityInput;
  pageLifecycleManager?: AndroidWebViewPageStateAndLifecycleSafetyManager;
  errorRecoveryManager?: AndroidWebViewErrorAndRecoveryLifecycleManager;
  requestTimeoutManager?: AndroidWebViewRequestTimeoutAndRecoveryManager;
  redirectChainManager?: AndroidWebViewRedirectChainManager;
  onSignal?: (event: ResilienceSignalEvent) => void;
}

export interface PageStartedOptions {
  method?: HttpRequestMethod;
  isPrivate?: boolean;
  isAutoRetry?: boolean;
  preserveRetryCount?: boolean;
}

export interface ProgressOptions {
  epoch?: number;
  domContentLoaded?: boolean;
}

export interface MainFrameErrorOptions {
  url?: string;
  description?: string;
  statusCode?: number;
  epoch?: number;
}

export interface SubresourceErrorOptions {
  resourceUrl?: string;
  code?: number | string;
  statusCode?: number;
  epoch?: number;
}

export interface PageFinishedOptions {
  url?: string;
  epoch?: number;
}

export interface ResilienceEventOutcome {
  accepted: boolean;
  staleEpochIgnored: boolean;
  epoch: number;
  state: TabResilienceState;
  emittedSignals: ResilienceSignalEvent[];
}

export interface AndroidWebViewNetworkResilienceCoordinator {
  // Primary Lifecycle Inputs
  pageStarted: (
    tabId: string,
    url: string,
    options?: PageStartedOptions | HttpRequestMethod
  ) => ResilienceEventOutcome;
  onPageStarted: (
    tabId: string,
    url: string,
    options?: PageStartedOptions | HttpRequestMethod
  ) => ResilienceEventOutcome;

  progress: (
    tabId: string,
    progressValue: number,
    options?: ProgressOptions
  ) => ResilienceEventOutcome;
  onProgress: (
    tabId: string,
    progressValue: number,
    options?: ProgressOptions
  ) => ResilienceEventOutcome;

  domContentLoaded: (tabId: string, epoch?: number) => ResilienceEventOutcome;
  onDOMContentLoaded: (tabId: string, epoch?: number) => ResilienceEventOutcome;

  pageCommitVisible: (tabId: string, url?: string, epoch?: number) => ResilienceEventOutcome;
  onPageCommitVisible: (tabId: string, url?: string, epoch?: number) => ResilienceEventOutcome;

  mainFrameError: (
    tabId: string,
    code: number | string,
    options?: MainFrameErrorOptions
  ) => ResilienceEventOutcome;
  onMainFrameError: (
    tabId: string,
    code: number | string,
    options?: MainFrameErrorOptions
  ) => ResilienceEventOutcome;

  subresourceError: (
    tabId: string,
    optionsOrResourceUrl?: SubresourceErrorOptions | string,
    code?: number | string,
    description?: string
  ) => ResilienceEventOutcome;
  onSubresourceError: (
    tabId: string,
    optionsOrResourceUrl?: SubresourceErrorOptions | string,
    code?: number | string,
    description?: string
  ) => ResilienceEventOutcome;

  pageFinished: (
    tabId: string,
    options?: PageFinishedOptions | string,
    maybeEpoch?: number
  ) => ResilienceEventOutcome;
  onPageFinished: (
    tabId: string,
    options?: PageFinishedOptions | string,
    maybeEpoch?: number
  ) => ResilienceEventOutcome;

  // Connectivity & Active Tab Inputs
  connectivity: (input: ResilienceConnectivityInput) => void;
  onConnectivityChange: (input: ResilienceConnectivityInput) => void;
  getConnectivityState: () => Required<Pick<ResilienceConnectivityInput, "online" | "validated" | "metered">> & {
    transport: string;
    is2G: boolean;
  };

  setActiveTabId: (tabId: string) => void;
  getActiveTabId: () => string;

  setAutoAdaptToWeakNetwork: (enabled: boolean) => void;
  getAutoAdaptToWeakNetwork: () => boolean;

  // User Actions on Non-Blocking Pill / Banners
  keepWaiting: (tabId: string) => TabResilienceState | null;
  dismissPill: (tabId: string) => TabResilienceState | null;
  dismissPartialContentNotice: (tabId: string) => TabResilienceState | null;
  dismissOnlineIndicator: (tabId: string) => TabResilienceState | null;
  resolvePostRetryDecision: (
    tabId: string,
    decision: "SAFE_GET" | "RETRY_POST" | "DISMISS"
  ) => { method?: HttpRequestMethod; url?: string; shouldNavigate: boolean };

  // State Inspection & Subscription
  getTabState: (tabId: string) => TabResilienceState | null;
  getAllTabStates: () => TabResilienceState[];
  getSignalHistory: (tabId?: string) => ResilienceSignalEvent[];
  subscribe: (listener: (event: ResilienceSignalEvent) => void) => () => void;

  // Cleanup
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;
  destroy: () => void;
}

interface InternalTabEntry {
  state: TabResilienceState;
  stallTimerId: any;
  inactivityTimerId: any;
  hardCeilingTimerId: any;
  autoReloadTimerId: any;
  native31Epoch: number;
  native33Epoch: number;
  offlineObservedWhileLoadingOrError: boolean;
  lastBannerTransitionSeq: number;
  dismissedBannerTransitionSeq: number;
}

function is2GTransport(input: ResilienceConnectivityInput): boolean {
  const t = String(input.transport || "").toLowerCase();
  if (t === "cellular_2g" || t === "2g" || t === "slow-2g" || t === "edge" || t === "gprs") {
    return true;
  }
  return isWeakNetwork({
    type: t === "2g" ? "2g" : "auto",
    medium: t === "cellular_2g" ? "cellular_2g" : "wifi",
    effectiveType: t || "4g",
    downlinkMbps: input.downlinkMbps ?? 10,
    rttMs: input.rttMs ?? 45,
    isOnline: input.online,
    isSimulated: false,
    isMetered: Boolean(input.metered),
    saveDataEnabled: false,
    internetAvailable: input.validated ?? input.online,
    signalStrengthPercent: 80,
  }) && (t.includes("2g") || (input.rttMs !== undefined && input.rttMs > 600));
}

function cloneTabState(s: TabResilienceState): TabResilienceState {
  return { ...s };
}

export function createAndroidWebViewNetworkResilienceCoordinator(
  config: ResilienceCoordinatorConfig = {}
): AndroidWebViewNetworkResilienceCoordinator {
  const clock: ResilienceClock = config.clock || SYSTEM_RESILIENCE_CLOCK;
  const pageLifecycleMgr =
    config.pageLifecycleManager || createAndroidWebViewPageStateAndLifecycleSafetyManager();
  const errorRecoveryMgr =
    config.errorRecoveryManager || createAndroidWebViewErrorAndRecoveryLifecycleManager();
  const requestTimeoutMgr =
    config.requestTimeoutManager || createAndroidWebViewRequestTimeoutAndRecoveryManager();
  const redirectChainMgr =
    config.redirectChainManager || createAndroidWebViewRedirectChainManager();

  let activeTabId = config.initialActiveTabId || "tab-initial-1";
  let autoAdaptToWeakNetwork =
    config.autoAdaptToWeakNetwork ?? DEFAULT_NETWORK_POLICY.autoAdaptToWeakNetwork;

  let committedConnectivity = {
    online: config.initialConnectivity?.online ?? true,
    validated:
      config.initialConnectivity?.validated ?? (config.initialConnectivity?.online ?? true),
    metered: config.initialConnectivity?.metered ?? false,
    transport: String(config.initialConnectivity?.transport || "wifi"),
    is2G: config.initialConnectivity ? is2GTransport(config.initialConnectivity) : false,
  };

  let connectivityDebounceTimerId: any = null;
  let pendingConnectivityInput: ResilienceConnectivityInput | null = null;
  let offlineToOnlineTransitionSeq = 0;

  const tabs = new Map<string, InternalTabEntry>();
  const listeners = new Set<(event: ResilienceSignalEvent) => void>();
  const signalHistory: ResilienceSignalEvent[] = [];

  const emitSignal = (
    entry: InternalTabEntry,
    type: ResilienceSignalType,
    extra: {
      reason?: string;
      errorCode?: string | number;
      recommendedMode?: BrowsingMode;
    } = {},
    batchAccumulator?: ResilienceSignalEvent[]
  ): ResilienceSignalEvent => {
    const s = entry.state;
    const ev: ResilienceSignalEvent = {
      type,
      tabId: s.tabId,
      epoch: s.epoch,
      url: s.url,
      timestamp: clock.now(),
      progress: s.progress,
      domContentLoaded: s.domContentLoaded,
      subresourceFailures: s.subresourceFailures,
      lastMethod: s.lastMethod,
      retryCount: s.retryCount,
      reason: extra.reason,
      errorCode: extra.errorCode,
      recommendedMode: extra.recommendedMode,
    };
    signalHistory.push(ev);
    if (signalHistory.length > 250) {
      signalHistory.shift();
    }
    if (batchAccumulator) {
      batchAccumulator.push(ev);
    }
    try {
      config.onSignal?.(ev);
    } catch {}
    listeners.forEach((fn) => {
      try {
        fn(ev);
      } catch {}
    });
    return ev;
  };

  const clearTabLoadTimers = (entry: InternalTabEntry): void => {
    if (entry.stallTimerId !== null) {
      clock.clearTimeout(entry.stallTimerId);
      entry.stallTimerId = null;
    }
    if (entry.inactivityTimerId !== null) {
      clock.clearTimeout(entry.inactivityTimerId);
      entry.inactivityTimerId = null;
    }
    if (entry.hardCeilingTimerId !== null) {
      clock.clearTimeout(entry.hardCeilingTimerId);
      entry.hardCeilingTimerId = null;
    }
  };

  const clearTabAutoReloadTimer = (entry: InternalTabEntry): void => {
    if (entry.autoReloadTimerId !== null) {
      clock.clearTimeout(entry.autoReloadTimerId);
      entry.autoReloadTimerId = null;
    }
  };

  const clearAllTabTimers = (entry: InternalTabEntry): void => {
    clearTabLoadTimers(entry);
    clearTabAutoReloadTimer(entry);
  };

  const ensureTabEntry = (tabId: string, url = "", isPrivate = false): InternalTabEntry => {
    let entry = tabs.get(tabId);
    if (!entry) {
      const now = clock.now();
      entry = {
        state: {
          tabId,
          url,
          epoch: 0,
          isPrivate,
          isLoading: false,
          progress: 0,
          domContentLoaded: false,
          hasCommittedContent: false,
          lastMethod: "GET",
          retryCount: 0,
          subresourceFailures: 0,
          loadStartedAt: now,
          lastActivityAt: now,
          stallWarningActive: false,
          stallWarningDismissed: false,
          suggestLightModeActive: false,
          lightModeAutoApplied: false,
          partialContentNoticeActive: false,
          recoveryCenterActive: false,
          fastOfflineActive: false,
          confirmPostRetryActive: false,
          onlineIndicatorActive: false,
          connectionRestoredBannerActive: false,
          lastMainFrameErrorCode: null,
          lastMainFrameErrorDescription: null,
          cutoffReason: null,
        },
        stallTimerId: null,
        inactivityTimerId: null,
        hardCeilingTimerId: null,
        autoReloadTimerId: null,
        native31Epoch: 1,
        native33Epoch: 1,
        offlineObservedWhileLoadingOrError: false,
        lastBannerTransitionSeq: 0,
        dismissedBannerTransitionSeq: 0,
      };
      tabs.set(tabId, entry);
      pageLifecycleMgr.registerTab(tabId, url, isPrivate);
      errorRecoveryMgr.registerTab(tabId, url, isPrivate);
      requestTimeoutMgr.registerTab(tabId, url, isPrivate);
    }
    return entry;
  };

  const handleCutoffReached = (
    tabId: string,
    expectedEpoch: number,
    cutoffKind: "INACTIVITY_CUTOFF" | "HARD_CEILING"
  ): void => {
    const entry = tabs.get(tabId);
    if (!entry || entry.state.epoch !== expectedEpoch || !entry.state.isLoading) {
      return;
    }

    clearTabLoadTimers(entry);
    const s = entry.state;
    s.isLoading = false;
    s.stallWarningActive = false;
    s.cutoffReason = cutoffKind;

    // Coordinate with NATIVE-31 / NATIVE-33
    requestTimeoutMgr.triggerTimeout(
      tabId,
      cutoffKind === "HARD_CEILING"
        ? TimeoutReason.HARD_DEADLINE_TIMEOUT
        : TimeoutReason.TRANSFER_STALL_TIMEOUT,
      entry.native33Epoch
    );
    pageLifecycleMgr.onStopLoading(tabId);
    redirectChainMgr.onTabNavigation(tabId, "");

    // 1. Always emit STOP_LOADING on cutoff
    emitSignal(entry, "STOP_LOADING", {
      reason: cutoffKind,
      errorCode: "ERR_CONNECTION_TIMED_OUT",
    });

    // 2. If progress >= 40 or DOM content loaded -> KEEP_PARTIAL_CONTENT (dismissible notice)
    //    else -> SHOW_RECOVERY_CENTER
    const hasEnoughPartialContent =
      s.progress >= RESILIENCE_THRESHOLDS.PARTIAL_CONTENT_MIN_PROGRESS ||
      s.domContentLoaded ||
      s.hasCommittedContent;

    if (hasEnoughPartialContent) {
      s.hasCommittedContent = true;
      s.partialContentNoticeActive = true;
      s.recoveryCenterActive = false;
      emitSignal(entry, "KEEP_PARTIAL_CONTENT", {
        reason: cutoffKind,
      });
    } else {
      s.hasCommittedContent = false;
      s.partialContentNoticeActive = false;
      s.recoveryCenterActive = true;
      s.lastMainFrameErrorCode = "ERR_CONNECTION_TIMED_OUT";
      s.lastMainFrameErrorDescription =
        cutoffKind === "HARD_CEILING"
          ? "Page load exceeded maximum time limit."
          : "Connection timed out due to inactivity.";
      errorRecoveryMgr.detectAndRecordError(
        tabId,
        s.url,
        new Error(s.lastMainFrameErrorDescription),
        504,
        false
      );
      emitSignal(entry, "SHOW_RECOVERY_CENTER", {
        reason: cutoffKind,
        errorCode: "ERR_CONNECTION_TIMED_OUT",
      });
    }
  };

  const scheduleActivityTimers = (entry: InternalTabEntry): void => {
    if (entry.stallTimerId !== null) {
      clock.clearTimeout(entry.stallTimerId);
      entry.stallTimerId = null;
    }
    if (entry.inactivityTimerId !== null) {
      clock.clearTimeout(entry.inactivityTimerId);
      entry.inactivityTimerId = null;
    }

    const tabId = entry.state.tabId;
    const epoch = entry.state.epoch;

    // 8s STALL_WARNING timer
    entry.stallTimerId = clock.setTimeout(() => {
      const current = tabs.get(tabId);
      if (!current || current.state.epoch !== epoch || !current.state.isLoading) {
        return;
      }
      current.stallTimerId = null;
      if (!current.state.stallWarningDismissed) {
        current.state.stallWarningActive = true;
        emitSignal(current, "STALL_WARNING", {
          reason: "NO_PROGRESS_8S",
        });
      }
    }, RESILIENCE_THRESHOLDS.STALL_WARNING_MS);

    // 20s Inactivity Cutoff timer
    entry.inactivityTimerId = clock.setTimeout(() => {
      handleCutoffReached(tabId, epoch, "INACTIVITY_CUTOFF");
    }, RESILIENCE_THRESHOLDS.INACTIVITY_CUTOFF_MS);
  };

  const scheduleHardCeilingTimer = (entry: InternalTabEntry): void => {
    if (entry.hardCeilingTimerId !== null) {
      clock.clearTimeout(entry.hardCeilingTimerId);
      entry.hardCeilingTimerId = null;
    }
    const tabId = entry.state.tabId;
    const epoch = entry.state.epoch;
    const ceilingMs = committedConnectivity.is2G
      ? RESILIENCE_THRESHOLDS.HARD_CEILING_2G_MS
      : RESILIENCE_THRESHOLDS.HARD_CEILING_DEFAULT_MS;

    entry.hardCeilingTimerId = clock.setTimeout(() => {
      handleCutoffReached(tabId, epoch, "HARD_CEILING");
    }, ceilingMs);
  };

  // ---------------------------------------------------------------------------
  // 1. pageStarted
  // ---------------------------------------------------------------------------
  const pageStarted = (
    tabId: string,
    url: string,
    optionsOrMethod: PageStartedOptions | HttpRequestMethod = {}
  ): ResilienceEventOutcome => {
    const options: PageStartedOptions =
      typeof optionsOrMethod === "string"
        ? { method: optionsOrMethod }
        : optionsOrMethod || {};
    const entry = ensureTabEntry(tabId, url, options.isPrivate);
    clearAllTabTimers(entry);

    const emitted: ResilienceSignalEvent[] = [];
    const now = clock.now();
    const s = entry.state;

    // Monotonic epoch increment
    s.epoch += 1;
    s.url = url;
    if (options.isPrivate !== undefined) {
      s.isPrivate = options.isPrivate;
    }
    const method: HttpRequestMethod =
      options.method === "POST"
        ? "POST"
        : options.method === "HEAD"
        ? "HEAD"
        : "GET";
    s.lastMethod = method;

    if (!options.isAutoRetry && !options.preserveRetryCount) {
      s.retryCount = 0;
    }

    s.isLoading = true;
    s.progress = 0;
    s.domContentLoaded = false;
    s.hasCommittedContent = false;
    s.subresourceFailures = 0;
    s.loadStartedAt = now;
    s.lastActivityAt = now;
    s.stallWarningActive = false;
    s.stallWarningDismissed = false;
    s.suggestLightModeActive = false;
    s.lightModeAutoApplied = false;
    s.partialContentNoticeActive = false;
    s.recoveryCenterActive = false;
    s.fastOfflineActive = false;
    s.confirmPostRetryActive = false;
    s.onlineIndicatorActive = false;
    if (!options.isAutoRetry) {
      s.connectionRestoredBannerActive = false;
    }
    s.lastMainFrameErrorCode = null;
    s.lastMainFrameErrorDescription = null;
    s.cutoffReason = null;
    entry.offlineObservedWhileLoadingOrError =
      !committedConnectivity.online || !committedConnectivity.validated;

    // Coordinate with NATIVE-31, 32, 33, 34
    const { newEpoch: n31Epoch } = pageLifecycleMgr.onPageStarted(tabId, url);
    entry.native31Epoch = n31Epoch;
    errorRecoveryMgr.onNavigation(tabId, url);
    const { timeoutEpoch: n33Epoch } = requestTimeoutMgr.startRequestTimeout(tabId, url, {
      isPrivate: s.isPrivate,
      customTimeoutMs: RESILIENCE_THRESHOLDS.HARD_CEILING_2G_MS + 5_000,
    });
    entry.native33Epoch = n33Epoch;
    redirectChainMgr.onTabNavigation(tabId, url);
    redirectChainMgr.startChain({
      tabId,
      initialUrl: url,
      isPrivate: s.isPrivate,
    });

    // Fast offline check: if connectivity is already known to be offline, fail fast without endless spinner
    if (!committedConnectivity.online) {
      s.isLoading = false;
      s.fastOfflineActive = true;
      s.recoveryCenterActive = true;
      s.cutoffReason = "OFFLINE_FAST_FAIL";
      s.lastMainFrameErrorCode = "ERR_INTERNET_DISCONNECTED";
      s.lastMainFrameErrorDescription = "Device is offline.";
      entry.offlineObservedWhileLoadingOrError = true;
      requestTimeoutMgr.onStopLoading(tabId);
      pageLifecycleMgr.onPageError(tabId, entry.native31Epoch, "ERR_INTERNET_DISCONNECTED");
      errorRecoveryMgr.detectAndRecordError(
        tabId,
        url,
        new Error("ERR_INTERNET_DISCONNECTED"),
        undefined,
        false
      );
      emitSignal(
        entry,
        "FAST_OFFLINE_STATE",
        {
          reason: "OFFLINE_AT_NAVIGATION_START",
          errorCode: "ERR_INTERNET_DISCONNECTED",
        },
        emitted
      );
      return {
        accepted: true,
        staleEpochIgnored: false,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    scheduleActivityTimers(entry);
    scheduleHardCeilingTimer(entry);

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  // ---------------------------------------------------------------------------
  // 2. progress(0-100)
  // ---------------------------------------------------------------------------
  const progress = (
    tabId: string,
    progressValue: number,
    options: ProgressOptions = {}
  ): ResilienceEventOutcome => {
    const entry = ensureTabEntry(tabId);
    const s = entry.state;
    const emitted: ResilienceSignalEvent[] = [];

    if (options.epoch !== undefined && options.epoch !== s.epoch) {
      return {
        accepted: false,
        staleEpochIgnored: true,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    if (!s.isLoading) {
      return {
        accepted: false,
        staleEpochIgnored: false,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    const clamped = Math.max(0, Math.min(100, Math.round(progressValue)));
    const madeForwardProgress = clamped > s.progress || Boolean(options.domContentLoaded && !s.domContentLoaded);
    s.progress = Math.max(s.progress, clamped);

    if (options.domContentLoaded) {
      s.domContentLoaded = true;
      s.hasCommittedContent = true;
      pageLifecycleMgr.onDOMContentLoaded(tabId, entry.native31Epoch);
    }

    if (s.progress >= RESILIENCE_THRESHOLDS.PARTIAL_CONTENT_MIN_PROGRESS) {
      s.hasCommittedContent = true;
    }

    if (madeForwardProgress) {
      s.lastActivityAt = clock.now();
      s.stallWarningActive = false;
      requestTimeoutMgr.recordActivity(tabId, entry.native33Epoch, clamped, "progress");
      if (s.isLoading && s.progress < 100) {
        scheduleActivityTimers(entry);
      }
    }

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  // ---------------------------------------------------------------------------
  // 3. domContentLoaded & pageCommitVisible
  // ---------------------------------------------------------------------------
  const domContentLoaded = (tabId: string, epoch?: number): ResilienceEventOutcome => {
    const entry = ensureTabEntry(tabId);
    const s = entry.state;
    const emitted: ResilienceSignalEvent[] = [];

    if (epoch !== undefined && epoch !== s.epoch) {
      return {
        accepted: false,
        staleEpochIgnored: true,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    s.domContentLoaded = true;
    s.hasCommittedContent = true;
    s.lastActivityAt = clock.now();
    s.stallWarningActive = false;
    pageLifecycleMgr.onDOMContentLoaded(tabId, entry.native31Epoch);
    requestTimeoutMgr.recordActivity(tabId, entry.native33Epoch, 1, "domContentLoaded");

    if (s.isLoading) {
      scheduleActivityTimers(entry);
    }

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  const pageCommitVisible = (tabId: string, url?: string, epoch?: number): ResilienceEventOutcome => {
    const entry = ensureTabEntry(tabId);
    const s = entry.state;
    const emitted: ResilienceSignalEvent[] = [];

    if (epoch !== undefined && epoch !== s.epoch) {
      return {
        accepted: false,
        staleEpochIgnored: true,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    if (url) {
      s.url = url;
    }
    s.hasCommittedContent = true;
    s.lastActivityAt = clock.now();
    s.stallWarningActive = false;
    requestTimeoutMgr.recordActivity(tabId, entry.native33Epoch, 1, "pageCommitVisible");

    if (s.isLoading) {
      scheduleActivityTimers(entry);
    }

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  // ---------------------------------------------------------------------------
  // 4. mainFrameError (strictly main-frame only)
  // ---------------------------------------------------------------------------
  const mainFrameError = (
    tabId: string,
    code: number | string,
    options: MainFrameErrorOptions = {}
  ): ResilienceEventOutcome => {
    const entry = ensureTabEntry(tabId);
    const s = entry.state;
    const emitted: ResilienceSignalEvent[] = [];

    if (options.epoch !== undefined && options.epoch !== s.epoch) {
      return {
        accepted: false,
        staleEpochIgnored: true,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    clearTabLoadTimers(entry);
    s.isLoading = false;
    s.stallWarningActive = false;
    s.hasCommittedContent = false;
    s.onlineIndicatorActive = false;
    s.connectionRestoredBannerActive = false;
    if (options.url) {
      s.url = options.url;
    }

    const errDesc = options.description || `Main frame error (${String(code)})`;
    s.lastMainFrameErrorCode = code;
    s.lastMainFrameErrorDescription = errDesc;

    pageLifecycleMgr.onPageError(tabId, entry.native31Epoch, errDesc);
    requestTimeoutMgr.onStopLoading(tabId);
    errorRecoveryMgr.detectAndRecordError(
      tabId,
      s.url,
      new Error(errDesc),
      options.statusCode,
      s.hasCommittedContent
    );

    const isOfflineErr =
      String(code).toUpperCase().includes("DISCONNECTED") ||
      String(code).toUpperCase().includes("OFFLINE") ||
      (code === -2 && !committedConnectivity.online);
    if (isOfflineErr) {
      s.fastOfflineActive = true;
      entry.offlineObservedWhileLoadingOrError = true;
    } else if (!committedConnectivity.online || !committedConnectivity.validated) {
      entry.offlineObservedWhileLoadingOrError = true;
    } else {
      entry.offlineObservedWhileLoadingOrError = false;
    }

    s.recoveryCenterActive = true;
    emitSignal(
      entry,
      "SHOW_RECOVERY_CENTER",
      {
        reason: "MAIN_FRAME_ERROR",
        errorCode: code,
      },
      emitted
    );

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  // ---------------------------------------------------------------------------
  // 5. subresourceError (strictly separated; NEVER creates a page error state)
  // ---------------------------------------------------------------------------
  const subresourceError = (
    tabId: string,
    optionsOrResourceUrl: SubresourceErrorOptions | string = {},
    code?: number | string,
    _description?: string
  ): ResilienceEventOutcome => {
    const options: SubresourceErrorOptions =
      typeof optionsOrResourceUrl === "string"
        ? { resourceUrl: optionsOrResourceUrl, code }
        : optionsOrResourceUrl || {};
    const entry = ensureTabEntry(tabId);
    const s = entry.state;
    const emitted: ResilienceSignalEvent[] = [];

    if (options.epoch !== undefined && options.epoch !== s.epoch) {
      return {
        accepted: false,
        staleEpochIgnored: true,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    // Increment subresource failure count; NEVER set recoveryCenterActive or lastMainFrameErrorCode
    s.subresourceFailures += 1;

    // >5 subresource failures while main progress < 70%: SUGGEST_LIGHT_MODE
    if (
      s.subresourceFailures > RESILIENCE_THRESHOLDS.SUBRESOURCE_FAILURE_THRESHOLD &&
      s.progress < RESILIENCE_THRESHOLDS.SUBRESOURCE_MAX_PROGRESS_FOR_SUGGEST &&
      !s.suggestLightModeActive
    ) {
      s.suggestLightModeActive = true;
      emitSignal(
        entry,
        "SUGGEST_LIGHT_MODE",
        {
          reason: `SUBRESOURCE_FAILURES_${s.subresourceFailures}_AT_PROGRESS_${s.progress}`,
          recommendedMode: "smart-compress",
        },
        emitted
      );

      // Never auto-apply unless the user setting autoAdaptToWeakNetwork is on
      if (autoAdaptToWeakNetwork && !s.lightModeAutoApplied) {
        s.lightModeAutoApplied = true;
        emitSignal(
          entry,
          "AUTO_APPLY_LIGHT_MODE",
          {
            reason: "AUTO_ADAPT_TO_WEAK_NETWORK_ENABLED",
            recommendedMode: "smart-compress",
          },
          emitted
        );
      }
    }

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  // ---------------------------------------------------------------------------
  // 6. pageFinished
  // ---------------------------------------------------------------------------
  const pageFinished = (
    tabId: string,
    optionsOrUrl?: PageFinishedOptions | string,
    maybeEpoch?: number
  ): ResilienceEventOutcome => {
    const entry = ensureTabEntry(tabId);
    const s = entry.state;
    const emitted: ResilienceSignalEvent[] = [];

    const opts: PageFinishedOptions =
      typeof optionsOrUrl === "string"
        ? { url: optionsOrUrl, epoch: maybeEpoch }
        : optionsOrUrl || {};

    if (opts.epoch !== undefined && opts.epoch !== s.epoch) {
      return {
        accepted: false,
        staleEpochIgnored: true,
        epoch: s.epoch,
        state: cloneTabState(s),
        emittedSignals: emitted,
      };
    }

    clearTabLoadTimers(entry);
    if (opts.url) {
      s.url = opts.url;
    }
    s.isLoading = false;
    s.progress = 100;
    s.domContentLoaded = true;
    s.hasCommittedContent = true;
    s.stallWarningActive = false;
    s.recoveryCenterActive = false;
    s.fastOfflineActive = false;
    entry.offlineObservedWhileLoadingOrError = false;
    s.lastActivityAt = clock.now();

    pageLifecycleMgr.onDOMContentLoaded(tabId, entry.native31Epoch);
    pageLifecycleMgr.onPageFinished(tabId, entry.native31Epoch);
    requestTimeoutMgr.markRequestSuccess(tabId, entry.native33Epoch);
    const rec = errorRecoveryMgr.getTabRecord(tabId);
    if (rec) {
      errorRecoveryMgr.markRecoverySuccess(tabId, rec.recoveryEpoch);
    }
    const activeChain = redirectChainMgr.getActiveChainForTab(tabId);
    if (activeChain) {
      redirectChainMgr.completeChain({
        chainId: activeChain.chainId,
        tabId,
        finalUrl: s.url,
      });
    }

    return {
      accepted: true,
      staleEpochIgnored: false,
      epoch: s.epoch,
      state: cloneTabState(s),
      emittedSignals: emitted,
    };
  };

  // ---------------------------------------------------------------------------
  // 7. Connectivity with 1.5s Anti-Flap Debounce
  // ---------------------------------------------------------------------------
  const applyDebouncedConnectivity = (input: ResilienceConnectivityInput): void => {
    const wasOnline = committedConnectivity.online && committedConnectivity.validated;
    const isOnline = Boolean(input.online);
    const isValidated = isOnline && (input.validated ?? true);
    const nextIs2G = is2GTransport(input);

    committedConnectivity = {
      online: isOnline,
      validated: isValidated,
      metered: Boolean(input.metered),
      transport: String(input.transport || (isOnline ? "wifi" : "offline")),
      is2G: nextIs2G,
    };

    // Case A: Transitioned to offline or unvalidated -> record observed offline on loading/error tabs
    if (!isOnline || !isValidated) {
      for (const entry of tabs.values()) {
        clearTabAutoReloadTimer(entry);
        const s = entry.state;
        s.onlineIndicatorActive = false;
        s.connectionRestoredBannerActive = false;
        if (s.isLoading || s.recoveryCenterActive || s.fastOfflineActive) {
          entry.offlineObservedWhileLoadingOrError = true;
        }
        if (!isOnline && s.isLoading) {
          clearTabLoadTimers(entry);
          s.isLoading = false;
          s.stallWarningActive = false;
          s.cutoffReason = "OFFLINE_FAST_FAIL";
          requestTimeoutMgr.onStopLoading(s.tabId);
          pageLifecycleMgr.onStopLoading(s.tabId);

          emitSignal(entry, "STOP_LOADING", {
            reason: "CONNECTIVITY_OFFLINE",
            errorCode: "ERR_INTERNET_DISCONNECTED",
          });

          const hasPartial =
            s.progress >= RESILIENCE_THRESHOLDS.PARTIAL_CONTENT_MIN_PROGRESS ||
            s.domContentLoaded ||
            s.hasCommittedContent;

          if (hasPartial) {
            s.hasCommittedContent = true;
            s.partialContentNoticeActive = true;
            s.fastOfflineActive = true;
            emitSignal(entry, "KEEP_PARTIAL_CONTENT", {
              reason: "CONNECTIVITY_OFFLINE_WITH_PARTIAL_CONTENT",
            });
          } else {
            s.hasCommittedContent = false;
            s.fastOfflineActive = true;
            s.recoveryCenterActive = true;
            s.lastMainFrameErrorCode = "ERR_INTERNET_DISCONNECTED";
            s.lastMainFrameErrorDescription = "Internet connection lost.";
            emitSignal(entry, "FAST_OFFLINE_STATE", {
              reason: "CONNECTIVITY_OFFLINE",
              errorCode: "ERR_INTERNET_DISCONNECTED",
            });
          }
        }
      }
      return;
    }

    // Case B: Transitioned to validated online
    if (isOnline && isValidated && !wasOnline) {
      offlineToOnlineTransitionSeq += 1;
      for (const entry of tabs.values()) {
        const s = entry.state;
        if (
          entry.offlineObservedWhileLoadingOrError &&
          (s.isLoading || s.recoveryCenterActive || s.fastOfflineActive) &&
          entry.dismissedBannerTransitionSeq !== offlineToOnlineTransitionSeq
        ) {
          s.connectionRestoredBannerActive = true;
          entry.lastBannerTransitionSeq = offlineToOnlineTransitionSeq;
          entry.offlineObservedWhileLoadingOrError = false;
        }
      }

      // Inspect ONLY the active tab for reload / indicator signals
      const activeEntry = tabs.get(activeTabId);
      if (!activeEntry) return;

      const s = activeEntry.state;
      s.fastOfflineActive = false;

      // If the page never navigated to any URL, nothing to reload
      if (!s.url) return;

      // 1. If the page already has committed content: no reload, just an Online indicator
      if (s.hasCommittedContent) {
        s.onlineIndicatorActive = true;
        emitSignal(activeEntry, "ONLINE_INDICATOR", {
          reason: "VALIDATED_ONLINE_WITH_COMMITTED_CONTENT",
        });
        return;
      }

      // 2. If lastMethod is POST: NEVER auto-reload; emit CONFIRM_POST_RETRY
      if (s.lastMethod === "POST") {
        s.confirmPostRetryActive = true;
        emitSignal(activeEntry, "CONFIRM_POST_RETRY", {
          reason: "POST_REQUEST_NEVER_AUTO_RELOADS",
        });
        return;
      }

      // 3. ONLY if last request was GET/HEAD, never committed content, and retryCount is 0 -> one auto-reload after 500ms
      if (
        (s.lastMethod === "GET" || s.lastMethod === "HEAD") &&
        !s.hasCommittedContent &&
        s.retryCount === 0
      ) {
        clearTabAutoReloadTimer(activeEntry);
        const scheduledEpoch = s.epoch;
        const targetTabId = s.tabId;
        activeEntry.autoReloadTimerId = clock.setTimeout(() => {
          const current = tabs.get(targetTabId);
          if (!current) return;
          current.autoReloadTimerId = null;

          // Re-verify invariants when 500ms timer fires
          if (
            targetTabId !== activeTabId ||
            current.state.epoch !== scheduledEpoch ||
            !committedConnectivity.online ||
            !committedConnectivity.validated ||
            current.state.hasCommittedContent ||
            current.state.lastMethod === "POST" ||
            current.state.retryCount !== 0
          ) {
            return;
          }

          current.state.retryCount += 1;
          current.state.recoveryCenterActive = false;
          current.state.fastOfflineActive = false;
          emitSignal(current, "AUTO_RELOAD", {
            reason: "VALIDATED_ONLINE_ACTIVE_TAB_GET_RETRY",
          });
        }, RESILIENCE_THRESHOLDS.ONLINE_AUTO_RELOAD_DELAY_MS);
      }
    }
  };

  const connectivity = (input: ResilienceConnectivityInput): void => {
    pendingConnectivityInput = { ...input };
    if (connectivityDebounceTimerId !== null) {
      clock.clearTimeout(connectivityDebounceTimerId);
      connectivityDebounceTimerId = null;
    }
    connectivityDebounceTimerId = clock.setTimeout(() => {
      connectivityDebounceTimerId = null;
      if (pendingConnectivityInput) {
        const toApply = pendingConnectivityInput;
        pendingConnectivityInput = null;
        applyDebouncedConnectivity(toApply);
      }
    }, RESILIENCE_THRESHOLDS.CONNECTIVITY_DEBOUNCE_MS);
  };

  const getConnectivityState = () => ({ ...committedConnectivity });

  const setActiveTabId = (tabId: string): void => {
    if (!tabId) return;
    activeTabId = tabId;
  };

  const getActiveTabId = (): string => activeTabId;

  const setAutoAdaptToWeakNetwork = (enabled: boolean): void => {
    autoAdaptToWeakNetwork = Boolean(enabled);
  };

  const getAutoAdaptToWeakNetwork = (): boolean => autoAdaptToWeakNetwork;

  const keepWaiting = (tabId: string): TabResilienceState | null => {
    const entry = tabs.get(tabId);
    if (!entry) return null;
    entry.state.stallWarningActive = false;
    entry.state.lastActivityAt = clock.now();
    if (entry.state.isLoading) {
      scheduleActivityTimers(entry);
    }
    return cloneTabState(entry.state);
  };

  const dismissPill = (tabId: string): TabResilienceState | null => {
    const entry = tabs.get(tabId);
    if (!entry) return null;
    entry.state.stallWarningActive = false;
    entry.state.stallWarningDismissed = true;
    entry.state.suggestLightModeActive = false;
    return cloneTabState(entry.state);
  };

  const dismissPartialContentNotice = (tabId: string): TabResilienceState | null => {
    const entry = tabs.get(tabId);
    if (!entry) return null;
    entry.state.partialContentNoticeActive = false;
    return cloneTabState(entry.state);
  };

  const dismissOnlineIndicator = (tabId: string): TabResilienceState | null => {
    const entry = tabs.get(tabId);
    if (!entry) return null;
    entry.state.onlineIndicatorActive = false;
    entry.state.connectionRestoredBannerActive = false;
    entry.dismissedBannerTransitionSeq = entry.lastBannerTransitionSeq;
    entry.offlineObservedWhileLoadingOrError = false;
    return cloneTabState(entry.state);
  };

  const resolvePostRetryDecision = (
    tabId: string,
    decision: "SAFE_GET" | "RETRY_POST" | "DISMISS"
  ): { method?: HttpRequestMethod; url?: string; shouldNavigate: boolean } => {
    const entry = tabs.get(tabId);
    if (!entry) return { shouldNavigate: false };
    entry.state.confirmPostRetryActive = false;
    if (decision === "DISMISS") {
      return { shouldNavigate: false };
    }
    const method: HttpRequestMethod = decision === "SAFE_GET" ? "GET" : "POST";
    entry.state.lastMethod = method;
    return {
      method,
      url: entry.state.url,
      shouldNavigate: Boolean(entry.state.url),
    };
  };

  const getTabState = (tabId: string): TabResilienceState | null => {
    const entry = tabs.get(tabId);
    return entry ? cloneTabState(entry.state) : null;
  };

  const getAllTabStates = (): TabResilienceState[] => {
    return Array.from(tabs.values()).map((e) => cloneTabState(e.state));
  };

  const getSignalHistory = (tabId?: string): ResilienceSignalEvent[] => {
    if (!tabId) return [...signalHistory];
    return signalHistory.filter((ev) => ev.tabId === tabId);
  };

  const subscribe = (listener: (event: ResilienceSignalEvent) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const onStopLoading = (tabId: string): void => {
    const entry = tabs.get(tabId);
    if (!entry) return;
    clearAllTabTimers(entry);
    entry.state.epoch += 1;
    entry.state.isLoading = false;
    entry.state.stallWarningActive = false;
  };

  const onTabClosed = (tabId: string): void => {
    const entry = tabs.get(tabId);
    if (!entry) return;
    clearAllTabTimers(entry);
    const isPriv = entry.state.isPrivate;
    tabs.delete(tabId);
    pageLifecycleMgr.onTabClosed(tabId, isPriv);
    errorRecoveryMgr.onTabClosed(tabId, isPriv);
    requestTimeoutMgr.onTabClosed(tabId, isPriv);
    redirectChainMgr.onTabClosed(tabId, isPriv);
  };

  const destroy = (): void => {
    if (connectivityDebounceTimerId !== null) {
      clock.clearTimeout(connectivityDebounceTimerId);
      connectivityDebounceTimerId = null;
    }
    for (const entry of tabs.values()) {
      clearAllTabTimers(entry);
    }
    tabs.clear();
    listeners.clear();
  };

  return {
    pageStarted,
    onPageStarted: pageStarted,
    progress,
    onProgress: progress,
    domContentLoaded,
    onDOMContentLoaded: domContentLoaded,
    pageCommitVisible,
    onPageCommitVisible: pageCommitVisible,
    mainFrameError,
    onMainFrameError: mainFrameError,
    subresourceError,
    onSubresourceError: subresourceError,
    pageFinished,
    onPageFinished: pageFinished,
    connectivity,
    onConnectivityChange: connectivity,
    getConnectivityState,
    setActiveTabId,
    getActiveTabId,
    setAutoAdaptToWeakNetwork,
    getAutoAdaptToWeakNetwork,
    keepWaiting,
    dismissPill,
    dismissPartialContentNotice,
    dismissOnlineIndicator,
    resolvePostRetryDecision,
    getTabState,
    getAllTabStates,
    getSignalHistory,
    subscribe,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
