/**
 * NETFLOW Browser V2 — Android WebView JavaScript Web Notification Permission Boundary
 *
 * Form: NETFLOW-V2-NATIVE-16
 *
 * This module establishes the secure Web Notification permission boundary:
 * 1. Web Notification Permission request contract (Notification.requestPermission() / POST_NOTIFICATIONS)
 * 2. Strict HTTPS secure-origin validation with explicit localhost development exception
 * 3. User consent gating: notification permission is never granted without explicit interactive user approval
 * 4. Safe Allow / Deny / Cancel handling: returns standard "granted" | "denied" | "default" states cleanly
 * 5. Per-origin + per-tab isolation: grants are strictly partitioned by (tabId, origin); no cross-tab or cross-origin leakage
 * 6. Navigation and tab-close cleanup: pending prompts are cancelled, non-retained grants revoked on navigation
 * 7. Dangerous schemes (javascript:, file:, content:, data:, blob:) and SSRF targets strictly blocked
 * 8. Reuses NATIVE-05 evaluateRuntimePermissionRequest ("android.permission.POST_NOTIFICATIONS")
 * 9. Privileged native JS bridge invariant: pure safe boundary abstraction without native reflection or unvetted bridges
 */

import { evaluateRuntimePermissionRequest } from "./androidSecurityPolicy";

export type WebNotificationPermission = "default" | "granted" | "denied";

export interface AndroidNotificationRequest {
  requestId: string;
  tabId: string;
  origin: string;
  createdAt: number;
  status: "pending" | "granted" | "denied" | "cancelled";
  callback?: (permission: WebNotificationPermission) => void;
}

export interface AndroidNotificationGrant {
  tabId: string;
  origin: string;
  grantedAt: number;
  retain: boolean;
}

export interface AndroidNotificationDecision {
  requestId: string;
  origin: string;
  permission: WebNotificationPermission;
  retain: boolean;
  reason?: string;
}

export interface NotificationConsentPrompt {
  requestId: string;
  tabId: string;
  origin: string;
  isSecure: boolean;
  isLocalhost: boolean;
}

/**
 * Validates whether an origin is secure and eligible for Web Notification requests.
 * Conforms to W3C / Android WebChromeClient secure context standards:
 * - Only HTTPS origins or localhost development exceptions are valid
 * - javascript:, file:, content:, data:, and blob: schemes are strictly blocked
 * - Insecure plain HTTP over network is rejected
 * - SSRF / private networks / cloud metadata addresses are rejected
 */
export function validateNotificationOrigin(origin: string): {
  isSecure: boolean;
  isLocalhost: boolean;
  sanitizedOrigin?: string;
  reason?: string;
} {
  if (!origin || typeof origin !== "string") {
    return { isSecure: false, isLocalhost: false, reason: "Origin is empty or invalid" };
  }

  const trimmed = origin.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous or insecure schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  ) {
    return {
      isSecure: false,
      isLocalhost: false,
      reason: "Dangerous or unsupported origin scheme blocked for web notifications",
    };
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";

    // 2. Allow localhost development exception (http or https)
    if (isLocalhost) {
      return {
        isSecure: true,
        isLocalhost: true,
        sanitizedOrigin: `${url.protocol}//${url.host}`,
      };
    }

    // 3. Strict HTTPS requirement for all external origins
    if (url.protocol !== "https:") {
      return {
        isSecure: false,
        isLocalhost: false,
        reason: "Web Notifications require a secure HTTPS origin context",
      };
    }

    // 4. Block SSRF / Private network addresses on external requests
    if (
      host === "0.0.0.0" ||
      host === "169.254.169.254" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return {
        isSecure: false,
        isLocalhost: false,
        reason: "Web Notifications blocked on private network or cloud metadata address",
      };
    }

    return {
      isSecure: true,
      isLocalhost: false,
      sanitizedOrigin: `${url.protocol}//${url.host}`,
    };
  } catch {
    return { isSecure: false, isLocalhost: false, reason: "Malformed origin URL" };
  }
}

export interface AndroidWebViewNotificationManagerConfig {
  onPromptStateChange?: (prompt: NotificationConsentPrompt | null) => void;
}

export interface AndroidWebViewNotificationManager {
  /**
   * Initiates a notification permission request
   */
  requestPermission: (
    origin: string,
    tabId: string,
    callback?: (permission: WebNotificationPermission) => void
  ) => { success: boolean; requestId?: string; permission?: WebNotificationPermission; reason?: string };

  /**
   * Retrieves current permission status for a given tab & origin
   */
  getPermissionState: (origin: string, tabId: string) => WebNotificationPermission;

  /**
   * User decision handler (Allow / Deny with optional retain preference)
   */
  decidePermission: (
    requestId: string,
    userConsented: boolean,
    retain?: boolean
  ) => AndroidNotificationDecision;

  /**
   * User cancel / dialog dismiss handler (returns 'default' state cleanly)
   */
  dismissOrCancelPermission: (requestId: string, reason?: string) => AndroidNotificationDecision;

  /**
   * Navigation lifecycle hook: cleans up pending prompts and revokes non-retained grants
   */
  onNavigation: (tabId: string, newUrl: string) => void;

  /**
   * Tab close lifecycle hook: wipes all pending requests and active grants for this tab
   */
  onTabClosed: (tabId: string) => void;

  /**
   * Returns current active prompt if any
   */
  getActivePrompt: () => NotificationConsentPrompt | null;

  destroy: () => void;
}

/**
 * Factory for the Android WebView Web Notification Permission Boundary
 */
export function createAndroidWebViewNotificationManager(
  config: AndroidWebViewNotificationManagerConfig = {}
): AndroidWebViewNotificationManager {
  // pendingRequests: Map<requestId, AndroidNotificationRequest>
  const pendingRequests = new Map<string, AndroidNotificationRequest>();

  // activeGrants: Map<tabId, Map<origin, AndroidNotificationGrant>>
  const tabGrants = new Map<string, Map<string, AndroidNotificationGrant>>();

  let activePrompt: NotificationConsentPrompt | null = null;

  const setActivePrompt = (prompt: NotificationConsentPrompt | null) => {
    activePrompt = prompt;
    config.onPromptStateChange?.(prompt);
  };

  const getPermissionState = (origin: string, tabId: string): WebNotificationPermission => {
    const originCheck = validateNotificationOrigin(origin);
    if (!originCheck.isSecure || !originCheck.sanitizedOrigin) {
      return "denied";
    }

    const grants = tabGrants.get(tabId);
    if (!grants) return "default";

    if (grants.has(originCheck.sanitizedOrigin)) {
      return "granted";
    }

    return "default";
  };

  const requestPermission = (
    origin: string,
    tabId: string,
    callback?: (permission: WebNotificationPermission) => void
  ): { success: boolean; requestId?: string; permission?: WebNotificationPermission; reason?: string } => {
    // 1. Origin Security Validation
    const originCheck = validateNotificationOrigin(origin);
    if (!originCheck.isSecure || !originCheck.sanitizedOrigin) {
      callback?.("denied");
      return {
        success: false,
        permission: "denied",
        reason: originCheck.reason || "Insecure origin context",
      };
    }

    const sanitizedOrigin = originCheck.sanitizedOrigin;

    // 2. Check if already granted for this tab & origin
    if (getPermissionState(sanitizedOrigin, tabId) === "granted") {
      callback?.("granted");
      return {
        success: true,
        permission: "granted",
      };
    }

    // 3. Register pending consent request
    const requestId = `notif_${tabId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const request: AndroidNotificationRequest = {
      requestId,
      tabId,
      origin: sanitizedOrigin,
      createdAt: Date.now(),
      status: "pending",
      callback,
    };

    pendingRequests.set(requestId, request);

    // Set UI prompt
    setActivePrompt({
      requestId,
      tabId,
      origin: sanitizedOrigin,
      isSecure: originCheck.isSecure,
      isLocalhost: originCheck.isLocalhost,
    });

    return {
      success: true,
      requestId,
      permission: "default",
    };
  };

  const decidePermission = (
    requestId: string,
    userConsented: boolean,
    retain = false
  ): AndroidNotificationDecision => {
    const req = pendingRequests.get(requestId);
    if (!req) {
      return {
        requestId,
        origin: "",
        permission: "default",
        retain: false,
        reason: "Request not found or already handled",
      };
    }

    pendingRequests.delete(requestId);
    if (activePrompt?.requestId === requestId) {
      setActivePrompt(null);
    }

    // 1. User denied consent
    if (!userConsented) {
      req.status = "denied";
      req.callback?.("denied");
      return {
        requestId,
        origin: req.origin,
        permission: "denied",
        retain: false,
        reason: "User denied notification permission",
      };
    }

    // 2. Evaluate against NATIVE-05 Android Security Policy for POST_NOTIFICATIONS
    const policyEvaluation = evaluateRuntimePermissionRequest(
      "android.permission.POST_NOTIFICATIONS",
      userConsented
    );

    if (!policyEvaluation.granted) {
      req.status = "denied";
      req.callback?.("denied");
      return {
        requestId,
        origin: req.origin,
        permission: "denied",
        retain: false,
        reason: policyEvaluation.reason,
      };
    }

    // 3. Grant permission for this specific tab and origin
    req.status = "granted";
    let grants = tabGrants.get(req.tabId);
    if (!grants) {
      grants = new Map<string, AndroidNotificationGrant>();
      tabGrants.set(req.tabId, grants);
    }

    grants.set(req.origin, {
      tabId: req.tabId,
      origin: req.origin,
      grantedAt: Date.now(),
      retain,
    });

    req.callback?.("granted");

    return {
      requestId,
      origin: req.origin,
      permission: "granted",
      retain,
    };
  };

  const dismissOrCancelPermission = (
    requestId: string,
    reason = "Dismissed by user without decision"
  ): AndroidNotificationDecision => {
    const req = pendingRequests.get(requestId);
    if (!req) {
      return {
        requestId,
        origin: "",
        permission: "default",
        retain: false,
        reason: "Request not found",
      };
    }

    pendingRequests.delete(requestId);
    if (activePrompt?.requestId === requestId) {
      setActivePrompt(null);
    }

    req.status = "cancelled";
    // W3C spec: dismissing prompt leaves state in "default"
    req.callback?.("default");

    return {
      requestId,
      origin: req.origin,
      permission: "default",
      retain: false,
      reason,
    };
  };

  const onNavigation = (tabId: string, newUrl: string): void => {
    // 1. Cancel pending prompts on this tab
    const toCancel: string[] = [];
    pendingRequests.forEach((req, reqId) => {
      if (req.tabId === tabId) {
        toCancel.push(reqId);
      }
    });

    toCancel.forEach((reqId) => {
      dismissOrCancelPermission(reqId, "Navigation occurred before user consent decision");
    });

    if (activePrompt?.tabId === tabId) {
      setActivePrompt(null);
    }

    // 2. Revoke non-retained grants for this tab if navigating to a different origin
    const grants = tabGrants.get(tabId);
    if (grants) {
      const newOriginCheck = validateNotificationOrigin(newUrl);
      const newOrigin = newOriginCheck.sanitizedOrigin || "";

      const keysToDelete: string[] = [];
      grants.forEach((grant, origin) => {
        // Revoke if not retained and navigating to a different origin
        if (!grant.retain && origin !== newOrigin) {
          keysToDelete.push(origin);
        }
      });
      keysToDelete.forEach((key) => grants.delete(key));
    }
  };

  const onTabClosed = (tabId: string): void => {
    // 1. Cancel all pending requests for this tab
    const toCancel: string[] = [];
    pendingRequests.forEach((req, reqId) => {
      if (req.tabId === tabId) {
        toCancel.push(reqId);
      }
    });
    toCancel.forEach((reqId) => {
      dismissOrCancelPermission(reqId, "Tab closed");
    });

    // 2. Clear prompt if it belonged to this tab
    if (activePrompt?.tabId === tabId) {
      setActivePrompt(null);
    }

    // 3. Clear all grants for this tab
    tabGrants.delete(tabId);
  };

  const getActivePrompt = (): NotificationConsentPrompt | null => {
    return activePrompt;
  };

  const destroy = (): void => {
    pendingRequests.forEach((req) => {
      req.callback?.("default");
    });
    pendingRequests.clear();
    tabGrants.clear();
    setActivePrompt(null);
  };

  return {
    requestPermission,
    getPermissionState,
    decidePermission,
    dismissOrCancelPermission,
    onNavigation,
    onTabClosed,
    getActivePrompt,
    destroy,
  };
}
