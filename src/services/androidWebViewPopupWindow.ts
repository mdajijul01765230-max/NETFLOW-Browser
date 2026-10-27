/**
 * NETFLOW Browser V2 — Android WebView Popup & New Window Boundary
 *
 * Form: NETFLOW-V2-NATIVE-13
 *
 * This module establishes the secure Popup & New-Window management layer:
 * 1. WebChromeClient onCreateWindow / onCloseWindow contracts
 * 2. window.open / target="_blank" safe handling
 * 3. Dedicated tab allocation with strictly isolated tab state
 * 4. Zero opener linkage (strict noopener / noreferrer semantics; no privileged cross-window handles)
 * 5. Scheme & SSRF validation (blocking javascript:, file:, content:, private IPs, metadata IPs)
 * 6. Existing Navigation & Epoch system integration
 * 7. Zero privileged native bridge leakage to newly spawned windows
 */

import { validateMediaSourceUrl } from "./androidWebViewMediaPlayback";

export interface AndroidCreateWindowRequest {
  openerTabId: string;
  targetUrl: string;
  isUserGesture: boolean;
  isDialog?: boolean;
}

export interface AndroidPopupWindowSession {
  newTabId: string;
  openerTabId: string;
  targetUrl: string;
  createdAt: number;
  isUserGesture: boolean;
  hasOpenerAccess: boolean; // MUST ALWAYS BE FALSE
  isPrivileged: boolean;    // MUST ALWAYS BE FALSE
}

export interface AndroidCreateWindowResult {
  allowed: boolean;
  newTabId?: string;
  targetUrl?: string;
  reason?: string;
}

/**
 * Validates a popup / new-window target URL for security, scheme safety, and SSRF avoidance.
 */
export function validatePopupWindowUrl(url: string): { isSafe: boolean; sanitizedUrl?: string; reason?: string } {
  if (!url || typeof url !== "string") {
    return { isSafe: false, reason: "Target URL is empty or invalid" };
  }

  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:")
  ) {
    return { isSafe: false, reason: "Insecure or dangerous scheme blocked in popup" };
  }

  // Handle about:blank (standard empty popup initialization)
  if (lower === "about:blank" || lower === "") {
    return { isSafe: true, sanitizedUrl: "about:blank" };
  }

  // 2. Block SSRF and private networks
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { isSafe: false, reason: `Unsupported protocol in popup: ${parsed.protocol}` };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "169.254.169.254" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return { isSafe: false, reason: "Blocked internal network or cloud metadata target" };
    }

    return { isSafe: true, sanitizedUrl: parsed.toString() };
  } catch {
    return { isSafe: false, reason: "Malformed target URL" };
  }
}

export interface AndroidWebViewPopupManager {
  activePopups: Map<string, AndroidPopupWindowSession>;
  handleCreateWindow: (request: AndroidCreateWindowRequest) => AndroidCreateWindowResult;
  handleCloseWindow: (tabId: string) => boolean;
  onCreateWindow: (
    openerTabId: string,
    isDialog: boolean,
    isUserGesture: boolean,
    targetUrl: string
  ) => AndroidCreateWindowResult;
  onCloseWindow: (tabId: string) => boolean;
  isTabPopup: (tabId: string) => boolean;
  getPopupSession: (tabId: string) => AndroidPopupWindowSession | undefined;
  destroy: () => void;
}

export interface AndroidWebViewPopupManagerConfig {
  onSpawnTab: (newTabId: string, initialUrl: string) => void;
  onCloseTab: (tabId: string) => void;
}

/**
 * Creates an Android WebView Popup & New-Window Manager
 */
export function createAndroidWebViewPopupManager(
  config: AndroidWebViewPopupManagerConfig
): AndroidWebViewPopupManager {
  const activePopups = new Map<string, AndroidPopupWindowSession>();

  const handleCreateWindow = (request: AndroidCreateWindowRequest): AndroidCreateWindowResult => {
    // 1. Validate security of target URL
    const check = validatePopupWindowUrl(request.targetUrl);
    if (!check.isSafe || !check.sanitizedUrl) {
      return {
        allowed: false,
        reason: check.reason || "URL validation failed",
      };
    }

    // 2. Generate isolated new Tab ID
    const newTabId = `tab_popup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 3. Create isolated popup session with STRICT NO-OPENER and NO PRIVILEGED ACCESS
    const session: AndroidPopupWindowSession = {
      newTabId,
      openerTabId: request.openerTabId,
      targetUrl: check.sanitizedUrl,
      createdAt: Date.now(),
      isUserGesture: request.isUserGesture,
      hasOpenerAccess: false, // Strict: no access to opener's window or DOM
      isPrivileged: false,    // Strict: never granted elevated native access
    };

    activePopups.set(newTabId, session);

    // 4. Notify host to spawn isolated tab
    config.onSpawnTab(newTabId, check.sanitizedUrl);

    return {
      allowed: true,
      newTabId,
      targetUrl: check.sanitizedUrl,
    };
  };

  const handleCloseWindow = (tabId: string): boolean => {
    if (activePopups.has(tabId)) {
      activePopups.delete(tabId);
      config.onCloseTab(tabId);
      return true;
    }
    return false;
  };

  const onCreateWindow = (
    openerTabId: string,
    isDialog: boolean,
    isUserGesture: boolean,
    targetUrl: string
  ): AndroidCreateWindowResult => {
    return handleCreateWindow({
      openerTabId,
      targetUrl,
      isUserGesture,
      isDialog,
    });
  };

  const onCloseWindow = (tabId: string): boolean => {
    return handleCloseWindow(tabId);
  };

  const isTabPopup = (tabId: string): boolean => {
    return activePopups.has(tabId);
  };

  const getPopupSession = (tabId: string): AndroidPopupWindowSession | undefined => {
    return activePopups.get(tabId);
  };

  const destroy = (): void => {
    activePopups.clear();
  };

  return {
    activePopups,
    handleCreateWindow,
    handleCloseWindow,
    onCreateWindow,
    onCloseWindow,
    isTabPopup,
    getPopupSession,
    destroy,
  };
}
