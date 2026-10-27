import {
  createAndroidWebViewClipboardAndShareManager,
  validateClipboardAndShareOrigin,
  validateShareUrl,
  detectSensitiveContent,
  CLIPBOARD_LIMITS,
  ClipboardConsentPrompt,
  ShareConsentPrompt,
} from "../src/services/androidWebViewClipboardAndShareBoundary";

import {
  createAndroidWebViewFileSystemManager,
  validateFileSystemOrigin,
  sanitizeGeneratedFilename,
  FILE_SYSTEM_LIMITS,
} from "../src/services/androidWebViewFileSystemBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative26Verification() {
  console.log("=== STARTING NATIVE-26 CLIPBOARD & WEB SHARE + NATIVE-25 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. ORIGIN SECURITY & SSRF PROTECTION FOR CLIPBOARD & SHARE
  // -------------------------------------------------------------
  console.log("1. Testing Origin Security & SSRF Protection for Clipboard & Share...");

  assert(!validateClipboardAndShareOrigin("javascript:void(0)").isValid, "Rejects javascript: origin");
  assert(!validateClipboardAndShareOrigin("file:///system/bin").isValid, "Rejects file: origin");
  assert(!validateClipboardAndShareOrigin("content://media/external").isValid, "Rejects content: origin");
  assert(!validateClipboardAndShareOrigin("data:text/html,hack").isValid, "Rejects data: origin");
  assert(!validateClipboardAndShareOrigin("about:blank").isValid, "Rejects about: origin");
  assert(!validateClipboardAndShareOrigin("http://unencrypted-site.org").isValid, "Rejects insecure HTTP remote");
  assert(!validateClipboardAndShareOrigin("https://169.254.169.254").isValid, "Rejects cloud metadata IP");
  assert(!validateClipboardAndShareOrigin("https://192.168.1.50").isValid, "Rejects private IP 192.168.x.x");
  assert(!validateClipboardAndShareOrigin("https://10.20.30.40").isValid, "Rejects private IP 10.x.x.x");
  assert(!validateClipboardAndShareOrigin("https://172.18.0.1").isValid, "Rejects private IP 172.16-31.x.x");
  assert(!validateClipboardAndShareOrigin("https://gateway.internal").isValid, "Rejects .internal domain");
  assert(!validateClipboardAndShareOrigin("https://nas.local").isValid, "Rejects .local domain");

  // Valid origins
  const validHttps = validateClipboardAndShareOrigin("https://dashboard.netflow.com/app");
  assert(validHttps.isValid && validHttps.canonicalOrigin === "https://dashboard.netflow.com", "Valid HTTPS canonicalized");
  const validLocalhost = validateClipboardAndShareOrigin("http://localhost:3000/test");
  assert(validLocalhost.isValid && validLocalhost.isLocalhost, "Valid localhost accepted");

  console.log("✓ Origin security and SSRF protection verified.");

  // -------------------------------------------------------------
  // 2. SENSITIVE DATA DETECTION & TOKEN LEAKAGE GUARDS
  // -------------------------------------------------------------
  console.log("2. Testing Sensitive Content Detection & Leakage Protection...");

  const privKeyCheck = detectSensitiveContent("-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----");
  assert(privKeyCheck.isSensitive && Boolean(privKeyCheck.warning?.includes("Private Key")), "Detects private key certificate");

  const jwtCheck = detectSensitiveContent("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozGzN_ce");
  assert(jwtCheck.isSensitive && Boolean(jwtCheck.warning?.includes("JWT")), "Detects JWT token");

  const apiKeyCheck = detectSensitiveContent("api_key=test_mock_dummy_secret_key_1234567890");
  assert(apiKeyCheck.isSensitive && Boolean(apiKeyCheck.warning?.includes("secret")), "Detects API key secret");

  const benignCheck = detectSensitiveContent("Welcome to NETFLOW safe browser!");
  assert(!benignCheck.isSensitive, "Normal text is not marked sensitive");

  console.log("✓ Sensitive data detection verified.");

  // -------------------------------------------------------------
  // 3. CLIPBOARD API (writeText, readText, write, read) & CONSENT GATING
  // -------------------------------------------------------------
  console.log("3. Testing Clipboard API & Consent Gating...");

  let activeClipPrompt: ClipboardConsentPrompt | null = null;
  let activeSharePrompt: ShareConsentPrompt | null = null;

  const clipManager = createAndroidWebViewClipboardAndShareManager({
    onClipboardConsentPromptChange: (p) => {
      activeClipPrompt = p;
    },
    onShareConsentPromptChange: (p) => {
      activeSharePrompt = p;
    },
  });

  // Test writeText with consent approval
  const writePromise = clipManager.writeText("tab-1", "https://dashboard.netflow.com", "Secret Clipboard Message");
  assert(Boolean(activeClipPrompt), "writeText triggered consent prompt");
  assert(activeClipPrompt?.action === "writeText", "Prompt action is writeText");
  assert(activeClipPrompt?.origin === "https://dashboard.netflow.com", "Prompt origin matches");

  // Approve write
  const writeApproveRes = clipManager.approveClipboardPrompt(activeClipPrompt!.promptId);
  assert(writeApproveRes.success, "writeText approved");
  const writeResult = await writePromise;
  assert(writeResult.success, "writeText operation completed successfully");
  assert(activeClipPrompt === null, "Prompt cleared after user action");

  // Test readText with consent approval
  const readPromise = clipManager.readText("tab-1", "https://dashboard.netflow.com");
  assert(Boolean(activeClipPrompt), "readText triggered consent prompt");
  assert(activeClipPrompt?.action === "readText", "Prompt action is readText");

  // Approve read
  clipManager.approveClipboardPrompt(activeClipPrompt!.promptId);
  const readResult = await readPromise;
  assert(readResult.success && readResult.text === "Secret Clipboard Message", "readText returns written message");

  // Test read rejection
  const readRejectPromise = clipManager.readText("tab-1", "https://dashboard.netflow.com");
  assert(Boolean(activeClipPrompt), "Prompt emitted for rejection test");
  clipManager.rejectClipboardPrompt(activeClipPrompt!.promptId, "User denied clipboard reading");
  const rejectResult = await readRejectPromise;
  assert(!rejectResult.success, "Rejected read returns failure");
  assert(rejectResult.error?.includes("NotAllowedError"), "Error is NotAllowedError");

  // Test write with disallowed MIME type
  const badMimeRes = await clipManager.write("tab-1", "https://dashboard.netflow.com", [
    { type: "application/x-malware", data: "malicious" },
  ]);
  assert(!badMimeRes.success, "Disallowed MIME type rejected");
  assert(badMimeRes.error?.includes("NotAllowedError"), "Returns NotAllowedError for bad MIME");

  console.log("✓ Clipboard API read/write and consent gating verified.");

  // -------------------------------------------------------------
  // 4. PRIVATE MODE CLIPBOARD ISOLATION
  // -------------------------------------------------------------
  console.log("4. Testing Private Mode Isolation for Clipboard...");

  // Write sensitive text in private tab
  const privWritePromise = clipManager.writeText(
    "tab-priv-1",
    "https://dashboard.netflow.com",
    "Ephemeral Private Credential",
    true // isPrivate
  );
  clipManager.approveClipboardPrompt(activeClipPrompt!.promptId);
  await privWritePromise;

  // Verify private tab can read it
  const privReadPromise = clipManager.readText("tab-priv-1", "https://dashboard.netflow.com", true);
  clipManager.approveClipboardPrompt(activeClipPrompt!.promptId);
  const privReadResult = await privReadPromise;
  assert(privReadResult.text === "Ephemeral Private Credential", "Private tab reads ephemeral clipboard");

  // Public tab does NOT see private clipboard
  const pubReadPromise = clipManager.readText("tab-1", "https://dashboard.netflow.com", false);
  clipManager.approveClipboardPrompt(activeClipPrompt!.promptId);
  const pubReadResult = await pubReadPromise;
  assert(pubReadResult.text !== "Ephemeral Private Credential", "Public tab isolated from private clipboard");

  // Close private tab -> purges private clipboard completely
  clipManager.onTabClosed("tab-priv-1", true, 0);

  // Subsequent private tab read is empty
  const privReadAfterClosePromise = clipManager.readText("tab-priv-2", "https://dashboard.netflow.com", true);
  clipManager.approveClipboardPrompt(activeClipPrompt!.promptId);
  const privAfterCloseResult = await privReadAfterClosePromise;
  assert(privAfterCloseResult.text === "", "Private clipboard purged on private session close");

  console.log("✓ Private mode isolation verified.");

  // -------------------------------------------------------------
  // 5. WEB SHARE API BOUNDARY (canShare, share, URL validation)
  // -------------------------------------------------------------
  console.log("5. Testing Web Share API (canShare, share, URL safety)...");

  // canShare checks
  assert(clipManager.canShare({ title: "NETFLOW", url: "https://netflow.dev" }), "canShare accepts valid URL");
  assert(clipManager.canShare({ text: "Just a text note" }), "canShare accepts text");
  assert(!clipManager.canShare({}), "canShare rejects empty share data");
  assert(!clipManager.canShare({ url: "javascript:alert(1)" }), "canShare rejects javascript: scheme");
  assert(!clipManager.canShare({ url: "file:///system/priv-app" }), "canShare rejects file: scheme");
  assert(!clipManager.canShare({ url: "https://169.254.169.254/latest" }), "canShare rejects cloud metadata SSRF");

  // URL sanitizer strips sensitive auth tokens
  const urlCheck = validateShareUrl("https://example.com/item?id=12&token=secrettoken&auth=bearer123");
  assert(urlCheck.isValid && !urlCheck.sanitizedUrl?.includes("secrettoken"), "Strips sensitive auth tokens from shared URL");

  // Execute share with consent approval
  const sharePromise = clipManager.share("tab-1", "https://dashboard.netflow.com", {
    title: "Article Title",
    text: "Check out this link",
    url: "https://news.example.com/story?id=42&token=leaked_secret",
  });

  assert(Boolean(activeSharePrompt), "share() emitted user consent prompt");
  assert(activeSharePrompt?.title === "Article Title", "Prompt title matches");
  assert(!activeSharePrompt?.url?.includes("leaked_secret"), "Prompt url has tokens stripped");

  // Approve share
  const approveShareRes = clipManager.approveSharePrompt(activeSharePrompt!.promptId);
  assert(approveShareRes.success, "Share approved");
  const shareResult = await sharePromise;
  assert(shareResult.success, "Share operation resolved with success");
  assert(activeSharePrompt === null, "Prompt cleared after user action");

  // Test share rejection
  const shareRejectPromise = clipManager.share("tab-1", "https://dashboard.netflow.com", {
    title: "Cancelled Share",
  });
  clipManager.rejectSharePrompt(activeSharePrompt!.promptId, "User cancelled sheet");
  const shareRejectRes = await shareRejectPromise;
  assert(!shareRejectRes.success && shareRejectRes.error?.includes("AbortError"), "Share rejection yields AbortError");

  console.log("✓ Web Share API validation and consent flow verified.");

  // -------------------------------------------------------------
  // 6. LIFECYCLE & CLEANUP (NAVIGATION, RELOAD, STOP, TAB-CLOSE)
  // -------------------------------------------------------------
  console.log("6. Testing Lifecycle Cleanups for Clipboard and Share...");

  // Navigation cancels pending prompt
  const navClipPromise = clipManager.readText("tab-nav", "https://dashboard.netflow.com");
  assert(Boolean(activeClipPrompt), "Prompt active before navigation");
  clipManager.onNavigation("tab-nav", "https://dashboard.netflow.com/next");
  const navClipRes = await navClipPromise;
  assert(!navClipRes.success && navClipRes.error?.includes("navigation"), "Pending prompt cancelled on navigation");

  // StopLoading cancels pending share prompt
  const stopSharePromise = clipManager.share("tab-stop", "https://dashboard.netflow.com", { text: "Pending" });
  assert(Boolean(activeSharePrompt), "Share prompt active before stopLoading");
  clipManager.onStopLoading("tab-stop");
  const stopShareRes = await stopSharePromise;
  assert(!stopShareRes.success && stopShareRes.error?.includes("stopLoading"), "Pending share cancelled on stopLoading");

  console.log("✓ Lifecycle cleanups verified.");

  // -------------------------------------------------------------
  // 7. NATIVE-25 REGRESSION VERIFICATION (FILE API / READER / MEMORY GUARD)
  // -------------------------------------------------------------
  console.log("7. Testing NATIVE-25 File API / FileReader Regression...");

  const fsManager = createAndroidWebViewFileSystemManager();

  // Blob creation & slicing
  const regBlob = fsManager.createBlob(["NETFLOW-25 Regression Test Blob"], { type: "text/plain" });
  assert(regBlob.size === 31, "NATIVE-25 Blob size calculated correctly");
  const sliced = regBlob.slice(0, 7);
  assert(new TextDecoder().decode(sliced.data) === "NETFLOW", "NATIVE-25 Blob slicing intact");

  // File creation & FileReader
  const fileRes = fsManager.createFile(
    "tab-reg",
    "https://dashboard.netflow.com",
    ["FileReader verification data"],
    "test_reg.txt",
    { type: "text/plain" }
  );
  assert(fileRes.success && Boolean(fileRes.file), "NATIVE-25 File created");

  const reader = fsManager.createFileReader("tab-reg", "https://dashboard.netflow.com");
  const readTextOutput = await reader.readAsText(fileRes.file!);
  assert(readTextOutput === "FileReader verification data", "NATIVE-25 FileReader readAsText intact");

  // Large-file guard regression
  const oversizedData = new Uint8Array(FILE_SYSTEM_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES + 1024);
  const oversizedRes = fsManager.createFile(
    "tab-reg",
    "https://dashboard.netflow.com",
    [oversizedData],
    "oversized.bin"
  );
  assert(!oversizedRes.success && oversizedRes.error?.includes("ERR_FILE_TOO_LARGE"), "NATIVE-25 large-file guard intact");

  // Filename safety regression
  const safeFn = sanitizeGeneratedFilename("../../../dangerous.apk", "application/vnd.android.package-archive");
  assert(safeFn.isDangerous && safeFn.filename.endsWith(".apk.download"), "NATIVE-25 filename traversal and dangerous extension protection intact");

  // Tab close regression
  fsManager.onTabClosed("tab-reg", false, 1);
  assert(fsManager.getFileCountForTab("tab-reg") === 0, "NATIVE-25 tab cleanups intact");

  console.log("✓ NATIVE-25 regression tests passed completely.");

  console.log("=== ALL NATIVE-26 & NATIVE-25 SUITES COMPLETED SUCCESSFULLY ===");
}

runNative26Verification().catch((err) => {
  console.error("NATIVE-26 VERIFICATION FAILED:", err);
  process.exit(1);
});
