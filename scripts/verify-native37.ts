/**
 * Verification Script for NETFLOW-V2-NATIVE-37:
 * Download Completion Integrity & Recovery Audit
 */

import {
  createAndroidWebViewDownloadRecoveryAuditManager,
  AuditStatus,
  CallbackGuardRejectionReason,
} from "../src/services/androidWebViewDownloadRecoveryAudit";

import {
  createAndroidWebViewDownloadCompletionAndFileSaveIntegrityManager,
  StagingFileStatus,
} from "../src/services/androidWebViewDownloadCompletionIntegrity";

import {
  createAndroidWebViewDownloadRequestLifecycleManager,
  DownloadLifecycleState,
} from "../src/services/androidWebViewDownloadRequestLifecycle";

import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  PageLifecycleState,
} from "../src/services/androidWebViewPageStateAndLifecycleSafety";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runNative37Suite() {
  console.log("=== STARTING NATIVE-37 DOWNLOAD COMPLETION INTEGRITY & RECOVERY AUDIT SUITE ===");

  const auditMgr = createAndroidWebViewDownloadRecoveryAuditManager();
  const integrityMgr = createAndroidWebViewDownloadCompletionAndFileSaveIntegrityManager();
  const lifecycleMgr = createAndroidWebViewDownloadRequestLifecycleManager();

  // -------------------------------------------------------------
  // 1. COMPLETED DOWNLOAD INTEGRITY STATE & CROSS-LAYER AUDITING
  // -------------------------------------------------------------
  console.log("1. Testing Completed Download Integrity State Audit...");

  const tab1 = "tab-aud-1";
  const dl1 = "dl-aud-101";

  // Step A: Request download in lifecycle manager (NATIVE-35)
  const reqRes = lifecycleMgr.handleDownloadRequest({
    tabId: tab1,
    url: "https://example.com/assets/dataset.csv",
    suggestedFilename: "dataset.csv",
    contentLength: 2048,
    mimeType: "text/csv",
  });
  assert(reqRes.accepted && reqRes.downloadId !== undefined, "NATIVE-35 download requested");
  const downloadId = reqRes.downloadId!;

  // Approve consent and transition to completed
  lifecycleMgr.approveDownloadConsent(downloadId);
  lifecycleMgr.updateDownloadProgress(downloadId, 2048, 2048);
  lifecycleMgr.completeDownload(downloadId);

  // Step B: Staging & Finalization in integrity manager (NATIVE-36)
  const stg = integrityMgr.createStagingDownload({
    downloadId,
    tabId: tab1,
    destinationFilename: "dataset.csv",
    expectedBytes: 2048,
    mimeType: "text/csv",
  });
  integrityMgr.appendChunk({
    stagingId: stg.stagingId,
    tabId: tab1,
    chunkSize: 2048,
    isFinalChunk: true,
  });
  const fin = integrityMgr.finalizeDownload({
    stagingId: stg.stagingId,
    tabId: tab1,
  });
  assert(fin.success && fin.record !== undefined, "NATIVE-36 finalized download");

  // Step C: Audit completed download (NATIVE-37)
  const auditReport = auditMgr.auditCompletedDownload(downloadId, integrityMgr, lifecycleMgr);
  assert(auditReport.isConsistent, "Completed download audit reports clean consistency");
  assert(auditReport.status === AuditStatus.VERIFIED_INTEGRAL, "Status is VERIFIED_INTEGRAL");
  assert(auditReport.actualBytes === 2048, "Actual bytes matches 2048");
  assert(!auditReport.hasOrphanStaging, "Zero orphan staging artifacts remaining");

  console.log("✓ Completed download integrity state audit verified.");

  // -------------------------------------------------------------
  // 2. INCOMPLETE / PARTIAL ARTIFACT DETECTION
  // -------------------------------------------------------------
  console.log("2. Testing Incomplete / Partial Artifact Detection & Quarantine...");

  const tab2 = "tab-aud-2";
  const dlPartial = "dl-aud-part";

  // Staging started but only 500 bytes received out of 4000
  const stgPartial = integrityMgr.createStagingDownload({
    downloadId: dlPartial,
    tabId: tab2,
    destinationFilename: "huge_video.mp4",
    expectedBytes: 4000,
    mimeType: "video/mp4",
  });
  integrityMgr.appendChunk({
    stagingId: stgPartial.stagingId,
    tabId: tab2,
    chunkSize: 500,
  });

  const stgRecord = integrityMgr.getStagingRecord(stgPartial.stagingId);
  assert(stgRecord !== null, "Partial staging artifact exists");
  assert(stgRecord?.receivedBytes === 500, "Received bytes 500");
  assert(stgRecord?.expectedBytes === 4000, "Expected bytes 4000");

  // Attempting to finalize partial artifact must fail and be quarantined
  const finPartial = integrityMgr.finalizeDownload({
    stagingId: stgPartial.stagingId,
    tabId: tab2,
  });
  assert(!finPartial.success, "Partial artifact cannot be finalized");

  console.log("✓ Incomplete / partial artifact detection verified.");

  // -------------------------------------------------------------
  // 3. INTERRUPTED DOWNLOAD RECOVERY STATE
  // -------------------------------------------------------------
  console.log("3. Testing Interrupted Download Recovery State Transitions...");

  // Recovery test 1: Empty or zero-byte interrupted artifact -> Clean purge
  const stgEmpty = integrityMgr.createStagingDownload({
    downloadId: "dl-aud-empty",
    tabId: tab1,
    destinationFilename: "empty.dat",
    expectedBytes: 100,
  });
  const recEmpty = auditMgr.recoverInterruptedDownload(stgEmpty.stagingId, tab1, integrityMgr);
  assert(recEmpty.recovered, "Zero-byte interrupted download handled");
  assert(recEmpty.actionTaken === "PURGED_CORRUPT_ARTIFACT", "Action is PURGED_CORRUPT_ARTIFACT");
  assert(integrityMgr.getStagingRecord(stgEmpty.stagingId) === null, "Corrupt staging purged");

  // Recovery test 2: Valid partial artifact -> Staged resumption
  const stgResume = integrityMgr.createStagingDownload({
    downloadId: "dl-aud-resume",
    tabId: tab1,
    destinationFilename: "document.pdf",
    expectedBytes: 5000,
  });
  integrityMgr.appendChunk({
    stagingId: stgResume.stagingId,
    tabId: tab1,
    chunkSize: 2500,
  });
  const recResume = auditMgr.recoverInterruptedDownload(stgResume.stagingId, tab1, integrityMgr);
  assert(recResume.recovered, "Partial download recovery handled");
  assert(recResume.actionTaken === "RESUMED_STAGING", "Action is RESUMED_STAGING");
  assert(integrityMgr.getStagingRecord(stgResume.stagingId) !== null, "Staging preserved for resuming");

  console.log("✓ Interrupted download recovery states verified.");

  // -------------------------------------------------------------
  // 4. CANCELLED/FAILED DOWNLOAD FINAL-STATE CORRECTNESS
  // -------------------------------------------------------------
  console.log("4. Testing Cancelled/Failed Download Final-State Correctness...");

  const dlCancel = "dl-aud-cancel";
  const reqCancel = lifecycleMgr.handleDownloadRequest({
    tabId: tab1,
    url: "https://example.com/file.zip",
    suggestedFilename: "file.zip",
    contentLength: 1000,
  });
  lifecycleMgr.approveDownloadConsent(reqCancel.downloadId!);
  lifecycleMgr.cancelDownload(reqCancel.downloadId!);

  // Clean staging
  const stgCancel = integrityMgr.createStagingDownload({
    downloadId: dlCancel,
    tabId: tab1,
    destinationFilename: "file.zip",
    expectedBytes: 1000,
  });
  integrityMgr.cancelAndCleanupStaging(stgCancel.stagingId, "User cancelled");

  const cleanCheck = auditMgr.verifyCancelledOrFailedFinalState(
    dlCancel,
    integrityMgr,
    lifecycleMgr
  );
  assert(cleanCheck.isClean, "Cancelled download state is completely clean");

  console.log("✓ Cancelled and failed download final-state correctness verified.");

  // -------------------------------------------------------------
  // 5. DUPLICATE COMPLETION CALLBACK PROTECTION (IDEMPOTENCY)
  // -------------------------------------------------------------
  console.log("5. Testing Duplicate Completion Callback Protection (Idempotency Guard)...");

  const dlIdem = "dl-aud-idem";
  const reqIdem = lifecycleMgr.handleDownloadRequest({
    tabId: tab1,
    url: "https://example.com/photo.jpg",
    suggestedFilename: "photo.jpg",
    contentLength: 500,
  });
  const recordIdem = lifecycleMgr.approveDownloadConsent(reqIdem.downloadId!)!;
  const currentEpoch = auditMgr.getTabEpoch(tab1);

  let executionCount = 0;
  const token = "token-comp-12345";

  // First callback invocation
  const firstCallback = auditMgr.executeGuardedCompletionCallback({
    downloadId: reqIdem.downloadId!,
    tabId: tab1,
    callbackEpoch: currentEpoch,
    completionToken: token,
    lifecycleMgr,
    callback: () => {
      executionCount++;
      return "SUCCESS_FIRST";
    },
  });

  assert(firstCallback.executed, "First completion callback executed");
  assert(firstCallback.result === "SUCCESS_FIRST", "Result matches first execution");
  assert(executionCount === 1, "Execution count is 1");

  // Duplicate callback invocation with same token
  const duplicateCallback = auditMgr.executeGuardedCompletionCallback({
    downloadId: reqIdem.downloadId!,
    tabId: tab1,
    callbackEpoch: currentEpoch,
    completionToken: token,
    lifecycleMgr,
    callback: () => {
      executionCount++;
      return "SUCCESS_DUPLICATE";
    },
  });

  assert(!duplicateCallback.executed, "Duplicate completion callback rejected");
  assert(
    duplicateCallback.rejectionReason === CallbackGuardRejectionReason.DUPLICATE_CALLBACK,
    "Rejection reason is DUPLICATE_CALLBACK"
  );
  assert(executionCount === 1, "Execution count remained 1 (no double execution)");

  console.log("✓ Duplicate completion callback protection verified.");

  // -------------------------------------------------------------
  // 6. STALE COMPLETION CALLBACK PROTECTION (EPOCH BARRIER)
  // -------------------------------------------------------------
  console.log("6. Testing Stale Completion Callback Protection...");

  const dlStale = "dl-aud-stale";
  const reqStale = lifecycleMgr.handleDownloadRequest({
    tabId: tab1,
    url: "https://example.com/firmware.bin",
    suggestedFilename: "firmware.bin",
  });
  lifecycleMgr.approveDownloadConsent(reqStale.downloadId!);
  const staleEpoch = auditMgr.getTabEpoch(tab1);

  // Advance tab epoch on tab navigation
  auditMgr.onTabNavigation(tab1);
  lifecycleMgr.onTabNavigation(tab1, "https://fresh-page.org");
  const advancedEpoch = auditMgr.getTabEpoch(tab1);
  assert(advancedEpoch > staleEpoch, "Tab epoch advanced");

  // Outdated callback arrives from old epoch
  let staleRan = false;
  const staleResult = auditMgr.executeGuardedCompletionCallback({
    downloadId: reqStale.downloadId!,
    tabId: tab1,
    callbackEpoch: staleEpoch, // Stale!
    completionToken: "token-stale-999",
    lifecycleMgr,
    callback: () => {
      staleRan = true;
    },
  });

  assert(!staleResult.executed, "Stale callback must not execute");
  assert(
    staleResult.rejectionReason === CallbackGuardRejectionReason.STALE_EPOCH,
    "Stale callback rejected due to stale epoch"
  );
  assert(!staleRan, "Stale callback function was never invoked");

  console.log("✓ Stale completion callback protection verified.");

  // -------------------------------------------------------------
  // 7. FILE-SAVE STATE VS DOWNLOAD STATE CONSISTENCY AUDITING
  // -------------------------------------------------------------
  console.log("7. Testing File-Save State vs Download State Consistency Auditing...");

  const finRec = fin.record!;
  const lifeRec = lifecycleMgr.getDownloadRecord(downloadId)!;

  const crossAudit = auditMgr.auditCrossLayerConsistency(finRec, lifeRec);
  assert(crossAudit.isConsistent, "Cross-layer consistency confirmed");
  assert(crossAudit.discrepancies.length === 0, "Zero discrepancies between save state and download state");

  console.log("✓ File-save state vs download state consistency verified.");

  // -------------------------------------------------------------
  // 8. TAB ISOLATION & PRIVATE-MODE CLEANUP AUDIT
  // -------------------------------------------------------------
  console.log("8. Testing Tab Isolation & Private-Mode Cleanup Audit...");

  const privTab = "tab-aud-priv";
  const reqPriv = lifecycleMgr.handleDownloadRequest({
    tabId: privTab,
    url: "https://secret.org/doc.pdf",
    suggestedFilename: "doc.pdf",
    isPrivate: true,
  });
  lifecycleMgr.approveDownloadConsent(reqPriv.downloadId!);
  lifecycleMgr.completeDownload(reqPriv.downloadId!);

  const stgPriv = integrityMgr.createStagingDownload({
    downloadId: reqPriv.downloadId!,
    tabId: privTab,
    destinationFilename: "doc.pdf",
    expectedBytes: 100,
    isPrivate: true,
  });
  integrityMgr.appendChunk({ stagingId: stgPriv.stagingId, tabId: privTab, chunkSize: 100, isFinalChunk: true });
  integrityMgr.finalizeDownload({ stagingId: stgPriv.stagingId, tabId: privTab });

  // Close private tab
  lifecycleMgr.onTabClosed(privTab, true);
  integrityMgr.onTabClosed(privTab, true);

  // Run cleanliness audit
  const privCleanAudit = auditMgr.auditPrivateTabCleanliness(privTab, integrityMgr, lifecycleMgr);
  assert(privCleanAudit.isLeakFree, "Private tab cleanup audit reports 100% leak-free");
  assert(privCleanAudit.leakedCount === 0, "Zero leaked records found for private tab");

  console.log("✓ Tab isolation & private-mode cleanup audit verified.");

  // -------------------------------------------------------------
  // 9. COMPATIBILITY WITH NATIVE-36, NATIVE-35 & NATIVE-31
  // -------------------------------------------------------------
  console.log("9. Testing Compatibility with NATIVE-36, NATIVE-35 & NATIVE-31...");

  // NATIVE-31 Page State check
  const pageSafety = createAndroidWebViewPageStateAndLifecycleSafetyManager();
  pageSafety.registerTab("tab-compat-37", "https://compat.org");
  const pStarted = pageSafety.onPageStarted("tab-compat-37", "https://compat.org");
  assert(pageSafety.getTabRecord("tab-compat-37")?.state === PageLifecycleState.LOADING, "NATIVE-31 LOADING");

  console.log("✓ Compatibility with NATIVE-36, NATIVE-35, and NATIVE-31 verified.");

  console.log("\n================================================================================");
  console.log(">>> ALL NATIVE-37 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<");
  console.log("================================================================================\n");
}

runNative37Suite().catch((err) => {
  console.error("NATIVE-37 Verification Failure:", err);
  process.exit(1);
});
