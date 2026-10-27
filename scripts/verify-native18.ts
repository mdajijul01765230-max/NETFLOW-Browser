import {
  validateStorageOrigin,
  createAndroidWebViewStorageManager,
} from "../src/services/androidWebViewStorageAndServiceWorkerBoundary";
import {
  validateWebSocketUrl,
  createAndroidWebViewWebSocketManager,
} from "../src/services/androidWebViewWebSocketBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("=== STARTING NATIVE-18 STORAGE/SW & NATIVE-17 REGRESSION SUITE ===");

// -------------------------------------------------------------
// 1. NATIVE-18 ORIGIN SECURITY & VALIDATION
// -------------------------------------------------------------
console.log("1. Testing Storage & Service Worker Origin Security...");

// Dangerous schemes
const dangerousSchemes = [
  "javascript:alert(1)",
  "file:///sdcard/storage.json",
  "content://media/external/storage",
  "data:text/html,<script>steal()</script>",
  "blob:https://example.com/some-uuid",
  "about:blank",
];
for (const scheme of dangerousSchemes) {
  const res = validateStorageOrigin(scheme);
  assert(!res.isValid, `Dangerous scheme must be blocked: ${scheme}`);
}
console.log("✓ Dangerous schemes blocked for storage/SW.");

// Insecure remote HTTP
const insecureHttp = [
  "http://example.com",
  "http://api.mysite.com/storage",
  "http://93.184.216.34:8080",
];
for (const badHttp of insecureHttp) {
  const res = validateStorageOrigin(badHttp);
  assert(!res.isValid || !res.isSecureContext, `Insecure remote HTTP must be blocked for SW/storage: ${badHttp}`);
}
console.log("✓ Insecure remote HTTP blocked from secure storage & SW.");

// Localhost development exceptions
const localhostDev = [
  "http://localhost:3000",
  "http://127.0.0.1:8080/app",
  "http://0.0.0.0:4000",
  "https://localhost:8443",
];
for (const dev of localhostDev) {
  const res = validateStorageOrigin(dev);
  assert(res.isValid && res.isSecureContext && res.isLocalhost, `Localhost development must be allowed as secure context: ${dev}`);
}
console.log("✓ Localhost development exception allowed as secure context.");

// Valid secure HTTPS
const validHttps = [
  "https://app.example.com/dashboard",
  "https://secure-banking.org:8443",
  "https://netflow.dev",
];
for (const httpsUrl of validHttps) {
  const res = validateStorageOrigin(httpsUrl);
  assert(res.isValid && res.isSecureContext && !res.isLocalhost, `Valid HTTPS origin must be permitted: ${httpsUrl}`);
  assert(Boolean(res.origin), `Canonical origin must be provided for: ${httpsUrl}`);
}
console.log("✓ Valid HTTPS origins accepted.");

// SSRF / Private IPs / Cloud Metadata
const ssrfTargets = [
  "https://169.254.169.254/latest/meta-data",
  "https://10.0.0.1/admin",
  "https://192.168.1.1:8080/config",
  "https://172.16.0.1/internal",
  "https://corp.internal/sw.js",
  "https://device.local/cache",
];
for (const ssrf of ssrfTargets) {
  const res = validateStorageOrigin(ssrf);
  assert(!res.isValid, `SSRF / Private network origin must be blocked: ${ssrf}`);
}
console.log("✓ SSRF, private IPs, and cloud metadata targets strictly blocked.");

// -------------------------------------------------------------
// 2. NATIVE-18 SERVICE WORKER REGISTRATION / UPDATE / UNREGISTER LIFECYCLE
// -------------------------------------------------------------
console.log("2. Testing Service Worker Lifecycle...");

const storageMgr = createAndroidWebViewStorageManager();

// Cross-origin registration blocked
const crossSw = storageMgr.registerServiceWorker(
  "https://trusted.com",
  "https://malicious.com/sw.js"
);
assert(!crossSw.success, "Cross-origin Service Worker script must be rejected");

// Insecure origin registration blocked
const insecureSw = storageMgr.registerServiceWorker(
  "http://plain-http.com",
  "http://plain-http.com/sw.js"
);
assert(!insecureSw.success, "Insecure HTTP origin cannot register Service Worker");

// Valid registration
const validSw = storageMgr.registerServiceWorker(
  "https://trusted.com",
  "https://trusted.com/service-worker.js",
  "/app/"
);
assert(validSw.success && Boolean(validSw.registration?.id), "Valid SW registration must succeed");
assert(validSw.registration?.state === "activated", "Registration state is activated");

const regId = validSw.registration!.id;
const regs = storageMgr.getServiceWorkerRegistrations("https://trusted.com");
assert(regs.length === 1 && regs[0].id === regId, "Registration present in list");

// Update registration
const updateRes = storageMgr.updateServiceWorker(
  "https://trusted.com",
  regId,
  "https://trusted.com/service-worker-v2.js"
);
assert(updateRes.success, "SW update must succeed");
assert(updateRes.registration?.scriptUrl === "https://trusted.com/service-worker-v2.js", "Script URL updated");

// Unregister
const unregRes = storageMgr.unregisterServiceWorker("https://trusted.com", regId);
assert(unregRes.success, "SW unregistration must succeed");
const regsAfter = storageMgr.getServiceWorkerRegistrations("https://trusted.com");
assert(regsAfter.length === 0, "No active registrations remain after unregister");

console.log("✓ Service Worker registration, update, and unregister lifecycle verified.");

// -------------------------------------------------------------
// 3. NATIVE-18 CACHE API ISOLATION
// -------------------------------------------------------------
console.log("3. Testing Cache API Isolation...");

const originA = "https://app-a.com";
const originB = "https://app-b.com";

storageMgr.openCache(originA, "v1-static");
const putA = storageMgr.putCache(originA, "v1-static", "/index.css", {
  status: 200,
  statusText: "OK",
  headers: { "content-type": "text/css" },
  body: "body { background: black; }",
});
assert(putA.success, "Cache put on origin A must succeed");

// Match on Origin A
const matchA = storageMgr.matchCache(originA, "v1-static", "/index.css");
assert(matchA !== null && matchA.response.body === "body { background: black; }", "Cache match on Origin A");

// Origin B cannot access Origin A's cache! (Cross-origin isolation)
const matchB = storageMgr.matchCache(originB, "v1-static", "/index.css");
assert(matchB === null, "Origin B must NOT access Origin A's cache");

// Normal profile vs. Private profile cache isolation
storageMgr.putCache(originA, "private-cache", "/secret.json", {
  status: 200,
  statusText: "OK",
  body: '{"token":"xyz"}',
}, true); // isPrivate = true

const matchNormalSecret = storageMgr.matchCache(originA, "private-cache", "/secret.json", false);
assert(matchNormalSecret === null, "Private cache entry must not leak to normal profile");
const matchPrivateSecret = storageMgr.matchCache(originA, "private-cache", "/secret.json", true);
assert(matchPrivateSecret !== null, "Private cache entry matches in private profile");

console.log("✓ Cache API cross-origin and private-profile isolation verified.");

// -------------------------------------------------------------
// 4. NATIVE-18 WEB STORAGE (localStorage, sessionStorage, IndexedDB)
// -------------------------------------------------------------
console.log("4. Testing Web Storage Boundaries...");

// A. localStorage
storageMgr.setLocalStorageItem(originA, "theme", "dark", false);
assert(storageMgr.getLocalStorageItem(originA, "theme", false) === "dark", "localStorage on origin A");
assert(storageMgr.getLocalStorageItem(originB, "theme", false) === null, "localStorage cross-origin isolation");

// Private localStorage isolation
storageMgr.setLocalStorageItem(originA, "user_session", "private_123", true);
assert(storageMgr.getLocalStorageItem(originA, "user_session", false) === null, "Private localStorage does not leak to normal profile");
assert(storageMgr.getLocalStorageItem(originA, "user_session", true) === "private_123", "Private localStorage available in private profile");

// B. sessionStorage (strictly per-tab AND per-origin)
storageMgr.setSessionStorageItem("tab-1", originA, "cart_item", "book");
storageMgr.setSessionStorageItem("tab-2", originA, "cart_item", "laptop");

assert(storageMgr.getSessionStorageItem("tab-1", originA, "cart_item") === "book", "Tab-1 sessionStorage has book");
assert(storageMgr.getSessionStorageItem("tab-2", originA, "cart_item") === "laptop", "Tab-2 sessionStorage has laptop");
assert(storageMgr.getSessionStorageItem("tab-1", originB, "cart_item") === null, "Tab-1 on Origin B is isolated");

// C. IndexedDB
storageMgr.openDatabase(originA, "MyDatabase", 1, false);
storageMgr.putIndexedDBRecord(originA, "MyDatabase", "users", "usr-1", { name: "Alice" }, false);
const idbVal = storageMgr.getIndexedDBRecord(originA, "MyDatabase", "users", "usr-1", false);
assert(idbVal?.name === "Alice", "IndexedDB record retrieved for origin A");

// IndexedDB cross-origin isolation
const idbCross = storageMgr.getIndexedDBRecord(originB, "MyDatabase", "users", "usr-1", false);
assert(idbCross === null, "IndexedDB cross-origin access blocked");

// IndexedDB private profile isolation
storageMgr.putIndexedDBRecord(originA, "MyDatabase", "users", "usr-private", { name: "SecretAgent" }, true);
assert(storageMgr.getIndexedDBRecord(originA, "MyDatabase", "users", "usr-private", false) === null, "Private IDB record does not leak to normal profile");
assert(storageMgr.getIndexedDBRecord(originA, "MyDatabase", "users", "usr-private", true)?.name === "SecretAgent", "Private IDB record accessible in private profile");

console.log("✓ localStorage, sessionStorage (per-tab), and IndexedDB boundaries verified.");

// -------------------------------------------------------------
// 5. NATIVE-18 CLEANUP CONSISTENCY & PRIVATE SESSION PURGE
// -------------------------------------------------------------
console.log("5. Testing Lifecycle & Cleanup Consistency...");

// Closing tab-1 purges its sessionStorage
storageMgr.onTabClosed("tab-1", false, 1);
assert(storageMgr.getSessionStorageItem("tab-1", originA, "cart_item") === null, "Tab-1 sessionStorage purged on close");
assert(storageMgr.getSessionStorageItem("tab-2", originA, "cart_item") === "laptop", "Tab-2 sessionStorage preserved");

// Closing last private tab purges all private storage
storageMgr.onTabClosed("tab-private", true, 0); // 0 remaining private tabs
assert(storageMgr.getLocalStorageItem(originA, "user_session", true) === null, "Private localStorage purged on last private tab close");
assert(storageMgr.matchCache(originA, "private-cache", "/secret.json", true) === null, "Private Cache purged on last private tab close");
assert(storageMgr.getIndexedDBRecord(originA, "MyDatabase", "users", "usr-private", true) === null, "Private IndexedDB purged on last private tab close");

// clearOriginData
storageMgr.clearOriginData(originA, "normal");
assert(storageMgr.getLocalStorageItem(originA, "theme", false) === null, "clearOriginData purges normal localStorage");
assert(storageMgr.matchCache(originA, "v1-static", "/index.css", false) === null, "clearOriginData purges normal Cache");

storageMgr.destroy();
console.log("✓ Lifecycle and private session purging verified.");

// -------------------------------------------------------------
// 6. OLD WORK LIGHT REGRESSION: NATIVE-17 WEBSOCKET BOUNDARY
// -------------------------------------------------------------
console.log("6. Testing NATIVE-17 WebSocket Regression...");

// Scheme and dangerous URL checks
assert(!validateWebSocketUrl("javascript:void(0)").isAllowed, "WebSocket rejects javascript:");
assert(!validateWebSocketUrl("file:///system/ws").isAllowed, "WebSocket rejects file:");
assert(!validateWebSocketUrl("ws://external-plain.com/socket").isAllowed, "Insecure external ws:// blocked");
assert(validateWebSocketUrl("ws://localhost:3000/live").isAllowed, "Localhost ws:// permitted");
assert(validateWebSocketUrl("wss://echo.websocket.events").isAllowed, "Secure wss:// permitted");
assert(!validateWebSocketUrl("wss://169.254.169.254/ws").isAllowed, "Cloud metadata ws blocked");

// Lifecycle & tab isolation
const wsMgr = createAndroidWebViewWebSocketManager({ mockTransport: true });
const wsConn = wsMgr.createConnection("tab-test-1", "wss://echo.websocket.events");
assert(wsConn.success && Boolean(wsConn.connectionId), "WebSocket connection created");

// Cross-tab send rejected
const crossSend = wsMgr.send("tab-test-2", wsConn.connectionId!, "hacked");
assert(!crossSend.success, "Cross-tab send blocked");

// Tab closed terminates connection
wsMgr.onTabClosed("tab-test-1");
assert(wsMgr.getConnectionsForTab("tab-test-1").length === 0, "Tab-close terminates WebSocket");

wsMgr.destroy();

console.log("✓ NATIVE-17 WebSocket regression check PASSED.");
console.log("=== ALL NATIVE-18 AND NATIVE-17 TESTS COMPLETED SUCCESSFULLY ===");
