/**
 * NETFLOW Browser V2 — Google Sign-In & OAuth Safe External-Browser Fallback Policy
 *
 * MISSION & PRINCIPLES:
 * 1. Safe Fallback Path: In NETFLOW's proxy/sanitized rendering mode, client-side
 *    JavaScript execution is strictly controlled or stripped to protect users from
 *    cross-site tracking and malicious scripts.
 * 2. Dynamic Authentication Protection: Google Sign-In and OAuth 2.0 flows require
 *    active JavaScript runtime challenges, WebAuthn/FIDO passkeys, Google Identity
 *    Services (GIS), and direct first-party cookie/session continuity.
 * 3. Zero Credential Leakage: User credentials, tokens, or session handshakes must
 *    NEVER pass through or get trapped in intermediate proxy layers.
 * 4. Controlled Fallback: When a Google Sign-In or OAuth flow is identified,
 *    NETFLOW intercepts the navigation, notifies the user via a clear prompt,
 *    and safely dispatches the authentication request to the system's external browser
 *    (or native Android browser intent) using secure "noopener,noreferrer" isolation.
 */

import { detectAndroidWebViewEnvironment } from "./androidWebViewFoundation";

/**
 * Metadata contract for a Google Auth Fallback prompt
 */
export interface GoogleAuthFallbackPrompt {
  id: string;
  tabId: string;
  targetUrl: string;
  sourceDomain: string;
  serviceName: "Google Sign-In" | "Google Accounts" | "Google OAuth 2.0" | "Google Authentication";
  reason: string;
  timestamp: number;
}

/**
 * Result returned after launching the external browser
 */
export interface GoogleAuthLaunchResult {
  success: boolean;
  method: "native_bridge" | "window_open" | "anchor_dispatch" | "failed";
  error?: string;
}

/**
 * Known hostnames and domain patterns dedicated to Google Authentication & OAuth
 */
const GOOGLE_AUTH_HOSTNAMES = new Set([
  "accounts.google.com",
  "accounts.google.co.uk",
  "accounts.google.ca",
  "accounts.youtube.com",
  "oauth2.googleapis.com",
]);

/**
 * Recognizes if a given URL is a Google Sign-In, Google Accounts, or Google OAuth flow.
 *
 * Evaluates:
 * 1. Dedicated Google Auth hostnames (e.g. accounts.google.com, oauth2.googleapis.com)
 * 2. Sign-in and OAuth endpoints on Google domains (/signin, /o/oauth2, /ServiceLogin, etc.)
 * 3. OAuth client initiation URLs with Google endpoints in redirect or auth params
 */
export function isGoogleAuthOrOAuthUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  // Quick prefix check
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:")
  ) {
    return false;
  }

  try {
    const candidate =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const urlObj = new URL(candidate);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // 1. Direct match on known Google Accounts & OAuth hostnames
    if (GOOGLE_AUTH_HOSTNAMES.has(hostname)) {
      return true;
    }

    // 2. Subdomains of google.com with authentication paths
    if (
      hostname === "google.com" ||
      hostname.endsWith(".google.com") ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com")
    ) {
      if (
        pathname.startsWith("/signin") ||
        pathname.startsWith("/servicelogin") ||
        pathname.startsWith("/accountchooser") ||
        pathname.startsWith("/interactive_login") ||
        pathname.startsWith("/o/oauth2") ||
        pathname.startsWith("/accounts/")
      ) {
        return true;
      }
    }

    // 3. OAuth 2.0 authorization parameters pointing to Google endpoints
    const hasClientId = urlObj.searchParams.has("client_id");
    const hasRedirectUri = urlObj.searchParams.has("redirect_uri");
    const hasResponseType = urlObj.searchParams.has("response_type");

    if ((hasClientId || hasResponseType) && hasRedirectUri) {
      const redirectUri = urlObj.searchParams.get("redirect_uri") || "";
      if (
        hostname.includes("google") ||
        redirectUri.toLowerCase().includes("accounts.google.com")
      ) {
        return true;
      }
    }

    // 4. Common "continue" or "authuser" URLs inside accounts.google
    if (hostname.includes("google.com") && pathname.includes("oauth")) {
      return true;
    }

    return false;
  } catch {
    // If URL parsing fails, perform fallback substring detection
    return (
      lower.includes("accounts.google.com") ||
      lower.includes("oauth2.googleapis.com") ||
      lower.includes("accounts.youtube.com")
    );
  }
}

/**
 * Categorizes the specific Google authentication flow for clear user reporting.
 */
export function classifyGoogleAuthFlow(url: string): {
  serviceName: GoogleAuthFallbackPrompt["serviceName"];
  descriptionEn: string;
  descriptionBn: string;
} {
  const lower = url.toLowerCase();

  if (lower.includes("/o/oauth2") || lower.includes("oauth2.googleapis.com") || lower.includes("client_id=")) {
    return {
      serviceName: "Google OAuth 2.0",
      descriptionEn: "Third-party application authentication via Google OAuth 2.0",
      descriptionBn: "গুগল OAuth 2.0-এর মাধ্যমে তৃতীয় পক্ষের অ্যাপ্লিকেশনে লগইন",
    };
  }

  if (lower.includes("/accountchooser") || lower.includes("/addsession")) {
    return {
      serviceName: "Google Accounts",
      descriptionEn: "Google Account switcher and session selector",
      descriptionBn: "গুগল অ্যাকাউন্ট পরিবর্তন ও সেশন নির্বাচন",
    };
  }

  return {
    serviceName: "Google Sign-In",
    descriptionEn: "Interactive Google Sign-In and account authentication",
    descriptionBn: "ইন্টারেক্টিভ গুগল সাইন-ইন এবং অ্যাকাউন্ট প্রমাণীকরণ",
  };
}

/**
 * Safely launches a validated authentication URL into the system's external browser context.
 *
 * Security Protections:
 * - Scheme must be strict HTTP or HTTPS.
 * - Always opens with "noopener,noreferrer" to prevent Window.opener access.
 * - In native Android WebView / Capacitor host, notifies native host to trigger VIEW Intent.
 * - Completely avoids passing sensitive user credentials or tokens through NETFLOW proxy.
 */
export function launchSafeExternalBrowser(targetUrl: string): GoogleAuthLaunchResult {
  if (!targetUrl || typeof targetUrl !== "string") {
    return {
      success: false,
      method: "failed",
      error: "Target URL is required for external browser dispatch.",
    };
  }

  const trimmed = targetUrl.trim();
  let normalized = trimmed;
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }

  // Strictly enforce http/https scheme
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        success: false,
        method: "failed",
        error: `Unsafe scheme "${parsed.protocol}" blocked for external browser launch.`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      method: "failed",
      error: `Invalid URL format: ${err?.message || "Unknown error"}`,
    };
  }

  // 1. Android Native Host Bridge Check
  try {
    const bridge = detectAndroidWebViewEnvironment();
    if (bridge.isNativeAvailable) {
      bridge.postMessage("LAUNCH_EXTERNAL_BROWSER", { url: normalized });
      const win = typeof window !== "undefined" ? (window as any) : null;
      if (win?.NetflowNativeBridge?.launchExternalUrl) {
        win.NetflowNativeBridge.launchExternalUrl(normalized);
        return { success: true, method: "native_bridge" };
      }
      if (win?.AndroidBridge?.launchExternalUrl) {
        win.AndroidBridge.launchExternalUrl(normalized);
        return { success: true, method: "native_bridge" };
      }
    }
  } catch (e) {
    console.warn("[Google Auth Fallback] Native bridge launch fallback:", e);
  }

  // 2. Web Window Open with noopener,noreferrer
  if (typeof window !== "undefined") {
    try {
      const opened = window.open(normalized, "_blank", "noopener,noreferrer");
      if (opened) {
        try {
          opened.opener = null;
        } catch {}
        return { success: true, method: "window_open" };
      }
    } catch (e) {
      console.warn("[Google Auth Fallback] window.open blocked by popup policy:", e);
    }

    // 3. Fallback to anchor click dispatch with rel="noopener noreferrer"
    try {
      const a = document.createElement("a");
      a.href = normalized;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { success: true, method: "anchor_dispatch" };
    } catch (err: any) {
      return {
        success: false,
        method: "failed",
        error: `Failed to trigger external anchor dispatch: ${err?.message || "Unknown"}`,
      };
    }
  }

  return {
    success: false,
    method: "failed",
    error: "Window context unavailable for external browser launch.",
  };
}
