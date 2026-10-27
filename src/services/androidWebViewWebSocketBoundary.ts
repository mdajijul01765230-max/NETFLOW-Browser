/**
 * NETFLOW Browser V2 — Android WebView JavaScript WebSocket & Persistent Connection Boundary
 *
 * Form: NETFLOW-V2-NATIVE-17
 *
 * This module establishes the secure Android WebView WebSocket / Persistent Connection Boundary:
 * 1. WebSocket (ws/wss) navigation & connection boundary
 * 2. wss preferred; insecure ws permitted ONLY for localhost / development exceptions
 * 3. Dangerous schemes (javascript:, file:, content:, data:, blob:, http:, etc.) blocked
 * 4. SSRF & private network address blocking (169.254.169.254, 10.x, 192.168.x, 172.16-31.x, .internal, .local)
 * 5. Full connection lifecycle: connecting, open, closing, closed, error, suspended, and reconnect boundary
 * 6. Page / host pause and resume handling (suspending/restoring active persistent connections)
 * 7. Navigation, Stop loading, and tab-close cleanup (clean closing without persistent connection leaks)
 * 8. Strict per-tab connection isolation: connections on Tab A cannot be accessed or manipulated by Tab B
 * 9. Privileged native bridge invariant: pure safe boundary abstraction without native reflection
 * 10. Linkage: Reuses NATIVE-02/03/08/09 security and lifecycle conventions.
 */

export type WebSocketConnectionState =
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "suspended"
  | "error";

export interface WebSocketValidationResult {
  isAllowed: boolean;
  isLocalhost: boolean;
  isSecure: boolean; // wss is true, ws is false
  sanitizedUrl?: string;
  reason?: string;
}

export interface WebSocketConnectOptions {
  protocols?: string | string[];
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
}

export interface WebSocketSession {
  id: string;
  tabId: string;
  url: string;
  protocols: string[];
  state: WebSocketConnectionState;
  createdAt: number;
  connectedAt?: number;
  closedAt?: number;
  closeCode?: number;
  closeReason?: string;
  reconnectAttempts: number;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  messagesSent: number;
  messagesReceived: number;
  lastError?: string;
}

export interface WebSocketEventCallbacks {
  onOpen?: (session: WebSocketSession) => void;
  onMessage?: (session: WebSocketSession, data: string | ArrayBuffer) => void;
  onError?: (session: WebSocketSession, error: string) => void;
  onClose?: (session: WebSocketSession, code: number, reason: string) => void;
  onStateChange?: (session: WebSocketSession) => void;
}

/**
 * Validates a WebSocket target URL against Android WebView security policies:
 * - Must use wss: (secure) or ws: (strictly for localhost)
 * - Blocks dangerous schemes (javascript:, file:, content:, data:, blob:)
 * - Blocks SSRF / private network targets and cloud metadata addresses
 * - Insecure ws: rejected for any non-localhost host
 */
export function validateWebSocketUrl(urlStr: string): WebSocketValidationResult {
  if (!urlStr || typeof urlStr !== "string") {
    return {
      isAllowed: false,
      isLocalhost: false,
      isSecure: false,
      reason: "WebSocket URL is empty or invalid",
    };
  }

  const trimmed = urlStr.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous or unsupported schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("about:")
  ) {
    return {
      isAllowed: false,
      isLocalhost: false,
      isSecure: false,
      reason: "Dangerous scheme blocked for WebSocket connection",
    };
  }

  // 2. Parse URL structure
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "wss:" && protocol !== "ws:") {
      return {
        isAllowed: false,
        isLocalhost: false,
        isSecure: false,
        reason: `Unsupported WebSocket protocol "${protocol}". Must be wss:// or ws://`,
      };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0";

    // 3. Localhost development exception
    if (isLocalhost) {
      return {
        isAllowed: true,
        isLocalhost: true,
        isSecure: protocol === "wss:",
        sanitizedUrl: parsed.toString(),
      };
    }

    // 4. Insecure ws: rejected for all external/network targets
    if (protocol !== "wss:") {
      return {
        isAllowed: false,
        isLocalhost: false,
        isSecure: false,
        reason: "Insecure WebSocket (ws://) is only permitted for localhost development. Use wss:// for remote connections.",
      };
    }

    // 5. SSRF and private network defense for external connections
    if (
      host === "169.254.169.254" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return {
        isAllowed: false,
        isLocalhost: false,
        isSecure: false,
        reason: "WebSocket connection blocked to private network or cloud metadata address",
      };
    }

    return {
      isAllowed: true,
      isLocalhost: false,
      isSecure: true,
      sanitizedUrl: parsed.toString(),
    };
  } catch {
    return {
      isAllowed: false,
      isLocalhost: false,
      isSecure: false,
      reason: "Malformed WebSocket URL",
    };
  }
}

export interface AndroidWebViewWebSocketManagerConfig {
  onGlobalStateChange?: (tabId: string, activeCount: number) => void;
  mockTransport?: boolean;
}

export interface AndroidWebViewWebSocketManager {
  validateUrl: (url: string) => WebSocketValidationResult;
  createConnection: (
    tabId: string,
    url: string,
    options?: WebSocketConnectOptions,
    callbacks?: WebSocketEventCallbacks
  ) => { success: boolean; connectionId?: string; session?: WebSocketSession; error?: string };
  send: (
    tabId: string,
    connectionId: string,
    data: string | ArrayBuffer
  ) => { success: boolean; error?: string };
  close: (
    tabId: string,
    connectionId: string,
    code?: number,
    reason?: string
  ) => { success: boolean; error?: string };
  reconnect: (
    tabId: string,
    connectionId: string
  ) => { success: boolean; error?: string };
  getConnection: (tabId: string, connectionId: string) => WebSocketSession | null;
  getConnectionsForTab: (tabId: string) => WebSocketSession[];
  getActiveConnectionsCount: (tabId?: string) => number;
  onHostPause: (tabId?: string) => void;
  onHostResume: (tabId?: string) => void;
  onNavigation: (tabId: string, newUrl: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;
  destroy: () => void;
}

interface ManagedInternalConnection {
  session: WebSocketSession;
  callbacks?: WebSocketEventCallbacks;
  nativeSocket?: any;
  reconnectTimer?: any;
  isPaused: boolean;
}

/**
 * Creates an Android WebView WebSocket / Persistent Connection Boundary Manager.
 */
export function createAndroidWebViewWebSocketManager(
  config: AndroidWebViewWebSocketManagerConfig = {}
): AndroidWebViewWebSocketManager {
  // Per-tab isolation: Map<tabId, Map<connectionId, ManagedInternalConnection>>
  const tabRegistry = new Map<string, Map<string, ManagedInternalConnection>>();

  const getOrCreateTabMap = (tabId: string): Map<string, ManagedInternalConnection> => {
    let map = tabRegistry.get(tabId);
    if (!map) {
      map = new Map();
      tabRegistry.set(tabId, map);
    }
    return map;
  };

  const notifyStateChange = (managed: ManagedInternalConnection) => {
    managed.callbacks?.onStateChange?.({ ...managed.session });
    const tabConnections = getOrCreateTabMap(managed.session.tabId);
    let activeCount = 0;
    tabConnections.forEach((conn) => {
      if (conn.session.state === "open" || conn.session.state === "connecting") {
        activeCount++;
      }
    });
    config.onGlobalStateChange?.(managed.session.tabId, activeCount);
  };

  const internalCloseSocket = (
    managed: ManagedInternalConnection,
    code = 1000,
    reason = "Normal Closure",
    stopAutoReconnect = true
  ) => {
    if (stopAutoReconnect) {
      managed.session.autoReconnect = false;
      if (managed.reconnectTimer) {
        clearTimeout(managed.reconnectTimer);
        managed.reconnectTimer = null;
      }
    }

    if (
      managed.session.state === "closed" &&
      !managed.nativeSocket
    ) {
      return;
    }

    managed.session.state = "closing";
    managed.session.closeCode = code;
    managed.session.closeReason = reason;
    notifyStateChange(managed);

    try {
      if (managed.nativeSocket) {
        // Remove event handlers to avoid multiple firings
        managed.nativeSocket.onopen = null;
        managed.nativeSocket.onmessage = null;
        managed.nativeSocket.onerror = null;
        managed.nativeSocket.onclose = null;
        managed.nativeSocket.close(code, reason);
        managed.nativeSocket = null;
      }
    } catch {
      // Ignore errors when closing already closing socket
    }

    managed.session.state = "closed";
    managed.session.closedAt = Date.now();
    managed.callbacks?.onClose?.({ ...managed.session }, code, reason);
    notifyStateChange(managed);
  };

  const setupNativeSocket = (managed: ManagedInternalConnection) => {
    if (config.mockTransport || typeof WebSocket === "undefined") {
      // Running in test or simulated environment; execute deterministic connection lifecycle
      managed.session.state = "open";
      managed.session.connectedAt = Date.now();
      notifyStateChange(managed);
      managed.callbacks?.onOpen?.({ ...managed.session });
      return;
    }

    try {
      const protocols = managed.session.protocols.length > 0 ? managed.session.protocols : undefined;
      const ws = new WebSocket(managed.session.url, protocols);
      managed.nativeSocket = ws;

      ws.onopen = () => {
        managed.session.state = "open";
        managed.session.connectedAt = Date.now();
        managed.session.reconnectAttempts = 0;
        notifyStateChange(managed);
        managed.callbacks?.onOpen?.({ ...managed.session });
      };

      ws.onmessage = (event: MessageEvent) => {
        managed.session.messagesReceived++;
        managed.callbacks?.onMessage?.({ ...managed.session }, event.data);
      };

      ws.onerror = () => {
        const errMsg = "WebSocket connection error occurred";
        managed.session.lastError = errMsg;
        managed.session.state = "error";
        notifyStateChange(managed);
        managed.callbacks?.onError?.({ ...managed.session }, errMsg);
      };

      ws.onclose = (event: CloseEvent) => {
        const code = event.code || 1006;
        const reason = event.reason || "Connection closed abnormally";
        managed.session.closeCode = code;
        managed.session.closeReason = reason;
        managed.nativeSocket = null;

        // Auto-reconnect handling if configured and not cleanly closed
        if (
          managed.session.autoReconnect &&
          !managed.isPaused &&
          code !== 1000 &&
          code !== 1001 &&
          managed.session.reconnectAttempts < managed.session.maxReconnectAttempts
        ) {
          managed.session.state = "connecting";
          managed.session.reconnectAttempts++;
          notifyStateChange(managed);

          const delay = managed.session.reconnectDelayMs * Math.min(managed.session.reconnectAttempts, 5);
          managed.reconnectTimer = setTimeout(() => {
            setupNativeSocket(managed);
          }, delay);
        } else {
          managed.session.state = "closed";
          managed.session.closedAt = Date.now();
          notifyStateChange(managed);
          managed.callbacks?.onClose?.({ ...managed.session }, code, reason);
        }
      };
    } catch (err: any) {
      managed.session.state = "error";
      managed.session.lastError = err?.message || "Failed to initialize WebSocket";
      notifyStateChange(managed);
      managed.callbacks?.onError?.({ ...managed.session }, managed.session.lastError);
    }
  };

  const createConnection = (
    tabId: string,
    url: string,
    options: WebSocketConnectOptions = {},
    callbacks?: WebSocketEventCallbacks
  ) => {
    // 1. Validate URL against Android WebView security boundaries
    const validation = validateWebSocketUrl(url);
    if (!validation.isAllowed || !validation.sanitizedUrl) {
      return {
        success: false,
        error: validation.reason || "WebSocket URL failed security validation",
      };
    }

    // 2. Generate unique connection ID
    const connectionId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const protocols = options.protocols
      ? Array.isArray(options.protocols)
        ? options.protocols
        : [options.protocols]
      : [];

    const session: WebSocketSession = {
      id: connectionId,
      tabId,
      url: validation.sanitizedUrl,
      protocols,
      state: "connecting",
      createdAt: Date.now(),
      reconnectAttempts: 0,
      autoReconnect: Boolean(options.autoReconnect),
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelayMs: options.reconnectDelayMs ?? 1500,
      messagesSent: 0,
      messagesReceived: 0,
    };

    const managed: ManagedInternalConnection = {
      session,
      callbacks,
      isPaused: false,
    };

    // 3. Register under the tab's isolated namespace
    const tabMap = getOrCreateTabMap(tabId);
    tabMap.set(connectionId, managed);

    // 4. Initiate connection
    setupNativeSocket(managed);

    return {
      success: true,
      connectionId,
      session: { ...managed.session },
    };
  };

  const send = (
    tabId: string,
    connectionId: string,
    data: string | ArrayBuffer
  ) => {
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap || !tabMap.has(connectionId)) {
      return {
        success: false,
        error: "Access denied: WebSocket connection not found or does not belong to the requesting tab",
      };
    }

    const managed = tabMap.get(connectionId)!;
    if (managed.session.state !== "open") {
      return {
        success: false,
        error: `Cannot send data: WebSocket is in "${managed.session.state}" state`,
      };
    }

    try {
      if (managed.nativeSocket) {
        managed.nativeSocket.send(data);
      }
      managed.session.messagesSent++;
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Failed to send WebSocket message",
      };
    }
  };

  const close = (
    tabId: string,
    connectionId: string,
    code = 1000,
    reason = "Normal Closure"
  ) => {
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap || !tabMap.has(connectionId)) {
      return {
        success: false,
        error: "Access denied: WebSocket connection not found or does not belong to the requesting tab",
      };
    }

    const managed = tabMap.get(connectionId)!;
    internalCloseSocket(managed, code, reason, true);
    return { success: true };
  };

  const reconnect = (tabId: string, connectionId: string) => {
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap || !tabMap.has(connectionId)) {
      return {
        success: false,
        error: "Access denied: WebSocket connection not found or does not belong to the requesting tab",
      };
    }

    const managed = tabMap.get(connectionId)!;
    if (managed.session.state === "open" || managed.session.state === "connecting") {
      return {
        success: false,
        error: `Connection is already in "${managed.session.state}" state`,
      };
    }

    internalCloseSocket(managed, 1000, "Reconnecting", false);
    managed.session.state = "connecting";
    managed.isPaused = false;
    notifyStateChange(managed);
    setupNativeSocket(managed);

    return { success: true };
  };

  const getConnection = (tabId: string, connectionId: string): WebSocketSession | null => {
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap || !tabMap.has(connectionId)) {
      return null;
    }
    return { ...tabMap.get(connectionId)!.session };
  };

  const getConnectionsForTab = (tabId: string): WebSocketSession[] => {
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap) return [];
    return Array.from(tabMap.values()).map((m) => ({ ...m.session }));
  };

  const getActiveConnectionsCount = (tabId?: string): number => {
    let count = 0;
    if (tabId) {
      const tabMap = tabRegistry.get(tabId);
      if (tabMap) {
        tabMap.forEach((m) => {
          if (m.session.state === "open" || m.session.state === "connecting") {
            count++;
          }
        });
      }
    } else {
      tabRegistry.forEach((tabMap) => {
        tabMap.forEach((m) => {
          if (m.session.state === "open" || m.session.state === "connecting") {
            count++;
          }
        });
      });
    }
    return count;
  };

  const onHostPause = (tabId?: string) => {
    const pauseTab = (map: Map<string, ManagedInternalConnection>) => {
      map.forEach((managed) => {
        managed.isPaused = true;
        if (managed.reconnectTimer) {
          clearTimeout(managed.reconnectTimer);
          managed.reconnectTimer = null;
        }
        if (managed.session.state === "open" || managed.session.state === "connecting") {
          managed.session.state = "suspended";
          notifyStateChange(managed);
          try {
            if (managed.nativeSocket) {
              managed.nativeSocket.close(1000, "Host paused");
              managed.nativeSocket = null;
            }
          } catch {
            // Ignore close error on pause
          }
        }
      });
    };

    if (tabId) {
      const map = tabRegistry.get(tabId);
      if (map) pauseTab(map);
    } else {
      tabRegistry.forEach((map) => pauseTab(map));
    }
  };

  const onHostResume = (tabId?: string) => {
    const resumeTab = (map: Map<string, ManagedInternalConnection>) => {
      map.forEach((managed) => {
        if (managed.isPaused && managed.session.state === "suspended") {
          managed.isPaused = false;
          managed.session.state = "connecting";
          notifyStateChange(managed);
          setupNativeSocket(managed);
        }
      });
    };

    if (tabId) {
      const map = tabRegistry.get(tabId);
      if (map) resumeTab(map);
    } else {
      tabRegistry.forEach((map) => resumeTab(map));
    }
  };

  const onNavigation = (tabId: string, _newUrl: string) => {
    // When navigating to a new URL, all existing WebSocket connections on that tab are terminated
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap) return;

    tabMap.forEach((managed) => {
      internalCloseSocket(managed, 1001, "Page navigated away", true);
    });
    tabMap.clear();
  };

  const onStopLoading = (tabId: string) => {
    // Stop loading cancels any connecting/in-flight WebSocket negotiations on that tab
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap) return;

    tabMap.forEach((managed) => {
      if (managed.session.state === "connecting") {
        internalCloseSocket(managed, 1000, "Navigation stopped by user", true);
      }
    });
  };

  const onTabClosed = (tabId: string) => {
    // Complete tab destruction: close all connections and purge from registry
    const tabMap = tabRegistry.get(tabId);
    if (!tabMap) return;

    tabMap.forEach((managed) => {
      internalCloseSocket(managed, 1001, "Tab closed", true);
    });
    tabRegistry.delete(tabId);
  };

  const destroy = () => {
    tabRegistry.forEach((tabMap) => {
      tabMap.forEach((managed) => {
        internalCloseSocket(managed, 1001, "Manager destroyed", true);
      });
      tabMap.clear();
    });
    tabRegistry.clear();
  };

  return {
    validateUrl: validateWebSocketUrl,
    createConnection,
    send,
    close,
    reconnect,
    getConnection,
    getConnectionsForTab,
    getActiveConnectionsCount,
    onHostPause,
    onHostResume,
    onNavigation,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
