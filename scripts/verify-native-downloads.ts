/**
 * NETFLOW BROWSER V2 — FORM 2 OF 7 VERIFICATION SUITE
 * EXECUTION MARKER: NETFLOW-NATIVE-DOWNLOADS-01
 *
 * Verifies:
 * 1. Contract documentation (docs/NATIVE_CONTRACT.md) for onDownloadRequested,
 *    onDownloadProgress, onDownloadCompleted, onDownloadUnsupported, and
 *    commands resolveDownload, cancelDownload, openDownload, deleteDownload, reconcileDownloads.
 * 2. Display URL sanitization (origin + path only; query/fragment/credentials stripped)
 *    and userAgent omission on onDownloadRequested.
 * 3. Filename sanitization (strip path separators & control chars, max 120 chars,
 *    automatic extension from mimeType when missing).
 * 4. Unsupported schemes (blob:, data:) emit onDownloadUnsupported and auto-deny.
 * 5. Private tab isolation: private tabs never enqueue native DownloadManager transfers.
 * 6. Lifecycle & state transitions: queued -> running -> waiting_network -> paused -> completed / failed,
 *    tab-close pending request auto-deny, cancelDownload, openDownload, deleteDownload, reconcileDownloads.
 * 7. Java NetflowDownloadManager static audit (android.app.DownloadManager only, no BroadcastReceiver,
 *    1s polling only while active, Cookie header never logged/leaked, API 29 destination split,
 *    ActivityNotFoundException guard on openDownload).
 */

import fs from "node:fs";
import path from "node:path";
import {
  createNativeBrowserEngine,
  sanitizeDownloadDisplayUrl,
  sanitizeDownloadFileName,
  NativeDownloadRequestedContractEvent,
  NativeDownloadProgressContractEvent,
  NativeDownloadCompletedContractEvent,
  NativeDownloadUnsupportedContractEvent,
} from "../src/services/nativeBrowserEngine";
import { createAndroidWebViewDownloadPersistenceManager } from "../src/services/androidWebViewDownloadPersistenceAndRecovery";
import { DownloadLifecycleState } from "../src/services/androidWebViewDownloadRequestLifecycle";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=================================================================");
console.log("NETFLOW BROWSER V2 — NATIVE DOWNLOADS VERIFICATION (FORM 2 OF 7)");
console.log("Marker: NETFLOW-NATIVE-DOWNLOADS-01");
console.log("=================================================================\n");

// ---------------------------------------------------------------------------
// 1. Contract Documentation Checks (docs/NATIVE_CONTRACT.md)
// ---------------------------------------------------------------------------
console.log("1. Checking docs/NATIVE_CONTRACT.md download events & commands...");
const rootDir = process.cwd();
const contractMd = fs.readFileSync(path.resolve(rootDir, "docs/NATIVE_CONTRACT.md"), "utf8");

assert(
  contractMd.includes("`onDownloadRequested`") &&
    contractMd.includes('"isPrivate": false') &&
    contractMd.includes("`userAgent` is **strictly omitted**"),
  "Contract documents onDownloadRequested with sanitized url, userAgent omitted, isPrivate:false"
);
assert(
  contractMd.includes("`onDownloadProgress`") &&
    contractMd.includes('"queued" | "running" | "waiting_network" | "paused" | "completed" | "failed"'),
  "Contract documents onDownloadProgress with all 6 states"
);
assert(
  contractMd.includes("`onDownloadCompleted`") &&
    contractMd.includes("`onDownloadUnsupported`"),
  "Contract documents onDownloadCompleted and onDownloadUnsupported"
);
assert(
  contractMd.includes("`resolveDownload`") &&
    contractMd.includes("`cancelDownload`") &&
    contractMd.includes("`openDownload`") &&
    contractMd.includes("`deleteDownload`") &&
    contractMd.includes("`reconcileDownloads`"),
  "Contract documents resolveDownload, cancelDownload, openDownload, deleteDownload, reconcileDownloads"
);

// ---------------------------------------------------------------------------
// 2. Display URL & Filename Sanitization Checks
// ---------------------------------------------------------------------------
console.log("\n2. Checking sanitizeDownloadDisplayUrl & sanitizeDownloadFileName...");

const sanitizedDisplay1 = sanitizeDownloadDisplayUrl(
  "https://user:secret@cdn.example.com:8443/files/v2/archive.zip?token=abc123&sig=xyz#section2"
);
assert(
  sanitizedDisplay1 === "https://cdn.example.com:8443/files/v2/archive.zip" &&
    !sanitizedDisplay1.includes("token=") &&
    !sanitizedDisplay1.includes("secret") &&
    !sanitizedDisplay1.includes("#"),
  "sanitizeDownloadDisplayUrl keeps origin+path only and strips credentials/query/fragment",
  `got: ${sanitizedDisplay1}`
);

const traversalName = sanitizeDownloadFileName("../../etc/passwd\x00\x1f/report", "application/pdf");
assert(
  !traversalName.includes("/") &&
    !traversalName.includes("\\") &&
    !traversalName.includes("..") &&
    !traversalName.includes("\x00") &&
    traversalName.endsWith(".pdf"),
  "sanitizeDownloadFileName strips path separators, traversal dots, control chars, and adds .pdf from mimeType",
  `got: ${traversalName}`
);

const longRawName = "a".repeat(160);
const longSanitized = sanitizeDownloadFileName(longRawName, "application/vnd.android.package-archive");
assert(
  longSanitized.length === 120 && longSanitized.endsWith(".apk"),
  "sanitizeDownloadFileName caps length at 120 chars while preserving .apk extension",
  `len=${longSanitized.length}, val=${longSanitized}`
);

// ---------------------------------------------------------------------------
// 3. NativeBrowserEngine Download Event & Command Lifecycle
// ---------------------------------------------------------------------------
console.log("\n3. Checking NativeBrowserEngine download events, commands, and guards...");

const sentCommands: Array<{ action: string; payload: Record<string, any> }> = [];
const receivedRequests: NativeDownloadRequestedContractEvent[] = [];
const receivedProgress: NativeDownloadProgressContractEvent[] = [];
const receivedCompleted: NativeDownloadCompletedContractEvent[] = [];
const receivedUnsupported: NativeDownloadUnsupportedContractEvent[] = [];

(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.NetflowNativeBridge = {
  isAvailable: () => true,
  getChromiumVersion: () => "124.0.6367.82",
  postMessage: (jsonStr: string) => {
    const parsed = JSON.parse(jsonStr);
    sentCommands.push({ action: parsed.action, payload: parsed });
  },
};

const engine = createNativeBrowserEngine({
  onDownloadRequested: (ev) => receivedRequests.push(ev),
  onDownloadProgress: (ev) => receivedProgress.push(ev),
  onDownloadCompleted: (ev) => receivedCompleted.push(ev),
  onDownloadUnsupported: (ev) => receivedUnsupported.push(ev),
});

engine.createOrUpdateTab("tab-normal", { isPrivate: false });
engine.selectTab("tab-normal", false);

// 3a. Emit onDownloadRequested with query string and userAgent in raw payload -> must be sanitized & userAgent omitted
engine.handleNativeEngineEvent({
  eventType: "onDownloadRequested",
  tabId: "tab-normal",
  requestId: "req-dl-1",
  url: "https://files.example.org/pub/manual?session=secret_tok#top",
  userAgent: "Mozilla/5.0 SecretUA",
  mimeType: "application/pdf",
  contentLength: 1048576,
  suggestedFileName: "../manual",
  isPrivate: false,
});

assert(
  receivedRequests.length === 1 &&
    receivedRequests[0].requestId === "req-dl-1" &&
    receivedRequests[0].url === "https://files.example.org/pub/manual" &&
    receivedRequests[0].suggestedFileName === "manual.pdf" &&
    receivedRequests[0].isPrivate === false &&
    !("userAgent" in (receivedRequests[0] as any)),
  "onDownloadRequested sanitizes display URL, sanitizes suggestedFileName with MIME extension, and omits userAgent"
);

// 3b. Resolve download with allow:true and custom unsanitized fileName
const resolvedOk = engine.resolveDownload({
  requestId: "req-dl-1",
  allow: true,
  fileName: "..\\custom/quarterly_report",
});
const lastCmd = sentCommands[sentCommands.length - 1];
assert(
  resolvedOk === true &&
    lastCmd?.action === "resolveDownload" &&
    lastCmd.payload.requestId === "req-dl-1" &&
    lastCmd.payload.allow === true &&
    lastCmd.payload.fileName === "custom_quarterly_report.pdf",
  "resolveDownload(allow:true) dispatches sanitized fileName with MIME extension",
  JSON.stringify(lastCmd)
);

// 3c. Duplicate resolveDownload for same requestId must be rejected
const duplicateResolve = engine.resolveDownload({
  requestId: "req-dl-1",
  allow: false,
});
assert(
  duplicateResolve === false,
  "Duplicate resolveDownload for already-resolved requestId is ignored"
);

// 3d. Unsupported blob: and data: download requests
engine.handleNativeEngineEvent({
  eventType: "onDownloadRequested",
  tabId: "tab-normal",
  requestId: "req-blob-1",
  url: "blob:https://example.org/550e8400-e29b-41d4-a716-446655440000",
  mimeType: "application/pdf",
  contentLength: 500,
  suggestedFileName: "blob.pdf",
});
assert(
  receivedUnsupported.length === 1 &&
    receivedUnsupported[0].scheme === "blob" &&
    receivedUnsupported[0].reasonCode === "UNSUPPORTED_DOWNLOAD_TYPE",
  "blob: download request emits onDownloadUnsupported and never prompts consent"
);

engine.handleNativeEngineEvent({
  eventType: "onDownloadUnsupported",
  tabId: "tab-normal",
  url: "data:application/pdf;base64,JVBERi0xLjQ=",
  scheme: "data",
  reasonCode: "UNSUPPORTED_DOWNLOAD_TYPE",
  message: "blob: and data: downloads are not supported by the native Android system downloader.",
});
assert(
  receivedUnsupported.length === 2 && receivedUnsupported[1].scheme === "data",
  "Direct onDownloadUnsupported event for data: URL is forwarded to shell callback"
);

// 3e. Private tab download requests are rejected and never forwarded to consent UI
engine.createOrUpdateTab("tab-private", { isPrivate: true });
const reqCountBeforePrivate = receivedRequests.length;
engine.handleNativeEngineEvent({
  eventType: "onDownloadRequested",
  tabId: "tab-private",
  requestId: "req-priv-1",
  url: "https://files.example.org/secret.pdf",
  mimeType: "application/pdf",
  contentLength: 2048,
  suggestedFileName: "secret.pdf",
  isPrivate: true,
});
const privDenyCmd = sentCommands[sentCommands.length - 1];
assert(
  receivedRequests.length === reqCountBeforePrivate &&
    privDenyCmd?.action === "resolveDownload" &&
    privDenyCmd.payload.requestId === "req-priv-1" &&
    privDenyCmd.payload.allow === false,
  "Private tab download request is auto-denied and never enqueued natively"
);

// 3f. Tab close auto-denies pending download request
engine.handleNativeEngineEvent({
  eventType: "onDownloadRequested",
  tabId: "tab-normal",
  requestId: "req-close-cancel",
  url: "https://files.example.org/pending.zip",
  mimeType: "application/zip",
  contentLength: 4096,
  suggestedFileName: "pending.zip",
});
engine.closeTab("tab-normal");
const closeDenyCmd = sentCommands.find(
  (c) => c.action === "resolveDownload" && c.payload.requestId === "req-close-cancel"
);
assert(
  Boolean(closeDenyCmd && closeDenyCmd.payload.allow === false),
  "Closing a tab auto-denies any pending native download consent request for that tab"
);

// 3g. Progress state transitions & completion
engine.createOrUpdateTab("tab-dl", { isPrivate: false });
const statesToTest: Array<NativeDownloadProgressContractEvent["state"]> = [
  "queued",
  "running",
  "waiting_network",
  "paused",
  "completed",
  "failed",
];
for (const st of statesToTest) {
  engine.handleNativeEngineEvent({
    eventType: "onDownloadProgress",
    downloadId: "900101",
    tabId: "tab-dl",
    state: st,
    bytes: 512000,
    total: 1024000,
    reasonCode: st === "waiting_network" ? "PAUSED_WAITING_FOR_NETWORK" : "STATUS_UPDATE",
  });
}
assert(
  receivedProgress.length === 6 &&
    receivedProgress.map((p) => p.state).join(",") ===
      "queued,running,waiting_network,paused,completed,failed",
  "onDownloadProgress handles all 6 contract states (queued, running, waiting_network, paused, completed, failed)"
);

engine.handleNativeEngineEvent({
  eventType: "onDownloadCompleted",
  downloadId: "900101",
  tabId: "tab-dl",
  fileName: "../invoice_2026",
  mimeType: "application/pdf",
  bytes: 1024000,
  total: 1024000,
});
assert(
  receivedCompleted.length === 1 &&
    receivedCompleted[0].downloadId === "900101" &&
    receivedCompleted[0].fileName === "invoice_2026.pdf" &&
    receivedCompleted[0].mimeType === "application/pdf",
  "onDownloadCompleted sanitizes fileName and delivers completed metadata"
);

// 3h. Outbound commands: cancelDownload, openDownload, deleteDownload, reconcileDownloads
assert(
  engine.cancelDownload({ downloadId: "900101" }) &&
    sentCommands[sentCommands.length - 1].action === "cancelDownload" &&
    sentCommands[sentCommands.length - 1].payload.downloadId === "900101",
  "cancelDownload sends { action: 'cancelDownload', downloadId: '900101' }"
);
assert(
  engine.openDownload({ downloadId: "900101" }) &&
    sentCommands[sentCommands.length - 1].action === "openDownload" &&
    sentCommands[sentCommands.length - 1].payload.downloadId === "900101",
  "openDownload sends { action: 'openDownload', downloadId: '900101' }"
);
assert(
  engine.deleteDownload({ downloadId: "900101" }) &&
    sentCommands[sentCommands.length - 1].action === "deleteDownload" &&
    sentCommands[sentCommands.length - 1].payload.downloadId === "900101",
  "deleteDownload sends { action: 'deleteDownload', downloadId: '900101' }"
);
assert(
  engine.reconcileDownloads({ downloadIds: ["900101", "900102"] }) &&
    sentCommands[sentCommands.length - 1].action === "reconcileDownloads" &&
    Array.isArray(sentCommands[sentCommands.length - 1].payload.downloadIds) &&
    sentCommands[sentCommands.length - 1].payload.downloadIds.length === 2,
  "reconcileDownloads sends { action: 'reconcileDownloads', downloadIds: ['900101', '900102'] }"
);

// ---------------------------------------------------------------------------
// 4. Persistence & Recovery State Transition Verification
// ---------------------------------------------------------------------------
console.log("\n4. Checking persistence state transitions (running -> waiting_network -> running -> completed)...");
const persistenceMgr = createAndroidWebViewDownloadPersistenceManager({
  allowLocalStorage: false,
});

const persistedOk = persistenceMgr.persistDownload({
  downloadId: "900200",
  tabId: "tab-dl",
  requestEpoch: 1,
  sourceUrl: "https://mirror.example.com/releases/app.apk",
  sanitizedUrl: "https://mirror.example.com/releases/app.apk",
  domain: "mirror.example.com",
  filename: "app.apk",
  sanitizedFilename: "app.apk",
  extension: ".apk",
  mimeType: "application/vnd.android.package-archive",
  totalBytes: 4000000,
  state: DownloadLifecycleState.DOWNLOADING,
  isPrivate: false,
  isDangerousExtension: true,
  startTime: Date.now(),
  abortController: null,
  progress: {
    bytesDownloaded: 1000000,
    totalBytes: 4000000,
    percentage: 25,
    speedBps: 0,
    estimatedRemainingMs: 0,
    lastUpdateTime: Date.now(),
  },
});
assert(persistedOk, "Initial non-private native download persisted");

persistenceMgr.markDownloadInterrupted("900200", "PAUSED_WAITING_FOR_NETWORK");
const pausedRec = persistenceMgr.getPersistedDownload("900200");
assert(
  pausedRec?.lifecycleState === DownloadLifecycleState.PAUSED &&
    pausedRec?.failureReason === "PAUSED_WAITING_FOR_NETWORK",
  "waiting_network transitions persisted record to PAUSED with reasonCode"
);

persistenceMgr.updateDownloadProgress(
  "900200",
  2500000,
  4000000,
  DownloadLifecycleState.DOWNLOADING
);
const resumedRec = persistenceMgr.getPersistedDownload("900200");
assert(
  resumedRec?.lifecycleState === DownloadLifecycleState.DOWNLOADING &&
    resumedRec?.receivedBytes === 2500000 &&
    resumedRec?.failureReason === undefined,
  "running updateDownloadProgress restores DOWNLOADING state and updates bytes"
);

persistenceMgr.markDownloadCompleted("900200");
const completedRec = persistenceMgr.getPersistedDownload("900200");
assert(
  completedRec?.lifecycleState === DownloadLifecycleState.COMPLETED,
  "markDownloadCompleted transitions record to COMPLETED"
);

// ---------------------------------------------------------------------------
// 5. Java NetflowDownloadManager Static Verification
// ---------------------------------------------------------------------------
console.log("\n5. Checking NetflowDownloadManager.java static invariants...");
const javaDlSrc = fs.readFileSync(
  path.resolve(rootDir, "android/app/src/main/java/com/netflow/browser/NetflowDownloadManager.java"),
  "utf8"
);
const javaDlNoComments = javaDlSrc
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

assert(
  javaDlNoComments.includes("import android.app.DownloadManager;") &&
    !javaDlNoComments.includes("BroadcastReceiver") &&
    !javaDlNoComments.includes("registerReceiver"),
  "NetflowDownloadManager uses android.app.DownloadManager and has NO BroadcastReceiver"
);
assert(
  javaDlNoComments.includes("POLL_INTERVAL_MS = 1000L") &&
    javaDlNoComments.includes("new DownloadManager.Query()") &&
    javaDlNoComments.includes("if (!activeDownloads.isEmpty())"),
  "NetflowDownloadManager polls DownloadManager.Query every 1s only while downloads are active"
);
assert(
  javaDlNoComments.includes("CookieManager.getInstance().getCookie(pending.rawUrl)") &&
    javaDlNoComments.includes('request.addRequestHeader("Cookie"') &&
    !javaDlNoComments.includes("Log.d") &&
    !javaDlNoComments.includes("Log.v"),
  "Cookie header is attached to DownloadManager.Request and never logged or emitted to shell"
);
assert(
  javaDlNoComments.includes("Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q") &&
    javaDlNoComments.includes("setDestinationInExternalPublicDir") &&
    javaDlNoComments.includes("setDestinationInExternalFilesDir"),
  "Destination uses public Downloads on API >= 29 and app-specific external files dir on API < 29"
);
assert(
  javaDlNoComments.includes("getUriForDownloadedFile(sysId)") &&
    javaDlNoComments.includes("Intent.ACTION_VIEW") &&
    javaDlNoComments.includes("Intent.FLAG_GRANT_READ_URI_PERMISSION") &&
    javaDlNoComments.includes("catch (ActivityNotFoundException"),
  "openDownload uses getUriForDownloadedFile + ACTION_VIEW + FLAG_GRANT_READ_URI_PERMISSION and catches ActivityNotFoundException"
);
assert(
  javaDlNoComments.includes("PENDING_DOWNLOAD_TIMEOUT_MS = 30000L") &&
    javaDlNoComments.includes("expirePendingDownloadRequestOnUiThread(requestId)") &&
    javaDlNoComments.includes("completedDownloads.clear()"),
  "Form 8 (F-11 & F-15): NetflowDownloadManager enforces 30s auto-expiry on pendingRequests and clears completedDownloads on destroy"
);

engine.destroy();

console.log("\n=================================================================");
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=================================================================");

if (failed > 0) {
  process.exit(1);
}
