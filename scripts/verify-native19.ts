import {
  createAndroidWebViewPageLifecycleManager,
  TabLifecycleState,
} from "../src/services/androidWebViewPageLifecycleBoundary";
import {
  validateStorageOrigin,
  createAndroidWebViewStorageManager,
} from "../src/services/androidWebViewStorageAndServiceWorkerBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("=== STARTING NATIVE-19 LIFECYCLE & NATIVE-18 REGRESSION SUITE ===");

// -------------------------------------------------------------
// 1. NATIVE-19 PAGE/HOST STATE SYNCHRONIZATION
// -------------------------------------------------------------
console.log("1. Testing Page & Host Activity Lifecycle Synchronization...");

const transitions: string[] = [];
const lifecycleMgr = createAndroidWebViewPageLifecycleManager({
  onStateTransition: (evt) => {
    transitions.push(`${evt.tabId}:${evt.previousState}->${evt.newState}`);
  },
});

// Register Tab 1 as foreground
const tab1 = lifecycleMgr.registerTab("tab-1", "https://app.example.com", true);
assert(tab1.lifecycleState === "active", "Foreground tab starts active");
assert(tab1.visibilityState === "visible", "Foreground tab starts visible");
assert(tab1.timersRunning === true, "Active tab has timersRunning = true");
assert(tab1.mediaPlaybackPermitted === true, "Active tab permits media");

// Register Tab 2 as background
const tab2 = lifecycleMgr.registerTab("tab-2", "https://second.example.com", false);
assert(tab2.lifecycleState === "hidden", "Background tab starts hidden");
assert(tab2.visibilityState === "hidden", "Background tab starts with visibilityState = hidden");
assert(tab2.timersRunning === false, "Hidden tab has timersRunning = false");

// Host Activity Pause (e.g. app sent to background / screen lock)
lifecycleMgr.onHostActivityPause();
const tab1Paused = lifecycleMgr.getTabState("tab-1");
assert(tab1Paused?.lifecycleState === "hidden", "Host pause moves active tab to hidden");
assert(tab1Paused?.visibilityState === "hidden", "Host pause hides visibility");
assert(tab1Paused?.timersRunning === false, "Host pause suspends timers (pauseTimers)");
assert(tab1Paused?.networkThrottled === true, "Host pause throttles network");

// Host Activity Resume (e.g. app returned to foreground)
lifecycleMgr.onHostActivityResume("tab-1");
const tab1Resumed = lifecycleMgr.getTabState("tab-1");
assert(tab1Resumed?.lifecycleState === "active", "Host resume restores active state");
assert(tab1Resumed?.visibilityState === "visible", "Host resume restores visible state");
assert(tab1Resumed?.timersRunning === true, "Host resume reactivates timers (resumeTimers)");
assert(tab1Resumed?.networkThrottled === false, "Host resume restores unthrottled network");

console.log("✓ Host Activity pause and resume synchronization verified.");

// -------------------------------------------------------------
// 2. BACKGROUND/FOREGROUND TAB SWITCHING & LOW-RAM FREEZING
// -------------------------------------------------------------
console.log("2. Testing Foreground/Background Switching & Freezing...");

// Switch foreground to Tab 2
lifecycleMgr.setForegroundTab("tab-2");
const tab1Bg = lifecycleMgr.getTabState("tab-1");
const tab2Fg = lifecycleMgr.getTabState("tab-2");
assert(tab1Bg?.lifecycleState === "hidden" && tab1Bg?.isForeground === false, "Tab 1 transitions to hidden background");
assert(tab2Fg?.lifecycleState === "active" && tab2Fg?.isForeground === true, "Tab 2 transitions to active foreground");

// Low-RAM Freezing: Tab 1 suspended
lifecycleMgr.suspendTab("tab-1");
const tab1Frozen = lifecycleMgr.getTabState("tab-1");
assert(tab1Frozen?.lifecycleState === "frozen", "Tab 1 enters frozen lifecycle state");
assert(tab1Frozen?.timersRunning === false, "Frozen tab has timers disabled");

// Resume Tab 1
lifecycleMgr.resumeTab("tab-1");
const tab1Reactivated = lifecycleMgr.getTabState("tab-1");
assert(tab1Reactivated?.lifecycleState === "active", "Tab 1 resumes directly to active");

console.log("✓ Foreground/Background switching and freezing verified.");

// -------------------------------------------------------------
// 3. NAVIGATION, RELOAD, STOP & CLOSE CLEANUP
// -------------------------------------------------------------
console.log("3. Testing Navigation, Reload, Stop & Close Cleanup...");

const initialEpoch = tab1Reactivated!.requestEpoch;

// Navigation
const navEpoch = lifecycleMgr.onNavigation("tab-1", "https://app.example.com/page2");
assert(navEpoch === initialEpoch + 1, "Navigation increments request epoch");
assert(lifecycleMgr.getTabState("tab-1")?.url === "https://app.example.com/page2", "URL updated");

// Reload
const reloadEpoch = lifecycleMgr.onReload("tab-1");
assert(reloadEpoch === navEpoch + 1, "Reload increments request epoch");

// Stop loading
lifecycleMgr.onStopLoading("tab-1");
assert(lifecycleMgr.getTabState("tab-1")?.requestEpoch === reloadEpoch + 1, "Stop loading increments request epoch");

// Tab Close
lifecycleMgr.onTabClosed("tab-1");
assert(lifecycleMgr.getTabState("tab-1") === null, "Closed tab removed from manager");

console.log("✓ Navigation, Reload, Stop loading, and Tab close cleanup verified.");

// -------------------------------------------------------------
// 4. PER-TAB LIFECYCLE ISOLATION & STALE CALLBACK DEFENSE
// -------------------------------------------------------------
console.log("4. Testing Per-Tab Isolation & Stale Callback Defense...");

// Register fresh Tab A and Tab B
lifecycleMgr.registerTab("tab-a", "https://tab-a.org", true);
lifecycleMgr.registerTab("tab-b", "https://tab-b.org", false);

const epochA = lifecycleMgr.getTabState("tab-a")!.requestEpoch;
const epochB = lifecycleMgr.getTabState("tab-b")!.requestEpoch;

// Verify epoch activity
assert(lifecycleMgr.isEpochActive("tab-a", epochA), "Epoch A is active");
assert(lifecycleMgr.isEpochActive("tab-b", epochB), "Epoch B is active");

// Safe callback execution
let executedValue = 0;
const safeResult = lifecycleMgr.executeSafeCallback("tab-a", epochA, () => {
  executedValue = 42;
  return "success";
});
assert(safeResult.executed === true && safeResult.result === "success" && executedValue === 42, "Safe callback executed");

// Navigate Tab A (superseding epochA)
lifecycleMgr.onNavigation("tab-a", "https://tab-a.org/new");
assert(!lifecycleMgr.isEpochActive("tab-a", epochA), "Old epoch A is now inactive");

// Attempt stale callback on Tab A with old epoch
let staleExecuted = false;
const staleResult = lifecycleMgr.executeSafeCallback("tab-a", epochA, () => {
  staleExecuted = true;
});
assert(staleResult.executed === false, "Stale callback must be rejected");
assert(!staleExecuted, "Stale callback body must not run");

// Tab B is completely unaffected by Tab A's navigation (Tab Isolation)
assert(lifecycleMgr.isEpochActive("tab-b", epochB), "Tab B's epoch unaffected by Tab A");

lifecycleMgr.destroy();
console.log("✓ Per-tab isolation and stale callback rejection verified.");

// -------------------------------------------------------------
// 5. OLD WORK LIGHT CHECK: NATIVE-18 STORAGE / SW REGRESSION
// -------------------------------------------------------------
console.log("5. Testing NATIVE-18 Storage & Service Worker Regression...");

// Origin check
assert(!validateStorageOrigin("javascript:void(0)").isValid, "Storage rejects javascript:");
assert(!validateStorageOrigin("file:///system/storage").isValid, "Storage rejects file:");
assert(!validateStorageOrigin("https://169.254.169.254/secret").isValid, "Storage rejects SSRF");
assert(validateStorageOrigin("https://valid-origin.com").isValid, "Storage accepts valid HTTPS");

const storageMgr = createAndroidWebViewStorageManager();

// SW Lifecycle
const swReg = storageMgr.registerServiceWorker("https://valid-origin.com", "https://valid-origin.com/sw.js");
assert(swReg.success && Boolean(swReg.registration?.id), "SW registration works");
const swUnreg = storageMgr.unregisterServiceWorker("https://valid-origin.com", swReg.registration!.id);
assert(swUnreg.success, "SW unregistration works");

// Cache API Isolation
storageMgr.openCache("https://origin-1.com", "v1");
storageMgr.putCache("https://origin-1.com", "v1", "/style.css", {
  status: 200,
  statusText: "OK",
  body: "css",
});
assert(storageMgr.matchCache("https://origin-1.com", "v1", "/style.css") !== null, "Cache match on origin 1");
assert(storageMgr.matchCache("https://origin-2.com", "v1", "/style.css") === null, "Cross-origin cache isolation");

// Web Storage Isolation
// localStorage
storageMgr.setLocalStorageItem("https://origin-1.com", "theme", "light", false);
assert(storageMgr.getLocalStorageItem("https://origin-1.com", "theme", false) === "light", "localStorage set/get");
assert(storageMgr.getLocalStorageItem("https://origin-2.com", "theme", false) === null, "localStorage cross-origin isolation");
assert(storageMgr.getLocalStorageItem("https://origin-1.com", "theme", true) === null, "localStorage private profile isolation");

// sessionStorage (per-tab + per-origin)
storageMgr.setSessionStorageItem("tab-x", "https://origin-1.com", "session_token", "123");
assert(storageMgr.getSessionStorageItem("tab-x", "https://origin-1.com", "session_token") === "123", "sessionStorage tab-x");
assert(storageMgr.getSessionStorageItem("tab-y", "https://origin-1.com", "session_token") === null, "sessionStorage per-tab isolation");

// IndexedDB
storageMgr.openDatabase("https://origin-1.com", "mydb", 1, false);
storageMgr.putIndexedDBRecord("https://origin-1.com", "mydb", "items", "i1", { count: 10 }, false);
assert(storageMgr.getIndexedDBRecord("https://origin-1.com", "mydb", "items", "i1", false)?.count === 10, "IDB record fetched");
assert(storageMgr.getIndexedDBRecord("https://origin-2.com", "mydb", "items", "i1", false) === null, "IDB cross-origin isolation");

// Private session purge on last private tab close
storageMgr.setLocalStorageItem("https://origin-1.com", "private_flag", "yes", true);
storageMgr.onTabClosed("tab-private", true, 0);
assert(storageMgr.getLocalStorageItem("https://origin-1.com", "private_flag", true) === null, "Private storage purged on last private tab close");

storageMgr.destroy();
console.log("✓ NATIVE-18 Storage & Service Worker regression check PASSED.");

console.log("=== ALL NATIVE-19 AND NATIVE-18 TESTS COMPLETED SUCCESSFULLY ===");
