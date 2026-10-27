import {
  createAndroidWebViewDialogManager,
  validateDialogOrigin,
} from "../src/services/androidWebViewDialogBoundary";
import {
  createAndroidWebViewPageLifecycleManager,
} from "../src/services/androidWebViewPageLifecycleBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative20Verification() {
  console.log("=== STARTING NATIVE-20 JS DIALOG & NATIVE-19 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. SECURITY & ORIGIN VALIDATION
  // -------------------------------------------------------------
  console.log("1. Testing Origin Validation & Security Boundary...");

  // Dangerous schemes
  assert(!validateDialogOrigin("javascript:alert(1)").isValid, "javascript: scheme blocked");
  assert(!validateDialogOrigin("file:///sdcard/exploit.html").isValid, "file: scheme blocked");
  assert(!validateDialogOrigin("content://media/external").isValid, "content: scheme blocked");
  assert(!validateDialogOrigin("data:text/html,<script>alert(1)</script>").isValid, "data: scheme blocked");
  assert(!validateDialogOrigin("blob:https://evil.com/uuid").isValid, "blob: scheme blocked");
  assert(!validateDialogOrigin("about:blank").isValid, "about: scheme blocked");

  // SSRF & private networks
  assert(!validateDialogOrigin("https://169.254.169.254/metadata").isValid, "AWS/GCP metadata IP blocked");
  assert(!validateDialogOrigin("https://192.168.1.1/admin").isValid, "192.168.x.x private network blocked");
  assert(!validateDialogOrigin("https://10.0.0.1/").isValid, "10.x.x.x private network blocked");
  assert(!validateDialogOrigin("https://172.16.0.1/").isValid, "172.16.x.x private network blocked");
  assert(!validateDialogOrigin("https://service.internal/").isValid, ".internal domain blocked");
  assert(!validateDialogOrigin("https://printer.local/").isValid, ".local domain blocked");

  // Insecure remote HTTP
  assert(!validateDialogOrigin("http://insecure-site.com/").isValid, "Insecure remote HTTP blocked");

  // Secure HTTPS & Localhost
  assert(validateDialogOrigin("https://example.com/page").isValid, "Valid HTTPS allowed");
  assert(validateDialogOrigin("http://localhost:3000/").isValid, "Localhost HTTP allowed");
  assert(validateDialogOrigin("http://127.0.0.1:8080/").isValid, "127.0.0.1 allowed");

  console.log("✓ Origin validation and security boundaries verified.");

  // -------------------------------------------------------------
  // 2. ALERT, CONFIRM, PROMPT, AND BEFOREUNLOAD LIFECYCLES
  // -------------------------------------------------------------
  console.log("2. Testing alert(), confirm(), prompt(), beforeunload()...");

  let activePromptNotification: any = null;
  const dialogMgr = createAndroidWebViewDialogManager({
    maxDialogsPerWindow: 3,
    floodWindowMs: 5000,
    onPromptStateChange: (p) => {
      activePromptNotification = p;
    },
  });

  // A. JavaScript alert()
  const alertPromise = dialogMgr.requestAlert("tab-1", "https://example.com", "Welcome to site!");
  assert(activePromptNotification !== null, "Alert prompt notification emitted");
  assert(activePromptNotification.type === "alert", "Prompt type is alert");
  assert(activePromptNotification.origin === "https://example.com", "Origin matched");
  assert(activePromptNotification.message === "Welcome to site!", "Message matched");

  // Confirm alert
  const alertConfirmed = dialogMgr.confirmDialog(activePromptNotification.dialogId);
  assert(alertConfirmed, "Alert confirmed");
  const alertRes = await alertPromise;
  assert(alertRes.shown === true, "Alert promise resolved with shown: true");
  assert(dialogMgr.getPendingPrompt() === null, "Prompt cleared after confirm");

  // B. JavaScript confirm() — User Allow vs Cancel
  // B1. Allow
  const confirmPromise1 = dialogMgr.requestConfirm("tab-1", "https://example.com", "Delete item?");
  assert(activePromptNotification?.type === "confirm", "Prompt type is confirm");
  dialogMgr.confirmDialog(activePromptNotification.dialogId);
  const confirmRes1 = await confirmPromise1;
  assert(confirmRes1.confirmed === true, "Confirm resolved to true on allow");

  // B2. Cancel
  const confirmPromise2 = dialogMgr.requestConfirm("tab-1", "https://example.com", "Proceed?");
  dialogMgr.cancelDialog(activePromptNotification.dialogId);
  const confirmRes2 = await confirmPromise2;
  assert(confirmRes2.confirmed === false, "Confirm resolved to false on cancel");

  // C. JavaScript prompt() — User Custom Text vs Cancel
  // C1. Submit custom text
  const promptPromise1 = dialogMgr.requestPrompt("tab-1", "https://example.com", "Enter name:", "DefaultName");
  assert(activePromptNotification?.type === "prompt", "Prompt type is prompt");
  assert(activePromptNotification?.defaultValue === "DefaultName", "Default value passed");
  dialogMgr.confirmDialog(activePromptNotification.dialogId, "Alice");
  const promptRes1 = await promptPromise1;
  assert(promptRes1.value === "Alice", "Prompt resolved to custom entered text");

  // C2. Cancel prompt
  const promptPromise2 = dialogMgr.requestPrompt("tab-1", "https://example.com", "Enter age:");
  dialogMgr.cancelDialog(activePromptNotification.dialogId);
  const promptRes2 = await promptPromise2;
  assert(promptRes2.value === null, "Cancelled prompt resolves to null");

  // D. beforeunload confirmation — Leave vs Stay
  // D1. Leave (proceed = true)
  const buPromise1 = dialogMgr.requestBeforeUnload("tab-1", "https://example.com");
  assert(activePromptNotification?.type === "beforeunload", "Prompt type is beforeunload");
  dialogMgr.confirmDialog(activePromptNotification.dialogId);
  const buRes1 = await buPromise1;
  assert(buRes1.proceed === true, "beforeunload proceed true when user confirms leave");

  // D2. Stay (proceed = false)
  const buPromise2 = dialogMgr.requestBeforeUnload("tab-1", "https://example.com");
  dialogMgr.cancelDialog(activePromptNotification.dialogId);
  const buRes2 = await buPromise2;
  assert(buRes2.proceed === false, "beforeunload proceed false when user cancels/stays");

  console.log("✓ alert, confirm, prompt, and beforeunload lifecycles verified.");

  // -------------------------------------------------------------
  // 3. DIALOG FLOOD PROTECTION & USER SUPPRESSION
  // -------------------------------------------------------------
  console.log("3. Testing Dialog Flood Protection & Suppression...");

  // Send dialogs from origin until rate threshold is reached
  const p1 = dialogMgr.requestAlert("tab-flood", "https://spammer.com", "Flood 1");
  dialogMgr.confirmDialog(activePromptNotification.dialogId);
  await p1;

  const p2 = dialogMgr.requestAlert("tab-flood", "https://spammer.com", "Flood 2");
  dialogMgr.confirmDialog(activePromptNotification.dialogId);
  await p2;

  const p3 = dialogMgr.requestAlert("tab-flood", "https://spammer.com", "Flood 3");
  // Check that showSuppressOption is now true
  assert(activePromptNotification.showSuppressOption === true, "Suppress option offered after frequent dialogs");

  // User confirms dialog with suppressFuture = true ("Prevent this page from creating additional dialogs")
  dialogMgr.confirmDialog(activePromptNotification.dialogId, undefined, true);
  await p3;

  assert(dialogMgr.isOriginSuppressed("tab-flood", "https://spammer.com"), "Origin is suppressed");

  // Subsequent dialog from suppressed origin should immediately auto-cancel without blocking UI
  const pBlocked = await dialogMgr.requestAlert("tab-flood", "https://spammer.com", "Blocked Alert");
  assert(pBlocked.shown === false, "Subsequent dialog blocked by suppression");

  console.log("✓ Dialog flood protection and suppression verified.");

  // -------------------------------------------------------------
  // 4. PER-TAB & PER-ORIGIN ISOLATION
  // -------------------------------------------------------------
  console.log("4. Testing Per-Tab & Per-Origin Isolation...");

  // Register dialogs on Tab A and Tab B
  dialogMgr.requestAlert("tab-a", "https://tab-a.org", "Message on Tab A");
  dialogMgr.requestAlert("tab-b", "https://tab-b.org", "Message on Tab B");

  const dialogsTabA = dialogMgr.getPendingDialogsForTab("tab-a");
  const dialogsTabB = dialogMgr.getPendingDialogsForTab("tab-b");
  assert(dialogsTabA.length === 1 && dialogsTabA[0].origin === "https://tab-a.org", "Tab A has isolated dialog");
  assert(dialogsTabB.length === 1 && dialogsTabB[0].origin === "https://tab-b.org", "Tab B has isolated dialog");

  // Suppressing origin on Tab A does not suppress Tab B
  dialogMgr.suppressOrigin("tab-a", "https://common.com");
  assert(dialogMgr.isOriginSuppressed("tab-a", "https://common.com"), "Tab A common.com suppressed");
  assert(!dialogMgr.isOriginSuppressed("tab-b", "https://common.com"), "Tab B common.com NOT suppressed (isolated)");

  console.log("✓ Per-tab and per-origin isolation verified.");

  // -------------------------------------------------------------
  // 5. NAVIGATION, RELOAD, STOP LOADING & TAB CLOSE CLEANUP
  // -------------------------------------------------------------
  console.log("5. Testing Navigation, Reload, Stop Loading & Tab Close Cleanup...");

  // Navigation cleanup
  const navPromise = dialogMgr.requestConfirm("tab-nav", "https://site.org", "Pending confirm before navigation");
  assert(dialogMgr.getPendingDialogsForTab("tab-nav").length === 1, "Dialog pending before navigation");
  dialogMgr.onNavigation("tab-nav", "https://site.org/new-page");
  assert(dialogMgr.getPendingDialogsForTab("tab-nav").length === 0, "Pending dialog cleared on navigation");
  const navRes = await navPromise;
  assert(navRes.confirmed === false, "In-flight dialog auto-cancelled on navigation");

  // Reload cleanup
  const reloadPromise = dialogMgr.requestPrompt("tab-reload", "https://site.org", "Pending prompt before reload");
  dialogMgr.onReload("tab-reload");
  assert(dialogMgr.getPendingDialogsForTab("tab-reload").length === 0, "Pending dialog cleared on reload");
  const reloadRes = await reloadPromise;
  assert(reloadRes.value === null, "In-flight prompt auto-cancelled on reload");

  // Stop loading cleanup
  const stopPromise = dialogMgr.requestAlert("tab-stop", "https://site.org", "Pending alert before stop");
  dialogMgr.onStopLoading("tab-stop");
  assert(dialogMgr.getPendingDialogsForTab("tab-stop").length === 0, "Pending dialog cleared on stop loading");
  const stopRes = await stopPromise;
  assert(stopRes.shown === false, "In-flight alert auto-cancelled on stop loading");

  // Tab close cleanup
  dialogMgr.requestConfirm("tab-close", "https://site.org", "Dialog on closing tab");
  dialogMgr.suppressOrigin("tab-close", "https://site.org");
  dialogMgr.onTabClosed("tab-close");
  assert(dialogMgr.getPendingDialogsForTab("tab-close").length === 0, "Pending dialog purged on tab close");
  assert(!dialogMgr.isOriginSuppressed("tab-close", "https://site.org"), "Tab suppression purged on tab close");

  dialogMgr.destroy();
  console.log("✓ Navigation, Reload, Stop loading, and Tab close cleanup verified.");

  // -------------------------------------------------------------
  // 6. OLD WORK LIGHT CHECK: NATIVE-19 PAGE LIFECYCLE REGRESSION
  // -------------------------------------------------------------
  console.log("6. Testing NATIVE-19 Page Lifecycle Regression (Light Check)...");

  const lifecycleMgr = createAndroidWebViewPageLifecycleManager();

  // Tab registration & states
  const tFg = lifecycleMgr.registerTab("tab-fg", "https://app.example.com", true);
  const tBg = lifecycleMgr.registerTab("tab-bg", "https://second.example.com", false);
  assert(tFg.lifecycleState === "active" && tFg.isForeground === true, "Foreground starts active");
  assert(tBg.lifecycleState === "hidden" && tBg.isForeground === false, "Background starts hidden");

  // Host Activity pause/resume
  lifecycleMgr.onHostActivityPause();
  assert(lifecycleMgr.getTabState("tab-fg")?.lifecycleState === "hidden", "Host pause hides foreground tab");
  assert(lifecycleMgr.getTabState("tab-fg")?.timersRunning === false, "Host pause suspends timers");
  lifecycleMgr.onHostActivityResume("tab-fg");
  assert(lifecycleMgr.getTabState("tab-fg")?.lifecycleState === "active", "Host resume restores active state");
  assert(lifecycleMgr.getTabState("tab-fg")?.timersRunning === true, "Host resume reactivates timers");

  // Stale callback / Epoch defense & Tab isolation
  const epochFg = lifecycleMgr.getTabState("tab-fg")!.requestEpoch;
  const epochBg = lifecycleMgr.getTabState("tab-bg")!.requestEpoch;

  // Navigate tab-fg
  lifecycleMgr.onNavigation("tab-fg", "https://app.example.com/new");
  assert(!lifecycleMgr.isEpochActive("tab-fg", epochFg), "Old epoch superseded");

  let staleRan = false;
  const staleRes = lifecycleMgr.executeSafeCallback("tab-fg", epochFg, () => {
    staleRan = true;
  });
  assert(staleRes.executed === false && !staleRan, "Stale callback rejected on navigated tab");
  assert(lifecycleMgr.isEpochActive("tab-bg", epochBg), "Background tab epoch unaffected (tab isolation)");

  // Close tab cleanup
  lifecycleMgr.onTabClosed("tab-fg");
  assert(lifecycleMgr.getTabState("tab-fg") === null, "Closed tab removed from page lifecycle");

  lifecycleMgr.destroy();
  console.log("✓ NATIVE-19 Page Lifecycle regression check PASSED.");

  console.log("=== ALL NATIVE-20 AND NATIVE-19 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative20Verification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
