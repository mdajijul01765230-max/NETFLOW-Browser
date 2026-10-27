/**
 * NETFLOW Browser V2 — Android WebView JavaScript Geolocation Permission Boundary
 *
 * Form: NETFLOW-V2-NATIVE-15
 *
 * This module establishes the secure WebChromeClient Geolocation Permission boundary:
 * 1. WebChromeClient.onGeolocationPermissionsShowPrompt & onGeolocationPermissionsHidePrompt contracts
 * 2. Strict HTTPS secure-origin validation with explicit localhost development exception
 * 3. User consent gating: location permission is never granted without explicit interactive user approval
 * 4. Safe DENY/CANCEL handling: cleanly invokes GeolocationPermissions.Callback with allow: false
 * 5. Per-origin + per-tab isolation: grants are scoped to (tabId, origin) pairs; no cross-origin or cross-tab leakage
 * 6. Navigation and tab-close cleanup: pending prompts are cancelled, non-retained grants revoked on navigation
 * 7. Dangerous schemes (javascript:, file:, content:, data:, blob:) and SSRF targets strictly blocked
 * 8. Reuses NATIVE-05 evaluateRuntimePermissionRequest policy
 * 9. Privileged native JS bridge invariant: no unsafe reflection or unvetted native bridges exposed
 */

import { evaluateRuntimePermissionRequest } from "./androidSecurityPolicy";

export interface GeolocationPermissionsCallback {
  invoke: (origin: string, allow: boolean, retain: boolean) => void;
}

export interface AndroidGeolocationRequest {
  requestId: string;
  tabId: string;
  origin: string;
  createdAt: number;
  status: "pending" | "granted" | "denied" | "cancelled";
  callback?: GeolocationPermissionsCallback;
}

export interface AndroidGeolocationGrant {
  tabId: string;
  origin: string;
  grantedAt: number;
  retain: boolean;
}

export interface AndroidGeolocationDecision {
  requestId: string;
  origin: string;
  allow: boolean;
  retain: boolean;
  reason?: string;
}

export interface GeolocationConsentPrompt {
  requestId: string;
  tabId: string;
  origin: string;
  isSecure: boolean;
  isLocalhost: boolean;
}

/**
 * Validates whether an origin is secure and authorized for Geolocation requests.
 * Conforms to W3C / Android WebChromeClient secure context requirements:
 * - Only HTTPS origins or localhost development exceptions are valid
 * - javascript:, file:, content:, and data: schemes are strictly blocked
 * - Insecure plain HTTP over public networks is rejected
 */
export function validateGeolocationOrigin(origin: string): {
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
      reason: "Dangerous or unsupported origin scheme blocked for geolocation",
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
        reason: "Geolocation requires a secure HTTPS origin context",
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
        reason: "Geolocation blocked on private network or cloud metadata address",
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

export interface AndroidWebViewGeolocationManagerConfig {
  onPromptStateChange?: (prompt: GeolocationConsentPrompt | null) => void;
}

export interface AndroidWebViewGeolocationManager {
  /**
   * WebChromeClient onGeolocationPermissionsShowPrompt equivalent
   */
  onGeolocationPermissionsShowPrompt: (
    origin: string,
    callback: GeolocationPermissionsCallback,
    tabId: string
  ) => { success: boolean; requestId?: string; reason?: string };

  /**
   * WebChromeClient onGeolocationPermissionsHidePrompt equivalent
   */
  onGeolocationPermissionsHidePrompt: (tabId?: string) => void;

  /**
   * User interaction decision (Allow / Deny with retain preference)
   */
  decidePermission: (
    requestId: string,
    userConsented: boolean,
    retain?: boolean
  ) => AndroidGeolocationDecision;

  /**
   * Safe Deny or Cancel handler
   */
  denyOrCancelPermission: (requestId: string, reason?: string) => AndroidGeolocationDecision;

  /**
   * Checks if an origin has an active grant on this tab
   */
  hasActiveGrant: (tabId: string, origin: string) => boolean;

  /**
   * Navigation handler to cancel pending prompts and revoke non-retained grants
   */
  onNavigation: (tabId: string, newUrl: string) => void;

  /**
   * Tab closed cleanup handler
   */
  onTabClosed: (tabId: string) => void;

  /**
   * Returns current active prompt if any
   */
  getActivePrompt: () => GeolocationConsentPrompt | null;

  destroy: () => void;
}

/**
 * Creates the Android WebView Geolocation Permission Manager
 */
export function createAndroidWebViewGeolocationManager(
  config: AndroidWebViewGeolocationManagerConfig = {}
): AndroidWebViewGeolocationManager {
  // pendingRequests: Map<requestId, AndroidGeolocationRequest>
  const pendingRequests = new Map<string, AndroidGeolocationRequest>();

  // activeGrants: Map<tabId, Map<origin, AndroidGeolocationGrant>>
  const tabGrants = new Map<string, Map<string, AndroidGeolocationGrant>>();

  let activePrompt: GeolocationConsentPrompt | null = null;

  const setActivePrompt = (prompt: GeolocationConsentPrompt | null) => {
    activePrompt = prompt;
    config.onPromptStateChange?.(prompt);
  };

  const hasActiveGrant = (tabId: string, origin: string): boolean => {
    const originCheck = validateGeolocationOrigin(origin);
    if (!originCheck.isSecure || !originCheck.sanitizedOrigin) return false;

    const grants = tabGrants.get(tabId);
    if (!grants) return false;

    return grants.has(originCheck.sanitizedOrigin);
  };

  const onGeolocationPermissionsShowPrompt = (
    origin: string,
    callback: GeolocationPermissionsCallback,
    tabId: string
  ): { success: boolean; requestId?: string; reason?: string } => {
    // 1. Validate Origin Security
    const originCheck = validateGeolocationOrigin(origin);
    if (!originCheck.isSecure || !originCheck.sanitizedOrigin) {
      // Immediate rejection of insecure origin
      callback.invoke(origin, false, false);
      return {
        success: false,
        reason: originCheck.reason || "Insecure origin",
      };
    }

    const sanitizedOrigin = originCheck.sanitizedOrigin;

    // 2. Check if already granted for this tab & origin
    if (hasActiveGrant(tabId, sanitizedOrigin)) {
      callback.invoke(sanitizedOrigin, true, true);
      return { success: true };
    }

    // 3. Create pending permission request
    const requestId = `geo_${tabId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const request: AndroidGeolocationRequest = {
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

    return { success: true, requestId };
  };

  const onGeolocationPermissionsHidePrompt = (tabId?: string): void => {
    if (activePrompt && (!tabId || activePrompt.tabId === tabId)) {
      setActivePrompt(null);
    }
  };

  const decidePermission = (
    requestId: string,
    userConsented: boolean,
    retain = false
  ): AndroidGeolocationDecision => {
    const req = pendingRequests.get(requestId);
    if (!req) {
      return {
        requestId,
        origin: "",
        allow: false,
        retain: false,
        reason: "Request not found or already handled",
      };
    }

    pendingRequests.delete(requestId);
    if (activePrompt?.requestId === requestId) {
      setActivePrompt(null);
    }

    // 1. If user did not consent, deny safely
    if (!userConsented) {
      req.status = "denied";
      req.callback?.invoke(req.origin, false, false);
      return {
        requestId,
        origin: req.origin,
        allow: false,
        retain: false,
        reason: "User denied geolocation permission",
      };
    }

    // 2. Evaluate against NATIVE-05 Android Security Policy
    const policyEvaluation = evaluateRuntimePermissionRequest(
      "android.permission.ACCESS_FINE_LOCATION",
      userConsented
    );

    if (!policyEvaluation.granted) {
      req.status = "denied";
      req.callback?.invoke(req.origin, false, false);
      return {
        requestId,
        origin: req.origin,
        allow: false,
        retain: false,
        reason: policyEvaluation.reason,
      };
    }

    // 3. Grant permission for this specific tab and origin
    req.status = "granted";
    let grants = tabGrants.get(req.tabId);
    if (!grants) {
      grants = new Map<string, AndroidGeolocationGrant>();
      tabGrants.set(req.tabId, grants);
    }

    grants.set(req.origin, {
      tabId: req.tabId,
      origin: req.origin,
      grantedAt: Date.now(),
      retain,
    });

    req.callback?.invoke(req.origin, true, retain);

    return {
      requestId,
      origin: req.origin,
      allow: true,
      retain,
    };
  };

  const denyOrCancelPermission = (
    requestId: string,
    reason = "Cancelled by user"
  ): AndroidGeolocationDecision => {
    const req = pendingRequests.get(requestId);
    if (!req) {
      return {
        requestId,
        origin: "",
        allow: false,
        retain: false,
        reason: "Request not found",
      };
    }

    pendingRequests.delete(requestId);
    if (activePrompt?.requestId === requestId) {
      setActivePrompt(null);
    }

    req.status = "cancelled";
    req.callback?.invoke(req.origin, false, false);

    return {
      requestId,
      origin: req.origin,
      allow: false,
      retain: false,
      reason,
    };
  };

  const onNavigation = (tabId: string, newUrl: string): void => {
    // 1. Cancel any pending prompts for this tab
    const toCancel: string[] = [];
    pendingRequests.forEach((req, reqId) => {
      if (req.tabId === tabId) {
        toCancel.push(reqId);
      }
    });

    toCancel.forEach((reqId) => {
      denyOrCancelPermission(reqId, "Navigation occurred before user consent decision");
    });

    if (activePrompt?.tabId === tabId) {
      setActivePrompt(null);
    }

    // 2. Revoke non-retained grants for this tab when navigating away
    const grants = tabGrants.get(tabId);
    if (grants) {
      const newOriginCheck = validateGeolocationOrigin(newUrl);
      const newOrigin = newOriginCheck.sanitizedOrigin || "";

      const keysToDelete: string[] = [];
      grants.forEach((grant, origin) => {
        // Revoke if not explicitly retained or if navigating to a different origin
        if (!grant.retain || origin !== newOrigin) {
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
      denyOrCancelPermission(reqId, "Tab closed");
    });

    // 2. Clear prompt if it belonged to this tab
    if (activePrompt?.tabId === tabId) {
      setActivePrompt(null);
    }

    // 3. Clear all grants for this tab
    tabGrants.delete(tabId);
  };

  const getActivePrompt = (): GeolocationConsentPrompt | null => {
    return activePrompt;
  };

  const destroy = (): void => {
    pendingRequests.forEach((req) => {
      req.callback?.invoke(req.origin, false, false);
    });
    pendingRequests.clear();
    tabGrants.clear();
    setActivePrompt(null);
  };

  return {
    onGeolocationPermissionsShowPrompt,
    onGeolocationPermissionsHidePrompt,
    decidePermission,
    denyOrCancelPermission,
    hasActiveGrant,
    onNavigation,
    onTabClosed,
    getActivePrompt,
    destroy,
  };
}
