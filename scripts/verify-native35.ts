import {
  createAndroidWebViewDownloadRequestLifecycleManager,
  validateAndSanitizeDownloadUrl,
  sanitizeDownloadFilename,
  formatByteSize,
  DownloadLifecycleState,
  DownloadBlockReason,
} from "../src/services/androidWebViewDownloadRequestLifecycle";

import {
  createAndroidWebViewPageStateAndLifecycleSafetyManager,
  PageLifecycleState,
} from "../src/services/androidWebViewPageStateAndLifecycleSafety";

import {
  createAndroidWebViewRenderingResilienceManager,
  RenderingState,
} from "../src/services/androidWebViewRenderingResilience";

import {
  createAndroidWebViewMediaResourceManager,
  MemoryPressureLevel,
} from "../src/services/androidWebViewMediaResourceGovernance";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative35Verification() {
  console.log("=== STARTING NATIVE-35 WEBVIEW DOWNLOAD REQUEST ROUTING & SAFE DOWNLOAD LIFECYCLE SUITE ===");

  // -------------------------------------------------------------
  // 1. URL SCHEME & SSRF / INTERNAL DESTINATION DEFENSE
  // -------------------------------------------------------------
  console.log("1. Testing URL Scheme, SSRF & Dangerous Scheme Blocking...");

  // Block dangerous schemes
  const maliciousSchemes = [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "content://contacts/people",
    "intent://scan/#Intent;scheme=zxing;end",
    "about:blank",
    "chrome://version",
    "vbscript:msgbox",
  ];

  for (const url of maliciousSchemes) {
    const res = validateAndSanitizeDownloadUrl(url);
    assert(!res.isValid, `Should block malicious scheme: ${url}`);
    assert(
      res.blockReason === DownloadBlockReason.MALICIOUS_SCHEME,
      `Should flag MALICIOUS_SCHEME for ${url}`
    );
  }

  // Block SSRF and private / metadata IP ranges
  const ssrfTargets = [
    "http://127.0.0.1/backup.tar.gz",
    "http://localhost:8080/passwords.txt",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/router-firmware.bin",
    "http://10.0.0.15/intranet-report.pdf",
    "http://172.16.50.1/private-keys.zip",
    "http://mycompany.internal/secret.doc",
    "http://server.local/share.zip",
  ];

  for (const url of ssrfTargets) {
    const res = validateAndSanitizeDownloadUrl(url);
    assert(!res.isValid, `Should block SSRF / internal target: ${url}`);
    assert(
      res.blockReason === DownloadBlockReason.INTERNAL_OR_METADATA_IP,
      `Should flag INTERNAL_OR_METADATA_IP for ${url}`
    );
  }

  // Allow legitimate HTTPS and sanitize sensitive auth tokens
  const cleanUrl = validateAndSanitizeDownloadUrl(
    "https://example.com/files/report.pdf?token=secret123&session=xyz999&page=1"
  );
  assert(cleanUrl.isValid, "Valid HTTPS URL is accepted");
  assert(cleanUrl.domain === "example.com", "Domain is parsed correctly");
  assert(!cleanUrl.sanitizedUrl?.includes("token="), "Token parameter stripped");
  assert(!cleanUrl.sanitizedUrl?.includes("session="), "Session parameter stripped");
  assert(cleanUrl.sanitizedUrl?.includes("page=1"), "Benign parameters retained");

  console.log("✓ URL scheme & SSRF / internal network defenses verified.");

  // -------------------------------------------------------------
  // 2. FILENAME SANITIZATION, PATH TRAVERSAL & EXECUTABLE DETECTION
  // -------------------------------------------------------------
  console.log("2. Testing Path Traversal, Null Bytes & Executable Extension Sanitization...");

  // Path traversal attempts
  const traversalAttempts = [
    "../../etc/shadow",
    "..\\..\\windows\\system32\\cmd.exe",
    "....//....//config.json",
    "normal_file/../../../sensitive.env",
  ];

  for (const name of traversalAttempts) {
    const sanitized = sanitizeDownloadFilename(name);
    assert(sanitized.hasTraversalAttempt, `Traversal detected for: ${name}`);
    assert(!sanitized.cleanFilename.includes(".."), `Dots stripped in: ${sanitized.cleanFilename}`);
    assert(!sanitized.cleanFilename.includes("/"), `Forward slash stripped in: ${sanitized.cleanFilename}`);
    assert(!sanitized.cleanFilename.includes("\\"), `Backslash stripped in: ${sanitized.cleanFilename}`);
  }

  // Windows reserved device names
  const reservedNames = ["CON.txt", "prn.pdf", "aux.zip", "NUL.bin", "COM1.dat", "LPT2.log"];
  for (const name of reservedNames) {
    const sanitized = sanitizeDownloadFilename(name);
    assert(
      sanitized.cleanFilename.startsWith("file_"),
      `Reserved device name ${name} safely prefixed: ${sanitized.cleanFilename}`
    );
  }

  // Dangerous executable extensions
  const dangerousFiles = [
    "update.apk",
    "setup.exe",
    "script.sh",
    "installer.msi",
    "macro.vbs",
    "payload.jar",
    "module.so",
    "library.dll",
    "run.ps1",
  ];

  for (const file of dangerousFiles) {
    const sanitized = sanitizeDownloadFilename(file);
    assert(sanitized.isDangerousExtension, `Flagged dangerous extension for: ${file}`);
    assert(typeof sanitized.securityWarning === "string", `Has security warning for: ${file}`);
  }

  // Safe file formats
  const safeFiles = ["report.pdf", "avatar.png", "data.json", "document.txt", "archive.zip"];
  for (const file of safeFiles) {
    const sanitized = sanitizeDownloadFilename(file);
    assert(!sanitized.isDangerousExtension, `Safe file should not be flagged: ${file}`);
  }

  // MIME fallback
  const mimeFallback = sanitizeDownloadFilename("", undefined, "https://example.com/download", "application/pdf");
  assert(mimeFallback.extension === ".pdf", "MIME fallback assigned .pdf extension");

  console.log("✓ Filename sanitization, traversal shields & executable detection verified.");

  // -------------------------------------------------------------
  // 3. COMPLETE DOWNLOAD REQUEST LIFECYCLE STATE MACHINE
  // -------------------------------------------------------------
  console.log("3. Testing Full Download Lifecycle State Transitions (Consent -> Progress -> Complete)...");

  const manager = createAndroidWebViewDownloadRequestLifecycleManager();
  const tabA = "tab-native35-a";
  manager.registerTab(tabA, false);

  // Initiate download request
  const requestResult = manager.handleDownloadRequest({
    tabId: tabA,
    url: "https://files.example.com/docs/manual.pdf",
    suggestedFilename: "manual.pdf",
    contentLength: 2048576, // 2 MB
    mimeType: "application/pdf",
  });

  assert(requestResult.accepted, "Download request accepted");
  assert(requestResult.state === DownloadLifecycleState.PENDING_CONSENT, "State is PENDING_CONSENT");
  assert(requestResult.requiresConsent, "Requires user consent");
  const dlId = requestResult.downloadId!;
  assert(typeof dlId === "string", "Valid downloadId issued");

  // Check pending consent list
  const pendingList = manager.getPendingConsentRequests(tabA);
  assert(pendingList.length === 1, "Pending consent request listed for tabA");
  assert(pendingList[0].filename === "manual.pdf", "Filename matches");
  assert(pendingList[0].sizeFormatted.includes("MB"), "Formatted size includes MB");

  // Approve consent
  const approved = manager.approveDownloadConsent(dlId);
  assert(approved, "Consent approved");
  const recordAfterApprove = manager.getDownloadRecord(dlId);
  assert(recordAfterApprove?.state === DownloadLifecycleState.DOWNLOADING, "State is DOWNLOADING");

  // Progress updates
  const prog1 = manager.updateDownloadProgress(dlId, 1024288, 2048576); // 50%
  assert(prog1, "Progress update 1 accepted");
  const recProg1 = manager.getDownloadRecord(dlId);
  assert(recProg1?.progress.percentage === 50, "Percentage is 50%");
  assert(recProg1?.progress.bytesDownloaded === 1024288, "Bytes downloaded is 1MB");

  const prog2 = manager.updateDownloadProgress(dlId, 2048576, 2048576); // 100%
  assert(prog2, "Progress update 2 accepted");
  const recProg2 = manager.getDownloadRecord(dlId);
  assert(recProg2?.progress.percentage === 100, "Percentage is 100%");

  // Complete download
  const completed = manager.completeDownload(dlId);
  assert(completed, "Download marked as completed");
  const recCompleted = manager.getDownloadRecord(dlId);
  assert(recCompleted?.state === DownloadLifecycleState.COMPLETED, "State is COMPLETED");
  assert(typeof recCompleted?.endTime === "number", "End time recorded");

  console.log("✓ Full download lifecycle state progression verified.");

  // -------------------------------------------------------------
  // 4. DUPLICATE / RAPID DOWNLOAD REQUEST DEBOUNCE PROTECTION
  // -------------------------------------------------------------
  console.log("4. Testing Duplicate / Rapid Download Request Debounce Protection...");

  const floodUrl = "https://files.example.com/large/dataset.zip";

  // First request
  const firstReq = manager.handleDownloadRequest({
    tabId: tabA,
    url: floodUrl,
    suggestedFilename: "dataset.zip",
    contentLength: 52428800,
    mimeType: "application/zip",
  });
  assert(firstReq.accepted, "Initial request accepted");

  // Immediate identical duplicate request
  const rapidDuplicate = manager.handleDownloadRequest({
    tabId: tabA,
    url: floodUrl,
    suggestedFilename: "dataset.zip",
    contentLength: 52428800,
    mimeType: "application/zip",
  });

  assert(!rapidDuplicate.accepted, "Rapid duplicate request debounced/rejected");
  assert(
    rapidDuplicate.blockReason === DownloadBlockReason.RATE_LIMIT_EXCEEDED,
    "Reason is RATE_LIMIT_EXCEEDED"
  );
  assert(rapidDuplicate.downloadId === firstReq.downloadId, "Returns existing in-flight download ID");

  console.log("✓ Duplicate/rapid download request debounce protection verified.");

  // -------------------------------------------------------------
  // 5. PER-TAB DOWNLOAD STATE ISOLATION
  // -------------------------------------------------------------
  console.log("5. Testing Per-Tab Download State Isolation...");

  const tabB = "tab-native35-b";
  manager.registerTab(tabB, false);

  const tabBReq = manager.handleDownloadRequest({
    tabId: tabB,
    url: "https://files.example.com/b/file.csv",
    suggestedFilename: "file.csv",
    mimeType: "text/csv",
  });
  assert(tabBReq.accepted, "Tab B download accepted");

  const tabADownloads = manager.getDownloadsForTab(tabA);
  const tabBDownloads = manager.getDownloadsForTab(tabB);

  assert(
    tabADownloads.every((d) => d.tabId === tabA),
    "All Tab A downloads have tabId tabA"
  );
  assert(
    tabBDownloads.every((d) => d.tabId === tabB),
    "All Tab B downloads have tabId tabB"
  );
  assert(
    !tabADownloads.some((d) => d.downloadId === tabBReq.downloadId),
    "Tab A downloads do not contain Tab B downloadId"
  );

  console.log("✓ Per-tab download state isolation verified.");

  // -------------------------------------------------------------
  // 6. EPHEMERAL PRIVATE-TAB ISOLATION & IMMEDIATE PURGE
  // -------------------------------------------------------------
  console.log("6. Testing Ephemeral Private-Tab Isolation & Immediate Purge...");

  const privateTab = "tab-native35-incognito";
  manager.registerTab(privateTab, true);

  const privReq = manager.handleDownloadRequest({
    tabId: privateTab,
    url: "https://secure.example.com/statement.pdf",
    suggestedFilename: "statement.pdf",
    isPrivate: true,
    mimeType: "application/pdf",
  });
  assert(privReq.accepted, "Private tab download accepted");
  const privRec = manager.getDownloadRecord(privReq.downloadId!);
  assert(privRec?.isPrivate === true, "Private download marked isPrivate: true");

  // Close private tab
  const purgeResult = manager.onTabClosed(privateTab, true, 0);
  assert(purgeResult.cleanedCount >= 1, "Private tab download cleaned up on close");

  const privRecAfterClose = manager.getDownloadRecord(privReq.downloadId!);
  assert(privRecAfterClose === null, "Private download record completely purged from memory");

  console.log("✓ Ephemeral private-tab download state isolation & purge verified.");

  // -------------------------------------------------------------
  // 7. NAVIGATION & TAB CLOSE CLEANUP
  // -------------------------------------------------------------
  console.log("7. Testing Navigation & Tab Close Cleanup...");

  const tabC = "tab-native35-c";
  manager.registerTab(tabC, false);

  const pendingReq = manager.handleDownloadRequest({
    tabId: tabC,
    url: "https://files.example.com/pending/app.bin",
    suggestedFilename: "app.bin",
    mimeType: "application/octet-stream",
  });
  assert(pendingReq.accepted, "Download request accepted");

  // Tab navigates away to a new page
  const navClean = manager.onTabNavigation(tabC, "https://files.example.com/other-page");
  assert(navClean.cancelledCount === 1, "Pending download cancelled on tab navigation");

  const recNavCancelled = manager.getDownloadRecord(pendingReq.downloadId!);
  assert(
    recNavCancelled?.state === DownloadLifecycleState.CANCELLED,
    "State is CANCELLED after navigation"
  );
  assert(
    recNavCancelled?.blockReason === DownloadBlockReason.NAVIGATION_CANCELLED,
    "Reason is NAVIGATION_CANCELLED"
  );

  console.log("✓ Navigation & tab close cleanup verified.");

  // -------------------------------------------------------------
  // 8. COMPATIBILITY: NATIVE-31, NATIVE-30, NATIVE-29
  // -------------------------------------------------------------
  console.log("8. Testing Compatibility with NATIVE-31, NATIVE-30 & NATIVE-29...");

  const pageSafety = createAndroidWebViewPageStateAndLifecycleSafetyManager();
  const rendering = createAndroidWebViewRenderingResilienceManager();
  const mediaResources = createAndroidWebViewMediaResourceManager();

  const tabX = "tab-native35-compat";
  manager.registerTab(tabX, false);
  pageSafety.registerTab(tabX, "https://example.com/media-app", false);
  rendering.registerTab(tabX, "https://example.com/media-app", false);
  mediaResources.setActiveForegroundTab(tabX);

  // Trigger download request during active page load
  const dlCompat = manager.handleDownloadRequest({
    tabId: tabX,
    url: "https://example.com/audio/podcast.mp3",
    suggestedFilename: "podcast.mp3",
    mimeType: "audio/mpeg",
  });
  assert(dlCompat.accepted, "Download request accepted during page load");

  // Advance NATIVE-31 page lifecycle
  pageSafety.onDOMContentLoaded(tabX, 1);
  pageSafety.onPageFinished(tabX, 1);
  assert(pageSafety.getTabRecord(tabX)?.state === PageLifecycleState.LOADED, "NATIVE-31 LOADED");

  // Trigger NATIVE-30 rendering guarded callback
  const frameResult = rendering.executeGuardedRenderCallback(tabX, 1, () => "frame-rendered");
  assert(frameResult.isValid && frameResult.executed, "NATIVE-30 Frame executed");

  // Trigger NATIVE-29 media allocation and memory pressure event
  const allocRes = mediaResources.allocateMediaResource(tabX, "https://example.com", "audio", "https://example.com/audio.mp3");
  assert(allocRes.success, "NATIVE-29 media resource allocation works");
  const memResult = mediaResources.handleMemoryPressure(MemoryPressureLevel.MODERATE);
  assert(typeof memResult.freedBytes === "number", "NATIVE-29 memory pressure handled");

  // Verify download state is undisturbed by memory pressure / rendering events
  const dlCompatRec = manager.getDownloadRecord(dlCompat.downloadId!);
  assert(
    dlCompatRec?.state === DownloadLifecycleState.PENDING_CONSENT,
    "Download state undisturbed by rendering/media/page lifecycle operations"
  );

  console.log("✓ Full compatibility with NATIVE-31, NATIVE-30 and NATIVE-29 verified.");

  console.log("\n================================================================================");
  console.log(">>> ALL NATIVE-35 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<");
  console.log("================================================================================\n");
}

runNative35Verification().catch((err) => {
  console.error("NATIVE-35 Verification Failed:", err);
  process.exit(1);
});
