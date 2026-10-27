/**
 * Android WebView Redirect Chain & Navigation Safety Boundary (NETFLOW-V2-NATIVE-34)
 *
 * Implements:
 * - HTTP/HTTPS redirect chain tracking with per-hop auditing (301, 302, 303, 307, 308)
 * - Old request / lifecycle state & auth token leakage prevention across origin boundaries
 * - Redirect-loop protection (detects circular or oscillating redirect sequences)
 * - Excessive redirect safe failure (max hops ceiling e.g. 15 hops)
 * - Dangerous scheme redirect defense: blocks javascript:, data:, file:, intent:, content:, etc.
 * - SSRF & private/internal network destination blocking on redirect hops
 * - HTTPS -> HTTP downgrade detection and security policy enforcement
 * - Final destination origin & per-tab redirect chain isolation
 * - Rapid navigation + redirect stale callback protection with monotonic chain epochs
 * - Ephemeral private-tab redirect state isolation & clean expungement on close
 * - Compatibility with NATIVE-31 (Page Lifecycle), NATIVE-30 (Rendering), NATIVE-29 (Media)
 * - Zero privileged JS bridges, JNI, or reflection.
 */

export enum RedirectFailureReason {
  REDIRECT_LOOP_DETECTED = "REDIRECT_LOOP_DETECTED",
  EXCESSIVE_REDIRECTS = "EXCESSIVE_REDIRECTS",
  DANGEROUS_SCHEME = "DANGEROUS_SCHEME",
  BLOCKED_INTERNAL_DESTINATION = "BLOCKED_INTERNAL_DESTINATION",
  DOWNGRADE_INSECURE = "DOWNGRADE_INSECURE",
  STALE_CHAIN_EPOCH = "STALE_CHAIN_EPOCH",
  TAB_MISMATCH = "TAB_MISMATCH",
  INVALID_URL = "INVALID_URL",
}

export enum RedirectChainStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  BLOCKED = "BLOCKED",
  ABORTED = "ABORTED",
}

export type HttpRedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export const HTTP_REDIRECT_STATUS_CODES = new Set<number>([301, 302, 303, 307, 308]);

export function isHttpRedirectStatusCode(statusCode: number): boolean {
  return HTTP_REDIRECT_STATUS_CODES.has(statusCode);
}

export interface RedirectHopRecord {
  hopIndex: number;
  sourceUrl: string;
  targetUrl: string;
  statusCode: number;
  timestamp: number;
  sourceOrigin: string;
  targetOrigin: string;
  isCrossOrigin: boolean;
  isDowngrade: boolean;
}

export interface RedirectChainState {
  chainId: string;
  tabId: string;
  initialUrl: string;
  currentUrl: string;
  hops: RedirectHopRecord[];
  status: RedirectChainStatus;
  createdAt: number;
  updatedAt: number;
  chainEpoch: number;
  isPrivate: boolean;
  failureReason?: RedirectFailureReason;
  errorMessage?: string;
  sanitizedHeaders: Record<string, string>;
}

export interface HopValidationResult {
  allowed: boolean;
  reason?: RedirectFailureReason;
  errorMessage?: string;
  isDowngrade?: boolean;
  sanitizedTargetUrl?: string;
  scrubbedHeaders?: Record<string, string>;
}

export interface AndroidWebViewRedirectChainManager {
  startChain: (params: {
    tabId: string;
    initialUrl: string;
    isPrivate?: boolean;
    initialHeaders?: Record<string, string>;
  }) => { chainId: string; chainEpoch: number };

  recordHop: (params: {
    chainId: string;
    tabId: string;
    targetUrl: string;
    statusCode: number;
    headers?: Record<string, string>;
  }) => HopValidationResult;

  completeChain: (params: {
    chainId: string;
    tabId: string;
    finalUrl: string;
  }) => {
    success: boolean;
    finalUrl?: string;
    hopCount?: number;
    error?: string;
  };

  abortChain: (chainId: string, reason?: string) => void;

  getChainState: (chainId: string) => RedirectChainState | null;

  getActiveChainForTab: (tabId: string) => RedirectChainState | null;

  onTabNavigation: (tabId: string, newUrl: string) => { newEpoch: number };

  onTabClosed: (tabId: string, isPrivate?: boolean) => { purgedChainsCount: number };

  executeGuardedRedirectCallback: <T>(
    tabId: string,
    expectedEpoch: number,
    action: () => T
  ) => { executed: boolean; result?: T; staleEpochDetected?: boolean };

  validateTargetUrlSafety: (urlStr: string) => {
    isSafe: boolean;
    reason?: RedirectFailureReason;
    parsedUrl?: URL;
  };

  resetAll: () => void;
}

const MAX_ALLOWED_REDIRECT_HOPS = 15;

const DANGEROUS_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "intent:",
  "content:",
  "about:",
  "chrome:",
  "blob:",
  "vbscript:",
]);

const SENSITIVE_HEADER_KEYS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-auth-token",
  "x-api-key",
  "session-id",
];

/**
 * Checks whether an IP or hostname is private/loopback/cloud metadata
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();

  // Loopback and local
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".onion")
  ) {
    return true;
  }

  // Cloud metadata endpoint
  if (host === "169.254.169.254" || host.startsWith("169.254.")) {
    return true;
  }

  // IPv6 link-local and unique local
  const cleanHost = host.replace(/^\[|\]$/g, "");
  if (
    cleanHost.startsWith("fe80:") ||
    cleanHost.startsWith("fc00:") ||
    cleanHost.startsWith("fd00:") ||
    cleanHost === "::1"
  ) {
    return true;
  }

  // IPv4 Private subnets
  const ipParts = host.split(".").map((p) => parseInt(p, 10));
  if (ipParts.length === 4 && ipParts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    // 10.0.0.0/8
    if (ipParts[0] === 10) return true;
    // 172.16.0.0/12
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;
    // 192.168.0.0/16
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;
    // 127.0.0.0/8
    if (ipParts[0] === 127) return true;
    // 0.0.0.0/8
    if (ipParts[0] === 0) return true;
  }

  return false;
}

export function validateTargetUrlSafety(urlStr: string): {
  isSafe: boolean;
  reason?: RedirectFailureReason;
  parsedUrl?: URL;
} {
  if (!urlStr || typeof urlStr !== "string" || !urlStr.trim()) {
    return { isSafe: false, reason: RedirectFailureReason.INVALID_URL };
  }

  const trimmed = urlStr.trim().toLowerCase();

  for (const scheme of DANGEROUS_SCHEMES) {
    if (trimmed.startsWith(scheme)) {
      return { isSafe: false, reason: RedirectFailureReason.DANGEROUS_SCHEME };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { isSafe: false, reason: RedirectFailureReason.INVALID_URL };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isSafe: false, reason: RedirectFailureReason.DANGEROUS_SCHEME };
  }

  if (isBlockedHost(parsed.hostname)) {
    return { isSafe: false, reason: RedirectFailureReason.BLOCKED_INTERNAL_DESTINATION };
  }

  return { isSafe: true, parsedUrl: parsed };
}

/**
 * Strips sensitive auth headers on cross-origin redirects
 */
function sanitizeHeadersForRedirect(
  headers: Record<string, string>,
  isCrossOrigin: boolean,
  isDowngrade: boolean
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if ((isCrossOrigin || isDowngrade) && SENSITIVE_HEADER_KEYS.includes(lower)) {
      continue; // Strip
    }
    result[key] = value;
  }
  return result;
}

export function createAndroidWebViewRedirectChainManager(): AndroidWebViewRedirectChainManager {
  // Keyed by chainId
  const chains = new Map<string, RedirectChainState>();

  // Map tabId -> active chainId
  const tabActiveChainMap = new Map<string, string>();

  // Map tabId -> current monotonic chainEpoch
  const tabEpochMap = new Map<string, number>();

  function getTabEpoch(tabId: string): number {
    if (!tabEpochMap.has(tabId)) {
      tabEpochMap.set(tabId, 1);
    }
    return tabEpochMap.get(tabId)!;
  }

  function advanceTabEpoch(tabId: string): number {
    const next = getTabEpoch(tabId) + 1;
    tabEpochMap.set(tabId, next);
    return next;
  }

  function startChain(params: {
    tabId: string;
    initialUrl: string;
    isPrivate?: boolean;
    initialHeaders?: Record<string, string>;
  }): { chainId: string; chainEpoch: number } {
    // Abort previous chain for tab if any
    const existingChainId = tabActiveChainMap.get(params.tabId);
    if (existingChainId) {
      abortChain(existingChainId, "Superceded by new chain");
    }

    const currentEpoch = getTabEpoch(params.tabId);
    const chainId = `chn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const chain: RedirectChainState = {
      chainId,
      tabId: params.tabId,
      initialUrl: params.initialUrl,
      currentUrl: params.initialUrl,
      hops: [],
      status: RedirectChainStatus.IN_PROGRESS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chainEpoch: currentEpoch,
      isPrivate: params.isPrivate ?? false,
      sanitizedHeaders: { ...(params.initialHeaders || {}) },
    };

    chains.set(chainId, chain);
    tabActiveChainMap.set(params.tabId, chainId);

    return { chainId, chainEpoch: currentEpoch };
  }

  function recordHop(params: {
    chainId: string;
    tabId: string;
    targetUrl: string;
    statusCode: number;
    headers?: Record<string, string>;
  }): HopValidationResult {
    const chain = chains.get(params.chainId);
    if (!chain) {
      return {
        allowed: false,
        reason: RedirectFailureReason.INVALID_URL,
        errorMessage: "Redirect chain not found",
      };
    }

    // Tab isolation check
    if (chain.tabId !== params.tabId) {
      return {
        allowed: false,
        reason: RedirectFailureReason.TAB_MISMATCH,
        errorMessage: "Tab ID mismatch on redirect hop",
      };
    }

    // Stale epoch check
    if (chain.chainEpoch !== getTabEpoch(params.tabId)) {
      chain.status = RedirectChainStatus.ABORTED;
      chain.failureReason = RedirectFailureReason.STALE_CHAIN_EPOCH;
      return {
        allowed: false,
        reason: RedirectFailureReason.STALE_CHAIN_EPOCH,
        errorMessage: "Redirect belongs to a superceded navigation epoch",
      };
    }

    // Safety validation of target URL
    const safety = validateTargetUrlSafety(params.targetUrl);
    if (!safety.isSafe || !safety.parsedUrl) {
      chain.status = RedirectChainStatus.BLOCKED;
      chain.failureReason = safety.reason;
      chain.errorMessage = `Blocked unsafe redirect target: ${safety.reason}`;
      return {
        allowed: false,
        reason: safety.reason,
        errorMessage: chain.errorMessage,
      };
    }

    // Excessive redirects check
    if (chain.hops.length >= MAX_ALLOWED_REDIRECT_HOPS) {
      chain.status = RedirectChainStatus.BLOCKED;
      chain.failureReason = RedirectFailureReason.EXCESSIVE_REDIRECTS;
      chain.errorMessage = `Maximum redirect limit (${MAX_ALLOWED_REDIRECT_HOPS}) exceeded`;
      return {
        allowed: false,
        reason: RedirectFailureReason.EXCESSIVE_REDIRECTS,
        errorMessage: chain.errorMessage,
      };
    }

    // Loop and ping-pong detection with URL canonicalization
    const normalizeUrlForCompare = (u: string): string => {
      try {
        const p = new URL(u);
        const path = p.pathname.length > 1 && p.pathname.endsWith("/") ? p.pathname.slice(0, -1) : p.pathname;
        return `${p.protocol}//${p.host}${path}${p.search}`.toLowerCase();
      } catch {
        return u.toLowerCase().trim();
      }
    };

    const normalizedTarget = normalizeUrlForCompare(safety.parsedUrl.href);
    const normalizedInitial = normalizeUrlForCompare(chain.initialUrl);

    // Initial hop canonical destination check:
    // If this is the initial hop (hops.length === 0) and the target is canonical-equivalent
    // to the initial URL (e.g. https://example.com -> https://example.com/), it represents
    // benign URL canonicalization by the server or user-agent, not a circular loop.
    // However, if intermediate hops have occurred (hops.length > 0) and the target cycles back
    // to the initial URL, or if the target matches any previously visited hop, it is a genuine loop.
    const isFirstHopCanonicalEquivalent = chain.hops.length === 0 && normalizedTarget === normalizedInitial;

    const seenUrls = [
      ...(chain.hops.length > 0 ? [normalizedInitial] : []),
      ...chain.hops.map((h) => normalizeUrlForCompare(h.targetUrl)),
    ];

    if (!isFirstHopCanonicalEquivalent && seenUrls.includes(normalizedTarget)) {
      chain.status = RedirectChainStatus.BLOCKED;
      chain.failureReason = RedirectFailureReason.REDIRECT_LOOP_DETECTED;
      chain.errorMessage = `Circular redirect loop detected for URL: ${normalizedTarget}`;
      return {
        allowed: false,
        reason: RedirectFailureReason.REDIRECT_LOOP_DETECTED,
        errorMessage: chain.errorMessage,
      };
    }

    // Downgrade detection
    let sourceOrigin = "";
    let isHttpsSource = false;
    try {
      const srcParsed = new URL(chain.currentUrl);
      sourceOrigin = srcParsed.origin;
      isHttpsSource = srcParsed.protocol === "https:";
    } catch {
      sourceOrigin = "";
    }

    const targetOrigin = safety.parsedUrl.origin;
    const isDowngrade = isHttpsSource && safety.parsedUrl.protocol === "http:";
    const isCrossOrigin = sourceOrigin !== targetOrigin;

    // Header sanitization on cross-origin or downgrade
    const combinedHeaders = { ...chain.sanitizedHeaders, ...(params.headers || {}) };
    const scrubbed = sanitizeHeadersForRedirect(combinedHeaders, isCrossOrigin, isDowngrade);
    chain.sanitizedHeaders = scrubbed;

    // Record hop
    const hopRecord: RedirectHopRecord = {
      hopIndex: chain.hops.length + 1,
      sourceUrl: chain.currentUrl,
      targetUrl: safety.parsedUrl.href,
      statusCode: params.statusCode,
      timestamp: Date.now(),
      sourceOrigin,
      targetOrigin,
      isCrossOrigin,
      isDowngrade,
    };

    chain.hops.push(hopRecord);
    chain.currentUrl = safety.parsedUrl.href;
    chain.updatedAt = Date.now();

    return {
      allowed: true,
      isDowngrade,
      sanitizedTargetUrl: safety.parsedUrl.href,
      scrubbedHeaders: scrubbed,
    };
  }

  function completeChain(params: {
    chainId: string;
    tabId: string;
    finalUrl: string;
  }): {
    success: boolean;
    finalUrl?: string;
    hopCount?: number;
    error?: string;
  } {
    const chain = chains.get(params.chainId);
    if (!chain) {
      return { success: false, error: "Chain not found" };
    }

    if (chain.tabId !== params.tabId) {
      return { success: false, error: "Tab mismatch" };
    }

    if (chain.chainEpoch !== getTabEpoch(params.tabId)) {
      return { success: false, error: "Superceded epoch" };
    }

    chain.status = RedirectChainStatus.COMPLETED;
    chain.currentUrl = params.finalUrl;
    chain.updatedAt = Date.now();

    tabActiveChainMap.delete(params.tabId);

    return {
      success: true,
      finalUrl: params.finalUrl,
      hopCount: chain.hops.length,
    };
  }

  function abortChain(chainId: string, reason?: string): void {
    const chain = chains.get(chainId);
    if (chain && chain.status === RedirectChainStatus.IN_PROGRESS) {
      chain.status = RedirectChainStatus.ABORTED;
      chain.errorMessage = reason || "Aborted";
      chain.updatedAt = Date.now();
      if (tabActiveChainMap.get(chain.tabId) === chainId) {
        tabActiveChainMap.delete(chain.tabId);
      }
    }
  }

  function getChainState(chainId: string): RedirectChainState | null {
    const c = chains.get(chainId);
    return c ? { ...c, hops: [...c.hops] } : null;
  }

  function getActiveChainForTab(tabId: string): RedirectChainState | null {
    const chainId = tabActiveChainMap.get(tabId);
    if (!chainId) return null;
    return getChainState(chainId);
  }

  function onTabNavigation(tabId: string, _newUrl: string): { newEpoch: number } {
    const activeChainId = tabActiveChainMap.get(tabId);
    if (activeChainId) {
      abortChain(activeChainId, "Navigation triggered");
    }
    const nextEpoch = advanceTabEpoch(tabId);
    return { newEpoch: nextEpoch };
  }

  function onTabClosed(tabId: string, isPrivate?: boolean): { purgedChainsCount: number } {
    let count = 0;
    tabActiveChainMap.delete(tabId);
    tabEpochMap.delete(tabId);

    for (const [cId, chain] of Array.from(chains.entries())) {
      if (chain.tabId === tabId) {
        if (chain.status === RedirectChainStatus.IN_PROGRESS) {
          chain.status = RedirectChainStatus.ABORTED;
        }
        if (isPrivate) {
          chains.delete(cId);
        }
        count++;
      }
    }

    return { purgedChainsCount: count };
  }

  function executeGuardedRedirectCallback<T>(
    tabId: string,
    expectedEpoch: number,
    action: () => T
  ): { executed: boolean; result?: T; staleEpochDetected?: boolean } {
    const currentEpoch = getTabEpoch(tabId);
    if (expectedEpoch !== currentEpoch) {
      return {
        executed: false,
        staleEpochDetected: true,
      };
    }

    const res = action();
    return {
      executed: true,
      result: res,
      staleEpochDetected: false,
    };
  }

  function resetAll(): void {
    chains.clear();
    tabActiveChainMap.clear();
    tabEpochMap.clear();
  }

  return {
    startChain,
    recordHop,
    completeChain,
    abortChain,
    getChainState,
    getActiveChainForTab,
    onTabNavigation,
    onTabClosed,
    executeGuardedRedirectCallback,
    validateTargetUrlSafety,
    resetAll,
  };
}
