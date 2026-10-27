/**
 * Android WebView Download Resumption & HTTP Range Boundary (NETFLOW-V2-NATIVE-38)
 *
 * Implements:
 * - HTTP Range (RFC 7233 / RFC 9110) request synthesis: "Range: bytes={offset}-"
 * - Server capability & header validation (Accept-Ranges: bytes, Content-Range, ETag, Last-Modified)
 * - Conditional validator negotiation via "If-Range" (ETag / Last-Modified verification)
 * - Server response classification:
 *   - HTTP 206 Partial Content: Valid partial range resumption from staging byte offset
 *   - HTTP 200 OK: Range header ignored / unsupported; triggers clean buffer reset & restart from byte 0
 *   - HTTP 416 Range Not Satisfiable: Offset out of bounds; triggers safe reset & recovery
 *   - HTTP 412 Precondition Failed / ETag Mismatch: Remote resource mutated; purges corrupt partial file & restarts
 * - Resumption lifecycle state machine:
 *   IDLE -> DOWNLOADING -> PAUSED -> RESUMING -> STREAMING -> COMPLETED / RESTARTING / FAILED / CANCELLED
 * - Monotonic resumption epoch barrier protecting against stale network chunks & out-of-order responses
 * - Per-tab isolation & automatic private-tab cleanup without cross-tab or persistent storage leaks
 * - Direct compatibility with NATIVE-37 (Audit), NATIVE-36 (Staging), NATIVE-35 (Lifecycle), and NATIVE-31 (Page Safety)
 * - Strict Invariant: No privileged JS bridges, JNI, or reflection.
 */

import {
  AndroidWebViewDownloadCompletionIntegrityManager,
  TemporaryStagingRecord,
  StagingFileStatus,
} from "./androidWebViewDownloadCompletionIntegrity";

import {
  AndroidWebViewDownloadRequestLifecycleManager,
  DownloadLifecycleState,
} from "./androidWebViewDownloadRequestLifecycle";

/**
 * Lifecycle interface for pause/resume compatibility
 */
export interface ResumptionCapableLifecycleManager
  extends AndroidWebViewDownloadRequestLifecycleManager {
  pauseDownload: (downloadId: string) => boolean;
  resumeDownload: (downloadId: string) => boolean;
}

export enum ResumptionState {
  IDLE = "IDLE",
  DOWNLOADING = "DOWNLOADING",
  PAUSED = "PAUSED",
  RESUMING = "RESUMING",
  STREAMING = "STREAMING",
  RESTARTING = "RESTARTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum RangeResponseClassification {
  PARTIAL_CONTENT_206 = "PARTIAL_CONTENT_206",
  FULL_RELOAD_200 = "FULL_RELOAD_200",
  RANGE_NOT_SATISFIABLE_416 = "RANGE_NOT_SATISFIABLE_416",
  RESOURCE_MUTATED_412 = "RESOURCE_MUTATED_412",
  SERVER_ERROR = "SERVER_ERROR",
}

export enum ResumptionRejectionReason {
  DOWNLOAD_NOT_PAUSED = "DOWNLOAD_NOT_PAUSED",
  STALE_RESUMPTION_EPOCH = "STALE_RESUMPTION_EPOCH",
  STAGING_NOT_FOUND = "STAGING_NOT_FOUND",
  TAB_MISMATCH = "TAB_MISMATCH",
  MAX_ATTEMPTS_EXCEEDED = "MAX_ATTEMPTS_EXCEEDED",
  ALREADY_COMPLETED = "ALREADY_COMPLETED",
  INVALID_OFFSET = "INVALID_OFFSET",
}

export interface RangeRequestHeaders {
  rangeHeader: string;
  ifRangeHeader?: string;
  acceptRangesHeaderExpected: string;
}

export interface ResumptionSession {
  downloadId: string;
  stagingId: string;
  tabId: string;
  isPrivate: boolean;
  state: ResumptionState;
  resumptionEpoch: number;
  resumeOffsetBytes: number;
  totalExpectedBytes: number;
  etag?: string;
  lastModified?: string;
  resumeAttempts: number;
  maxResumeAttempts: number;
  createdAt: number;
  lastResumedAt?: number;
  lastError?: string;
}

export interface ChunkAppendResult {
  accepted: boolean;
  receivedBytes: number;
  expectedBytes: number;
  isComplete: boolean;
  rejectionReason?: ResumptionRejectionReason;
  error?: string;
}

export interface AndroidWebViewDownloadResumptionManager {
  pauseDownload: (
    downloadId: string,
    tabId: string,
    integrityMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    lifecycleMgr: AndroidWebViewDownloadRequestLifecycleManager | ResumptionCapableLifecycleManager
  ) => { success: boolean; session?: ResumptionSession; error?: string };

  synthesizeRangeRequest: (
    downloadId: string,
    tabId: string
  ) => { success: boolean; headers?: RangeRequestHeaders; error?: string };

  classifyServerResponse: (
    statusCode: number,
    responseHeaders: {
      contentRange?: string;
      etag?: string;
      lastModified?: string;
      acceptRanges?: string;
      contentLength?: number;
    },
    session: ResumptionSession
  ) => {
    classification: RangeResponseClassification;
    shouldRestartFromZero: boolean;
    adjustedOffset: number;
    newTotalBytes?: number;
    reason: string;
  };

  resumeDownload: (
    downloadId: string,
    tabId: string,
    integrityMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    lifecycleMgr: AndroidWebViewDownloadRequestLifecycleManager | ResumptionCapableLifecycleManager,
    serverClassification?: RangeResponseClassification
  ) => { success: boolean; session?: ResumptionSession; error?: string };

  appendResumedChunk: (
    downloadId: string,
    tabId: string,
    chunkSize: number,
    epoch: number,
    integrityMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    isFinalChunk?: boolean
  ) => ChunkAppendResult;

  getResumptionSession: (downloadId: string) => ResumptionSession | null;
  getTabResumptionSessions: (tabId: string) => ResumptionSession[];
  onTabNavigation: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean) => void;
  cleanupAllPrivateState: () => void;
}

/**
 * Parses RFC 7233 Content-Range header: "bytes 1024-2047/2048" or "bytes 1024-2047/*"
 */
export function parseContentRangeHeader(headerValue: string): {
  unit: string;
  start: number;
  end: number;
  total?: number;
} | null {
  if (!headerValue || typeof headerValue !== "string") return null;
  const match = headerValue.trim().match(/^([a-zA-Z]+)\s+(\d+)-(\d+)\/(\d+|\*)$/);
  if (!match) return null;

  return {
    unit: match[1].toLowerCase(),
    start: parseInt(match[2], 10),
    end: parseInt(match[3], 10),
    total: match[4] === "*" ? undefined : parseInt(match[4], 10),
  };
}

/**
 * Formulates standard RFC 7233 / 9110 Range Header
 */
export function formatRangeHeader(offsetBytes: number): string {
  const safeOffset = Math.max(0, Math.floor(offsetBytes));
  return `bytes=${safeOffset}-`;
}

/**
 * Creates the Android WebView Download Resumption & HTTP Range Boundary Manager
 */
export function createAndroidWebViewDownloadResumptionManager(): AndroidWebViewDownloadResumptionManager {
  const sessions = new Map<string, ResumptionSession>(); // downloadId -> ResumptionSession
  const tabEpochs = new Map<string, number>(); // tabId -> monotonic epoch

  function getTabEpoch(tabId: string): number {
    return tabEpochs.get(tabId) || 1;
  }

  function incrementTabEpoch(tabId: string): number {
    const next = getTabEpoch(tabId) + 1;
    tabEpochs.set(tabId, next);
    return next;
  }

  function pauseDownload(
    downloadId: string,
    tabId: string,
    integrityMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    lifecycleMgr: AndroidWebViewDownloadRequestLifecycleManager | ResumptionCapableLifecycleManager
  ): { success: boolean; session?: ResumptionSession; error?: string } {
    const staging = integrityMgr.getStagingByDownloadId(downloadId);
    if (!staging) {
      return {
        success: false,
        error: `Staging artifact not found for download ${downloadId}`,
      };
    }

    if (staging.tabId !== tabId) {
      return {
        success: false,
        error: `Tab mismatch for download ${downloadId}: expected ${staging.tabId}, got ${tabId}`,
      };
    }

    // Check if download is already completed
    if (integrityMgr.isDownloadCompleted(downloadId)) {
      return {
        success: false,
        error: `Cannot pause download ${downloadId}: already completed`,
      };
    }

    // Terminal / invalid lifecycle state guard
    const record = lifecycleMgr.getDownloadRecord?.(downloadId);
    if (
      record &&
      (record.state === DownloadLifecycleState.COMPLETED ||
        record.state === DownloadLifecycleState.CANCELLED ||
        record.state === DownloadLifecycleState.FAILED ||
        record.state === DownloadLifecycleState.BLOCKED_SECURITY)
    ) {
      return {
        success: false,
        error: `Cannot pause download ${downloadId}: download is in terminal state ${record.state}`,
      };
    }

    // Require and execute real lifecycle manager pause transition (no silent skip)
    if (typeof lifecycleMgr.pauseDownload !== "function") {
      return {
        success: false,
        error: `Lifecycle manager does not support pauseDownload for download ${downloadId}`,
      };
    }

    const pausedInLifecycle = lifecycleMgr.pauseDownload(downloadId);
    if (!pausedInLifecycle) {
      return {
        success: false,
        error: `Lifecycle manager failed to transition download ${downloadId} to PAUSED`,
      };
    }

    const currentEpoch = incrementTabEpoch(tabId);
    let session = sessions.get(downloadId);

    if (!session) {
      session = {
        downloadId,
        stagingId: staging.stagingId,
        tabId,
        isPrivate: staging.isPrivate,
        state: ResumptionState.PAUSED,
        resumptionEpoch: currentEpoch,
        resumeOffsetBytes: staging.receivedBytes,
        totalExpectedBytes: staging.expectedBytes,
        resumeAttempts: 0,
        maxResumeAttempts: 5,
        createdAt: Date.now(),
      };
    } else {
      session.state = ResumptionState.PAUSED;
      session.resumptionEpoch = currentEpoch;
      session.resumeOffsetBytes = staging.receivedBytes;
    }

    sessions.set(downloadId, session);

    return {
      success: true,
      session: { ...session },
    };
  }

  function synthesizeRangeRequest(
    downloadId: string,
    tabId: string
  ): { success: boolean; headers?: RangeRequestHeaders; error?: string } {
    const session = sessions.get(downloadId);
    if (!session) {
      return {
        success: false,
        error: `No resumption session found for download ${downloadId}`,
      };
    }

    if (session.tabId !== tabId) {
      return {
        success: false,
        error: `Tab mismatch for download ${downloadId}`,
      };
    }

    if (session.resumeOffsetBytes < 0) {
      return {
        success: false,
        error: `Invalid resume offset: ${session.resumeOffsetBytes}`,
      };
    }

    const rangeHeader = formatRangeHeader(session.resumeOffsetBytes);
    const headers: RangeRequestHeaders = {
      rangeHeader,
      ifRangeHeader: session.etag || session.lastModified,
      acceptRangesHeaderExpected: "bytes",
    };

    return {
      success: true,
      headers,
    };
  }

  function classifyServerResponse(
    statusCode: number,
    responseHeaders: {
      contentRange?: string;
      etag?: string;
      lastModified?: string;
      acceptRanges?: string;
      contentLength?: number;
    },
    session: ResumptionSession
  ): {
    classification: RangeResponseClassification;
    shouldRestartFromZero: boolean;
    adjustedOffset: number;
    newTotalBytes?: number;
    reason: string;
  } {
    // 1. HTTP 206 Partial Content (Ideal Range Response)
    if (statusCode === 206) {
      if (responseHeaders.contentRange) {
        const parsed = parseContentRangeHeader(responseHeaders.contentRange);
        if (parsed) {
          // If server's range start matches our requested offset
          if (parsed.start === session.resumeOffsetBytes) {
            return {
              classification: RangeResponseClassification.PARTIAL_CONTENT_206,
              shouldRestartFromZero: false,
              adjustedOffset: session.resumeOffsetBytes,
              newTotalBytes: parsed.total || session.totalExpectedBytes,
              reason: `Server accepted partial range from byte ${parsed.start} to ${parsed.end}`,
            };
          } else {
            // Server returned different range; adjust offset
            return {
              classification: RangeResponseClassification.PARTIAL_CONTENT_206,
              shouldRestartFromZero: false,
              adjustedOffset: parsed.start,
              newTotalBytes: parsed.total || session.totalExpectedBytes,
              reason: `Server returned shifted partial range starting at ${parsed.start}`,
            };
          }
        }
      }

      // 206 without Content-Range header: accept from offset
      return {
        classification: RangeResponseClassification.PARTIAL_CONTENT_206,
        shouldRestartFromZero: false,
        adjustedOffset: session.resumeOffsetBytes,
        newTotalBytes: session.totalExpectedBytes,
        reason: "HTTP 206 received; streaming from resume offset",
      };
    }

    // 2. HTTP 200 OK: Server ignored Range header or does not support ranges
    if (statusCode === 200) {
      return {
        classification: RangeResponseClassification.FULL_RELOAD_200,
        shouldRestartFromZero: true,
        adjustedOffset: 0,
        newTotalBytes: responseHeaders.contentLength || session.totalExpectedBytes,
        reason: "Server returned HTTP 200; Range unsupported, resetting staging to byte 0",
      };
    }

    // 3. HTTP 416 Range Not Satisfiable: Offset beyond content length
    if (statusCode === 416) {
      return {
        classification: RangeResponseClassification.RANGE_NOT_SATISFIABLE_416,
        shouldRestartFromZero: true,
        adjustedOffset: 0,
        reason: "HTTP 416 Range Not Satisfiable; offset invalid, resetting to byte 0",
      };
    }

    // 4. HTTP 412 Precondition Failed or ETag mismatch: Resource mutated on server
    if (statusCode === 412 || (session.etag && responseHeaders.etag && session.etag !== responseHeaders.etag)) {
      return {
        classification: RangeResponseClassification.RESOURCE_MUTATED_412,
        shouldRestartFromZero: true,
        adjustedOffset: 0,
        reason: "Remote resource mutated (ETag mismatch or HTTP 412); clearing partial artifact and restarting",
      };
    }

    // 5. Any other 4xx/5xx server errors
    return {
      classification: RangeResponseClassification.SERVER_ERROR,
      shouldRestartFromZero: false,
      adjustedOffset: session.resumeOffsetBytes,
      reason: `Server returned HTTP status ${statusCode}`,
    };
  }

  function resumeDownload(
    downloadId: string,
    tabId: string,
    integrityMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    lifecycleMgr: AndroidWebViewDownloadRequestLifecycleManager | ResumptionCapableLifecycleManager,
    serverClassification: RangeResponseClassification = RangeResponseClassification.PARTIAL_CONTENT_206
  ): { success: boolean; session?: ResumptionSession; error?: string } {
    const session = sessions.get(downloadId);
    if (!session) {
      return {
        success: false,
        error: `No resumption session found for download ${downloadId}`,
      };
    }

    if (session.tabId !== tabId) {
      return {
        success: false,
        error: `Tab mismatch for download ${downloadId}`,
      };
    }

    if (session.state === ResumptionState.COMPLETED) {
      return {
        success: false,
        error: `Cannot resume download ${downloadId}: already completed`,
      };
    }

    // Terminal / invalid lifecycle state guard
    const record = lifecycleMgr.getDownloadRecord?.(downloadId);
    if (
      record &&
      (record.state === DownloadLifecycleState.COMPLETED ||
        record.state === DownloadLifecycleState.CANCELLED ||
        record.state === DownloadLifecycleState.FAILED ||
        record.state === DownloadLifecycleState.BLOCKED_SECURITY)
    ) {
      return {
        success: false,
        error: `Cannot resume download ${downloadId}: download is in terminal state ${record.state}`,
      };
    }

    if (session.resumeAttempts >= session.maxResumeAttempts) {
      session.state = ResumptionState.FAILED;
      session.lastError = "Max resume attempts exceeded";
      return {
        success: false,
        error: session.lastError,
      };
    }

    // Require and execute real lifecycle manager resume transition (no silent skip)
    if (typeof lifecycleMgr.resumeDownload !== "function") {
      return {
        success: false,
        error: `Lifecycle manager does not support resumeDownload for download ${downloadId}`,
      };
    }

    const resumedInLifecycle = lifecycleMgr.resumeDownload(downloadId);
    if (!resumedInLifecycle) {
      return {
        success: false,
        error: `Lifecycle manager failed to transition download ${downloadId} from PAUSED to DOWNLOADING`,
      };
    }

    const nextEpoch = incrementTabEpoch(tabId);
    session.resumptionEpoch = nextEpoch;
    session.resumeAttempts += 1;
    session.lastResumedAt = Date.now();

    if (
      serverClassification === RangeResponseClassification.FULL_RELOAD_200 ||
      serverClassification === RangeResponseClassification.RESOURCE_MUTATED_412 ||
      serverClassification === RangeResponseClassification.RANGE_NOT_SATISFIABLE_416
    ) {
      // Clean up previous partial staging and start fresh
      session.state = ResumptionState.RESTARTING;
      session.resumeOffsetBytes = 0;

      // Reset staging in integrity manager by re-initiating or resetting chunk count
      integrityMgr.cancelAndCleanupStaging(session.stagingId, "Restarting download from byte 0");
      const newStg = integrityMgr.createStagingDownload({
        downloadId,
        tabId,
        destinationFilename: `download_${downloadId}`,
        expectedBytes: session.totalExpectedBytes,
        isPrivate: session.isPrivate,
      });
      session.stagingId = newStg.stagingId;
    } else {
      session.state = ResumptionState.STREAMING;
    }

    sessions.set(downloadId, session);

    return {
      success: true,
      session: { ...session },
    };
  }

  function appendResumedChunk(
    downloadId: string,
    tabId: string,
    chunkSize: number,
    epoch: number,
    integrityMgr: AndroidWebViewDownloadCompletionIntegrityManager,
    isFinalChunk = false
  ): ChunkAppendResult {
    const session = sessions.get(downloadId);
    if (!session) {
      return {
        accepted: false,
        receivedBytes: 0,
        expectedBytes: 0,
        isComplete: false,
        rejectionReason: ResumptionRejectionReason.STAGING_NOT_FOUND,
        error: `No resumption session found for ${downloadId}`,
      };
    }

    if (session.tabId !== tabId) {
      return {
        accepted: false,
        receivedBytes: session.resumeOffsetBytes,
        expectedBytes: session.totalExpectedBytes,
        isComplete: false,
        rejectionReason: ResumptionRejectionReason.TAB_MISMATCH,
        error: "Tab mismatch",
      };
    }

    // Stale epoch check
    if (epoch !== session.resumptionEpoch) {
      return {
        accepted: false,
        receivedBytes: session.resumeOffsetBytes,
        expectedBytes: session.totalExpectedBytes,
        isComplete: false,
        rejectionReason: ResumptionRejectionReason.STALE_RESUMPTION_EPOCH,
        error: `Stale epoch: got ${epoch}, expected ${session.resumptionEpoch}`,
      };
    }

    // Append to integrity manager staging
    const appendRes = integrityMgr.appendChunk({
      stagingId: session.stagingId,
      tabId,
      chunkSize,
      isFinalChunk,
    });

    if (appendRes.success) {
      session.resumeOffsetBytes = appendRes.receivedBytes;
      if (appendRes.isComplete) {
        session.state = ResumptionState.COMPLETED;
      } else {
        session.state = ResumptionState.STREAMING;
      }
      sessions.set(downloadId, session);

      return {
        accepted: true,
        receivedBytes: appendRes.receivedBytes,
        expectedBytes: appendRes.expectedBytes,
        isComplete: appendRes.isComplete,
      };
    } else {
      return {
        accepted: false,
        receivedBytes: session.resumeOffsetBytes,
        expectedBytes: session.totalExpectedBytes,
        isComplete: false,
        error: appendRes.error,
      };
    }
  }

  function getResumptionSession(downloadId: string): ResumptionSession | null {
    const s = sessions.get(downloadId);
    return s ? { ...s } : null;
  }

  function getTabResumptionSessions(tabId: string): ResumptionSession[] {
    const list: ResumptionSession[] = [];
    for (const s of sessions.values()) {
      if (s.tabId === tabId) {
        list.push({ ...s });
      }
    }
    return list;
  }

  function onTabNavigation(tabId: string): void {
    incrementTabEpoch(tabId);
    // Pause any streaming sessions belonging to this tab
    for (const s of sessions.values()) {
      if (s.tabId === tabId && s.state === ResumptionState.STREAMING) {
        s.state = ResumptionState.PAUSED;
      }
    }
  }

  function onTabClosed(tabId: string, isPrivate = false): void {
    tabEpochs.delete(tabId);
    // Cleanup sessions belonging to this tab
    for (const [id, s] of sessions.entries()) {
      if (s.tabId === tabId) {
        sessions.delete(id);
      }
    }
  }

  function cleanupAllPrivateState(): void {
    for (const [id, s] of sessions.entries()) {
      if (s.isPrivate) {
        sessions.delete(id);
      }
    }
  }

  return {
    pauseDownload,
    synthesizeRangeRequest,
    classifyServerResponse,
    resumeDownload,
    appendResumedChunk,
    getResumptionSession,
    getTabResumptionSessions,
    onTabNavigation,
    onTabClosed,
    cleanupAllPrivateState,
  };
}
