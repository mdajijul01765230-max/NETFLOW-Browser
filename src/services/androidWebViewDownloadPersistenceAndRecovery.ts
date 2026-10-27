/**
 * NETFLOW Browser V2 — Android WebView Download Persistence & Interrupted-Download Recovery Boundary
 *
 * Implements:
 * 1. Durable Download State Representation: Persists non-private download metadata,
 *    lifecycle states, byte progress, and resumption tokens across app restarts and navigation disruptions.
 * 2. Strict Privacy & Zero Secret Leakage:
 *    - Private-tab downloads are NEVER written to durable storage (strictly in-memory and ephemeral).
 *    - Strips all sensitive tokens, cookies, auth headers, basic-auth credentials, and secrets from URLs.
 * 3. Strict SSRF & Protocol Safety Invariant:
 *    - Enforces existing NATIVE-35 URL sanitization on save and on recovery load.
 *    - Strictly blocks javascript:, file:, data:, blob:, content:, intent:, internal/loopback/metadata addresses.
 * 4. Interrupted-Download Recovery State Machine:
 *    - Evaluates recovery classification: RESUMABLE, NON_RESUMABLE, COMPLETED, FAILED, CORRUPTED.
 *    - Completed downloads are protected from re-downloading (idempotency guard).
 *    - Corrupted or inconsistent persisted records are safely rejected and quarantined/purged.
 * 5. Safe Reconnection Boundary:
 *    - Reconnects persisted state into NATIVE-35 (Lifecycle), NATIVE-36 (Staging), and NATIVE-38 (Resumption).
 *    - Restores in PAUSED / INTERRUPTED state; never triggers automatic unrestricted network requests without context.
 * 6. Zero Privileged JS Bridges, JNI, or Reflection.
 */

import {
  DownloadLifecycleState,
  SafeDownloadRecord,
  validateAndSanitizeDownloadUrl,
  AndroidWebViewDownloadRequestLifecycleManager,
} from "./androidWebViewDownloadRequestLifecycle";

import {
  TemporaryStagingRecord,
  FinalizedDownloadRecord,
  StagingFileStatus,
  AndroidWebViewDownloadCompletionIntegrityManager,
} from "./androidWebViewDownloadCompletionIntegrity";

import {
  ResumptionSession,
  ResumptionState,
  AndroidWebViewDownloadResumptionManager,
} from "./androidWebViewDownloadResumption";

/**
 * Standard recovery states for interrupted or persisted downloads
 */
export enum DownloadRecoveryState {
  RESUMABLE = "RESUMABLE",
  NON_RESUMABLE = "NON_RESUMABLE",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CORRUPTED = "CORRUPTED",
}

/**
 * Reason codes for recovery evaluation or rejection
 */
export enum RecoveryRejectionReason {
  ALREADY_COMPLETED = "ALREADY_COMPLETED",
  CORRUPTED_METADATA = "CORRUPTED_METADATA",
  NEGATIVE_OR_OVERFLOW_BYTES = "NEGATIVE_OR_OVERFLOW_BYTES",
  SSRF_OR_UNSAFE_PROTOCOL = "SSRF_OR_UNSAFE_PROTOCOL",
  PRIVATE_TAB_STATE_EXPUNGED = "PRIVATE_TAB_STATE_EXPUNGED",
  PERMANENTLY_FAILED = "PERMANENTLY_FAILED",
  MISSING_REQUIRED_FIELDS = "MISSING_REQUIRED_FIELDS",
  STORAGE_READ_FAILED = "STORAGE_READ_FAILED",
}

/**
 * Durable persisted download record representation
 */
export interface PersistedDownloadRecord {
  downloadId: string;
  tabId: string;
  safeUrl: string;
  domain: string;
  filename: string;
  sanitizedFilename: string;
  mimeType: string;
  totalBytes: number;
  receivedBytes: number;
  lifecycleState: DownloadLifecycleState;
  stagingStatus?: StagingFileStatus;
  resumptionState?: ResumptionState;
  isResumable: boolean;
  etag?: string;
  lastModified?: string;
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
  interruptedAt?: number;
  failureReason?: string;
  metadataChecksum: string;
}

/**
 * Result of evaluating a persisted download for recovery
 */
export interface RecoveryEvaluationResult {
  downloadId: string;
  recoveryState: DownloadRecoveryState;
  canResume: boolean;
  resumeOffsetBytes: number;
  totalExpectedBytes: number;
  safeUrl: string;
  filename: string;
  etag?: string;
  lastModified?: string;
  rejectionReason?: RecoveryRejectionReason;
  details: string;
}

/**
 * Result of reconnecting an interrupted download to native lifecycle managers
 */
export interface LifecycleReconnectResult {
  success: boolean;
  downloadId: string;
  recoveryState: DownloadRecoveryState;
  reconnectedToLifecycle: boolean;
  reconnectedToStaging: boolean;
  reconnectedToResumption: boolean;
  error?: string;
}

/**
 * Integrity audit report for persisted storage
 */
export interface PersistenceIntegrityReport {
  totalPersisted: number;
  resumableCount: number;
  completedCount: number;
  interruptedCount: number;
  corruptedCount: number;
  purgedCorruptedCount: number;
  timestamp: number;
}

/**
 * Configuration options for Download Persistence Manager
 */
export interface DownloadPersistenceConfig {
  storageKey: string;
  maxPersistedRecords: number;
  allowLocalStorage: boolean;
}

const DEFAULT_CONFIG: DownloadPersistenceConfig = {
  storageKey: "netflow_download_persistence_v1",
  maxPersistedRecords: 100,
  allowLocalStorage: true,
};

/**
 * Computes a lightweight deterministic checksum of critical metadata to detect corruption/tampering
 */
function computeMetadataChecksum(
  downloadId: string,
  safeUrl: string,
  receivedBytes: number,
  totalBytes: number
): string {
  const seed = `${downloadId}:${safeUrl}:${receivedBytes}:${totalBytes}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return `chk_${Math.abs(hash).toString(16)}`;
}

/**
 * Strips any sensitive credentials, tokens, basic auth, or hash fragments from a URL
 */
export function sanitizeUrlForDurablePersistence(rawUrl: string): {
  isValid: boolean;
  safeUrl?: string;
  domain?: string;
  error?: string;
} {
  const validation = validateAndSanitizeDownloadUrl(rawUrl);
  if (!validation.isValid || !validation.sanitizedUrl) {
    return {
      isValid: false,
      error: validation.errorMessage || "URL failed security validation",
    };
  }

  try {
    const u = new URL(validation.sanitizedUrl);

    // Strip Basic Auth userinfo
    u.username = "";
    u.password = "";

    // Strip fragment
    u.hash = "";

    // Strip sensitive OAuth, token, session, auth query parameters
    const sensitiveTokens = [
      "token",
      "access_token",
      "id_token",
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

    const toDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveTokens.some((tok) => lowerKey.includes(tok))) {
        toDelete.push(key);
      }
    });
    toDelete.forEach((k) => u.searchParams.delete(k));

    return {
      isValid: true,
      safeUrl: u.href,
      domain: u.hostname,
    };
  } catch {
    return {
      isValid: false,
      error: "Malformed URL during persistence sanitization",
    };
  }
}

/**
 * Validates the schema and byte integrity of a persisted record
 */
export function validatePersistedRecordIntegrity(record: any): {
  isValid: boolean;
  rejectionReason?: RecoveryRejectionReason;
  errorMessage?: string;
} {
  if (!record || typeof record !== "object") {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.CORRUPTED_METADATA,
      errorMessage: "Record is not a valid object",
    };
  }

  // 1. Mandatory Identity Fields
  if (
    typeof record.downloadId !== "string" ||
    !record.downloadId.trim() ||
    typeof record.tabId !== "string"
  ) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.MISSING_REQUIRED_FIELDS,
      errorMessage: "Missing downloadId or tabId",
    };
  }

  // 2. Strict Privacy Barrier: Private tab downloads are NEVER valid in durable storage
  if (record.isPrivate === true) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.PRIVATE_TAB_STATE_EXPUNGED,
      errorMessage: "Private tab downloads must never be persisted",
    };
  }

  // 3. SSRF & Safe Scheme Check
  const urlCheck = sanitizeUrlForDurablePersistence(record.safeUrl);
  if (!urlCheck.isValid || !urlCheck.safeUrl) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.SSRF_OR_UNSAFE_PROTOCOL,
      errorMessage: urlCheck.error || "Unsafe URL scheme or SSRF target in persisted record",
    };
  }

  // 4. Byte Counter Integrity Invariants
  const received = Number(record.receivedBytes);
  const total = Number(record.totalBytes);

  if (isNaN(received) || received < 0) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.NEGATIVE_OR_OVERFLOW_BYTES,
      errorMessage: "Received bytes counter is negative or NaN",
    };
  }

  if (isNaN(total)) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.CORRUPTED_METADATA,
      errorMessage: "Total bytes is NaN",
    };
  }

  if (total > 0 && received > total) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.NEGATIVE_OR_OVERFLOW_BYTES,
      errorMessage: "Received bytes exceed total bytes",
    };
  }

  // 5. Checksum verification
  const expectedChk = computeMetadataChecksum(
    record.downloadId,
    record.safeUrl,
    received,
    total
  );
  if (record.metadataChecksum && record.metadataChecksum !== expectedChk) {
    return {
      isValid: false,
      rejectionReason: RecoveryRejectionReason.CORRUPTED_METADATA,
      errorMessage: "Metadata checksum mismatch (potential tampering or corruption)",
    };
  }

  return { isValid: true };
}

/**
 * Android WebView Download Persistence & Recovery Manager
 */
export interface AndroidWebViewDownloadPersistenceManager {
  // Persistence operations
  persistDownload: (
    record: SafeDownloadRecord,
    staging?: TemporaryStagingRecord | null,
    resumption?: ResumptionSession | null
  ) => boolean;

  updateDownloadProgress: (
    downloadId: string,
    receivedBytes: number,
    totalBytes?: number,
    activeState?: DownloadLifecycleState
  ) => boolean;

  markDownloadCompleted: (
    downloadId: string,
    finalRecord?: FinalizedDownloadRecord | null
  ) => boolean;

  markDownloadInterrupted: (downloadId: string, reason?: string) => boolean;

  markDownloadFailed: (downloadId: string, reason: string) => boolean;

  removePersistedDownload: (downloadId: string) => boolean;

  // Recovery operations
  loadPersistedDownloads: () => PersistedDownloadRecord[];

  getPersistedDownload: (downloadId: string) => PersistedDownloadRecord | null;

  evaluateRecovery: (downloadId: string) => RecoveryEvaluationResult;

  reconnectToLifecycle: (
    downloadId: string,
    lifecycleMgr: AndroidWebViewDownloadRequestLifecycleManager,
    stagingMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    resumptionMgr: AndroidWebViewDownloadResumptionManager
  ) => LifecycleReconnectResult;

  // Maintenance & Auditing
  auditPersistenceIntegrity: () => PersistenceIntegrityReport;

  purgeCorruptedRecords: () => number;

  clearAllNonPrivatePersistedRecords: () => void;
}

/**
 * Creates the Android WebView Download Persistence & Interrupted Recovery Manager
 */
export function createAndroidWebViewDownloadPersistenceManager(
  configOverrides?: Partial<DownloadPersistenceConfig>
): AndroidWebViewDownloadPersistenceManager {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const inMemoryStore = new Map<string, PersistedDownloadRecord>();

  // Safe read from durable storage
  const readStorage = (): Map<string, PersistedDownloadRecord> => {
    const records = new Map<string, PersistedDownloadRecord>();

    // Load from in-memory fallback first
    inMemoryStore.forEach((v, k) => records.set(k, { ...v }));

    if (!config.allowLocalStorage || typeof window === "undefined" || !window.localStorage) {
      return records;
    }

    try {
      const raw = window.localStorage.getItem(config.storageKey);
      if (!raw) return records;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return records;

      for (const item of parsed) {
        const integrity = validatePersistedRecordIntegrity(item);
        if (integrity.isValid && item.downloadId) {
          records.set(item.downloadId, item);
        }
      }
    } catch (e) {
      console.warn("[DownloadPersistence] Failed to read from durable localStorage:", e);
    }

    return records;
  };

  // Safe write to durable storage
  const writeStorage = (records: Map<string, PersistedDownloadRecord>) => {
    // Keep in-memory mirror up to date
    inMemoryStore.clear();
    records.forEach((v, k) => inMemoryStore.set(k, { ...v }));

    if (!config.allowLocalStorage || typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      // Exclude private tab downloads strictly and enforce max record boundary
      const cleanList = Array.from(records.values())
        .filter((r) => !r.isPrivate)
        .slice(-config.maxPersistedRecords);

      window.localStorage.setItem(config.storageKey, JSON.stringify(cleanList));
    } catch (e) {
      console.warn("[DownloadPersistence] Failed to write to durable localStorage:", e);
    }
  };

  const persistDownload = (
    record: SafeDownloadRecord,
    staging?: TemporaryStagingRecord | null,
    resumption?: ResumptionSession | null
  ): boolean => {
    // 1. Strict Privacy Invariant: Private tab downloads are NEVER persisted
    if (record.isPrivate) {
      return false;
    }

    // 2. Strict SSRF & Credential Sanitization
    const urlSanitization = sanitizeUrlForDurablePersistence(record.sourceUrl);
    if (!urlSanitization.isValid || !urlSanitization.safeUrl) {
      return false;
    }

    const received = Math.max(0, record.progress?.bytesDownloaded || staging?.receivedBytes || 0);
    const total = Math.max(-1, record.totalBytes || staging?.expectedBytes || -1);

    const now = Date.now();
    const persisted: PersistedDownloadRecord = {
      downloadId: record.downloadId,
      tabId: record.tabId,
      safeUrl: urlSanitization.safeUrl,
      domain: urlSanitization.domain || record.domain,
      filename: record.filename,
      sanitizedFilename: record.sanitizedFilename,
      mimeType: record.mimeType,
      totalBytes: total,
      receivedBytes: received,
      lifecycleState: record.state,
      stagingStatus: staging?.status,
      resumptionState: resumption?.state,
      isResumable: Boolean(
        record.state !== DownloadLifecycleState.COMPLETED &&
          record.state !== DownloadLifecycleState.FAILED &&
          record.state !== DownloadLifecycleState.BLOCKED_SECURITY &&
          !record.isDangerousExtension
      ),
      etag: resumption?.etag,
      lastModified: resumption?.lastModified,
      isPrivate: false,
      createdAt: record.startTime || now,
      updatedAt: now,
      failureReason: record.errorMessage,
      metadataChecksum: computeMetadataChecksum(
        record.downloadId,
        urlSanitization.safeUrl,
        received,
        total
      ),
    };

    const store = readStorage();
    store.set(persisted.downloadId, persisted);
    writeStorage(store);
    return true;
  };

  const updateDownloadProgress = (
    downloadId: string,
    receivedBytes: number,
    totalBytes?: number,
    activeState?: DownloadLifecycleState
  ): boolean => {
    const store = readStorage();
    const existing = store.get(downloadId);
    if (!existing || existing.isPrivate) {
      return false;
    }

    // Protection: Completed downloads must not have their bytes tampered with
    if (existing.lifecycleState === DownloadLifecycleState.COMPLETED) {
      return false;
    }

    const validReceived = Math.max(0, receivedBytes);
    const validTotal = totalBytes !== undefined && totalBytes > 0 ? totalBytes : existing.totalBytes;

    existing.receivedBytes = validReceived;
    existing.totalBytes = validTotal;
    if (activeState) {
      existing.lifecycleState = activeState;
      if (activeState === DownloadLifecycleState.DOWNLOADING) {
        existing.failureReason = undefined;
      }
    }
    existing.updatedAt = Date.now();
    existing.metadataChecksum = computeMetadataChecksum(
      existing.downloadId,
      existing.safeUrl,
      validReceived,
      validTotal
    );

    store.set(downloadId, existing);
    writeStorage(store);
    return true;
  };

  const markDownloadCompleted = (
    downloadId: string,
    finalRecord?: FinalizedDownloadRecord | null
  ): boolean => {
    const store = readStorage();
    const existing = store.get(downloadId);
    if (!existing || existing.isPrivate) {
      return false;
    }

    const finalBytes = finalRecord?.finalSizeBytes || existing.receivedBytes;
    existing.lifecycleState = DownloadLifecycleState.COMPLETED;
    existing.stagingStatus = StagingFileStatus.FINALIZED;
    existing.resumptionState = ResumptionState.COMPLETED;
    existing.receivedBytes = finalBytes;
    existing.totalBytes = finalBytes;
    existing.isResumable = false;
    existing.updatedAt = Date.now();
    existing.metadataChecksum = computeMetadataChecksum(
      existing.downloadId,
      existing.safeUrl,
      finalBytes,
      finalBytes
    );

    store.set(downloadId, existing);
    writeStorage(store);
    return true;
  };

  const markDownloadInterrupted = (downloadId: string, reason?: string): boolean => {
    const store = readStorage();
    const existing = store.get(downloadId);
    if (!existing || existing.isPrivate) {
      return false;
    }

    // Protection: Never mark an already completed download as interrupted
    if (existing.lifecycleState === DownloadLifecycleState.COMPLETED) {
      return false;
    }

    existing.lifecycleState = DownloadLifecycleState.PAUSED;
    existing.stagingStatus = StagingFileStatus.INTERRUPTED;
    existing.resumptionState = ResumptionState.PAUSED;
    existing.interruptedAt = Date.now();
    existing.updatedAt = Date.now();
    existing.failureReason = reason || "Application lifecycle or network interruption";
    existing.isResumable = true;

    store.set(downloadId, existing);
    writeStorage(store);
    return true;
  };

  const markDownloadFailed = (downloadId: string, reason: string): boolean => {
    const store = readStorage();
    const existing = store.get(downloadId);
    if (!existing || existing.isPrivate) {
      return false;
    }

    existing.lifecycleState = DownloadLifecycleState.FAILED;
    existing.stagingStatus = StagingFileStatus.FAILED;
    existing.resumptionState = ResumptionState.FAILED;
    existing.isResumable = false;
    existing.failureReason = reason;
    existing.updatedAt = Date.now();

    store.set(downloadId, existing);
    writeStorage(store);
    return true;
  };

  const removePersistedDownload = (downloadId: string): boolean => {
    const store = readStorage();
    const existed = store.delete(downloadId);
    if (existed) {
      writeStorage(store);
    }
    return existed;
  };

  const loadPersistedDownloads = (): PersistedDownloadRecord[] => {
    return Array.from(readStorage().values());
  };

  const getPersistedDownload = (downloadId: string): PersistedDownloadRecord | null => {
    const store = readStorage();
    return store.get(downloadId) || null;
  };

  const evaluateRecovery = (downloadId: string): RecoveryEvaluationResult => {
    const record = getPersistedDownload(downloadId);
    if (!record) {
      return {
        downloadId,
        recoveryState: DownloadRecoveryState.CORRUPTED,
        canResume: false,
        resumeOffsetBytes: 0,
        totalExpectedBytes: 0,
        safeUrl: "",
        filename: "",
        rejectionReason: RecoveryRejectionReason.CORRUPTED_METADATA,
        details: "Download record not found in persistence store",
      };
    }

    // 1. Validate Schema & Integrity
    const integrity = validatePersistedRecordIntegrity(record);
    if (!integrity.isValid) {
      return {
        downloadId,
        recoveryState: DownloadRecoveryState.CORRUPTED,
        canResume: false,
        resumeOffsetBytes: 0,
        totalExpectedBytes: 0,
        safeUrl: record.safeUrl || "",
        filename: record.filename || "",
        rejectionReason: integrity.rejectionReason,
        details: integrity.errorMessage || "Record failed integrity validation",
      };
    }

    // 2. Completed State Protection (Invariant #7: Completed download cannot be restarted)
    if (
      record.lifecycleState === DownloadLifecycleState.COMPLETED ||
      record.stagingStatus === StagingFileStatus.FINALIZED ||
      record.resumptionState === ResumptionState.COMPLETED
    ) {
      return {
        downloadId,
        recoveryState: DownloadRecoveryState.COMPLETED,
        canResume: false,
        resumeOffsetBytes: record.receivedBytes,
        totalExpectedBytes: record.totalBytes,
        safeUrl: record.safeUrl,
        filename: record.filename,
        rejectionReason: RecoveryRejectionReason.ALREADY_COMPLETED,
        details: "Download is already successfully completed and finalized",
      };
    }

    // 3. Failed State
    if (
      record.lifecycleState === DownloadLifecycleState.FAILED ||
      record.lifecycleState === DownloadLifecycleState.BLOCKED_SECURITY ||
      record.stagingStatus === StagingFileStatus.FAILED
    ) {
      return {
        downloadId,
        recoveryState: DownloadRecoveryState.FAILED,
        canResume: false,
        resumeOffsetBytes: 0,
        totalExpectedBytes: record.totalBytes,
        safeUrl: record.safeUrl,
        filename: record.filename,
        rejectionReason: RecoveryRejectionReason.PERMANENTLY_FAILED,
        details: record.failureReason || "Download previously terminated with permanent failure",
      };
    }

    // 4. Resumable State
    if (record.isResumable && record.receivedBytes > 0) {
      return {
        downloadId,
        recoveryState: DownloadRecoveryState.RESUMABLE,
        canResume: true,
        resumeOffsetBytes: record.receivedBytes,
        totalExpectedBytes: record.totalBytes,
        safeUrl: record.safeUrl,
        filename: record.filename,
        etag: record.etag,
        lastModified: record.lastModified,
        details: `Download is resumable from byte offset ${record.receivedBytes}`,
      };
    }

    // 5. Non-resumable (requires restart from byte 0)
    return {
      downloadId,
      recoveryState: DownloadRecoveryState.NON_RESUMABLE,
      canResume: false,
      resumeOffsetBytes: 0,
      totalExpectedBytes: record.totalBytes,
      safeUrl: record.safeUrl,
      filename: record.filename,
      details: "Download is interrupted but requires restarting from byte 0",
    };
  };

  const reconnectToLifecycle = (
    downloadId: string,
    lifecycleMgr: AndroidWebViewDownloadRequestLifecycleManager,
    stagingMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    resumptionMgr: AndroidWebViewDownloadResumptionManager
  ): LifecycleReconnectResult => {
    const evaluation = evaluateRecovery(downloadId);

    // 1. Completed download guard
    if (evaluation.recoveryState === DownloadRecoveryState.COMPLETED) {
      return {
        success: false,
        downloadId,
        recoveryState: DownloadRecoveryState.COMPLETED,
        reconnectedToLifecycle: false,
        reconnectedToStaging: false,
        reconnectedToResumption: false,
        error: "Cannot reconnect: download is already completed",
      };
    }

    // 2. Corrupted record guard
    if (evaluation.recoveryState === DownloadRecoveryState.CORRUPTED) {
      return {
        success: false,
        downloadId,
        recoveryState: DownloadRecoveryState.CORRUPTED,
        reconnectedToLifecycle: false,
        reconnectedToStaging: false,
        reconnectedToResumption: false,
        error: evaluation.details,
      };
    }

    const record = getPersistedDownload(downloadId);
    if (!record) {
      return {
        success: false,
        downloadId,
        recoveryState: DownloadRecoveryState.FAILED,
        reconnectedToLifecycle: false,
        reconnectedToStaging: false,
        reconnectedToResumption: false,
        error: "Persisted record disappeared during reconnection",
      };
    }

    let reconnectedLifecycle = false;
    let reconnectedStaging = false;
    let reconnectedResumption = false;

    try {
      // Step A: Reconnect to Staging Manager
      const existingStaging = stagingMgr.getStagingByDownloadId(downloadId);
      if (!existingStaging) {
        stagingMgr.createStagingDownload({
          downloadId: record.downloadId,
          tabId: record.tabId,
          destinationFilename: record.sanitizedFilename || record.filename,
          expectedBytes: record.totalBytes > 0 ? record.totalBytes : undefined,
          mimeType: record.mimeType,
          isPrivate: false,
        });

        // Advance staging buffer to preserved offset if resumable
        if (evaluation.canResume && evaluation.resumeOffsetBytes > 0) {
          const stg = stagingMgr.getStagingByDownloadId(downloadId);
          if (stg) {
            stagingMgr.appendChunk({
              stagingId: stg.stagingId,
              tabId: stg.tabId,
              chunkSize: evaluation.resumeOffsetBytes,
              isFinalChunk: false,
            });
          }
        }
      }
      reconnectedStaging = true;

      // Step B: Reconnect to Lifecycle Manager in PAUSED state
      const existingDl = lifecycleMgr.getDownloadRecord(downloadId);
      if (!existingDl) {
        lifecycleMgr.handleDownloadRequest({
          url: record.safeUrl,
          tabId: record.tabId,
          suggestedFilename: record.filename,
          mimeType: record.mimeType,
          contentLength: record.totalBytes > 0 ? record.totalBytes : undefined,
          isPrivate: false,
        });
      }
      lifecycleMgr.pauseDownload(downloadId);
      reconnectedLifecycle = true;

      // Step C: Reconnect to Resumption Manager
      const resumptionSession = resumptionMgr.getResumptionSession(downloadId);
      if (!resumptionSession && evaluation.canResume) {
        resumptionMgr.pauseDownload(downloadId, record.tabId, stagingMgr, lifecycleMgr);
      }
      reconnectedResumption = true;

      return {
        success: true,
        downloadId,
        recoveryState: evaluation.recoveryState,
        reconnectedToLifecycle: reconnectedLifecycle,
        reconnectedToStaging: reconnectedStaging,
        reconnectedToResumption: reconnectedResumption,
      };
    } catch (err: any) {
      return {
        success: false,
        downloadId,
        recoveryState: evaluation.recoveryState,
        reconnectedToLifecycle: reconnectedLifecycle,
        reconnectedToStaging: reconnectedStaging,
        reconnectedToResumption: reconnectedResumption,
        error: `Reconnection failed: ${err?.message || "Unknown error"}`,
      };
    }
  };

  const auditPersistenceIntegrity = (): PersistenceIntegrityReport => {
    const store = readStorage();
    let resumable = 0;
    let completed = 0;
    let interrupted = 0;
    let corrupted = 0;

    store.forEach((record) => {
      const integrity = validatePersistedRecordIntegrity(record);
      if (!integrity.isValid) {
        corrupted++;
      } else if (record.lifecycleState === DownloadLifecycleState.COMPLETED) {
        completed++;
      } else if (record.isResumable) {
        resumable++;
      } else {
        interrupted++;
      }
    });

    return {
      totalPersisted: store.size,
      resumableCount: resumable,
      completedCount: completed,
      interruptedCount: interrupted,
      corruptedCount: corrupted,
      purgedCorruptedCount: 0,
      timestamp: Date.now(),
    };
  };

  const purgeCorruptedRecords = (): number => {
    const store = readStorage();
    let purged = 0;

    const toDelete: string[] = [];
    store.forEach((record, id) => {
      const integrity = validatePersistedRecordIntegrity(record);
      if (!integrity.isValid) {
        toDelete.push(id);
      }
    });

    toDelete.forEach((id) => {
      store.delete(id);
      purged++;
    });

    if (purged > 0) {
      writeStorage(store);
    }
    return purged;
  };

  const clearAllNonPrivatePersistedRecords = (): void => {
    inMemoryStore.clear();
    if (config.allowLocalStorage && typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(config.storageKey);
      } catch (e) {
        console.warn("[DownloadPersistence] Failed to clear localStorage:", e);
      }
    }
  };

  return {
    persistDownload,
    updateDownloadProgress,
    markDownloadCompleted,
    markDownloadInterrupted,
    markDownloadFailed,
    removePersistedDownload,
    loadPersistedDownloads,
    getPersistedDownload,
    evaluateRecovery,
    reconnectToLifecycle,
    auditPersistenceIntegrity,
    purgeCorruptedRecords,
    clearAllNonPrivatePersistedRecords,
  };
}
