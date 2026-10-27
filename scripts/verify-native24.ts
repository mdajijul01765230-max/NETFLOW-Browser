import {
  createAndroidWebViewBlobDownloadManager,
  validateBlobOrigin,
  sanitizeBlobFilename,
  BlobDownloadConsentPrompt,
} from "../src/services/androidWebViewBlobDownloadBoundary";
import {
  createAndroidDownloadManager,
  sanitizeDownloadUrl,
  parseAndSanitizeFilename,
} from "../src/services/androidWebViewDownloadBoundary";
import { AndroidSelectedFile } from "../src/services/androidWebViewFileChooser";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative24Verification() {
  console.log("=== STARTING NATIVE-24 BLOB/OBJECT-URL DOWNLOAD & NATIVE-14 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. ORIGIN SECURITY & SSRF PROTECTION FOR BLOB OPERATIONS
  // -------------------------------------------------------------
  console.log("1. Testing Origin Security & SSRF Protection for Blob/Object-URL...");

  assert(!validateBlobOrigin("javascript:alert(1)").isValid, "Rejects javascript:");
  assert(!validateBlobOrigin("file:///sdcard/download").isValid, "Rejects file:");
  assert(!validateBlobOrigin("content://media/external/images").isValid, "Rejects content:");
  assert(!validateBlobOrigin("data:text/html,<script>").isValid, "Rejects data:");
  assert(!validateBlobOrigin("about:blank").isValid, "Rejects about:");
  assert(!validateBlobOrigin("http://remote-insecure.com").isValid, "Rejects insecure remote HTTP");
  assert(!validateBlobOrigin("https://169.254.169.254").isValid, "Rejects cloud metadata IP");
  assert(!validateBlobOrigin("https://192.168.1.100").isValid, "Rejects private IP 192.168.x.x");
  assert(!validateBlobOrigin("https://10.1.2.3").isValid, "Rejects private IP 10.x.x.x");
  assert(!validateBlobOrigin("https://172.25.0.1").isValid, "Rejects private IP 172.16-31.x");
  assert(!validateBlobOrigin("https://internal-server.internal").isValid, "Rejects .internal domain");
  assert(!validateBlobOrigin("https://printer.local").isValid, "Rejects .local domain");

  // Valid origins
  assert(validateBlobOrigin("https://app.netflow.com").isValid, "Accepts valid HTTPS");
  assert(validateBlobOrigin("http://localhost:3000").isValid, "Accepts localhost HTTP");
  assert(validateBlobOrigin("http://127.0.0.1:8080").isValid, "Accepts 127.0.0.1 HTTP");

  console.log("✓ Origin security and SSRF protection verified.");

  // -------------------------------------------------------------
  // 2. MIME TYPE & FILENAME SAFETY
  // -------------------------------------------------------------
  console.log("2. Testing MIME Type & Filename Safety...");

  // Path traversal stripping
  const traversal = sanitizeBlobFilename("../../../etc/passwd.txt", "text/plain");
  assert(!traversal.filename.includes("..") && !traversal.filename.includes("/"), "Strips path traversal ../");
  assert(traversal.filename.endsWith(".txt"), "Preserves safe extension");

  // Windows reserved device name protection
  const reserved = sanitizeBlobFilename("CON.txt", "text/plain");
  assert(reserved.filename.startsWith("safe_CON"), "Prepends safe_ to Windows reserved device names");

  // Dangerous executable extension neutralization
  const apkFile = sanitizeBlobFilename("malware.apk", "application/vnd.android.package-archive");
  assert(apkFile.isDangerous, "Flags APK as dangerous");
  assert(apkFile.filename.endsWith(".apk.download"), "Disarms APK with .download extension");
  assert(apkFile.securityWarning?.includes("Neutralized dangerous executable"), "Provides security warning");

  const exeFile = sanitizeBlobFilename("installer.exe", "application/octet-stream");
  assert(exeFile.isDangerous && exeFile.filename.endsWith(".exe.download"), "Disarms EXE with .download extension");

  const shFile = sanitizeBlobFilename("script.sh", "text/plain");
  assert(shFile.isDangerous && shFile.filename.endsWith(".sh.download"), "Disarms shell script with .download extension");

  // Sensitive URL and auth token leak prevention in filename
  const tokenLeak = sanitizeBlobFilename("report.csv?token=secret123456&auth=admin", "text/csv");
  assert(!tokenLeak.filename.includes("secret123456") && !tokenLeak.filename.includes("admin"), "Strips query auth tokens from filename");

  const bearerLeak = sanitizeBlobFilename("data_bearer_9876543210abcdef.json", "application/json");
  assert(!bearerLeak.filename.includes("9876543210abcdef"), "Redacts bearer tokens embedded in filename");

  console.log("✓ MIME type, path traversal, dangerous extension, and credential leak protections verified.");

  // -------------------------------------------------------------
  // 3. BLOB/OBJECT URL CREATION, USER CONSENT & DOWNLOAD
  // -------------------------------------------------------------
  console.log("3. Testing Blob/Object-URL Creation, User Consent Gating & Download...");

  let activePrompt: BlobDownloadConsentPrompt | null = null;
  const blobMgr = createAndroidWebViewBlobDownloadManager({
    onBlobConsentPromptChange: (p) => {
      activePrompt = p;
    },
  });

  const sampleText = "NETFLOW V2 Generated Report Content";
  const createRes = blobMgr.createObjectUrl(
    "tab-1",
    "https://reports.netflow.com",
    sampleText,
    "text/plain",
    "monthly_report.txt"
  );
  assert(createRes.success && Boolean(createRes.objectUrl), "createObjectUrl succeeded");
  const objUrl = createRes.objectUrl!;
  assert(objUrl.startsWith("blob:https://reports.netflow.com/"), "Object URL has canonical origin");

  // User consent rejection test
  const rejectPromise = blobMgr.handleBlobDownloadRequest(
    "tab-1",
    objUrl,
    "https://reports.netflow.com"
  );
  assert(activePrompt !== null, "Prompt emitted on download request");
  assert(activePrompt!.filename === "monthly_report.txt", "Prompt shows correct filename");
  assert(activePrompt!.origin === "https://reports.netflow.com", "Prompt shows correct origin");

  const dlId1 = activePrompt!.downloadId;
  blobMgr.rejectBlobDownload(dlId1, "User cancelled");
  const rejectResult = await rejectPromise;
  assert(!rejectResult.success && rejectResult.error?.includes("cancelled"), "Rejection handled correctly");
  assert(activePrompt === null, "Prompt cleared after rejection");

  // User consent approval test
  const approvePromise = blobMgr.handleBlobDownloadRequest(
    "tab-1",
    objUrl,
    "https://reports.netflow.com"
  );
  assert(activePrompt !== null, "Second prompt emitted");
  const dlId2 = activePrompt!.downloadId;
  const approvedResult = blobMgr.approveBlobDownload(dlId2);
  const approveAsyncResult = await approvePromise;
  assert(approvedResult.success && approveAsyncResult.success, "Download approved successfully");
  assert(approvedResult.filename === "monthly_report.txt", "Approved download has correct filename");
  assert(approvedResult.mimeType === "text/plain", "Approved download has correct MIME");
  assert(approvedResult.data === sampleText, "Approved download delivers original data buffer");

  // Data URI download support
  const dataUri = "data:text/plain;base64,SGVsbG8gTkVURkxPVw=="; // "Hello NETFLOW"
  const dataUriPromise = blobMgr.handleBlobDownloadRequest(
    "tab-1",
    dataUri,
    "https://reports.netflow.com",
    false,
    "greeting.txt"
  );
  assert(activePrompt !== null, "Data URI prompt emitted");
  const dataDlId = activePrompt!.downloadId;
  blobMgr.approveBlobDownload(dataDlId);
  const dataResult = await dataUriPromise;
  assert(dataResult.success, "Data URI download approved");
  assert(dataResult.filename === "greeting.txt", "Data URI has sanitized filename");

  // Dangerous data URI rejection (e.g. data:text/html)
  const dangerousDataUriRes = await blobMgr.handleBlobDownloadRequest(
    "tab-1",
    "data:text/html,<script>alert(1)</script>",
    "https://reports.netflow.com"
  );
  assert(!dangerousDataUriRes.success, "Rejects dangerous data:text/html URI");

  // Revocation test
  assert(blobMgr.revokeObjectUrl("tab-1", objUrl), "revokeObjectUrl succeeded");
  const postRevokeRes = await blobMgr.handleBlobDownloadRequest(
    "tab-1",
    objUrl,
    "https://reports.netflow.com"
  );
  assert(!postRevokeRes.success && postRevokeRes.error?.includes("ERR_FILE_NOT_FOUND"), "Revoked Blob URL rejected");

  console.log("✓ Blob/Object-URL creation, consent gating, revocation, and Data URI downloads verified.");

  // -------------------------------------------------------------
  // 4. UPLOAD -> PROCESSING -> DOWNLOAD ROUND TRIP
  // -------------------------------------------------------------
  console.log("4. Testing Upload -> Web Page Processing -> Generated-File Download Round Trip...");

  const mockUploadedFile: AndroidSelectedFile = {
    name: "quarterly_metrics.csv",
    size: 2048,
    type: "text/csv",
    lastModified: Date.now(),
    virtualUri: "content://com.android.providers.media.documents/document/101",
  };

  // Perform round trip processing (CSV Summary transformation)
  const roundTripRes = blobMgr.processUploadedFileToBlob(
    "tab-roundtrip",
    "https://analytics.netflow.com",
    mockUploadedFile,
    "csv_summary",
    false
  );

  assert(roundTripRes.success && Boolean(roundTripRes.objectUrl), "Processing uploaded file to Blob succeeded");
  assert(roundTripRes.filename?.startsWith("summary_quarterly_metrics"), "Generated filename reflects processed state");
  assert(roundTripRes.mimeType === "text/csv", "Generated MIME type matches CSV");

  // Download the processed file
  const rtDownloadPromise = blobMgr.handleBlobDownloadRequest(
    "tab-roundtrip",
    roundTripRes.objectUrl!,
    "https://analytics.netflow.com"
  );
  assert(activePrompt !== null, "Prompt emitted for round trip generated file");
  const rtDlId = activePrompt!.downloadId;
  blobMgr.approveBlobDownload(rtDlId);
  const rtDlResult = await rtDownloadPromise;
  assert(rtDlResult.success, "Round-trip generated file downloaded successfully");
  assert(typeof rtDlResult.data === "string" && rtDlResult.data.includes("quarterly_metrics.csv"), "Processed data contains transformed content");

  // JSON Export transformation round trip
  const jsonRoundTrip = blobMgr.processUploadedFileToBlob(
    "tab-roundtrip",
    "https://analytics.netflow.com",
    mockUploadedFile,
    "json_export",
    false
  );
  assert(jsonRoundTrip.success && jsonRoundTrip.filename?.endsWith("_report.json"), "JSON export round trip succeeded");

  console.log("✓ Upload -> Processing -> Download round trip verified.");

  // -------------------------------------------------------------
  // 5. TAB, REQUEST & CANONICAL-ORIGIN ISOLATION
  // -------------------------------------------------------------
  console.log("5. Testing Tab & Canonical-Origin Isolation...");

  const tab1Blob = blobMgr.createObjectUrl(
    "tab-isolated-1",
    "https://origin-a.com",
    "Tab 1 Private Payload",
    "text/plain",
    "tab1_data.txt"
  );
  assert(tab1Blob.success, "Tab 1 Blob created");

  // Cross-Tab Attempt: Tab 2 attempts to download Tab 1's blob
  const crossTabRes = await blobMgr.handleBlobDownloadRequest(
    "tab-isolated-2",
    tab1Blob.objectUrl!,
    "https://origin-a.com"
  );
  assert(!crossTabRes.success && crossTabRes.error?.includes("Cross-tab Blob access blocked"), "Cross-tab Blob access blocked");

  // Cross-Origin Attempt: Origin B attempts to access Origin A's blob
  const crossOriginRes = await blobMgr.handleBlobDownloadRequest(
    "tab-isolated-1",
    tab1Blob.objectUrl!,
    "https://origin-b.com"
  );
  assert(!crossOriginRes.success && crossOriginRes.error?.includes("Cross-origin Blob access rejected"), "Cross-origin Blob access rejected");

  console.log("✓ Tab and canonical-origin isolation verified.");

  // -------------------------------------------------------------
  // 6. LIFECYCLE & CLEANUP: NAVIGATION, RELOAD, STOP, TAB CLOSE
  // -------------------------------------------------------------
  console.log("6. Testing Lifecycle & Cleanup Consistency...");

  // Navigation cleanup: In-flight download aborted, object URLs revoked
  const navBlob = blobMgr.createObjectUrl(
    "tab-nav",
    "https://nav-test.com",
    "Nav Data",
    "text/plain",
    "nav.txt"
  );
  const inFlightNavPromise = blobMgr.handleBlobDownloadRequest(
    "tab-nav",
    navBlob.objectUrl!,
    "https://nav-test.com"
  );
  assert(activePrompt !== null, "Prompt in-flight for nav test");

  blobMgr.onNavigation("tab-nav", "https://nav-test.com/page2");
  const inFlightNavRes = await inFlightNavPromise;
  assert(!inFlightNavRes.success && inFlightNavRes.error?.includes("aborted by tab navigation"), "Pending download aborted on navigation");
  assert(blobMgr.getBlobEntry(navBlob.objectUrl!) === null, "Object URL revoked on navigation");

  // StopLoading cleanup
  const stopBlob = blobMgr.createObjectUrl(
    "tab-stop",
    "https://stop-test.com",
    "Stop Data",
    "text/plain",
    "stop.txt"
  );
  const inFlightStopPromise = blobMgr.handleBlobDownloadRequest(
    "tab-stop",
    stopBlob.objectUrl!,
    "https://stop-test.com"
  );
  assert(activePrompt !== null, "Prompt in-flight for stopLoading test");
  blobMgr.onStopLoading("tab-stop");
  const stopRes = await inFlightStopPromise;
  assert(!stopRes.success && stopRes.error?.includes("cancelled by stopLoading"), "Pending download cancelled on stopLoading");

  // Tab Close and Ephemeral Private Browsing Purge
  const privBlob = blobMgr.createObjectUrl(
    "tab-priv",
    "https://private.netflow.com",
    "Confidential In-Memory Data",
    "text/plain",
    "confidential.txt",
    true // isPrivate = true
  );
  assert(privBlob.success, "Private Blob created");
  assert(blobMgr.getBlobEntry(privBlob.objectUrl!)?.isPrivate === true, "Marked as private blob");

  // Close the last private tab (remainingPrivateTabs = 0)
  blobMgr.onTabClosed("tab-priv", true, 0);
  assert(blobMgr.getBlobEntry(privBlob.objectUrl!) === null, "Private Blob store completely purged on last private tab close");

  blobMgr.destroy();
  console.log("✓ Lifecycle and private mode purging verified.");

  // -------------------------------------------------------------
  // 7. NATIVE-14 DOWNLOAD BOUNDARY REGRESSION CHECK
  // -------------------------------------------------------------
  console.log("7. Testing NATIVE-14 External Download Boundary Regression...");

  // Sanitize Download URL
  assert(!sanitizeDownloadUrl("javascript:evil()").safe, "NATIVE-14 blocks javascript:");
  assert(!sanitizeDownloadUrl("https://169.254.169.254/meta").safe, "NATIVE-14 blocks SSRF");
  assert(sanitizeDownloadUrl("https://files.example.com/doc.pdf").safe, "NATIVE-14 accepts safe HTTPS");

  // Anti-traversal & Filename sanitization
  const n14Traversal = parseAndSanitizeFilename(undefined, "https://files.com/../../secret.txt");
  assert(!n14Traversal.filename.includes(".."), "NATIVE-14 strips path traversal");

  // Dangerous extension check
  const n14Apk = parseAndSanitizeFilename('attachment; filename="evil.apk"');
  assert(n14Apk.isDangerous && n14Apk.extension === ".apk", "NATIVE-14 flags APK as dangerous");

  // Download manager lifecycle
  const n14Mgr = createAndroidDownloadManager();
  const req = n14Mgr.initiateDownload({
    url: "https://files.example.com/safe_file.pdf",
    tabId: "tab-n14",
    contentLength: 1024,
    mimeType: "application/pdf",
    isUserGesture: true,
  });
  assert(req.success && Boolean(req.downloadId), "NATIVE-14 initiateDownload succeeded");
  assert(req.metadata?.status === "pending_user_consent", "NATIVE-14 creates pending user consent prompt");
  const consentPrompt = n14Mgr.getUserConsentPrompt(req.downloadId!);
  assert(consentPrompt !== null && consentPrompt.filename.endsWith(".pdf"), "NATIVE-14 returns consent prompt");

  n14Mgr.cancelDownloadsForTab("tab-n14");
  const cancelledMeta = n14Mgr.getDownload(req.downloadId!);
  assert(cancelledMeta?.status === "failed", "NATIVE-14 cancelled downloads on tab cleanup");

  console.log("✓ NATIVE-14 regression check PASSED.");
  console.log("=== ALL NATIVE-24 AND NATIVE-14 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative24Verification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
