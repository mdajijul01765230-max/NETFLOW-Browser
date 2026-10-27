import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Shield,
  Zap,
  BookOpen,
  Sparkles,
  Download,
  AlertCircle,
  RotateCw,
  FileText,
  Lock,
  Wifi,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Languages,
  ExternalLink,
  ZoomIn,
  Monitor,
  Smartphone,
  WifiOff,
  ServerCrash,
  ShieldAlert,
  Clock,
  Radio,
  Globe,
  RefreshCw,
  ArrowLeft,
  Home,
  Archive,
  Info,
} from "lucide-react";
import { BrowserTab, BrowsingMode, FormSubmitOptions, NativeViewportBounds, NetworkState, OfflineCapsule, SiteMode, SitePrivacyOverride, WebPageErrorInfo } from "../types";
import { Language, translations } from "../locales";
import { formatBytes, formatDuration, formatDate, getCleanDomain, sanitizeUrlForErrorDisplay, redactTechnicalDetailsForDiagnostics } from "../utils/formatters";
import { extractYouTubeVideoId, isYouTubeUrl } from "../utils/youtubeHelper";
import { YouTubeFallbackPortal } from "./YouTubeFallbackPortal";
import { isFacebookUrl } from "../utils/facebookHelper";
import { FacebookViewer } from "./FacebookViewer";
import {
  isGoogleAuthOrOAuthUrl,
  launchSafeExternalBrowser,
} from "../services/googleAuthFallbackPolicy";
import { detectAndroidWebViewEnvironment } from "../services/androidWebViewFoundation";
import { isNativeEngineAvailable } from "../services/nativeBrowserEngine";
import {
  canUseProxyFallback,
  PROXY_FALLBACK_BLOCKED_MESSAGE_BN,
  PROXY_FALLBACK_BLOCKED_MESSAGE_EN,
} from "../services/lightModeEngine";

export interface RecoveryCenterPresentationInput {
  error?: string;
  errorInfo?: WebPageErrorInfo;
  url?: string;
  lang: Language;
  isNavigatorOffline?: boolean;
  networkMedium?: string;
}

export interface RecoveryCenterPresentationResult {
  errorCode: string;
  effectiveKind: WebPageErrorInfo["kind"];
  errorTitle: string;
  errorDescription: string;
  checklistItems: string[];
  technicalDetails?: string;
  isSslError: boolean;
  isOffline: boolean;
  isDns: boolean;
  isNotFound: boolean;
  isTimeout: boolean;
  isRefused: boolean;
  isForbidden: boolean;
  isRateLimited: boolean;
  isServerError: boolean;
  isSecurityBlock: boolean;
  isRestrictedNetwork: boolean;
}

export function resolveRecoveryCenterPresentation(
  input: RecoveryCenterPresentationInput
): RecoveryCenterPresentationResult {
  const { error, errorInfo, url, lang, isNavigatorOffline, networkMedium } = input;
  const t = translations[lang];
  const displayTarget = url ? getCleanDomain(url) : t.errorState.defaultTargetName;
  const lowerErr = (error || "").toLowerCase();
  const statusCode = errorInfo?.statusCode;
  const incomingCode = errorInfo?.errorCode;

  const isSslError =
    errorInfo?.kind === "ssl" ||
    incomingCode === "ERR_SSL_PROTOCOL_ERROR" ||
    lowerErr.includes("ssl") ||
    lowerErr.includes("certificate");

  const isOffline =
    errorInfo?.kind === "offline" ||
    incomingCode === "ERR_INTERNET_DISCONNECTED" ||
    lowerErr.includes("offline") ||
    lowerErr.includes("no internet") ||
    lowerErr.includes("internet_disconnected") ||
    Boolean(isNavigatorOffline) ||
    networkMedium === "offline";

  const isRedirectBlock =
    incomingCode === "NETFLOW_REDIRECT_BLOCKED" ||
    lowerErr.includes("redirect blocked") ||
    lowerErr.includes("unsafe redirect");

  const isSecurityBlock =
    isRedirectBlock ||
    errorInfo?.kind === "security" ||
    errorInfo?.kind === "security_ssrf" ||
    incomingCode === "NETFLOW_SSRF_BLOCKED" ||
    lowerErr.includes("internal, local") ||
    lowerErr.includes("internal or restricted") ||
    lowerErr.includes("restricted uri") ||
    lowerErr.includes("ssrf") ||
    lowerErr.includes("loopback");

  const isForbidden =
    incomingCode === "HTTP_403_FORBIDDEN" ||
    statusCode === 403 ||
    lowerErr.includes("403") ||
    lowerErr.includes("forbidden") ||
    lowerErr.includes("denied");

  const isNotFound =
    incomingCode === "HTTP_404_NOT_FOUND" ||
    statusCode === 404 ||
    (!incomingCode && (lowerErr.includes("http 404") || lowerErr.includes("page not found")));

  const isRateLimited =
    incomingCode === "HTTP_429_TOO_MANY_REQUESTS" ||
    statusCode === 429 ||
    lowerErr.includes("429") ||
    lowerErr.includes("rate limit") ||
    lowerErr.includes("too many requests") ||
    lowerErr.includes("throttling");

  const isHttp500 =
    incomingCode === "HTTP_500_INTERNAL_SERVER_ERROR" ||
    statusCode === 500 ||
    (!incomingCode && (lowerErr.includes("500") || lowerErr.includes("internal server error")));

  const isHttp502 =
    incomingCode === "HTTP_502_BAD_GATEWAY" ||
    statusCode === 502 ||
    (!incomingCode && (lowerErr.includes("502") || lowerErr.includes("bad gateway")));

  const isHttp503 =
    incomingCode === "HTTP_503_SERVICE_UNAVAILABLE" ||
    statusCode === 503 ||
    (!incomingCode && (lowerErr.includes("503") || lowerErr.includes("service unavailable")));

  const isHttp504 =
    incomingCode === "HTTP_504_GATEWAY_TIMEOUT" ||
    statusCode === 504 ||
    (!incomingCode && (lowerErr.includes("504") || lowerErr.includes("gateway timeout")));

  const isDnsCandidate =
    !isForbidden &&
    !isNotFound &&
    !isRateLimited &&
    !isHttp500 &&
    !isHttp502 &&
    !isHttp503 &&
    !isHttp504 &&
    !isSecurityBlock &&
    (incomingCode === "ERR_NAME_NOT_RESOLVED" ||
      (!incomingCode &&
        (errorInfo?.kind === "dns" ||
          lowerErr.includes("dns") ||
          lowerErr.includes("name_not_resolved") ||
          lowerErr.includes("enotfound") ||
          lowerErr.includes("domain not found"))));

  const isRefused =
    incomingCode === "ERR_CONNECTION_REFUSED" ||
    errorInfo?.kind === "connection" ||
    lowerErr.includes("connection refused") ||
    lowerErr.includes("econnrefused") ||
    lowerErr.includes("connection reset") ||
    lowerErr.includes("econnreset");

  const isTimeout =
    isHttp504 ||
    incomingCode === "ERR_CONNECTION_TIMED_OUT" ||
    errorInfo?.kind === "timeout" ||
    lowerErr.includes("timed out") ||
    lowerErr.includes("timeout") ||
    lowerErr.includes("interrupted");

  const isServerError =
    isHttp500 ||
    isHttp502 ||
    isHttp503 ||
    isHttp504 ||
    Boolean(statusCode && statusCode >= 500 && statusCode < 600);

  const isRestrictedNetwork =
    incomingCode === "NETFLOW_RESTRICTED_NETWORK" ||
    errorInfo?.kind === "restricted_network" ||
    lowerErr.includes("restricted network") ||
    lowerErr.includes("carrier");

  const errorCode =
    incomingCode ||
    (isSslError
      ? "ERR_SSL_PROTOCOL_ERROR"
      : isOffline
      ? "ERR_INTERNET_DISCONNECTED"
      : isRedirectBlock
      ? "NETFLOW_REDIRECT_BLOCKED"
      : isSecurityBlock
      ? "NETFLOW_SSRF_BLOCKED"
      : isForbidden
      ? "HTTP_403_FORBIDDEN"
      : isNotFound
      ? "HTTP_404_NOT_FOUND"
      : isRateLimited
      ? "HTTP_429_TOO_MANY_REQUESTS"
      : isHttp500
      ? "HTTP_500_INTERNAL_SERVER_ERROR"
      : isHttp502
      ? "HTTP_502_BAD_GATEWAY"
      : isHttp503
      ? "HTTP_503_SERVICE_UNAVAILABLE"
      : isHttp504
      ? "HTTP_504_GATEWAY_TIMEOUT"
      : isDnsCandidate
      ? "ERR_NAME_NOT_RESOLVED"
      : isRefused
      ? "ERR_CONNECTION_REFUSED"
      : isTimeout
      ? "ERR_CONNECTION_TIMED_OUT"
      : isServerError
      ? "ERR_HTTP_RESPONSE_CODE_FAILURE"
      : isRestrictedNetwork
      ? "NETFLOW_RESTRICTED_NETWORK"
      : "ERR_CONNECTION_FAILED");

  // DNS flag is strictly true ONLY when the resolved errorCode is ERR_NAME_NOT_RESOLVED
  const isDns = errorCode === "ERR_NAME_NOT_RESOLVED";

  const errorTitle =
    errorCode === "ERR_SSL_PROTOCOL_ERROR" || isSslError
      ? t.sslErrorTitle || "Your connection is not private"
      : errorCode === "ERR_INTERNET_DISCONNECTED" || isOffline
      ? t.errorState.offlineTitle
      : errorCode === "HTTP_403_FORBIDDEN" || isForbidden
      ? t.errorState.forbiddenTitle
      : errorCode === "HTTP_404_NOT_FOUND" || isNotFound
      ? t.errorState.notFoundTitle
      : errorCode === "HTTP_429_TOO_MANY_REQUESTS" || isRateLimited
      ? t.errorState.rateLimitedTitle
      : errorCode === "HTTP_500_INTERNAL_SERVER_ERROR" || isHttp500
      ? t.errorState.serverErrorTitle
      : errorCode === "HTTP_502_BAD_GATEWAY" || isHttp502
      ? t.errorState.badGatewayTitle
      : errorCode === "HTTP_503_SERVICE_UNAVAILABLE" || isHttp503
      ? t.errorState.serviceUnavailableTitle
      : errorCode === "HTTP_504_GATEWAY_TIMEOUT" || isHttp504
      ? t.errorState.gatewayTimeoutTitle
      : isDns
      ? t.errorState.dnsTitle
      : errorCode === "NETFLOW_REDIRECT_BLOCKED" || isRedirectBlock
      ? t.errorState.redirectBlockTitle
      : errorCode === "NETFLOW_SSRF_BLOCKED" || isSecurityBlock
      ? t.errorState.securityBlockTitle
      : errorCode === "ERR_CONNECTION_TIMED_OUT" || isTimeout
      ? t.errorState.timeoutTitle
      : errorCode === "ERR_CONNECTION_REFUSED" || isRefused
      ? t.errorState.refusedTitle
      : isServerError
      ? t.errorState.serverErrorTitle
      : errorCode === "NETFLOW_RESTRICTED_NETWORK" || isRestrictedNetwork
      ? t.errorState.restrictedNetworkTitle
      : typeof t.errorState?.unableToReachTarget === "function"
      ? t.errorState.unableToReachTarget(displayTarget)
      : t.errorState?.unableToReach || displayTarget;

  const errorDescription =
    errorCode === "ERR_SSL_PROTOCOL_ERROR" || isSslError
      ? t.sslErrorExplanation ||
        "The SSL/TLS certificate presented by this website could not be verified or is untrusted. To protect your credentials and personal data, NETFLOW cancelled the connection."
      : errorCode === "ERR_INTERNET_DISCONNECTED" || isOffline
      ? t.errorState.offlineDesc
      : errorCode === "HTTP_403_FORBIDDEN" || isForbidden
      ? t.errorState.forbiddenDesc
      : errorCode === "HTTP_404_NOT_FOUND" || isNotFound
      ? t.errorState.notFoundDesc
      : errorCode === "HTTP_429_TOO_MANY_REQUESTS" || isRateLimited
      ? t.errorState.rateLimitedDesc
      : errorCode === "HTTP_500_INTERNAL_SERVER_ERROR" || isHttp500
      ? t.errorState.serverErrorDesc
      : errorCode === "HTTP_502_BAD_GATEWAY" || isHttp502
      ? t.errorState.badGatewayDesc
      : errorCode === "HTTP_503_SERVICE_UNAVAILABLE" || isHttp503
      ? t.errorState.serviceUnavailableDesc
      : errorCode === "HTTP_504_GATEWAY_TIMEOUT" || isHttp504
      ? t.errorState.gatewayTimeoutDesc
      : isDns
      ? t.errorState.dnsDesc
      : errorCode === "NETFLOW_REDIRECT_BLOCKED" || isRedirectBlock
      ? t.errorState.redirectBlockDesc
      : errorCode === "NETFLOW_SSRF_BLOCKED" || isSecurityBlock
      ? t.errorState.securityBlockDesc
      : errorCode === "ERR_CONNECTION_TIMED_OUT" || isTimeout
      ? t.errorState.timeoutDesc
      : errorCode === "ERR_CONNECTION_REFUSED" || isRefused
      ? t.errorState.refusedDesc
      : isServerError
      ? t.errorState.serverErrorDesc
      : errorCode === "NETFLOW_RESTRICTED_NETWORK" || isRestrictedNetwork
      ? t.errorState.restrictedNetworkDesc
      : error || t.errorState.defaultNetworkFailure;

  const effectiveKind = errorInfo?.kind;
  const isServerChecklist =
    effectiveKind === "http_server" ||
    (statusCode !== undefined && statusCode >= 500 && statusCode < 600) ||
    errorCode === "HTTP_500_INTERNAL_SERVER_ERROR" ||
    errorCode === "HTTP_502_BAD_GATEWAY" ||
    errorCode === "HTTP_503_SERVICE_UNAVAILABLE" ||
    errorCode === "HTTP_504_GATEWAY_TIMEOUT" ||
    errorCode.startsWith("HTTP_5");
  const isClientChecklist =
    !isServerChecklist &&
    (effectiveKind === "http_client" ||
      (statusCode !== undefined && statusCode >= 400 && statusCode < 500) ||
      errorCode === "HTTP_403_FORBIDDEN" ||
      errorCode === "HTTP_404_NOT_FOUND" ||
      errorCode === "HTTP_429_TOO_MANY_REQUESTS" ||
      errorCode.startsWith("HTTP_4"));
  const isSsrfChecklist =
    effectiveKind === "security" ||
    effectiveKind === "security_ssrf" ||
    isSecurityBlock ||
    errorCode === "NETFLOW_REDIRECT_BLOCKED" ||
    errorCode === "NETFLOW_SSRF_BLOCKED";
  const isProxyErrorChecklist = errorCode === "NETFLOW_PROXY_ERROR";

  let checklistItems: string[];

  if (isSslError) {
    checklistItems = [
      lang === "bn"
        ? "সাইটের সার্টিফিকেট মেয়াদোত্তীর্ণ, স্ব-স্বাক্ষরিত বা অবিশ্বস্ত হতে পারে"
        : "The site's certificate may be expired, self-signed, or issued by an untrusted authority",
      lang === "bn"
        ? "নিরাপত্তার স্বার্থে সংযোগটি বাতিল করা হয়েছে (অবিশ্বস্ত সার্টিফিকেট বাইপাস করার কোনো অপশন নেই)"
        : "The connection was cancelled for your safety (bypassing untrusted certificates is never allowed)",
      `${t.sslErrorGoBack || t.errorState.goBack} / ${t.sslErrorGoHome || t.errorState.goHome}`,
    ];
  } else if (isServerChecklist) {
    const serverSpecificItem =
      errorCode === "HTTP_504_GATEWAY_TIMEOUT" || isHttp504
        ? t.errorState.gatewayTimeoutDesc
        : errorCode === "HTTP_502_BAD_GATEWAY" || isHttp502
        ? t.errorState.badGatewayDesc
        : errorCode === "HTTP_500_INTERNAL_SERVER_ERROR" || isHttp500
        ? t.errorState.serverErrorDesc
        : t.errorState.serviceUnavailableDesc;
    checklistItems = [
      serverSpecificItem,
      lang === "bn"
        ? "সাইটটি সাময়িকভাবে অনুপলব্ধ; কিছুক্ষণ অপেক্ষা করে পুনরায় চেষ্টা করুন"
        : "The site is temporarily unavailable; wait a moment and try again",
      lang === "bn"
        ? `${t.errorState.viewOfflineCapsule} অথবা ${t.errorState.goHome}`
        : `${t.errorState.viewOfflineCapsule} or ${t.errorState.goHome}`,
    ];
  } else if (isClientChecklist) {
    if (errorCode === "HTTP_429_TOO_MANY_REQUESTS" || isRateLimited) {
      checklistItems = [
        t.errorState.rateLimitedDesc,
        lang === "bn"
          ? "পুনরায় রিকোয়েস্ট পাঠানোর আগে কিছুক্ষণ অপেক্ষা করুন"
          : "Wait a moment before sending another request",
        t.errorState.goBack,
      ];
    } else if (errorCode === "HTTP_403_FORBIDDEN" || isForbidden) {
      checklistItems = [
        t.errorState.forbiddenDesc,
        lang === "bn"
          ? "এই পৃষ্ঠাটি দেখতে বৈধ অনুমতি বা লগইন প্রয়োজন হতে পারে"
          : "Verify whether this page requires authorization or sign-in",
        `${t.errorState.goBack} / ${t.errorState.goHome}`,
      ];
    } else {
      checklistItems = [
        t.errorState.checklistSpelling || "Checking the spelling of the web address",
        lang === "bn"
          ? "অনুরোধকৃত পৃষ্ঠাটি সরানো বা মুছে ফেলা হয়ে থাকতে পারে (HTTP 404)"
          : "The requested page may have been moved or removed (HTTP 404)",
        `${t.errorState.goBack} / ${t.errorState.goHome}`,
      ];
    }
  } else if (isSsrfChecklist) {
    checklistItems = [
      errorCode === "NETFLOW_REDIRECT_BLOCKED" || isRedirectBlock
        ? t.errorState.redirectBlockDesc
        : t.errorState.securityBlockDesc,
      lang === "bn"
        ? "শুধুমাত্র বৈধ পাবলিক ওয়েব ঠিকানা (HTTPS/HTTP) ব্যবহার করুন"
        : "Use a valid public web address (HTTPS/HTTP)",
      t.errorState.goHome,
    ];
  } else if (isProxyErrorChecklist) {
    checklistItems = [
      lang === "bn"
        ? "প্রক্সি সংযোগে সাময়িক ত্রুটি ঘটেছে; কিছুক্ষণ অপেক্ষা করে পুনরায় চেষ্টা করুন"
        : "Temporary proxy processing issue; wait a moment and retry",
      t.errorState.retryTextOnly,
      t.errorState.goHome,
    ];
  } else {
    checklistItems = [
      t.errorState.checklistConnection || "Checking the network cables, modem, and router",
      t.errorState.checklistReconnect || "Reconnecting to Wi-Fi or cellular mobile data",
      t.errorState.checklistSpelling || "Checking the spelling of the web address",
    ];
  }

  const resolvedEffectiveKind: WebPageErrorInfo["kind"] = isSslError
    ? "ssl"
    : isRedirectBlock || isSecurityBlock || effectiveKind === "security" || effectiveKind === "security_ssrf"
    ? "security"
    : isOffline
    ? "offline"
    : isDns
    ? "dns"
    : isServerChecklist
    ? "http_server"
    : isClientChecklist
    ? "http_client"
    : isTimeout
    ? "timeout"
    : isRefused
    ? "connection"
    : isRestrictedNetwork
    ? "restricted_network"
    : effectiveKind || "generic";

  const hasRawInternalToken =
    /DANGEROUS_SCHEME|PRIVATE_IPV4_TARGET|LOOPBACK_TARGET|LINK_LOCAL_METADATA_TARGET|PRIVATE_IPV6_TARGET|HTTPS_TO_HTTP_DOWNGRADE|REDIRECT_LOOP_DETECTED|MAX_REDIRECT_HOPS_EXCEEDED/i.test(
      error || ""
    );

  const safeErrorDescription = hasRawInternalToken
    ? isRedirectBlock
      ? t.errorState.redirectBlockDesc
      : isSecurityBlock
      ? t.errorState.securityBlockDesc
      : t.errorState.defaultNetworkFailure
    : errorDescription;

  const rawTechDetails =
    errorInfo?.technicalDetails ||
    (hasRawInternalToken || isRedirectBlock || isSecurityBlock ? error : undefined);
  const technicalDetails = rawTechDetails
    ? redactTechnicalDetailsForDiagnostics(rawTechDetails)
    : undefined;

  return {
    errorCode,
    effectiveKind: resolvedEffectiveKind,
    errorTitle,
    errorDescription: safeErrorDescription,
    checklistItems,
    technicalDetails,
    isSslError,
    isOffline,
    isDns,
    isNotFound,
    isTimeout,
    isRefused,
    isForbidden,
    isRateLimited,
    isServerError,
    isSecurityBlock,
    isRestrictedNetwork,
  };
}

function clearHighlights(root: HTMLElement) {
  const marks = root.querySelectorAll<HTMLElement>("mark.netflow-find-match");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    }
  });
}

function performFind(root: HTMLElement, query: string): HTMLElement[] {
  clearHighlights(root);
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (
        tag === "script" ||
        tag === "style" ||
        tag === "mark" ||
        tag === "textarea" ||
        tag === "input" ||
        Boolean(parent.closest("input, textarea, [type='password'], [data-netflow-sensitive]"))
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  const foundMarks: HTMLElement[] = [];

  for (const node of textNodes) {
    const text = node.nodeValue || "";
    const lowerText = text.toLowerCase();
    let startIndex = 0;
    let index = lowerText.indexOf(trimmed, startIndex);

    if (index === -1) continue;

    const fragment = document.createDocumentFragment();

    while (index !== -1) {
      if (index > startIndex) {
        fragment.appendChild(document.createTextNode(text.substring(startIndex, index)));
      }

      const mark = document.createElement("mark");
      mark.className =
        "netflow-find-match bg-amber-200 dark:bg-amber-400/40 text-stone-900 dark:text-stone-100 rounded-xs px-0.5";
      mark.textContent = text.substring(index, index + trimmed.length);
      fragment.appendChild(mark);
      foundMarks.push(mark);

      startIndex = index + trimmed.length;
      index = lowerText.indexOf(trimmed, startIndex);
    }

    if (startIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(startIndex)));
    }

    if (node.parentNode) {
      node.parentNode.replaceChild(fragment, node);
    }
  }

  return foundMarks;
}

export type SitePermissionKind = "camera" | "microphone" | "geolocation" | "notifications";

export interface FramePermissionRequest {
  tabId: string;
  url: string;
  kind: string;
  queryOnly?: boolean;
}

export interface FramePermissionResult {
  allowed: boolean;
  state: "granted" | "denied" | "prompt" | "default";
  reason: string;
}

export interface EngineStatusPresentationInput {
  isRealAndroidNativeEngineActive: boolean;
  isFrameLoading?: boolean;
  javascriptBlocked?: boolean;
  lang: Language;
  tabTitle?: string;
}

export interface EngineStatusPresentation {
  engineKind: "native_android_webview" | "web_preview_proxy_sandbox";
  statusLabel: string;
  iframeTitle: string;
  frameErrorFallback: string;
}

/**
 * Form 9 Part E: Honest Engine Status Label & Frame Presentation.
 * Claims "Native Chromium Engine" / "নেটিভ ক্রোমিয়াম ইঞ্জিন" ONLY when the real Android native
 * WebView bridge is active (`isRealAndroidNativeEngineActive === true`).
 * In the AI Studio Web Preview / Proxy Sandbox fallback (`isRealAndroidNativeEngineActive === false`),
 * honestly identifies the renderer as the Web Preview Proxy Sandbox Iframe and reflects JS block state.
 */
export function resolveEngineStatusPresentation(
  input: EngineStatusPresentationInput
): EngineStatusPresentation {
  const {
    isRealAndroidNativeEngineActive,
    isFrameLoading = false,
    javascriptBlocked = false,
    lang,
    tabTitle,
  } = input;

  if (isRealAndroidNativeEngineActive) {
    const statusLabel =
      lang === "bn"
        ? isFrameLoading
          ? "নেটিভ ক্রোমিয়াম ইঞ্জিন • ইনিশিয়ালাইজিং..."
          : javascriptBlocked
          ? "নেটিভ ক্রোমিয়াম ইঞ্জিন • জাভাস্ক্রিপ্ট ব্লকড"
          : "নেটিভ ক্রোমিয়াম ইঞ্জিন • সক্রিয় জাভাস্ক্রিপ্ট"
        : isFrameLoading
        ? "Native Chromium Engine • Initializing..."
        : javascriptBlocked
        ? "Native Chromium Engine • JavaScript Blocked"
        : "Native Chromium Engine • Active JavaScript";

    return {
      engineKind: "native_android_webview",
      statusLabel,
      iframeTitle: tabTitle || "NETFLOW Native Android WebView",
      frameErrorFallback:
        lang === "bn"
          ? "নেটিভ ওয়েবভিউ লোড ব্যর্থ হয়েছে"
          : "Failed to initialize native WebView",
    };
  }

  const statusLabel =
    lang === "bn"
      ? isFrameLoading
        ? "ফুল মোড • স্যান্ডবক্সে পেজ লোড হচ্ছে..."
        : javascriptBlocked
        ? "ফুল মোড • স্যান্ডবক্সে JavaScript ব্লকড"
        : "ফুল মোড • স্যান্ডবক্সে JavaScript"
      : isFrameLoading
      ? "Full Mode • Loading in Sandbox..."
      : javascriptBlocked
      ? "Full Mode • Sandboxed JavaScript Blocked"
      : "Full Mode • Sandboxed JavaScript";

  return {
    engineKind: "web_preview_proxy_sandbox",
    statusLabel,
    iframeTitle: tabTitle || "NETFLOW Web Preview Proxy Sandbox",
    frameErrorFallback:
      lang === "bn"
        ? "স্যান্ডবক্স ফ্রেম লোড ব্যর্থ হয়েছে"
        : "Failed to initialize sandboxed preview frame",
  };
}

/**
 * FORM 9 PART F.1: Recovery Center checklist box theme-aware colors and WCAG 2.1 contrast calculation.
 * Fixes the prior invalid `dark:bg-stone-850` class that caused light-grey text (`dark:text-stone-200`)
 * to render on an unstyled `bg-stone-50` white background (1.16:1 contrast).
 */
export const RECOVERY_CHECKLIST_THEME_COLORS = {
  light: {
    backgroundHex: "#f5f5f4", // bg-stone-100
    headingHex: "#1c1917", // text-stone-900
    itemHex: "#44403c", // text-stone-700
    containerClass: "bg-stone-100 border-stone-300 text-stone-700",
    headingClass: "text-stone-900",
  },
  dark: {
    backgroundHex: "#292524", // dark:bg-stone-800
    headingHex: "#f5f5f4", // dark:text-stone-100
    itemHex: "#e7e5e4", // dark:text-stone-200
    containerClass: "dark:bg-stone-800 dark:border-stone-700 dark:text-stone-200",
    headingClass: "dark:text-stone-100",
  },
} as const;

export function computeRelativeLuminance(hexColor: string): number {
  const clean = hexColor.trim().replace(/^#/, "");
  const fullHex =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    throw new Error(`Invalid hex color: ${hexColor}`);
  }
  const r = parseInt(fullHex.slice(0, 2), 16) / 255;
  const g = parseInt(fullHex.slice(2, 4), 16) / 255;
  const b = parseInt(fullHex.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function computeContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = computeRelativeLuminance(foregroundHex);
  const l2 = computeRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * FORM 9 PART F.2: Proxied page dark-scheme detection and non-overriding style injection.
 * Detects whether a proxied HTML document declares dark scheme support (`<meta name="color-scheme">`
 * containing `dark`, CSS `color-scheme: ... dark`, or `@media (prefers-color-scheme: dark)`).
 * If the page does NOT declare dark scheme support (e.g., `httpbin.org`), keeps the page light
 * (`color-scheme: light` + zero-specificity `:where(html, body)` light canvas fallback) without
 * overriding the page's own CSS rules.
 */
export function doesPageDeclareDarkSchemeSupport(rawHtml: string): boolean {
  if (!rawHtml || typeof rawHtml !== "string") return false;
  const metaColorSchemeDark =
    /<meta\b[^>]*\bname\s*=\s*["']?color-scheme["']?[^>]*\bcontent\s*=\s*["'][^"']*\bdark\b[^"']*["'][^>]*>/i.test(
      rawHtml
    ) ||
    /<meta\b[^>]*\bcontent\s*=\s*["'][^"']*\bdark\b[^"']*["'][^>]*\bname\s*=\s*["']?color-scheme["']?[^>]*>/i.test(
      rawHtml
    );
  const cssColorSchemeDark = /color-scheme\s*:\s*[^;}"']*\bdark\b/i.test(rawHtml);
  const mediaPrefersDark = /@media\b[^{]*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i.test(
    rawHtml
  );
  return metaColorSchemeDark || cssColorSchemeDark || mediaPrefersDark;
}

export interface ProxiedPageThemeStyleResult {
  html: string;
  supportsDarkScheme: boolean;
  styleTag: string;
  surfaceThemeClass: string;
}

export function injectProxiedPageThemeStyle(rawHtml: string): ProxiedPageThemeStyleResult {
  const supportsDarkScheme = doesPageDeclareDarkSchemeSupport(rawHtml);
  const styleTag = supportsDarkScheme
    ? `<style id="netflow-page-scheme-style">:root { color-scheme: light dark; }</style>`
    : `<style id="netflow-page-scheme-style">:root { color-scheme: light; } :where(html, body) { background-color: #ffffff; color: #111827; }</style>`;
  const surfaceThemeClass = supportsDarkScheme
    ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
    : "bg-white text-stone-900";

  if (!rawHtml || rawHtml.trim().length === 0) {
    return {
      html: rawHtml || "",
      supportsDarkScheme,
      styleTag,
      surfaceThemeClass,
    };
  }

  let injectedHtml: string;
  if (/<head\b[^>]*>/i.test(rawHtml)) {
    injectedHtml = rawHtml.replace(/<head\b[^>]*>/i, (m) => `${m}\n${styleTag}`);
  } else if (/<html\b[^>]*>/i.test(rawHtml)) {
    injectedHtml = rawHtml.replace(/<html\b[^>]*>/i, (m) => `${m}\n<head>${styleTag}</head>`);
  } else {
    injectedHtml = `${styleTag}\n${rawHtml}`;
  }

  return {
    html: injectedHtml,
    supportsDarkScheme,
    styleTag,
    surfaceThemeClass,
  };
}

interface WebRendererProps {
  tab: BrowserTab;
  browsingMode: BrowsingMode;
  lang: Language;
  onNavigate: (
    url: string,
    tabId?: string,
    isHistoryNav?: boolean,
    targetHistoryIndex?: number,
    overrideMode?: BrowsingMode,
    formOptions?: FormSubmitOptions
  ) => void;
  onRetry: (overrideMode?: BrowsingMode) => void;
  onSetBrowsingMode: (mode: BrowsingMode) => void;
  onToggleReaderMode: () => void;
  onOpenAiModal: () => void;
  onSaveToOfflineCapsule: () => void;
  isCapsuleSaved: boolean;
  onExplainPhrase: (phrase: string) => void;
  onGoHome?: () => void;
  onCancelLoading?: () => void;
  onGoBack?: () => void;
  canGoBack?: boolean;
  onDismissError?: () => void;
  onDismissTranslationError?: () => void;
  isFindInPageOpen?: boolean;
  onCloseFindInPage?: () => void;
  onOpenFindInPage?: () => void;
  onTranslatePage?: (targetLang?: "bn" | "en") => void;
  onToggleTranslation?: () => void;
  onOpenNewTab?: (url: string, openerTabId: string) => void;
  onDownloadStart?: (url: string, filename?: string) => void;
  onGoogleAuthFallback?: (url: string, tabId: string) => void;
  onZoomReset?: () => void;
  siteMode?: SiteMode;
  onSetSiteMode?: (mode: SiteMode) => void;
  siteOverride?: SitePrivacyOverride;
  onRequestPermission?: (req: FramePermissionRequest) => Promise<FramePermissionResult>;
  onOpenOfflineCapsule?: () => void;
  isOfflineCapsuleAvailable?: boolean;
  networkState?: NetworkState;
  isNativeAndroidEngineAvailable?: boolean;
  onSyncNativeViewportBounds?: (bounds: NativeViewportBounds) => void;
  onNativeFindInPage?: (tabId: string, query: string) => void;
  onNativeFindNext?: (tabId: string, forward: boolean) => void;
  onNativeClearFind?: (tabId: string) => void;
  nativeFindResult?: { activeMatchOrdinal: number; numberOfMatches: number };
  offlineCapsules?: OfflineCapsule[];
  onOpenSpecificCapsule?: (capsuleId: string) => void;
  onLoadSingleImage?: (imageUrl: string) => void;
  onQueueWhenOnline?: (url: string) => void;
  isUrlQueuedForOnline?: boolean;
  onToggleLightMode?: () => void;
  privateIsolationSupported?: boolean;
}

export const WebRenderer: React.FC<WebRendererProps> = ({
  tab,
  browsingMode,
  lang,
  onNavigate,
  onRetry,
  onSetBrowsingMode,
  onToggleReaderMode,
  onOpenAiModal,
  onSaveToOfflineCapsule,
  isCapsuleSaved,
  onExplainPhrase,
  onGoHome,
  onCancelLoading,
  onGoBack,
  canGoBack,
  onDismissError,
  onDismissTranslationError,
  isFindInPageOpen = false,
  onCloseFindInPage,
  onOpenFindInPage,
  onTranslatePage,
  onToggleTranslation,
  onOpenNewTab,
  onDownloadStart,
  onGoogleAuthFallback,
  onZoomReset,
  siteMode = "default",
  onSetSiteMode,
  siteOverride,
  onRequestPermission,
  onOpenOfflineCapsule,
  isOfflineCapsuleAvailable = false,
  networkState,
  isNativeAndroidEngineAvailable,
  onSyncNativeViewportBounds,
  onNativeFindInPage,
  onNativeFindNext,
  onNativeClearFind,
  nativeFindResult,
  offlineCapsules = [],
  onOpenSpecificCapsule,
  onLoadSingleImage,
  onQueueWhenOnline,
  isUrlQueuedForOnline = false,
  onToggleLightMode,
  privateIsolationSupported = false,
}) => {
  const t = translations[lang];
  const [proxyBlockedNotice, setProxyBlockedNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeViewportRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isJsAllowed = siteOverride?.javascript !== "block";
  const frameTokenRef = useRef<string>(
    `nf_tok_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
  );

  // Dedicated YouTube Embed Player and Smart Fallback Portal hooks
  const ytVideoId = useMemo(() => extractYouTubeVideoId(tab.url), [tab.url]);
  const isYtPortal = useMemo(() => isYouTubeUrl(tab.url) && !ytVideoId, [tab.url, ytVideoId]);
  const isFbPage = useMemo(() => isFacebookUrl(tab.url), [tab.url]);

  const iframeSandbox = useMemo(() => {
    const tokens = [
      "allow-forms",
      "allow-downloads",
      "allow-modals",
      "allow-presentation",
    ];
    if (isJsAllowed) {
      // Never combine allow-scripts and allow-same-origin on srcDoc
      tokens.push("allow-scripts");
    } else {
      // Only allow-same-origin when scripts are strictly disabled
      tokens.push("allow-same-origin");
    }
    if (siteOverride?.popups !== "block") {
      tokens.push("allow-popups");
    }
    return tokens.join(" ");
  }, [isJsAllowed, siteOverride?.popups]);

  const iframeAllow = useMemo(() => {
    const perms = [
      "fullscreen",
      "accelerometer",
      "autoplay",
      "clipboard-write",
      "encrypted-media",
      "gyroscope",
      "picture-in-picture",
      "web-share",
    ];
    if (siteOverride?.camera === "allow") {
      perms.push("camera");
    }
    if (siteOverride?.microphone === "allow") {
      perms.push("microphone");
    }
    if (siteOverride?.geolocation === "allow") {
      perms.push("geolocation");
    }
    return perms.join("; ");
  }, [siteOverride?.camera, siteOverride?.microphone, siteOverride?.geolocation]);

  const isNativeMode = Boolean(tab.isNativeWebView || tab.renderMode === "native_webview" || browsingMode === "full");
  const isRealAndroidNativeEngineActive = Boolean(
    isNativeMode &&
      (!tab.isPrivate || Boolean(privateIsolationSupported)) &&
      (isNativeAndroidEngineAvailable ?? detectAndroidWebViewEnvironment().isNativeAvailable) &&
      !(tab.translation?.isTranslated && tab.translation?.translatedHtml) &&
      !tab.isReaderMode
  );

  const [isFrameLoading, setIsFrameLoading] = useState(true);
  const [frameLoadError, setFrameLoadError] = useState<string | null>(null);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [viewCachedVersion, setViewCachedVersion] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const [isOnlineRestored, setIsOnlineRestored] = useState(false);
  const observedOfflineWhileLoadingOrErrorRef = useRef(false);
  const offlineTransitionSeqRef = useRef(0);
  const lastBannerTransitionSeqRef = useRef(0);
  const dismissedBannerTransitionSeqRef = useRef(0);

  useEffect(() => {
    setViewCachedVersion(false);
    setShowDiagnostics(false);
    setIsOnlineRestored(false);
    const currentlyOffline =
      (typeof navigator !== "undefined" && !navigator.onLine) ||
      networkState?.medium === "offline" ||
      networkState?.isOnline === false;
    observedOfflineWhileLoadingOrErrorRef.current = Boolean(
      currentlyOffline && (tab.isLoading || tab.error)
    );
  }, [tab.url, tab.errorInfo?.timestamp]);

  useEffect(() => {
    if (retryCooldown <= 0) return;
    const timer = setTimeout(() => {
      setRetryCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [retryCooldown]);

  useEffect(() => {
    const handleOnline = () => {
      if (
        (tab.isLoading || tab.error) &&
        observedOfflineWhileLoadingOrErrorRef.current
      ) {
        offlineTransitionSeqRef.current += 1;
        const seq = offlineTransitionSeqRef.current;
        observedOfflineWhileLoadingOrErrorRef.current = false;
        if (dismissedBannerTransitionSeqRef.current !== seq) {
          lastBannerTransitionSeqRef.current = seq;
          setIsOnlineRestored(true);
        }
      }
    };
    const handleOffline = () => {
      setIsOnlineRestored(false);
      if (tab.isLoading || tab.error) {
        observedOfflineWhileLoadingOrErrorRef.current = true;
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [tab.isLoading, tab.error]);

  const handleDismissOnlineRestored = useCallback(() => {
    dismissedBannerTransitionSeqRef.current = lastBannerTransitionSeqRef.current;
    observedOfflineWhileLoadingOrErrorRef.current = false;
    setIsOnlineRestored(false);
  }, []);

  const handleUserRetry = useCallback(
    (mode?: BrowsingMode) => {
      if (retryCooldown > 0) return;
      setRetryCooldown(2);
      dismissedBannerTransitionSeqRef.current = lastBannerTransitionSeqRef.current;
      observedOfflineWhileLoadingOrErrorRef.current = false;
      setIsOnlineRestored(false);
      onRetry(mode);
    },
    [retryCooldown, onRetry]
  );

  const enginePresentation = useMemo(
    () =>
      resolveEngineStatusPresentation({
        isRealAndroidNativeEngineActive,
        isFrameLoading,
        javascriptBlocked: !isJsAllowed,
        lang,
        tabTitle: tab.title,
      }),
    [isRealAndroidNativeEngineActive, isFrameLoading, isJsAllowed, lang, tab.title]
  );

  useEffect(() => {
    setIsFrameLoading(true);
    setFrameLoadError(null);
  }, [tab.url, tab.contentHtml, browsingMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreenActive(isFs);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  const isTranslated = !!(tab.translation?.isTranslated && tab.translation?.translatedHtml);
  const isTranslating = !!tab.translation?.isTranslating;
  const activeHtml = isTranslated ? tab.translation!.translatedHtml! : (tab.contentHtml || "");
  const currentZoom = tab.zoomLevel || 100;

  // FORM 9 PART F.2: Compute proxied page dark-scheme support and inject non-overriding scheme style
  const proxiedPageTheme = useMemo(
    () => injectProxiedPageThemeStyle(activeHtml),
    [activeHtml]
  );

  // Build isolated srcDoc with pre-script when allow-scripts is active (no allow-same-origin)
  const iframeSrcDoc = useMemo(() => {
    const baseThemedHtml = proxiedPageTheme.html;
    if (!isNativeMode || !isJsAllowed || !baseThemedHtml || baseThemedHtml.trim().length === 0) {
      return baseThemedHtml;
    }

    const initialZoomFactor = ((tab.zoomLevel || 100) / 100).toString();
    const preScript = `<script data-netflow-isolation="true">(function(TAB_ID, BASE_URL, INITIAL_ZOOM, FRAME_TOKEN){
  var postToHost = function(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          __netflowBridge: true,
          tabId: TAB_ID,
          token: FRAME_TOKEN,
          type: type,
          payload: payload || {}
        }, "*");
      }
    } catch (e) {}
  };

  // 1. In-memory localStorage & sessionStorage shim for opaque (null) sandbox origin
  try {
    var testKey = "__nf_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
  } catch (e) {
    var createStorageShim = function() {
      var store = new Map();
      return {
        getItem: function(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
        setItem: function(k, v) { store.set(String(k), String(v)); },
        removeItem: function(k) { store.delete(String(k)); },
        clear: function() { store.clear(); },
        key: function(i) { return Array.from(store.keys())[i] || null; },
        get length() { return store.size; }
      };
    };
    try {
      Object.defineProperty(window, "localStorage", { value: createStorageShim(), configurable: true });
      Object.defineProperty(window, "sessionStorage", { value: createStorageShim(), configurable: true });
    } catch (err) {}
  }

  // 1b. In-memory document.cookie shim for opaque (null) sandbox origin (prevents fatal DOMException on modern SPAs like Facebook)
  try {
    var _cookieTest = document.cookie;
  } catch (e) {
    var _inMemCookies = new Map();
    try {
      Object.defineProperty(document, "cookie", {
        get: function() {
          var pairs = [];
          _inMemCookies.forEach(function(v, k) { pairs.push(k + "=" + v); });
          return pairs.join("; ");
        },
        set: function(val) {
          if (typeof val === "string") {
            var first = val.split(";")[0].trim();
            if (first) {
              var eqIdx = first.indexOf("=");
              if (eqIdx > 0) {
                var k = first.slice(0, eqIdx).trim();
                var v = first.slice(eqIdx + 1).trim();
                _inMemCookies.set(k, v);
              }
            }
          }
        },
        configurable: true
      });
    } catch (err) {}
  }

  // 2. Safe window.open interception with strict noopener semantics
  try {
    window.open = function(url) {
      if (url) {
        postToHost("OPEN_WINDOW", { url: String(url) });
      }
      return null;
    };
  } catch (e) {}

  // 3. Permission & Privacy Boundary Shims (Notification, Permissions, MediaDevices, Geolocation)
  // Sends validated PERMISSION_REQUEST {kind, tabId, token} to host and awaits PERMISSION_RESULT
  var permSeq = 0;
  var pendingPermRequests = new Map();
  var clientPermTimestamps = [];
  var notifPermissionState = "denied";

  var requestHostPermission = function(kind, queryOnly) {
    return new Promise(function(resolve) {
      try {
        if (!window.parent || window.parent === window) {
          resolve({ allowed: false, state: "denied", reason: "No host frame" });
          return;
        }
        var normalizedKind = typeof kind === "string" ? kind.trim().toLowerCase() : "";
        if (!normalizedKind || normalizedKind.length > 64) {
          resolve({ allowed: false, state: "denied", reason: "Invalid permission kind" });
          return;
        }
        var now = Date.now();
        clientPermTimestamps = clientPermTimestamps.filter(function(t) { return now - t < 3000; });
        if (clientPermTimestamps.length >= 12) {
          resolve({ allowed: false, state: "denied", reason: "Permission request rate-limited" });
          return;
        }
        clientPermTimestamps.push(now);

        permSeq += 1;
        var reqId = "nf_perm_" + TAB_ID + "_" + now.toString(36) + "_" + permSeq;
        var timeoutMs = queryOnly ? 5000 : 30000;
        var timer = setTimeout(function() {
          if (pendingPermRequests.has(reqId)) {
            pendingPermRequests.delete(reqId);
            resolve({ allowed: false, state: "denied", reason: "Permission request timed out" });
          }
        }, timeoutMs);

        pendingPermRequests.set(reqId, {
          resolve: resolve,
          timer: timer,
          kind: normalizedKind
        });

        window.parent.postMessage({
          __netflowBridge: true,
          type: "PERMISSION_REQUEST",
          kind: normalizedKind,
          tabId: TAB_ID,
          token: FRAME_TOKEN,
          requestId: reqId,
          queryOnly: Boolean(queryOnly),
          payload: {
            kind: normalizedKind,
            requestId: reqId,
            queryOnly: Boolean(queryOnly)
          }
        }, "*");
      } catch (e) {
        resolve({ allowed: false, state: "denied", reason: "Permission request failed" });
      }
    });
  };

  try {
    var safeNotification = function(title, options) {
      if (notifPermissionState !== "granted") {
        throw new TypeError("Notification permission is not granted");
      }
      this.title = String(title || "");
      this.body = options && options.body ? String(options.body) : "";
      this.close = function() {};
      this.addEventListener = function() {};
      this.removeEventListener = function() {};
      this.dispatchEvent = function() { return false; };
    };
    Object.defineProperty(safeNotification, "permission", {
      get: function() { return notifPermissionState; },
      configurable: true
    });
    safeNotification.requestPermission = function(deprecatedCb) {
      return requestHostPermission("notifications", false).then(function(res) {
        var nextState = res.allowed ? "granted" : (res.state === "default" ? "default" : "denied");
        notifPermissionState = nextState;
        if (typeof deprecatedCb === "function") {
          try { deprecatedCb(nextState); } catch (e) {}
        }
        return nextState;
      });
    };
    safeNotification.maxActions = 0;
    try {
      Object.defineProperty(window, "Notification", { value: safeNotification, configurable: true, writable: true });
    } catch (e) {}

    if (window.navigator) {
      try {
        var safePerms = {
          query: function(q) {
            if (!q || typeof q !== "object" || typeof q.name !== "string" || !q.name.trim()) {
              return Promise.reject(new TypeError("Invalid permission descriptor"));
            }
            var rawName = q.name.trim();
            var name = rawName.toLowerCase();
            return requestHostPermission(name, true).then(function(res) {
              var resolvedState =
                res.state === "granted" || res.state === "prompt"
                  ? res.state
                  : res.allowed
                  ? "granted"
                  : "denied";
              if (name === "notifications") {
                notifPermissionState = resolvedState === "prompt" ? "default" : resolvedState;
              }
              return {
                name: rawName,
                state: resolvedState,
                onchange: null,
                addEventListener: function() {},
                removeEventListener: function() {},
                dispatchEvent: function() { return false; }
              };
            });
          }
        };
        Object.defineProperty(window.navigator, "permissions", { value: safePerms, configurable: true, writable: true });
      } catch (e) {}

      try {
        var origMedia = window.navigator.mediaDevices || {};
        var safeMedia = Object.assign({}, origMedia, {
          getUserMedia: function(constraints) {
            if (!constraints || typeof constraints !== "object" || (!constraints.video && !constraints.audio)) {
              return Promise.reject(new DOMException("Permission denied by user privacy policy", "NotAllowedError"));
            }
            var wantsVideo = Boolean(constraints.video);
            var wantsAudio = Boolean(constraints.audio);
            var checkVideo = wantsVideo
              ? requestHostPermission("camera", false)
              : Promise.resolve({ allowed: true, state: "granted", reason: "" });
            return checkVideo
              .then(function(camRes) {
                if (!camRes.allowed) {
                  throw new DOMException(
                    camRes.reason || "Camera permission denied by user privacy policy",
                    "NotAllowedError"
                  );
                }
                var checkAudio = wantsAudio
                  ? requestHostPermission("microphone", false)
                  : Promise.resolve({ allowed: true, state: "granted", reason: "" });
                return checkAudio;
              })
              .then(function(micRes) {
                if (!micRes.allowed) {
                  throw new DOMException(
                    micRes.reason || "Microphone permission denied by user privacy policy",
                    "NotAllowedError"
                  );
                }
                // Manager grant path succeeded; in web preview without native capture hardware bridge, do not invoke real device stream
                throw new DOMException(
                  "Hardware media stream unavailable in isolated web preview environment",
                  "NotReadableError"
                );
              });
          },
          getDisplayMedia: function() {
            return requestHostPermission("display-capture", false).then(function() {
              throw new DOMException("Screen capture permission denied by policy", "NotAllowedError");
            });
          },
          enumerateDevices: function() { return Promise.resolve([]); },
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; }
        });
        Object.defineProperty(window.navigator, "mediaDevices", { value: safeMedia, configurable: true, writable: true });
      } catch (e) {}

      try {
        var handleGeoRequest = function(_s, err, isWatch) {
          requestHostPermission("geolocation", false).then(function(res) {
            if (!res.allowed) {
              if (typeof err === "function") {
                err({
                  code: 1,
                  message: res.reason || "User or policy denied Geolocation access",
                  PERMISSION_DENIED: 1,
                  POSITION_UNAVAILABLE: 2,
                  TIMEOUT: 3
                });
              }
              return;
            }
            // Manager grant path succeeded; in web preview without native location bridge, do not invoke real host GPS
            if (typeof err === "function") {
              err({
                code: 2,
                message: "Position provider unavailable in isolated web preview environment",
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3
              });
            }
          });
          return isWatch ? 1 : undefined;
        };
        var safeGeo = {
          getCurrentPosition: function(s, err) {
            handleGeoRequest(s, err, false);
          },
          watchPosition: function(s, err) {
            return handleGeoRequest(s, err, true);
          },
          clearWatch: function() {}
        };
        Object.defineProperty(window.navigator, "geolocation", { value: safeGeo, configurable: true, writable: true });
      } catch (e) {}
    }
  } catch (e) {}

  // 4. Zoom helper and host command listener
  var applyZoom = function(factor) {
    try {
      if (document.documentElement) document.documentElement.style.zoom = factor;
      if (document.body) document.body.style.zoom = factor;
    } catch (e) {}
  };
  applyZoom(INITIAL_ZOOM);
  document.addEventListener("DOMContentLoaded", function() {
    applyZoom(INITIAL_ZOOM);
  });

  window.addEventListener("message", function(evt) {
    try {
      if (evt.source !== window.parent || !evt.data || evt.data.tabId !== TAB_ID) return;
      if (
        (evt.data.type === "PERMISSION_RESULT" || evt.data.__netflowHostCmd === "PERMISSION_RESULT") &&
        evt.data.token === FRAME_TOKEN &&
        typeof evt.data.requestId === "string"
      ) {
        var pending = pendingPermRequests.get(evt.data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingPermRequests.delete(evt.data.requestId);
          var allowed = Boolean(evt.data.allowed);
          var state = typeof evt.data.state === "string" ? evt.data.state : (allowed ? "granted" : "denied");
          pending.resolve({
            allowed: allowed,
            state: state,
            reason: typeof evt.data.reason === "string" ? evt.data.reason : ""
          });
        }
        return;
      }
      if (evt.data.__netflowHostCmd === "SYNC_NOTIFICATION_PERMISSION" && evt.data.token === FRAME_TOKEN) {
        if (evt.data.permission === "granted" || evt.data.permission === "denied" || evt.data.permission === "default") {
          notifPermissionState = evt.data.permission;
        }
        return;
      }
      if (evt.data.__netflowHostCmd === "SET_ZOOM" && evt.data.zoomFactor) {
        INITIAL_ZOOM = String(evt.data.zoomFactor);
        applyZoom(INITIAL_ZOOM);
      } else if (evt.data.__netflowHostCmd === "EXIT_FULLSCREEN") {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(function() {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (e) {}
  });

  // 5. Fullscreen state synchronization
  var onFsChange = function() {
    try {
      var isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      postToHost("FULLSCREEN_CHANGE", { isFullscreen: isFs });
    } catch (e) {}
  };
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  // 6. Intercept anchor clicks inside isolated frame
  document.addEventListener("click", function(evt) {
    try {
      var target = evt.target;
      var anchor = target && typeof target.closest === "function" ? target.closest("a, [data-netflow-url]") : null;
      if (!anchor) return;
      var rawHref = anchor.getAttribute("href") || anchor.getAttribute("data-netflow-url");
      if (!rawHref || rawHref.charAt(0) === "#") return;
      var lowerHref = rawHref.trim().toLowerCase();

      if (
        anchor.hasAttribute("download") ||
        lowerHref.indexOf("blob:") === 0 ||
        (lowerHref.indexOf("data:") === 0 && lowerHref.indexOf("data:text/html") !== 0)
      ) {
        evt.preventDefault();
        postToHost("DOWNLOAD", {
          url: rawHref,
          filename: anchor.getAttribute("download") || undefined
        });
        return;
      }

      if (
        lowerHref.indexOf("javascript:") === 0 ||
        lowerHref.indexOf("data:") === 0 ||
        lowerHref.indexOf("file:") === 0 ||
        lowerHref.indexOf("blob:") === 0 ||
        lowerHref.indexOf("vbscript:") === 0
      ) {
        evt.preventDefault();
        return;
      }

      evt.preventDefault();
      var dest = rawHref;
      try {
        dest = new URL(rawHref, BASE_URL).href;
      } catch (e) {}
      var targetAttr = (anchor.getAttribute("target") || "").trim().toLowerCase();
      var isNewWindow = targetAttr === "_blank" || targetAttr === "_new";
      postToHost("NAVIGATE", { url: dest, isNewWindow: isNewWindow });
    } catch (e) {}
  }, true);

  // 7. Smooth input focus scrolling
  document.addEventListener("focusin", function(evt) {
    try {
      var t = evt.target;
      if (!t || !t.tagName) return;
      var tag = t.tagName.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t.getAttribute && t.getAttribute("contenteditable") === "true")) {
        if (typeof t.scrollIntoView === "function") {
          t.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    } catch (e) {}
  });

  // 8. Intercept form submissions inside isolated frame
  document.addEventListener("submit", function(evt) {
    try {
      var form = evt.target;
      if (!form || !form.tagName || form.tagName.toUpperCase() !== "FORM") return;
      evt.preventDefault();
      var rawAction = (form.getAttribute("action") || "").trim();
      var lowerAction = rawAction.toLowerCase();
      if (
        lowerAction.indexOf("javascript:") === 0 ||
        lowerAction.indexOf("data:") === 0 ||
        lowerAction.indexOf("file:") === 0 ||
        lowerAction.indexOf("vbscript:") === 0
      ) {
        return;
      }
      var actionUrl = rawAction || BASE_URL;
      try {
        actionUrl = new URL(actionUrl, BASE_URL).href;
      } catch (e) {}
      var method = (form.getAttribute("method") || "GET").toUpperCase();
      var formData;
      try {
        formData = evt.submitter ? new FormData(form, evt.submitter) : new FormData(form);
      } catch (e) {
        formData = new FormData(form);
      }
      var params = new URLSearchParams();
      formData.forEach(function(val, key) {
        if (typeof val === "string") {
          params.append(key, val);
        } else if (val && typeof val.name === "string") {
          params.append(key, val.name);
        }
      });
      postToHost("FORM_SUBMIT", {
        actionUrl: actionUrl,
        method: method === "POST" ? "POST" : "GET",
        params: params.toString()
      });
    } catch (e) {}
  }, true);
})(${JSON.stringify(tab.id)}, ${JSON.stringify(tab.url || "")}, ${JSON.stringify(
      initialZoomFactor
    )}, ${JSON.stringify(frameTokenRef.current)});</script>`;

    if (/<head\b[^>]*>/i.test(baseThemedHtml)) {
      return baseThemedHtml.replace(/<head\b[^>]*>/i, (m) => `${m}\n${preScript}`);
    }
    return `${preScript}\n${baseThemedHtml}`;
  }, [isNativeMode, isJsAllowed, proxiedPageTheme.html, tab.id, tab.url, tab.zoomLevel]);

  // Per-frame permission request rate-limiting and in-flight tracking
  const permRateLimitRef = useRef<{
    allTimestamps: number[];
    interactiveByKind: Map<string, number[]>;
    inFlightKinds: Set<string>;
  }>({
    allTimestamps: [],
    interactiveByKind: new Map(),
    inFlightKinds: new Set(),
  });

  useEffect(() => {
    permRateLimitRef.current = {
      allTimestamps: [],
      interactiveByKind: new Map(),
      inFlightKinds: new Set(),
    };
  }, [tab.id, tab.url, activeHtml]);

  // Synchronize Notification.permission getter state in isolated frame when siteOverride changes
  useEffect(() => {
    if (!isNativeMode || !isJsAllowed) return;
    const isHttps = Boolean(tab.url && tab.url.trim().toLowerCase().startsWith("https://"));
    const notifSetting = siteOverride?.notifications;
    const syncedPerm =
      !isHttps || !notifSetting || notifSetting === "block"
        ? "denied"
        : notifSetting === "allow"
        ? "granted"
        : "default";
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          __netflowHostCmd: "SYNC_NOTIFICATION_PERMISSION",
          tabId: tab.id,
          token: frameTokenRef.current,
          permission: syncedPerm,
        },
        "*"
      );
    } catch {}
  }, [isNativeMode, isJsAllowed, tab.id, tab.url, siteOverride?.notifications]);

  // Validated postMessage listener from isolated srcDoc iframe (checks event.source, tabId, and closure token)
  useEffect(() => {
    if (!isNativeMode) return;

    const VALID_PERMISSION_KINDS = new Set<string>([
      "camera",
      "microphone",
      "geolocation",
      "notifications",
    ]);
    const PERM_WINDOW_MS = 3000;
    const MAX_TOTAL_PERM_PER_WINDOW = 12;
    const MAX_INTERACTIVE_PER_KIND_WINDOW = 3;

    const sendPermissionResult = (
      requestId: string,
      kind: string,
      allowed: boolean,
      state: "granted" | "denied" | "prompt" | "default",
      reason: string
    ) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          {
            __netflowHostCmd: "PERMISSION_RESULT",
            type: "PERMISSION_RESULT",
            tabId: tab.id,
            token: frameTokenRef.current,
            requestId,
            kind,
            allowed,
            state,
            reason,
          },
          "*"
        );
      } catch {}
    };

    const isSafeNavigationScheme = (candidate: string): boolean => {
      const lower = candidate.trim().toLowerCase();
      return (
        !lower.startsWith("javascript:") &&
        !lower.startsWith("data:") &&
        !lower.startsWith("file:") &&
        !lower.startsWith("blob:") &&
        !lower.startsWith("vbscript:")
      );
    };

    const handleFrameMessage = (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) return;

      const data = event.data;
      if (!data || typeof data !== "object" || data.__netflowBridge !== true) return;
      if (
        typeof data.tabId !== "string" ||
        data.tabId !== tab.id ||
        typeof data.token !== "string" ||
        data.token !== frameTokenRef.current
      ) {
        return;
      }

      const payload = data.payload && typeof data.payload === "object" ? data.payload : {};

      if (data.type === "PERMISSION_REQUEST") {
        const rawReqId = data.requestId !== undefined ? data.requestId : payload.requestId;
        if (typeof rawReqId !== "string" || !rawReqId.trim() || rawReqId.length > 128) {
          // Reject malformed message without valid requestId
          return;
        }
        const requestId = rawReqId.trim();

        const topKind = data.kind;
        const payloadKind = payload.kind;
        if (
          topKind !== undefined &&
          payloadKind !== undefined &&
          topKind !== payloadKind
        ) {
          sendPermissionResult(requestId, "unknown", false, "denied", "Malformed permission request: mismatched kind");
          return;
        }
        const rawKind = topKind !== undefined ? topKind : payloadKind;
        if (typeof rawKind !== "string" || !rawKind.trim() || rawKind.length > 64) {
          sendPermissionResult(requestId, "unknown", false, "denied", "Malformed permission request: invalid kind");
          return;
        }

        const rawQueryOnly = data.queryOnly !== undefined ? data.queryOnly : payload.queryOnly;
        if (rawQueryOnly !== undefined && typeof rawQueryOnly !== "boolean") {
          sendPermissionResult(requestId, rawKind.trim().toLowerCase(), false, "denied", "Malformed permission request: invalid queryOnly flag");
          return;
        }
        const queryOnly = Boolean(rawQueryOnly);
        const normalizedKind = rawKind.trim().toLowerCase();

        // Unknown kinds are denied immediately
        if (!VALID_PERMISSION_KINDS.has(normalizedKind)) {
          sendPermissionResult(
            requestId,
            normalizedKind,
            false,
            "denied",
            `Unsupported or unknown permission kind: ${normalizedKind}`
          );
          return;
        }

        // Per-frame rate limiting
        const now = Date.now();
        const rateState = permRateLimitRef.current;
        rateState.allTimestamps = rateState.allTimestamps.filter((t) => now - t < PERM_WINDOW_MS);
        if (rateState.allTimestamps.length >= MAX_TOTAL_PERM_PER_WINDOW) {
          sendPermissionResult(
            requestId,
            normalizedKind,
            false,
            "denied",
            "Permission request rate limit exceeded for frame"
          );
          return;
        }
        rateState.allTimestamps.push(now);

        if (!queryOnly) {
          if (rateState.inFlightKinds.has(normalizedKind)) {
            sendPermissionResult(
              requestId,
              normalizedKind,
              false,
              "denied",
              "Duplicate concurrent permission request rejected"
            );
            return;
          }
          const kindHistory = (rateState.interactiveByKind.get(normalizedKind) || []).filter(
            (t) => now - t < PERM_WINDOW_MS
          );
          if (kindHistory.length >= MAX_INTERACTIVE_PER_KIND_WINDOW) {
            rateState.interactiveByKind.set(normalizedKind, kindHistory);
            sendPermissionResult(
              requestId,
              normalizedKind,
              false,
              "denied",
              `Repeated '${normalizedKind}' requests rate-limited`
            );
            return;
          }
          kindHistory.push(now);
          rateState.interactiveByKind.set(normalizedKind, kindHistory);
        }

        if (!onRequestPermission) {
          sendPermissionResult(
            requestId,
            normalizedKind,
            false,
            "denied",
            "Permission handler unavailable (default deny)"
          );
          return;
        }

        if (!queryOnly) {
          rateState.inFlightKinds.add(normalizedKind);
        }

        Promise.resolve(
          onRequestPermission({
            tabId: tab.id,
            url: tab.url,
            kind: normalizedKind,
            queryOnly,
          })
        )
          .then((res) => {
            const allowed = Boolean(res?.allowed);
            const state = res?.state || (allowed ? "granted" : "denied");
            const reason = res?.reason || (allowed ? "Permission granted" : "Permission denied");
            sendPermissionResult(requestId, normalizedKind, allowed, state, reason);
          })
          .catch(() => {
            sendPermissionResult(
              requestId,
              normalizedKind,
              false,
              "denied",
              "Permission evaluation error (default deny)"
            );
          })
          .finally(() => {
            if (!queryOnly) {
              rateState.inFlightKinds.delete(normalizedKind);
            }
          });
        return;
      }

      if (data.type === "FULLSCREEN_CHANGE") {
        setIsFullscreenActive(Boolean(payload.isFullscreen));
        return;
      }

      if (data.type === "DOWNLOAD") {
        if (onDownloadStart && typeof payload.url === "string" && payload.url.trim()) {
          const filename = typeof payload.filename === "string" ? payload.filename : undefined;
          onDownloadStart(payload.url, filename);
        }
        return;
      }

      if (data.type === "OPEN_WINDOW") {
        if (typeof payload.url !== "string" || !payload.url.trim()) return;
        let dest = payload.url.trim();
        if (!isSafeNavigationScheme(dest)) return;
        try {
          dest = new URL(dest, tab.url).href;
        } catch {}
        if (!isSafeNavigationScheme(dest)) return;

        if (isGoogleAuthOrOAuthUrl(dest) && onGoogleAuthFallback) {
          onGoogleAuthFallback(dest, tab.id);
          return;
        }
        if (onOpenNewTab) {
          onOpenNewTab(dest, tab.id);
        }
        return;
      }

      if (data.type === "NAVIGATE") {
        if (typeof payload.url !== "string" || !payload.url.trim()) return;
        let dest = payload.url.trim();
        if (!isSafeNavigationScheme(dest)) return;
        try {
          dest = new URL(dest, tab.url).href;
        } catch {}
        if (!isSafeNavigationScheme(dest)) return;

        if (isGoogleAuthOrOAuthUrl(dest) && onGoogleAuthFallback) {
          onGoogleAuthFallback(dest, tab.id);
          return;
        }
        if (payload.isNewWindow && onOpenNewTab) {
          onOpenNewTab(dest, tab.id);
          return;
        }
        onNavigate(dest, tab.id);
        return;
      }

      if (data.type === "FORM_SUBMIT") {
        if (tab.isLoading) return;
        const rawAction = typeof payload.actionUrl === "string" ? payload.actionUrl.trim() : tab.url;
        if (!rawAction || !isSafeNavigationScheme(rawAction)) return;
        let actionUrl = rawAction;
        try {
          actionUrl = new URL(rawAction, tab.url).href;
        } catch {}
        if (!isSafeNavigationScheme(actionUrl)) return;

        if (isGoogleAuthOrOAuthUrl(actionUrl) && onGoogleAuthFallback) {
          onGoogleAuthFallback(actionUrl, tab.id);
          return;
        }

        const method = payload.method === "POST" ? "POST" : "GET";
        const paramsStr = typeof payload.params === "string" ? payload.params : "";

        if (method === "POST") {
          onNavigate(actionUrl, tab.id, false, undefined, undefined, {
            method: "POST",
            postBody: paramsStr,
            contentType: "application/x-www-form-urlencoded",
          });
        } else {
          const fullUrl = paramsStr
            ? actionUrl.includes("?")
              ? `${actionUrl}&${paramsStr}`
              : `${actionUrl}?${paramsStr}`
            : actionUrl;
          onNavigate(fullUrl, tab.id);
        }
      }
    };

    window.addEventListener("message", handleFrameMessage);
    return () => {
      window.removeEventListener("message", handleFrameMessage);
    };
  }, [
    isNativeMode,
    tab.id,
    tab.url,
    tab.isLoading,
    onNavigate,
    onOpenNewTab,
    onDownloadStart,
    onGoogleAuthFallback,
    onRequestPermission,
  ]);

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    setIsFrameLoading(false);
    setFrameLoadError(null);
    const iframe = e.currentTarget;
    const factor = ((tab.zoomLevel || 100) / 100).toString();

    if (isJsAllowed) {
      // In allow-scripts mode, allow-same-origin is omitted; sync zoom and notification permission via postMessage
      const isHttps = Boolean(tab.url && tab.url.trim().toLowerCase().startsWith("https://"));
      const notifSetting = siteOverride?.notifications;
      const syncedPerm =
        !isHttps || !notifSetting || notifSetting === "block"
          ? "denied"
          : notifSetting === "allow"
          ? "granted"
          : "default";
      try {
        iframe.contentWindow?.postMessage(
          { __netflowHostCmd: "SET_ZOOM", tabId: tab.id, zoomFactor: factor },
          "*"
        );
        iframe.contentWindow?.postMessage(
          {
            __netflowHostCmd: "SYNC_NOTIFICATION_PERMISSION",
            tabId: tab.id,
            token: frameTokenRef.current,
            permission: syncedPerm,
          },
          "*"
        );
      } catch {}
      return;
    }

    // Fallback when siteOverride.javascript === "block" (scripts disabled, allow-same-origin active)
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Apply Page Zoom / Text Scaling factor to static iframe document
      try {
        if (doc.documentElement) {
          (doc.documentElement.style as any).zoom = factor;
        }
        if (doc.body) {
          (doc.body.style as any).zoom = factor;
        }
      } catch {}

      try {
        const handleDocFullscreen = () => {
          const isFs = Boolean(
            doc.fullscreenElement ||
            (doc as any).webkitFullscreenElement
          );
          setIsFullscreenActive(isFs);
        };
        doc.addEventListener("fullscreenchange", handleDocFullscreen);
        doc.addEventListener("webkitfullscreenchange", handleDocFullscreen);
      } catch {}

      // Intercept anchor link clicks inside static frame
      doc.addEventListener("click", (evt: MouseEvent) => {
        const target = evt.target as HTMLElement;
        const anchor = target?.closest("a");
        if (!anchor) return;

        const rawHref = anchor.getAttribute("href");
        if (!rawHref || rawHref.startsWith("#")) return;

        const lowerHref = rawHref.trim().toLowerCase();

        // Safe Download Delegation: If link has download attribute or is a blob:/data: resource, delegate to download boundary
        if (anchor.hasAttribute("download") || lowerHref.startsWith("blob:") || (lowerHref.startsWith("data:") && !lowerHref.startsWith("data:text/html"))) {
          if (onDownloadStart) {
            evt.preventDefault();
            const declaredFilename = anchor.getAttribute("download") || undefined;
            onDownloadStart(rawHref, declaredFilename);
            return;
          }
        }

        if (
          lowerHref.startsWith("javascript:") ||
          lowerHref.startsWith("data:") ||
          lowerHref.startsWith("file:") ||
          lowerHref.startsWith("blob:") ||
          lowerHref.startsWith("vbscript:")
        ) {
          evt.preventDefault();
          return;
        }

        evt.preventDefault();
        let dest = rawHref;
        try {
          dest = new URL(rawHref, tab.url).href;
        } catch {}

        if (isGoogleAuthOrOAuthUrl(dest)) {
          if (onGoogleAuthFallback) {
            onGoogleAuthFallback(dest, tab.id);
            return;
          }
        }

        const targetAttr = (anchor.getAttribute("target") || "").trim().toLowerCase();
        const isNewWindow = targetAttr === "_blank" || targetAttr === "_new";
        if (isNewWindow && onOpenNewTab) {
          onOpenNewTab(dest, tab.id);
          return;
        }

        onNavigate(dest, tab.id);
      }, true);

      // Keyboard & Virtual Focus: Ensure inputs, passwords, textareas scroll smoothly into view
      doc.addEventListener("focusin", (e: FocusEvent) => {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target?.getAttribute("contenteditable") === "true"
        ) {
          try {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch {}
        }
      });

      // Intercept form submissions inside static frame
      doc.addEventListener("submit", (evt: Event) => {
        if (tab.isLoading) {
          evt.preventDefault();
          return;
        }

        const form = evt.target as HTMLFormElement;
        if (!form) return;
        evt.preventDefault();

        let actionUrl = form.getAttribute("action") || tab.url;
        try {
          actionUrl = new URL(actionUrl, tab.url).href;
        } catch {}

        if (isGoogleAuthOrOAuthUrl(actionUrl)) {
          if (onGoogleAuthFallback) {
            onGoogleAuthFallback(actionUrl, tab.id);
            return;
          }
        }

        const method = (form.getAttribute("method") || "GET").toUpperCase() as "GET" | "POST";
        let formData: FormData;
        try {
          const submitter = (evt as any).submitter;
          formData = submitter ? new FormData(form, submitter) : new FormData(form);
        } catch {
          formData = new FormData(form);
        }
        const params = new URLSearchParams();
        formData.forEach((val, key) => {
          if (typeof val === "string") {
            params.append(key, val);
          } else if (val && typeof (val as any).name === "string") {
            params.append(key, (val as any).name);
          }
        });

        if (method === "POST") {
          onNavigate(actionUrl, tab.id, false, undefined, undefined, {
            method: "POST",
            postBody: params.toString(),
            contentType: "application/x-www-form-urlencoded",
          });
        } else {
          const fullUrl = actionUrl.includes("?") ? `${actionUrl}&${params.toString()}` : `${actionUrl}?${params.toString()}`;
          onNavigate(fullUrl, tab.id);
        }
      }, true);
    } catch {
      // Cross-origin access restrictions handled safely
    }
  }, [isJsAllowed, tab.url, tab.id, tab.isLoading, tab.zoomLevel, onNavigate, onOpenNewTab, onDownloadStart, onGoogleAuthFallback]);

  // Page Zoom / Text Scaling state and live sync
  const [showZoomToast, setShowZoomToast] = useState(false);
  const prevZoomRef = useRef(currentZoom);

  useEffect(() => {
    if (prevZoomRef.current !== currentZoom) {
      prevZoomRef.current = currentZoom;
      setShowZoomToast(true);
      const timer = setTimeout(() => setShowZoomToast(false), 1400);
      return () => clearTimeout(timer);
    }
  }, [currentZoom]);

  // Apply zoom factor to native iframe on zoom change or load
  useEffect(() => {
    if (!isNativeMode) return;
    const factor = (currentZoom / 100).toString();
    const iframe = iframeRef.current;
    if (!iframe) return;

    if (isJsAllowed) {
      try {
        iframe.contentWindow?.postMessage(
          { __netflowHostCmd: "SET_ZOOM", tabId: tab.id, zoomFactor: factor },
          "*"
        );
      } catch {}
      return;
    }

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        if (doc.documentElement) {
          (doc.documentElement.style as any).zoom = factor;
        }
        if (doc.body) {
          (doc.body.style as any).zoom = factor;
        }
      }
    } catch {
      // Safe sandbox boundary
    }
  }, [isNativeMode, isJsAllowed, currentZoom, activeHtml, tab.id]);

  const [findQuery, setFindQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [matches, setMatches] = useState<HTMLElement[]>([]);

  const updateActiveMatch = useCallback((index: number, currentMatches: HTMLElement[]) => {
    if (currentMatches.length === 0) return;
    currentMatches.forEach((m, idx) => {
      if (idx === index) {
        m.className =
          "netflow-find-match bg-amber-400 dark:bg-amber-400 text-stone-950 font-bold ring-2 ring-amber-500 ring-offset-1 rounded-xs px-0.5 shadow-xs";
        m.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        m.className =
          "netflow-find-match bg-amber-200 dark:bg-amber-400/40 text-stone-900 dark:text-stone-100 rounded-xs px-0.5";
      }
    });
  }, []);

  // Clear or refocus find in page on open/close
  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    if (isFindInPageOpen) {
      focusTimer = setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 50);
    } else {
      const el = containerRef.current;
      if (el) {
        clearHighlights(el);
      }
      setMatches([]);
      setActiveMatchIndex(0);
    }
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [isFindInPageOpen]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => {
      const el = containerRef.current;
      if (el) {
        clearHighlights(el);
      }
    };
  }, []);

  // Synchronize Native Android Chromium WebView viewport bounds when rendering via real Android WebView
  useEffect(() => {
    if (!isRealAndroidNativeEngineActive || !onSyncNativeViewportBounds) return;
    const reportBounds = () => {
      const el = nativeViewportRef.current || containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clampedWidth = Math.max(0, Math.round(rect.width));
      const clampedHeight = Math.max(0, Math.round(rect.height));
      onSyncNativeViewportBounds({
        left: Math.max(0, Math.round(rect.left)),
        top: Math.max(0, Math.round(rect.top)),
        width: clampedWidth,
        height: clampedHeight,
        visible: !tab.error && !tab.errorInfo && clampedWidth > 0 && clampedHeight > 0,
      });
    };
    reportBounds();
    window.addEventListener("resize", reportBounds);
    window.addEventListener("scroll", reportBounds, true);
    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && nativeViewportRef.current) {
      resizeObs = new ResizeObserver(reportBounds);
      resizeObs.observe(nativeViewportRef.current);
    }
    return () => {
      window.removeEventListener("resize", reportBounds);
      window.removeEventListener("scroll", reportBounds, true);
      if (resizeObs) resizeObs.disconnect();
      onSyncNativeViewportBounds({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        visible: false,
      });
    };
  }, [
    isRealAndroidNativeEngineActive,
    onSyncNativeViewportBounds,
    tab.id,
    tab.url,
    tab.error,
    tab.errorInfo,
    isFindInPageOpen,
  ]);

  // Update matches when query or page content changes while Find is open
  useEffect(() => {
    if (isRealAndroidNativeEngineActive) {
      if (isFindInPageOpen) {
        onNativeFindInPage?.(tab.id, findQuery);
      }
      return;
    }
    const el = containerRef.current;
    if (!el || !isFindInPageOpen) return;

    const found = performFind(el, findQuery);
    setMatches(found);
    setActiveMatchIndex(0);
    if (found.length > 0) {
      updateActiveMatch(0, found);
    }
  }, [findQuery, activeHtml, isFindInPageOpen, updateActiveMatch, isRealAndroidNativeEngineActive, onNativeFindInPage, tab.id]);

  const handleNextMatch = () => {
    if (isRealAndroidNativeEngineActive) {
      onNativeFindNext?.(tab.id, true);
      return;
    }
    if (matches.length === 0) return;
    const nextIndex = (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(nextIndex);
    updateActiveMatch(nextIndex, matches);
  };

  const handlePrevMatch = () => {
    if (isRealAndroidNativeEngineActive) {
      onNativeFindNext?.(tab.id, false);
      return;
    }
    if (matches.length === 0) return;
    const prevIndex = (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prevIndex);
    updateActiveMatch(prevIndex, matches);
  };

  const handleCloseFind = () => {
    if (isRealAndroidNativeEngineActive) {
      onNativeClearFind?.(tab.id);
    }
    const el = containerRef.current;
    if (el) {
      clearHighlights(el);
    }
    setMatches([]);
    setFindQuery("");
    setActiveMatchIndex(0);
    onCloseFindInPage?.();
  };

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCloseFind();
    }
  };

  // Intercept anchor clicks inside rendered HTML so user stays inside NETFLOW browser
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // FORM-B2 PART 2: Intercept Tap-to-Load Image placeholder buttons in Text-Only / Light Mode
      const loadImgBtn = target.closest("[data-netflow-load-img]") as HTMLElement | null;
      if (loadImgBtn) {
        const imgUrl = loadImgBtn.getAttribute("data-netflow-load-img");
        if (imgUrl && onLoadSingleImage) {
          e.preventDefault();
          e.stopPropagation();
          onLoadSingleImage(imgUrl);
          return;
        }
      }

      const anchor = target.closest("a");
      const cardWithUrl = target.closest("[data-netflow-url]") as HTMLElement | null;
      if (!anchor && !cardWithUrl) return;

      const rawHref = anchor ? anchor.getAttribute("href") : cardWithUrl?.getAttribute("data-netflow-url");
      if (!rawHref || rawHref.startsWith("#")) {
        return;
      }

      const lowerHref = rawHref.trim().toLowerCase();

      // Safe Download Delegation: If link has download attribute or is a blob:/data: resource, delegate to download boundary
      if (
        anchor.hasAttribute("download") ||
        lowerHref.startsWith("blob:") ||
        (lowerHref.startsWith("data:") && !lowerHref.startsWith("data:text/html"))
      ) {
        if (onDownloadStart) {
          e.preventDefault();
          const declaredFilename = anchor.getAttribute("download") || undefined;
          onDownloadStart(rawHref, declaredFilename);
          return;
        }
      }

      if (
        lowerHref.startsWith("javascript:") ||
        lowerHref.startsWith("data:") ||
        lowerHref.startsWith("file:") ||
        lowerHref.startsWith("blob:") ||
        lowerHref.startsWith("vbscript:")
      ) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      let dest = rawHref;
      // Handle DuckDuckGo redirect link
      const uddgMatch = dest.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        try {
          dest = decodeURIComponent(uddgMatch[1]);
        } catch {}
      } else if (dest.startsWith("//")) {
        dest = "https:" + dest;
      } else if (dest.startsWith("/")) {
        try {
          const base = new URL(tab.url);
          dest = `${base.origin}${dest}`;
        } catch {}
      } else if (!dest.startsWith("http://") && !dest.startsWith("https://")) {
        try {
          dest = new URL(dest, tab.url).href;
        } catch {}
      }

      const targetAttr = (anchor.getAttribute("target") || "").trim().toLowerCase();
      const isNewWindow = targetAttr === "_blank" || targetAttr === "_new";

      // Controlled Safe Google Sign-In / OAuth external-browser fallback
      if (isGoogleAuthOrOAuthUrl(dest)) {
        if (onGoogleAuthFallback) {
          onGoogleAuthFallback(dest, tab.id);
          return;
        }
      }

      if (isNewWindow && onOpenNewTab) {
        onOpenNewTab(dest, tab.id);
        return;
      }

      onNavigate(dest, tab.id);
    };

    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("click", handleClick);
    };
  }, [activeHtml, tab.url, tab.id, onNavigate, onOpenNewTab, onDownloadStart, onGoogleAuthFallback, onLoadSingleImage]);

  // Intercept form submissions inside rendered HTML so user submits through NETFLOW
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleSubmit = (e: Event) => {
      // Prevent accidental duplicate submissions while loading is already in progress
      if (tab.isLoading) {
        e.preventDefault();
        return;
      }

      const form = (e.target as HTMLElement)?.closest("form") || (e.target as HTMLFormElement);
      if (!form || !(form instanceof HTMLFormElement)) return;

      e.preventDefault();

      // Resolve action URL
      const rawAction = form.getAttribute("action")?.trim() || "";
      const lowerAction = rawAction.toLowerCase();

      // Block dangerous schemes
      if (
        lowerAction.startsWith("javascript:") ||
        lowerAction.startsWith("data:") ||
        lowerAction.startsWith("file:")
      ) {
        return;
      }

      let actionUrl = tab.url;
      if (rawAction && rawAction !== "#") {
        try {
          actionUrl = new URL(rawAction, tab.url).href;
        } catch {
          if (rawAction.startsWith("//")) {
            actionUrl = "https:" + rawAction;
          } else if (rawAction.startsWith("/")) {
            try {
              const base = new URL(tab.url);
              actionUrl = `${base.origin}${rawAction}`;
            } catch {}
          }
        }
      }

      // Controlled Safe Google Sign-In / OAuth external-browser fallback
      // Security: Prevents sending user credentials (passwords, auth tokens) to NETFLOW proxy
      if (isGoogleAuthOrOAuthUrl(actionUrl)) {
        if (onGoogleAuthFallback) {
          onGoogleAuthFallback(actionUrl, tab.id);
          return;
        } else {
          onNavigate(actionUrl, tab.id);
          return;
        }
      }

      const method = (form.getAttribute("method") || "GET").toUpperCase();

      // Collect form fields using standard FormData
      let formData: FormData;
      try {
        const submitter = (e as any).submitter;
        formData = submitter ? new FormData(form, submitter) : new FormData(form);
      } catch {
        formData = new FormData(form);
      }

      const params = new URLSearchParams();
      for (const [key, value] of (formData as any).entries()) {
        if (typeof value === "string") {
          params.append(key, value);
        } else if (value && typeof (value as any).name === "string") {
          params.append(key, (value as any).name);
        }
      }

      if (method === "POST") {
        const postBody = params.toString();
        onNavigate(
          actionUrl,
          tab.id,
          false,
          undefined,
          undefined,
          {
            method: "POST",
            postBody,
            contentType: "application/x-www-form-urlencoded",
          }
        );
      } else {
        // Standard GET Form: encode submitted fields into action URL search params
        try {
          const urlObj = new URL(actionUrl);
          urlObj.search = params.toString();
          onNavigate(urlObj.href, tab.id);
        } catch {
          const sep = actionUrl.includes("?") ? "&" : "?";
          const queryStr = params.toString();
          onNavigate(queryStr ? `${actionUrl}${sep}${queryStr}` : actionUrl, tab.id);
        }
      }
    };

    el.addEventListener("submit", handleSubmit);
    return () => {
      el.removeEventListener("submit", handleSubmit);
    };
  }, [activeHtml, tab.url, tab.id, tab.isLoading, onNavigate, onGoogleAuthFallback]);

  // Google Sign-in & Web Form Input Interaction: Ensure "Email or phone" input field
  // responds immediately to touch/click, acquires focus, and invokes Android virtual keyboard.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Direct user tap/click handler for instant focus & keyboard invocation
    const handleInputInteraction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. Direct input/textarea tap
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (!target.disabled && !target.readOnly) {
          target.focus();
        }
        return;
      }

      // 2. Tap on Google Sign-in container, wrapper, or floating label
      const googleContainer = target.closest(
        '.rFrNMe, .Xb9hP, .aCsJod, .aXBtI, .Wic03c, [jscontroller="pxq3x"], [data-allow-at-sign], .AxOyFc, .snByac, [jsname="YRMmle"]'
      );
      if (googleContainer) {
        const input = (googleContainer.querySelector("input#identifierId, input[name='identifier'], input.whsOnd, input") ||
          el.querySelector("#identifierId, input[name='identifier']")) as HTMLInputElement | null;
        if (input && !input.disabled && !input.readOnly) {
          input.focus();
          const len = input.value.length;
          try {
            input.setSelectionRange(len, len);
          } catch {}
          return;
        }
      }

      // 3. Tap on any element with text or aria-label matching "Email or phone"
      if (
        target.getAttribute("aria-label")?.toLowerCase().includes("email or phone") ||
        target.textContent?.trim().toLowerCase() === "email or phone"
      ) {
        const input = el.querySelector("#identifierId, input[name='identifier'], input[type='email'], input[type='text']") as HTMLInputElement | null;
        if (input && !input.disabled && !input.readOnly) {
          input.focus();
          return;
        }
      }
    };

    // Keep floating label elevated when user enters text
    const handleInputTyping = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement) {
        const rFrNMe = target.closest(".rFrNMe");
        if (rFrNMe) {
          if (target.value.trim().length > 0) {
            rFrNMe.classList.add("u3bW4e", "has-value");
          } else if (document.activeElement !== target) {
            rFrNMe.classList.remove("u3bW4e", "has-value");
          }
        }
      }
    };

    // Recheck label elevation on blur
    const handleInputBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement) {
        const rFrNMe = target.closest(".rFrNMe");
        if (rFrNMe && target.value.trim().length === 0) {
          rFrNMe.classList.remove("u3bW4e", "has-value");
        }
      }
    };

    // Keyboard & Virtual Focus: Ensure inputs, passwords, textareas scroll smoothly into view
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.getAttribute("contenteditable") === "true"
      ) {
        try {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {}
      }
    };

    // Attach interaction listeners: pointerdown, touchstart, click, and focusin
    el.addEventListener("click", handleInputInteraction);
    el.addEventListener("pointerdown", handleInputInteraction);
    el.addEventListener("touchstart", handleInputInteraction, { passive: true });
    el.addEventListener("focusin", handleFocusIn);
    el.addEventListener("input", handleInputTyping);
    el.addEventListener("focusout", handleInputBlur);

    return () => {
      el.removeEventListener("click", handleInputInteraction);
      el.removeEventListener("pointerdown", handleInputInteraction);
      el.removeEventListener("touchstart", handleInputInteraction);
      el.removeEventListener("focusin", handleFocusIn);
      el.removeEventListener("input", handleInputTyping);
      el.removeEventListener("focusout", handleInputBlur);
    };
  }, [activeHtml]);

  // Handle text selection for quick AI explain
  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 2 && selection.length < 100) {
      // highlighted a term
    }
  };

  if (isNativeEngineAvailable()) {
    // Return an empty transparent div. The actual Android WebView is rendered natively underneath/above this React layer.
    return <div className="w-full h-full bg-transparent pointer-events-none" />;
  }

  // 1. Loading State
  if (tab.isLoading) {
    const displayTarget = tab.url ? getCleanDomain(tab.url) : "page";
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 select-none">
        <div className="relative mb-4">
          <div className="w-12 h-12 rounded-full border-2 border-stone-200 dark:border-stone-800 border-t-emerald-600 animate-spin" />
          <Zap className="w-5 h-5 text-emerald-600 absolute inset-0 m-auto" />
        </div>
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100 max-w-md truncate px-4">
          Loading {displayTarget}...
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
          Filtering heavy trackers • Compressing assets for fast network delivery
        </p>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => onSetBrowsingMode("text-only")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
          >
            Switch to Text-Only (2G Fast)
          </button>
          {onCancelLoading && (
            <button
              id="btn-cancel-loading"
              onClick={onCancelLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-200/80 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            >
              Stop Loading
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. Error State / Web Page Recovery Center
  if (tab.error && (!viewCachedVersion || !tab.contentHtml)) {
    const errorInfo = tab.errorInfo;
    const statusCode = errorInfo?.statusCode;
    const retryAttempts = errorInfo?.retryAttempts || 0;
    const presentation = resolveRecoveryCenterPresentation({
      error: tab.error,
      errorInfo,
      url: tab.url,
      lang,
      isNavigatorOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
      networkMedium: networkState?.medium,
    });
    const {
      errorCode,
      effectiveKind,
      errorTitle,
      errorDescription,
      checklistItems,
      technicalDetails,
      isSslError,
      isOffline,
      isDns,
      isTimeout,
      isForbidden,
      isRateLimited,
      isServerError,
      isSecurityBlock,
    } = presentation;

    return (
      <div
        id="netflow-web-error-recovery-center"
        data-error-kind={isSslError ? "ssl" : effectiveKind || "generic"}
        role="region"
        aria-label={t.errorState.errorRecoveryCenter || "Web Page Recovery Center"}
        className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200"
      >
        <div className="max-w-lg w-full p-5 sm:p-7 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-md text-center space-y-4 my-auto animate-in fade-in zoom-in-95 duration-200">
          
          {/* Connectivity Restored Banner */}
          {isOnlineRestored && !isSslError && (
            <div
              id="netflow-connection-restored-banner"
              className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs font-medium animate-pulse"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  {lang === "bn"
                    ? "ইন্টারনেট সংযোগ পুনর্বহাল হয়েছে! পৃষ্ঠাটি লোড করতে রিলোড ট্যাপ করুন।"
                    : "Internet connection restored! Tap Reload to connect."}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleUserRetry()}
                  disabled={retryCooldown > 0}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shrink-0 transition-colors cursor-pointer"
                >
                  {t.errorState.retry}
                </button>
                <button
                  id="btn-dismiss-connection-restored-banner"
                  type="button"
                  onClick={handleDismissOnlineRestored}
                  className="px-2 py-1 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs shrink-0 transition-colors cursor-pointer"
                >
                  {t.resilience.btnDismiss}
                </button>
              </div>
            </div>
          )}

          {/* Icon Badge */}
          <div
            className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center shadow-xs ${
              isSslError
                ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                : isOffline
                ? "bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300"
                : isDns
                ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                : isTimeout
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                : isForbidden
                ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                : isRateLimited
                ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300"
                : isServerError
                ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                : isSecurityBlock
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
            }`}
          >
            {isSslError ? (
              <ShieldAlert className="w-7 h-7" />
            ) : isOffline ? (
              <WifiOff className="w-7 h-7" />
            ) : isDns ? (
              <Globe className="w-7 h-7" />
            ) : isTimeout ? (
              <Clock className="w-7 h-7" />
            ) : isForbidden ? (
              <Lock className="w-7 h-7" />
            ) : isRateLimited ? (
              <Radio className="w-7 h-7" />
            ) : isServerError ? (
              <ServerCrash className="w-7 h-7" />
            ) : isSecurityBlock ? (
              <Shield className="w-7 h-7" />
            ) : (
              <AlertCircle className="w-7 h-7" />
            )}
          </div>

          {/* Heading & Chrome-like Error Code */}
          <div className="space-y-1.5">
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 break-words leading-tight">
              {errorTitle}
            </h2>
            {isSslError && (
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {t.sslErrorSubtitle || "This site's security certificate cannot be trusted"}
              </p>
            )}
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 break-words leading-relaxed max-w-md mx-auto">
              {errorDescription}
            </p>
            <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
              <span
                id="netflow-error-code-badge"
                className="font-mono text-[11px] font-semibold px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200/70 dark:border-stone-700/70 tracking-tight"
              >
                {errorCode}
              </span>
              {isSslError && errorInfo?.sslHost && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                  {errorInfo.sslHost}
                </span>
              )}
              {isSslError && errorInfo?.sslPrimaryError !== undefined && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                  SSL_ERR_{errorInfo.sslPrimaryError}
                </span>
              )}
              {statusCode && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                  HTTP {statusCode}
                </span>
              )}
              {retryAttempts > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  {lang === "bn" ? `চেষ্টা: ${retryAttempts}` : `Attempts: ${retryAttempts}`}
                </span>
              )}
            </div>
          </div>

          {/* Try Checklist Box (FORM 9 PART F.1: High-contrast theme-aware colors >= 4.5:1 in light and dark mode) */}
          <div
            id="netflow-recovery-checklist-box"
            className={`p-3.5 rounded-2xl text-xs text-left space-y-1.5 border ${RECOVERY_CHECKLIST_THEME_COLORS.light.containerClass} ${RECOVERY_CHECKLIST_THEME_COLORS.dark.containerClass}`}
          >
            <p
              id="netflow-recovery-checklist-heading"
              className={`font-semibold flex items-center gap-1.5 ${RECOVERY_CHECKLIST_THEME_COLORS.light.headingClass} ${RECOVERY_CHECKLIST_THEME_COLORS.dark.headingClass}`}
            >
              <span>{t.errorState.tryChecklistTitle || "Try:"}</span>
            </p>
            <ul className="space-y-1 pl-1 text-[11.5px] leading-relaxed">
              {checklistItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-stone-500 dark:text-stone-300">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Primary Action Buttons */}
          {isSslError ? (
            /* Part D: SSL Recovery Center has ONLY Go back and Home buttons — NEVER "proceed anyway" */
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                id="error-recovery-go-back-btn"
                type="button"
                onClick={canGoBack && onGoBack ? onGoBack : onGoHome}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t.sslErrorGoBack || t.errorState.goBack}</span>
              </button>
              <button
                id="error-recovery-go-home-btn"
                type="button"
                onClick={onGoHome}
                className="py-2.5 px-4 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" />
                <span>{t.sslErrorGoHome || t.errorState.goHome}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              {/* Primary Reload Button with anti-loop protection */}
              <button
                id="error-recovery-reload-btn"
                type="button"
                disabled={retryCooldown > 0}
                onClick={() => handleUserRetry()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/60 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <RotateCw className={`w-3.5 h-3.5 ${retryCooldown > 0 ? "animate-spin" : ""}`} />
                <span>
                  {retryCooldown > 0
                    ? (t.errorState.cooldownWait?.(retryCooldown) || `Wait ${retryCooldown}s...`)
                    : t.errorState.retry}
                </span>
              </button>

              {/* If offline capsule is saved and available */}
              {isOfflineCapsuleAvailable && onOpenOfflineCapsule && (
                <button
                  id="error-recovery-capsule-btn"
                  type="button"
                  onClick={onOpenOfflineCapsule}
                  className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-medium border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t.errorState.viewOfflineCapsule || "Open Saved Offline Capsule"}</span>
                </button>
              )}

              {/* Keep Viewing Loaded Page (From Cache) if contentHtml exists */}
              {tab.contentHtml && (
                <button
                  id="error-recovery-keep-content-btn"
                  type="button"
                  onClick={() => setViewCachedVersion(true)}
                  className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>{t.errorState.keepViewingLoaded}</span>
                </button>
              )}

              {/* Switch to Data Saver Proxy (smart-compress) */}
              {onSetBrowsingMode && browsingMode !== "smart-compress" && (
                <button
                  id="error-recovery-smart-compress-btn"
                  type="button"
                  onClick={() => {
                    onSetBrowsingMode("smart-compress");
                    handleUserRetry("smart-compress");
                  }}
                  className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-medium border border-stone-200 dark:border-stone-700/60 transition-colors cursor-pointer"
                >
                  {t.errorState.retrySmartCompress || "Try Data Saver Proxy"}
                </button>
              )}

              {/* Switch to Text-Only (2G Fast) */}
              {onSetBrowsingMode && browsingMode !== "text-only" && (
                <button
                  id="error-recovery-text-only-btn"
                  type="button"
                  onClick={() => {
                    if (tab.url && !canUseProxyFallback(tab.url, tab)) {
                      setProxyBlockedNotice(
                        lang === "bn"
                          ? PROXY_FALLBACK_BLOCKED_MESSAGE_BN
                          : PROXY_FALLBACK_BLOCKED_MESSAGE_EN
                      );
                      return;
                    }
                    setProxyBlockedNotice(null);
                    onSetBrowsingMode("text-only");
                    handleUserRetry("text-only");
                  }}
                  className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  {t.errorState.retryTextOnly}
                </button>
              )}

              {/* Honest message when Text-only proxy fallback is disallowed for interactive/signed-in page */}
              {proxyBlockedNotice && (
                <div
                  id="error-recovery-proxy-blocked-notice"
                  role="status"
                  className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs text-left space-y-1.5"
                >
                  <p className="font-medium">{proxyBlockedNotice}</p>
                  {onToggleLightMode && !tab.lightMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setProxyBlockedNotice(null);
                        onToggleLightMode();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] cursor-pointer"
                    >
                      {lang === "bn" ? "লাইট মোড চালু করুন (Try Light Mode)" : "Try Light Mode"}
                    </button>
                  )}
                </div>
              )}

              {/* FORM-B2 PART 3: Queue and open when online (non-private tabs only) */}
              {isOffline && tab.url && !tab.isPrivate && onQueueWhenOnline && (
                <button
                  id="error-recovery-queue-online-btn"
                  type="button"
                  onClick={() => onQueueWhenOnline(tab.url)}
                  disabled={isUrlQueuedForOnline}
                  className="w-full py-2 px-4 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 disabled:opacity-70 text-sky-900 dark:text-sky-200 rounded-xl text-xs font-semibold border border-sky-200 dark:border-sky-800/70 transition-colors cursor-pointer"
                >
                  {isUrlQueuedForOnline
                    ? lang === "bn"
                      ? "অনলাইনে এলে খোলার জন্য কিউতে রাখা হয়েছে ✓"
                      : "Queued to open when online ✓"
                    : lang === "bn"
                    ? "অনলাইনে এলে কিউ থেকে খুলুন (Queue and open when online)"
                    : "Queue and open when online"}
                </button>
              )}

              {/* FORM-B2 PART 1 & 3: Saved Offline Capsules list when offline */}
              {isOffline && offlineCapsules.length > 0 && onOpenSpecificCapsule && (
                <div
                  id="error-recovery-saved-capsules-list"
                  className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-left space-y-1.5"
                >
                  <p className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                    {t.resilience?.savedOfflineCapsulesHeading || "Saved Offline Capsules on Device:"}
                  </p>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {offlineCapsules.slice(0, 6).map((cap) => (
                      <button
                        key={cap.id}
                        type="button"
                        onClick={() => onOpenSpecificCapsule(cap.id)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-900 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 border border-emerald-200/70 dark:border-emerald-800/60 text-xs text-stone-800 dark:text-stone-200 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate font-medium">{cap.title || cap.url}</span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 shrink-0">
                          {formatBytes(cap.byteSize)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation fallbacks: Go Back / Go Home */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {canGoBack && onGoBack ? (
                  <button
                    id="error-recovery-go-back-btn"
                    type="button"
                    onClick={onGoBack}
                    className="py-2 px-3 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>{t.errorState.goBack}</span>
                  </button>
                ) : (
                  <div />
                )}

                {onGoHome && (
                  <button
                    id="error-recovery-go-home-btn"
                    type="button"
                    onClick={onGoHome}
                    className="py-2 px-3 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Home className="w-3 h-3" />
                    <span>{t.errorState.goHome}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Collapsible Technical Diagnostics */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 text-left">
            <button
              id="netflow-diagnostics-toggle-btn"
              type="button"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors py-1 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>{lang === "bn" ? "কারিগরি বিবরণ ও নেটওয়ার্ক স্থিতি" : "Technical Details & Diagnostics"}</span>
              </span>
              {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showDiagnostics && (
              <div
                id="netflow-diagnostics-panel"
                className="mt-2 p-3 rounded-xl bg-stone-100 dark:bg-stone-850 font-mono text-[10.5px] text-stone-600 dark:text-stone-300 space-y-1.5 border border-stone-200 dark:border-stone-700/60"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-stone-500">Error Code:</span>
                  <span className="font-bold text-stone-800 dark:text-stone-200">{errorCode}</span>
                </div>
                {statusCode && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-stone-500">HTTP Status:</span>
                    <span className="text-stone-800 dark:text-stone-200">{statusCode}</span>
                  </div>
                )}
                <div className="flex justify-between items-start gap-2">
                  <span className="text-stone-500 shrink-0">Target URL:</span>
                  <span className="truncate max-w-[240px] text-stone-800 dark:text-stone-200" title={tab.url}>
                    {sanitizeUrlForErrorDisplay(tab.url || "")}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-stone-500">Network Medium:</span>
                  <span className="text-stone-800 dark:text-stone-200 capitalize">
                    {networkState?.medium || (navigator.onLine ? "online" : "offline")}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-stone-500">Recorded At:</span>
                  <span className="text-stone-800 dark:text-stone-200">
                    {formatDate(errorInfo?.timestamp || Date.now(), lang)}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-stone-500">Isolation Boundary:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">Per-Tab Isolated ({tab.id})</span>
                </div>
                {technicalDetails && (
                  <div className="flex justify-between items-start gap-2 pt-1 border-t border-stone-200/70 dark:border-stone-700/60">
                    <span className="text-stone-500 shrink-0">Technical Reason:</span>
                    <span className="text-right break-all text-stone-700 dark:text-stone-300">
                      {technicalDetails}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (ytVideoId) {
    return (
      <div className="flex-1 flex flex-col bg-stone-950 text-white w-full h-full min-h-[500px]">
        {/* Player Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-stone-900 border-b border-stone-800 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shrink-0" />
            <span className="font-bold text-red-500 tracking-wide">YouTube Player</span>
            <span className="text-stone-400 font-mono text-[11px] truncate max-w-[150px] sm:max-w-xs">
              ID: {ytVideoId}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate("https://www.youtube.com")}
              className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors cursor-pointer"
            >
              {lang === "bn" ? "ইউটিউব পোর্টাল" : "YouTube Portal"}
            </button>
          </div>
        </div>

        {/* Player Canvas with dedicated YouTube iframe sandbox allowing HTML5 video playback */}
        <div className="flex-1 flex items-center justify-center p-2 sm:p-6 bg-black">
          <div className="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-stone-800/80 bg-stone-900 flex items-center justify-center">
            <iframe
              key={`yt-${ytVideoId}`}
              title="YouTube Video Player"
              src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=1&rel=0`}
              sandbox="allow-same-origin allow-scripts allow-presentation allow-forms"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen={true}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </div>
    );
  }

  if (isYtPortal) {
    return (
      <YouTubeFallbackPortal
        currentUrl={tab.url}
        lang={lang}
        onNavigate={onNavigate}
      />
    );
  }

  if (isFbPage) {
    return (
      <FacebookViewer
        tab={tab}
        lang={lang}
        onNavigate={onNavigate}
        onRetry={handleUserRetry}
      />
    );
  }

  // Graceful empty state for restored tabs without content
  if (tab.url && !tab.contentHtml && !tab.isLoading && !tab.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-600 dark:text-stone-300 select-none">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mb-3 text-emerald-600 dark:text-emerald-400">
          <RotateCw className="w-6 h-6 animate-pulse" />
        </div>
        <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
          {lang === "bn" ? "সেশন পুনরুদ্ধার করা হয়েছে" : "Session Restored"}
        </h4>
        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
          {lang === "bn"
            ? "পেজটি লোড করতে নিচে ক্লিক করুন অথবা অপেক্ষা করুন..."
            : "Page content is loading, or click below to fetch now..."}
        </p>
        <button
          type="button"
          onClick={() => onRetry()}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
        >
          <RotateCw className="w-3.5 h-3.5" />
          {lang === "bn" ? "পেজ লোড করুন" : "Load Page"}
        </button>
      </div>
    );
  }

  // 3. Loaded Content View
  const stats = tab.stats;
  const shouldUseDarkCapableSurface =
    Boolean(tab.isReaderMode) ||
    isRealAndroidNativeEngineActive ||
    proxiedPageTheme.supportsDarkScheme;

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 relative overflow-hidden ${
        shouldUseDarkCapableSurface ? "bg-white dark:bg-stone-900" : "bg-white"
      }`}
    >
      {/* Sticky Offline / Degraded In-Page Alert Banner atop cached content */}
      {tab.error && viewCachedVersion && tab.contentHtml && (
        <div
          id="netflow-cached-offline-banner"
          role="alert"
          className="sticky top-0 z-35 flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/15 dark:bg-amber-950/80 backdrop-blur-md border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-semibold truncate">
              {lang === "bn"
                ? "অফলাইন / সংযোগ ত্রুটি • ক্যাশ থেকে পূর্ববর্তী পৃষ্ঠা প্রদর্শিত হচ্ছে"
                : "Offline / Connection Error • Viewing previously loaded version from cache"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleUserRetry()}
              disabled={retryCooldown > 0}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-medium flex items-center gap-1 transition-colors cursor-pointer text-xs"
            >
              <RotateCw className={`w-3 h-3 ${retryCooldown > 0 ? "animate-spin" : ""}`} />
              <span>{retryCooldown > 0 ? `${retryCooldown}s` : t.errorState.retry}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewCachedVersion(false)}
              className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900 font-medium transition-colors cursor-pointer text-amber-900 dark:text-amber-100 text-xs"
            >
              {t.errorState.errorRecoveryCenter || "Recovery Center"}
            </button>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                className="p-1 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* In-Page Text Search Bar */}
      {isFindInPageOpen && (
        <div
          id="netflow-find-in-page-bar"
          role="search"
          aria-label={t.findInPage}
          className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 bg-stone-50/95 dark:bg-stone-850/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 shadow-sm text-xs select-none"
        >
          <div className="relative flex-1 max-w-sm sm:max-w-md flex items-center">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 pointer-events-none" />
            <input
              ref={findInputRef}
              id="netflow-find-input"
              type="text"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder={t.findPlaceholder}
              className="w-full pl-8 pr-20 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-stone-400"
            />
            <span
              id="netflow-find-counter"
              className="absolute right-2 text-[11px] text-stone-500 dark:text-stone-400 font-mono"
            >
              {findQuery.trim()
                ? isRealAndroidNativeEngineActive && nativeFindResult
                  ? nativeFindResult.numberOfMatches > 0
                    ? `${nativeFindResult.activeMatchOrdinal + 1}/${nativeFindResult.numberOfMatches}`
                    : t.noMatches
                  : matches.length > 0
                  ? `${activeMatchIndex + 1}/${matches.length}`
                  : t.noMatches
                : ""}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              id="netflow-find-prev-btn"
              type="button"
              onClick={handlePrevMatch}
              disabled={matches.length === 0}
              title={t.prevMatch}
              aria-label={t.prevMatch}
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed text-stone-700 dark:text-stone-300 transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            <button
              id="netflow-find-next-btn"
              type="button"
              onClick={handleNextMatch}
              disabled={matches.length === 0}
              title={t.nextMatch}
              aria-label={t.nextMatch}
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed text-stone-700 dark:text-stone-300 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            <button
              id="netflow-find-close-btn"
              type="button"
              onClick={handleCloseFind}
              title={t.closeFind}
              aria-label={t.closeFind}
              className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Translation In-Progress Notice */}
      {isTranslating && (
        <div
          id="netflow-translating-banner"
          className="sticky top-0 z-20 flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/90 text-amber-900 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800 text-xs font-medium shadow-xs"
        >
          <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
          <span>{t.translating}</span>
        </div>
      )}

      {/* Translation Failure Recovery Banner */}
      {tab.translation?.error && !isTranslating && (
        <div
          id="netflow-translation-error-banner"
          role="alert"
          className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-50/95 dark:bg-rose-950/90 backdrop-blur-md border-b border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-100 shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-medium truncate">
              {tab.translation.error}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-retry-translation"
              type="button"
              onClick={() => onTranslatePage?.(tab.translation?.targetLang || (lang === "bn" ? "bn" : "en"))}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-medium flex items-center gap-1 transition-colors cursor-pointer touch-manipulation"
              title={t.errorState.retry}
            >
              <RotateCw className="w-3 h-3" />
              <span>{t.errorState.retry}</span>
            </button>
            {onDismissTranslationError && (
              <button
                id="btn-dismiss-translation-error"
                type="button"
                onClick={onDismissTranslationError}
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 transition-colors cursor-pointer touch-manipulation"
                title={lang === "bn" ? "বার্তাটি বন্ধ করুন" : "Dismiss notice"}
                aria-label={lang === "bn" ? "বার্তাটি বন্ধ করুন" : "Dismiss notice"}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Translation Active Banner */}
      {isTranslated && (
        <div
          id="netflow-translation-banner"
          className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2 bg-emerald-50/95 dark:bg-emerald-950/90 backdrop-blur-md border-b border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-100 shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Languages className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium truncate">
              {tab.translation?.targetLang === "bn"
                ? t.pageTranslatedBanner || "পৃষ্ঠাটি বাংলায় অনুবাদ করা হয়েছে"
                : t.pageTranslatedBanner || "Page translated to English"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-view-original"
              type="button"
              onClick={onToggleTranslation}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900 font-medium transition-colors cursor-pointer"
            >
              {t.viewOriginal}
            </button>
            <button
              id="btn-retranslate"
              type="button"
              onClick={() => onTranslatePage?.(tab.translation?.targetLang === "bn" ? "en" : "bn")}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors cursor-pointer"
              title={tab.translation?.targetLang === "bn" ? "Translate to English" : "বাংলায় অনুবাদ"}
            >
              {tab.translation?.targetLang === "bn" ? "English" : "বাংলা"}
            </button>
          </div>
        </div>
      )}

      {/* Google Auth Fallback In-Page Banner */}
      {isGoogleAuthOrOAuthUrl(tab.url) && (
        <div
          id="netflow-google-auth-banner"
          className="sticky top-0 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/15 dark:bg-amber-950/80 backdrop-blur-md border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ExternalLink className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold block">
                {lang === "bn"
                  ? "Google সাইন-ইন শনাক্ত হয়েছে"
                  : "Google Sign-In / OAuth Detected"}
              </span>
              <span className="text-[11px] text-amber-800/90 dark:text-amber-300/80">
                {lang === "bn"
                  ? "এই Sign-In flow নিরাপদভাবে external browser-এ চালানো হবে।"
                  : "This sign-in flow should be securely completed in your external browser."}
              </span>
            </div>
          </div>
          <button
            id="btn-google-auth-launch-external"
            type="button"
            onClick={() => {
              if (onGoogleAuthFallback) {
                onGoogleAuthFallback(tab.url, tab.id);
              } else {
                launchSafeExternalBrowser(tab.url);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <span>{lang === "bn" ? "বাহ্যিক ব্রাউজারে খুলুন" : "Open in External Browser"}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Page Zoom Indicator Toast */}
      {showZoomToast && (
        <div
          id="netflow-zoom-toast"
          role="status"
          aria-live="polite"
          className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900/90 dark:bg-stone-800/95 text-stone-100 border border-stone-700/80 shadow-lg text-xs font-mono font-bold pointer-events-none animate-in fade-in zoom-in-95 duration-150"
        >
          <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
          <span>{lang === "bn" ? `জুম: ${currentZoom}%` : `Zoom: ${currentZoom}%`}</span>
        </div>
      )}

      {/* Scrollable sanitized web content or native WebView surface */}
      <div
        ref={containerRef}
        id="netflow_webview_container"
        onMouseUp={handleMouseUp}
        className={`flex-1 ${
          isNativeMode ? "flex flex-col h-full overflow-hidden p-0" : "overflow-y-auto px-4 sm:px-8 pt-6 pb-20"
        } ${
          shouldUseDarkCapableSurface
            ? "text-stone-900 dark:text-stone-100"
            : "bg-white text-stone-900"
        } selection:bg-emerald-200 selection:text-emerald-950`}
      >
        {isNativeMode ? (
          <div className="netflow-native-webview-container w-full h-full flex-1 flex flex-col min-h-[500px]">
            {/* Engine Status Header (Native Android WebView only when real bridge is active; otherwise Web Preview Proxy Sandbox) */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-300 shrink-0">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${isFrameLoading ? "bg-amber-500 animate-ping" : "bg-emerald-500 animate-pulse"}`} />
                <span
                  id="netflow-engine-status-label"
                  data-engine-kind={enginePresentation.engineKind}
                  className="font-medium text-emerald-700 dark:text-emerald-400"
                >
                  {enginePresentation.statusLabel}
                </span>
                {stats && stats.trackersBlocked > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <Shield className="w-3 h-3" />
                    {stats.trackersBlocked} {lang === "bn" ? "ট্র্যাকার ব্লকড" : "Trackers Blocked"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFrameLoadError(null);
                    setIsFrameLoading(true);
                    onRetry();
                  }}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-stone-200 dark:bg-stone-750 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition-colors cursor-pointer"
                  title={lang === "bn" ? "পেজ রিলোড করুন" : "Reload Page"}
                >
                  {lang === "bn" ? "রিলোড" : "Reload"}
                </button>
                {onSetBrowsingMode && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetBrowsingMode("smart-compress");
                      onRetry?.("smart-compress");
                    }}
                    className="px-2.5 py-1 rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                    title={lang === "bn" ? "প্রক্সি ডেটা সেভার মোডে স্যুইচ করুন" : "Switch to Data Saver Proxy"}
                  >
                    {lang === "bn" ? "প্রক্সি মোড" : "Data Saver"}
                  </button>
                )}
                {/* Site Mode quick toggle in Engine status bar */}
                {onSetSiteMode && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = siteMode === "default" ? "desktop" : siteMode === "desktop" ? "mobile" : "default";
                      onSetSiteMode(next);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                      siteMode === "desktop"
                        ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800"
                        : siteMode === "mobile"
                        ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                        : "bg-stone-200 dark:bg-stone-750 text-stone-700 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-700"
                    }`}
                    title={lang === "bn" ? "সাইট মোড পরিবর্তন করতে ক্লিক করুন" : "Click to toggle Site Mode"}
                  >
                    {siteMode === "desktop" ? (
                      <Monitor className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    ) : siteMode === "mobile" ? (
                      <Smartphone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Monitor className="w-3 h-3 text-stone-500" />
                    )}
                    <span>{siteMode === "desktop" ? "Desktop" : siteMode === "mobile" ? "Mobile" : "Auto"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* In-Frame Initialization Progress Indicator */}
            {isFrameLoading && (
              <div className="w-full h-0.5 bg-stone-200 dark:bg-stone-800 overflow-hidden shrink-0">
                <div className="h-full bg-emerald-500 animate-pulse w-full" />
              </div>
            )}

            {/* If frame load fails, show safe recovery card */}
            {frameLoadError ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-stone-50 dark:bg-stone-900 text-stone-700 dark:text-stone-300">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">
                  {lang === "bn" ? "ইন্টারেক্টিভ ফ্রেম লোড হতে সমস্যা হয়েছে" : "Interactive Frame Load Issue"}
                </h4>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
                  {frameLoadError}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setFrameLoadError(null);
                      setIsFrameLoading(true);
                      onRetry();
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    {lang === "bn" ? "রিলোড" : "Reload"}
                  </button>
                  {onSetBrowsingMode && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetBrowsingMode("smart-compress");
                        onRetry?.("smart-compress");
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors cursor-pointer"
                    >
                      {lang === "bn" ? "ডেটা সেভার প্রক্সি ট্রাই করুন" : "Try Data Saver Proxy"}
                    </button>
                  )}
                  {canGoBack && onGoBack && (
                    <button
                      type="button"
                      onClick={onGoBack}
                      className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
                    >
                      {lang === "bn" ? "ফিরে যান" : "Go Back"}
                    </button>
                  )}
                </div>
              </div>
            ) : isRealAndroidNativeEngineActive ? (
              /* Real Android System WebView (android.webkit.WebView) Content Viewport Surface */
              <div
                ref={nativeViewportRef}
                id="netflow-android-native-webview-surface"
                data-testid="native-webview-viewport"
                data-native-tab-id={tab.id}
                data-native-url={tab.url}
                data-native-site-mode={siteMode}
                data-native-zoom={currentZoom}
                className="flex-1 w-full h-full min-h-[500px] bg-transparent relative"
              />
            ) : !activeHtml || activeHtml.trim().length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-600 dark:text-stone-300">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3 text-stone-400">
                  <FileText className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
                  {lang === "bn" ? "কোনো কন্টেন্ট পাওয়া যায়নি" : "No Content Received"}
                </h4>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
                  {lang === "bn"
                    ? "ওয়েবসাইটটি একটি খালি পৃষ্ঠা পাঠিয়েছে। পুনরায় চেষ্টা করুন অথবা ডেটা সেভার মোড ব্যবহার করুন।"
                    : "The website returned an empty response. Try reloading or switch to Data Saver mode."}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => onRetry()}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    {lang === "bn" ? "রিলোড" : "Reload"}
                  </button>
                  {onSetBrowsingMode && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetBrowsingMode("smart-compress");
                        onRetry?.("smart-compress");
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition-colors cursor-pointer"
                    >
                      {lang === "bn" ? "ডেটা সেভার ট্রাই করুন" : "Try Data Saver"}
                    </button>
                  )}
                  {canGoBack && onGoBack && (
                    <button
                      type="button"
                      onClick={onGoBack}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
                    >
                      {lang === "bn" ? "পেছনে যান" : "Go Back"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Web Preview Proxy Sandboxed Iframe (used when real Android Native WebView is not active) */
              <iframe
                ref={iframeRef}
                title={enginePresentation.iframeTitle}
                srcDoc={iframeSrcDoc}
                sandbox={iframeSandbox}
                allow={iframeAllow}
                allowFullScreen
                onLoad={handleIframeLoad}
                onError={() => {
                  setIsFrameLoading(false);
                  setFrameLoadError(enginePresentation.frameErrorFallback);
                }}
                className={`flex-1 min-h-[500px] border-0 ${proxiedPageTheme.surfaceThemeClass} shadow-xs ${
                  siteMode === "desktop" ? "w-[1024px] min-w-[1024px] md:w-full" : "w-full"
                }`}
              />
            )}
          </div>
        ) : activeHtml ? (
          <div
            id="netflow-print-target"
            className={`netflow-content mx-auto origin-top transition-transform ${
              siteMode === "desktop" ? "w-[1024px] min-w-[1024px] max-w-6xl" : "max-w-4xl"
            }`}
            style={{
              zoom: currentZoom !== 100 ? `${currentZoom}%` : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: activeHtml }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-600 dark:text-stone-300">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3 text-stone-400">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
              {lang === "bn" ? "কোনো কন্টেন্ট পাওয়া যায়নি" : "No Content Received"}
            </h4>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
              {lang === "bn"
                ? "ওয়েবসাইটটি একটি খালি পৃষ্ঠা বা অসম্পূর্ণ রেসপন্স পাঠিয়েছে।"
                : "The website returned an empty or incomplete response."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => onRetry()}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <RotateCw className="w-3.5 h-3.5" />
                {lang === "bn" ? "রিলোড" : "Reload"}
              </button>
              {canGoBack && onGoBack && (
                <button
                  type="button"
                  onClick={onGoBack}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
                >
                  {lang === "bn" ? "পেছনে যান" : "Go Back"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Quick-Action Bar */}
      <div
        id="netflow-floating-bar"
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-stone-900/90 dark:bg-stone-850/95 backdrop-blur-md text-white rounded-full shadow-lg border border-stone-700/50 text-xs max-w-[calc(100%-1rem)] overflow-x-auto no-scrollbar shrink-0"
      >
        {/* Savings pill */}
        {stats && (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-mono text-[11px] shrink-0"
            title={`Original: ${formatBytes(stats.originalBytes)} → Saved: ${formatBytes(
              stats.savedBytes
            )}`}
          >
            <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="whitespace-nowrap">{stats.savedPercentage}% Saved</span>
          </div>
        )}

        {/* Page Zoom Quick Reset Pill */}
        {currentZoom !== 100 && (
          <button
            id="netflow-floating-zoom-badge"
            type="button"
            onClick={onZoomReset}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[11px] shrink-0 hover:bg-amber-500/30 transition-colors cursor-pointer"
            title={lang === "bn" ? "১০০% এ রিসেট করতে ক্লিক করুন" : "Click to reset to 100%"}
          >
            <ZoomIn className="w-3 h-3 text-amber-400" />
            <span>{currentZoom}%</span>
          </button>
        )}

        {/* Site Mode Quick Badge in Floating Bar */}
        {tab.siteMode && tab.siteMode !== "default" && (
          <button
            id="netflow-floating-sitemode-badge"
            type="button"
            onClick={() => onSetSiteMode?.("default")}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono text-[11px] shrink-0 hover:bg-blue-500/30 transition-colors cursor-pointer"
            title={lang === "bn" ? "অটো মোডে রিসেট করতে ক্লিক করুন" : "Click to revert to Auto"}
          >
            {tab.siteMode === "desktop" ? (
              <Monitor className="w-3 h-3 text-blue-400" />
            ) : (
              <Smartphone className="w-3 h-3 text-emerald-400" />
            )}
            <span>{tab.siteMode === "desktop" ? "Desktop" : "Mobile"}</span>
          </button>
        )}

        {/* One-Tap Full-Page Translation */}
        <button
          id="netflow-floating-translate-btn"
          type="button"
          onClick={() => {
            if (tab.translation?.translatedHtml) {
              onToggleTranslation?.();
            } else {
              onTranslatePage?.();
            }
          }}
          disabled={isTranslating}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors cursor-pointer shrink-0 ${
            isTranslated
              ? "bg-emerald-600 text-white font-medium shadow-xs"
              : isTranslating
              ? "bg-amber-600/80 text-white"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          }`}
          title={
            isTranslated
              ? t.viewOriginal
              : tab.translation?.targetLang === "en"
              ? t.translateToEn
              : t.translateToBn
          }
          aria-label={
            isTranslated
              ? t.viewOriginal
              : tab.translation?.targetLang === "en"
              ? t.translateToEn
              : t.translateToBn
          }
        >
          {isTranslating ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-200" />
          ) : (
            <Languages className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">
            {isTranslating
              ? t.translating
              : isTranslated
              ? t.viewOriginal
              : t.translatePage || "Translate"}
          </span>
        </button>

        {/* Find in page button */}
        <button
          id="netflow-floating-find-btn"
          type="button"
          aria-label={t.findInPage}
          onClick={() => (isFindInPageOpen ? handleCloseFind() : onOpenFindInPage?.())}
          className={`p-1.5 rounded-full transition-colors shrink-0 ${
            isFindInPageOpen
              ? "bg-amber-500 text-stone-950 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          }`}
          title={t.findInPage}
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        {/* Save to Offline Capsule */}
        <button
          id="netflow-floating-save-capsule-btn"
          type="button"
          aria-label={isCapsuleSaved ? "Saved to offline capsule" : "Save to offline capsule"}
          onClick={onSaveToOfflineCapsule}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors shrink-0 ${
            isCapsuleSaved
              ? "bg-emerald-600 text-white font-medium"
              : "hover:bg-stone-800 text-stone-300 hover:text-white"
          }`}
          title="Save for offline reading (0 internet needed)"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isCapsuleSaved ? "Saved Offline" : "Save Capsule"}</span>
        </button>

        {/* Smart AI Summary */}
        <button
          id="netflow-floating-ai-btn"
          type="button"
          aria-label="Smart AI Summary"
          onClick={onOpenAiModal}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-medium transition-colors cursor-pointer shrink-0"
          title="AI Summary with Gemini 3.8 Flash"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span className="hidden sm:inline">AI Summary</span>
        </button>

        {/* Reader View Toggle */}
        <button
          id="netflow-floating-reader-btn"
          type="button"
          aria-label="Toggle Reader Mode"
          onClick={onToggleReaderMode}
          className={`p-1 rounded-full transition-colors cursor-pointer shrink-0 ${
            tab.isReaderMode
              ? "text-emerald-400"
              : "text-stone-300 hover:text-white"
          }`}
          title="Toggle Reader Mode"
        >
          <BookOpen className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Exit Fullscreen Button */}
      {isFullscreenActive && (
        <button
          type="button"
          onClick={() => {
            try {
              if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
                if (document.exitFullscreen) {
                  document.exitFullscreen().catch(() => {});
                } else if ((document as any).webkitExitFullscreen) {
                  (document as any).webkitExitFullscreen();
                }
              } else if (isJsAllowed && iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                  { __netflowHostCmd: "EXIT_FULLSCREEN", tabId: tab.id },
                  "*"
                );
              } else if (!isJsAllowed && iframeRef.current?.contentDocument?.fullscreenElement) {
                iframeRef.current.contentDocument.exitFullscreen().catch(() => {});
              }
            } catch {}
            setIsFullscreenActive(false);
          }}
          className="fixed top-4 right-4 z-50 px-3 py-1.5 bg-stone-900/85 hover:bg-stone-900 text-white rounded-full text-xs font-medium backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-1.5 transition-opacity opacity-75 hover:opacity-100 cursor-pointer"
          title={lang === "bn" ? "ফুলস্ক্রিন থেকে প্রস্থান করুন" : "Exit Fullscreen"}
        >
          <X className="w-3.5 h-3.5" />
          <span>{lang === "bn" ? "প্রস্থান" : "Exit"}</span>
        </button>
      )}
    </div>
  );
};
