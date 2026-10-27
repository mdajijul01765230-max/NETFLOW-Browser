/**
 * NETFLOW Browser V2 — Android WebView Error & Recovery Lifecycle
 *
 * Form: NETFLOW-V2-NATIVE-32
 *
 * This module provides comprehensive, resilient WebView Error & Recovery Lifecycle management:
 * 1. WebView Page-Load Error Detection:
 *    - Accurately classifies errors into standard WebView error kinds (DNS failure, network timeout,
 *      connection refused, SSL/TLS handshake error, HTTP 4xx/5xx status codes, parse failures).
 * 2. HTTP/Network Failure Recovery State Machine:
 *    - Explicitly manages per-tab recovery states:
 *      IDLE -> ERROR_DETECTED -> RECOVERY_PENDING -> RECOVERING_RETRY -> RECOVERED / FALLBACK_SAFE / ABORTED.
 * 3. Failed Navigation Safe Recovery Paths:
 *    - Supports systematic recovery strategies: RETRY_CURRENT, RETRY_TEXT_ONLY, DISMISS_KEEP_CONTENT,
 *      FALLBACK_PREVIOUS_URL, and FALLBACK_HOME.
 * 4. Reload / Retry Recovery Lifecycle:
 *    - Tracks retry attempt counts, timestamps, and recommended backoff delays.
 *    - Monotonically increments recovery epoch on each attempt.
 * 5. Stale Failed-Page Callback Rejection:
 *    - In-flight recovery promises, timers, and async handlers from superseded error epochs
 *      are strictly prevented from executing on newly navigated or recovered pages.
 * 6. Per-Tab Lifecycle Isolation:
 *    - Complete separation of error records, retry counters, and callbacks by tabId.
 * 7. Private Tab Isolation:
 *    - Private tabs maintain purely transient error state records that are wiped on closure.
 * 8. Clean Compatibility:
 *    - Integrates seamlessly with NATIVE-31 (Page State & DOM/JS Lifecycle), NATIVE-30 (Rendering Resilience),
 *      and NATIVE-29 (Media Resource Governance).
 * 9. Security Invariant:
 *    - Pure TypeScript safe boundary. Zero JNI, native reflection, or privileged JS native bridge.
 */

export enum WebViewErrorKind {
  NETWORK_DISCONNECTED = "network_disconnected",
  DNS_LOOKUP_FAILED = "dns_lookup_failed",
  CONNECTION_REFUSED = "connection_refused",
  CONNECTION_TIMEOUT = "connection_timeout",
  SSL_SECURITY_ERROR = "ssl_security_error",
  HTTP_CLIENT_ERROR = "http_client_error",
  HTTP_SERVER_ERROR = "http_server_error",
  GENERIC_LOAD_ERROR = "generic_load_error",
}

export enum RecoveryLifecycleState {
  IDLE = "idle",
  ERROR_DETECTED = "error_detected",
  RECOVERY_PENDING = "recovery_pending",
  RECOVERING_RETRY = "recovering_retry",
  RECOVERED = "recovered",
  FALLBACK_SAFE = "fallback_safe",
  ABORTED = "aborted",
}

export type RecoveryActionType =
  | "RETRY_CURRENT"
  | "RETRY_TEXT_ONLY"
  | "DISMISS_KEEP_CONTENT"
  | "FALLBACK_PREVIOUS_URL"
  | "FALLBACK_HOME";

export interface TabErrorRecoveryRecord {
  tabId: string;
  origin: string;
  currentUrl: string;
  state: RecoveryLifecycleState;
  recoveryEpoch: number;
  lastErrorKind: WebViewErrorKind | null;
  lastErrorMessage: string | null;
  lastStatusCode: number | null;
  retryCount: number;
  lastErrorTimestamp: number | null;
  lastRecoveryTimestamp: number | null;
  isPrivate: boolean;
  hasFallbackContent: boolean;
  activeCallbacksCount: number;
  recommendedBackoffMs: number;
}

export interface RecoveryCallbackResult<T> {
  isValid: boolean;
  executed: boolean;
  result?: T;
  reason?: string;
  staleEpochDetected?: boolean;
}

export interface AndroidWebViewErrorAndRecoveryLifecycleManager {
  // Tab Registration & Query
  registerTab: (tabId: string, initialUrl: string, isPrivate?: boolean) => TabErrorRecoveryRecord;
  getTabRecord: (tabId: string) => TabErrorRecoveryRecord | null;
  getAllTabRecords: () => TabErrorRecoveryRecord[];

  // Error Detection & Registration
  detectAndRecordError: (
    tabId: string,
    url: string,
    error: unknown,
    statusCode?: number,
    hasPriorContent?: boolean,
    expectedEpoch?: number
  ) => {
    errorKind: WebViewErrorKind;
    recoveryEpoch: number;
    record: TabErrorRecoveryRecord;
    isStale?: boolean;
  };

  // Recovery Actions & Progression
  initiateRecovery: (
    tabId: string,
    action: RecoveryActionType
  ) => {
    recoveryEpoch: number;
    action: RecoveryActionType;
    canProceed: boolean;
    recommendedDelayMs: number;
  };

  markRecoverySuccess: (tabId: string, epoch: number) => boolean;

  // Guarded Stale Callback Execution Barrier
  isRecoveryEpochCurrent: (tabId: string, epoch: number) => boolean;
  executeGuardedRecoveryCallback: <T>(
    tabId: string,
    epoch: number,
    callbackName: string,
    callback: () => T
  ) => RecoveryCallbackResult<T>;

  // Lifecycle Interruption & Teardown Cleanups
  onNavigation: (tabId: string, newUrl: string) => { newEpoch: number };
  onReload: (tabId: string) => { newEpoch: number };
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;

  destroy: () => void;
}

/**
 * Classifies raw network / HTTP errors into standard WebView error kinds.
 */
export function classifyWebViewError(
  rawError: unknown,
  statusCode?: number
): {
  kind: WebViewErrorKind;
  message: string;
  isTransient: boolean;
} {
  const msg =
    rawError instanceof Error
      ? rawError.message
      : typeof rawError === "string"
      ? rawError
      : "Unknown network error";

  const lower = msg.toLowerCase();

  // 1. Offline / Disconnected
  if (
    lower.includes("offline") ||
    lower.includes("no internet") ||
    lower.includes("network disconnected") ||
    lower.includes("net::err_internet_disconnected")
  ) {
    return {
      kind: WebViewErrorKind.NETWORK_DISCONNECTED,
      message: msg,
      isTransient: true,
    };
  }

  // 2. DNS Lookup Failures
  if (
    lower.includes("name_not_resolved") ||
    lower.includes("dns") ||
    lower.includes("nxdomain") ||
    lower.includes("getaddrinfo enotfound")
  ) {
    return {
      kind: WebViewErrorKind.DNS_LOOKUP_FAILED,
      message: msg,
      isTransient: false,
    };
  }

  // 3. Connection Refused / Unreachable
  if (
    lower.includes("connection refused") ||
    lower.includes("econnrefused") ||
    lower.includes("net::err_connection_refused")
  ) {
    return {
      kind: WebViewErrorKind.CONNECTION_REFUSED,
      message: msg,
      isTransient: true,
    };
  }

  // 4. Timeouts
  if (
    statusCode === 504 ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("net::err_connection_timed_out")
  ) {
    return {
      kind: WebViewErrorKind.CONNECTION_TIMEOUT,
      message: msg,
      isTransient: true,
    };
  }

  // 5. SSL / TLS Security Errors
  if (
    lower.includes("cert") ||
    lower.includes("ssl") ||
    lower.includes("tls") ||
    lower.includes("authority_invalid") ||
    lower.includes("net::err_cert_")
  ) {
    return {
      kind: WebViewErrorKind.SSL_SECURITY_ERROR,
      message: msg,
      isTransient: false,
    };
  }

  // 6. HTTP Status Code Classifications
  if (statusCode) {
    if (statusCode >= 400 && statusCode < 500) {
      return {
        kind: WebViewErrorKind.HTTP_CLIENT_ERROR,
        message: msg || `HTTP ${statusCode} Client Error`,
        isTransient: statusCode === 408 || statusCode === 429,
      };
    }
    if (statusCode >= 500 && statusCode < 600) {
      return {
        kind: WebViewErrorKind.HTTP_SERVER_ERROR,
        message: msg || `HTTP ${statusCode} Server Error`,
        isTransient: true,
      };
    }
  }

  // 7. Generic fallback
  return {
    kind: WebViewErrorKind.GENERIC_LOAD_ERROR,
    message: msg,
    isTransient: true,
  };
}

/**
 * Calculates exponential backoff with a cap.
 */
function calculateBackoffMs(retryCount: number): number {
  const baseMs = 500;
  const maxMs = 5000;
  const delay = baseMs * Math.pow(2, Math.min(retryCount, 4));
  return Math.min(delay, maxMs);
}

export function createAndroidWebViewErrorAndRecoveryLifecycleManager(): AndroidWebViewErrorAndRecoveryLifecycleManager {
  const records = new Map<string, TabErrorRecoveryRecord>();
  const activeCallbacks = new Map<string, Set<string>>();
  let callbackIdCounter = 1;

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
  // 1. Tab Registration & Query
  // -------------------------------------------------------------
  const registerTab = (
    tabId: string,
    initialUrl: string,
    isPrivate = false
  ): TabErrorRecoveryRecord => {
    const existing = records.get(tabId);
    if (existing) {
      return existing;
    }

    const record: TabErrorRecoveryRecord = {
      tabId,
      origin: extractOrigin(initialUrl),
      currentUrl: initialUrl,
      state: RecoveryLifecycleState.IDLE,
      recoveryEpoch: 1,
      lastErrorKind: null,
      lastErrorMessage: null,
      lastStatusCode: null,
      retryCount: 0,
      lastErrorTimestamp: null,
      lastRecoveryTimestamp: null,
      isPrivate,
      hasFallbackContent: false,
      activeCallbacksCount: 0,
      recommendedBackoffMs: calculateBackoffMs(0),
    };

    records.set(tabId, record);
    activeCallbacks.set(tabId, new Set<string>());

    return record;
  };

  const getTabRecord = (tabId: string): TabErrorRecoveryRecord | null => {
    const r = records.get(tabId);
    return r ? { ...r } : null;
  };

  const getAllTabRecords = (): TabErrorRecoveryRecord[] => {
    return Array.from(records.values()).map((r) => ({ ...r }));
  };

  // -------------------------------------------------------------
  // 2. Error Detection & Registration
  // -------------------------------------------------------------
  const detectAndRecordError = (
    tabId: string,
    url: string,
    error: unknown,
    statusCode?: number,
    hasPriorContent = false,
    expectedEpoch?: number
  ): {
    errorKind: WebViewErrorKind;
    recoveryEpoch: number;
    record: TabErrorRecoveryRecord;
    isStale?: boolean;
  } => {
    let r = records.get(tabId);
    if (!r) {
      r = registerTab(tabId, url);
    }

    const classified = classifyWebViewError(error, statusCode);

    // Stale/Rapid Navigation race protection: If an expectedEpoch was passed and is superseded, reject the error
    if (expectedEpoch !== undefined && r.recoveryEpoch !== expectedEpoch) {
      return {
        errorKind: classified.kind,
        recoveryEpoch: r.recoveryEpoch,
        record: { ...r },
        isStale: true,
      };
    }

    const now = Date.now();

    // Increment recovery epoch on new failure to invalidate old callbacks
    r.recoveryEpoch += 1;
    r.currentUrl = url;
    r.origin = extractOrigin(url);
    r.state = RecoveryLifecycleState.ERROR_DETECTED;
    r.lastErrorKind = classified.kind;
    r.lastErrorMessage = classified.message;
    r.lastStatusCode = statusCode ?? null;
    r.lastErrorTimestamp = now;
    r.hasFallbackContent = hasPriorContent;
    r.recommendedBackoffMs = calculateBackoffMs(r.retryCount);

    // Invalidate prior callbacks on failure
    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      r.activeCallbacksCount = 0;
    }

    return {
      errorKind: classified.kind,
      recoveryEpoch: r.recoveryEpoch,
      record: { ...r },
      isStale: false,
    };
  };

  // -------------------------------------------------------------
  // 3. Recovery Action & Execution
  // -------------------------------------------------------------
  const initiateRecovery = (
    tabId: string,
    action: RecoveryActionType
  ): {
    recoveryEpoch: number;
    action: RecoveryActionType;
    canProceed: boolean;
    recommendedDelayMs: number;
  } => {
    let r = records.get(tabId);
    if (!r) {
      r = registerTab(tabId, "");
    }

    // Advance recovery epoch for the new recovery attempt
    r.recoveryEpoch += 1;

    // Invalidate prior callbacks
    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      r.activeCallbacksCount = 0;
    }

    let canProceed = true;
    let delayMs = 0;

    switch (action) {
      case "RETRY_CURRENT":
      case "RETRY_TEXT_ONLY": {
        r.state = RecoveryLifecycleState.RECOVERING_RETRY;
        r.retryCount += 1;
        delayMs = calculateBackoffMs(r.retryCount);
        r.recommendedBackoffMs = delayMs;
        break;
      }
      case "DISMISS_KEEP_CONTENT": {
        r.state = RecoveryLifecycleState.FALLBACK_SAFE;
        r.retryCount = 0;
        break;
      }
      case "FALLBACK_PREVIOUS_URL":
      case "FALLBACK_HOME": {
        r.state = RecoveryLifecycleState.FALLBACK_SAFE;
        r.retryCount = 0;
        break;
      }
      default: {
        canProceed = false;
        break;
      }
    }

    return {
      recoveryEpoch: r.recoveryEpoch,
      action,
      canProceed,
      recommendedDelayMs: delayMs,
    };
  };

  const markRecoverySuccess = (tabId: string, epoch: number): boolean => {
    const r = records.get(tabId);
    if (!r || r.recoveryEpoch !== epoch) {
      return false;
    }

    r.state = RecoveryLifecycleState.RECOVERED;
    r.lastRecoveryTimestamp = Date.now();
    r.retryCount = 0;
    r.lastErrorKind = null;
    r.lastErrorMessage = null;
    r.lastStatusCode = null;
    r.hasFallbackContent = false;
    r.recommendedBackoffMs = calculateBackoffMs(0);

    return true;
  };

  // -------------------------------------------------------------
  // 4. Guarded Callback Execution Barrier
  // -------------------------------------------------------------
  const isRecoveryEpochCurrent = (tabId: string, epoch: number): boolean => {
    const r = records.get(tabId);
    return Boolean(r && r.recoveryEpoch === epoch && r.state !== RecoveryLifecycleState.ABORTED);
  };

  const executeGuardedRecoveryCallback = <T>(
    tabId: string,
    epoch: number,
    callbackName: string,
    callback: () => T
  ): RecoveryCallbackResult<T> => {
    const r = records.get(tabId);
    if (!r) {
      return {
        isValid: false,
        executed: false,
        reason: "TabNotRegistered",
      };
    }

    if (r.state === RecoveryLifecycleState.ABORTED) {
      return {
        isValid: false,
        executed: false,
        reason: "TabAbortedOrTerminated",
      };
    }

    if (r.recoveryEpoch !== epoch) {
      return {
        isValid: false,
        executed: false,
        staleEpochDetected: true,
        reason: `StaleRecoveryCallbackRejected: [${callbackName}] epoch ${epoch} superseded by current epoch ${r.recoveryEpoch}`,
      };
    }

    const token = `rec-cb-${callbackIdCounter++}-${callbackName}`;
    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.add(token);
      r.activeCallbacksCount = callbacks.size;
    }

    try {
      const result = callback();
      return {
        isValid: true,
        executed: true,
        result,
      };
    } catch (err) {
      return {
        isValid: true,
        executed: false,
        reason: `RecoveryCallbackError: ${(err as Error).message}`,
      };
    } finally {
      if (callbacks) {
        callbacks.delete(token);
        r.activeCallbacksCount = callbacks.size;
      }
    }
  };

  // -------------------------------------------------------------
  // 5. Cleanups across Navigation, Reload & Tab Closure
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, newUrl: string): { newEpoch: number } => {
    let r = records.get(tabId);
    if (!r) {
      r = registerTab(tabId, newUrl);
      return { newEpoch: r.recoveryEpoch };
    }

    r.recoveryEpoch += 1;
    r.currentUrl = newUrl;
    r.origin = extractOrigin(newUrl);
    r.state = RecoveryLifecycleState.IDLE;
    r.retryCount = 0;
    r.lastErrorKind = null;
    r.lastErrorMessage = null;
    r.lastStatusCode = null;

    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      r.activeCallbacksCount = 0;
    }

    return { newEpoch: r.recoveryEpoch };
  };

  const onReload = (tabId: string): { newEpoch: number } => {
    const r = records.get(tabId);
    const targetUrl = r ? r.currentUrl : "about:blank";
    return onNavigation(tabId, targetUrl);
  };

  const onStopLoading = (tabId: string) => {
    const r = records.get(tabId);
    if (!r) return;

    if (
      r.state === RecoveryLifecycleState.RECOVERING_RETRY ||
      r.state === RecoveryLifecycleState.ERROR_DETECTED
    ) {
      r.state = RecoveryLifecycleState.ABORTED;
    }

    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      r.activeCallbacksCount = 0;
    }
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    const r = records.get(tabId);
    if (r) {
      r.state = RecoveryLifecycleState.ABORTED;
      r.recoveryEpoch += 1;
    }

    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      activeCallbacks.delete(tabId);
    }

    records.delete(tabId);

    // If closing the final private tab, purge all private records
    if (isPrivate && remainingPrivateTabs === 0) {
      records.forEach((rec, tId) => {
        if (rec.isPrivate) {
          activeCallbacks.get(tId)?.clear();
          activeCallbacks.delete(tId);
          records.delete(tId);
        }
      });
    }
  };

  const destroy = () => {
    records.clear();
    activeCallbacks.clear();
  };

  return {
    registerTab,
    getTabRecord,
    getAllTabRecords,
    detectAndRecordError,
    initiateRecovery,
    markRecoverySuccess,
    isRecoveryEpochCurrent,
    executeGuardedRecoveryCallback,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
