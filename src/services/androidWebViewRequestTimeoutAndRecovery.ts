/**
 * Android WebView Request Timeout & Recovery Boundary (NETFLOW-V2-NATIVE-33)
 *
 * Implements:
 * - Safe WebView request timeout detection with configurable & progressive thresholds
 * - Stalled navigation / hanging request detection (inactivity vs. active streaming progress)
 * - Safe failure & recovery state transition upon timeout
 * - Monotonic lifecycle epoch advancement on Retry/Reload recovery
 * - Stale request & callback rejection barrier (prevents timed-out requests from polluting new navigations)
 * - Per-tab isolation of timeout timers, epochs, and activity monitors
 * - Private-tab isolation with ephemeral tracking wiped upon closing private tabs
 * - Seamless integration with NATIVE-31 Page Lifecycle & compatibility with NATIVE-30 / NATIVE-29
 * - Safe against premature termination: active data chunk reception extends inactivity limits
 * - Strict Invariant: No privileged JS bridges, JNI, or reflection.
 */

export enum TimeoutStage {
  IDLE = "IDLE",
  MONITORING = "MONITORING",
  ACTIVITY_EXTENDED = "ACTIVITY_EXTENDED",
  STALLED_WARNING = "STALLED_WARNING",
  TIMED_OUT = "TIMED_OUT",
  SAFE_FAILURE = "SAFE_FAILURE",
  RECOVERING_RETRY = "RECOVERING_RETRY",
  RECOVERED = "RECOVERED",
  ABORTED = "ABORTED",
}

export enum TimeoutReason {
  INITIAL_CONNECT_TIMEOUT = "INITIAL_CONNECT_TIMEOUT",
  TRANSFER_STALL_TIMEOUT = "TRANSFER_STALL_TIMEOUT",
  HARD_DEADLINE_TIMEOUT = "HARD_DEADLINE_TIMEOUT",
  USER_TRIGGERED_TIMEOUT = "USER_TRIGGERED_TIMEOUT",
}

export type RecoveryAction =
  | "RETRY_WITH_BACKOFF"
  | "RETRY_TEXT_ONLY"
  | "DISMISS_KEEP_CONTENT"
  | "FALLBACK_HOME";

export interface TimeoutConfiguration {
  connectTimeoutMs: number;       // Default: 15,000ms (15s)
  inactivityStallMs: number;      // Default: 20,000ms (20s without any activity/chunk)
  maxHardDeadlineMs: number;      // Default: 60,000ms (60s absolute maximum ceiling)
  baseRetryBackoffMs: number;     // Default: 1,000ms
  maxRetryBackoffMs: number;      // Default: 10,000ms
}

export interface TabTimeoutRecord {
  tabId: string;
  url: string;
  isPrivate: boolean;
  timeoutEpoch: number;
  stage: TimeoutStage;
  startTime: number;
  lastActivityTime: number;
  bytesTransferred: number;
  timerId: ReturnType<typeof setTimeout> | null;
  activeAbortController: AbortController | null;
  retryCount: number;
  lastTimeoutReason: TimeoutReason | null;
  recommendedAction: RecoveryAction | null;
}

export interface TimeoutStartResult {
  timeoutEpoch: number;
  abortSignal: AbortSignal;
}

export interface TimeoutTriggerResult {
  timedOut: boolean;
  reason: TimeoutReason;
  timeoutEpoch: number;
  recommendedAction: RecoveryAction;
  safeMessage: string;
}

export interface GuardedCallbackResult<T> {
  executed: boolean;
  staleEpochDetected: boolean;
  result?: T;
  reason?: string;
}

export interface AndroidWebViewRequestTimeoutAndRecoveryManager {
  registerTab: (tabId: string, url?: string, isPrivate?: boolean) => void;
  startRequestTimeout: (
    tabId: string,
    url: string,
    options?: { customTimeoutMs?: number; isPrivate?: boolean }
  ) => TimeoutStartResult;
  recordActivity: (
    tabId: string,
    epoch: number,
    bytesChunk?: number,
    activityLabel?: string
  ) => boolean;
  checkTimeoutOrStall: (tabId: string, now?: number) => { stage: TimeoutStage; isStalled: boolean; isTimedOut: boolean };
  triggerTimeout: (tabId: string, reason: TimeoutReason, epoch?: number) => TimeoutTriggerResult | null;
  markRequestSuccess: (tabId: string, epoch: number) => boolean;
  initiateRecovery: (
    tabId: string,
    action: RecoveryAction
  ) => { newTimeoutEpoch: number; recommendedBackoffMs: number; canProceed: boolean };
  executeGuardedTimeoutCallback: <T>(
    tabId: string,
    epoch: number,
    actionName: string,
    callback: () => T
  ) => GuardedCallbackResult<T>;
  isEpochCurrent: (tabId: string, epoch: number) => boolean;
  getTabRecord: (tabId: string) => TabTimeoutRecord | null;
  onNavigation: (tabId: string, newUrl: string) => { newEpoch: number };
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  resetAll: () => void;
}

const DEFAULT_CONFIG: TimeoutConfiguration = {
  connectTimeoutMs: 15000,
  inactivityStallMs: 20000,
  maxHardDeadlineMs: 60000,
  baseRetryBackoffMs: 1000,
  maxRetryBackoffMs: 10000,
};

export function createAndroidWebViewRequestTimeoutAndRecoveryManager(
  configOverrides?: Partial<TimeoutConfiguration>
): AndroidWebViewRequestTimeoutAndRecoveryManager {
  const config: TimeoutConfiguration = {
    ...DEFAULT_CONFIG,
    ...configOverrides,
  };

  const records = new Map<string, TabTimeoutRecord>();

  function clearTimer(record: TabTimeoutRecord) {
    if (record.timerId !== null) {
      clearTimeout(record.timerId);
      record.timerId = null;
    }
  }

  function registerTab(tabId: string, url: string = "", isPrivate: boolean = false): void {
    const existing = records.get(tabId);
    if (existing) {
      clearTimer(existing);
    }
    records.set(tabId, {
      tabId,
      url,
      isPrivate,
      timeoutEpoch: 1,
      stage: TimeoutStage.IDLE,
      startTime: 0,
      lastActivityTime: 0,
      bytesTransferred: 0,
      timerId: null,
      activeAbortController: null,
      retryCount: 0,
      lastTimeoutReason: null,
      recommendedAction: null,
    });
  }

  function startRequestTimeout(
    tabId: string,
    url: string,
    options?: { customTimeoutMs?: number; isPrivate?: boolean }
  ): TimeoutStartResult {
    let record = records.get(tabId);
    if (!record) {
      registerTab(tabId, url, options?.isPrivate || false);
      record = records.get(tabId)!;
    }

    // Cancel existing timer & abort ongoing controller for previous epoch
    clearTimer(record);
    if (record.activeAbortController) {
      try {
        record.activeAbortController.abort();
      } catch {
        // noop
      }
      record.activeAbortController = null;
    }

    // Increment monotonic epoch
    record.timeoutEpoch += 1;
    const currentEpoch = record.timeoutEpoch;

    const controller = new AbortController();
    record.activeAbortController = controller;
    record.url = url;
    if (options?.isPrivate !== undefined) {
      record.isPrivate = options.isPrivate;
    }
    record.stage = TimeoutStage.MONITORING;
    const now = Date.now();
    record.startTime = now;
    record.lastActivityTime = now;
    record.bytesTransferred = 0;
    record.lastTimeoutReason = null;
    record.recommendedAction = null;

    // Schedule progressive timeout check
    const timeoutMs = options?.customTimeoutMs || config.connectTimeoutMs;
    record.timerId = setTimeout(() => {
      onTimerTick(tabId, currentEpoch);
    }, timeoutMs);

    return {
      timeoutEpoch: currentEpoch,
      abortSignal: controller.signal,
    };
  }

  function onTimerTick(tabId: string, epoch: number) {
    const record = records.get(tabId);
    if (!record || record.timeoutEpoch !== epoch) {
      return; // Stale epoch timer tick ignored
    }

    const now = Date.now();
    const timeSinceLastActivity = now - record.lastActivityTime;
    const totalElapsed = now - record.startTime;

    // 1. Check if hard absolute deadline reached
    if (totalElapsed >= config.maxHardDeadlineMs) {
      triggerTimeout(tabId, TimeoutReason.HARD_DEADLINE_TIMEOUT, epoch);
      return;
    }

    // 2. If no data/chunks arrived yet, initial connect timeout expired
    if (record.bytesTransferred === 0) {
      triggerTimeout(tabId, TimeoutReason.INITIAL_CONNECT_TIMEOUT, epoch);
      return;
    }

    // 3. Active data transfer in progress: if progress was made recently within inactivityStallMs
    if (timeSinceLastActivity < config.inactivityStallMs) {
      record.stage = TimeoutStage.ACTIVITY_EXTENDED;
      const remainingWindow = config.inactivityStallMs - timeSinceLastActivity;
      record.timerId = setTimeout(() => {
        onTimerTick(tabId, epoch);
      }, Math.max(50, remainingWindow));
      return;
    }

    // 4. Inactivity stall: transfer was ongoing, but ceased for inactivityStallMs
    triggerTimeout(tabId, TimeoutReason.TRANSFER_STALL_TIMEOUT, epoch);
  }

  function recordActivity(
    tabId: string,
    epoch: number,
    bytesChunk: number = 0,
    _activityLabel?: string
  ): boolean {
    const record = records.get(tabId);
    if (!record || record.timeoutEpoch !== epoch) {
      return false; // Stale epoch activity rejected
    }

    const now = Date.now();
    record.lastActivityTime = now;
    if (bytesChunk > 0) {
      record.bytesTransferred += bytesChunk;
    }
    record.stage = TimeoutStage.ACTIVITY_EXTENDED;
    return true;
  }

  function checkTimeoutOrStall(
    tabId: string,
    now: number = Date.now()
  ): { stage: TimeoutStage; isStalled: boolean; isTimedOut: boolean } {
    const record = records.get(tabId);
    if (!record) {
      return { stage: TimeoutStage.IDLE, isStalled: false, isTimedOut: false };
    }

    if (record.stage === TimeoutStage.TIMED_OUT || record.stage === TimeoutStage.SAFE_FAILURE) {
      return { stage: record.stage, isStalled: true, isTimedOut: true };
    }

    if (record.stage === TimeoutStage.MONITORING || record.stage === TimeoutStage.ACTIVITY_EXTENDED) {
      const timeSinceActivity = now - record.lastActivityTime;
      const totalElapsed = now - record.startTime;

      if (totalElapsed >= config.maxHardDeadlineMs || timeSinceActivity >= config.inactivityStallMs) {
        return { stage: TimeoutStage.STALLED_WARNING, isStalled: true, isTimedOut: false };
      }
    }

    return { stage: record.stage, isStalled: false, isTimedOut: false };
  }

  function triggerTimeout(
    tabId: string,
    reason: TimeoutReason,
    epoch?: number
  ): TimeoutTriggerResult | null {
    const record = records.get(tabId);
    if (!record) return null;

    if (epoch !== undefined && record.timeoutEpoch !== epoch) {
      return null; // Ignore stale epoch trigger
    }

    clearTimer(record);

    // Abort ongoing in-flight fetch safely
    if (record.activeAbortController) {
      try {
        record.activeAbortController.abort();
      } catch {
        // noop
      }
      record.activeAbortController = null;
    }

    record.stage = TimeoutStage.TIMED_OUT;
    record.lastTimeoutReason = reason;

    // Determine recommended recovery action based on reason and retry history
    let action: RecoveryAction = "RETRY_WITH_BACKOFF";
    let safeMessage = "Connection timed out. The server took too long to respond.";

    if (reason === TimeoutReason.TRANSFER_STALL_TIMEOUT) {
      safeMessage = "Transfer stalled: Data reception stopped unexpectedly.";
      action = record.retryCount >= 1 ? "RETRY_TEXT_ONLY" : "RETRY_WITH_BACKOFF";
    } else if (reason === TimeoutReason.HARD_DEADLINE_TIMEOUT) {
      safeMessage = "Page request exceeded maximum time limit (60s).";
      action = "RETRY_TEXT_ONLY";
    }

    record.recommendedAction = action;

    return {
      timedOut: true,
      reason,
      timeoutEpoch: record.timeoutEpoch,
      recommendedAction: action,
      safeMessage,
    };
  }

  function markRequestSuccess(tabId: string, epoch: number): boolean {
    const record = records.get(tabId);
    if (!record || record.timeoutEpoch !== epoch) {
      return false; // Stale epoch
    }

    clearTimer(record);
    record.activeAbortController = null;
    record.stage = TimeoutStage.RECOVERED;
    record.retryCount = 0;
    record.lastTimeoutReason = null;
    record.recommendedAction = null;
    return true;
  }

  function initiateRecovery(
    tabId: string,
    action: RecoveryAction
  ): { newTimeoutEpoch: number; recommendedBackoffMs: number; canProceed: boolean } {
    const record = records.get(tabId);
    if (!record) {
      return { newTimeoutEpoch: 0, recommendedBackoffMs: 0, canProceed: false };
    }

    clearTimer(record);
    if (record.activeAbortController) {
      try {
        record.activeAbortController.abort();
      } catch {
        // noop
      }
      record.activeAbortController = null;
    }

    // Advance recovery/timeout epoch
    record.timeoutEpoch += 1;
    record.retryCount += 1;

    // Calculate progressive backoff
    const rawBackoff = config.baseRetryBackoffMs * Math.pow(2, record.retryCount - 1);
    const recommendedBackoffMs = Math.min(rawBackoff, config.maxRetryBackoffMs);

    if (action === "DISMISS_KEEP_CONTENT" || action === "FALLBACK_HOME") {
      record.stage = TimeoutStage.SAFE_FAILURE;
      record.retryCount = 0;
    } else {
      record.stage = TimeoutStage.RECOVERING_RETRY;
    }

    return {
      newTimeoutEpoch: record.timeoutEpoch,
      recommendedBackoffMs,
      canProceed: true,
    };
  }

  function executeGuardedTimeoutCallback<T>(
    tabId: string,
    epoch: number,
    actionName: string,
    callback: () => T
  ): GuardedCallbackResult<T> {
    const record = records.get(tabId);
    if (!record) {
      return {
        executed: false,
        staleEpochDetected: false,
        reason: `Tab ${tabId} not found`,
      };
    }

    // Stale barrier: Reject if epoch is older than current tab timeout epoch
    if (epoch !== record.timeoutEpoch) {
      return {
        executed: false,
        staleEpochDetected: true,
        reason: `Stale callback rejected for ${actionName}: callback epoch ${epoch} < current epoch ${record.timeoutEpoch}`,
      };
    }

    // Do not execute callbacks on timed-out or aborted tabs unless recovered
    if (record.stage === TimeoutStage.TIMED_OUT || record.stage === TimeoutStage.ABORTED) {
      return {
        executed: false,
        staleEpochDetected: false,
        reason: `Callback skipped: Tab is in ${record.stage} state`,
      };
    }

    try {
      const result = callback();
      return {
        executed: true,
        staleEpochDetected: false,
        result,
      };
    } catch (err) {
      return {
        executed: false,
        staleEpochDetected: false,
        reason: (err as Error).message,
      };
    }
  }

  function isEpochCurrent(tabId: string, epoch: number): boolean {
    const record = records.get(tabId);
    return record !== undefined && record.timeoutEpoch === epoch;
  }

  function getTabRecord(tabId: string): TabTimeoutRecord | null {
    const record = records.get(tabId);
    return record ? { ...record } : null;
  }

  function onNavigation(tabId: string, newUrl: string): { newEpoch: number } {
    let record = records.get(tabId);
    if (!record) {
      registerTab(tabId, newUrl);
      record = records.get(tabId)!;
    }

    clearTimer(record);
    if (record.activeAbortController) {
      try {
        record.activeAbortController.abort();
      } catch {
        // noop
      }
      record.activeAbortController = null;
    }

    record.timeoutEpoch += 1;
    record.url = newUrl;
    record.stage = TimeoutStage.IDLE;
    record.startTime = 0;
    record.lastActivityTime = 0;
    record.bytesTransferred = 0;
    record.lastTimeoutReason = null;
    record.recommendedAction = null;

    return { newEpoch: record.timeoutEpoch };
  }

  function onStopLoading(tabId: string): void {
    const record = records.get(tabId);
    if (!record) return;

    clearTimer(record);
    if (record.activeAbortController) {
      try {
        record.activeAbortController.abort();
      } catch {
        // noop
      }
      record.activeAbortController = null;
    }

    record.stage = TimeoutStage.ABORTED;
  }

  function onTabClosed(tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number): void {
    const record = records.get(tabId);
    if (record) {
      clearTimer(record);
      if (record.activeAbortController) {
        try {
          record.activeAbortController.abort();
        } catch {
          // noop
        }
      }
      records.delete(tabId);
    }

    // If closing last private tab, wipe all private records
    if (isPrivate && (remainingPrivateTabs === undefined || remainingPrivateTabs === 0)) {
      for (const [id, r] of Array.from(records.entries())) {
        if (r.isPrivate) {
          clearTimer(r);
          records.delete(id);
        }
      }
    }
  }

  function resetAll(): void {
    for (const r of Array.from(records.values())) {
      clearTimer(r);
    }
    records.clear();
  }

  return {
    registerTab,
    startRequestTimeout,
    recordActivity,
    checkTimeoutOrStall,
    triggerTimeout,
    markRequestSuccess,
    initiateRecovery,
    executeGuardedTimeoutCallback,
    isEpochCurrent,
    getTabRecord,
    onNavigation,
    onStopLoading,
    onTabClosed,
    resetAll,
  };
}
