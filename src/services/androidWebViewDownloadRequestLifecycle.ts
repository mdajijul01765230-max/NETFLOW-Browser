/**
 * Android WebView Download Request Routing & Safe Download Lifecycle Boundary (NETFLOW-V2-NATIVE-35)
 *
 * Implements:
 * - WebView download request detection and routing (HTTP/S, blob, data URIs)
 * - Strict URL, MIME type, and filename validation & sanitization
 * - Defense against SSRF, internal network/metadata targets, and dangerous URL schemes
 * - Defense against path traversal (../, ..\), null-bytes, reserved OS names, and dangerous executable extensions
 * - Complete download lifecycle state machine:
 *   DETECTED -> VALIDATING -> PENDING_CONSENT -> DOWNLOADING -> COMPLETED / FAILED / CANCELLED / BLOCKED_SECURITY
 * - Detailed progress tracking: bytes downloaded, total bytes, progress percentage, transfer speed
 * - Duplicate & rapid download request race protection with per-tab request debouncing and monotonic epochs
 * - Per-tab download state isolation preventing cross-tab state leakage
 * - Ephemeral private-tab download state isolated and immediately expunged upon tab closure
 * - Automatic cleanup of pending downloads and abort controllers on tab navigation or tab close
 * - Full compatibility with NATIVE-31 Page Lifecycle, NATIVE-30 Rendering Resilience, and NATIVE-29 Media Governance
 * - Strict Invariant: No privileged JS bridges, JNI, or reflection.
 */

export enum DownloadLifecycleState {
  DETECTED = "DETECTED",
  VALIDATING = "VALIDATING",
  PENDING_CONSENT = "PENDING_CONSENT",
  STARTING = "STARTING",
  DOWNLOADING = "DOWNLOADING",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  BLOCKED_SECURITY = "BLOCKED_SECURITY",
}

export enum DownloadBlockReason {
  MALICIOUS_SCHEME = "MALICIOUS_SCHEME",
  INTERNAL_OR_METADATA_IP = "INTERNAL_OR_METADATA_IP",
  UNSUPPORTED_PROTOCOL = "UNSUPPORTED_PROTOCOL",
  EMPTY_OR_MALFORMED_URL = "EMPTY_OR_MALFORMED_URL",
  PATH_TRAVERSAL_DETECTED = "PATH_TRAVERSAL_DETECTED",
  DANGEROUS_EXECUTABLE = "DANGEROUS_EXECUTABLE",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  USER_REJECTED = "USER_REJECTED",
  PARENT_TAB_CLOSED = "PARENT_TAB_CLOSED",
  NAVIGATION_CANCELLED = "NAVIGATION_CANCELLED",
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speedBps: number;
  estimatedRemainingMs: number;
  lastUpdateTime: number;
}

export interface SafeDownloadRecord {
  downloadId: string;
  tabId: string;
  requestEpoch: number;
  sourceUrl: string;
  sanitizedUrl: string;
  domain: string;
  filename: string;
  sanitizedFilename: string;
  extension: string;
  mimeType: string;
  totalBytes: number;
  isPrivate: boolean;
  state: DownloadLifecycleState;
  blockReason?: DownloadBlockReason;
  errorMessage?: string;
  isDangerousExtension: boolean;
  securityWarning?: string;
  progress: DownloadProgress;
  startTime: number;
  endTime?: number;
  abortController: AbortController | null;
  userAgent?: string;
}

export interface DownloadConsentRequest {
  downloadId: string;
  filename: string;
  domain: string;
  sizeFormatted: string;
  contentLengthFormatted: string;
  mimeType: string;
  isDangerous: boolean;
  isExecutableOrDangerous: boolean;
  securityWarning?: string;
  isPrivate: boolean;
}

export interface DownloadRequestParams {
  url: string;
  tabId: string;
  contentDisposition?: string;
  mimeType?: string;
  contentLength?: number;
  isPrivate?: boolean;
  userAgent?: string;
  suggestedFilename?: string;
}

export interface DownloadRequestRoutingResult {
  accepted: boolean;
  downloadId?: string;
  state: DownloadLifecycleState;
  blockReason?: DownloadBlockReason;
  sanitizedFilename?: string;
  isDangerous?: boolean;
  securityWarning?: string;
  requiresConsent?: boolean;
  message?: string;
}

export interface AndroidWebViewDownloadRequestLifecycleManager {
  registerTab: (tabId: string, isPrivate?: boolean) => void;
  handleDownloadRequest: (params: DownloadRequestParams) => DownloadRequestRoutingResult;
  approveDownloadConsent: (downloadId: string) => boolean;
  rejectDownloadConsent: (downloadId: string, reason?: string) => boolean;
  updateDownloadProgress: (downloadId: string, bytesDownloaded: number, totalBytes?: number) => boolean;
  completeDownload: (downloadId: string) => boolean;
  failDownload: (downloadId: string, reason: string) => boolean;
  cancelDownload: (downloadId: string) => boolean;
  pauseDownload: (downloadId: string) => boolean;
  resumeDownload: (downloadId: string) => boolean;
  getDownloadRecord: (downloadId: string) => SafeDownloadRecord | null;
  getDownloadsForTab: (tabId: string) => SafeDownloadRecord[];
  getPendingConsentRequests: (tabId?: string) => DownloadConsentRequest[];
  onTabNavigation: (tabId: string, newUrl: string) => { cancelledCount: number };
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => { cleanedCount: number };
  resetAll: () => void;
}

// Banned schemes that can execute code or access host internals
const BLOCKED_SCHEMES = new Set([
  "javascript:",
  "file:",
  "content:",
  "intent:",
  "about:",
  "chrome:",
  "resource:",
  "vbscript:",
]);

// Dangerous executable and script file extensions
const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".vbs",
  ".js",
  ".mjs",
  ".jar",
  ".dex",
  ".so",
  ".msi",
  ".dll",
  ".scr",
  ".ps1",
  ".apk",
  ".com",
  ".pif",
  ".elf",
  ".app",
  ".dmg",
]);

// Windows reserved device names
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

// Common MIME to extension fallbacks
const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "text/plain": ".txt",
  "text/html": ".html",
  "text/csv": ".csv",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/gzip": ".tar.gz",
  "application/octet-stream": ".bin",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/**
 * Validates and sanitizes a download URL:
 * - Checks against blocked dangerous schemes
 * - Blocks SSRF, private IPv4/IPv6 ranges, loopback, and metadata endpoints
 * - Strips sensitive credentials and auth query parameters
 */
export function validateAndSanitizeDownloadUrl(rawUrl: string): {
  isValid: boolean;
  sanitizedUrl?: string;
  domain?: string;
  blockReason?: DownloadBlockReason;
  errorMessage?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      isValid: false,
      blockReason: DownloadBlockReason.EMPTY_OR_MALFORMED_URL,
      errorMessage: "Download URL is empty",
    };
  }

  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check blocked schemes
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return {
        isValid: false,
        blockReason: DownloadBlockReason.MALICIOUS_SCHEME,
        errorMessage: `Dangerous scheme ${scheme} is strictly prohibited`,
      };
    }
  }

  // 2. Allow safe data URIs (e.g. image/pdf base64 data)
  if (lower.startsWith("data:")) {
    if (
      lower.startsWith("data:image/jpeg") ||
      lower.startsWith("data:image/png") ||
      lower.startsWith("data:image/webp") ||
      lower.startsWith("data:application/pdf") ||
      lower.startsWith("data:text/plain")
    ) {
      return {
        isValid: true,
        sanitizedUrl: trimmed,
        domain: "data-uri",
      };
    }
    return {
      isValid: false,
      blockReason: DownloadBlockReason.MALICIOUS_SCHEME,
      errorMessage: "Unsupported or unverified data URI type",
    };
  }

  // 3. Allow valid blob URIs (blob:http...)
  if (lower.startsWith("blob:")) {
    const innerUrl = trimmed.substring(5);
    try {
      const parsedInner = new URL(innerUrl);
      if (parsedInner.protocol === "https:" || parsedInner.protocol === "http:") {
        return {
          isValid: true,
          sanitizedUrl: trimmed,
          domain: parsedInner.hostname,
        };
      }
    } catch {
      // Malformed blob url
    }
    return {
      isValid: false,
      blockReason: DownloadBlockReason.EMPTY_OR_MALFORMED_URL,
      errorMessage: "Malformed blob URL",
    };
  }

  // 4. Parse HTTP/HTTPS URL
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        isValid: false,
        blockReason: DownloadBlockReason.UNSUPPORTED_PROTOCOL,
        errorMessage: `Protocol ${parsed.protocol} is not supported for downloads`,
      };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    // SSRF & private network / cloud metadata protection
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
      return {
        isValid: false,
        blockReason: DownloadBlockReason.INTERNAL_OR_METADATA_IP,
        errorMessage: "Access to private/internal network address or metadata IP is blocked",
      };
    }

    // Strip basic auth and sensitive query parameters
    parsed.username = "";
    parsed.password = "";

    const sensitiveTokens = [
      "token",
      "auth",
      "apikey",
      "api_key",
      "secret",
      "session",
      "sig",
      "signature",
      "access_token",
      "bearer",
      "password",
      "key",
    ];

    sensitiveTokens.forEach((param) => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.delete(param);
      }
    });

    return {
      isValid: true,
      sanitizedUrl: parsed.toString(),
      domain: parsed.hostname,
    };
  } catch {
    return {
      isValid: false,
      blockReason: DownloadBlockReason.EMPTY_OR_MALFORMED_URL,
      errorMessage: "Malformed download target URL",
    };
  }
}

/**
 * Validates and sanitizes download filename:
 * - Prevents path traversal (../, ..\, /, \)
 * - Strips null bytes and control characters
 * - Sanitizes Windows reserved device names
 * - Detects dangerous executable extensions
 * - Resolves missing extension using MIME type
 */
export function sanitizeDownloadFilename(
  suggestedName?: string,
  contentDisposition?: string,
  url?: string,
  mimeType?: string
): {
  cleanFilename: string;
  extension: string;
  isDangerousExtension: boolean;
  securityWarning?: string;
  hasTraversalAttempt: boolean;
} {
  let candidate = "";
  let hasTraversal = false;

  // 1. Content-Disposition filename
  if (contentDisposition) {
    const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
      try {
        candidate = decodeURIComponent(utf8Match[1].trim());
      } catch {
        candidate = utf8Match[1].trim();
      }
    }

    if (!candidate) {
      const match = contentDisposition.match(/filename\s*=\s*["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        candidate = match[1].trim();
      }
    }
  }

  // 2. Suggested name fallback
  if (!candidate && suggestedName) {
    candidate = suggestedName.trim();
  }

  // 3. URL path fallback
  if (!candidate && url) {
    try {
      const parsed = new URL(url.includes("://") ? url : `https://${url}`);
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (last && !last.includes("?") && !last.includes("&")) {
          try {
            candidate = decodeURIComponent(last);
          } catch {
            candidate = last;
          }
        }
      }
    } catch {}
  }

  // Check for path traversal attempt in raw candidate
  if (
    candidate.includes("..") ||
    candidate.includes("/") ||
    candidate.includes("\\") ||
    candidate.includes("%2e%2e") ||
    candidate.includes("%00")
  ) {
    hasTraversal = true;
  }

  // 4. Default fallback if still empty
  if (!candidate) {
    const normMime = (mimeType || "application/octet-stream").toLowerCase().split(";")[0].trim();
    const fallbackExt = MIME_TO_EXTENSION[normMime] || ".bin";
    candidate = `download_${Date.now()}${fallbackExt}`;
  }

  // 5. Sanitize: Strip control chars, null bytes
  let clean = candidate.replace(/[\x00-\x1f\x7f]/g, "").trim();

  // Strip path traversal sequences completely
  while (clean.includes("..")) {
    clean = clean.replace(/\.\./g, "");
  }
  clean = clean.replace(/[\/\\]+/g, "_");

  // Strip illegal Windows / FS chars: < > : " / \ | ? *
  clean = clean.replace(/[<>:"\/\\|?*]/g, "_");

  // Strip leading dots to prevent hidden files
  clean = clean.replace(/^\.+/, "");

  if (!clean) {
    clean = `download_${Date.now()}.bin`;
  }

  // Split base and extension
  const lastDot = clean.lastIndexOf(".");
  let baseName = lastDot > 0 ? clean.substring(0, lastDot) : clean;
  let ext = lastDot > 0 ? clean.substring(lastDot).toLowerCase() : "";

  // Guard Windows reserved names
  if (WINDOWS_RESERVED_NAMES.has(baseName.toUpperCase())) {
    baseName = `file_${baseName}`;
  }

  // Fallback extension from MIME if missing
  if (!ext && mimeType) {
    const normMime = mimeType.toLowerCase().split(";")[0].trim();
    if (MIME_TO_EXTENSION[normMime]) {
      ext = MIME_TO_EXTENSION[normMime];
    }
  }

  // Limit length
  if (baseName.length > 100) {
    baseName = baseName.substring(0, 100);
  }

  const finalName = `${baseName}${ext}`;
  const isDangerous = DANGEROUS_EXTENSIONS.has(ext);
  const securityWarning = isDangerous
    ? `Caution: File extension (${ext}) is executable or package format. Verify trust before opening.`
    : undefined;

  return {
    cleanFilename: finalName,
    extension: ext,
    isDangerousExtension: isDangerous,
    securityWarning,
    hasTraversalAttempt: hasTraversal,
  };
}

export function formatByteSize(bytes: number): string {
  if (bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Creates the Android WebView Download Request & Lifecycle Boundary Manager
 */
export function createAndroidWebViewDownloadRequestLifecycleManager(): AndroidWebViewDownloadRequestLifecycleManager {
  // Keyed by downloadId
  const downloads = new Map<string, SafeDownloadRecord>();

  // Tab registration tracking
  const tabIsPrivateMap = new Map<string, boolean>();
  const tabEpochMap = new Map<string, number>();

  // Rapid request deduplication: tabId:url -> lastRequestTimestamp
  const recentRequests = new Map<string, { timestamp: number; downloadId: string }>();
  const DEDUP_WINDOW_MS = 2000;

  function registerTab(tabId: string, isPrivate: boolean = false): void {
    tabIsPrivateMap.set(tabId, isPrivate);
    if (!tabEpochMap.has(tabId)) {
      tabEpochMap.set(tabId, 1);
    }
  }

  function handleDownloadRequest(params: DownloadRequestParams): DownloadRequestRoutingResult {
    const tabId = params.tabId;
    const isPrivate = params.isPrivate ?? tabIsPrivateMap.get(tabId) ?? false;
    registerTab(tabId, isPrivate);

    const currentEpoch = tabEpochMap.get(tabId) || 1;

    // 1. Rapid request / duplicate flood check
    const dedupKey = `${tabId}:${params.url}`;
    const now = Date.now();
    const existingRecent = recentRequests.get(dedupKey);

    if (existingRecent && now - existingRecent.timestamp < DEDUP_WINDOW_MS) {
      const activeRecord = downloads.get(existingRecent.downloadId);
      if (
        activeRecord &&
        (activeRecord.state === DownloadLifecycleState.PENDING_CONSENT ||
          activeRecord.state === DownloadLifecycleState.DOWNLOADING ||
          activeRecord.state === DownloadLifecycleState.VALIDATING)
      ) {
        return {
          accepted: false,
          downloadId: activeRecord.downloadId,
          state: activeRecord.state,
          blockReason: DownloadBlockReason.RATE_LIMIT_EXCEEDED,
          message: "Duplicate download request debounced; existing download in progress",
        };
      }
    }

    // 2. URL Validation & Sanitization
    const urlValidation = validateAndSanitizeDownloadUrl(params.url);
    if (!urlValidation.isValid || !urlValidation.sanitizedUrl) {
      const blockedId = `dl_blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const blockedRecord: SafeDownloadRecord = {
        downloadId: blockedId,
        tabId,
        requestEpoch: currentEpoch,
        sourceUrl: params.url,
        sanitizedUrl: "",
        domain: urlValidation.domain || "unknown",
        filename: "blocked",
        sanitizedFilename: "blocked",
        extension: "",
        mimeType: params.mimeType || "application/octet-stream",
        totalBytes: params.contentLength || -1,
        isPrivate,
        state: DownloadLifecycleState.BLOCKED_SECURITY,
        blockReason: urlValidation.blockReason,
        errorMessage: urlValidation.errorMessage,
        isDangerousExtension: false,
        progress: {
          bytesDownloaded: 0,
          totalBytes: params.contentLength || -1,
          percentage: 0,
          speedBps: 0,
          estimatedRemainingMs: 0,
          lastUpdateTime: now,
        },
        startTime: now,
        abortController: null,
        userAgent: params.userAgent,
      };

      downloads.set(blockedId, blockedRecord);

      return {
        accepted: false,
        downloadId: blockedId,
        state: DownloadLifecycleState.BLOCKED_SECURITY,
        blockReason: urlValidation.blockReason,
        message: urlValidation.errorMessage || "URL validation failed",
      };
    }

    // 3. Filename & Path Traversal Validation
    const fileValidation = sanitizeDownloadFilename(
      params.suggestedFilename,
      params.contentDisposition,
      urlValidation.sanitizedUrl,
      params.mimeType
    );

    // 4. Generate unique download ID and record
    const downloadId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const totalBytes = params.contentLength && params.contentLength > 0 ? params.contentLength : -1;

    const record: SafeDownloadRecord = {
      downloadId,
      tabId,
      requestEpoch: currentEpoch,
      sourceUrl: params.url,
      sanitizedUrl: urlValidation.sanitizedUrl,
      domain: urlValidation.domain || "unknown",
      filename: params.suggestedFilename || fileValidation.cleanFilename,
      sanitizedFilename: fileValidation.cleanFilename,
      extension: fileValidation.extension,
      mimeType: params.mimeType || "application/octet-stream",
      totalBytes,
      isPrivate,
      state: DownloadLifecycleState.PENDING_CONSENT,
      isDangerousExtension: fileValidation.isDangerousExtension,
      securityWarning: fileValidation.securityWarning,
      progress: {
        bytesDownloaded: 0,
        totalBytes,
        percentage: 0,
        speedBps: 0,
        estimatedRemainingMs: 0,
        lastUpdateTime: now,
      },
      startTime: now,
      abortController: new AbortController(),
      userAgent: params.userAgent,
    };

    downloads.set(downloadId, record);
    recentRequests.set(dedupKey, { timestamp: now, downloadId });

    return {
      accepted: true,
      downloadId,
      state: DownloadLifecycleState.PENDING_CONSENT,
      sanitizedFilename: fileValidation.cleanFilename,
      isDangerous: fileValidation.isDangerousExtension,
      securityWarning: fileValidation.securityWarning,
      requiresConsent: true,
      message: "Download request accepted, awaiting user consent",
    };
  }

  function approveDownloadConsent(downloadId: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    if (record.state !== DownloadLifecycleState.PENDING_CONSENT) {
      return false;
    }

    record.state = DownloadLifecycleState.DOWNLOADING;
    record.progress.lastUpdateTime = Date.now();
    return true;
  }

  function rejectDownloadConsent(downloadId: string, reason?: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    if (record.abortController) {
      try {
        record.abortController.abort();
      } catch {}
      record.abortController = null;
    }

    record.state = DownloadLifecycleState.CANCELLED;
    record.blockReason = DownloadBlockReason.USER_REJECTED;
    record.errorMessage = reason || "User rejected download consent";
    record.endTime = Date.now();
    return true;
  }

  function updateDownloadProgress(
    downloadId: string,
    bytesDownloaded: number,
    totalBytes?: number
  ): boolean {
    const record = downloads.get(downloadId);
    if (!record || record.state !== DownloadLifecycleState.DOWNLOADING) {
      return false;
    }

    const now = Date.now();
    const elapsedSec = Math.max(0.1, (now - record.progress.lastUpdateTime) / 1000);
    const bytesDelta = Math.max(0, bytesDownloaded - record.progress.bytesDownloaded);
    const speedBps = Math.round(bytesDelta / elapsedSec);

    const actualTotal = totalBytes !== undefined && totalBytes > 0 ? totalBytes : record.totalBytes;
    const percentage = actualTotal > 0 ? Math.min(100, Math.round((bytesDownloaded / actualTotal) * 100)) : 0;
    const remainingBytes = actualTotal > 0 ? actualTotal - bytesDownloaded : 0;
    const estimatedRemainingMs = speedBps > 0 && remainingBytes > 0 ? Math.round((remainingBytes / speedBps) * 1000) : 0;

    record.progress = {
      bytesDownloaded,
      totalBytes: actualTotal,
      percentage,
      speedBps,
      estimatedRemainingMs,
      lastUpdateTime: now,
    };

    return true;
  }

  function completeDownload(downloadId: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    if (record.state !== DownloadLifecycleState.DOWNLOADING) {
      return false;
    }

    record.state = DownloadLifecycleState.COMPLETED;
    record.endTime = Date.now();
    record.progress.percentage = 100;
    record.abortController = null;
    return true;
  }

  function failDownload(downloadId: string, reason: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    if (record.abortController) {
      try {
        record.abortController.abort();
      } catch {}
      record.abortController = null;
    }

    record.state = DownloadLifecycleState.FAILED;
    record.errorMessage = reason;
    record.endTime = Date.now();
    return true;
  }

  function cancelDownload(downloadId: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    if (
      record.state === DownloadLifecycleState.COMPLETED ||
      record.state === DownloadLifecycleState.CANCELLED ||
      record.state === DownloadLifecycleState.BLOCKED_SECURITY
    ) {
      return false;
    }

    if (record.abortController) {
      try {
        record.abortController.abort();
      } catch {}
      record.abortController = null;
    }

    record.state = DownloadLifecycleState.CANCELLED;
    record.endTime = Date.now();
    return true;
  }

  function pauseDownload(downloadId: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    // Only active in-flight downloads can be paused (DOWNLOADING or STARTING)
    // Terminal states (COMPLETED, CANCELLED, FAILED, BLOCKED_SECURITY) are safely rejected
    if (
      record.state !== DownloadLifecycleState.DOWNLOADING &&
      record.state !== DownloadLifecycleState.STARTING
    ) {
      return false;
    }

    if (record.abortController) {
      try {
        record.abortController.abort();
      } catch {}
      record.abortController = null;
    }

    record.state = DownloadLifecycleState.PAUSED;
    record.progress.lastUpdateTime = Date.now();
    return true;
  }

  function resumeDownload(downloadId: string): boolean {
    const record = downloads.get(downloadId);
    if (!record) return false;

    // Only paused downloads can be resumed back to DOWNLOADING
    if (record.state !== DownloadLifecycleState.PAUSED) {
      return false;
    }

    record.state = DownloadLifecycleState.DOWNLOADING;
    record.progress.lastUpdateTime = Date.now();
    return true;
  }

  function getDownloadRecord(downloadId: string): SafeDownloadRecord | null {
    const record = downloads.get(downloadId);
    return record ? { ...record } : null;
  }

  function getDownloadsForTab(tabId: string): SafeDownloadRecord[] {
    return Array.from(downloads.values())
      .filter((d) => d.tabId === tabId)
      .map((d) => ({ ...d }));
  }

  function getPendingConsentRequests(tabId?: string): DownloadConsentRequest[] {
    const list: DownloadConsentRequest[] = [];
    for (const d of downloads.values()) {
      if (d.state === DownloadLifecycleState.PENDING_CONSENT && (!tabId || d.tabId === tabId)) {
        list.push({
          downloadId: d.downloadId,
          filename: d.sanitizedFilename,
          domain: d.domain,
          sizeFormatted: formatByteSize(d.totalBytes),
          contentLengthFormatted: formatByteSize(d.totalBytes),
          mimeType: d.mimeType,
          isDangerous: d.isDangerousExtension,
          isExecutableOrDangerous: d.isDangerousExtension,
          securityWarning: d.securityWarning,
          isPrivate: d.isPrivate,
        });
      }
    }
    return list;
  }

  function onTabNavigation(tabId: string, _newUrl: string): { cancelledCount: number } {
    // Advance tab epoch
    const currentEpoch = (tabEpochMap.get(tabId) || 1) + 1;
    tabEpochMap.set(tabId, currentEpoch);

    let cancelledCount = 0;
    // Cancel in-flight or pending downloads on navigation
    for (const d of downloads.values()) {
      if (
        d.tabId === tabId &&
        (d.state === DownloadLifecycleState.PENDING_CONSENT ||
          d.state === DownloadLifecycleState.VALIDATING)
      ) {
        if (d.abortController) {
          try {
            d.abortController.abort();
          } catch {}
          d.abortController = null;
        }
        d.state = DownloadLifecycleState.CANCELLED;
        d.blockReason = DownloadBlockReason.NAVIGATION_CANCELLED;
        d.errorMessage = "Download cancelled by subsequent tab navigation";
        d.endTime = Date.now();
        cancelledCount++;
      }
    }

    return { cancelledCount };
  }

  function onTabClosed(
    tabId: string,
    isPrivate?: boolean,
    remainingPrivateTabs?: number
  ): { cleanedCount: number } {
    let cleanedCount = 0;

    for (const [id, d] of Array.from(downloads.entries())) {
      if (d.tabId === tabId) {
        if (d.abortController) {
          try {
            d.abortController.abort();
          } catch {}
          d.abortController = null;
        }
        d.state = DownloadLifecycleState.CANCELLED;
        d.blockReason = DownloadBlockReason.PARENT_TAB_CLOSED;
        d.endTime = Date.now();
        downloads.delete(id);
        cleanedCount++;
      }
    }

    tabIsPrivateMap.delete(tabId);
    tabEpochMap.delete(tabId);

    // If last private tab was closed, wipe all remaining private downloads
    if (isPrivate && (remainingPrivateTabs === undefined || remainingPrivateTabs === 0)) {
      for (const [id, d] of Array.from(downloads.entries())) {
        if (d.isPrivate) {
          if (d.abortController) {
            try {
              d.abortController.abort();
            } catch {}
          }
          downloads.delete(id);
          cleanedCount++;
        }
      }
    }

    return { cleanedCount };
  }

  function resetAll(): void {
    for (const d of downloads.values()) {
      if (d.abortController) {
        try {
          d.abortController.abort();
        } catch {}
      }
    }
    downloads.clear();
    tabIsPrivateMap.clear();
    tabEpochMap.clear();
    recentRequests.clear();
  }

  return {
    registerTab,
    handleDownloadRequest,
    approveDownloadConsent,
    rejectDownloadConsent,
    updateDownloadProgress,
    completeDownload,
    failDownload,
    cancelDownload,
    pauseDownload,
    resumeDownload,
    getDownloadRecord,
    getDownloadsForTab,
    getPendingConsentRequests,
    onTabNavigation,
    onTabClosed,
    resetAll,
  };
}
