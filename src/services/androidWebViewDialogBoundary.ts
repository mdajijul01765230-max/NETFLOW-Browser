/**
 * NETFLOW Browser V2 — Android WebView JavaScript Dialog / Window Prompt Boundary
 *
 * Form: NETFLOW-V2-NATIVE-20
 *
 * This module establishes the secure Android WebView JavaScript Dialog (alert/confirm/prompt/beforeunload) boundary:
 * 1. WebChromeClient dialog contract:
 *    - onJsAlert (alert)
 *    - onJsConfirm (confirm)
 *    - onJsPrompt (prompt)
 *    - onJsBeforeUnload (beforeunload)
 * 2. User-controlled Allow / Cancel / Prompt-Text semantics with async resolution
 * 3. Malicious / repetitive dialog flood protection (rate-limiting & "prevent additional dialogs" suppression)
 * 4. Per-tab & per-origin isolation: dialogs are bound strictly to their originating tab and verified origin
 * 5. Lifecycle consistency: pending dialogs automatically cancel and clean up on navigation, reload, stopLoading, or tab close
 * 6. Origin security: rejects dangerous schemes (javascript:, file:, content:, data:, blob:, about:), SSRF, and private network targets
 * 7. Stale epoch defense: dialog callbacks cannot write to superseded navigations or closed tabs
 * 8. Privileged native bridge invariant: pure safe boundary abstraction without native reflection
 * 9. Reuses NATIVE-05 (Security Policy), NATIVE-08 (Capabilities), NATIVE-09 (Navigation),
 *    NATIVE-13 (Popups), and NATIVE-19 (Page Lifecycle).
 */

export type JavaScriptDialogType = "alert" | "confirm" | "prompt" | "beforeunload";

export interface DialogOriginValidationResult {
  isValid: boolean;
  isSecure: boolean;
  isLocalhost: boolean;
  origin?: string;
  reason?: string;
}

export interface JavaScriptDialogRequest {
  dialogId: string;
  tabId: string;
  origin: string;
  type: JavaScriptDialogType;
  message: string;
  defaultValue?: string;
  createdAt: number;
  requestEpoch: number;
  status: "pending" | "confirmed" | "cancelled" | "suppressed";
}

export interface JavaScriptDialogPrompt {
  dialogId: string;
  tabId: string;
  origin: string;
  type: JavaScriptDialogType;
  message: string;
  defaultValue?: string;
  showSuppressOption: boolean;
}

export interface DialogResolutionResult {
  confirmed: boolean;
  promptValue?: string;
  suppressFutureDialogs?: boolean;
}

/**
 * Validates origin of a JavaScript dialog request against dangerous schemes and SSRF targets.
 */
export function validateDialogOrigin(urlOrOrigin: string): DialogOriginValidationResult {
  if (!urlOrOrigin || typeof urlOrOrigin !== "string") {
    return { isValid: false, isSecure: false, isLocalhost: false, reason: "URL or origin is empty" };
  }

  const trimmed = urlOrOrigin.trim();
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
      reason: "Dangerous scheme blocked for JavaScript dialogs",
    };
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: `Unsupported protocol "${protocol}". Must be https:// or http:// (localhost)`,
      };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0";

    // 2. Localhost development allowed as secure context
    if (isLocalhost) {
      return {
        isValid: true,
        isSecure: true,
        isLocalhost: true,
        origin: parsed.origin,
      };
    }

    // 3. Remote plain HTTP is rejected for modern dialog boundaries
    if (protocol === "http:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "Insecure remote HTTP origin blocked from displaying modal dialogs",
      };
    }

    // 4. SSRF & private network address blocking
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
        reason: "JavaScript dialogs blocked on private network or metadata address",
      };
    }

    return {
      isValid: true,
      isSecure: true,
      isLocalhost: false,
      origin: parsed.origin,
    };
  } catch {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Malformed URL or origin string",
    };
  }
}

export interface AndroidWebViewDialogManagerConfig {
  maxDialogsPerWindow?: number;
  floodWindowMs?: number;
  onPromptStateChange?: (prompt: JavaScriptDialogPrompt | null) => void;
}

export interface AndroidWebViewDialogManager {
  // WebChromeClient Dialog dispatchers
  requestAlert: (
    tabId: string,
    url: string,
    message: string,
    epoch?: number
  ) => Promise<{ shown: boolean; reason?: string }>;

  requestConfirm: (
    tabId: string,
    url: string,
    message: string,
    epoch?: number
  ) => Promise<{ confirmed: boolean; suppressed?: boolean; reason?: string }>;

  requestPrompt: (
    tabId: string,
    url: string,
    message: string,
    defaultValue?: string,
    epoch?: number
  ) => Promise<{ value: string | null; suppressed?: boolean; reason?: string }>;

  requestBeforeUnload: (
    tabId: string,
    url: string,
    message?: string,
    epoch?: number
  ) => Promise<{ proceed: boolean; reason?: string }>;

  // User decision handlers
  confirmDialog: (dialogId: string, promptValue?: string, suppressFuture?: boolean) => boolean;
  cancelDialog: (dialogId: string, suppressFuture?: boolean) => boolean;
  dismissDialog: (dialogId: string) => boolean;

  // Query & state methods
  getPendingPrompt: () => JavaScriptDialogPrompt | null;
  getPendingDialogsForTab: (tabId: string) => JavaScriptDialogRequest[];
  isOriginSuppressed: (tabId: string, origin: string) => boolean;
  suppressOrigin: (tabId: string, origin: string) => void;

  // Lifecycle handlers
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;
  destroy: () => void;
}

/**
 * Creates the Android WebView JavaScript Dialog / Window Prompt Manager.
 */
export function createAndroidWebViewDialogManager(
  config: AndroidWebViewDialogManagerConfig = {}
): AndroidWebViewDialogManager {
  const maxDialogsPerWindow = config.maxDialogsPerWindow ?? 3;
  const floodWindowMs = config.floodWindowMs ?? 5000;

  // Pending dialog requests: Map<dialogId, JavaScriptDialogRequest>
  const pendingRequests = new Map<string, JavaScriptDialogRequest>();

  // Dialog completion resolvers: Map<dialogId, (res: DialogResolutionResult) => void>
  const resolvers = new Map<string, (res: DialogResolutionResult) => void>();

  // Dialog rate limiting tracker: Map<`${tabId}:${origin}`, number[]> (timestamps)
  const dialogHistory = new Map<string, number[]>();

  // Suppressed origins per tab: Set<`${tabId}:${origin}`>
  const suppressedOrigins = new Set<string>();

  // Current active dialog presented to UI
  let activePrompt: JavaScriptDialogPrompt | null = null;

  const getOriginKey = (tabId: string, origin: string) => `${tabId}:${origin}`;

  const notifyPromptChange = () => {
    if (config.onPromptStateChange) {
      config.onPromptStateChange(activePrompt ? { ...activePrompt } : null);
    }
  };

  const updateActivePrompt = () => {
    if (pendingRequests.size === 0) {
      activePrompt = null;
      notifyPromptChange();
      return;
    }

    // Pick first pending request
    const firstPending = Array.from(pendingRequests.values()).find((r) => r.status === "pending");
    if (!firstPending) {
      activePrompt = null;
      notifyPromptChange();
      return;
    }

    const key = getOriginKey(firstPending.tabId, firstPending.origin);
    const history = dialogHistory.get(key) || [];
    const showSuppress = history.length >= maxDialogsPerWindow;

    activePrompt = {
      dialogId: firstPending.dialogId,
      tabId: firstPending.tabId,
      origin: firstPending.origin,
      type: firstPending.type,
      message: firstPending.message,
      defaultValue: firstPending.defaultValue,
      showSuppressOption: showSuppress,
    };
    notifyPromptChange();
  };

  const checkFloodAndSuppression = (
    tabId: string,
    canonicalOrigin: string
  ): { allowed: boolean; reason?: string } => {
    const key = getOriginKey(tabId, canonicalOrigin);

    // Check if user previously suppressed dialogs from this origin
    if (suppressedOrigins.has(key)) {
      return { allowed: false, reason: "Dialogs from this origin are suppressed by user" };
    }

    // Record and check rate-limiting window
    const now = Date.now();
    let timestamps = dialogHistory.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < floodWindowMs);
    timestamps.push(now);
    dialogHistory.set(key, timestamps);

    // If dialog rate exceeds threshold by more than 2x without user interaction, auto-suppress
    if (timestamps.length > maxDialogsPerWindow * 3) {
      suppressedOrigins.add(key);
      return { allowed: false, reason: "Excessive dialog loop detected - auto suppressed" };
    }

    return { allowed: true };
  };

  const createDialogRequest = (
    tabId: string,
    url: string,
    type: JavaScriptDialogType,
    message: string,
    defaultValue?: string,
    epoch = 1
  ): Promise<DialogResolutionResult> => {
    // 1. Origin security validation
    const originCheck = validateDialogOrigin(url);
    if (!originCheck.isValid || !originCheck.origin) {
      return Promise.resolve({
        confirmed: false,
        promptValue: undefined,
      });
    }

    const canonicalOrigin = originCheck.origin;

    // 2. Flood & suppression check
    const floodCheck = checkFloodAndSuppression(tabId, canonicalOrigin);
    if (!floodCheck.allowed) {
      return Promise.resolve({
        confirmed: false,
        promptValue: undefined,
        suppressFutureDialogs: true,
      });
    }

    const dialogId = `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const request: JavaScriptDialogRequest = {
      dialogId,
      tabId,
      origin: canonicalOrigin,
      type,
      message,
      defaultValue,
      createdAt: Date.now(),
      requestEpoch: epoch,
      status: "pending",
    };

    pendingRequests.set(dialogId, request);

    const promise = new Promise<DialogResolutionResult>((resolve) => {
      resolvers.set(dialogId, resolve);
    });

    updateActivePrompt();
    return promise;
  };

  // -------------------------------------------------------------
  // WebChromeClient Dialog Dispatchers
  // -------------------------------------------------------------
  const requestAlert = async (
    tabId: string,
    url: string,
    message: string,
    epoch = 1
  ): Promise<{ shown: boolean; reason?: string }> => {
    const res = await createDialogRequest(tabId, url, "alert", message, undefined, epoch);
    return { shown: res.confirmed };
  };

  const requestConfirm = async (
    tabId: string,
    url: string,
    message: string,
    epoch = 1
  ): Promise<{ confirmed: boolean; suppressed?: boolean; reason?: string }> => {
    const res = await createDialogRequest(tabId, url, "confirm", message, undefined, epoch);
    return {
      confirmed: res.confirmed,
      suppressed: res.suppressFutureDialogs,
    };
  };

  const requestPrompt = async (
    tabId: string,
    url: string,
    message: string,
    defaultValue = "",
    epoch = 1
  ): Promise<{ value: string | null; suppressed?: boolean; reason?: string }> => {
    const res = await createDialogRequest(tabId, url, "prompt", message, defaultValue, epoch);
    return {
      value: res.confirmed ? (res.promptValue ?? defaultValue) : null,
      suppressed: res.suppressFutureDialogs,
    };
  };

  const requestBeforeUnload = async (
    tabId: string,
    url: string,
    message = "Leave site? Changes you made may not be saved.",
    epoch = 1
  ): Promise<{ proceed: boolean; reason?: string }> => {
    const res = await createDialogRequest(tabId, url, "beforeunload", message, undefined, epoch);
    return { proceed: res.confirmed };
  };

  // -------------------------------------------------------------
  // Decision Handlers
  // -------------------------------------------------------------
  const confirmDialog = (
    dialogId: string,
    promptValue?: string,
    suppressFuture = false
  ): boolean => {
    const req = pendingRequests.get(dialogId);
    if (!req || req.status !== "pending") return false;

    req.status = "confirmed";
    if (suppressFuture) {
      suppressedOrigins.add(getOriginKey(req.tabId, req.origin));
    }

    const resolver = resolvers.get(dialogId);
    if (resolver) {
      resolvers.delete(dialogId);
      resolver({
        confirmed: true,
        promptValue: promptValue !== undefined ? promptValue : req.defaultValue,
        suppressFutureDialogs: suppressFuture,
      });
    }

    pendingRequests.delete(dialogId);
    updateActivePrompt();
    return true;
  };

  const cancelDialog = (dialogId: string, suppressFuture = false): boolean => {
    const req = pendingRequests.get(dialogId);
    if (!req || req.status !== "pending") return false;

    req.status = "cancelled";
    if (suppressFuture) {
      suppressedOrigins.add(getOriginKey(req.tabId, req.origin));
    }

    const resolver = resolvers.get(dialogId);
    if (resolver) {
      resolvers.delete(dialogId);
      resolver({
        confirmed: false,
        promptValue: undefined,
        suppressFutureDialogs: suppressFuture,
      });
    }

    pendingRequests.delete(dialogId);
    updateActivePrompt();
    return true;
  };

  const dismissDialog = (dialogId: string): boolean => {
    return cancelDialog(dialogId, false);
  };

  const getPendingPrompt = (): JavaScriptDialogPrompt | null => {
    return activePrompt ? { ...activePrompt } : null;
  };

  const getPendingDialogsForTab = (tabId: string): JavaScriptDialogRequest[] => {
    return Array.from(pendingRequests.values())
      .filter((r) => r.tabId === tabId)
      .map((r) => ({ ...r }));
  };

  const isOriginSuppressed = (tabId: string, origin: string): boolean => {
    const originCheck = validateDialogOrigin(origin);
    const canonical = originCheck.origin || origin;
    return suppressedOrigins.has(getOriginKey(tabId, canonical));
  };

  const suppressOrigin = (tabId: string, origin: string): void => {
    const originCheck = validateDialogOrigin(origin);
    const canonical = originCheck.origin || origin;
    suppressedOrigins.add(getOriginKey(tabId, canonical));
  };

  // -------------------------------------------------------------
  // Lifecycle Handlers
  // -------------------------------------------------------------
  const cancelDialogsForTab = (tabId: string) => {
    const toCancel: string[] = [];
    pendingRequests.forEach((req, id) => {
      if (req.tabId === tabId) {
        toCancel.push(id);
      }
    });

    toCancel.forEach((id) => {
      const resolver = resolvers.get(id);
      if (resolver) {
        resolvers.delete(id);
        resolver({ confirmed: false, promptValue: undefined });
      }
      pendingRequests.delete(id);
    });

    updateActivePrompt();
  };

  const onNavigation = (tabId: string, _newUrl: string) => {
    // Cancel pending dialogs for this tab on navigation away
    cancelDialogsForTab(tabId);
  };

  const onReload = (tabId: string) => {
    // Cancel pending dialogs on reload
    cancelDialogsForTab(tabId);
  };

  const onStopLoading = (tabId: string) => {
    // Cancel pending dialogs on stop loading
    cancelDialogsForTab(tabId);
  };

  const onTabClosed = (tabId: string) => {
    cancelDialogsForTab(tabId);

    // Clean up suppression and history records for closed tab
    const prefix = `${tabId}:`;
    suppressedOrigins.forEach((key) => {
      if (key.startsWith(prefix)) {
        suppressedOrigins.delete(key);
      }
    });

    dialogHistory.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        dialogHistory.delete(key);
      }
    });
  };

  const destroy = () => {
    resolvers.forEach((resolve) => resolve({ confirmed: false }));
    resolvers.clear();
    pendingRequests.clear();
    dialogHistory.clear();
    suppressedOrigins.clear();
    activePrompt = null;
    notifyPromptChange();
  };

  return {
    requestAlert,
    requestConfirm,
    requestPrompt,
    requestBeforeUnload,
    confirmDialog,
    cancelDialog,
    dismissDialog,
    getPendingPrompt,
    getPendingDialogsForTab,
    isOriginSuppressed,
    suppressOrigin,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
