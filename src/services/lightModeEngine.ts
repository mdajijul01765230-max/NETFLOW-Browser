/**
 * NETFLOW BROWSER V2 — FORM B2 (`NETFLOW-RESILIENCE-LIGHTMODE-BUNDLE-01`)
 * PART 2 & PART 3 — Per-Tab Light Mode, Fallback Router, Text-Only/Reader Transform,
 * Tap-to-Load Images, Honest Offline Fast-Fail & Queue-When-Online Manager
 * (`src/services/lightModeEngine.ts`)
 */

import {
  BrowserTab,
  BrowsingMode,
  NetworkState,
  OfflineCapsule,
  PageStats,
  PendingNetworkRequest,
  SitePrivacyOverride,
} from "../types";
import { isBlockedSsrfHost } from "./nativeBrowserEngine";
import { isWeakNetwork } from "./networkEngine";
import { sanitizeUrlForSession } from "./sessionPersistence";

export type ModeInputAlias = BrowsingMode | "light" | "light-mode";

export type LightModeCacheMode =
  | "LOAD_DEFAULT"
  | "LOAD_CACHE_ELSE_NETWORK"
  | "LOAD_NO_CACHE"
  | "LOAD_CACHE_ONLY";

/**
 * Per-tab Light Mode policy.
 * Invariant: JavaScript is NEVER disabled by Light Mode (`javaScriptEnabled` is always `true`).
 */
export interface LightModePolicy {
  blockNetworkImage: boolean;
  blockWebFonts: boolean;
  blockMediaPreload: boolean;
  blockThirdPartyTrackers: boolean;
  cacheMode: LightModeCacheMode;
  javaScriptEnabled: true;
}

export const DEFAULT_LIGHT_MODE_POLICY: Readonly<LightModePolicy> = Object.freeze({
  blockNetworkImage: false,
  blockWebFonts: true,
  blockMediaPreload: true,
  blockThirdPartyTrackers: true,
  cacheMode: "LOAD_CACHE_ELSE_NETWORK",
  javaScriptEnabled: true,
});

export const TEXT_ONLY_LIGHT_MODE_POLICY: Readonly<LightModePolicy> = Object.freeze({
  blockNetworkImage: true,
  blockWebFonts: true,
  blockMediaPreload: true,
  blockThirdPartyTrackers: true,
  cacheMode: "LOAD_CACHE_ELSE_NETWORK",
  javaScriptEnabled: true,
});

export const STANDARD_BROWSER_POLICY: Readonly<LightModePolicy> = Object.freeze({
  blockNetworkImage: false,
  blockWebFonts: false,
  blockMediaPreload: false,
  blockThirdPartyTrackers: true,
  cacheMode: "LOAD_DEFAULT",
  javaScriptEnabled: true,
});

/**
 * Builds a validated `LightModePolicy` with safe defaults.
 * JavaScript is NEVER disabled by Light Mode even if a caller passes a partial override.
 */
export function buildLightModePolicy(
  options: {
    lightMode?: boolean;
    browsingMode?: ModeInputAlias;
    blockNetworkImage?: boolean;
    blockWebFonts?: boolean;
    blockMediaPreload?: boolean;
    blockThirdPartyTrackers?: boolean;
    cacheMode?: LightModeCacheMode;
    isOffline?: boolean;
    overrides?: Partial<LightModePolicy> & Record<string, unknown>;
  } = {}
): LightModePolicy {
  const normalizedMode = options.browsingMode
    ? normalizeBrowsingMode(options.browsingMode)
    : undefined;
  const isTextOnly = normalizedMode === "text-only";
  const isLightActive =
    Boolean(options.lightMode) ||
    isTextOnly ||
    normalizedMode === "smart-compress" ||
    normalizedMode === "reader";

  const base = isTextOnly
    ? TEXT_ONLY_LIGHT_MODE_POLICY
    : isLightActive
    ? DEFAULT_LIGHT_MODE_POLICY
    : STANDARD_BROWSER_POLICY;

  const resolvedCacheMode: LightModeCacheMode = options.isOffline
    ? "LOAD_CACHE_ONLY"
    : options.cacheMode ||
      (options.overrides?.cacheMode as LightModeCacheMode | undefined) ||
      base.cacheMode;

  return {
    blockNetworkImage:
      options.blockNetworkImage ??
      options.overrides?.blockNetworkImage ??
      base.blockNetworkImage,
    blockWebFonts:
      options.blockWebFonts ??
      options.overrides?.blockWebFonts ??
      base.blockWebFonts,
    blockMediaPreload:
      options.blockMediaPreload ??
      options.overrides?.blockMediaPreload ??
      base.blockMediaPreload,
    blockThirdPartyTrackers:
      options.blockThirdPartyTrackers ??
      options.overrides?.blockThirdPartyTrackers ??
      base.blockThirdPartyTrackers,
    cacheMode: resolvedCacheMode,
    // Invariant: Light Mode NEVER disables JavaScript
    javaScriptEnabled: true,
  };
}

export interface ProxyFallbackTabContext {
  id?: string;
  isPrivate?: boolean;
  lightMode?: boolean;
  lastMethod?: "GET" | "POST" | "HEAD" | string;
  isSignedIn?: boolean;
  hasAuthSession?: boolean;
  hasAuthCookies?: boolean;
  isClientAppShell?: boolean;
}

export type ProxyFallbackReasonCode =
  | "ELIGIBLE_PUBLIC_PAGE"
  | "PRIVATE_TAB"
  | "NON_IDEMPOTENT_METHOD"
  | "SIGNED_IN_SESSION"
  | "INVALID_OR_UNSUPPORTED_URL"
  | "INTRANET_OR_PRIVATE_HOST"
  | "AUTH_OR_LOGIN_PATH"
  | "CHECKOUT_OR_PAYMENT_PATH"
  | "CLIENT_RENDERED_APP_SHELL";

export const PROXY_FALLBACK_BLOCKED_MESSAGE_EN =
  "This interactive or signed-in page needs the full browser view. Try Light Mode.";

export const PROXY_FALLBACK_BLOCKED_MESSAGE_BN =
  "এই ইন্টারেক্টিভ বা সাইন-ইন করা পৃষ্ঠাটি দেখতে সম্পূর্ণ ব্রাউজার ভিউ প্রয়োজন। লাইট মোড চেষ্টা করুন। (This interactive or signed-in page needs the full browser view. Try Light Mode.)";

export interface ProxyFallbackClassification {
  allowed: boolean;
  reasonCode: ProxyFallbackReasonCode;
  messageEn: string;
  messageBn: string;
}

const AUTH_PATH_SEGMENT_REGEX =
  /(?:^|\/|[-_])(login|signin|sign-in|log-in|logout|log-out|signup|sign-up|register|auth|authenticate|oauth|oauth2|oidc|sso|saml|passkey|webauthn|2fa|mfa|otp|password|passwd|reset-password|forgot-password)(?:$|\/|[-_.])/i;

const CHECKOUT_PAY_BANK_PATH_REGEX =
  /(?:^|\/|[-_])(checkout|cart|pay|payment|payments|billing|invoice|bank|banking|netbanking|wallet|transfer|wire)(?:$|\/|[-_.])/i;

const SIGNED_IN_PATH_SEGMENT_REGEX =
  /(?:^|\/|[-_])(account|my-account|myaccount|profile|settings|security|admin|session|portal|dashboard|inbox)(?:$|\/|[-_.])/i;

const APP_SHELL_PATH_SEGMENT_REGEX =
  /(?:^|\/|[-_])(app|workspace|editor|studio|canvas|board| spreadsheet|ide|console)(?:$|\/|[-_.])/i;

const AUTH_HOST_LABEL_REGEX =
  /(?:^|\.)(login|signin|auth|oauth|sso|id|accounts|account|admin|secure)\./i;

const PAY_BANK_HOST_LABEL_REGEX =
  /(?:^|\.)(checkout|pay|payment|payments|billing|bank|banking|wallet)\./i;

const KNOWN_AUTH_DOMAINS = [
  "accounts.google.com",
  "myaccount.google.com",
  "login.microsoftonline.com",
  "login.live.com",
  "appleid.apple.com",
  "github.com/login",
  "github.com/session",
];

const KNOWN_PAY_BANK_DOMAINS = [
  "paypal.com",
  "stripe.com",
  "checkout.stripe.com",
  "bkash.com",
  "nagad.com.bd",
  "sslcommerz.com",
];

const KNOWN_CLIENT_APP_SHELL_DOMAINS = [
  "docs.google.com",
  "drive.google.com",
  "mail.google.com",
  "calendar.google.com",
  "meet.google.com",
  "figma.com",
  "canva.com",
  "notion.so",
  "app.slack.com",
  "slack.com",
  "discord.com",
  "open.spotify.com",
  "web.whatsapp.com",
  "web.telegram.org",
  "trello.com",
  "linear.app",
  "codesandbox.io",
  "stackblitz.com",
];

const SIGNED_IN_QUERY_KEY_REGEX =
  /^(access_token|id_token|refresh_token|auth_token|token|code|state|session|session_id|sid|phpsessid|jsessionid|jwt|samlrequest|samlresponse|sig|signature|x-amz-signature)$/i;

/**
 * Classifies whether a URL + tab is eligible for proxy / text-only fallback,
 * returning both `allowed` (boolean) and `reasonCode` for the UI.
 */
export function classifyProxyFallback(
  rawUrl: string,
  tab?: ProxyFallbackTabContext | Partial<BrowserTab> | null
): ProxyFallbackClassification {
  const deny = (reasonCode: ProxyFallbackReasonCode): ProxyFallbackClassification => ({
    allowed: false,
    reasonCode,
    messageEn: PROXY_FALLBACK_BLOCKED_MESSAGE_EN,
    messageBn: PROXY_FALLBACK_BLOCKED_MESSAGE_BN,
  });

  if (!rawUrl || typeof rawUrl !== "string") {
    return deny("INVALID_OR_UNSUPPORTED_URL");
  }

  // 1. Private tabs NEVER use proxy fallback when evaluated by the classifier
  if (tab?.isPrivate) {
    return deny("PRIVATE_TAB");
  }

  // 2. Non-idempotent HTTP methods (e.g. POST) NEVER use proxy fallback
  const ctx = tab as ProxyFallbackTabContext | undefined;
  const method = String(ctx?.lastMethod || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return deny("NON_IDEMPOTENT_METHOD");
  }

  // 3. Explicit signed-in / authenticated session indicators on tab
  if (ctx?.isSignedIn || ctx?.hasAuthSession || ctx?.hasAuthCookies) {
    return deny("SIGNED_IN_SESSION");
  }

  // 4. Explicit client-rendered app shell flag on tab
  if (ctx?.isClientAppShell) {
    return deny("CLIENT_RENDERED_APP_SHELL");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return deny("INVALID_OR_UNSUPPORTED_URL");
  }

  // 5. Only standard public http: and https: schemes
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return deny("INVALID_OR_UNSUPPORTED_URL");
  }

  // 6. Embedded URL credentials (user:pass@host) indicate authenticated session
  if (parsed.username || parsed.password) {
    return deny("SIGNED_IN_SESSION");
  }

  const hostLower = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // 7. Intranet / private / SSRF hosts (including single-label intranet hosts or .lan/.corp/.intranet)
  if (
    isBlockedSsrfHost(parsed.href).blocked ||
    !hostLower.includes(".") ||
    hostLower.endsWith(".lan") ||
    hostLower.endsWith(".corp") ||
    hostLower.endsWith(".intranet") ||
    hostLower.endsWith(".home") ||
    hostLower.endsWith(".localdomain")
  ) {
    return deny("INTRANET_OR_PRIVATE_HOST");
  }

  const pathLower = decodeURIComponent(parsed.pathname || "/").toLowerCase();
  const fullHostAndPath = `${hostLower}${pathLower}`;

  // 8. Known client-rendered app shells
  for (const shellDomain of KNOWN_CLIENT_APP_SHELL_DOMAINS) {
    if (
      hostLower === shellDomain ||
      hostLower.endsWith(`.${shellDomain}`) ||
      fullHostAndPath.startsWith(shellDomain)
    ) {
      return deny("CLIENT_RENDERED_APP_SHELL");
    }
  }
  if (
    hostLower.startsWith("app.") ||
    hostLower.startsWith("studio.") ||
    APP_SHELL_PATH_SEGMENT_REGEX.test(pathLower)
  ) {
    return deny("CLIENT_RENDERED_APP_SHELL");
  }

  // 9. Known payment / banking domains & paths
  for (const payDomain of KNOWN_PAY_BANK_DOMAINS) {
    if (
      hostLower === payDomain ||
      hostLower.endsWith(`.${payDomain}`) ||
      fullHostAndPath.startsWith(payDomain)
    ) {
      return deny("CHECKOUT_OR_PAYMENT_PATH");
    }
  }
  if (
    PAY_BANK_HOST_LABEL_REGEX.test(`${hostLower}.`) ||
    /\b(bank|banking|pay|payment|checkout|wallet)\b/i.test(hostLower) ||
    CHECKOUT_PAY_BANK_PATH_REGEX.test(pathLower)
  ) {
    return deny("CHECKOUT_OR_PAYMENT_PATH");
  }

  // 10. Known auth / login / OAuth domains & paths
  for (const authDomain of KNOWN_AUTH_DOMAINS) {
    if (
      hostLower === authDomain ||
      hostLower.endsWith(`.${authDomain}`) ||
      fullHostAndPath.startsWith(authDomain)
    ) {
      return deny("AUTH_OR_LOGIN_PATH");
    }
  }
  if (
    AUTH_HOST_LABEL_REGEX.test(`${hostLower}.`) ||
    /\b(auth|login|signin|oauth|sso)\b/i.test(hostLower) ||
    AUTH_PATH_SEGMENT_REGEX.test(pathLower)
  ) {
    return deny("AUTH_OR_LOGIN_PATH");
  }

  // 11. Signed-in paths or query/hash session tokens
  if (SIGNED_IN_PATH_SEGMENT_REGEX.test(pathLower)) {
    return deny("SIGNED_IN_SESSION");
  }
  for (const [key] of parsed.searchParams.entries()) {
    if (SIGNED_IN_QUERY_KEY_REGEX.test(key.trim())) {
      return deny("SIGNED_IN_SESSION");
    }
  }
  const hashLower = (parsed.hash || "").toLowerCase();
  if (
    hashLower.includes("access_token=") ||
    hashLower.includes("id_token=") ||
    hashLower.includes("session=") ||
    hashLower.includes("auth=")
  ) {
    return deny("SIGNED_IN_SESSION");
  }

  return {
    allowed: true,
    reasonCode: "ELIGIBLE_PUBLIC_PAGE",
    messageEn: "",
    messageBn: "",
  };
}

/**
 * PART 2 Classifier: `canUseProxyFallback(url, tab)`
 *
 * Returns `false` for:
 * - `login`, `signin`, `auth`, `oauth`, `checkout`, `pay`, `bank` paths or hostnames
 * - signed-in patterns (tab auth flags, URL credentials, auth/session query tokens, account/dashboard paths)
 * - private / incognito tabs (`tab.isPrivate === true`)
 * - intranet / private network hosts
 * - known client-rendered app shells (`docs.google.com`, `figma.com`, `app.*`, `/app/`, etc.)
 * - POST (or non-GET/HEAD) requests
 * Returns `true` otherwise.
 * Also attaches `.lastReasonCode` and `.classify(url, tab)` for reason-code inspection.
 */
export function canUseProxyFallback(
  rawUrl: string,
  tab?: ProxyFallbackTabContext | Partial<BrowserTab> | null
): boolean {
  const result = classifyProxyFallback(rawUrl, tab);
  canUseProxyFallback.lastResult = result;
  canUseProxyFallback.lastReasonCode = result.reasonCode;
  return result.allowed;
}
canUseProxyFallback.lastResult = {
  allowed: true,
  reasonCode: "ELIGIBLE_PUBLIC_PAGE" as ProxyFallbackReasonCode,
  messageEn: "",
  messageBn: "",
};
canUseProxyFallback.lastReasonCode = "ELIGIBLE_PUBLIC_PAGE" as ProxyFallbackReasonCode;
canUseProxyFallback.classify = classifyProxyFallback;

export function normalizeBrowsingMode(mode?: ModeInputAlias | string | null): BrowsingMode {
  if (!mode) return "smart-compress";
  const clean = String(mode).trim().toLowerCase();
  if (clean === "light" || clean === "light-mode" || clean === "smart-compress") {
    return "smart-compress";
  }
  if (clean === "text-only" || clean === "text") {
    return "text-only";
  }
  if (clean === "reader" || clean === "reader-mode") {
    return "reader";
  }
  if (clean === "full") {
    return "full";
  }
  return "smart-compress";
}

export interface ResolveModeParams {
  globalMode: BrowsingMode;
  explicitOverrideMode?: ModeInputAlias;
  tabLightMode?: boolean;
  tabOverrideMode?: BrowsingMode;
  isReaderModeTab?: boolean;
  siteOverride?: SitePrivacyOverride;
  networkState?: NetworkState;
  autoAdaptToWeakNetwork?: boolean;
  resilienceSuggestedLightMode?: boolean;
}

export interface ResolvedModeResult {
  effectiveMode: BrowsingMode;
  lightMode: boolean;
  policy: LightModePolicy;
  source:
    | "explicit_override"
    | "reader_toggle"
    | "tab_light_mode"
    | "tab_override"
    | "site_override"
    | "weak_network_auto"
    | "global_default";
  blocksImages: boolean;
  usesLightCompression: boolean;
}

/**
 * Resolves the effective browsing mode and `LightModePolicy` for a tab/navigation.
 */
export function resolveEffectiveBrowsingMode(params: ResolveModeParams): ResolvedModeResult {
  const allowHeavyImagesOnSite = Boolean(params.siteOverride?.allowHeavyImages);
  const isOffline =
    params.networkState?.medium === "offline" || params.networkState?.isOnline === false;

  const makeResult = (
    mode: BrowsingMode,
    source: ResolvedModeResult["source"],
    forceLightMode?: boolean
  ): ResolvedModeResult => {
    const lightMode =
      forceLightMode ??
      (Boolean(params.tabLightMode) || mode === "smart-compress" || mode === "text-only" || mode === "reader");
    const blocksImages = mode === "text-only" && !allowHeavyImagesOnSite;
    const policy = buildLightModePolicy({
      lightMode,
      browsingMode: mode,
      blockNetworkImage: blocksImages,
      isOffline,
    });
    return {
      effectiveMode: mode,
      lightMode,
      policy,
      source,
      blocksImages,
      usesLightCompression: lightMode || mode !== "full",
    };
  };

  // 1. Explicit call-site override (e.g. user clicked [Text-only] or [Light mode] on slow pill)
  if (params.explicitOverrideMode) {
    const mode = normalizeBrowsingMode(params.explicitOverrideMode);
    return makeResult(mode, "explicit_override", mode !== "full");
  }

  // 2. Active Reader Mode toggle on tab
  if (params.isReaderModeTab) {
    return makeResult("reader", "reader_toggle", true);
  }

  // 3. Per-tab mode override
  if (params.tabOverrideMode) {
    const mode = normalizeBrowsingMode(params.tabOverrideMode);
    return makeResult(mode, "tab_override", mode !== "full" || Boolean(params.tabLightMode));
  }

  // 4. Per-tab `lightMode` boolean toggle
  if (params.tabLightMode === true) {
    const mode = params.globalMode === "text-only" ? "text-only" : "smart-compress";
    return makeResult(mode, "tab_light_mode", true);
  }
  if (params.tabLightMode === false && params.globalMode === "smart-compress") {
    // Explicit per-tab lightMode=false opts the tab into full mode unless site/explicit override
    return makeResult("full", "tab_light_mode", false);
  }

  // 5. Per-site preferred mode override
  if (params.siteOverride?.preferredMode) {
    const mode = normalizeBrowsingMode(params.siteOverride.preferredMode);
    return makeResult(mode, "site_override", mode !== "full");
  }

  // 6. Weak-network auto-adaptation (ONLY when user setting `autoAdaptToWeakNetwork` is true)
  if (params.autoAdaptToWeakNetwork) {
    const is2G =
      params.networkState?.medium === "cellular_2g" ||
      params.networkState?.type === "2g" ||
      params.networkState?.effectiveType === "2g" ||
      params.networkState?.effectiveType === "slow-2g";

    if (is2G) {
      return makeResult("text-only", "weak_network_auto", true);
    }

    if (
      params.resilienceSuggestedLightMode ||
      (params.networkState && isWeakNetwork(params.networkState))
    ) {
      const adapted: BrowsingMode =
        params.globalMode === "text-only" ? "text-only" : "smart-compress";
      return makeResult(adapted, "weak_network_auto", true);
    }
  }

  // 7. Global default mode
  const mode = normalizeBrowsingMode(params.globalMode);
  return makeResult(mode, "global_default", mode !== "full");
}

export interface LightModeRouteDecision {
  route: "native_webview" | "proxy_fallback" | "blocked_ssrf";
  canFallbackToProxy: boolean;
  reasonCode: ProxyFallbackReasonCode;
  lightMode: boolean;
  effectiveMode: BrowsingMode;
  policy: LightModePolicy;
  reason: string;
  honestBlockedMessageEn: string;
  honestBlockedMessageBn: string;
}

/**
 * PART 2 Fallback Router:
 * Determines whether navigation should execute in `native_webview` (with `LightModePolicy`)
 * or `proxy_fallback` (`/api/browse`).
 */
export function resolveLightModeFallbackRoute(params: {
  url: string;
  tab?: ProxyFallbackTabContext | Partial<BrowserTab> | null;
  isNativeAvailable: boolean;
  globalMode: BrowsingMode;
  explicitOverrideMode?: ModeInputAlias;
  siteOverride?: SitePrivacyOverride;
  networkState?: NetworkState;
  autoAdaptToWeakNetwork?: boolean;
  preferNativeInLightMode?: boolean;
}): LightModeRouteDecision {
  const ssrf = isBlockedSsrfHost(params.url);
  const resolved = resolveEffectiveBrowsingMode({
    globalMode: params.globalMode,
    explicitOverrideMode: params.explicitOverrideMode,
    tabLightMode: params.tab?.lightMode,
    tabOverrideMode: (params.tab as Partial<BrowserTab> | undefined)?.tabBrowsingMode,
    isReaderModeTab: (params.tab as Partial<BrowserTab> | undefined)?.isReaderMode,
    siteOverride: params.siteOverride,
    networkState: params.networkState,
    autoAdaptToWeakNetwork: params.autoAdaptToWeakNetwork,
  });

  if (ssrf.blocked) {
    return {
      route: "blocked_ssrf",
      canFallbackToProxy: false,
      reasonCode: "INTRANET_OR_PRIVATE_HOST",
      lightMode: resolved.lightMode,
      effectiveMode: resolved.effectiveMode,
      policy: resolved.policy,
      reason: ssrf.reason || "Blocked SSRF / private host",
      honestBlockedMessageEn: PROXY_FALLBACK_BLOCKED_MESSAGE_EN,
      honestBlockedMessageBn: PROXY_FALLBACK_BLOCKED_MESSAGE_BN,
    };
  }

  const classification = classifyProxyFallback(params.url, params.tab);
  const proxyAllowed = classification.allowed;

  // Web Preview environment: keep existing preview behavior unchanged
  if (!params.isNativeAvailable) {
    return {
      route: "proxy_fallback",
      canFallbackToProxy: proxyAllowed,
      reasonCode: classification.reasonCode,
      lightMode: resolved.lightMode,
      effectiveMode: resolved.effectiveMode,
      policy: resolved.policy,
      reason: "WEB_PREVIEW_DEFAULT_PROXY",
      honestBlockedMessageEn: classification.messageEn,
      honestBlockedMessageBn: classification.messageBn,
    };
  }

  // Native Android environment:
  // If proxy fallback is disallowed by classifier, MUST stay on native_webview
  if (!proxyAllowed) {
    return {
      route: "native_webview",
      canFallbackToProxy: false,
      reasonCode: classification.reasonCode,
      lightMode: resolved.lightMode,
      effectiveMode: resolved.effectiveMode,
      policy: resolved.policy,
      reason: `SENSITIVE_OR_PRIVATE_URL_STAYS_ON_NATIVE_WEBVIEW:${classification.reasonCode}`,
      honestBlockedMessageEn: classification.messageEn,
      honestBlockedMessageBn: classification.messageBn,
    };
  }

  if (resolved.effectiveMode === "full" && !resolved.lightMode) {
    return {
      route: "native_webview",
      canFallbackToProxy: true,
      reasonCode: classification.reasonCode,
      lightMode: false,
      effectiveMode: "full",
      policy: resolved.policy,
      reason: "FULL_MODE_NATIVE_WEBVIEW",
      honestBlockedMessageEn: "",
      honestBlockedMessageBn: "",
    };
  }

  if (params.preferNativeInLightMode && resolved.effectiveMode === "smart-compress") {
    return {
      route: "native_webview",
      canFallbackToProxy: true,
      reasonCode: classification.reasonCode,
      lightMode: true,
      effectiveMode: "smart-compress",
      policy: resolved.policy,
      reason: "NATIVE_WEBVIEW_WITH_LIGHT_MODE_POLICY",
      honestBlockedMessageEn: "",
      honestBlockedMessageBn: "",
    };
  }

  return {
    route: "proxy_fallback",
    canFallbackToProxy: true,
    reasonCode: classification.reasonCode,
    lightMode: resolved.lightMode,
    effectiveMode: resolved.effectiveMode,
    policy: resolved.policy,
    reason: "SAFE_PUBLIC_URL_ELIGIBLE_FOR_PROXY_FALLBACK",
    honestBlockedMessageEn: "",
    honestBlockedMessageBn: "",
  };
}

function escapeHtmlAttr(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeImageSrc(src: string): boolean {
  const trimmed = String(src || "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("data:text/html")
  ) {
    return false;
  }
  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("data:image/") ||
    lower.startsWith("/")
  );
}

export interface TransformHtmlOptions {
  mode: BrowsingMode;
  lightMode?: boolean;
  policy?: Partial<LightModePolicy>;
  blockHeavyImages?: boolean;
  allowHeavyImagesForSite?: boolean;
  unblockedImageUrls?: ReadonlySet<string> | string[];
  lang?: "bn" | "en";
}

/**
 * Applies Light Mode (`smart-compress`) or Text-Only (`text-only`) HTML transformations,
 * supporting per-image tap-to-load (`data-netflow-load-img`).
 * Never strips or disables legitimate page structure.
 */
export function transformHtmlForMode(
  rawHtml: string,
  options: TransformHtmlOptions
): { html: string; imagesReplacedCount: number; lazyImagesCount: number } {
  if (!rawHtml || typeof rawHtml !== "string") {
    return { html: "", imagesReplacedCount: 0, lazyImagesCount: 0 };
  }

  const unblockedSet: Set<string> =
    options.unblockedImageUrls instanceof Set
      ? (options.unblockedImageUrls as Set<string>)
      : new Set(Array.isArray(options.unblockedImageUrls) ? options.unblockedImageUrls : []);

  const shouldReplaceImages =
    !options.allowHeavyImagesForSite &&
    (options.mode === "text-only" ||
      Boolean(options.blockHeavyImages) ||
      Boolean(options.policy?.blockNetworkImage));

  let imagesReplacedCount = 0;
  let lazyImagesCount = 0;
  let processed = rawHtml;

  // Strip @font-face rules when Light Mode policy blocks web fonts
  const shouldBlockWebFonts =
    options.mode === "text-only" ||
    options.mode === "smart-compress" ||
    Boolean(options.lightMode) ||
    Boolean(options.policy?.blockWebFonts);

  if (shouldBlockWebFonts) {
    processed = processed.replace(/@font-face\s*\{[^}]*\}/gi, "");
  }

  if (shouldReplaceImages) {
    processed = processed.replace(/<img\b([^>]*)>/gi, (_fullMatch, attrs: string) => {
      const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1].trim() : "";
      const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
      const alt = altMatch && altMatch[1].trim() ? altMatch[1].trim() : "Image";

      // If user explicitly tapped to load this image URL, render the real <img> safely
      if (src && unblockedSet.has(src) && isSafeImageSrc(src)) {
        return `<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}" loading="lazy" decoding="async" class="max-w-full h-auto rounded my-1" />`;
      }

      imagesReplacedCount += 1;
      const safeSrcAttr = isSafeImageSrc(src) ? escapeHtmlAttr(src) : "";
      const safeAlt = escapeHtmlAttr(alt);
      const label =
        options.lang === "bn"
          ? `🖼️ [ছবি: ${safeAlt} — লোড করতে ট্যাপ করুন]`
          : `🖼️ [Image: ${safeAlt} — Tap to load]`;

      if (safeSrcAttr) {
        return `<button type="button" data-netflow-load-img="${safeSrcAttr}" data-netflow-img-alt="${safeAlt}" class="netflow-img-placeholder inline-flex items-center gap-1.5 px-2.5 py-1 my-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:text-emerald-300 rounded-lg border border-emerald-300/70 dark:border-emerald-800 cursor-pointer transition-colors">${label}</button>`;
      }
      return `<span class="netflow-img-placeholder inline-flex items-center gap-1.5 px-2 py-0.5 text-xs text-stone-500 bg-stone-100 rounded border border-stone-200 dark:bg-stone-800 dark:text-stone-400">${label}</span>`;
    });

    // In text-only mode, also prevent heavy video/audio autoplay & preload
    if (options.mode === "text-only") {
      processed = processed.replace(
        /<(video|audio)\b([^>]*)>([\s\S]*?<\/\1>)?/gi,
        (_m, tag: string) => {
          const mediaLabel =
            options.lang === "bn"
              ? `🔇 [মিডিয়া (${tag.toLowerCase()}) টেক্সট-ফার্স্ট মোডে ডেটা বাঁচাতে থামানো হয়েছে]`
              : `🔇 [Media (${tag.toLowerCase()}) paused in Text-Only mode to save data]`;
          return `<div class="netflow-media-placeholder p-2 my-1.5 text-xs text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/80 rounded border border-stone-200 dark:border-stone-700">${mediaLabel}</div>`;
        }
      );
    }
  } else if (options.mode === "smart-compress" || options.lightMode) {
    // Light mode: ensure lazy loading and async decoding on images, and preload="none" on media
    processed = processed.replace(/<img\b([^>]*)>/gi, (_fullMatch, attrs: string) => {
      lazyImagesCount += 1;
      let updatedAttrs = attrs;
      if (!/\bloading=/i.test(updatedAttrs)) {
        updatedAttrs += ' loading="lazy"';
      }
      if (!/\bdecoding=/i.test(updatedAttrs)) {
        updatedAttrs += ' decoding="async"';
      }
      return `<img${updatedAttrs}>`;
    });

    processed = processed.replace(
      /<(video|audio)\b([^>]*)>/gi,
      (_fullMatch, tag: string, attrs: string) => {
        let cleanedAttrs = attrs.replace(/\bautoplay(?:=["'][^"']*["'])?/gi, "");
        if (!/\bpreload=/i.test(cleanedAttrs)) {
          cleanedAttrs += ' preload="none"';
        }
        return `<${tag}${cleanedAttrs}>`;
      }
    );
  }

  return {
    html: processed,
    imagesReplacedCount,
    lazyImagesCount,
  };
}

/**
 * Computes honest, non-fabricated page data savings.
 * Never returns negative bytes or percentages outside [0, 100].
 */
export function computeHonestPageStats(rawStats?: Partial<PageStats> | null): PageStats {
  const originalBytes = Math.max(0, Math.round(Number(rawStats?.originalBytes) || 0));
  const transferredBytes = Math.max(0, Math.round(Number(rawStats?.transferredBytes) || 0));
  const savedBytes = Math.max(0, originalBytes - transferredBytes);
  const savedPercentage =
    originalBytes > 0
      ? Math.min(100, Math.max(0, Math.round((savedBytes / originalBytes) * 100)))
      : 0;

  return {
    originalBytes,
    transferredBytes,
    savedBytes,
    savedPercentage,
    loadTimeMs: Math.max(0, Math.round(Number(rawStats?.loadTimeMs) || 0)),
    trackersBlocked: Math.max(0, Math.round(Number(rawStats?.trackersBlocked) || 0)),
    scriptsBlocked: Math.max(0, Math.round(Number(rawStats?.scriptsBlocked) || 0)),
    isHttps: Boolean(rawStats?.isHttps ?? true),
  };
}

/**
 * Normalizes URLs for Offline Capsule lookup (strips trailing slash, hash, and normalizes hostname case).
 */
export function normalizeCapsuleUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Finds a matching saved Offline Capsule for a target URL.
 */
export function findMatchingOfflineCapsule(
  targetUrl: string | undefined | null,
  capsules: OfflineCapsule[]
): OfflineCapsule | undefined {
  if (!targetUrl || !Array.isArray(capsules) || capsules.length === 0) {
    return undefined;
  }
  const targetNorm = normalizeCapsuleUrl(targetUrl);
  if (!targetNorm) return undefined;
  return capsules.find((c) => c && normalizeCapsuleUrl(c.url) === targetNorm);
}

export const MAX_CAPSULE_HTML_BYTES = 1_500_000; // 1.5 MB per capsule safety cap

/**
 * Creates a sanitized Offline Capsule record.
 * Returns null if the tab is private (unless `allowPrivateExplicitSave` is true) or has no content.
 */
export function buildSafeOfflineCapsule(params: {
  title: string;
  url: string;
  contentHtml: string;
  rawText?: string;
  isPrivateTab?: boolean;
  allowPrivateExplicitSave?: boolean;
  now?: number;
}): OfflineCapsule | null {
  if (params.isPrivateTab && !params.allowPrivateExplicitSave) {
    return null;
  }
  if (!params.url || !params.contentHtml || !params.contentHtml.trim()) {
    return null;
  }

  // Strip executable script tags before persisting offline snapshot
  const safeHtml = params.contentHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<\/?script\b[^>]*>/gi, "")
    .slice(0, MAX_CAPSULE_HTML_BYTES);

  const byteSize = new TextEncoder().encode(safeHtml).length;
  const now = params.now ?? Date.now();

  return {
    id: `capsule-${now}`,
    title: (params.title || params.url).trim().slice(0, 140),
    url: params.url.trim(),
    savedAt: now,
    contentHtml: safeHtml,
    rawText: (params.rawText || "").slice(0, 200_000),
    byteSize,
  };
}

// ============================================================================
// PART 3 — Offline Honesty (<150ms Fast Fail) & Queue-When-Online Manager
// ============================================================================

export const HONEST_OFFLINE_UNSAVED_MESSAGE_EN =
  "You are offline; this page is not saved on your device";

export const HONEST_OFFLINE_UNSAVED_MESSAGE_BN =
  "আপনি অফলাইনে আছেন; এই পৃষ্ঠাটি আপনার ডিভাইসে সংরক্ষিত নেই (You are offline; this page is not saved on your device)";

export const HONEST_OFFLINE_SAVED_MESSAGE_EN =
  "Viewing saved offline copy from your device";

export const HONEST_OFFLINE_SAVED_MESSAGE_BN =
  "আপনার ডিভাইসে সংরক্ষিত অফলাইন কপি দেখানো হচ্ছে (Viewing saved offline copy from your device)";

export interface OfflineNavigationOutcome {
  matchedCapsule: OfflineCapsule | null;
  failedFast: boolean;
  elapsedMs: number;
  errorCode: "ERR_INTERNET_DISCONNECTED" | null;
  honestMessageEn: string;
  honestMessageBn: string;
  savedCapsules: OfflineCapsule[];
}

/**
 * Evaluates an offline navigation request synchronously (<150ms fast-fail guarantee).
 * - If a saved capsule matches `url`, returns `matchedCapsule` with honest saved copy notice.
 * - If `url` is unseen, fails fast with `"You are offline; this page is not saved on your device"`
 *   plus the list of saved offline capsules.
 */
export function evaluateOfflineNavigation(
  url: string,
  capsules: OfflineCapsule[],
  clockNow: () => number = () => Date.now()
): OfflineNavigationOutcome {
  const startMs = clockNow();
  const safeCapsules = Array.isArray(capsules) ? capsules : [];
  const matched = findMatchingOfflineCapsule(url, safeCapsules) || null;
  const elapsedMs = Math.max(0, clockNow() - startMs);

  if (matched) {
    return {
      matchedCapsule: matched,
      failedFast: false,
      elapsedMs,
      errorCode: null,
      honestMessageEn: HONEST_OFFLINE_SAVED_MESSAGE_EN,
      honestMessageBn: HONEST_OFFLINE_SAVED_MESSAGE_BN,
      savedCapsules: safeCapsules,
    };
  }

  return {
    matchedCapsule: null,
    failedFast: true,
    elapsedMs,
    errorCode: "ERR_INTERNET_DISCONNECTED",
    honestMessageEn: HONEST_OFFLINE_UNSAVED_MESSAGE_EN,
    honestMessageBn: HONEST_OFFLINE_UNSAVED_MESSAGE_BN,
    savedCapsules: safeCapsules,
  };
}

export const MAX_OFFLINE_QUEUE_ITEMS = 20 as const;
export const OFFLINE_QUEUE_STORAGE_KEY = "netflow_offline_queue_v1" as const;

export interface OfflineQueueEnqueueResult {
  queued: boolean;
  reasonCode:
    | "QUEUED_SANITIZED_URL"
    | "UPDATED_EXISTING_QUEUE_ITEM"
    | "PRIVATE_TAB_EXCLUDED"
    | "INVALID_OR_UNSAFE_URL";
  item?: PendingNetworkRequest;
  queue: PendingNetworkRequest[];
}

export interface OfflineQueueOnlineDrainDecision {
  action: "NO_OP" | "AUTO_OPEN_SINGLE" | "CONFIRM_MULTIPLE_QUEUED";
  requiresUserConfirmation: boolean;
  itemsToOpen: PendingNetworkRequest[];
  remainingQueue: PendingNetworkRequest[];
}

export interface OfflineNavigationQueueManager {
  enqueueWhenOnline: (
    rawUrl: string,
    tab: { id: string; isPrivate?: boolean },
    options?: {
      priority?: "high" | "normal" | "low";
      postBody?: unknown;
      headers?: unknown;
      now?: number;
    }
  ) => OfflineQueueEnqueueResult;
  getQueue: () => PendingNetworkRequest[];
  removeById: (id: string) => PendingNetworkRequest[];
  onValidatedOnline: () => OfflineQueueOnlineDrainDecision;
  confirmOpenAllQueued: () => PendingNetworkRequest[];
  dismissPendingConfirmation: () => void;
  isAwaitingUserConfirmation: () => boolean;
  clearQueue: () => void;
}

/**
 * PART 3: "Queue and open when online" manager reusing `PendingNetworkRequest`.
 * - Stores ONLY the sanitized URL (`sanitizeUrlForSession` — strips tokens, credentials, secrets;
 *   NEVER stores POST bodies or auth headers).
 * - Maximum 20 items (`MAX_OFFLINE_QUEUE_ITEMS = 20`); evicts oldest when full.
 * - Private tabs (`tab.isPrivate === true`) are strictly excluded.
 * - On validated online:
 *   - If 1 item is queued: opens it automatically (`requiresUserConfirmation: false`).
 *   - If > 1 items are queued: does NOT auto-open; requires user confirmation first
 *     (`action: "CONFIRM_MULTIPLE_QUEUED"`, `requiresUserConfirmation: true`).
 * - Clear Browsing Data (`clearQueue()`) purges all items in memory and storage.
 */
export function createOfflineNavigationQueue(options?: {
  storage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  maxItems?: number;
}): OfflineNavigationQueueManager {
  const maxItems = options?.maxItems ?? MAX_OFFLINE_QUEUE_ITEMS;
  const storage =
    options?.storage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);

  let awaitingConfirmation = false;
  let queue: PendingNetworkRequest[] = [];

  const sanitizeOfflineQueueUrl = (inputUrl: string): string => {
    const baseClean = sanitizeUrlForSession(inputUrl);
    if (!baseClean) return "";
    try {
      const parsed = new URL(baseClean);
      parsed.hash = "";
      for (const k of Array.from(parsed.searchParams.keys())) {
        if (/^(jwt|bearer|auth|csrf|xsrf|api_token)$/i.test(k)) {
          parsed.searchParams.delete(k);
        }
      }
      return parsed.toString();
    } catch {
      return baseClean;
    }
  };

  const loadFromStorage = (): PendingNetworkRequest[] => {
    if (!storage) return [];
    try {
      const raw = storage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const valid: PendingNetworkRequest[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const cleanUrl = sanitizeOfflineQueueUrl(String(entry.url || ""));
        if (!cleanUrl) continue;
        valid.push({
          id: String(entry.id || `q-${Date.now()}-${valid.length}`),
          url: cleanUrl,
          tabId: String(entry.tabId || "tab-initial-1"),
          priority:
            entry.priority === "high" || entry.priority === "low"
              ? entry.priority
              : "normal",
          queuedAt: Number(entry.queuedAt) || Date.now(),
          retryCount: Number(entry.retryCount) || 0,
          status: "queued",
        });
      }
      return valid.slice(-maxItems);
    } catch {
      return [];
    }
  };

  const persistToStorage = () => {
    if (!storage) return;
    try {
      if (queue.length === 0) {
        storage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
        return;
      }
      // Persist strictly the allowlisted PendingNetworkRequest fields (never postBody/tokens)
      const strictPayload = queue.map((item) => ({
        id: item.id,
        url: sanitizeOfflineQueueUrl(item.url),
        tabId: item.tabId,
        priority: item.priority,
        queuedAt: item.queuedAt,
        retryCount: item.retryCount,
        status: item.status,
      }));
      storage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(strictPayload));
    } catch {}
  };

  queue = loadFromStorage();

  return {
    enqueueWhenOnline(rawUrl, tab, reqOptions) {
      // 1. Exclude private tabs strictly
      if (!tab || tab.isPrivate === true) {
        return {
          queued: false,
          reasonCode: "PRIVATE_TAB_EXCLUDED",
          queue: [...queue],
        };
      }

      // 2. Sanitize URL (strips tokens, auth params, user:pass, hash) & ignore any postBody/headers
      const sanitizedUrl = sanitizeOfflineQueueUrl(rawUrl);
      if (!sanitizedUrl) {
        return {
          queued: false,
          reasonCode: "INVALID_OR_UNSAFE_URL",
          queue: [...queue],
        };
      }

      const now = reqOptions?.now ?? Date.now();
      const existingIdx = queue.findIndex(
        (item) => item.tabId === tab.id && item.url === sanitizedUrl
      );

      if (existingIdx !== -1) {
        const updated: PendingNetworkRequest = {
          ...queue[existingIdx],
          queuedAt: now,
          status: "queued",
        };
        queue.splice(existingIdx, 1);
        queue.push(updated);
        persistToStorage();
        return {
          queued: true,
          reasonCode: "UPDATED_EXISTING_QUEUE_ITEM",
          item: { ...updated },
          queue: [...queue],
        };
      }

      const newItem: PendingNetworkRequest = {
        id: `offline-q-${now}-${queue.length + 1}`,
        url: sanitizedUrl,
        tabId: tab.id,
        priority: reqOptions?.priority ?? "normal",
        queuedAt: now,
        retryCount: 0,
        status: "queued",
      };

      queue.push(newItem);
      while (queue.length > maxItems) {
        queue.shift();
      }
      persistToStorage();

      return {
        queued: true,
        reasonCode: "QUEUED_SANITIZED_URL",
        item: { ...newItem },
        queue: [...queue],
      };
    },

    getQueue() {
      return queue.map((item) => ({ ...item }));
    },

    removeById(id: string) {
      queue = queue.filter((item) => item.id !== id);
      if (queue.length <= 1) {
        awaitingConfirmation = false;
      }
      persistToStorage();
      return queue.map((item) => ({ ...item }));
    },

    onValidatedOnline() {
      if (queue.length === 0) {
        awaitingConfirmation = false;
        return {
          action: "NO_OP",
          requiresUserConfirmation: false,
          itemsToOpen: [],
          remainingQueue: [],
        };
      }

      if (queue.length === 1) {
        awaitingConfirmation = false;
        const single = { ...queue[0], status: "recovered" as const };
        queue = [];
        persistToStorage();
        return {
          action: "AUTO_OPEN_SINGLE",
          requiresUserConfirmation: false,
          itemsToOpen: [single],
          remainingQueue: [],
        };
      }

      // More than 1 item queued -> require explicit user confirmation before opening!
      awaitingConfirmation = true;
      return {
        action: "CONFIRM_MULTIPLE_QUEUED",
        requiresUserConfirmation: true,
        itemsToOpen: queue.map((item) => ({ ...item })),
        remainingQueue: queue.map((item) => ({ ...item })),
      };
    },

    confirmOpenAllQueued() {
      awaitingConfirmation = false;
      const drained = queue.map((item) => ({
        ...item,
        status: "recovered" as const,
      }));
      queue = [];
      persistToStorage();
      return drained;
    },

    dismissPendingConfirmation() {
      awaitingConfirmation = false;
    },

    isAwaitingUserConfirmation() {
      return awaitingConfirmation && queue.length > 1;
    },

    clearQueue() {
      queue = [];
      awaitingConfirmation = false;
      if (storage) {
        try {
          storage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
        } catch {}
      }
    },
  };
}
