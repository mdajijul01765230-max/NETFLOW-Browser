/**
 * Verification Script for NETFLOW-V2-NATIVE-36:
 * WebView Download Completion & File-Save Integrity
 */

import {
  createAndroidWebViewDownloadCompletionAndFileSaveIntegrityManager,
  StagingFileStatus,
  IntegrityFailureReason,
  revalidateDestinationFilename,
  resolveFilenameCollision,
  verifyMagicByteSignature,
} from "../src/services/androidWebViewDownloadCompletionIntegrity";

import {
  createAndroidWebViewDownloadRequestLifecycleManager,
  DownloadLifecycleState,
} from "../src/services/androidWebViewDownloadRequestLifecycle";

import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  PageLifecycleState,
} from "../src/services/androidWebViewPageStateAndLifecycleSafety";

import {
  createAndroidWebViewRenderingResilienceManager,
} from "../src/services/androidWebViewRenderingResilience";

import {
  createAndroidWebViewMediaResourceManager,
} from "../src/services/androidWebViewMediaResourceGovernance";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runNative36Suite() {
  console.log("=== STARTING NATIVE-36 WEBVIEW DOWNLOAD COMPLETION & FILE-SAVE INTEGRITY SUITE ===");

  const integrityMgr = createAndroidWebViewDownloadCompletionAndFileSaveIntegrityManager();

  // -------------------------------------------------------------
  // 1. TEMPORARY/IN-PROGRESS (.part Staging) VS FINAL COMPLETED FILE STATE
  // -------------------------------------------------------------
  console.log("1. Testing Temporary/In-Progress (.part Staging) vs Final Completed File State...");

  const tab1 = "tab-36-test-1";
  const staging1 = integrityMgr.createStagingDownload({
    downloadId: "dl-36-101",
    tabId: tab1,
    destinationFilename: "report.pdf",
    expectedBytes: 4096,
    mimeType: "application/pdf",
    isPrivate: false,
  });

  assert(staging1.tempFilename.endsWith(".part"), "Staging tempFilename must end with .part");
  const stgRec = integrityMgr.getStagingRecord(staging1.stagingId);
  assert(stgRec !== null, "Staging record found in manager");
  assert(stgRec?.status === StagingFileStatus.STAGING, "Staging status must be STAGING");

  // Verify in-progress staging is NOT visible in completed/finalized downloads
  const finalizedForTab1 = integrityMgr.getFinalizedDownloadsForTab(tab1);
  assert(finalizedForTab1.length === 0, "In-progress downloads must never appear in finalized downloads list");

  const allFinalized = integrityMgr.getAllFinalizedDownloads();
  assert(allFinalized.length === 0, "In-progress downloads must never appear in global finalized list");

  console.log("✓ Temporary staging vs final completed separation verified.");

  // -------------------------------------------------------------
  // 2. PARTIAL DOWNLOAD & ZERO-BYTE DEFENSE
  // -------------------------------------------------------------
  console.log("2. Testing Strict Partial Download Rejection & Zero-Byte Defense...");

  // Zero-byte attempt
  const zeroStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-36-zero",
    tabId: tab1,
    destinationFilename: "empty.bin",
    expectedBytes: 0,
    mimeType: "application/octet-stream",
  });

  const zeroFinalize = integrityMgr.finalizeDownload({
    stagingId: zeroStaging.stagingId,
    tabId: tab1,
  });
  assert(!zeroFinalize.success, "Zero-byte payload finalization must fail");
  assert(
    zeroFinalize.failureReason === IntegrityFailureReason.ZERO_BYTE_PAYLOAD,
    "Failure reason must be ZERO_BYTE_PAYLOAD"
  );

  // Partial/truncated download attempt: expected 5000 bytes, only received 2000
  const partialStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-36-part",
    tabId: tab1,
    destinationFilename: "manual.pdf",
    expectedBytes: 5000,
    mimeType: "application/pdf",
  });

  integrityMgr.appendChunk({
    stagingId: partialStaging.stagingId,
    tabId: tab1,
    chunkSize: 2000,
  });

  const partialFinalize = integrityMgr.finalizeDownload({
    stagingId: partialStaging.stagingId,
    tabId: tab1,
  });
  assert(!partialFinalize.success, "Partial truncated download must not be finalized");
  assert(
    partialFinalize.failureReason === IntegrityFailureReason.SIZE_MISMATCH_PARTIAL,
    "Failure reason must be SIZE_MISMATCH_PARTIAL"
  );

  console.log("✓ Partial and zero-byte download protection verified.");

  // -------------------------------------------------------------
  // 3. CANCEL, FAILURE & INTERRUPTION CLEANUP
  // -------------------------------------------------------------
  console.log("3. Testing Cancel, Failure and Interruption Cleanup...");

  const cancelStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-36-cancel",
    tabId: tab1,
    destinationFilename: "data.csv",
    expectedBytes: 1000,
    mimeType: "text/csv",
  });

  const cancelRes = integrityMgr.cancelAndCleanupStaging(cancelStaging.stagingId, "User cancelled");
  assert(cancelRes.cleaned, "Cancellation cleanup succeeded");
  assert(
    integrityMgr.getStagingRecord(cancelStaging.stagingId) === null,
    "Cancelled staging record expunged from memory"
  );

  const failStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-36-fail",
    tabId: tab1,
    destinationFilename: "stream.mp4",
    expectedBytes: 10000,
    mimeType: "video/mp4",
  });

  const failRes = integrityMgr.failAndCleanupStaging(
    failStaging.stagingId,
    IntegrityFailureReason.PREMATURE_EOF,
    "Network socket closed"
  );
  assert(failRes.cleaned, "Failure cleanup succeeded");
  assert(
    integrityMgr.getStagingRecord(failStaging.stagingId) === null,
    "Failed staging record expunged from memory"
  );

  console.log("✓ Cancel, failure and interruption cleanup verified.");

  // -------------------------------------------------------------
  // 4. SAFE FINALIZATION & ATOMIC STAGING-TO-FINAL PROMOTION
  // -------------------------------------------------------------
  console.log("4. Testing Safe Finalization & Atomic Staging-to-Final Promotion...");

  const validStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-36-valid",
    tabId: tab1,
    destinationFilename: "document.pdf",
    expectedBytes: 1024,
    mimeType: "application/pdf",
  });

  // PDF Magic Bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2D];
  integrityMgr.appendChunk({
    stagingId: validStaging.stagingId,
    tabId: tab1,
    chunkSize: 1024,
    chunkSample: pdfHeader,
    isFinalChunk: true,
  });

  const finalizeRes = integrityMgr.finalizeDownload({
    stagingId: validStaging.stagingId,
    tabId: tab1,
  });

  assert(finalizeRes.success, "Valid download finalization succeeded");
  assert(finalizeRes.record !== undefined, "Finalized record created");
  assert(finalizeRes.record?.finalFilename === "document.pdf", "Final path matches document.pdf");

  // Staging record must be deleted upon atomic promotion
  assert(
    integrityMgr.getStagingRecord(validStaging.stagingId) === null,
    "Staging record deleted upon promotion to final"
  );

  console.log("✓ Safe finalization & atomic promotion verified.");

  // -------------------------------------------------------------
  // 5. FILENAME & PATH REVALIDATION
  // -------------------------------------------------------------
  console.log("5. Testing Filename & Path Revalidation (Path Traversal, Null Bytes, Device Names)...");

  // Path traversal attempt
  const traversalCheck = revalidateDestinationFilename("../../etc/passwd");
  assert(!traversalCheck.isValid, "Path traversal with ../ must be rejected");
  assert(traversalCheck.failureReason === IntegrityFailureReason.PATH_TRAVERSAL_DETECTED, "Path traversal detected failure reason");

  // Null byte injection attempt
  const nullByteCheck = revalidateDestinationFilename("safe_name\x00.exe.pdf");
  assert(!nullByteCheck.isValid, "Null byte injection must be rejected");
  assert(nullByteCheck.failureReason === IntegrityFailureReason.NULL_BYTE_DETECTED, "Null byte detected failure reason");

  // Windows/Android reserved device names
  const devNameCheck = revalidateDestinationFilename("CON.txt");
  assert(!devNameCheck.isValid, "Reserved device name CON must be rejected");
  assert(devNameCheck.failureReason === IntegrityFailureReason.RESERVED_DEVICE_NAME, "Reserved device name failure reason");

  console.log("✓ Filename and path revalidation verified.");

  // -------------------------------------------------------------
  // 6. COLLISION & SILENT OVERWRITE PROTECTION
  // -------------------------------------------------------------
  console.log("6. Testing Collision & Silent Overwrite Protection (Non-destructive Renaming)...");

  const existingSet = new Set<string>(["document.pdf"]);
  const coll1 = resolveFilenameCollision("document.pdf", existingSet);
  assert(coll1.wasCollision === true, "Colliding document.pdf must be detected");
  assert(coll1.resolvedFilename === "document (1).pdf", "First collision becomes document (1).pdf");

  existingSet.add("document (1).pdf");
  const coll2 = resolveFilenameCollision("document.pdf", existingSet);
  assert(coll2.resolvedFilename === "document (2).pdf", "Second collision becomes document (2).pdf");

  console.log("✓ Collision and silent overwrite protection verified.");

  // -------------------------------------------------------------
  // 7. MIME & EXTENSION CONSISTENCY AND MAGIC BYTES
  // -------------------------------------------------------------
  console.log("7. Testing MIME & Extension Consistency and Magic Byte Signatures...");

  // Fake PDF header
  const fakePdf = verifyMagicByteSignature([0x41, 0x42, 0x43, 0x44], "application/pdf");
  assert(!fakePdf.isValid, "Fake PDF magic bytes rejected");

  // PNG valid check
  const pngValid = verifyMagicByteSignature([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png");
  assert(pngValid.isValid, "Valid PNG header passes");

  console.log("✓ MIME/extension consistency and magic bytes verified.");

  // -------------------------------------------------------------
  // 8. PER-TAB DOWNLOAD ISOLATION
  // -------------------------------------------------------------
  console.log("8. Testing Per-Tab Download Isolation...");

  const tabA = "tab-36-alpha";
  const tabB = "tab-36-beta";

  const stA = integrityMgr.createStagingDownload({
    downloadId: "dl-tab-a",
    tabId: tabA,
    destinationFilename: "alpha.txt",
    expectedBytes: 100,
    mimeType: "text/plain",
  });

  // Cross-tab append attempt
  const crossAppend = integrityMgr.appendChunk({
    stagingId: stA.stagingId,
    tabId: tabB,
    chunkSize: 50,
  });
  assert(!crossAppend.success, "Cross-tab chunk append must be rejected");

  // Cross-tab finalize attempt
  const crossFinalize = integrityMgr.finalizeDownload({
    stagingId: stA.stagingId,
    tabId: tabB,
  });
  assert(!crossFinalize.success, "Cross-tab finalization must be rejected");
  assert(crossFinalize.failureReason === IntegrityFailureReason.TAB_MISMATCH, "Failure reason is TAB_MISMATCH");

  console.log("✓ Per-tab download isolation verified.");

  // -------------------------------------------------------------
  // 9. EPHEMERAL PRIVATE-TAB DOWNLOAD CLEANUP
  // -------------------------------------------------------------
  console.log("9. Testing Ephemeral Private-Tab Download Cleanup...");

  const privTab = "tab-36-private";
  const privStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-priv-1",
    tabId: privTab,
    destinationFilename: "private_report.pdf",
    expectedBytes: 256,
    mimeType: "application/pdf",
    isPrivate: true,
  });

  integrityMgr.appendChunk({
    stagingId: privStaging.stagingId,
    tabId: privTab,
    chunkSize: 256,
    chunkSample: pdfHeader,
    isFinalChunk: true,
  });

  const privFin = integrityMgr.finalizeDownload({
    stagingId: privStaging.stagingId,
    tabId: privTab,
  });
  assert(privFin.success, "Private download finalized successfully");
  assert(integrityMgr.getFinalizedDownloadsForTab(privTab).length === 1, "Private download in tab list");

  // Tab closes -> complete purge
  const purgeRes = integrityMgr.onTabClosed(privTab, true);
  assert(purgeRes.cleanedFinalizedCount === 1, "Private finalized download purged on tab close");
  assert(integrityMgr.getFinalizedDownloadsForTab(privTab).length === 0, "No finalized downloads for closed tab");

  console.log("✓ Ephemeral private-tab download state purge verified.");

  // -------------------------------------------------------------
  // 10. COMPATIBILITY WITH NATIVE-35, NATIVE-31, NATIVE-30 & NATIVE-29
  // -------------------------------------------------------------
  console.log("10. Testing Compatibility with NATIVE-35, NATIVE-31, NATIVE-30 & NATIVE-29...");

  // NATIVE-35
  const reqMgr = createAndroidWebViewDownloadRequestLifecycleManager();
  const consent = reqMgr.handleDownloadRequest({
    tabId: "tab-compat",
    url: "https://example.com/download.zip",
    suggestedFilename: "download.zip",
  });
  assert(consent.accepted, "NATIVE-35 accepted");
  assert(consent.state === DownloadLifecycleState.PENDING_CONSENT, "NATIVE-35 PENDING_CONSENT");

  // NATIVE-31
  const pageSafety = createAndroidWebViewPageStateAndLifecycleSafetyManager();
  pageSafety.registerTab("tab-compat", "https://example.com");
  const pStarted = pageSafety.onPageStarted("tab-compat", "https://example.com");
  assert(pageSafety.getTabRecord("tab-compat")?.state === PageLifecycleState.LOADING, "NATIVE-31 LOADING");

  // NATIVE-30
  const renderMgr = createAndroidWebViewRenderingResilienceManager();
  renderMgr.registerTab("tab-compat", "https://example.com");
  const renderRes = renderMgr.executeGuardedRenderCallback("tab-compat", 1, () => "render-ok");
  assert(renderRes.isValid && renderRes.executed, "NATIVE-30 Rendering ok");

  // NATIVE-29
  const mediaMgr = createAndroidWebViewMediaResourceManager();
  mediaMgr.setActiveForegroundTab("tab-compat");
  const alloc = mediaMgr.allocateMediaResource("tab-compat", "https://example.com", "audio", "https://example.com/sound.mp3");
  assert(alloc.success, "NATIVE-29 Media ok");

  console.log("✓ Compatibility with NATIVE-35, NATIVE-31, NATIVE-30, and NATIVE-29 verified.");

  // -------------------------------------------------------------
  // 11. MULTI-CHUNK STREAMING & BOUNDED BUFFER INTEGRITY (STEP 2)
  // -------------------------------------------------------------
  console.log("11. Testing Multi-chunk Streaming & Bounded Buffer Memory Integrity (STEP 2)...");

  // A. Bounded memory rejection for oversized chunk (> 32MB)
  const streamStaging = integrityMgr.createStagingDownload({
    downloadId: "dl-36-stream",
    tabId: tab1,
    destinationFilename: "archive.zip",
    expectedBytes: 1024 * 1024,
    mimeType: "application/zip",
  });

  const oversizedChunkRes = integrityMgr.appendChunk({
    stagingId: streamStaging.stagingId,
    tabId: tab1,
    chunkSize: 40 * 1024 * 1024, // 40MB > 32MB bound
  });
  assert(!oversizedChunkRes.success, "Oversized chunk must be rejected by bounded memory buffer guard");
  assert(oversizedChunkRes.error?.includes("32MB"), "Error references 32MB limit");

  // B. Multi-chunk progression: intermediate chunks must NOT set isComplete or allow COMPLETED state
  const zipMagic = [0x50, 0x4b, 0x03, 0x04]; // PK..
  const chunk0 = integrityMgr.appendChunk({
    stagingId: streamStaging.stagingId,
    tabId: tab1,
    chunkSize: 512 * 1024,
    chunkSample: zipMagic,
    chunkIndex: 0,
    isFinalChunk: false,
  });
  assert(chunk0.success, "Chunk 0 appended successfully");
  assert(!chunk0.isComplete, "Intermediate chunk 0 must NOT be marked complete");
  assert(integrityMgr.isDownloadInProgress("dl-36-stream"), "Download is still in progress");
  assert(!integrityMgr.isDownloadCompleted("dl-36-stream"), "Download is not completed");

  // C. Partial attempt to finalize without final chunk must be rejected and cleaned up
  const prematureFinalize = integrityMgr.finalizeDownload({
    stagingId: streamStaging.stagingId,
    tabId: tab1,
  });
  assert(!prematureFinalize.success, "Cannot finalize before receiving valid final chunk");
  assert(
    prematureFinalize.failureReason === IntegrityFailureReason.SIZE_MISMATCH_PARTIAL ||
    prematureFinalize.failureReason === IntegrityFailureReason.PREMATURE_EOF,
    "Failure reason indicates premature completion"
  );
  assert(!integrityMgr.isDownloadCompleted("dl-36-stream"), "Premature finalize must never produce COMPLETED state");

  // D. Multi-chunk download to successful completion with final chunk
  const validStream = integrityMgr.createStagingDownload({
    downloadId: "dl-36-multistream",
    tabId: tab1,
    destinationFilename: "bundle.zip",
    expectedBytes: 3000,
    mimeType: "application/zip",
  });

  // Chunk 0 (1000 bytes)
  const s0 = integrityMgr.appendChunk({
    stagingId: validStream.stagingId,
    tabId: tab1,
    chunkSize: 1000,
    chunkSample: zipMagic,
    chunkIndex: 0,
    isFinalChunk: false,
  });
  assert(s0.success && !s0.isComplete, "Chunk 0 success, not complete");

  // Chunk 1 (1000 bytes)
  const s1 = integrityMgr.appendChunk({
    stagingId: validStream.stagingId,
    tabId: tab1,
    chunkSize: 1000,
    chunkIndex: 1,
    isFinalChunk: false,
  });
  assert(s1.success && !s1.isComplete, "Chunk 1 success, not complete");

  // Chunk 2 (1000 bytes, final chunk)
  const s2 = integrityMgr.appendChunk({
    stagingId: validStream.stagingId,
    tabId: tab1,
    chunkSize: 1000,
    chunkIndex: 2,
    isFinalChunk: true,
  });
  assert(s2.success && s2.isComplete, "Final chunk completes the stream");

  // Finalize stream
  const finalStreamRes = integrityMgr.finalizeDownload({
    stagingId: validStream.stagingId,
    tabId: tab1,
  });
  assert(finalStreamRes.success, "Valid multi-chunk stream finalized successfully");
  assert(integrityMgr.isDownloadCompleted("dl-36-multistream"), "Stream is now COMPLETED");

  // Check stream buffer metrics
  const metrics = integrityMgr.getStreamBufferMetrics();
  assert(metrics.boundedMemoryPolicyEnforced, "Bounded memory policy active");
  assert(metrics.maxChunkSizeBytes === 32 * 1024 * 1024, "Max chunk size 32MB");

  console.log("✓ Multi-chunk streaming & bounded buffer memory integrity verified.");

  console.log("\n================================================================================");
  console.log(">>> ALL NATIVE-36 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<");
  console.log("================================================================================\n");
}

runNative36Suite().catch((err) => {
  console.error("NATIVE-36 Verification Failure:", err);
  process.exit(1);
});
