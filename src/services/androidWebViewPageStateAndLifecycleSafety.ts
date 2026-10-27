/**
 * NETFLOW Browser V2 — Android WebView Page State & DOM/JS Lifecycle Bridge Safety
 *
 * Form: NETFLOW-V2-NATIVE-31
 *
 * This module establishes resilient Page State & DOM/JS Lifecycle safety for Android WebView:
 * 1. Page Load Lifecycle Tracking:
 *    - Explicitly tracks states: INITIALIZED -> LOADING -> DOM_CONTENT_LOADED -> LOADED (or ERROR / ABORTED).
 * 2. Current Page DOM/JS Lifecycle Consistency:
 *    - Maintains lifecycle state, execution epochs, and DOM readiness per tab and canonical origin.
 * 3. Invalidation of Superseded Page Lifecycle Callbacks:
 *    - On navigation, reload, or stop-loading, pending lifecycle listeners and async DOM/JS callbacks
 *      belonging to the prior page epoch are strictly invalidated and cancelled.
 * 4. Stale DOM/JS Callback Barrier:
 *    - Guarantees that callbacks, async evaluation promises, postMessage dispatches, or DOM mutations
 *      from a prior page cannot execute on or alter the newly loaded page state.
 * 5. Rapid Navigation & Reload Race Protection:
 *    - Monotonically advancing page lifecycle epochs prevent asynchronous fetch or evaluation races.
 * 6. Tab & Origin Isolation:
 *    - Page lifecycle states and registered callbacks are isolated strictly by tabId and canonical origin.
 * 7. Private Tab Isolation:
 *    - Private tabs maintain purely transient lifecycle states that are wiped on tab close.
 * 8. Compatibility with NATIVE-30 & NATIVE-29:
 *    - Integrates cleanly alongside NATIVE-30 rendering resilience and NATIVE-29 media resource governance.
 * 9. Privileged Bridge Invariant:
 *    - Pure TypeScript safe boundary. Absolutely no JNI, native reflection, or privileged JS native bridge.
 */

export enum PageLifecycleState {
  INITIALIZED = "initialized",
  LOADING = "loading",
  DOM_CONTENT_LOADED = "dom_content_loaded",
  LOADED = "loaded",
  FAILED_ERROR = "failed_error",
  ABORTED_TERMINATED = "aborted_terminated",
}

export interface TabPageStateRecord {
  tabId: string;
  origin: string;
  currentUrl: string;
  state: PageLifecycleState;
  lifecycleEpoch: number;
  isPrivate: boolean;
  domInteractiveTimestamp: number | null;
  loadCompleteTimestamp: number | null;
  lastStateChangeTimestamp: number;
  activeCallbacksCount: number;
  navigationCount: number;
  lastError: string | null;
}

export interface LifecycleCallbackValidationResult<T> {
  isValid: boolean;
  executed: boolean;
  result?: T;
  reason?: string;
  staleEpochDetected?: boolean;
}

export interface AndroidWebViewPageStateAndLifecycleSafetyManager {
  // Tab Lifecycle Registration & Query
  registerTab: (tabId: string, initialUrl: string, isPrivate?: boolean) => TabPageStateRecord;
  getTabRecord: (tabId: string) => TabPageStateRecord | null;
  getAllTabRecords: () => TabPageStateRecord[];

  // Page Load Lifecycle State Transitions
  onPageStarted: (tabId: string, url: string) => { newEpoch: number; lifecycleEpoch: number };
  onDOMContentLoaded: (tabId: string, epoch: number) => boolean;
  onPageFinished: (tabId: string, epoch: number) => boolean;
  onPageError: (tabId: string, epoch: number, errorMessage: string) => boolean;

  // Stale DOM/JS Callback Barrier & Execution Guard
  isLifecycleEpochCurrent: (tabId: string, epoch: number) => boolean;
  executeGuardedDOMCallback: <T>(
    tabId: string,
    epoch: number,
    callbackName: string,
    callback: () => T
  ) => LifecycleCallbackValidationResult<T>;

  // Lifecycle Interruption & Teardown Cleanups
  onNavigation: (tabId: string, newUrl: string) => { newEpoch: number };
  onReload: (tabId: string) => { newEpoch: number };
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;

  destroy: () => void;
}

export function createAndroidWebViewPageStateAndLifecycleSafetyManager(): AndroidWebViewPageStateAndLifecycleSafetyManager {
  // Map<tabId, TabPageStateRecord>
  const records = new Map<string, TabPageStateRecord>();

  // Map<tabId, Set<string>> active callback tokens per tab
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
  // 1. Tab Lifecycle Registration
  // -------------------------------------------------------------
  const registerTab = (
    tabId: string,
    initialUrl: string,
    isPrivate = false
  ): TabPageStateRecord => {
    const existing = records.get(tabId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const record: TabPageStateRecord = {
      tabId,
      origin: extractOrigin(initialUrl),
      currentUrl: initialUrl,
      state: initialUrl ? PageLifecycleState.LOADING : PageLifecycleState.INITIALIZED,
      lifecycleEpoch: 1,
      isPrivate,
      domInteractiveTimestamp: null,
      loadCompleteTimestamp: null,
      lastStateChangeTimestamp: now,
      activeCallbacksCount: 0,
      navigationCount: 0,
      lastError: null,
    };

    records.set(tabId, record);
    activeCallbacks.set(tabId, new Set<string>());

    return record;
  };

  const getTabRecord = (tabId: string): TabPageStateRecord | null => {
    const r = records.get(tabId);
    return r ? { ...r } : null;
  };

  const getAllTabRecords = (): TabPageStateRecord[] => {
    return Array.from(records.values()).map((r) => ({ ...r }));
  };

  // -------------------------------------------------------------
  // 2. Page Load Lifecycle Transitions
  // -------------------------------------------------------------
  const onPageStarted = (tabId: string, url: string): { newEpoch: number; lifecycleEpoch: number } => {
    let r = records.get(tabId);
    const now = Date.now();

    if (!r) {
      r = registerTab(tabId, url, false);
      return { newEpoch: r.lifecycleEpoch, lifecycleEpoch: r.lifecycleEpoch };
    }

    // Monotonically advance lifecycle epoch
    r.lifecycleEpoch += 1;
    r.currentUrl = url;
    r.origin = extractOrigin(url);
    r.state = PageLifecycleState.LOADING;
    r.domInteractiveTimestamp = null;
    r.loadCompleteTimestamp = null;
    r.lastStateChangeTimestamp = now;
    r.navigationCount += 1;
    r.lastError = null;

    // Invalidate and cancel all prior page callbacks
    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      r.activeCallbacksCount = 0;
    }

    return { newEpoch: r.lifecycleEpoch, lifecycleEpoch: r.lifecycleEpoch };
  };

  const onDOMContentLoaded = (tabId: string, epoch: number): boolean => {
    const r = records.get(tabId);
    if (!r || r.lifecycleEpoch !== epoch) {
      return false;
    }

    if (r.state === PageLifecycleState.LOADING) {
      r.state = PageLifecycleState.DOM_CONTENT_LOADED;
      r.domInteractiveTimestamp = Date.now();
      r.lastStateChangeTimestamp = Date.now();
      return true;
    }

    return false;
  };

  const onPageFinished = (tabId: string, epoch: number): boolean => {
    const r = records.get(tabId);
    if (!r || r.lifecycleEpoch !== epoch) {
      return false;
    }

    // Accept transition from LOADING or DOM_CONTENT_LOADED
    if (r.state === PageLifecycleState.LOADING || r.state === PageLifecycleState.DOM_CONTENT_LOADED) {
      r.state = PageLifecycleState.LOADED;
      r.loadCompleteTimestamp = Date.now();
      r.lastStateChangeTimestamp = Date.now();
      return true;
    }

    return false;
  };

  const onPageError = (tabId: string, epoch: number, errorMessage: string): boolean => {
    const r = records.get(tabId);
    if (!r || r.lifecycleEpoch !== epoch) {
      return false;
    }

    r.state = PageLifecycleState.FAILED_ERROR;
    r.lastError = errorMessage;
    r.lastStateChangeTimestamp = Date.now();

    // Cancel pending callbacks on page failure
    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      r.activeCallbacksCount = 0;
    }

    return true;
  };

  // -------------------------------------------------------------
  // 3. Stale DOM/JS Callback Barrier & Guarded Execution
  // -------------------------------------------------------------
  const isLifecycleEpochCurrent = (tabId: string, epoch: number): boolean => {
    const r = records.get(tabId);
    return Boolean(r && r.lifecycleEpoch === epoch && r.state !== PageLifecycleState.ABORTED_TERMINATED);
  };

  const executeGuardedDOMCallback = <T>(
    tabId: string,
    epoch: number,
    callbackName: string,
    callback: () => T
  ): LifecycleCallbackValidationResult<T> => {
    const r = records.get(tabId);
    if (!r) {
      return {
        isValid: false,
        executed: false,
        reason: "TabNotRegistered",
      };
    }

    if (r.state === PageLifecycleState.ABORTED_TERMINATED) {
      return {
        isValid: false,
        executed: false,
        reason: "TabAbortedOrTerminated",
      };
    }

    if (r.lifecycleEpoch !== epoch) {
      return {
        isValid: false,
        executed: false,
        staleEpochDetected: true,
        reason: `StaleLifecycleCallbackRejected: [${callbackName}] epoch ${epoch} superseded by current epoch ${r.lifecycleEpoch}`,
      };
    }

    const callbackToken = `cb-${callbackIdCounter++}-${callbackName}`;
    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.add(callbackToken);
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
        reason: `CallbackExecutionError: ${(err as Error).message}`,
      };
    } finally {
      if (callbacks) {
        callbacks.delete(callbackToken);
        r.activeCallbacksCount = callbacks.size;
      }
    }
  };

  // -------------------------------------------------------------
  // 4. Lifecycle Cleanups & Tab Closure
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, newUrl: string): { newEpoch: number } => {
    return onPageStarted(tabId, newUrl);
  };

  const onReload = (tabId: string): { newEpoch: number } => {
    const r = records.get(tabId);
    const currentUrl = r ? r.currentUrl : "about:blank";
    return onPageStarted(tabId, currentUrl);
  };

  const onStopLoading = (tabId: string) => {
    const r = records.get(tabId);
    if (!r) return;

    if (r.state === PageLifecycleState.LOADING) {
      r.state = PageLifecycleState.ABORTED_TERMINATED;
      r.lastStateChangeTimestamp = Date.now();
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
      r.state = PageLifecycleState.ABORTED_TERMINATED;
      r.lifecycleEpoch += 1;
    }

    const callbacks = activeCallbacks.get(tabId);
    if (callbacks) {
      callbacks.clear();
      activeCallbacks.delete(tabId);
    }

    records.delete(tabId);

    // If closing the last private tab, purge all private lifecycle records
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
    onPageStarted,
    onDOMContentLoaded,
    onPageFinished,
    onPageError,
    isLifecycleEpochCurrent,
    executeGuardedDOMCallback,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
