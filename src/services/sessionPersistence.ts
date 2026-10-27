import { BrowserTab, BrowsingMode, SiteMode } from "../types";

export const SESSION_SCHEMA_VERSION = 2 as const;
export const MAX_PERSISTED_TABS = 25;
export const MAX_TAB_HISTORY_LENGTH = 30;
export const MAX_TAB_TITLE_LENGTH = 120;
export const MAX_SNAPSHOT_BYTES = 256 * 1024; // 256 KB

export const SESSION_V2_PRIMARY_KEY = "netflow_tabs_session_v2";
export const SESSION_V2_BACKUP_KEY = "netflow_tabs_session_v2_bak";
export const SESSION_V2_TEMP_KEY = "netflow_tabs_session_v2_tmp";
export const SESSION_V1_LEGACY_KEY = "netflow_tabs_session";
export const SESSION_V1_ACTIVE_TAB_KEY = "netflow_active_tab_id";

export const SESSION_STORAGE_KEYS = [
  SESSION_V2_PRIMARY_KEY,
  SESSION_V2_BACKUP_KEY,
  SESSION_V2_TEMP_KEY,
  SESSION_V1_LEGACY_KEY,
  SESSION_V1_ACTIVE_TAB_KEY,
] as const;

export type HttpNavigationMethod = "GET" | "POST";

export type SessionClearScope =
  | { type: "all_time" }
  | {
      type: "time_range";
      cutoffTimestamp: number;
      survivingUrls?: Iterable<string>;
      clearedUrls?: Iterable<string>;
    }
  | {
      type: "single_site";
      domain: string;
      keepCurrentUrlIfOnDomain?: boolean;
    }
  | {
      type: "single_url";
      url: string;
    };

export interface SessionClearResult {
  epoch: number;
  tabs: SessionTabRuntime[];
  activeTabId: string;
  saveResult: SessionSaveResult;
  keysPurged: string[];
}

export interface PersistedTabV2 {
  id: string;
  order: number;
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
  zoomLevel: number;
  siteMode: SiteMode;
  isReaderMode: boolean;
  lightMode?: boolean;
  scrollY: number | null;
  lastMethod: HttpNavigationMethod;
}

export interface SessionSnapshotV2 {
  schemaVersion: 2;
  savedAt: number;
  activeTabId: string;
  checksum: string;
  tabs: PersistedTabV2[];
}

export type SessionTabRuntime = BrowserTab & {
  scrollY?: number | null;
  lastMethod?: HttpNavigationMethod;
};

export interface SessionStorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface SessionLoadResult {
  snapshot: SessionSnapshotV2 | null;
  tabs: SessionTabRuntime[];
  activeTabId: string;
  source: "primary" | "backup" | "migrated_v1" | "fresh";
  wasRestored: boolean;
  activeTabRequiresPostConfirm: boolean;
}

export interface SessionSaveResult {
  success: boolean;
  snapshot?: SessionSnapshotV2;
  bytesWritten?: number;
  empty?: boolean;
  stale?: boolean;
  error?: string;
}

const SENSITIVE_PARAM_TOKENS = [
  "token",
  "access_token",
  "id_token",
  "refresh_token",
  "auth",
  "key",
  "apikey",
  "api_key",
  "secret",
  "session",
  "sig",
  "signature",
  "credential",
  "pwd",
  "pass",
  "password",
];

function isSensitiveParamKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_PARAM_TOKENS.some((tok) => lower.includes(tok));
}

/**
 * Validates that a URL is a safe http/https URL (or empty string for Start Page).
 */
export function isValidSessionUrl(urlStr: string): boolean {
  if (!urlStr) return true;
  if (typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Sanitizes a URL for session persistence:
 * - Only permits http:// and https:// (returns "" otherwise)
 * - Strips HTTP Basic Auth / userinfo (username and password)
 * - Strips sensitive query parameters (token, auth, key, secret, session, signature, password, etc.)
 * - Strips sensitive hash fragment parameters
 */
export function sanitizeUrlForSession(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "";
    }

    // 1. Strip userinfo (username & password)
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
    }

    // 2. Strip sensitive query searchParams
    for (const key of Array.from(u.searchParams.keys())) {
      if (isSensitiveParamKey(key)) {
        u.searchParams.delete(key);
      }
    }

    // 3. Strip sensitive hash parameters if present
    if (u.hash && u.hash.length > 1) {
      const rawHash = u.hash.slice(1);
      const lowerHash = rawHash.toLowerCase();
      if (SENSITIVE_PARAM_TOKENS.some((tok) => lowerHash.includes(tok))) {
        try {
          const hashParams = new URLSearchParams(rawHash);
          let hadSensitive = false;
          for (const key of Array.from(hashParams.keys())) {
            if (isSensitiveParamKey(key)) {
              hashParams.delete(key);
              hadSensitive = true;
            }
          }
          if (hadSensitive) {
            const nextHash = hashParams.toString();
            u.hash = nextHash ? `#${nextHash}` : "";
          } else {
            u.hash = "";
          }
        } catch {
          u.hash = "";
        }
      }
    }

    return u.href;
  } catch {
    return "";
  }
}

/**
 * Determines whether scrollY can be safely captured by the host without breaking
 * Form 3/6 iframe sandbox isolation.
 * Only non-iframe renderer modes can report scrollY; iframe mode returns null.
 */
export function isScrollCapturableForTab(
  tab: {
    url?: string;
    isNativeWebView?: boolean;
    renderMode?: "native_webview" | "sanitized_html";
  },
  browsingMode?: BrowsingMode
): boolean {
  if (!tab.url || !tab.url.trim()) return false;
  if (tab.isNativeWebView === true || tab.renderMode === "native_webview") {
    return false;
  }
  if (browsingMode === "full" && tab.renderMode !== "sanitized_html" && tab.isNativeWebView !== false) {
    return false;
  }
  return true;
}

/**
 * Computes a deterministic checksum over the canonical V2 snapshot payload (excluding checksum field).
 */
export function computeSnapshotChecksum(
  payload: Omit<SessionSnapshotV2, "checksum">
): string {
  const canonical = JSON.stringify({
    schemaVersion: payload.schemaVersion,
    savedAt: payload.savedAt,
    activeTabId: payload.activeTabId,
    tabs: payload.tabs.map((t) => ({
      id: t.id,
      order: t.order,
      url: t.url,
      title: t.title,
      history: t.history,
      historyIndex: t.historyIndex,
      zoomLevel: t.zoomLevel,
      siteMode: t.siteMode,
      isReaderMode: t.isReaderMode,
      ...(typeof t.lightMode === "boolean" ? { lightMode: t.lightMode } : {}),
      scrollY: t.scrollY,
      lastMethod: t.lastMethod,
    })),
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x5bd1e995);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `nfv2_${part1}${part2}_${canonical.length}`;
}

/**
 * Validates that a parsed object conforms to SessionSnapshotV2 and has a valid checksum.
 */
export function validateAndVerifySnapshot(candidate: unknown): candidate is SessionSnapshotV2 {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false;
  }

  const obj = candidate as Record<string, unknown>;
  if (obj.schemaVersion !== SESSION_SCHEMA_VERSION) return false;
  if (typeof obj.savedAt !== "number" || !Number.isFinite(obj.savedAt) || obj.savedAt < 0) return false;
  if (typeof obj.activeTabId !== "string" || !obj.activeTabId.trim()) return false;
  if (typeof obj.checksum !== "string" || !obj.checksum.startsWith("nfv2_")) return false;
  if (!Array.isArray(obj.tabs) || obj.tabs.length === 0 || obj.tabs.length > MAX_PERSISTED_TABS) {
    return false;
  }

  const validatedTabs: PersistedTabV2[] = [];
  for (let i = 0; i < obj.tabs.length; i++) {
    const rawTab = obj.tabs[i];
    if (!rawTab || typeof rawTab !== "object" || Array.isArray(rawTab)) return false;
    const t = rawTab as Record<string, unknown>;

    // Ensure private tabs or forbidden fields (including favicons) were never slipped in
    if (t.isPrivate === true) return false;
    if (
      "postBody" in t ||
      "cookies" in t ||
      "formDrafts" in t ||
      "password" in t ||
      "favicon" in t ||
      "faviconBase64" in t ||
      "faviconDataUrl" in t
    ) {
      return false;
    }

    if (typeof t.id !== "string" || !t.id.trim()) return false;
    if (typeof t.order !== "number" || !Number.isInteger(t.order) || t.order < 0) return false;
    if (typeof t.url !== "string" || !isValidSessionUrl(t.url)) return false;
    if (typeof t.title !== "string" || t.title.length > MAX_TAB_TITLE_LENGTH) return false;
    if (!Array.isArray(t.history) || t.history.length === 0 || t.history.length > MAX_TAB_HISTORY_LENGTH) {
      return false;
    }
    if (!t.history.every((h) => typeof h === "string" && isValidSessionUrl(h))) {
      return false;
    }
    if (
      typeof t.historyIndex !== "number" ||
      !Number.isInteger(t.historyIndex) ||
      t.historyIndex < 0 ||
      t.historyIndex >= t.history.length
    ) {
      return false;
    }
    if (typeof t.zoomLevel !== "number" || t.zoomLevel < 50 || t.zoomLevel > 200) return false;
    if (t.siteMode !== "default" && t.siteMode !== "desktop" && t.siteMode !== "mobile") return false;
    if (typeof t.isReaderMode !== "boolean") return false;
    if (t.lightMode !== undefined && typeof t.lightMode !== "boolean") return false;
    if (t.scrollY !== null && (typeof t.scrollY !== "number" || !Number.isFinite(t.scrollY) || t.scrollY < 0)) {
      return false;
    }
    if (t.lastMethod !== "GET" && t.lastMethod !== "POST") return false;

    validatedTabs.push({
      id: t.id,
      order: t.order,
      url: t.url,
      title: t.title,
      history: t.history as string[],
      historyIndex: t.historyIndex,
      zoomLevel: t.zoomLevel,
      siteMode: t.siteMode,
      isReaderMode: t.isReaderMode,
      ...(typeof t.lightMode === "boolean" ? { lightMode: t.lightMode } : {}),
      scrollY: t.scrollY as number | null,
      lastMethod: t.lastMethod,
    });
  }

  const expectedChecksum = computeSnapshotChecksum({
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt: obj.savedAt as number,
    activeTabId: obj.activeTabId as string,
    tabs: validatedTabs,
  });

  return obj.checksum === expectedChecksum;
}

function getUtf8ByteLength(str: string): number {
  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str).length;
    }
  } catch {
    // Fallback below
  }
  return str.length * 2;
}

/**
 * Resolves the safe committed URL for a tab:
 * A failed or in-flight navigation without committed content MUST persist the
 * LAST COMMITTED history URL, not the failing/in-flight URL.
 */
export function resolveCommittedTabUrl(tab: SessionTabRuntime): string {
  const hasFailureOrInFlight = Boolean(tab.error || tab.errorInfo || tab.isLoading);
  const rawHistory = Array.isArray(tab.history) ? tab.history : [];
  const clampedHistoryIdx =
    rawHistory.length > 0
      ? Math.max(0, Math.min(tab.historyIndex ?? 0, rawHistory.length - 1))
      : 0;
  const committedHistoryCandidate =
    rawHistory.length > 0 && typeof rawHistory[clampedHistoryIdx] === "string"
      ? rawHistory[clampedHistoryIdx]
      : "";

  const candidateUrl =
    hasFailureOrInFlight && (!tab.contentHtml || tab.url !== committedHistoryCandidate)
      ? committedHistoryCandidate
      : tab.url || "";

  return sanitizeUrlForSession(candidateUrl);
}

/**
 * Trims a window of history entries to at most MAX_TAB_HISTORY_LENGTH (30) while preserving
 * the entry at historyIndex.
 */
function sanitizeAndBoundHistory(
  rawHistory: string[] | undefined,
  rawHistoryIndex: number | undefined,
  committedUrl: string
): { history: string[]; historyIndex: number } {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    return { history: [committedUrl], historyIndex: 0 };
  }

  const sanitizedEntries: string[] = [];
  let mappedIndex = 0;
  const targetIdx = Math.max(0, Math.min(rawHistoryIndex ?? 0, rawHistory.length - 1));

  for (let i = 0; i < rawHistory.length; i++) {
    const entry = rawHistory[i];
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "") {
      if (i === targetIdx) mappedIndex = sanitizedEntries.length;
      sanitizedEntries.push("");
    } else if (isValidSessionUrl(trimmed)) {
      const clean = sanitizeUrlForSession(trimmed);
      if (i === targetIdx) mappedIndex = sanitizedEntries.length;
      sanitizedEntries.push(clean);
    }
  }

  if (sanitizedEntries.length === 0) {
    return { history: [committedUrl], historyIndex: 0 };
  }

  mappedIndex = Math.max(0, Math.min(mappedIndex, sanitizedEntries.length - 1));

  // Ensure the entry at mappedIndex matches committedUrl if committedUrl is set
  if (committedUrl && sanitizedEntries[mappedIndex] !== committedUrl) {
    sanitizedEntries[mappedIndex] = committedUrl;
  }

  if (sanitizedEntries.length <= MAX_TAB_HISTORY_LENGTH) {
    return { history: sanitizedEntries, historyIndex: mappedIndex };
  }

  // Keep the most recent 30 entries while ensuring mappedIndex stays inside the slice
  const start = Math.max(
    0,
    Math.min(
      sanitizedEntries.length - MAX_TAB_HISTORY_LENGTH,
      mappedIndex - Math.floor(MAX_TAB_HISTORY_LENGTH / 2)
    )
  );
  const sliced = sanitizedEntries.slice(start, start + MAX_TAB_HISTORY_LENGTH);
  const newIndex = Math.max(0, Math.min(mappedIndex - start, sliced.length - 1));
  return { history: sliced, historyIndex: newIndex };
}

/**
 * Builds a verified, size-capped SessionSnapshotV2 from runtime tabs.
 * - Filters out private tabs
 * - Caps at 25 tabs (keeping active tab, dropping oldest background tabs first)
 * - Enforces 256 KB byte ceiling (trims oldest history entries first, then oldest background tabs, never active tab)
 */
export function buildSessionSnapshotV2(
  tabs: SessionTabRuntime[],
  requestedActiveTabId: string,
  options?: {
    browsingMode?: BrowsingMode;
    maxBytes?: number;
    maxTabs?: number;
    now?: number;
  }
): SessionSnapshotV2 | null {
  const maxTabs = options?.maxTabs ?? MAX_PERSISTED_TABS;
  const maxBytes = options?.maxBytes ?? MAX_SNAPSHOT_BYTES;
  const now = options?.now ?? Date.now();

  const nonPrivateTabs = (tabs || []).filter((t) => t && typeof t === "object" && !t.isPrivate && typeof t.id === "string" && t.id.trim());
  if (nonPrivateTabs.length === 0) {
    return null;
  }

  // Resolve activeTabId among non-private tabs (if current active tab was private, fall back to last non-private tab)
  const resolvedActiveId = nonPrivateTabs.some((t) => t.id === requestedActiveTabId)
    ? requestedActiveTabId
    : nonPrivateTabs[nonPrivateTabs.length - 1].id;

  // Convert each non-private tab strictly to PersistedTabV2 allowlisted fields
  let persistedTabs: PersistedTabV2[] = nonPrivateTabs.map((t, idx) => {
    const safeUrl = resolveCommittedTabUrl(t);
    const { history, historyIndex } = sanitizeAndBoundHistory(t.history, t.historyIndex, safeUrl);

    const rawTitle = typeof t.title === "string" && t.title.trim() ? t.title.trim() : safeUrl ? "Restored Tab" : "New Tab";
    const safeTitle = rawTitle.slice(0, MAX_TAB_TITLE_LENGTH);

    const safeZoom =
      typeof t.zoomLevel === "number" && Number.isFinite(t.zoomLevel) && t.zoomLevel >= 50 && t.zoomLevel <= 200
        ? Math.round(t.zoomLevel)
        : 100;

    const safeSiteMode: SiteMode =
      t.siteMode === "desktop" || t.siteMode === "mobile" ? t.siteMode : "default";

    const canCaptureScroll = isScrollCapturableForTab(t, options?.browsingMode);
    const safeScrollY: number | null =
      canCaptureScroll && typeof t.scrollY === "number" && Number.isFinite(t.scrollY) && t.scrollY >= 0
        ? Math.round(t.scrollY)
        : null;

    const safeMethod: HttpNavigationMethod = t.lastMethod === "POST" ? "POST" : "GET";

    return {
      id: t.id.trim(),
      order: idx,
      url: safeUrl,
      title: safeTitle,
      history,
      historyIndex,
      zoomLevel: safeZoom,
      siteMode: safeSiteMode,
      isReaderMode: Boolean(t.isReaderMode),
      lightMode: Boolean(t.lightMode),
      scrollY: safeScrollY,
      lastMethod: safeMethod,
    };
  });

  // 1. Enforce 25-tab cap: drop oldest background tabs first, never the active tab
  while (persistedTabs.length > maxTabs) {
    const dropIdx = persistedTabs.findIndex((t) => t.id !== resolvedActiveId);
    if (dropIdx === -1) break;
    persistedTabs.splice(dropIdx, 1);
  }
  persistedTabs.forEach((t, i) => {
    t.order = i;
  });

  const makeSnapshot = (currentTabs: PersistedTabV2[]): SessionSnapshotV2 => {
    const base = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      savedAt: now,
      activeTabId: resolvedActiveId,
      tabs: currentTabs,
    };
    return {
      ...base,
      checksum: computeSnapshotChecksum(base),
    };
  };

  let snapshot = makeSnapshot(persistedTabs);
  let byteLen = getUtf8ByteLength(JSON.stringify(snapshot));

  // 2. Enforce 256 KB size cap:
  // Phase A: Trim oldest history entries across tabs (starting from oldest background tabs, then active tab down to 1 entry)
  while (byteLen > maxBytes) {
    let trimmedAnyHistory = false;

    // Prefer trimming background tabs with > 1 history entry first
    for (let i = 0; i < persistedTabs.length; i++) {
      const tab = persistedTabs[i];
      if (tab.id !== resolvedActiveId && tab.history.length > 1) {
        if (tab.historyIndex > 0) {
          tab.history.shift();
          tab.historyIndex -= 1;
        } else {
          tab.history.pop();
        }
        trimmedAnyHistory = true;
        break;
      }
    }

    // If all background tabs are at history length 1, trim active tab history down to 1
    if (!trimmedAnyHistory) {
      const activeTabObj = persistedTabs.find((t) => t.id === resolvedActiveId);
      if (activeTabObj && activeTabObj.history.length > 1) {
        if (activeTabObj.historyIndex > 0) {
          activeTabObj.history.shift();
          activeTabObj.historyIndex -= 1;
        } else {
          activeTabObj.history.pop();
        }
        trimmedAnyHistory = true;
      }
    }

    if (!trimmedAnyHistory) {
      break;
    }

    snapshot = makeSnapshot(persistedTabs);
    byteLen = getUtf8ByteLength(JSON.stringify(snapshot));
  }

  // Phase B: If still > maxBytes, drop oldest background tabs (never the active tab)
  while (byteLen > maxBytes && persistedTabs.length > 1) {
    const oldestBgIdx = persistedTabs.findIndex((t) => t.id !== resolvedActiveId);
    if (oldestBgIdx === -1) break;
    persistedTabs.splice(oldestBgIdx, 1);
    persistedTabs.forEach((t, i) => {
      t.order = i;
    });
    snapshot = makeSnapshot(persistedTabs);
    byteLen = getUtf8ByteLength(JSON.stringify(snapshot));
  }

  return snapshot;
}

/**
 * Converts a SessionSnapshotV2 back into runtime BrowserTab instances sorted by `order`.
 */
export function snapshotToRuntimeTabs(snapshot: SessionSnapshotV2): SessionTabRuntime[] {
  const sorted = [...snapshot.tabs].sort((a, b) => a.order - b.order);
  return sorted.map((item) => ({
    id: item.id,
    url: item.url,
    title: item.title || (item.url ? "Restored Tab" : "New Tab"),
    history: item.history.length > 0 ? [...item.history] : [item.url],
    historyIndex: Math.max(0, Math.min(item.historyIndex, (item.history.length || 1) - 1)),
    isLoading: false,
    isPrivate: false,
    isReaderMode: Boolean(item.isReaderMode),
    lightMode: Boolean(item.lightMode),
    isSuspended: false,
    zoomLevel: item.zoomLevel,
    siteMode: item.siteMode,
    scrollY: item.scrollY,
    lastMethod: item.lastMethod,
  }));
}

export function createDefaultFreshTab(): SessionTabRuntime {
  return {
    id: "tab-initial-1",
    url: "",
    title: "New Tab",
    history: [""],
    historyIndex: 0,
    isLoading: false,
    isPrivate: false,
    isReaderMode: false,
    lightMode: false,
    isSuspended: false,
    zoomLevel: 100,
    siteMode: "default",
    scrollY: null,
    lastMethod: "GET",
  };
}

/**
 * Checks whether a URL's hostname matches a given domain (exact match, www-normalized match, or subdomain match).
 */
export function doesUrlMatchDomain(urlStr: string, domain: string): boolean {
  if (!urlStr || !domain || typeof urlStr !== "string" || typeof domain !== "string") {
    return false;
  }
  const cleanDomain = domain.trim().toLowerCase().replace(/^\./, "");
  if (!cleanDomain) return false;
  const bareDomain = cleanDomain.replace(/^www\./, "");

  try {
    const parsed = new URL(urlStr.trim());
    const host = parsed.hostname.toLowerCase();
    const bareHost = host.replace(/^www\./, "");
    return (
      host === cleanDomain ||
      bareHost === bareDomain ||
      host.endsWith(`.${cleanDomain}`) ||
      host.endsWith(`.${bareDomain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes runtime tabs for a given Clear Browsing Data / Clear History / Clear Site Data scope:
 * - all_time: reduces every tab's history array to [currentCommittedUrl] at historyIndex 0 (keeping open tabs' current URL, like Chrome).
 * - time_range: removes back/forward history entries falling in the cleared range while keeping entries proven older than cutoffTimestamp and keeping the open tab's current URL.
 * - single_site: removes all URLs matching `domain` from tab history arrays (and falls back to the most recent surviving non-domain URL or Start Page if the tab's current URL was on `domain`, unless keepCurrentUrlIfOnDomain is true).
 * - single_url: removes a specific deleted history URL from tab history arrays.
 */
export function sanitizeTabsForClearScope(
  tabs: SessionTabRuntime[],
  scope: SessionClearScope
): SessionTabRuntime[] {
  if (!Array.isArray(tabs)) return [];

  if (scope.type === "all_time") {
    return tabs.map((t) => {
      const committedUrl = resolveCommittedTabUrl(t);
      return {
        ...t,
        url: committedUrl,
        history: [committedUrl],
        historyIndex: 0,
      };
    });
  }

  if (scope.type === "time_range") {
    const clearedSet = new Set<string>();
    if (scope.clearedUrls) {
      for (const u of scope.clearedUrls) {
        const clean = sanitizeUrlForSession(u);
        if (clean) clearedSet.add(clean);
      }
    }
    const survivingSet: Set<string> | null = scope.survivingUrls ? new Set<string>() : null;
    if (scope.survivingUrls && survivingSet) {
      for (const u of scope.survivingUrls) {
        const clean = sanitizeUrlForSession(u);
        if (clean) survivingSet.add(clean);
      }
    }

    return tabs.map((t) => {
      const committedUrl = resolveCommittedTabUrl(t);
      const rawHistory = Array.isArray(t.history) && t.history.length > 0 ? t.history : [committedUrl];
      const clampedCurrentIdx = Math.max(0, Math.min(t.historyIndex ?? 0, rawHistory.length - 1));

      const filteredHistory: string[] = [];
      let nextHistoryIdx = 0;

      for (let i = 0; i < rawHistory.length; i++) {
        if (i === clampedCurrentIdx) {
          nextHistoryIdx = filteredHistory.length;
          filteredHistory.push(committedUrl);
          continue;
        }

        const cleanEntry = sanitizeUrlForSession(rawHistory[i] || "");
        if (!cleanEntry) {
          continue;
        }
        if (clearedSet.has(cleanEntry)) {
          continue;
        }
        if (survivingSet !== null) {
          if (!survivingSet.has(cleanEntry)) {
            continue;
          }
        } else if (clearedSet.size === 0) {
          // If no timestamped surviving/cleared sets were supplied, do not allow untimestamped prior entries to remain
          continue;
        }

        filteredHistory.push(cleanEntry);
      }

      if (filteredHistory.length === 0) {
        filteredHistory.push(committedUrl);
        nextHistoryIdx = 0;
      }

      return {
        ...t,
        url: committedUrl,
        history: filteredHistory,
        historyIndex: Math.max(0, Math.min(nextHistoryIdx, filteredHistory.length - 1)),
      };
    });
  }

  if (scope.type === "single_site") {
    const targetDomain = scope.domain;
    return tabs.map((t) => {
      const committedUrl = resolveCommittedTabUrl(t);
      const rawHistory = Array.isArray(t.history) && t.history.length > 0 ? t.history : [committedUrl];
      const clampedCurrentIdx = Math.max(0, Math.min(t.historyIndex ?? 0, rawHistory.length - 1));
      const currentMatchesDomain = doesUrlMatchDomain(committedUrl, targetDomain);

      const survivingHistory: string[] = [];
      let mappedCurrentIdx = -1;

      for (let i = 0; i < rawHistory.length; i++) {
        const entry = i === clampedCurrentIdx ? committedUrl : sanitizeUrlForSession(rawHistory[i] || "");
        if (doesUrlMatchDomain(entry, targetDomain)) {
          if (i === clampedCurrentIdx && scope.keepCurrentUrlIfOnDomain === true) {
            mappedCurrentIdx = survivingHistory.length;
            survivingHistory.push(committedUrl);
          }
          continue;
        }
        if (i === clampedCurrentIdx) {
          mappedCurrentIdx = survivingHistory.length;
        } else if (i < clampedCurrentIdx && mappedCurrentIdx === -1) {
          // Track most recent surviving entry prior to clampedCurrentIdx in case current URL was cleared
        }
        survivingHistory.push(entry);
      }

      if (!currentMatchesDomain || scope.keepCurrentUrlIfOnDomain === true) {
        if (survivingHistory.length === 0) {
          return {
            ...t,
            url: committedUrl,
            history: [committedUrl],
            historyIndex: 0,
          };
        }
        const resolvedIdx =
          mappedCurrentIdx >= 0
            ? mappedCurrentIdx
            : Math.max(0, survivingHistory.lastIndexOf(committedUrl));
        return {
          ...t,
          url: committedUrl,
          history: survivingHistory,
          historyIndex: Math.max(0, Math.min(resolvedIdx, survivingHistory.length - 1)),
        };
      }

      // Current tab URL was on the cleared domain and keepCurrentUrlIfOnDomain is false/omitted:
      // Fall back to the most recent surviving non-domain entry in this tab's history, or Start Page ("") if none.
      const nonEmptySurviving = survivingHistory.filter((u) => Boolean(u && u.trim() !== ""));
      if (nonEmptySurviving.length > 0) {
        const fallbackUrl = nonEmptySurviving[nonEmptySurviving.length - 1];
        return {
          ...t,
          url: fallbackUrl,
          title: t.title && !doesUrlMatchDomain(committedUrl, targetDomain) ? t.title : "Restored Tab",
          history: nonEmptySurviving,
          historyIndex: nonEmptySurviving.length - 1,
          contentHtml: undefined,
          rawText: undefined,
          error: undefined,
          errorInfo: undefined,
          scrollY: null,
          lastMethod: "GET",
        };
      }

      return {
        ...t,
        url: "",
        title: "New Tab",
        history: [""],
        historyIndex: 0,
        contentHtml: undefined,
        rawText: undefined,
        error: undefined,
        errorInfo: undefined,
        isLoading: false,
        scrollY: null,
        lastMethod: "GET",
      };
    });
  }

  if (scope.type === "single_url") {
    const targetCleanUrl = sanitizeUrlForSession(scope.url);
    if (!targetCleanUrl) return tabs;

    return tabs.map((t) => {
      const committedUrl = resolveCommittedTabUrl(t);
      const rawHistory = Array.isArray(t.history) && t.history.length > 0 ? t.history : [committedUrl];
      const clampedCurrentIdx = Math.max(0, Math.min(t.historyIndex ?? 0, rawHistory.length - 1));

      const filteredHistory: string[] = [];
      let nextHistoryIdx = 0;

      for (let i = 0; i < rawHistory.length; i++) {
        const cleanEntry = i === clampedCurrentIdx ? committedUrl : sanitizeUrlForSession(rawHistory[i] || "");
        if (i === clampedCurrentIdx) {
          nextHistoryIdx = filteredHistory.length;
          filteredHistory.push(committedUrl);
          continue;
        }
        if (cleanEntry === targetCleanUrl) {
          continue;
        }
        filteredHistory.push(cleanEntry);
      }

      if (filteredHistory.length === 0) {
        filteredHistory.push(committedUrl);
        nextHistoryIdx = 0;
      }

      return {
        ...t,
        url: committedUrl,
        history: filteredHistory,
        historyIndex: Math.max(0, Math.min(nextHistoryIdx, filteredHistory.length - 1)),
      };
    });
  }

  return tabs;
}

function getDefaultStorageAdapter(): SessionStorageAdapter {
  return {
    getItem(key: string): string | null {
      try {
        if (typeof localStorage !== "undefined") {
          return localStorage.getItem(key);
        }
      } catch {}
      return null;
    },
    setItem(key: string, value: string): void {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
    },
    removeItem(key: string): void {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(key);
        }
      } catch {}
    },
  };
}

export interface SessionPersistenceEngineConfig {
  storage?: SessionStorageAdapter;
  debounceMs?: number;
  checkpointIntervalMs?: number;
  maxBytes?: number;
  maxTabs?: number;
}

export interface SessionPersistenceEngine {
  saveSnapshotAtomic: (
    tabs: SessionTabRuntime[],
    activeTabId: string,
    options?: {
      browsingMode?: BrowsingMode;
      now?: number;
      expectedEpoch?: number;
      resetBackupToPrimary?: boolean;
    }
  ) => SessionSaveResult;
  loadSession: () => SessionLoadResult;
  scheduleSave: (
    tabs: SessionTabRuntime[],
    activeTabId: string,
    browsingMode?: BrowsingMode,
    options?: { expectedEpoch?: number }
  ) => void;
  markDirty: (
    tabs: SessionTabRuntime[],
    activeTabId: string,
    browsingMode?: BrowsingMode
  ) => void;
  flushNow: (
    tabs?: SessionTabRuntime[],
    activeTabId?: string,
    browsingMode?: BrowsingMode
  ) => SessionSaveResult;
  purgeAndResaveForClear: (
    tabs: SessionTabRuntime[],
    activeTabId: string,
    scope: SessionClearScope,
    browsingMode?: BrowsingMode
  ) => SessionClearResult;
  clearSessionStorage: (
    tabsToResave?: SessionTabRuntime[],
    activeTabId?: string,
    browsingMode?: BrowsingMode
  ) => void;
  getSaveEpoch: () => number;
  attachLifecycleListeners: () => () => void;
  destroy: () => void;
}

/**
 * Creates the NETFLOW V2 Session Persistence Engine with dual-slot atomic storage,
 * checksum verification, V1->V2 safe migration, generation/epoch protection against
 * stale writes after clear, and lifecycle flush triggers.
 */
export function createSessionPersistenceEngine(
  config: SessionPersistenceEngineConfig = {}
): SessionPersistenceEngine {
  const storage = config.storage || getDefaultStorageAdapter();
  const debounceMs = config.debounceMs ?? 250;
  const checkpointIntervalMs = config.checkpointIntervalMs ?? 10000;
  const maxBytes = config.maxBytes ?? MAX_SNAPSHOT_BYTES;
  const maxTabs = config.maxTabs ?? MAX_PERSISTED_TABS;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let checkpointTimer: ReturnType<typeof setInterval> | null = null;
  let isDirty = false;
  let saveEpoch = 0;
  let latestTabs: SessionTabRuntime[] | null = null;
  let latestActiveTabId: string = "";
  let latestBrowsingMode: BrowsingMode | undefined = undefined;

  function clearDebounceTimer() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function removeAllSessionKeys(): string[] {
    const purged: string[] = [];
    for (const key of SESSION_STORAGE_KEYS) {
      storage.removeItem(key);
      purged.push(key);
    }
    return purged;
  }

  function getSaveEpoch(): number {
    return saveEpoch;
  }

  /**
   * Dual-slot atomic write:
   * 1. Check generation/epoch token (discard if stale)
   * 2. Write candidate JSON to TEMP_KEY
   * 3. Re-read TEMP_KEY and verify JSON parse + checksum
   * 4. Copy current valid PRIMARY_KEY (if any, and unless resetBackupToPrimary is true) to BACKUP_KEY
   * 5. Promote verified candidate to PRIMARY_KEY and verify PRIMARY_KEY re-read
   * 6. Remove TEMP_KEY (and remove V1 legacy key only after V2 primary verifies)
   */
  function saveSnapshotAtomic(
    tabs: SessionTabRuntime[],
    activeTabId: string,
    options?: {
      browsingMode?: BrowsingMode;
      now?: number;
      expectedEpoch?: number;
      resetBackupToPrimary?: boolean;
    }
  ): SessionSaveResult {
    if (options?.expectedEpoch !== undefined && options.expectedEpoch !== saveEpoch) {
      return {
        success: false,
        stale: true,
        error: `Discarded stale save from epoch ${options.expectedEpoch} (current epoch: ${saveEpoch})`,
      };
    }

    try {
      const snapshot = buildSessionSnapshotV2(tabs, activeTabId, {
        browsingMode: options?.browsingMode ?? latestBrowsingMode,
        maxBytes,
        maxTabs,
        now: options?.now,
      });

      if (!snapshot) {
        // No non-private tabs to persist; clear stored session keys safely
        removeAllSessionKeys();
        isDirty = false;
        return { success: true, empty: true, bytesWritten: 0 };
      }

      const serialized = JSON.stringify(snapshot);
      const bytesWritten = getUtf8ByteLength(serialized);

      // Step 1: Write candidate to temp key
      storage.setItem(SESSION_V2_TEMP_KEY, serialized);

      // Step 2: Verify temp key by re-read + JSON parse + checksum verification
      const tempReadBack = storage.getItem(SESSION_V2_TEMP_KEY);
      if (!tempReadBack || tempReadBack !== serialized) {
        return { success: false, error: "Temp slot re-read mismatch" };
      }
      const parsedTemp = JSON.parse(tempReadBack);
      if (!validateAndVerifySnapshot(parsedTemp)) {
        return { success: false, error: "Temp slot checksum verification failed" };
      }

      // Step 3: Preserve existing valid primary as backup before overwriting primary
      // (unless resetBackupToPrimary is set after a clear action, where old backup must NOT be kept)
      if (!options?.resetBackupToPrimary) {
        try {
          const currentPrimaryRaw = storage.getItem(SESSION_V2_PRIMARY_KEY);
          if (currentPrimaryRaw) {
            const parsedCurrentPrimary = JSON.parse(currentPrimaryRaw);
            if (validateAndVerifySnapshot(parsedCurrentPrimary)) {
              storage.setItem(SESSION_V2_BACKUP_KEY, currentPrimaryRaw);
            }
          }
        } catch {
          // Ignore corrupt current primary; keep existing backup intact
        }
      }

      // Step 4: Promote verified candidate to primary key and verify primary
      storage.setItem(SESSION_V2_PRIMARY_KEY, tempReadBack);
      const primaryReadBack = storage.getItem(SESSION_V2_PRIMARY_KEY);
      if (!primaryReadBack) {
        return { success: false, error: "Primary slot write verification failed" };
      }
      const parsedPrimary = JSON.parse(primaryReadBack);
      if (!validateAndVerifySnapshot(parsedPrimary)) {
        return { success: false, error: "Primary slot checksum verification failed" };
      }

      // Step 5: Ensure backup slot is populated on first valid V2 save or overwritten when resetBackupToPrimary is true
      try {
        const existingBackupRaw = storage.getItem(SESSION_V2_BACKUP_KEY);
        if (!existingBackupRaw || options?.resetBackupToPrimary) {
          storage.setItem(SESSION_V2_BACKUP_KEY, primaryReadBack);
        }
      } catch {}

      // Step 6: Clean up temp slot and remove legacy V1 key now that V2 primary is verified
      storage.removeItem(SESSION_V2_TEMP_KEY);
      storage.removeItem(SESSION_V1_LEGACY_KEY);
      try {
        storage.setItem(SESSION_V1_ACTIVE_TAB_KEY, snapshot.activeTabId);
      } catch {}

      isDirty = false;
      return {
        success: true,
        snapshot: parsedPrimary,
        bytesWritten,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Storage write failed",
      };
    }
  }

  /**
   * Attempts to read and convert legacy V1 `netflow_tabs_session` into V2.
   * Does NOT delete `netflow_tabs_session` until V2 is written and verified.
   */
  function tryMigrateFromLegacyV1(): SessionLoadResult | null {
    try {
      const legacyRaw = storage.getItem(SESSION_V1_LEGACY_KEY);
      if (!legacyRaw) return null;

      const parsed = JSON.parse(legacyRaw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      const legacyTabs: SessionTabRuntime[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        if (item.isPrivate === true) continue;
        if (typeof item.id !== "string" || !item.id.trim()) continue;

        const safeUrl = typeof item.url === "string" ? sanitizeUrlForSession(item.url) : "";
        const safeTitle =
          typeof item.title === "string" && item.title.trim()
            ? item.title.trim().slice(0, MAX_TAB_TITLE_LENGTH)
            : safeUrl
            ? "Restored Tab"
            : "New Tab";

        const rawHistory = Array.isArray(item.history)
          ? item.history.filter((h: unknown) => typeof h === "string")
          : [safeUrl];

        legacyTabs.push({
          id: item.id.trim(),
          url: safeUrl,
          title: safeTitle,
          history: rawHistory.length > 0 ? rawHistory : [safeUrl],
          historyIndex: typeof item.historyIndex === "number" ? item.historyIndex : 0,
          isLoading: false,
          isPrivate: false,
          isReaderMode: Boolean(item.isReaderMode),
          lightMode: Boolean(item.lightMode),
          isSuspended: false,
          zoomLevel:
            typeof item.zoomLevel === "number" && item.zoomLevel >= 50 && item.zoomLevel <= 200
              ? Math.round(item.zoomLevel)
              : 100,
          siteMode:
            item.siteMode === "desktop" || item.siteMode === "mobile" ? item.siteMode : "default",
          scrollY: null,
          lastMethod: item.lastMethod === "POST" ? "POST" : "GET",
        });
      }

      if (legacyTabs.length === 0) return null;

      const legacyActiveId = storage.getItem(SESSION_V1_ACTIVE_TAB_KEY) || legacyTabs[0].id;

      // Save to V2 atomically (saveSnapshotAtomic only removes SESSION_V1_LEGACY_KEY if V2 verifies)
      const saveRes = saveSnapshotAtomic(legacyTabs, legacyActiveId);
      const snapshot =
        saveRes.snapshot ||
        buildSessionSnapshotV2(legacyTabs, legacyActiveId, { maxBytes, maxTabs });

      if (!snapshot) return null;

      const runtimeTabs = snapshotToRuntimeTabs(snapshot);
      const activeTab = runtimeTabs.find((t) => t.id === snapshot.activeTabId) || runtimeTabs[0];
      const hasNonStartPage = runtimeTabs.some((t) => Boolean(t.url && t.url.trim() !== ""));

      return {
        snapshot,
        tabs: runtimeTabs,
        activeTabId: snapshot.activeTabId,
        source: "migrated_v1",
        wasRestored: hasNonStartPage,
        activeTabRequiresPostConfirm: Boolean(activeTab?.url && activeTab.lastMethod === "POST"),
      };
    } catch {
      return null;
    }
  }

  /**
   * Loads session with checksum verification and automatic fallback:
   * 1. Try PRIMARY_KEY -> verify checksum
   * 2. If invalid/corrupt/missing, try BACKUP_KEY -> verify checksum (and heal PRIMARY_KEY)
   * 3. If neither V2 slot exists, try migrating V1 `netflow_tabs_session`
   * 4. If both V2 slots are corrupt/invalid, start fresh without throwing
   */
  function loadSession(): SessionLoadResult {
    // 1. Try V2 Primary Slot
    try {
      const primaryRaw = storage.getItem(SESSION_V2_PRIMARY_KEY);
      if (primaryRaw) {
        const parsedPrimary = JSON.parse(primaryRaw);
        if (validateAndVerifySnapshot(parsedPrimary)) {
          // Ensure V1 key is cleaned up once V2 primary is confirmed valid
          storage.removeItem(SESSION_V1_LEGACY_KEY);
          const runtimeTabs = snapshotToRuntimeTabs(parsedPrimary);
          const activeTab =
            runtimeTabs.find((t) => t.id === parsedPrimary.activeTabId) || runtimeTabs[0];
          const hasNonStartPage = runtimeTabs.some((t) => Boolean(t.url && t.url.trim() !== ""));
          return {
            snapshot: parsedPrimary,
            tabs: runtimeTabs,
            activeTabId: activeTab.id,
            source: "primary",
            wasRestored: hasNonStartPage,
            activeTabRequiresPostConfirm: Boolean(
              activeTab?.url && activeTab.lastMethod === "POST"
            ),
          };
        }
      }
    } catch {
      // Primary corrupt; fall through to backup slot
    }

    // 2. Try V2 Backup Slot
    try {
      const backupRaw = storage.getItem(SESSION_V2_BACKUP_KEY);
      if (backupRaw) {
        const parsedBackup = JSON.parse(backupRaw);
        if (validateAndVerifySnapshot(parsedBackup)) {
          // Heal primary slot from verified backup
          try {
            storage.setItem(SESSION_V2_PRIMARY_KEY, backupRaw);
          } catch {}
          const runtimeTabs = snapshotToRuntimeTabs(parsedBackup);
          const activeTab =
            runtimeTabs.find((t) => t.id === parsedBackup.activeTabId) || runtimeTabs[0];
          const hasNonStartPage = runtimeTabs.some((t) => Boolean(t.url && t.url.trim() !== ""));
          return {
            snapshot: parsedBackup,
            tabs: runtimeTabs,
            activeTabId: activeTab.id,
            source: "backup",
            wasRestored: hasNonStartPage,
            activeTabRequiresPostConfirm: Boolean(
              activeTab?.url && activeTab.lastMethod === "POST"
            ),
          };
        }
      }
    } catch {
      // Backup also corrupt; fall through
    }

    // 3. Try Legacy V1 Migration (only if no valid V2 slot existed)
    const migrated = tryMigrateFromLegacyV1();
    if (migrated) {
      return migrated;
    }

    // 4. Both invalid or no saved session -> start fresh without crashing
    const freshTab = createDefaultFreshTab();
    return {
      snapshot: null,
      tabs: [freshTab],
      activeTabId: freshTab.id,
      source: "fresh",
      wasRestored: false,
      activeTabRequiresPostConfirm: false,
    };
  }

  function scheduleSave(
    tabs: SessionTabRuntime[],
    activeTabId: string,
    browsingMode?: BrowsingMode,
    options?: { expectedEpoch?: number }
  ): void {
    if (options?.expectedEpoch !== undefined && options.expectedEpoch !== saveEpoch) {
      // Stale save request from a prior epoch before a clear operation; discard
      return;
    }

    const scheduledEpoch = saveEpoch;
    const clonedTabs = tabs.map((t) => ({
      ...t,
      history: Array.isArray(t.history) ? [...t.history] : [t.url || ""],
    }));

    latestTabs = clonedTabs;
    latestActiveTabId = activeTabId;
    if (browsingMode !== undefined) {
      latestBrowsingMode = browsingMode;
    }
    isDirty = true;

    clearDebounceTimer();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // Discard if epoch advanced due to a clear action while timer was pending
      if (scheduledEpoch !== saveEpoch) {
        return;
      }
      if (isDirty && latestTabs) {
        saveSnapshotAtomic(latestTabs, latestActiveTabId, {
          browsingMode: latestBrowsingMode,
          expectedEpoch: scheduledEpoch,
        });
      }
    }, debounceMs);
  }

  function markDirty(
    tabs: SessionTabRuntime[],
    activeTabId: string,
    browsingMode?: BrowsingMode
  ): void {
    latestTabs = tabs.map((t) => ({
      ...t,
      history: Array.isArray(t.history) ? [...t.history] : [t.url || ""],
    }));
    latestActiveTabId = activeTabId;
    if (browsingMode !== undefined) {
      latestBrowsingMode = browsingMode;
    }
    isDirty = true;
  }

  function flushNow(
    tabs?: SessionTabRuntime[],
    activeTabId?: string,
    browsingMode?: BrowsingMode
  ): SessionSaveResult {
    clearDebounceTimer();
    if (tabs !== undefined) {
      latestTabs = tabs.map((t) => ({
        ...t,
        history: Array.isArray(t.history) ? [...t.history] : [t.url || ""],
      }));
    }
    if (activeTabId !== undefined) {
      latestActiveTabId = activeTabId;
    }
    if (browsingMode !== undefined) {
      latestBrowsingMode = browsingMode;
    }

    if (!latestTabs) {
      return { success: false, error: "No tab state available to flush" };
    }

    return saveSnapshotAtomic(latestTabs, latestActiveTabId, {
      browsingMode: latestBrowsingMode,
      expectedEpoch: saveEpoch,
    });
  }

  /**
   * Purges all V2 & legacy session keys, advances the generation/epoch token to invalidate
   * any pending debounced/periodic saves, sanitizes the open tabs for the given clear scope,
   * and atomically re-saves a minimal fresh snapshot of the open non-private tabs (updating
   * both primary and backup slots so startup restore can never resurrect cleared data).
   */
  function purgeAndResaveForClear(
    tabs: SessionTabRuntime[],
    activeTabId: string,
    scope: SessionClearScope,
    browsingMode?: BrowsingMode
  ): SessionClearResult {
    saveEpoch += 1;
    const currentEpoch = saveEpoch;
    clearDebounceTimer();
    isDirty = false;

    // 1. Purge primary, backup, temp, and legacy migration keys immediately
    const keysPurged = removeAllSessionKeys();

    // 2. Sanitize tabs according to the clear scope
    const sanitizedTabs = sanitizeTabsForClearScope(tabs, scope);
    const resolvedActiveId =
      sanitizedTabs.some((t) => t.id === activeTabId)
        ? activeTabId
        : sanitizedTabs[0]?.id || activeTabId;

    // 3. Update latestTabs so any subsequent visibilitychange/pagehide/checkpoint flush writes only post-clear state
    latestTabs = sanitizedTabs.map((t) => ({
      ...t,
      history: Array.isArray(t.history) ? [...t.history] : [t.url || ""],
    }));
    latestActiveTabId = resolvedActiveId;
    if (browsingMode !== undefined) {
      latestBrowsingMode = browsingMode;
    }

    // 4. Re-save clean minimal snapshot (both primary and backup slots get the clean post-clear state)
    const saveResult = saveSnapshotAtomic(sanitizedTabs, resolvedActiveId, {
      browsingMode: browsingMode ?? latestBrowsingMode,
      expectedEpoch: currentEpoch,
      resetBackupToPrimary: true,
    });
    isDirty = false;

    return {
      epoch: currentEpoch,
      tabs: sanitizedTabs,
      activeTabId: resolvedActiveId,
      saveResult,
      keysPurged,
    };
  }

  function clearSessionStorage(
    tabsToResave?: SessionTabRuntime[],
    activeTabId?: string,
    browsingMode?: BrowsingMode
  ): void {
    saveEpoch += 1;
    const currentEpoch = saveEpoch;
    clearDebounceTimer();
    isDirty = false;
    removeAllSessionKeys();

    if (tabsToResave && tabsToResave.length > 0) {
      const sanitizedTabs = sanitizeTabsForClearScope(tabsToResave, { type: "all_time" });
      const resolvedActiveId =
        activeTabId && sanitizedTabs.some((t) => t.id === activeTabId)
          ? activeTabId
          : sanitizedTabs[0]?.id || "tab-initial-1";
      latestTabs = sanitizedTabs;
      latestActiveTabId = resolvedActiveId;
      if (browsingMode !== undefined) {
        latestBrowsingMode = browsingMode;
      }
      saveSnapshotAtomic(sanitizedTabs, resolvedActiveId, {
        browsingMode: browsingMode ?? latestBrowsingMode,
        expectedEpoch: currentEpoch,
        resetBackupToPrimary: true,
      });
      isDirty = false;
    } else {
      latestTabs = null;
    }
  }

  function attachLifecycleListeners(): () => void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return () => {};
    }

    // Periodic checkpoint timer (runs only when dirty)
    if (checkpointTimer === null && checkpointIntervalMs > 0) {
      checkpointTimer = setInterval(() => {
        if (isDirty && latestTabs) {
          flushNow();
        }
      }, checkpointIntervalMs);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" || document.hidden) {
        if (isDirty && latestTabs) {
          flushNow();
        }
      }
    };

    const handlePageHide = () => {
      if (isDirty && latestTabs) {
        flushNow();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      if (checkpointTimer !== null) {
        clearInterval(checkpointTimer);
        checkpointTimer = null;
      }
    };
  }

  function destroy(): void {
    clearDebounceTimer();
    if (checkpointTimer !== null) {
      clearInterval(checkpointTimer);
      checkpointTimer = null;
    }
  }

  return {
    saveSnapshotAtomic,
    loadSession,
    scheduleSave,
    markDirty,
    flushNow,
    purgeAndResaveForClear,
    clearSessionStorage,
    getSaveEpoch,
    attachLifecycleListeners,
    destroy,
  };
}
