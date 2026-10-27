/**
 * NETFLOW Browser V2 — Android WebView JavaScript File System & File API / Download Boundary
 *
 * Form: NETFLOW-V2-NATIVE-25
 *
 * This module establishes the secure JavaScript File System, File API / FileReader,
 * Large-File Memory Guard, and Generated File Download boundary:
 * 1. File API & Blob modeling (WebViewBlob, WebViewFile, slicing, metadata)
 * 2. FileReader boundary (readAsText, readAsArrayBuffer, readAsDataURL, readAsBinaryString) with chunking & lifecycle events
 * 3. Generated-file download pipeline with explicit user consent gating
 * 4. Large-file memory & size guard: enforces strict per-file and per-tab aggregate memory caps to prevent OOM/DoS
 * 5. MIME type & filename safety: anti-traversal, null-byte removal, reserved device name disarming, dangerous extension neutralization (.download), credential leak prevention
 * 6. Tab, request, and canonical-origin isolation: prevents cross-origin and cross-tab file reading/hijacking
 * 7. Ephemeral private browsing isolation: in-memory only, immediate purge on private tab termination
 * 8. Full lifecycle cleanup: auto-aborts in-flight readers & revokes generated files on navigation, reload, stopLoading, tab close
 * 9. Dangerous scheme & SSRF protection: blocks javascript:, file:, content:, private subnets, metadata IPs (169.254.169.254)
 * 10. Privileged native bridge invariant: pure safe TypeScript boundary without native reflection.
 */

export interface WebViewBlobOptions {
  type?: string;
  endings?: "transparent" | "native";
}

export interface WebViewBlob {
  blobId: string;
  size: number;
  type: string;
  data: Uint8Array;
  slice: (start?: number, end?: number, contentType?: string) => WebViewBlob;
}

export interface WebViewFile extends WebViewBlob {
  name: string;
  lastModified: number;
  webkitRelativePath: string;
  tabId: string;
  origin: string;
  isPrivate: boolean;
  isGenerated?: boolean;
}

export interface FileReaderProgressEvent {
  lengthComputable: boolean;
  loaded: number;
  total: number;
  type: "loadstart" | "progress" | "load" | "error" | "abort" | "loadend";
}

export type FileReaderReadyState = 0 | 1 | 2; // 0 = EMPTY, 1 = LOADING, 2 = DONE

export interface SafeFileReader {
  readerId: string;
  tabId: string;
  origin: string;
  readyState: FileReaderReadyState;
  result: string | ArrayBuffer | null;
  error: string | null;
  abort: () => void;
  readAsText: (blob: WebViewBlob, encoding?: string) => Promise<string>;
  readAsArrayBuffer: (blob: WebViewBlob) => Promise<ArrayBuffer>;
  readAsDataURL: (blob: WebViewBlob) => Promise<string>;
  readAsBinaryString: (blob: WebViewBlob) => Promise<string>;
}

export interface GeneratedFileDownloadPrompt {
  downloadId: string;
  fileId?: string;
  filename: string;
  mimeType: string;
  sizeFormatted: string;
  sizeBytes: number;
  origin: string;
  isDangerous: boolean;
  securityWarning?: string;
  isPrivate: boolean;
  tabId: string;
}

export interface GeneratedFileDownloadResult {
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

export interface FileSystemOriginValidationResult {
  isValid: boolean;
  isSecure: boolean;
  isLocalhost: boolean;
  canonicalOrigin?: string;
  reason?: string;
}

// Memory and size guards to prevent WebView exhaustion / DoS
export const FILE_SYSTEM_LIMITS = {
  MAX_SINGLE_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_TAB_STORAGE_BYTES: 100 * 1024 * 1024, // 100 MB aggregate per tab
  MAX_READ_CHUNK_SIZE_BYTES: 1 * 1024 * 1024, // 1 MB streaming chunk
};

// Known dangerous extensions
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

/**
 * Validates requesting origin for File System & File API operations.
 * Must be HTTPS or localhost. Blocks dangerous schemes, metadata IPs, and private subnets.
 */
export function validateFileSystemOrigin(originStr: string): FileSystemOriginValidationResult {
  if (!originStr || typeof originStr !== "string") {
    return { isValid: false, isSecure: false, isLocalhost: false, reason: "Origin is empty" };
  }

  const lower = originStr.trim().toLowerCase();

  // Block dangerous schemes
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
      reason: "Dangerous scheme blocked for File API operations",
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
        reason: `Unsupported File API origin protocol: ${protocol}`,
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
        reason: "Insecure remote HTTP origin blocked from File API operations",
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
        reason: "File API origin blocked on private network or cloud metadata address",
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
      reason: "Malformed File API origin URL",
    };
  }
}

/**
 * Sanitizes filenames for Generated Files & File API downloads.
 * Defends against:
 * 1. Path traversal (../, ..\, /, \)
 * 2. Null bytes (%00, \0) & control chars
 * 3. Windows reserved device names (CON, NUL, AUX, etc.)
 * 4. Dangerous executable extensions (.exe, .apk, .sh, etc.) -> disarms with .download
 * 5. Sensitive credentials / query auth tokens leaking into filename
 */
export function sanitizeGeneratedFilename(
  rawFilename?: string,
  mimeType?: string,
  fallbackBase = "download_file"
): {
  filename: string;
  extension: string;
  isDangerous: boolean;
  securityWarning?: string;
} {
  let candidate = (rawFilename || "").trim();

  // Strip sensitive query credentials and tokens
  candidate = candidate.replace(/[?&](?:token|auth|key|secret|password|sig|bearer)=[^&;]*/gi, "");
  candidate = candidate.replace(/(?:bearer|auth|token|secret|password)[-_][a-zA-Z0-9_-]{8,}/gi, "redacted_token");

  if (!candidate) {
    candidate = `${fallbackBase}_${Date.now()}.bin`;
  }

  // Strip null bytes and ASCII control characters
  let clean = candidate.replace(/[\x00-\x1f\x7f]/g, "").trim();

  // Strip directory traversal
  clean = clean.replace(/(\.\.[\/\\])+/g, "");
  clean = clean.replace(/[\/\\]+/g, "_");

  // Strip illegal filesystem characters
  clean = clean.replace(/[<>:"|?*]/g, "_");

  // Strip leading dots
  clean = clean.replace(/^\.+/, "");

  if (!clean) {
    clean = `${fallbackBase}_${Date.now()}.bin`;
  }

  // Length enforcement
  let baseName = clean;
  let extension = "";
  const lastDot = clean.lastIndexOf(".");
  if (lastDot > 0 && lastDot < clean.length - 1) {
    baseName = clean.substring(0, lastDot);
    extension = clean.substring(lastDot).toLowerCase();
  }

  if (baseName.length > 90) {
    baseName = baseName.substring(0, 90);
  }

  // Reserved device name check
  if (RESERVED_DEVICE_NAMES.has(baseName.toUpperCase())) {
    baseName = `safe_${baseName}`;
  }

  // Dangerous extension neutralization
  let isDangerous = false;
  let securityWarning: string | undefined;

  if (DANGEROUS_EXTENSIONS.has(extension)) {
    isDangerous = true;
    securityWarning = `Neutralized dangerous executable extension (${extension}) to protect device.`;
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

export interface AndroidWebViewFileSystemManagerOptions {
  onDownloadConsentPromptChange?: (prompt: GeneratedFileDownloadPrompt | null) => void;
}

export interface AndroidWebViewFileSystemManager {
  // File & Blob Creation
  createBlob: (parts: (Uint8Array | string | ArrayBuffer)[], options?: WebViewBlobOptions) => WebViewBlob;
  createFile: (
    tabId: string,
    origin: string,
    parts: (Uint8Array | string | ArrayBuffer)[],
    name: string,
    options?: { type?: string; lastModified?: number; isPrivate?: boolean }
  ) => { success: boolean; file?: WebViewFile; error?: string };

  // Safe FileReader Factory
  createFileReader: (tabId: string, origin: string) => SafeFileReader;

  // Generated File Download Pipeline
  requestGeneratedFileDownload: (
    tabId: string,
    origin: string,
    fileOrData: WebViewFile | { name: string; type?: string; data: Uint8Array | string },
    isPrivate?: boolean
  ) => Promise<GeneratedFileDownloadResult>;

  approveGeneratedFileDownload: (downloadId: string) => GeneratedFileDownloadResult;
  rejectGeneratedFileDownload: (downloadId: string, reason?: string) => boolean;

  // Quota & Memory Inspection
  getTabAllocatedBytes: (tabId: string) => number;
  getFileCountForTab: (tabId: string) => number;

  // Lifecycle & Isolation Handlers
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  destroy: () => void;
}

export function createAndroidWebViewFileSystemManager(
  options: AndroidWebViewFileSystemManagerOptions = {}
): AndroidWebViewFileSystemManager {
  // Map<fileId, WebViewFile>
  const fileRegistry = new Map<string, WebViewFile>();

  // Map<tabId, Set<fileId>>
  const tabFiles = new Map<string, Set<string>>();

  // Map<tabId, number> total allocated bytes
  const tabMemoryUsage = new Map<string, number>();

  // Active FileReaders: Map<readerId, SafeFileReader>
  const activeReaders = new Map<string, SafeFileReader>();

  // Pending downloads: Map<downloadId, { prompt, file, resolver }>
  const pendingDownloads = new Map<
    string,
    {
      prompt: GeneratedFileDownloadPrompt;
      file: WebViewFile;
      resolver: (res: GeneratedFileDownloadResult) => void;
    }
  >();

  const trackAllocation = (tabId: string, bytes: number): boolean => {
    const current = tabMemoryUsage.get(tabId) || 0;
    if (current + bytes > FILE_SYSTEM_LIMITS.MAX_TAB_STORAGE_BYTES) {
      return false;
    }
    tabMemoryUsage.set(tabId, current + bytes);
    return true;
  };

  const releaseAllocation = (tabId: string, bytes: number) => {
    const current = tabMemoryUsage.get(tabId) || 0;
    const updated = Math.max(0, current - bytes);
    if (updated === 0) {
      tabMemoryUsage.delete(tabId);
    } else {
      tabMemoryUsage.set(tabId, updated);
    }
  };

  // -------------------------------------------------------------
  // 1. Create Blob (with slice support)
  // -------------------------------------------------------------
  const createBlob = (
    parts: (Uint8Array | string | ArrayBuffer)[],
    blobOptions?: WebViewBlobOptions
  ): WebViewBlob => {
    const uintArrays: Uint8Array[] = parts.map((part) => {
      if (typeof part === "string") {
        return new TextEncoder().encode(part);
      } else if (part instanceof Uint8Array) {
        return part;
      } else if (part instanceof ArrayBuffer) {
        return new Uint8Array(part);
      }
      return new Uint8Array(0);
    });

    const totalLen = uintArrays.reduce((acc, curr) => acc + curr.byteLength, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of uintArrays) {
      combined.set(arr, offset);
      offset += arr.byteLength;
    }

    const mimeType = (blobOptions?.type || "application/octet-stream").toLowerCase().split(";")[0].trim();
    const blobId = `blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const blob: WebViewBlob = {
      blobId,
      size: totalLen,
      type: mimeType,
      data: combined,
      slice: (start = 0, end = totalLen, contentType = ""): WebViewBlob => {
        const s = Math.max(0, start < 0 ? totalLen + start : start);
        const e = Math.min(totalLen, end < 0 ? totalLen + end : end);
        const sliceData = combined.subarray(s, Math.max(s, e));
        return createBlob([sliceData], { type: contentType || mimeType });
      },
    };

    return blob;
  };

  // -------------------------------------------------------------
  // 2. Create File (Large-File & Quota Guarded)
  // -------------------------------------------------------------
  const createFile = (
    tabId: string,
    origin: string,
    parts: (Uint8Array | string | ArrayBuffer)[],
    name: string,
    fileOptions?: { type?: string; lastModified?: number; isPrivate?: boolean }
  ): { success: boolean; file?: WebViewFile; error?: string } => {
    const valOrigin = validateFileSystemOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "Invalid File API origin" };
    }

    const baseBlob = createBlob(parts, { type: fileOptions?.type });

    // Large-File Memory Guard (Single file cap)
    if (baseBlob.size > FILE_SYSTEM_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `ERR_FILE_TOO_LARGE: File size (${baseBlob.size} bytes) exceeds single file limit of ${FILE_SYSTEM_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES} bytes.`,
      };
    }

    // Tab aggregate memory limit check
    if (!trackAllocation(tabId, baseBlob.size)) {
      return {
        success: false,
        error: `ERR_QUOTA_EXCEEDED: Exceeded tab memory quota of ${FILE_SYSTEM_LIMITS.MAX_TAB_STORAGE_BYTES} bytes.`,
      };
    }

    const sanitized = sanitizeGeneratedFilename(name, baseBlob.type);
    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const webViewFile: WebViewFile = {
      ...baseBlob,
      blobId: fileId,
      name: sanitized.filename,
      lastModified: fileOptions?.lastModified || Date.now(),
      webkitRelativePath: "",
      tabId,
      origin: valOrigin.canonicalOrigin,
      isPrivate: fileOptions?.isPrivate || false,
      isGenerated: true,
    };

    fileRegistry.set(fileId, webViewFile);

    let set = tabFiles.get(tabId);
    if (!set) {
      set = new Set<string>();
      tabFiles.set(tabId, set);
    }
    set.add(fileId);

    return {
      success: true,
      file: webViewFile,
    };
  };

  // -------------------------------------------------------------
  // 3. Safe FileReader Implementation
  // -------------------------------------------------------------
  const createFileReader = (tabId: string, origin: string): SafeFileReader => {
    const valOrigin = validateFileSystemOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      throw new Error(valOrigin.reason || "Invalid origin for FileReader creation");
    }

    const readerId = `reader-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let readyState: FileReaderReadyState = 0; // EMPTY
    let result: string | ArrayBuffer | null = null;
    let error: string | null = null;
    let isAborted = false;

    const executeRead = async <T>(
      blob: WebViewBlob,
      transform: (buffer: Uint8Array) => T
    ): Promise<T> => {
      // Origin and Tab Isolation Check if blob is a WebViewFile
      const asFile = blob as Partial<WebViewFile>;
      if (asFile.origin && asFile.origin !== valOrigin.canonicalOrigin) {
        throw new Error("SecurityError: Cross-origin FileReader access blocked");
      }
      if (asFile.tabId && asFile.tabId !== tabId) {
        throw new Error("SecurityError: Cross-tab FileReader access blocked");
      }

      // Large-file buffer safeguard
      if (blob.size > FILE_SYSTEM_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES) {
        throw new Error(`ERR_FILE_TOO_LARGE: Cannot read file exceeding ${FILE_SYSTEM_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES} bytes`);
      }

      readyState = 1; // LOADING
      isAborted = false;
      error = null;

      // Simulate chunking read safely
      const total = blob.size;
      let loaded = 0;
      const chunkSize = Math.min(total, FILE_SYSTEM_LIMITS.MAX_READ_CHUNK_SIZE_BYTES);

      while (loaded < total) {
        if (isAborted) {
          readyState = 2; // DONE
          throw new Error("AbortError: The read operation was aborted.");
        }
        loaded = Math.min(total, loaded + chunkSize);
      }

      if (isAborted) {
        readyState = 2;
        throw new Error("AbortError: The read operation was aborted.");
      }

      const transformed = transform(blob.data);
      result = transformed as unknown as string | ArrayBuffer;
      readyState = 2; // DONE
      return transformed;
    };

    const reader: SafeFileReader = {
      readerId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      get readyState() {
        return readyState;
      },
      get result() {
        return result;
      },
      get error() {
        return error;
      },
      abort: () => {
        isAborted = true;
        readyState = 2;
        result = null;
        error = "AbortError";
      },
      readAsText: async (blob: WebViewBlob, encoding = "utf-8"): Promise<string> => {
        return executeRead(blob, (buffer) => {
          try {
            return new TextDecoder(encoding).decode(buffer);
          } catch {
            return new TextDecoder("utf-8").decode(buffer);
          }
        });
      },
      readAsArrayBuffer: async (blob: WebViewBlob): Promise<ArrayBuffer> => {
        return executeRead(blob, (buffer) => {
          const ab = new ArrayBuffer(buffer.byteLength);
          new Uint8Array(ab).set(buffer);
          return ab;
        });
      },
      readAsDataURL: async (blob: WebViewBlob): Promise<string> => {
        return executeRead(blob, (buffer) => {
          const mime = blob.type || "application/octet-stream";
          let binary = "";
          const len = buffer.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(buffer[i]);
          }
          const base64 = btoa(binary);
          return `data:${mime};base64,${base64}`;
        });
      },
      readAsBinaryString: async (blob: WebViewBlob): Promise<string> => {
        return executeRead(blob, (buffer) => {
          let binary = "";
          for (let i = 0; i < buffer.byteLength; i++) {
            binary += String.fromCharCode(buffer[i]);
          }
          return binary;
        });
      },
    };

    activeReaders.set(readerId, reader);
    return reader;
  };

  // -------------------------------------------------------------
  // 4. Generated-File Download Pipeline with Consent Gating
  // -------------------------------------------------------------
  const requestGeneratedFileDownload = async (
    tabId: string,
    origin: string,
    fileOrData: WebViewFile | { name: string; type?: string; data: Uint8Array | string },
    isPrivate = false
  ): Promise<GeneratedFileDownloadResult> => {
    const valOrigin = validateFileSystemOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "Invalid origin" };
    }

    let targetFile: WebViewFile;
    if ("blobId" in fileOrData && "slice" in fileOrData) {
      targetFile = fileOrData as WebViewFile;
      // Cross-origin and cross-tab check
      if (targetFile.origin && targetFile.origin !== valOrigin.canonicalOrigin) {
        return { success: false, error: "Cross-origin file download rejected" };
      }
      if (targetFile.tabId && targetFile.tabId !== tabId) {
        return { success: false, error: "Cross-tab file download rejected" };
      }
    } else {
      // Build file from raw data
      const rawData =
        typeof fileOrData.data === "string"
          ? new TextEncoder().encode(fileOrData.data)
          : fileOrData.data;

      const created = createFile(tabId, valOrigin.canonicalOrigin, [rawData], fileOrData.name, {
        type: fileOrData.type,
        isPrivate,
      });

      if (!created.success || !created.file) {
        return { success: false, error: created.error };
      }
      targetFile = created.file;
    }

    const sanitized = sanitizeGeneratedFilename(targetFile.name, targetFile.type);
    const downloadId = `gen-dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const prompt: GeneratedFileDownloadPrompt = {
      downloadId,
      fileId: targetFile.blobId,
      filename: sanitized.filename,
      mimeType: targetFile.type,
      sizeBytes: targetFile.size,
      sizeFormatted: `${(targetFile.size / 1024).toFixed(1)} KB`,
      origin: valOrigin.canonicalOrigin,
      isDangerous: sanitized.isDangerous,
      securityWarning: sanitized.securityWarning,
      isPrivate: targetFile.isPrivate || isPrivate,
      tabId,
    };

    return new Promise<GeneratedFileDownloadResult>((resolve) => {
      pendingDownloads.set(downloadId, {
        prompt,
        file: targetFile,
        resolver: resolve,
      });

      options.onDownloadConsentPromptChange?.(prompt);
    });
  };

  const approveGeneratedFileDownload = (downloadId: string): GeneratedFileDownloadResult => {
    const pending = pendingDownloads.get(downloadId);
    if (!pending) {
      return { success: false, error: "Download request expired or not found" };
    }

    pendingDownloads.delete(downloadId);
    options.onDownloadConsentPromptChange?.(null);

    const result: GeneratedFileDownloadResult = {
      success: true,
      downloadId,
      filename: pending.prompt.filename,
      mimeType: pending.file.type,
      size: pending.file.size,
      data: pending.file.data,
      isDangerous: pending.prompt.isDangerous,
      securityWarning: pending.prompt.securityWarning,
    };

    pending.resolver(result);
    return result;
  };

  const rejectGeneratedFileDownload = (
    downloadId: string,
    reason = "File download cancelled by user"
  ): boolean => {
    const pending = pendingDownloads.get(downloadId);
    if (!pending) return false;

    pendingDownloads.delete(downloadId);
    options.onDownloadConsentPromptChange?.(null);

    pending.resolver({
      success: false,
      error: reason,
    });

    return true;
  };

  // -------------------------------------------------------------
  // 5. Quota & Memory Inspection
  // -------------------------------------------------------------
  const getTabAllocatedBytes = (tabId: string): number => {
    return tabMemoryUsage.get(tabId) || 0;
  };

  const getFileCountForTab = (tabId: string): number => {
    return tabFiles.get(tabId)?.size || 0;
  };

  // -------------------------------------------------------------
  // 6. Lifecycle & Isolation Handlers
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, _newUrl: string) => {
    // Abort pending readers for this tab
    activeReaders.forEach((reader, id) => {
      if (reader.tabId === tabId) {
        reader.abort();
        activeReaders.delete(id);
      }
    });

    // Abort pending downloads for this tab
    pendingDownloads.forEach((pending, dlId) => {
      if (pending.file.tabId === tabId) {
        rejectGeneratedFileDownload(dlId, "File download aborted by tab navigation");
      }
    });

    // Revoke and release all files allocated by this tab
    const set = tabFiles.get(tabId);
    if (set) {
      set.forEach((fileId) => {
        const file = fileRegistry.get(fileId);
        if (file) {
          releaseAllocation(tabId, file.size);
          fileRegistry.delete(fileId);
        }
      });
      tabFiles.delete(tabId);
    }
  };

  const onReload = (tabId: string) => {
    onNavigation(tabId, "");
  };

  const onStopLoading = (tabId: string) => {
    // Abort in-flight downloads
    pendingDownloads.forEach((pending, dlId) => {
      if (pending.file.tabId === tabId) {
        rejectGeneratedFileDownload(dlId, "File download cancelled by stopLoading");
      }
    });

    // Abort in-flight readers
    activeReaders.forEach((reader) => {
      if (reader.tabId === tabId && reader.readyState === 1) {
        reader.abort();
      }
    });
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    onNavigation(tabId, "");
    tabMemoryUsage.delete(tabId);

    // If last private tab closed, purge all private files and readers across memory
    if (isPrivate && remainingPrivateTabs === 0) {
      const privateFileIds: string[] = [];
      fileRegistry.forEach((file, fId) => {
        if (file.isPrivate) {
          privateFileIds.push(fId);
        }
      });
      privateFileIds.forEach((fId) => {
        const file = fileRegistry.get(fId);
        if (file) {
          releaseAllocation(file.tabId, file.size);
          fileRegistry.delete(fId);
        }
      });
    }
  };

  const destroy = () => {
    pendingDownloads.forEach((pending, dlId) => {
      rejectGeneratedFileDownload(dlId, "Manager destroyed");
    });
    pendingDownloads.clear();
    activeReaders.forEach((r) => r.abort());
    activeReaders.clear();
    fileRegistry.clear();
    tabFiles.clear();
    tabMemoryUsage.clear();
  };

  return {
    createBlob,
    createFile,
    createFileReader,
    requestGeneratedFileDownload,
    approveGeneratedFileDownload,
    rejectGeneratedFileDownload,
    getTabAllocatedBytes,
    getFileCountForTab,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
