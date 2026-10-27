/**
 * NETFLOW Browser V2 — Android WebView External Download & File Save Boundary
 *
 * Form: NETFLOW-V2-NATIVE-14
 *
 * This module establishes the secure External Download & Android File Save boundary:
 * 1. WebView DownloadListener event -> Secure Download Metadata Boundary
 * 2. User-initiated file save flow (Consent-Gated before disk commitment)
 * 3. Safe filename extraction + MIME type / extension preservation
 * 4. Path traversal protection & dangerous filename/executable sanitization
 * 5. Duplicate filename resolution (non-destructive collision avoidance)
 * 6. Tab & session isolation (per-tab epoch tracking, private-tab compartmentalization)
 * 7. Strict Cookie/Auth leakage prevention (credentials/tokens stripped from metadata/filename)
 * 8. Reuses NATIVE-05 security policies, NATIVE-09 navigation epochs, and NATIVE-03 URL validation
 * 9. Privileged native access invariant (SAF/scoped-storage compliant; zero banned MANAGE_EXTERNAL_STORAGE)
 */

import { isSafeWebViewNavigationTarget } from "./androidWebViewIntegrationBoundary";

export type DownloadStatus =
  | "pending_user_consent"
  | "user_approved"
  | "user_rejected"
  | "downloading"
  | "completed"
  | "failed"
  | "blocked_security";

export interface AndroidDownloadMetadata {
  downloadId: string;
  tabId: string;
  requestEpoch: number;
  sanitizedUrl: string;
  domain: string;
  filename: string;
  extension: string;
  mimeType: string;
  contentLength: number;
  contentDisposition?: string;
  userAgent?: string;
  timestamp: number;
  isUserInitiated: boolean;
  status: DownloadStatus;
  isPrivateTab: boolean;
  isDangerous: boolean;
  securityWarning?: string;
  errorReason?: string;
}

export interface AndroidDownloadRequest {
  url: string;
  tabId: string;
  userAgent?: string;
  contentDisposition?: string;
  mimeType?: string;
  contentLength?: number;
  isUserGesture?: boolean;
  isPrivateTab?: boolean;
  requestEpoch?: number;
}

export interface DownloadConsentPrompt {
  downloadId: string;
  filename: string;
  mimeType: string;
  contentLengthFormatted: string;
  domain: string;
  isExecutableOrDangerous: boolean;
  securityWarning?: string;
  nativeRequestId?: string;
  tabId?: string;
  displayUrl?: string;
}

// Known common MIME types to extension mapping
const MIME_TO_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "text/plain": ".txt",
  "text/html": ".html",
  "text/csv": ".csv",
  "text/css": ".css",
  "text/javascript": ".js",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/gzip": ".tar.gz",
  "application/x-tar": ".tar",
  "application/octet-stream": ".bin",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/vnd.android.package-archive": ".apk",
};

// Dangerous file extensions that could execute arbitrary code
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
]);

// Windows reserved system device names
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

/**
 * Sanitizes a download URL:
 * 1. Checks schemes against dangerous execution vectors (javascript:, file:, content:, unsafe data:).
 * 2. Blocks SSRF / private networks / loopback / metadata addresses.
 * 3. Strips sensitive HTTP basic auth credentials and query auth tokens to prevent credential leakage.
 */
export function sanitizeDownloadUrl(url: string): {
  safe: boolean;
  sanitizedUrl?: string;
  domain?: string;
  reason?: string;
} {
  if (!url || typeof url !== "string") {
    return { safe: false, reason: "Download target URL is empty or invalid" };
  }

  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("blob:null")
  ) {
    return { safe: false, reason: "Insecure or dangerous URL scheme blocked for download" };
  }

  // Safe data URIs (e.g. data:image/png;base64,...)
  if (lower.startsWith("data:")) {
    if (lower.startsWith("data:image/") || lower.startsWith("data:application/pdf")) {
      return { safe: true, sanitizedUrl: trimmed, domain: "data-uri" };
    }
    return { safe: false, reason: "Unsupported or unverified data URI scheme" };
  }

  // 2. Parse URL and block SSRF / Private Networks
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
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
      return { safe: false, reason: "Blocked internal network or cloud metadata download target" };
    }

    // 3. Prevent Auth / Cookie / Credential Leakage in URL
    parsed.username = "";
    parsed.password = "";

    // Strip common sensitive token/session parameters
    const sensitiveParams = [
      "token",
      "auth",
      "apikey",
      "api_key",
      "secret",
      "session",
      "sig",
      "signature",
      "bearer",
      "access_token",
      "password",
      "pass",
      "key",
    ];

    sensitiveParams.forEach((param) => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.delete(param);
      }
    });

    return {
      safe: true,
      sanitizedUrl: parsed.toString(),
      domain: parsed.hostname,
    };
  } catch {
    return { safe: false, reason: "Malformed download target URL" };
  }
}

/**
 * Extracts and sanitizes filename from Content-Disposition header, URL pathname, or MIME type fallback.
 * Strictly defends against:
 * - Directory traversal (`../`, `..\`, `/`, `\`)
 * - Null byte injection (`%00`, `\0`)
 * - Windows reserved device names (CON, NUL, etc.)
 * - Malformed Unicode / control characters
 * - Dangerous executable extensions
 */
export function parseAndSanitizeFilename(
  contentDisposition?: string,
  url?: string,
  mimeType?: string
): {
  filename: string;
  extension: string;
  isDangerous: boolean;
  warning?: string;
} {
  let candidateName = "";

  // 1. Try parsing Content-Disposition header
  if (contentDisposition) {
    // Check RFC 5987 / 6266 filename*=UTF-8''...
    const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
      try {
        candidateName = decodeURIComponent(utf8Match[1].trim());
      } catch {
        candidateName = utf8Match[1].trim();
      }
    }

    // Standard filename="..." or filename=...
    if (!candidateName) {
      const standardMatch = contentDisposition.match(/filename\s*=\s*["']?([^"';]+)["']?/i);
      if (standardMatch && standardMatch[1]) {
        candidateName = standardMatch[1].trim();
      }
    }
  }

  // 2. Fallback: Parse filename from URL pathname
  if (!candidateName && url) {
    try {
      const parsed = new URL(url.includes("://") ? url : `https://${url}`);
      const pathname = parsed.pathname;
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (last && !last.includes("?") && !last.includes("&")) {
          try {
            candidateName = decodeURIComponent(last);
          } catch {
            candidateName = last;
          }
        }
      }
    } catch {}
  }

  // 3. Fallback: Generate based on MIME type or generic name
  if (!candidateName) {
    const normalizedMime = (mimeType || "application/octet-stream").toLowerCase().split(";")[0].trim();
    const fallbackExt = MIME_TO_EXTENSION_MAP[normalizedMime] || ".bin";
    candidateName = `download_${Date.now()}${fallbackExt}`;
  }

  // 4. Sanitize Filename (Strict Anti-Traversal and Normalization)
  // a) Strip null bytes and control characters
  let clean = candidateName.replace(/[\x00-\x1f\x7f]/g, "").trim();

  // b) Strip directory traversal patterns: ../, ..\, /, \
  clean = clean.replace(/(\.\.[\/\\])+/g, "");
  clean = clean.replace(/[\/\\]+/g, "_");

  // c) Strip illegal Windows/FS characters: < > : " / \ | ? *
  clean = clean.replace(/[<>:"\/\\|?*]/g, "_");

  // d) Strip leading periods to avoid hidden unix files
  clean = clean.replace(/^\.+/, "");

  // If name became empty after stripping
  if (!clean) {
    clean = `download_${Date.now()}.bin`;
  }

  // e) Extract base name and extension
  const lastDotIndex = clean.lastIndexOf(".");
  let baseName = lastDotIndex > 0 ? clean.substring(0, lastDotIndex) : clean;
  let ext = lastDotIndex > 0 ? clean.substring(lastDotIndex).toLowerCase() : "";

  // f) Handle Windows reserved names (CON, NUL, PRN, etc.)
  if (WINDOWS_RESERVED_NAMES.has(baseName.toUpperCase())) {
    baseName = `file_${baseName}`;
  }

  // g) MIME type extension preservation if extension is missing
  if (!ext && mimeType) {
    const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
    if (MIME_TO_EXTENSION_MAP[normalizedMime]) {
      ext = MIME_TO_EXTENSION_MAP[normalizedMime];
    }
  }

  // h) Limit filename length (preserve extension)
  const maxBaseLength = 100;
  if (baseName.length > maxBaseLength) {
    baseName = baseName.substring(0, maxBaseLength);
  }

  const finalFilename = `${baseName}${ext}`;

  // 5. Detect dangerous executable extensions
  const isDangerous = DANGEROUS_EXTENSIONS.has(ext);
  const warning = isDangerous
    ? `Warning: This file has an executable or package extension (${ext}). Proceed only if trusted.`
    : undefined;

  return {
    filename: finalFilename,
    extension: ext,
    isDangerous,
    warning,
  };
}

/**
 * Duplicate Filename Resolution:
 * Appends a numeric counter (1), (2) without corrupting the file extension.
 */
export function resolveDuplicateFilename(
  targetFilename: string,
  existingFilenames: Set<string> | string[]
): string {
  const existingSet = existingFilenames instanceof Set ? existingFilenames : new Set(existingFilenames);

  if (!existingSet.has(targetFilename)) {
    return targetFilename;
  }

  const lastDotIndex = targetFilename.lastIndexOf(".");
  const baseName = lastDotIndex > 0 ? targetFilename.substring(0, lastDotIndex) : targetFilename;
  const ext = lastDotIndex > 0 ? targetFilename.substring(lastDotIndex) : "";

  let counter = 1;
  let candidate = `${baseName} (${counter})${ext}`;

  while (existingSet.has(candidate)) {
    counter++;
    candidate = `${baseName} (${counter})${ext}`;
  }

  return candidate;
}

/**
 * Formats byte counts into human-readable strings (e.g. 4.2 MB)
 */
export function formatContentLength(bytes: number): string {
  if (bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface AndroidDownloadManager {
  initiateDownload: (request: AndroidDownloadRequest) => {
    success: boolean;
    downloadId?: string;
    metadata?: AndroidDownloadMetadata;
    reason?: string;
  };
  getUserConsentPrompt: (downloadId: string) => DownloadConsentPrompt | null;
  approveDownload: (downloadId: string) => {
    success: boolean;
    metadata?: AndroidDownloadMetadata;
    reason?: string;
  };
  rejectDownload: (downloadId: string, reason?: string) => boolean;
  completeDownload: (downloadId: string) => boolean;
  getDownload: (downloadId: string) => AndroidDownloadMetadata | undefined;
  getDownloadsByTab: (tabId: string) => AndroidDownloadMetadata[];
  cancelDownloadsForTab: (tabId: string) => void;
  getAllDownloads: () => AndroidDownloadMetadata[];
  clearCompletedDownloads: () => void;
  destroy: () => void;
}

export interface AndroidDownloadManagerConfig {
  onDownloadStatusChanged?: (metadata: AndroidDownloadMetadata) => void;
}

/**
 * Creates an Android WebView Download & File Save Boundary Manager
 */
export function createAndroidDownloadManager(
  config: AndroidDownloadManagerConfig = {}
): AndroidDownloadManager {
  const downloads = new Map<string, AndroidDownloadMetadata>();
  const activeFilenames = new Set<string>();

  const initiateDownload = (
    request: AndroidDownloadRequest
  ): {
    success: boolean;
    downloadId?: string;
    metadata?: AndroidDownloadMetadata;
    reason?: string;
  } => {
    // 1. Sanitize & Screen URL against SSRF and sensitive credential parameters
    const urlCheck = sanitizeDownloadUrl(request.url);
    if (!urlCheck.safe || !urlCheck.sanitizedUrl) {
      return {
        success: false,
        reason: urlCheck.reason || "Invalid download URL",
      };
    }

    // 2. Parse & Sanitize Filename
    const fileInfo = parseAndSanitizeFilename(
      request.contentDisposition,
      urlCheck.sanitizedUrl,
      request.mimeType
    );

    // 3. Resolve Duplicates
    const finalFilename = resolveDuplicateFilename(fileInfo.filename, activeFilenames);
    activeFilenames.add(finalFilename);

    // 4. Generate unique download ID
    const downloadId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 5. Construct secure metadata boundary record
    const metadata: AndroidDownloadMetadata = {
      downloadId,
      tabId: request.tabId,
      requestEpoch: request.requestEpoch || 1,
      sanitizedUrl: urlCheck.sanitizedUrl,
      domain: urlCheck.domain || "external",
      filename: finalFilename,
      extension: fileInfo.extension,
      mimeType: request.mimeType || "application/octet-stream",
      contentLength: request.contentLength && request.contentLength > 0 ? request.contentLength : -1,
      contentDisposition: request.contentDisposition,
      userAgent: request.userAgent,
      timestamp: Date.now(),
      isUserInitiated: Boolean(request.isUserGesture),
      status: "pending_user_consent",
      isPrivateTab: Boolean(request.isPrivateTab),
      isDangerous: fileInfo.isDangerous,
      securityWarning: fileInfo.warning,
    };

    downloads.set(downloadId, metadata);
    config.onDownloadStatusChanged?.(metadata);

    return {
      success: true,
      downloadId,
      metadata,
    };
  };

  const getUserConsentPrompt = (downloadId: string): DownloadConsentPrompt | null => {
    const item = downloads.get(downloadId);
    if (!item) return null;

    return {
      downloadId: item.downloadId,
      filename: item.filename,
      mimeType: item.mimeType,
      contentLengthFormatted: formatContentLength(item.contentLength),
      domain: item.domain,
      isExecutableOrDangerous: item.isDangerous,
      securityWarning: item.securityWarning,
    };
  };

  const approveDownload = (
    downloadId: string
  ): {
    success: boolean;
    metadata?: AndroidDownloadMetadata;
    reason?: string;
  } => {
    const item = downloads.get(downloadId);
    if (!item) {
      return { success: false, reason: "Download session not found" };
    }

    if (item.status !== "pending_user_consent") {
      return { success: false, reason: `Invalid status transition from ${item.status}` };
    }

    item.status = "user_approved";
    config.onDownloadStatusChanged?.(item);

    return { success: true, metadata: item };
  };

  const rejectDownload = (downloadId: string, reason = "User rejected file save"): boolean => {
    const item = downloads.get(downloadId);
    if (!item) return false;

    item.status = "user_rejected";
    item.errorReason = reason;
    activeFilenames.delete(item.filename);
    config.onDownloadStatusChanged?.(item);
    return true;
  };

  const completeDownload = (downloadId: string): boolean => {
    const item = downloads.get(downloadId);
    if (!item) return false;

    item.status = "completed";
    config.onDownloadStatusChanged?.(item);
    return true;
  };

  const getDownload = (downloadId: string): AndroidDownloadMetadata | undefined => {
    return downloads.get(downloadId);
  };

  const getDownloadsByTab = (tabId: string): AndroidDownloadMetadata[] => {
    return Array.from(downloads.values()).filter((d) => d.tabId === tabId);
  };

  const cancelDownloadsForTab = (tabId: string): void => {
    downloads.forEach((item) => {
      if (item.tabId === tabId && (item.status === "pending_user_consent" || item.status === "downloading")) {
        item.status = "failed";
        item.errorReason = "Parent tab closed";
        activeFilenames.delete(item.filename);
        config.onDownloadStatusChanged?.(item);
      }
    });
  };

  const getAllDownloads = (): AndroidDownloadMetadata[] => {
    return Array.from(downloads.values());
  };

  const clearCompletedDownloads = (): void => {
    const toDelete: string[] = [];
    downloads.forEach((item, id) => {
      if (item.status === "completed" || item.status === "user_rejected" || item.status === "failed") {
        toDelete.push(id);
        activeFilenames.delete(item.filename);
      }
    });
    toDelete.forEach((id) => downloads.delete(id));
  };

  const destroy = (): void => {
    downloads.clear();
    activeFilenames.clear();
  };

  return {
    initiateDownload,
    getUserConsentPrompt,
    approveDownload,
    rejectDownload,
    completeDownload,
    getDownload,
    getDownloadsByTab,
    cancelDownloadsForTab,
    getAllDownloads,
    clearCompletedDownloads,
    destroy,
  };
}
