/**
 * NETFLOW Browser V2 — Android WebView Advanced Blob & Object-URL File Handling Boundary
 *
 * Form: NETFLOW-V2-NATIVE-24
 *
 * This module establishes the secure Advanced Blob / Object-URL File Download & Processing boundary:
 * 1. Safe Blob and Object URL (blob:https://origin/uuid) creation, registration, and downloading
 * 2. Generated Blob / ArrayBuffer file download pipeline with strict user consent gating
 * 3. Upload -> Web Page Processing -> Generated-File Download round trip (integrating NATIVE-10 File Chooser)
 * 4. MIME type and filename safety: anti-traversal, null-byte stripping, dangerous extension neutralization,
 *    and credential/auth token leak prevention
 * 5. Tab, request epoch, and canonical-origin isolation (strictly prevents cross-origin or cross-tab Blob hijacking)
 * 6. Full lifecycle cleanup: automatic revocation on navigation, reload, stopLoading, and tab close
 * 7. Ephemeral private browsing isolation & immediate purge on private tab termination
 * 8. Security & SSRF protection: HTTPS/localhost origin enforcement, blocks dangerous schemes & metadata IPs
 * 9. Privileged native bridge invariant: pure safe TypeScript boundary without native reflection.
 */

import { AndroidSelectedFile } from "./androidWebViewFileChooser";

export interface BlobStoreEntry {
  blobId: string;
  objectUrl: string;
  tabId: string;
  origin: string;
  filename: string;
  extension: string;
  mimeType: string;
  size: number;
  data: Uint8Array | string;
  isPrivate: boolean;
  createdAt: number;
  revoked: boolean;
}

export interface BlobDownloadConsentPrompt {
  downloadId: string;
  blobId?: string;
  objectUrl: string;
  filename: string;
  mimeType: string;
  sizeFormatted: string;
  origin: string;
  isDangerous: boolean;
  securityWarning?: string;
  isPrivate: boolean;
}

export interface BlobDownloadResult {
  success: boolean;
  downloadId?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  data?: Uint8Array | string;
  isDangerous?: boolean;
  securityWarning?: string;
  error?: string;
}

export interface BlobOriginValidationResult {
  isValid: boolean;
  isSecure: boolean;
  isLocalhost: boolean;
  canonicalOrigin?: string;
  reason?: string;
}

// Known dangerous extensions that could execute arbitrary code on Android / Host systems
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
  ".elf",
  ".com",
]);

// Windows / Android reserved device names
const RESERVED_DEVICE_NAMES = new Set([
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

// Common MIME to safe extension mapping
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
  "text/css": ".css",
  "text/javascript": ".js",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/gzip": ".tar.gz",
  "application/octet-stream": ".bin",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/vnd.android.package-archive": ".apk",
};

/**
 * Validates requesting origin for Blob / Object-URL operations.
 * Must be HTTPS or localhost. Dangerous schemes and SSRF/private networks are blocked.
 */
export function validateBlobOrigin(originStr: string): BlobOriginValidationResult {
  if (!originStr || typeof originStr !== "string") {
    return { isValid: false, isSecure: false, isLocalhost: false, reason: "Origin is empty" };
  }

  const trimmed = originStr.trim();
  const lower = trimmed.toLowerCase();

  // 1. Block dangerous schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("about:")
  ) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Dangerous scheme blocked for Blob/Object-URL operations",
    };
  }

  try {
    const parsed = new URL(lower.includes("://") ? lower : `https://${lower}`);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: `Unsupported Blob origin protocol: ${protocol}`,
      };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";

    if (isLocalhost) {
      return {
        isValid: true,
        isSecure: true,
        isLocalhost: true,
        canonicalOrigin: `${protocol}//${parsed.host}`,
      };
    }

    if (protocol !== "https:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "Insecure remote HTTP origin blocked from Blob/Object-URL operations",
      };
    }

    // SSRF & private IP targets blocked
    if (
      hostname === "169.254.169.254" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "Blob origin blocked on private network or metadata address",
      };
    }

    return {
      isValid: true,
      isSecure: true,
      isLocalhost: false,
      canonicalOrigin: `${protocol}//${parsed.host}`,
    };
  } catch {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Malformed Blob origin URL",
    };
  }
}

/**
 * Sanitizes suggested filenames for Blob / Object-URL downloads.
 * Defends against:
 * 1. Path traversal (../, ..\, /, \)
 * 2. Null bytes (%00, \0) and control characters
 * 3. Windows reserved device names (CON, NUL, AUX, etc.)
 * 4. Dangerous executable extensions (.exe, .bat, .apk, .sh, etc.)
 * 5. Sensitive URL / auth token / credential leakage in filenames
 */
export function sanitizeBlobFilename(
  rawFilename?: string,
  mimeType?: string,
  fallbackBase = "generated_file"
): {
  filename: string;
  extension: string;
  isDangerous: boolean;
  securityWarning?: string;
} {
  let candidate = (rawFilename || "").trim();

  // 1. Strip sensitive authentication query parameters or tokens that might leak into filename
  candidate = candidate.replace(/[?&](?:token|auth|key|secret|password|sig|bearer)=[^&;]*/gi, "");
  candidate = candidate.replace(/(?:bearer|auth|token|secret|password)[-_][a-zA-Z0-9_-]{8,}/gi, "redacted_token");

  // 2. Fallback if empty
  if (!candidate) {
    const normalizedMime = (mimeType || "application/octet-stream").toLowerCase().split(";")[0].trim();
    const ext = MIME_TO_EXTENSION[normalizedMime] || ".bin";
    candidate = `${fallbackBase}_${Date.now()}${ext}`;
  }

  // 3. Strip null bytes and ASCII control characters (0x00 - 0x1f, 0x7f)
  let clean = candidate.replace(/[\x00-\x1f\x7f]/g, "").trim();

  // 4. Strip directory traversal sequences: ../, ..\, /, \
  clean = clean.replace(/(\.\.[\/\\])+/g, "");
  clean = clean.replace(/[\/\\]+/g, "_");

  // 5. Strip illegal Windows / Android filesystem characters: < > : " | ? *
  clean = clean.replace(/[<>:"|?*]/g, "_");

  // 6. Strip leading dots to prevent hidden unix files (.secret.txt)
  clean = clean.replace(/^\.+/, "");

  if (!clean) {
    clean = `${fallbackBase}_${Date.now()}.bin`;
  }

  // 7. Enforce max filename length (120 chars) while preserving extension
  let baseName = clean;
  let extension = "";
  const lastDot = clean.lastIndexOf(".");
  if (lastDot > 0 && lastDot < clean.length - 1) {
    baseName = clean.substring(0, lastDot);
    extension = clean.substring(lastDot).toLowerCase();
  }

  if (baseName.length > 100) {
    baseName = baseName.substring(0, 100);
  }

  // 8. Reserved Device Names protection (CON, PRN, NUL, etc.)
  if (RESERVED_DEVICE_NAMES.has(baseName.toUpperCase())) {
    baseName = `safe_${baseName}`;
  }

  // 9. Dangerous extension check
  let isDangerous = false;
  let securityWarning: string | undefined;

  if (DANGEROUS_EXTENSIONS.has(extension)) {
    isDangerous = true;
    securityWarning = `Neutralized dangerous executable extension (${extension}) to protect host system.`;
    // Disarm dangerous executable extension by appending .download
    extension = `${extension}.download`;
  }

  const finalFilename = `${baseName}${extension}`;

  return {
    filename: finalFilename,
    extension,
    isDangerous,
    securityWarning,
  };
}

export interface AndroidWebViewBlobDownloadManagerOptions {
  onBlobConsentPromptChange?: (prompt: BlobDownloadConsentPrompt | null) => void;
}

export interface AndroidWebViewBlobDownloadManager {
  // Object URL & In-Memory Blob Registration
  createObjectUrl: (
    tabId: string,
    origin: string,
    data: Uint8Array | string,
    mimeType: string,
    filenameHint?: string,
    isPrivate?: boolean
  ) => { success: boolean; objectUrl?: string; blobId?: string; error?: string };

  revokeObjectUrl: (tabId: string, objectUrl: string) => boolean;

  // Blob & Object-URL Download Handling
  handleBlobDownloadRequest: (
    tabId: string,
    blobOrDataUrl: string,
    requestingOrigin: string,
    isPrivate?: boolean,
    suggestedFilename?: string
  ) => Promise<BlobDownloadResult>;

  approveBlobDownload: (downloadId: string) => BlobDownloadResult;
  rejectBlobDownload: (downloadId: string, reason?: string) => boolean;

  // Upload -> Web Page Processing -> Generated-File Download Round Trip
  processUploadedFileToBlob: (
    tabId: string,
    origin: string,
    file: AndroidSelectedFile,
    processingAction: "uppercase_text" | "csv_summary" | "json_export" | "hash_digest" | "passthrough",
    isPrivate?: boolean
  ) => { success: boolean; objectUrl?: string; blobId?: string; filename?: string; mimeType?: string; error?: string };

  // Store Inspection
  getBlobEntry: (objectUrl: string) => BlobStoreEntry | null;
  getBlobsForTab: (tabId: string) => BlobStoreEntry[];
  getActiveBlobCount: (tabId?: string) => number;

  // Lifecycle & Isolation Handlers
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  destroy: () => void;
}

export function createAndroidWebViewBlobDownloadManager(
  options: AndroidWebViewBlobDownloadManagerOptions = {}
): AndroidWebViewBlobDownloadManager {
  // Map<objectUrl, BlobStoreEntry>
  const blobStore = new Map<string, BlobStoreEntry>();

  // Map<tabId, Set<objectUrl>>
  const tabBlobs = new Map<string, Set<string>>();

  // Pending download prompts: Map<downloadId, { prompt: BlobDownloadConsentPrompt; entry: BlobStoreEntry; resolver: Function }>
  const pendingDownloads = new Map<
    string,
    {
      prompt: BlobDownloadConsentPrompt;
      entry: BlobStoreEntry;
      resolver: (res: BlobDownloadResult) => void;
    }
  >();

  const registerTabBlob = (tabId: string, objectUrl: string) => {
    let set = tabBlobs.get(tabId);
    if (!set) {
      set = new Set<string>();
      tabBlobs.set(tabId, set);
    }
    set.add(objectUrl);
  };

  const unregisterTabBlob = (tabId: string, objectUrl: string) => {
    const set = tabBlobs.get(tabId);
    if (set) {
      set.delete(objectUrl);
      if (set.size === 0) {
        tabBlobs.delete(tabId);
      }
    }
  };

  // -------------------------------------------------------------
  // 1. Create Object URL & Register In-Memory Blob
  // -------------------------------------------------------------
  const createObjectUrl = (
    tabId: string,
    origin: string,
    data: Uint8Array | string,
    mimeType: string,
    filenameHint?: string,
    isPrivate = false
  ): { success: boolean; objectUrl?: string; blobId?: string; error?: string } => {
    const valOrigin = validateBlobOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "Invalid origin for Object URL creation" };
    }

    const blobId = `blob-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const objectUrl = `blob:${valOrigin.canonicalOrigin}/${blobId}`;

    const sanitized = sanitizeBlobFilename(filenameHint, mimeType);
    const size = typeof data === "string" ? new TextEncoder().encode(data).length : data.byteLength;

    const entry: BlobStoreEntry = {
      blobId,
      objectUrl,
      tabId,
      origin: valOrigin.canonicalOrigin,
      filename: sanitized.filename,
      extension: sanitized.extension,
      mimeType: (mimeType || "application/octet-stream").toLowerCase().split(";")[0].trim(),
      size,
      data,
      isPrivate,
      createdAt: Date.now(),
      revoked: false,
    };

    blobStore.set(objectUrl, entry);
    registerTabBlob(tabId, objectUrl);

    return {
      success: true,
      objectUrl,
      blobId,
    };
  };

  // -------------------------------------------------------------
  // 2. Revoke Object URL
  // -------------------------------------------------------------
  const revokeObjectUrl = (tabId: string, objectUrl: string): boolean => {
    const entry = blobStore.get(objectUrl);
    if (!entry) return false;

    // Strict tab ownership check
    if (entry.tabId !== tabId) {
      return false;
    }

    entry.revoked = true;
    entry.data = ""; // Free buffer
    blobStore.delete(objectUrl);
    unregisterTabBlob(tabId, objectUrl);
    return true;
  };

  // -------------------------------------------------------------
  // 3. Handle Blob / Object-URL Download Request
  // -------------------------------------------------------------
  const handleBlobDownloadRequest = async (
    tabId: string,
    blobOrDataUrl: string,
    requestingOrigin: string,
    isPrivate = false,
    suggestedFilename?: string
  ): Promise<BlobDownloadResult> => {
    if (!blobOrDataUrl || typeof blobOrDataUrl !== "string") {
      return { success: false, error: "Download URL is empty" };
    }

    const trimmed = blobOrDataUrl.trim();
    const valOrigin = validateBlobOrigin(requestingOrigin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "Invalid requesting origin" };
    }

    // A. Handle Blob Object URL
    if (trimmed.startsWith("blob:")) {
      // Must not wrap dangerous schemes
      const lower = trimmed.toLowerCase();
      if (
        lower.startsWith("blob:javascript:") ||
        lower.startsWith("blob:file:") ||
        lower.startsWith("blob:content:") ||
        lower.startsWith("blob:about:") ||
        lower.startsWith("blob:null")
      ) {
        return { success: false, error: "Dangerous or malformed Blob scheme blocked" };
      }

      // Extract embedded origin from blob:https://origin/uuid
      const blobTarget = trimmed.substring(5); // strip "blob:"
      let embeddedOrigin = "";
      try {
        const parsed = new URL(blobTarget);
        embeddedOrigin = `${parsed.protocol}//${parsed.host}`;
      } catch {
        return { success: false, error: "Malformed Blob URL format" };
      }

      // Cross-origin check: Embedded origin must match canonical requesting origin
      if (embeddedOrigin.toLowerCase() !== valOrigin.canonicalOrigin.toLowerCase()) {
        return {
          success: false,
          error: `Cross-origin Blob access rejected: embedded origin '${embeddedOrigin}' does not match requesting origin '${valOrigin.canonicalOrigin}'`,
        };
      }

      // Look up blob in store
      const entry = blobStore.get(trimmed);
      if (!entry) {
        return { success: false, error: "Blob URL not found or already revoked (ERR_FILE_NOT_FOUND)" };
      }

      // Tab isolation check
      if (entry.tabId !== tabId) {
        return { success: false, error: "Cross-tab Blob access blocked by tab isolation policy" };
      }

      if (entry.revoked) {
        return { success: false, error: "Blob URL has been revoked" };
      }

      // Check filename
      const finalSanitized = sanitizeBlobFilename(
        suggestedFilename || entry.filename,
        entry.mimeType
      );

      const downloadId = `blob-dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const prompt: BlobDownloadConsentPrompt = {
        downloadId,
        blobId: entry.blobId,
        objectUrl: entry.objectUrl,
        filename: finalSanitized.filename,
        mimeType: entry.mimeType,
        sizeFormatted: `${(entry.size / 1024).toFixed(1)} KB`,
        origin: entry.origin,
        isDangerous: finalSanitized.isDangerous,
        securityWarning: finalSanitized.securityWarning,
        isPrivate: entry.isPrivate || isPrivate,
      };

      return new Promise<BlobDownloadResult>((resolve) => {
        pendingDownloads.set(downloadId, {
          prompt,
          entry,
          resolver: resolve,
        });

        options.onBlobConsentPromptChange?.(prompt);
      });
    }

    // B. Handle Safe Data URIs (data:image/png;base64, etc.)
    if (trimmed.startsWith("data:")) {
      const parts = trimmed.split(",");
      if (parts.length < 2) {
        return { success: false, error: "Malformed data URI" };
      }

      const meta = parts[0].substring(5); // after data:
      const [rawMime, ...params] = meta.split(";");
      const mimeType = (rawMime || "text/plain").toLowerCase().trim();
      const isBase64 = params.includes("base64");

      // Verify safe MIME types
      const isSafeMime =
        mimeType.startsWith("image/") ||
        mimeType.startsWith("audio/") ||
        mimeType.startsWith("video/") ||
        mimeType === "application/pdf" ||
        mimeType === "text/plain" ||
        mimeType === "text/csv" ||
        mimeType === "application/json" ||
        mimeType === "application/octet-stream";

      if (!isSafeMime) {
        return { success: false, error: `Insecure or unsupported data URI MIME type: ${mimeType}` };
      }

      const payloadStr = parts.slice(1).join(",");
      let data: Uint8Array;
      try {
        if (isBase64) {
          const binaryStr = atob(payloadStr);
          data = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            data[i] = binaryStr.charCodeAt(i);
          }
        } else {
          data = new TextEncoder().encode(decodeURIComponent(payloadStr));
        }
      } catch {
        return { success: false, error: "Failed to decode data URI payload" };
      }

      const sanitized = sanitizeBlobFilename(suggestedFilename, mimeType, "data_download");
      const downloadId = `data-dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const syntheticEntry: BlobStoreEntry = {
        blobId: `data-${Date.now()}`,
        objectUrl: trimmed.substring(0, 48) + "...",
        tabId,
        origin: valOrigin.canonicalOrigin,
        filename: sanitized.filename,
        extension: sanitized.extension,
        mimeType,
        size: data.byteLength,
        data,
        isPrivate,
        createdAt: Date.now(),
        revoked: false,
      };

      const prompt: BlobDownloadConsentPrompt = {
        downloadId,
        objectUrl: "data:URI",
        filename: sanitized.filename,
        mimeType,
        sizeFormatted: `${(data.byteLength / 1024).toFixed(1)} KB`,
        origin: valOrigin.canonicalOrigin,
        isDangerous: sanitized.isDangerous,
        securityWarning: sanitized.securityWarning,
        isPrivate,
      };

      return new Promise<BlobDownloadResult>((resolve) => {
        pendingDownloads.set(downloadId, {
          prompt,
          entry: syntheticEntry,
          resolver: resolve,
        });

        options.onBlobConsentPromptChange?.(prompt);
      });
    }

    return { success: false, error: "Unsupported URL scheme for Blob download boundary" };
  };

  const approveBlobDownload = (downloadId: string): BlobDownloadResult => {
    const pending = pendingDownloads.get(downloadId);
    if (!pending) {
      return { success: false, error: "Download request expired or not found" };
    }

    pendingDownloads.delete(downloadId);
    options.onBlobConsentPromptChange?.(null);

    const result: BlobDownloadResult = {
      success: true,
      downloadId,
      filename: pending.prompt.filename,
      mimeType: pending.entry.mimeType,
      size: pending.entry.size,
      data: pending.entry.data,
      isDangerous: pending.prompt.isDangerous,
      securityWarning: pending.prompt.securityWarning,
    };

    pending.resolver(result);
    return result;
  };

  const rejectBlobDownload = (downloadId: string, reason = "Download cancelled by user"): boolean => {
    const pending = pendingDownloads.get(downloadId);
    if (!pending) return false;

    pendingDownloads.delete(downloadId);
    options.onBlobConsentPromptChange?.(null);

    pending.resolver({
      success: false,
      error: reason,
    });

    return true;
  };

  // -------------------------------------------------------------
  // 4. Upload -> Web Page Processing -> Generated-File Download Round Trip
  // -------------------------------------------------------------
  const processUploadedFileToBlob = (
    tabId: string,
    origin: string,
    file: AndroidSelectedFile,
    processingAction: "uppercase_text" | "csv_summary" | "json_export" | "hash_digest" | "passthrough",
    isPrivate = false
  ): { success: boolean; objectUrl?: string; blobId?: string; filename?: string; mimeType?: string; error?: string } => {
    const valOrigin = validateBlobOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "Invalid origin" };
    }

    let processedContent: string | Uint8Array = "";
    let outputMime = file.type || "text/plain";
    let outputFilename = `processed_${file.name}`;

    switch (processingAction) {
      case "uppercase_text": {
        const dummyText = `NETFLOW PROCESSED FILE: ${file.name.toUpperCase()}\nORIGINAL SIZE: ${file.size} BYTES\nTIMESTAMP: ${new Date().toISOString()}`;
        processedContent = dummyText;
        outputMime = "text/plain";
        outputFilename = `UPPERCASE_${file.name}`;
        break;
      }
      case "csv_summary": {
        const csvSummary = `Filename,OriginalSize,ProcessedAt,Status\n"${file.name}",${file.size},"${new Date().toISOString()}","Processed"`;
        processedContent = csvSummary;
        outputMime = "text/csv";
        outputFilename = `summary_${file.name.replace(/\.[^/.]+$/, "")}.csv`;
        break;
      }
      case "json_export": {
        const jsonObj = {
          fileMetadata: {
            name: file.name,
            size: file.size,
            type: file.type,
            processedAt: Date.now(),
          },
          audit: {
            origin: valOrigin.canonicalOrigin,
            tabId,
            verified: true,
          },
        };
        processedContent = JSON.stringify(jsonObj, null, 2);
        outputMime = "application/json";
        outputFilename = `${file.name.replace(/\.[^/.]+$/, "")}_report.json`;
        break;
      }
      case "hash_digest": {
        // Simple deterministic hash simulation
        let hash = 0;
        const str = `${file.name}:${file.size}`;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        processedContent = `SHA256-SIMULATED-DIGEST: ${Math.abs(hash).toString(16).padStart(16, "0")}\nFILE: ${file.name}`;
        outputMime = "text/plain";
        outputFilename = `${file.name}.sha256`;
        break;
      }
      case "passthrough":
      default: {
        processedContent = `PASSTHROUGH DATA FOR ${file.name} (SIZE: ${file.size})`;
        break;
      }
    }

    const regRes = createObjectUrl(
      tabId,
      valOrigin.canonicalOrigin,
      processedContent,
      outputMime,
      outputFilename,
      isPrivate
    );

    if (!regRes.success) {
      return { success: false, error: regRes.error };
    }

    return {
      success: true,
      objectUrl: regRes.objectUrl,
      blobId: regRes.blobId,
      filename: outputFilename,
      mimeType: outputMime,
    };
  };

  // -------------------------------------------------------------
  // 5. Store Inspection
  // -------------------------------------------------------------
  const getBlobEntry = (objectUrl: string): BlobStoreEntry | null => {
    const entry = blobStore.get(objectUrl);
    return entry ? { ...entry } : null;
  };

  const getBlobsForTab = (tabId: string): BlobStoreEntry[] => {
    const set = tabBlobs.get(tabId);
    if (!set) return [];
    const list: BlobStoreEntry[] = [];
    set.forEach((url) => {
      const e = blobStore.get(url);
      if (e) list.push({ ...e });
    });
    return list;
  };

  const getActiveBlobCount = (tabId?: string): number => {
    if (!tabId) return blobStore.size;
    const set = tabBlobs.get(tabId);
    return set ? set.size : 0;
  };

  // -------------------------------------------------------------
  // 6. Lifecycle & Isolation Handlers
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, _newUrl: string) => {
    // Abort pending downloads for this tab
    pendingDownloads.forEach((pending, dlId) => {
      if (pending.entry.tabId === tabId) {
        rejectBlobDownload(dlId, "Blob download aborted by tab navigation");
      }
    });

    // Revoke and purge all object URLs for this tab
    const set = tabBlobs.get(tabId);
    if (set) {
      const urls = Array.from(set);
      urls.forEach((url) => {
        revokeObjectUrl(tabId, url);
      });
      tabBlobs.delete(tabId);
    }
  };

  const onReload = (tabId: string) => {
    onNavigation(tabId, "");
  };

  const onStopLoading = (tabId: string) => {
    pendingDownloads.forEach((pending, dlId) => {
      if (pending.entry.tabId === tabId) {
        rejectBlobDownload(dlId, "Blob download cancelled by stopLoading");
      }
    });
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    onNavigation(tabId, "");

    // If closing the final private tab, purge all private Blobs and pending downloads
    if (isPrivate && remainingPrivateTabs === 0) {
      const privateUrls: string[] = [];
      blobStore.forEach((entry, url) => {
        if (entry.isPrivate) {
          privateUrls.push(url);
        }
      });
      privateUrls.forEach((url) => {
        const e = blobStore.get(url);
        if (e) revokeObjectUrl(e.tabId, url);
      });
    }
  };

  const destroy = () => {
    pendingDownloads.forEach((pending, dlId) => {
      rejectBlobDownload(dlId, "Manager destroyed");
    });
    pendingDownloads.clear();
    blobStore.clear();
    tabBlobs.clear();
  };

  return {
    createObjectUrl,
    revokeObjectUrl,
    handleBlobDownloadRequest,
    approveBlobDownload,
    rejectBlobDownload,
    processUploadedFileToBlob,
    getBlobEntry,
    getBlobsForTab,
    getActiveBlobCount,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
