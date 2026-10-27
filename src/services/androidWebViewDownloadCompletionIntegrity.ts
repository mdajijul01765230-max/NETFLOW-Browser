/**
 * Android WebView Download Completion Integrity & Safe Finalization Boundary (NETFLOW-V2-NATIVE-36)
 *
 * Implements:
 * - Temporary / In-progress file state (.part / .download staging) vs Final completed file state
 * - Strict partial download protection: partial / truncated downloads never appear as completed
 * - Safe finalization of completed downloads with atomic staging-to-final promotion
 * - Cancel, failure, and network interruption cleanup of staging files and buffers
 * - Filename & path revalidation immediately prior to final disk/storage commitment
 * - Collision & overwrite protection: non-destructive renaming (e.g. file (1).ext)
 * - MIME type & extension consistency validation with magic byte signature verification
 * - Per-tab download isolation preventing cross-tab leakage or interference
 * - Ephemeral private-tab download cleanup: all temporary and finalized records wiped on tab close
 * - Compatibility with NATIVE-35 (Download Lifecycle), NATIVE-31 (Page Lifecycle),
 *   NATIVE-30 (Rendering Resilience), and NATIVE-29 (Media Resource Governance)
 * - Strict Invariant: No privileged JS bridges, JNI, or reflection.
 */

export enum StagingFileStatus {
  STAGING = "STAGING",
  VERIFYING = "VERIFYING",
  FINALIZED = "FINALIZED",
  INTERRUPTED = "INTERRUPTED",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
}

export enum IntegrityFailureReason {
  SIZE_MISMATCH_PARTIAL = "SIZE_MISMATCH_PARTIAL",
  ZERO_BYTE_PAYLOAD = "ZERO_BYTE_PAYLOAD",
  PREMATURE_EOF = "PREMATURE_EOF",
  MIME_EXTENSION_MISMATCH = "MIME_EXTENSION_MISMATCH",
  MAGIC_BYTE_MISMATCH = "MAGIC_BYTE_MISMATCH",
  PATH_TRAVERSAL_DETECTED = "PATH_TRAVERSAL_DETECTED",
  NULL_BYTE_DETECTED = "NULL_BYTE_DETECTED",
  RESERVED_DEVICE_NAME = "RESERVED_DEVICE_NAME",
  STAGING_NOT_FOUND = "STAGING_NOT_FOUND",
  TAB_MISMATCH = "TAB_MISMATCH",
  TAB_CLOSED = "TAB_CLOSED",
  STREAM_BUFFER_EXCEEDED = "STREAM_BUFFER_EXCEEDED",
  CHUNK_ORDER_MISMATCH = "CHUNK_ORDER_MISMATCH",
}

// Bounded memory limits for WebView streaming downloads
export const MAX_ALLOWED_CHUNK_SIZE_BYTES = 32 * 1024 * 1024; // 32MB max per chunk buffer
export const MAX_SAMPLE_HEADER_BYTES = 64; // Bounded in-memory header sample
export const MAX_ACTIVE_STAGING_RECORDS = 500; // Bounded active staging streams

export interface StreamBufferMetrics {
  activeStreams: number;
  totalReceivedBytes: number;
  maxChunkSizeBytes: number;
  maxSampleHeaderBytes: number;
  maxActiveStagingRecords: number;
  boundedMemoryPolicyEnforced: boolean;
}

export interface TerminalDownloadStateRecord {
  downloadId: string;
  stagingId: string;
  tabId: string;
  status: StagingFileStatus.CANCELLED | StagingFileStatus.FAILED | StagingFileStatus.INTERRUPTED;
  reason: string;
  timestamp: number;
}

export interface TemporaryStagingRecord {
  stagingId: string;
  downloadId: string;
  tabId: string;
  tempFilename: string;
  destinationFilename: string;
  expectedBytes: number;
  receivedBytes: number;
  mimeType: string;
  isPrivate: boolean;
  status: StagingFileStatus;
  createdAt: number;
  lastChunkAt: number;
  chunkCount: number;
  hasMagicBytesVerified: boolean;
  isFinalChunkReceived?: boolean;
  sampleHeader?: Uint8Array | number[];
}

export interface FinalizedDownloadRecord {
  downloadId: string;
  stagingId: string;
  tabId: string;
  finalFilename: string;
  originalFilename: string;
  finalSizeBytes: number;
  mimeType: string;
  extension: string;
  isPrivate: boolean;
  finalizedAt: number;
  wasCollisionResolved: boolean;
  collisionIndex?: number;
  storagePath: string;
}

export interface StagingChunkParams {
  stagingId: string;
  tabId: string;
  chunkSize: number;
  chunkSample?: Uint8Array | number[];
  isFinalChunk?: boolean;
  chunkIndex?: number;
}

export interface FinalizeDownloadParams {
  stagingId: string;
  tabId: string;
  expectedContentLength?: number;
  targetDirectory?: string;
  destinationFilename?: string;
}

export interface FinalizationResult {
  success: boolean;
  record?: FinalizedDownloadRecord;
  failureReason?: IntegrityFailureReason;
  errorMessage?: string;
  cleanedStagingId?: string;
}

export interface AndroidWebViewDownloadCompletionIntegrityManager {
  createStagingDownload: (params: {
    downloadId: string;
    tabId: string;
    destinationFilename: string;
    expectedBytes?: number;
    mimeType?: string;
    isPrivate?: boolean;
  }) => { stagingId: string; tempFilename: string };

  appendChunk: (params: StagingChunkParams) => {
    success: boolean;
    receivedBytes: number;
    expectedBytes: number;
    isComplete: boolean;
    error?: string;
  };

  finalizeDownload: (params: FinalizeDownloadParams) => FinalizationResult;

  cancelAndCleanupStaging: (stagingId: string, reason?: string) => { cleaned: boolean };

  failAndCleanupStaging: (
    stagingId: string,
    reason: IntegrityFailureReason,
    errorMessage: string
  ) => { cleaned: boolean };

  interruptAndCleanupStaging: (stagingId: string, reason?: string) => { cleaned: boolean };

  isDownloadCompleted: (downloadId: string) => boolean;

  isDownloadInProgress: (downloadId: string) => boolean;

  getDownloadCompletionState: (
    downloadId: string
  ) => "STAGING_IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED" | "INTERRUPTED" | "NOT_FOUND";

  getTerminalState: (downloadId: string) => TerminalDownloadStateRecord | null;

  validateCompletionIntegrity: (downloadId: string) => {
    isValid: boolean;
    state: "STAGING_IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED" | "INTERRUPTED" | "NOT_FOUND";
    record?: FinalizedDownloadRecord;
    error?: string;
  };

  getStreamBufferMetrics: () => StreamBufferMetrics;

  getStagingRecord: (stagingId: string) => TemporaryStagingRecord | null;

  getStagingByDownloadId: (downloadId: string) => TemporaryStagingRecord | null;

  getFinalizedRecord: (downloadId: string) => FinalizedDownloadRecord | null;

  getFinalizedDownloadsForTab: (tabId: string) => FinalizedDownloadRecord[];

  getAllFinalizedDownloads: () => FinalizedDownloadRecord[];

  onTabNavigation: (tabId: string) => { cleanedStagingCount: number };

  onTabClosed: (tabId: string, isPrivate?: boolean) => {
    cleanedStagingCount: number;
    cleanedFinalizedCount: number;
  };

  resolveFilenameCollision: (desiredFilename: string, existingFilenames: Set<string>) => {
    resolvedFilename: string;
    wasCollision: boolean;
    index?: number;
  };

  validateMimeAndExtensionConsistency: (
    filename: string,
    mimeType: string,
    sampleHeader?: Uint8Array | number[]
  ) => {
    isValid: boolean;
    normalizedExtension: string;
    correctedFilename?: string;
    failureReason?: IntegrityFailureReason;
    warning?: string;
  };

  revalidateDestinationFilename: (filename: string) => {
    isValid: boolean;
    sanitizedFilename: string;
    failureReason?: IntegrityFailureReason;
  };

  resetAll: () => void;
}

// Known MIME to extension mapping
const KNOWN_MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/svg+xml": [".svg"],
  "text/plain": [".txt"],
  "text/html": [".html", ".htm"],
  "text/csv": [".csv"],
  "text/css": [".css"],
  "application/json": [".json"],
  "application/zip": [".zip"],
  "application/gzip": [".gz", ".tar.gz"],
  "application/x-tar": [".tar"],
  "application/octet-stream": [".bin", ".dat", ".apk", ".iso"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "application/vnd.android.package-archive": [".apk"],
};

// Windows reserved device names
const WINDOWS_RESERVED = new Set([
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
 * Validates known file magic bytes against MIME type
 */
export function verifyMagicByteSignature(
  header: Uint8Array | number[],
  mimeType: string
): { isValid: boolean; detectedFormat?: string } {
  if (!header || header.length < 4) {
    // If not enough sample header, allow but do not strictly certify
    return { isValid: true };
  }

  const bytes = Array.from(header.slice(0, 8));
  const normMime = mimeType.toLowerCase().split(";")[0].trim();

  // PDF: %PDF (0x25, 0x50, 0x44, 0x46)
  if (normMime === "application/pdf") {
    const isPdf =
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    return { isValid: isPdf, detectedFormat: isPdf ? "PDF" : "unknown" };
  }

  // PNG: \x89PNG (0x89, 0x50, 0x4E, 0x47)
  if (normMime === "image/png") {
    const isPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return { isValid: isPng, detectedFormat: isPng ? "PNG" : "unknown" };
  }

  // JPEG: 0xFF, 0xD8, 0xFF
  if (normMime === "image/jpeg") {
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return { isValid: isJpg, detectedFormat: isJpg ? "JPEG" : "unknown" };
  }

  // GIF: GIF8 (0x47, 0x49, 0x46, 0x38)
  if (normMime === "image/gif") {
    const isGif =
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
    return { isValid: isGif, detectedFormat: isGif ? "GIF" : "unknown" };
  }

  // ZIP / APK: PK (0x50, 0x4B, 0x03, 0x04)
  if (normMime === "application/zip" || normMime === "application/vnd.android.package-archive") {
    const isZip =
      bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    return { isValid: isZip, detectedFormat: isZip ? "ZIP" : "unknown" };
  }

  return { isValid: true };
}

/**
 * Re-validates destination filename against path traversal, control chars, and reserved names
 */
export function revalidateDestinationFilename(filename: string): {
  isValid: boolean;
  sanitizedFilename: string;
  failureReason?: IntegrityFailureReason;
} {
  if (!filename || typeof filename !== "string" || !filename.trim()) {
    return {
      isValid: false,
      sanitizedFilename: `download_${Date.now()}.bin`,
      failureReason: IntegrityFailureReason.PATH_TRAVERSAL_DETECTED,
    };
  }

  const raw = filename.trim();

  // Check null bytes
  if (raw.includes("\0") || raw.includes("%00")) {
    return {
      isValid: false,
      sanitizedFilename: raw.replace(/\0|%00/g, ""),
      failureReason: IntegrityFailureReason.NULL_BYTE_DETECTED,
    };
  }

  // Check path traversal
  if (
    raw.includes("..") ||
    raw.includes("/") ||
    raw.includes("\\") ||
    raw.includes("%2e%2e")
  ) {
    let sanitized = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
    while (sanitized.includes("..")) {
      sanitized = sanitized.replace(/\.\./g, "");
    }
    sanitized = sanitized.replace(/[\/\\]+/g, "_");
    return {
      isValid: false,
      sanitizedFilename: sanitized || `file_${Date.now()}.bin`,
      failureReason: IntegrityFailureReason.PATH_TRAVERSAL_DETECTED,
    };
  }

  // Check Windows reserved names
  const lastDot = raw.lastIndexOf(".");
  const baseName = lastDot > 0 ? raw.substring(0, lastDot) : raw;
  if (WINDOWS_RESERVED.has(baseName.toUpperCase())) {
    return {
      isValid: false,
      sanitizedFilename: `file_${raw}`,
      failureReason: IntegrityFailureReason.RESERVED_DEVICE_NAME,
    };
  }

  return {
    isValid: true,
    sanitizedFilename: raw,
  };
}

/**
 * Non-destructive filename collision resolver
 */
export function resolveFilenameCollision(
  desiredFilename: string,
  existingFilenames: Set<string>
): {
  resolvedFilename: string;
  wasCollision: boolean;
  index?: number;
} {
  if (!existingFilenames.has(desiredFilename.toLowerCase())) {
    return {
      resolvedFilename: desiredFilename,
      wasCollision: false,
    };
  }

  const lastDot = desiredFilename.lastIndexOf(".");
  const base = lastDot > 0 ? desiredFilename.substring(0, lastDot) : desiredFilename;
  const ext = lastDot > 0 ? desiredFilename.substring(lastDot) : "";

  let counter = 1;
  let candidate = `${base} (${counter})${ext}`;

  while (existingFilenames.has(candidate.toLowerCase())) {
    counter++;
    candidate = `${base} (${counter})${ext}`;
  }

  return {
    resolvedFilename: candidate,
    wasCollision: true,
    index: counter,
  };
}

/**
 * Creates the Android WebView Download Completion Integrity Manager
 */
export function createAndroidWebViewDownloadCompletionIntegrityManager(): AndroidWebViewDownloadCompletionIntegrityManager {
  // Keyed by stagingId
  const stagingRecords = new Map<string, TemporaryStagingRecord>();

  // Map downloadId -> stagingId
  const downloadToStagingMap = new Map<string, string>();

  // Keyed by downloadId
  const finalizedRecords = new Map<string, FinalizedDownloadRecord>();

  // Terminal state tracking for cancelled, failed, or interrupted downloads: keyed by downloadId
  const terminalStateRecords = new Map<string, TerminalDownloadStateRecord>();

  // Registry of existing finalized filenames to prevent collisions
  const existingFinalizedFilenames = new Set<string>();

  function createStagingDownload(params: {
    downloadId: string;
    tabId: string;
    destinationFilename: string;
    expectedBytes?: number;
    mimeType?: string;
    isPrivate?: boolean;
  }): { stagingId: string; tempFilename: string } {
    // Bounded memory defense: enforce maximum concurrent staging records
    if (stagingRecords.size >= MAX_ACTIVE_STAGING_RECORDS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [sId, rec] of stagingRecords.entries()) {
        if (rec.lastChunkAt < oldestTime) {
          oldestTime = rec.lastChunkAt;
          oldestId = sId;
        }
      }
      if (oldestId) {
        failAndCleanupStaging(
          oldestId,
          IntegrityFailureReason.STREAM_BUFFER_EXCEEDED,
          "Evicted oldest inactive staging download to enforce memory bounds"
        );
      }
    }

    const stagingId = `stg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sanitizedCheck = revalidateDestinationFilename(params.destinationFilename);
    const destName = sanitizedCheck.sanitizedFilename;

    // Temporary staging name format: <cleanName>.<downloadId>.part
    const tempFilename = `${destName}.${params.downloadId}.part`;

    const record: TemporaryStagingRecord = {
      stagingId,
      downloadId: params.downloadId,
      tabId: params.tabId,
      tempFilename,
      destinationFilename: destName,
      expectedBytes:
        typeof params.expectedBytes === "number" && params.expectedBytes >= 0
          ? params.expectedBytes
          : -1,
      receivedBytes: 0,
      mimeType: params.mimeType || "application/octet-stream",
      isPrivate: params.isPrivate ?? false,
      status: StagingFileStatus.STAGING,
      createdAt: Date.now(),
      lastChunkAt: Date.now(),
      chunkCount: 0,
      hasMagicBytesVerified: false,
      isFinalChunkReceived: false,
    };

    stagingRecords.set(stagingId, record);
    downloadToStagingMap.set(params.downloadId, stagingId);
    terminalStateRecords.delete(params.downloadId);

    return { stagingId, tempFilename };
  }

  function appendChunk(params: StagingChunkParams): {
    success: boolean;
    receivedBytes: number;
    expectedBytes: number;
    isComplete: boolean;
    error?: string;
  } {
    const record = stagingRecords.get(params.stagingId);
    if (!record) {
      return {
        success: false,
        receivedBytes: 0,
        expectedBytes: -1,
        isComplete: false,
        error: "Staging download record not found",
      };
    }

    if (terminalStateRecords.has(record.downloadId)) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: false,
        error: `Cannot append chunks: download was terminated as ${terminalStateRecords.get(record.downloadId)?.status}`,
      };
    }

    if (record.tabId !== params.tabId) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: false,
        error: "Tab mismatch: cannot append chunks from different tab",
      };
    }

    if (record.status !== StagingFileStatus.STAGING) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: false,
        error: `Invalid staging status: ${record.status}`,
      };
    }

    // 1. Validate chunk size bounds & finite number
    if (typeof params.chunkSize !== "number" || !Number.isFinite(params.chunkSize) || params.chunkSize < 0) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: false,
        error: "Invalid chunk size: must be a non-negative finite number",
      };
    }

    // Bounded buffer enforcement: reject chunk exceeding 32MB single-buffer threshold
    if (params.chunkSize > MAX_ALLOWED_CHUNK_SIZE_BYTES) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: false,
        error: `Chunk size exceeds bounded memory buffer limit of 32MB: ${params.chunkSize} bytes`,
      };
    }

    // 2. Reject appending if final chunk was already received
    if (record.isFinalChunkReceived) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: true,
        error: "Cannot append chunk: stream already received final chunk",
      };
    }

    // 3. Optional chunk sequence verification
    if (params.chunkIndex !== undefined && params.chunkIndex !== record.chunkCount) {
      return {
        success: false,
        receivedBytes: record.receivedBytes,
        expectedBytes: record.expectedBytes,
        isComplete: false,
        error: `Out-of-order chunk: expected index ${record.chunkCount}, received ${params.chunkIndex}`,
      };
    }

    record.receivedBytes += params.chunkSize;
    record.chunkCount += 1;
    record.lastChunkAt = Date.now();
    if (params.isFinalChunk === true) {
      record.isFinalChunkReceived = true;
    }

    // Capture initial sample header for magic byte verification (bounded memory: max 64 bytes)
    if (params.chunkSample && !record.sampleHeader) {
      record.sampleHeader = params.chunkSample.slice(0, MAX_SAMPLE_HEADER_BYTES);
    }

    // A streaming download is COMPLETE ONLY when the valid final chunk has been received
    // and if expectedBytes was set (>0), total receivedBytes matches or exceeds expectedBytes.
    const isComplete =
      params.isFinalChunk === true &&
      (record.expectedBytes <= 0 || record.receivedBytes >= record.expectedBytes);

    return {
      success: true,
      receivedBytes: record.receivedBytes,
      expectedBytes: record.expectedBytes,
      isComplete,
    };
  }

  function validateMimeAndExtensionConsistency(
    filename: string,
    mimeType: string,
    sampleHeader?: Uint8Array | number[]
  ): {
    isValid: boolean;
    normalizedExtension: string;
    correctedFilename?: string;
    failureReason?: IntegrityFailureReason;
    warning?: string;
  } {
    const lastDot = filename.lastIndexOf(".");
    const ext = lastDot > 0 ? filename.substring(lastDot).toLowerCase() : "";
    const normMime = (mimeType || "application/octet-stream").toLowerCase().split(";")[0].trim();

    // Verify magic bytes if sample header available
    if (sampleHeader) {
      const magicCheck = verifyMagicByteSignature(sampleHeader, normMime);
      if (!magicCheck.isValid) {
        return {
          isValid: false,
          normalizedExtension: ext,
          failureReason: IntegrityFailureReason.MAGIC_BYTE_MISMATCH,
          warning: `File header magic bytes do not match expected MIME format ${normMime}`,
        };
      }
    }

    // Check extension against known MIME extensions
    const expectedExts = KNOWN_MIME_EXTENSIONS[normMime];
    if (expectedExts && expectedExts.length > 0) {
      if (ext && !expectedExts.includes(ext)) {
        // Mismatch detected: suggest corrected extension
        const correctedExt = expectedExts[0];
        const base = lastDot > 0 ? filename.substring(0, lastDot) : filename;
        return {
          isValid: true, // Allow with correction/warning
          normalizedExtension: correctedExt,
          correctedFilename: `${base}${correctedExt}`,
          warning: `Extension ${ext} adjusted to ${correctedExt} for MIME ${normMime}`,
        };
      }
    }

    return {
      isValid: true,
      normalizedExtension: ext,
    };
  }

  function finalizeDownload(params: FinalizeDownloadParams): FinalizationResult {
    // Check terminal records first
    const stagingLookup = stagingRecords.get(params.stagingId);
    const downloadIdCandidate = stagingLookup?.downloadId;
    if (downloadIdCandidate && terminalStateRecords.has(downloadIdCandidate)) {
      const term = terminalStateRecords.get(downloadIdCandidate);
      return {
        success: false,
        failureReason: IntegrityFailureReason.STAGING_NOT_FOUND,
        errorMessage: `Cannot finalize download: download was terminated as ${term?.status}`,
      };
    }

    const staging = stagingLookup;
    if (!staging) {
      return {
        success: false,
        failureReason: IntegrityFailureReason.STAGING_NOT_FOUND,
        errorMessage: "Staging record not found",
      };
    }

    // Strict non-staging status check: cancelled, failed, interrupted, or finalized cannot be finalized again
    if (staging.status !== StagingFileStatus.STAGING && staging.status !== StagingFileStatus.VERIFYING) {
      return {
        success: false,
        failureReason: IntegrityFailureReason.STAGING_NOT_FOUND,
        errorMessage: `Cannot finalize download with invalid staging status: ${staging.status}`,
      };
    }

    // 1. Tab verification
    if (staging.tabId !== params.tabId) {
      return {
        success: false,
        failureReason: IntegrityFailureReason.TAB_MISMATCH,
        errorMessage: "Staging tab mismatch",
      };
    }

    // 2. Strict partial download & zero-byte check
    if (staging.receivedBytes <= 0) {
      failAndCleanupStaging(
        staging.stagingId,
        IntegrityFailureReason.ZERO_BYTE_PAYLOAD,
        "Cannot finalize zero-byte download"
      );
      return {
        success: false,
        failureReason: IntegrityFailureReason.ZERO_BYTE_PAYLOAD,
        errorMessage: "Download contains zero bytes",
        cleanedStagingId: staging.stagingId,
      };
    }

    const expected =
      params.expectedContentLength !== undefined && params.expectedContentLength > 0
        ? params.expectedContentLength
        : staging.expectedBytes;

    if (expected > 0 && staging.receivedBytes < expected) {
      failAndCleanupStaging(
        staging.stagingId,
        IntegrityFailureReason.SIZE_MISMATCH_PARTIAL,
        `Partial download detected: received ${staging.receivedBytes} of ${expected} bytes`
      );
      return {
        success: false,
        failureReason: IntegrityFailureReason.SIZE_MISMATCH_PARTIAL,
        errorMessage: `Partial download: ${staging.receivedBytes}/${expected} bytes received`,
        cleanedStagingId: staging.stagingId,
      };
    }

    // Stream finality check: cannot finalize streaming download if valid final chunk was not received
    if (!staging.isFinalChunkReceived) {
      failAndCleanupStaging(
        staging.stagingId,
        IntegrityFailureReason.PREMATURE_EOF,
        "Cannot finalize streaming download: valid final chunk has not been received"
      );
      return {
        success: false,
        failureReason: IntegrityFailureReason.PREMATURE_EOF,
        errorMessage: "Stream incomplete: valid final chunk has not been received",
        cleanedStagingId: staging.stagingId,
      };
    }

    // 3. Re-validate destination filename
    const candidateName = params.destinationFilename || staging.destinationFilename;
    const reval = revalidateDestinationFilename(candidateName);
    let targetName = reval.sanitizedFilename;

    // 4. MIME & Extension Consistency
    const mimeCheck = validateMimeAndExtensionConsistency(
      targetName,
      staging.mimeType,
      staging.sampleHeader
    );
    if (!mimeCheck.isValid) {
      failAndCleanupStaging(
        staging.stagingId,
        mimeCheck.failureReason || IntegrityFailureReason.MIME_EXTENSION_MISMATCH,
        mimeCheck.warning || "MIME/extension integrity validation failed"
      );
      return {
        success: false,
        failureReason: mimeCheck.failureReason || IntegrityFailureReason.MIME_EXTENSION_MISMATCH,
        errorMessage: mimeCheck.warning || "MIME integrity failure",
        cleanedStagingId: staging.stagingId,
      };
    }

    if (mimeCheck.correctedFilename) {
      targetName = mimeCheck.correctedFilename;
    }

    // 5. Collision Avoidance (Non-destructive renaming)
    const collisionResolution = resolveFilenameCollision(
      targetName,
      existingFinalizedFilenames
    );
    const finalFilename = collisionResolution.resolvedFilename;
    existingFinalizedFilenames.add(finalFilename.toLowerCase());

    // 6. Safe Finalization: Commit and clean temporary staging
    staging.status = StagingFileStatus.FINALIZED;

    const lastDot = finalFilename.lastIndexOf(".");
    const ext = lastDot > 0 ? finalFilename.substring(lastDot).toLowerCase() : "";

    const finalizedRecord: FinalizedDownloadRecord = {
      downloadId: staging.downloadId,
      stagingId: staging.stagingId,
      tabId: staging.tabId,
      finalFilename,
      originalFilename: staging.destinationFilename,
      finalSizeBytes: staging.receivedBytes,
      mimeType: staging.mimeType,
      extension: ext,
      isPrivate: staging.isPrivate,
      finalizedAt: Date.now(),
      wasCollisionResolved: collisionResolution.wasCollision,
      collisionIndex: collisionResolution.index,
      storagePath: `/downloads/${staging.isPrivate ? "private" : "public"}/${finalFilename}`,
    };

    finalizedRecords.set(staging.downloadId, finalizedRecord);
    terminalStateRecords.delete(staging.downloadId);

    // Clean staging record from active map
    stagingRecords.delete(staging.stagingId);
    downloadToStagingMap.delete(staging.downloadId);

    return {
      success: true,
      record: finalizedRecord,
      cleanedStagingId: staging.stagingId,
    };
  }

  function cancelAndCleanupStaging(stagingId: string, _reason?: string): { cleaned: boolean } {
    const staging = stagingRecords.get(stagingId);
    if (!staging) return { cleaned: false };

    staging.status = StagingFileStatus.CANCELLED;
    terminalStateRecords.set(staging.downloadId, {
      downloadId: staging.downloadId,
      stagingId,
      tabId: staging.tabId,
      status: StagingFileStatus.CANCELLED,
      reason: _reason || "Download cancelled",
      timestamp: Date.now(),
    });
    finalizedRecords.delete(staging.downloadId);
    stagingRecords.delete(stagingId);
    downloadToStagingMap.delete(staging.downloadId);
    return { cleaned: true };
  }

  function failAndCleanupStaging(
    stagingId: string,
    _reason: IntegrityFailureReason,
    _errorMessage: string
  ): { cleaned: boolean } {
    const staging = stagingRecords.get(stagingId);
    if (!staging) return { cleaned: false };

    staging.status = StagingFileStatus.FAILED;
    terminalStateRecords.set(staging.downloadId, {
      downloadId: staging.downloadId,
      stagingId,
      tabId: staging.tabId,
      status: StagingFileStatus.FAILED,
      reason: _errorMessage || String(_reason),
      timestamp: Date.now(),
    });
    finalizedRecords.delete(staging.downloadId);
    stagingRecords.delete(stagingId);
    downloadToStagingMap.delete(staging.downloadId);
    return { cleaned: true };
  }

  function interruptAndCleanupStaging(stagingId: string, reason?: string): { cleaned: boolean } {
    const staging = stagingRecords.get(stagingId);
    if (!staging) return { cleaned: false };

    staging.status = StagingFileStatus.INTERRUPTED;
    terminalStateRecords.set(staging.downloadId, {
      downloadId: staging.downloadId,
      stagingId,
      tabId: staging.tabId,
      status: StagingFileStatus.INTERRUPTED,
      reason: reason || "Download interrupted",
      timestamp: Date.now(),
    });
    finalizedRecords.delete(staging.downloadId);
    stagingRecords.delete(stagingId);
    downloadToStagingMap.delete(staging.downloadId);
    return { cleaned: true };
  }

  function isDownloadCompleted(downloadId: string): boolean {
    return finalizedRecords.has(downloadId);
  }

  function isDownloadInProgress(downloadId: string): boolean {
    const stgId = downloadToStagingMap.get(downloadId);
    if (!stgId) return false;
    const rec = stagingRecords.get(stgId);
    return !!rec && (rec.status === StagingFileStatus.STAGING || rec.status === StagingFileStatus.VERIFYING);
  }

  function getDownloadCompletionState(
    downloadId: string
  ): "STAGING_IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED" | "INTERRUPTED" | "NOT_FOUND" {
    if (finalizedRecords.has(downloadId)) {
      return "COMPLETED";
    }
    const stgId = downloadToStagingMap.get(downloadId);
    if (stgId) {
      const rec = stagingRecords.get(stgId);
      if (rec && (rec.status === StagingFileStatus.STAGING || rec.status === StagingFileStatus.VERIFYING)) {
        return "STAGING_IN_PROGRESS";
      }
    }
    const term = terminalStateRecords.get(downloadId);
    if (term) {
      return term.status as "CANCELLED" | "FAILED" | "INTERRUPTED";
    }
    return "NOT_FOUND";
  }

  function getTerminalState(downloadId: string): TerminalDownloadStateRecord | null {
    const rec = terminalStateRecords.get(downloadId);
    return rec ? { ...rec } : null;
  }

  function validateCompletionIntegrity(downloadId: string): {
    isValid: boolean;
    state: "STAGING_IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED" | "INTERRUPTED" | "NOT_FOUND";
    record?: FinalizedDownloadRecord;
    error?: string;
  } {
    const state = getDownloadCompletionState(downloadId);
    if (state === "COMPLETED") {
      const fin = finalizedRecords.get(downloadId);
      if (!fin) {
        return { isValid: false, state, error: "Finalized record missing" };
      }
      if (fin.finalSizeBytes <= 0) {
        return { isValid: false, state, error: "Finalized record has zero bytes" };
      }
      if (!fin.finalFilename || fin.finalFilename.includes("..") || fin.finalFilename.includes("\0")) {
        return { isValid: false, state, error: "Finalized record has unsafe filename" };
      }
      return { isValid: true, state, record: { ...fin } };
    }
    return {
      isValid: false,
      state,
      error:
        state === "STAGING_IN_PROGRESS"
          ? "Download is still in staging / in-progress"
          : `Download is in non-completed state: ${state}`,
    };
  }

  function getStagingRecord(stagingId: string): TemporaryStagingRecord | null {
    const rec = stagingRecords.get(stagingId);
    return rec ? { ...rec } : null;
  }

  function getStagingByDownloadId(downloadId: string): TemporaryStagingRecord | null {
    const stgId = downloadToStagingMap.get(downloadId);
    if (!stgId) return null;
    return getStagingRecord(stgId);
  }

  function getFinalizedRecord(downloadId: string): FinalizedDownloadRecord | null {
    const rec = finalizedRecords.get(downloadId);
    return rec ? { ...rec } : null;
  }

  function getFinalizedDownloadsForTab(tabId: string): FinalizedDownloadRecord[] {
    return Array.from(finalizedRecords.values())
      .filter((r) => r.tabId === tabId)
      .map((r) => ({ ...r }));
  }

  function getAllFinalizedDownloads(): FinalizedDownloadRecord[] {
    return Array.from(finalizedRecords.values()).map((r) => ({ ...r }));
  }

  function onTabNavigation(tabId: string): { cleanedStagingCount: number } {
    let count = 0;
    for (const [sId, staging] of Array.from(stagingRecords.entries())) {
      if (staging.tabId === tabId) {
        staging.status = StagingFileStatus.CANCELLED;
        terminalStateRecords.set(staging.downloadId, {
          downloadId: staging.downloadId,
          stagingId: sId,
          tabId,
          status: StagingFileStatus.CANCELLED,
          reason: "Tab navigation cancelled in-flight staging download",
          timestamp: Date.now(),
        });
        stagingRecords.delete(sId);
        downloadToStagingMap.delete(staging.downloadId);
        count++;
      }
    }
    return { cleanedStagingCount: count };
  }

  function onTabClosed(
    tabId: string,
    isPrivate?: boolean
  ): {
    cleanedStagingCount: number;
    cleanedFinalizedCount: number;
  } {
    let cleanedStagingCount = 0;
    let cleanedFinalizedCount = 0;

    // 1. Clean staging downloads for closed tab
    for (const [sId, staging] of Array.from(stagingRecords.entries())) {
      if (staging.tabId === tabId) {
        staging.status = StagingFileStatus.CANCELLED;
        terminalStateRecords.set(staging.downloadId, {
          downloadId: staging.downloadId,
          stagingId: sId,
          tabId,
          status: StagingFileStatus.CANCELLED,
          reason: "Tab closed cancelled in-flight staging download",
          timestamp: Date.now(),
        });
        stagingRecords.delete(sId);
        downloadToStagingMap.delete(staging.downloadId);
        cleanedStagingCount++;
      }
    }

    // 2. If tab was private, completely wipe all finalized download receipts & terminal state for this tab
    if (isPrivate) {
      for (const [dId, fin] of Array.from(finalizedRecords.entries())) {
        if (fin.tabId === tabId || fin.isPrivate) {
          existingFinalizedFilenames.delete(fin.finalFilename.toLowerCase());
          finalizedRecords.delete(dId);
          cleanedFinalizedCount++;
        }
      }
      for (const [dId, term] of Array.from(terminalStateRecords.entries())) {
        if (term.tabId === tabId) {
          terminalStateRecords.delete(dId);
        }
      }
    }

    return { cleanedStagingCount, cleanedFinalizedCount };
  }

  function getStreamBufferMetrics(): StreamBufferMetrics {
    let totalBytes = 0;
    for (const rec of stagingRecords.values()) {
      totalBytes += rec.receivedBytes;
    }
    return {
      activeStreams: stagingRecords.size,
      totalReceivedBytes: totalBytes,
      maxChunkSizeBytes: MAX_ALLOWED_CHUNK_SIZE_BYTES,
      maxSampleHeaderBytes: MAX_SAMPLE_HEADER_BYTES,
      maxActiveStagingRecords: MAX_ACTIVE_STAGING_RECORDS,
      boundedMemoryPolicyEnforced: true,
    };
  }

  function resetAll(): void {
    stagingRecords.clear();
    downloadToStagingMap.clear();
    finalizedRecords.clear();
    existingFinalizedFilenames.clear();
    terminalStateRecords.clear();
  }

  return {
    createStagingDownload,
    appendChunk,
    finalizeDownload,
    cancelAndCleanupStaging,
    failAndCleanupStaging,
    interruptAndCleanupStaging,
    isDownloadCompleted,
    isDownloadInProgress,
    getDownloadCompletionState,
    getTerminalState,
    validateCompletionIntegrity,
    getStreamBufferMetrics,
    getStagingRecord,
    getStagingByDownloadId,
    getFinalizedRecord,
    getFinalizedDownloadsForTab,
    getAllFinalizedDownloads,
    onTabNavigation,
    onTabClosed,
    resolveFilenameCollision,
    validateMimeAndExtensionConsistency,
    revalidateDestinationFilename,
    resetAll,
  };
}

// NATIVE-36 Aliases
export type AndroidWebViewDownloadCompletionAndFileSaveIntegrityManager = AndroidWebViewDownloadCompletionIntegrityManager;
export const createAndroidWebViewDownloadCompletionAndFileSaveIntegrityManager = createAndroidWebViewDownloadCompletionIntegrityManager;

