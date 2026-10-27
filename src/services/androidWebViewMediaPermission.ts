/**
 * NETFLOW Browser V2 — Android WebView Secure Media Permission Boundary
 *
 * Form: NETFLOW-V2-NATIVE-11
 *
 * This module establishes the secure Camera & Microphone permission layer:
 * 1. WebChromeClient.onPermissionRequest handling
 * 2. Distinct resource identification (RESOURCE_VIDEO_CAPTURE, RESOURCE_AUDIO_CAPTURE)
 * 3. Strict requesting origin validation (HTTPS / secure origin requirement)
 * 4. User consent gating: no grant without explicit user consent
 * 5. Safe deny/cancel handling (calling deny/cancel callbacks cleanly)
 * 6. Tab & Origin isolation (grants scoped to origin + tab, revoked on navigation)
 * 7. NATIVE-05 permission policy integration
 * 8. Zero interference with navigation, file chooser, or download systems.
 */

import { evaluateRuntimePermissionRequest } from "./androidSecurityPolicy";

export enum AndroidMediaResource {
  VIDEO_CAPTURE = "android.webkit.resource.VIDEO_CAPTURE",
  AUDIO_CAPTURE = "android.webkit.resource.AUDIO_CAPTURE",
  PROTECTED_MEDIA_ID = "android.webkit.resource.PROTECTED_MEDIA_ID",
}

export interface AndroidPermissionRequest {
  requestId: string;
  tabId: string;
  origin: string;
  resources: AndroidMediaResource[];
  createdAt: number;
}

export interface AndroidPermissionDecision {
  requestId: string;
  granted: boolean;
  grantedResources: AndroidMediaResource[];
  reason?: string;
}

export interface AndroidMediaPermissionState {
  tabId: string;
  origin: string;
  hasCameraGrant: boolean;
  hasMicrophoneGrant: boolean;
  grantedAt: number;
}

/**
 * Validates whether an origin is secure and authorized for media capture requests.
 */
export function validateMediaRequestOrigin(origin: string): { isSecure: boolean; reason?: string } {
  if (!origin || typeof origin !== "string") {
    return { isSecure: false, reason: "Origin is empty or invalid" };
  }

  const trimmed = origin.trim().toLowerCase();

  // Insecure or dangerous schemes blocked
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:") ||
    trimmed.startsWith("data:")
  ) {
    return { isSecure: false, reason: "Insecure or dangerous scheme" };
  }

  // Must be HTTPS or localhost
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return { isSecure: true };
    }
    return { isSecure: false, reason: "Media access requires secure HTTPS origin" };
  } catch {
    return { isSecure: false, reason: "Invalid origin URL" };
  }
}

export interface AndroidWebViewMediaPermissionManager {
  tabId: string;
  currentOrigin: string;
  pendingRequests: Map<string, AndroidPermissionRequest>;
  activeGrants: Map<string, AndroidMediaPermissionState>;
  requestPermissions: (origin: string, resources: AndroidMediaResource[]) => AndroidPermissionRequest;
  decidePermission: (
    requestId: string,
    userConsented: boolean,
    cameraConsent?: boolean,
    micConsent?: boolean
  ) => AndroidPermissionDecision;
  denyPermission: (requestId: string, reason?: string) => AndroidPermissionDecision;
  onNavigation: (newOrigin: string) => void;
  destroy: () => void;
}

/**
 * Creates an Android WebView Media Permission Manager for a specific tab
 */
export function createAndroidWebViewMediaPermissionManager(tabId: string): AndroidWebViewMediaPermissionManager {
  let currentOrigin = "";
  const pendingRequests = new Map<string, AndroidPermissionRequest>();
  const activeGrants = new Map<string, AndroidMediaPermissionState>();

  const requestPermissions = (origin: string, resources: AndroidMediaResource[]): AndroidPermissionRequest => {
    const requestId = `perm_${tabId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const req: AndroidPermissionRequest = {
      requestId,
      tabId,
      origin: origin.trim(),
      resources: [...resources],
      createdAt: Date.now(),
    };
    pendingRequests.set(requestId, req);
    return req;
  };

  const denyPermission = (requestId: string, reason = "User denied or cancelled"): AndroidPermissionDecision => {
    const req = pendingRequests.get(requestId);
    if (!req) {
      return { requestId, granted: false, grantedResources: [], reason: "Request not found" };
    }
    pendingRequests.delete(requestId);
    return {
      requestId,
      granted: false,
      grantedResources: [],
      reason,
    };
  };

  const decidePermission = (
    requestId: string,
    userConsented: boolean,
    cameraConsent = false,
    micConsent = false
  ): AndroidPermissionDecision => {
    const req = pendingRequests.get(requestId);
    if (!req) {
      return { requestId, granted: false, grantedResources: [], reason: "Request not found" };
    }
    pendingRequests.delete(requestId);

    // 1. If overall user consent was not given, deny
    if (!userConsented) {
      return { requestId, granted: false, grantedResources: [], reason: "User cancelled or denied consent" };
    }

    // 2. Validate Origin Security
    const originCheck = validateMediaRequestOrigin(req.origin);
    if (!originCheck.isSecure) {
      return {
        requestId,
        granted: false,
        grantedResources: [],
        reason: `Origin security validation failed: ${originCheck.reason}`,
      };
    }

    // 3. Process individual resources against NATIVE-05 policy
    const grantedResources: AndroidMediaResource[] = [];

    for (const res of req.resources) {
      if (res === AndroidMediaResource.VIDEO_CAPTURE) {
        const camEval = evaluateRuntimePermissionRequest("android.permission.CAMERA", cameraConsent);
        if (camEval.granted) {
          grantedResources.push(AndroidMediaResource.VIDEO_CAPTURE);
        }
      } else if (res === AndroidMediaResource.AUDIO_CAPTURE) {
        const micEval = evaluateRuntimePermissionRequest("android.permission.RECORD_AUDIO", micConsent);
        if (micEval.granted) {
          grantedResources.push(AndroidMediaResource.AUDIO_CAPTURE);
        }
      }
    }

    if (grantedResources.length === 0) {
      return {
        requestId,
        granted: false,
        grantedResources: [],
        reason: "No requested resources were granted consent",
      };
    }

    // Record active grant for this origin & tab
    activeGrants.set(req.origin, {
      tabId,
      origin: req.origin,
      hasCameraGrant: grantedResources.includes(AndroidMediaResource.VIDEO_CAPTURE),
      hasMicrophoneGrant: grantedResources.includes(AndroidMediaResource.AUDIO_CAPTURE),
      grantedAt: Date.now(),
    });

    return {
      requestId,
      granted: true,
      grantedResources,
    };
  };

  const onNavigation = (newOrigin: string): void => {
    currentOrigin = newOrigin.trim();
    // Invalidate pending requests and revoke grants on origin change
    pendingRequests.clear();
    activeGrants.clear();
  };

  const destroy = (): void => {
    pendingRequests.clear();
    activeGrants.clear();
  };

  return {
    get tabId() { return tabId; },
    get currentOrigin() { return currentOrigin; },
    pendingRequests,
    activeGrants,
    requestPermissions,
    decidePermission,
    denyPermission,
    onNavigation,
    destroy,
  };
}
