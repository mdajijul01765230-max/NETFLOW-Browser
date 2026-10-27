import {
  createAndroidWebViewFileSystemManager,
  validateFileSystemOrigin,
  sanitizeGeneratedFilename,
  FILE_SYSTEM_LIMITS,
  GeneratedFileDownloadPrompt,
} from "../src/services/androidWebViewFileSystemBoundary";

import {
  createAndroidWebViewBlobDownloadManager,
  validateBlobOrigin,
  sanitizeBlobFilename,
} from "../src/services/androidWebViewBlobDownloadBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative25Verification() {
  console.log("=== STARTING NATIVE-25 FILE API/READER & NATIVE-24 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. ORIGIN SECURITY & SSRF PROTECTION
  // -------------------------------------------------------------
  console.log("1. Testing Origin Security & SSRF Protection for File System / File API...");

  assert(!validateFileSystemOrigin("javascript:eval(1)").isValid, "Rejects javascript: scheme");
  assert(!validateFileSystemOrigin("file:///android_asset/file.txt").isValid, "Rejects file: scheme");
  assert(!validateFileSystemOrigin("content://media/external/downloads").isValid, "Rejects content: scheme");
  assert(!validateFileSystemOrigin("data:text/plain;base64,QUJD").isValid, "Rejects data: scheme");
  assert(!validateFileSystemOrigin("about:blank").isValid, "Rejects about: scheme");
  assert(!validateFileSystemOrigin("http://insecure-remote.com").isValid, "Rejects insecure HTTP remote");
  assert(!validateFileSystemOrigin("https://169.254.169.254").isValid, "Rejects cloud metadata IP 169.254.169.254");
  assert(!validateFileSystemOrigin("https://192.168.1.1").isValid, "Rejects private IP 192.168.x.x");
  assert(!validateFileSystemOrigin("https://10.0.0.5").isValid, "Rejects private IP 10.x.x.x");
  assert(!validateFileSystemOrigin("https://172.20.0.1").isValid, "Rejects private IP 172.16-31.x.x");
  assert(!validateFileSystemOrigin("https://vault.internal").isValid, "Rejects .internal domain");
  assert(!validateFileSystemOrigin("https://device.local").isValid, "Rejects .local domain");

  // Valid origins
  const validHttps = validateFileSystemOrigin("https://app.example.com/editor");
  assert(validHttps.isValid && validHttps.canonicalOrigin === "https://app.example.com", "Valid HTTPS origin canonicalized");
  const validLocal = validateFileSystemOrigin("http://localhost:3000/app");
  assert(validLocal.isValid && validLocal.isLocalhost, "Valid localhost origin accepted");

  console.log("✓ Origin security and SSRF protection verified.");

  // -------------------------------------------------------------
  // 2. MIME TYPE & FILENAME SAFETY
  // -------------------------------------------------------------
  console.log("2. Testing MIME Type & Filename Safety...");

  // Path traversal
  const trav = sanitizeGeneratedFilename("../../var/log/report.csv", "text/csv");
  assert(!trav.filename.includes("..") && !trav.filename.includes("/"), "Strips path traversal");
  assert(trav.filename.endsWith(".csv"), "Preserves safe extension");

  // Null bytes
  const nullByte = sanitizeGeneratedFilename("report\x00.pdf", "application/pdf");
  assert(!nullByte.filename.includes("\x00"), "Strips null bytes");

  // Windows reserved device names
  const reserved = sanitizeGeneratedFilename("CON.txt", "text/plain");
  assert(reserved.filename.startsWith("safe_CON"), "Disarms reserved Windows/Android device name");

  // Dangerous executable extensions neutralized
  const apkFile = sanitizeGeneratedFilename("payload.apk", "application/vnd.android.package-archive");
  assert(apkFile.isDangerous, "Marks .apk as dangerous");
  assert(apkFile.filename.endsWith(".apk.download"), "Disarms .apk with .download suffix");

  const exeFile = sanitizeGeneratedFilename("installer.exe", "application/x-msdownload");
  assert(exeFile.isDangerous, "Marks .exe as dangerous");
  assert(exeFile.filename.endsWith(".exe.download"), "Disarms .exe with .download suffix");

  const shFile = sanitizeGeneratedFilename("script.sh", "application/x-sh");
  assert(shFile.isDangerous, "Marks .sh as dangerous");
  assert(shFile.filename.endsWith(".sh.download"), "Disarms .sh with .download suffix");

  // Sensitive tokens in filenames stripped
  const tokenFile = sanitizeGeneratedFilename("statement.pdf?token=abc123secret&auth=jwt456", "application/pdf");
  assert(!tokenFile.filename.includes("abc123secret"), "Strips query credential tokens");

  console.log("✓ MIME type and filename safety verified.");

  // -------------------------------------------------------------
  // 3. FILE API & BLOB HANDLING (CREATION, METADATA, SLICING)
  // -------------------------------------------------------------
  console.log("3. Testing File API & Blob Handling (Creation, Metadata, Slicing)...");

  let activePrompt: GeneratedFileDownloadPrompt | null = null;
  const fsManager = createAndroidWebViewFileSystemManager({
    onDownloadConsentPromptChange: (prompt) => {
      activePrompt = prompt;
    },
  });

  // Blob creation & slicing
  const textBlob = fsManager.createBlob(["Hello, ", "World!"], { type: "text/plain; charset=utf-8" });
  assert(textBlob.size === 13, `Blob size is 13 (got ${textBlob.size})`);
  assert(textBlob.type === "text/plain", `Blob type normalized (got ${textBlob.type})`);

  const slicedBlob = textBlob.slice(0, 5);
  assert(slicedBlob.size === 5, `Sliced blob size is 5 (got ${slicedBlob.size})`);
  const sliceText = new TextDecoder().decode(slicedBlob.data);
  assert(sliceText === "Hello", `Sliced content is 'Hello' (got ${sliceText})`);

  // File creation
  const fileRes = fsManager.createFile(
    "tab-1",
    "https://app.example.com",
    ["Netflow file system report\nLine 2"],
    "report.txt",
    { type: "text/plain", isPrivate: false }
  );

  assert(fileRes.success && Boolean(fileRes.file), "File created successfully");
  const file1 = fileRes.file!;
  assert(file1.name === "report.txt", "File name preserved");
  assert(file1.tabId === "tab-1", "File tabId recorded");
  assert(file1.origin === "https://app.example.com", "File origin recorded");
  assert(file1.size > 0, "File size recorded");

  console.log("✓ File API & Blob creation verified.");

  // -------------------------------------------------------------
  // 4. FILEREADER & ARRAYBUFFER / BINARY PROCESSING BOUNDARY
  // -------------------------------------------------------------
  console.log("4. Testing FileReader (Text, ArrayBuffer, DataURL, BinaryString, Abort)...");

  const reader = fsManager.createFileReader("tab-1", "https://app.example.com");

  // readAsText
  const textOutput = await reader.readAsText(file1);
  assert(textOutput.includes("Netflow file system report"), "readAsText returns correct text");
  assert(reader.readyState === 2, "FileReader readyState is DONE (2)");

  // readAsArrayBuffer
  const abOutput = await reader.readAsArrayBuffer(file1);
  assert(abOutput instanceof ArrayBuffer, "readAsArrayBuffer returns ArrayBuffer");
  assert(abOutput.byteLength === file1.size, "ArrayBuffer byteLength matches file size");

  // readAsDataURL
  const dataUrlOutput = await reader.readAsDataURL(file1);
  assert(dataUrlOutput.startsWith("data:text/plain;base64,"), "readAsDataURL returns valid data URL");

  // readAsBinaryString
  const binStringOutput = await reader.readAsBinaryString(file1);
  assert(binStringOutput.length === file1.size, "readAsBinaryString length matches file size");

  // Abort capability
  const abortReader = fsManager.createFileReader("tab-1", "https://app.example.com");
  abortReader.abort();
  assert(abortReader.readyState === 2, "Aborted reader transitions to DONE");
  assert(abortReader.error === "AbortError", "Aborted reader records AbortError");

  console.log("✓ FileReader text, ArrayBuffer, DataURL, binary processing, and abort verified.");

  // -------------------------------------------------------------
  // 5. TAB & CANONICAL-ORIGIN ISOLATION
  // -------------------------------------------------------------
  console.log("5. Testing Tab & Canonical-Origin Isolation...");

  // Cross-origin read attempt
  const crossOriginReader = fsManager.createFileReader("tab-1", "https://other-origin.com");
  let crossOriginBlocked = false;
  try {
    await crossOriginReader.readAsText(file1);
  } catch (err: any) {
    crossOriginBlocked = err.message.includes("SecurityError");
  }
  assert(crossOriginBlocked, "Cross-origin FileReader access blocked with SecurityError");

  // Cross-tab read attempt
  const crossTabReader = fsManager.createFileReader("tab-2", "https://app.example.com");
  let crossTabBlocked = false;
  try {
    await crossTabReader.readAsText(file1);
  } catch (err: any) {
    crossTabBlocked = err.message.includes("SecurityError");
  }
  assert(crossTabBlocked, "Cross-tab FileReader access blocked with SecurityError");

  console.log("✓ Tab and canonical-origin isolation verified.");

  // -------------------------------------------------------------
  // 6. LARGE-FILE MEMORY & SIZE GUARD
  // -------------------------------------------------------------
  console.log("6. Testing Large-File Memory & Size Guard...");

  // Exceeding single file limit
  const oversizedData = new Uint8Array(FILE_SYSTEM_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES + 1024);
  const largeFileRes = fsManager.createFile(
    "tab-1",
    "https://app.example.com",
    [oversizedData],
    "huge_file.bin"
  );
  assert(!largeFileRes.success, "Rejects file exceeding single file size limit");
  assert(largeFileRes.error?.includes("ERR_FILE_TOO_LARGE"), "Returns ERR_FILE_TOO_LARGE error");

  // Check tab quota accumulation
  const tabBytesBefore = fsManager.getTabAllocatedBytes("tab-1");
  assert(tabBytesBefore > 0, "Tab memory allocation tracked");

  console.log("✓ Large-file memory and size guards verified.");

  // -------------------------------------------------------------
  // 7. GENERATED FILE DOWNLOAD PIPELINE & USER CONSENT
  // -------------------------------------------------------------
  console.log("7. Testing Generated File Download Pipeline & Consent...");

  const dlPromise = fsManager.requestGeneratedFileDownload(
    "tab-1",
    "https://app.example.com",
    {
      name: "export_report.csv",
      type: "text/csv",
      data: "id,name,value\n1,alpha,100\n2,beta,200",
    }
  );

  assert(Boolean(activePrompt), "Download consent prompt emitted to UI listener");
  assert(activePrompt?.filename === "export_report.csv", "Prompt contains sanitized filename");
  assert(activePrompt?.origin === "https://app.example.com", "Prompt contains canonical origin");
  assert(activePrompt?.mimeType === "text/csv", "Prompt contains correct MIME type");

  // Approve download
  const approveRes = fsManager.approveGeneratedFileDownload(activePrompt!.downloadId);
  assert(approveRes.success, "Download approved successfully");

  const dlResult = await dlPromise;
  assert(dlResult.success, "Download pipeline delivered generated file payload");
  assert(dlResult.filename === "export_report.csv", "Delivered correct filename");
  assert(activePrompt === null, "Prompt cleared after user action");

  // Test rejection
  const dlRejectPromise = fsManager.requestGeneratedFileDownload(
    "tab-1",
    "https://app.example.com",
    {
      name: "rejected.json",
      type: "application/json",
      data: '{"status":"cancelled"}',
    }
  );
  assert(Boolean(activePrompt), "Second prompt emitted");
  fsManager.rejectGeneratedFileDownload(activePrompt!.downloadId, "User rejected download");
  const rejectResult = await dlRejectPromise;
  assert(!rejectResult.success, "Rejected download returns failure");
  assert(rejectResult.error?.includes("User rejected download"), "Rejection reason recorded");

  console.log("✓ Generated file download pipeline and consent gating verified.");

  // -------------------------------------------------------------
  // 8. LIFECYCLE & CLEANUP (NAVIGATION, RELOAD, STOP, TAB-CLOSE)
  // -------------------------------------------------------------
  console.log("8. Testing Lifecycle & Cleanup (Navigation, Reload, Stop, Tab-Close)...");

  // 1. Navigation cleanup
  const navFile = fsManager.createFile(
    "tab-nav",
    "https://app.example.com",
    ["content to be cleared on nav"],
    "nav.txt"
  );
  assert(navFile.success, "File created for tab-nav");
  assert(fsManager.getFileCountForTab("tab-nav") === 1, "File count is 1");

  fsManager.onNavigation("tab-nav", "https://app.example.com/next-page");
  assert(fsManager.getFileCountForTab("tab-nav") === 0, "Files purged on navigation");
  assert(fsManager.getTabAllocatedBytes("tab-nav") === 0, "Allocated bytes reset on navigation");

  // 2. Stop loading cleanup
  let stopPrompt: GeneratedFileDownloadPrompt | null = null;
  const stopManager = createAndroidWebViewFileSystemManager({
    onDownloadConsentPromptChange: (p) => {
      stopPrompt = p;
    },
  });

  const stopDlPromise = stopManager.requestGeneratedFileDownload(
    "tab-stop",
    "https://app.example.com",
    { name: "stop_test.txt", data: "data" }
  );
  assert(Boolean(stopPrompt), "Prompt created for stop test");
  stopManager.onStopLoading("tab-stop");
  const stopRes = await stopDlPromise;
  assert(!stopRes.success && stopRes.error?.includes("stopLoading"), "Pending download aborted on stopLoading");

  // 3. Tab close cleanup
  const tabCloseFile = stopManager.createFile(
    "tab-to-close",
    "https://app.example.com",
    ["test data"],
    "close_test.txt"
  );
  assert(tabCloseFile.success, "File created for tab-to-close");
  stopManager.onTabClosed("tab-to-close", false, 1);
  assert(stopManager.getFileCountForTab("tab-to-close") === 0, "Files purged on tab close");

  console.log("✓ Lifecycle cleanups verified.");

  // -------------------------------------------------------------
  // 9. PRIVATE MODE ISOLATION
  // -------------------------------------------------------------
  console.log("9. Testing Private Mode Isolation...");

  const privManager = createAndroidWebViewFileSystemManager();
  const privFile = privManager.createFile(
    "tab-priv-1",
    "https://app.example.com",
    ["ephemeral private data"],
    "secret.txt",
    { isPrivate: true }
  );

  assert(privFile.success && privFile.file?.isPrivate, "Private file marked isPrivate");

  // Closing the last private tab purges all private memory allocations
  privManager.onTabClosed("tab-priv-1", true, 0);
  assert(privManager.getTabAllocatedBytes("tab-priv-1") === 0, "Private tab memory wiped on close");

  console.log("✓ Private mode isolation verified.");

  // -------------------------------------------------------------
  // 10. NATIVE-24 REGRESSION (BLOB & OBJECT-URL DOWNLOADS)
  // -------------------------------------------------------------
  console.log("10. Testing NATIVE-24 Blob / Object-URL Regression...");

  const blobManager = createAndroidWebViewBlobDownloadManager();

  // Test Blob registration
  const regBlob = blobManager.createObjectUrl(
    "tab-n24",
    "https://app.example.com",
    new Uint8Array([1, 2, 3, 4, 5]),
    "application/octet-stream",
    "n24_test.bin"
  );

  assert(regBlob.success && Boolean(regBlob.objectUrl), "NATIVE-24 Blob registered with Object URL");
  assert(regBlob.objectUrl?.startsWith("blob:https://app.example.com/"), "NATIVE-24 Object URL format valid");

  // Filename safety regression
  const n24Sanitized = sanitizeBlobFilename("../../../secret.apk", "application/vnd.android.package-archive");
  assert(!n24Sanitized.filename.includes("..") && n24Sanitized.filename.endsWith(".apk.download"), "NATIVE-24 filename traversal and dangerous extension neutralized");

  // Blob origin safety regression
  assert(!validateBlobOrigin("file:///etc/hosts").isValid, "NATIVE-24 rejects file: scheme");
  assert(!validateBlobOrigin("https://169.254.169.254").isValid, "NATIVE-24 rejects metadata IP");
  assert(validateBlobOrigin("https://secure.netflow.com").isValid, "NATIVE-24 accepts valid HTTPS");

  // Tab close cleanup regression
  blobManager.onTabClosed("tab-n24", false, 1);
  const lookupAfterClose = blobManager.getBlobEntry(regBlob.objectUrl!);
  assert(lookupAfterClose === null, "NATIVE-24 Blob purged on tab close");

  console.log("✓ NATIVE-24 regression tests passed completely.");

  console.log("=== ALL NATIVE-25 & NATIVE-24 REGRESSION SUITES PASSED SUCCESSFULLY ===");
}

runNative25Verification().catch((err) => {
  console.error("NATIVE-25 VERIFICATION FAILED:", err);
  process.exit(1);
});
