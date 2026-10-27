import {
  createAndroidWebViewHttpAuthManager,
  validateAuthTarget,
} from "../src/services/androidWebViewHttpAuthBoundary";
import {
  createAndroidWebViewStorageManager,
  validateStorageOrigin,
} from "../src/services/androidWebViewStorageAndServiceWorkerBoundary";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runNative21Verification() {
  console.log("=== STARTING NATIVE-21 HTTP AUTH & NATIVE-18 REGRESSION SUITE ===");

  // -------------------------------------------------------------
  // 1. SECURITY & ORIGIN VALIDATION
  // -------------------------------------------------------------
  console.log("1. Testing Target Validation & Security Boundary...");

  // Dangerous schemes
  assert(!validateAuthTarget("javascript:void(0)").isValid, "javascript: scheme blocked");
  assert(!validateAuthTarget("file:///etc/shadow").isValid, "file: scheme blocked");
  assert(!validateAuthTarget("content://contacts/").isValid, "content: scheme blocked");
  assert(!validateAuthTarget("data:text/plain,admin").isValid, "data: scheme blocked");
  assert(!validateAuthTarget("blob:https://test.com/id").isValid, "blob: scheme blocked");
  assert(!validateAuthTarget("about:blank").isValid, "about: scheme blocked");

  // SSRF & private networks
  assert(!validateAuthTarget("https://169.254.169.254/secret").isValid, "Cloud metadata IP blocked");
  assert(!validateAuthTarget("https://192.168.1.254/router").isValid, "192.168.x.x private network blocked");
  assert(!validateAuthTarget("https://10.1.1.1/corp").isValid, "10.x.x.x private network blocked");
  assert(!validateAuthTarget("https://172.20.0.1/auth").isValid, "172.16-31.x private network blocked");
  assert(!validateAuthTarget("https://auth.internal/").isValid, ".internal domain blocked");
  assert(!validateAuthTarget("https://intranet.local/").isValid, ".local domain blocked");

  // Remote plain HTTP blocked
  assert(!validateAuthTarget("http://insecure-auth.com/").isValid, "Insecure remote HTTP blocked");

  // Valid HTTPS & Localhost
  assert(validateAuthTarget("https://secure.example.com").isValid, "Valid HTTPS host allowed");
  assert(validateAuthTarget("http://localhost:3000").isValid, "Localhost HTTP allowed");
  assert(validateAuthTarget("http://127.0.0.1:8080").isValid, "127.0.0.1 allowed");

  console.log("✓ Security and origin validation verified.");

  // -------------------------------------------------------------
  // 2. HTTP AUTH CHALLENGE (BASIC & DIGEST)
  // -------------------------------------------------------------
  console.log("2. Testing HTTP Basic/Digest Auth Challenges & User Consent...");

  let activeHttpAuthPrompt: any = null;
  let activeClientCertPrompt: any = null;

  const authMgr = createAndroidWebViewHttpAuthManager({
    onHttpAuthPromptChange: (p) => {
      activeHttpAuthPrompt = p;
    },
    onClientCertPromptChange: (p) => {
      activeClientCertPrompt = p;
    },
  });

  // A. Basic Auth Challenge — Submit Credentials
  const authPromise1 = authMgr.requestHttpAuth("tab-1", "https://secure.example.com", "Admin Area", "Basic", false);
  assert(activeHttpAuthPrompt !== null, "HttpAuth prompt notification emitted");
  assert(activeHttpAuthPrompt.host === "secure.example.com", "Host matched");
  assert(activeHttpAuthPrompt.realm === "Admin Area", "Realm matched");
  assert(activeHttpAuthPrompt.scheme === "Basic", "Scheme is Basic");

  // Proceed with credentials (with saveCredential = true)
  const proceedOk = authMgr.proceedHttpAuth(activeHttpAuthPrompt.challengeId, "admin_user", "super_secret", true);
  assert(proceedOk, "proceedHttpAuth returned true");
  const authRes1 = await authPromise1;
  assert(authRes1.authenticated === true && authRes1.username === "admin_user", "Resolved with authenticated: true");
  assert(authMgr.getPendingHttpAuthPrompt() === null, "Prompt cleared after completion");

  // Verify cached credential auto-proceeds next request on same (host, realm)
  const autoRes = await authMgr.requestHttpAuth("tab-1", "https://secure.example.com", "Admin Area", "Basic", false);
  assert(autoRes.authenticated === true && autoRes.username === "admin_user", "Cached credential auto-resolved");

  // B. Digest Auth Challenge — Cancel by User
  const authPromise2 = authMgr.requestHttpAuth("tab-1", "https://digest.example.com", "Protected Digest", "Digest", false);
  assert(activeHttpAuthPrompt?.scheme === "Digest", "Scheme is Digest");
  const cancelOk = authMgr.cancelHttpAuth(activeHttpAuthPrompt.challengeId);
  assert(cancelOk, "cancelHttpAuth returned true");
  const authRes2 = await authPromise2;
  assert(authRes2.authenticated === false, "Cancelled challenge resolved with authenticated: false");

  console.log("✓ Basic/Digest auth lifecycle and user consent verified.");

  // -------------------------------------------------------------
  // 3. CREDENTIAL ISOLATION & PRIVATE BROWSING PURGE
  // -------------------------------------------------------------
  console.log("3. Testing Credential Isolation & Private Profile Purge...");

  // Normal profile has credential
  assert(authMgr.getCachedCredential("normal", "secure.example.com", "Admin Area")?.username === "admin_user", "Normal profile has cred");
  // Private profile does not see normal profile credential
  assert(authMgr.getCachedCredential("private", "secure.example.com", "Admin Area") === null, "Private profile isolated from normal");

  // Save credential in private profile
  const privPromise = authMgr.requestHttpAuth("tab-priv", "https://secure.example.com", "Private Realm", "Basic", true);
  authMgr.proceedHttpAuth(activeHttpAuthPrompt.challengeId, "priv_user", "priv_pass", true);
  await privPromise;

  assert(authMgr.getCachedCredential("private", "secure.example.com", "Private Realm")?.username === "priv_user", "Private cred saved");
  assert(authMgr.getCachedCredential("normal", "secure.example.com", "Private Realm") === null, "Normal profile isolated from private");

  // Closing non-last private tab retains private session
  authMgr.onTabClosed("tab-priv", true, 1);
  assert(authMgr.getCachedCredential("private", "secure.example.com", "Private Realm") !== null, "Private session retained when tabs remain");

  // Closing last private tab purges all ephemeral private credentials
  authMgr.onTabClosed("tab-priv-last", true, 0);
  assert(authMgr.getCachedCredential("private", "secure.example.com", "Private Realm") === null, "Private creds completely purged on last private tab close");
  // Normal profile credentials remain intact
  assert(authMgr.getCachedCredential("normal", "secure.example.com", "Admin Area") !== null, "Normal creds remain untouched");

  console.log("✓ Credential isolation and private profile purge verified.");

  // -------------------------------------------------------------
  // 4. CLIENT CERTIFICATE BOUNDARY (mTLS)
  // -------------------------------------------------------------
  console.log("4. Testing Client Certificate (mTLS) Boundary...");

  // A. Proceed with selected certificate
  const certPromise1 = authMgr.requestClientCert("tab-cert", "https://mtls.example.com", 443, ["RSA", "ECDSA"], [], false);
  assert(activeClientCertPrompt !== null, "Client cert prompt emitted");
  assert(activeClientCertPrompt.host === "mtls.example.com", "mTLS host matched");
  assert(activeClientCertPrompt.availableCerts.length > 0, "Available certificates listed");

  const certSelected = activeClientCertPrompt.availableCerts[0].alias;
  authMgr.proceedClientCert(activeClientCertPrompt.challengeId, certSelected);
  const certRes1 = await certPromise1;
  assert(certRes1.proceed === true && certRes1.certAlias === certSelected, "Cert challenge proceeded with alias");

  // B. Cancel client certificate
  const certPromise2 = authMgr.requestClientCert("tab-cert", "https://mtls.example.com", 443);
  authMgr.cancelClientCert(activeClientCertPrompt.challengeId);
  const certRes2 = await certPromise2;
  assert(certRes2.proceed === false, "Cert challenge cancelled");

  // C. Ignore client certificate (continue without cert)
  const certPromise3 = authMgr.requestClientCert("tab-cert", "https://mtls.example.com", 443);
  authMgr.ignoreClientCert(activeClientCertPrompt.challengeId);
  const certRes3 = await certPromise3;
  assert(certRes3.proceed === false && certRes3.reason?.includes("ignored"), "Cert challenge ignored");

  console.log("✓ Client certificate (mTLS) boundary verified.");

  // -------------------------------------------------------------
  // 5. NAVIGATION, RELOAD, STOP LOADING & TAB CLOSE CLEANUP
  // -------------------------------------------------------------
  console.log("5. Testing Navigation, Reload, Stop Loading & Tab Close Cleanup...");

  // Navigation cleanup
  const navAuth = authMgr.requestHttpAuth("tab-nav", "https://nav-site.com", "NavRealm");
  authMgr.onNavigation("tab-nav", "https://other.com");
  const navRes = await navAuth;
  assert(navRes.authenticated === false, "In-flight auth challenge cancelled on navigation");

  // Reload cleanup
  const reloadAuth = authMgr.requestHttpAuth("tab-reload", "https://reload-site.com", "ReloadRealm");
  authMgr.onReload("tab-reload");
  const reloadRes = await reloadAuth;
  assert(reloadRes.authenticated === false, "In-flight auth challenge cancelled on reload");

  // Stop loading cleanup
  const stopAuth = authMgr.requestHttpAuth("tab-stop", "https://stop-site.com", "StopRealm");
  authMgr.onStopLoading("tab-stop");
  const stopRes = await stopAuth;
  assert(stopRes.authenticated === false, "In-flight auth challenge cancelled on stop loading");

  // Tab close cleanup
  const closeCert = authMgr.requestClientCert("tab-closing", "https://close-site.com", 443);
  authMgr.onTabClosed("tab-closing", false, 0);
  const closeRes = await closeCert;
  assert(closeRes.proceed === false, "In-flight cert challenge cancelled on tab close");

  authMgr.destroy();
  console.log("✓ Navigation, Reload, Stop loading, and Tab close cleanup verified.");

  // -------------------------------------------------------------
  // 6. OLD WORK LIGHT CHECK: NATIVE-18 STORAGE / SW REGRESSION
  // -------------------------------------------------------------
  console.log("6. Testing NATIVE-18 Storage & Service Worker Regression (Light Check)...");

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
  storageMgr.setLocalStorageItem("https://origin-1.com", "theme", "dark", false);
  assert(storageMgr.getLocalStorageItem("https://origin-1.com", "theme", false) === "dark", "localStorage set/get");
  assert(storageMgr.getLocalStorageItem("https://origin-2.com", "theme", false) === null, "localStorage cross-origin isolation");

  // sessionStorage (per-tab + per-origin)
  storageMgr.setSessionStorageItem("tab-1", "https://origin-1.com", "token", "tok_xyz");
  assert(storageMgr.getSessionStorageItem("tab-1", "https://origin-1.com", "token") === "tok_xyz", "sessionStorage tab-1");
  assert(storageMgr.getSessionStorageItem("tab-2", "https://origin-1.com", "token") === null, "sessionStorage per-tab isolation");

  // Private storage purge on last private tab close
  storageMgr.setLocalStorageItem("https://origin-1.com", "priv_key", "secret", true);
  storageMgr.onTabClosed("tab-private", true, 0);
  assert(storageMgr.getLocalStorageItem("https://origin-1.com", "priv_key", true) === null, "Private storage purged on last private tab close");

  storageMgr.destroy();
  console.log("✓ NATIVE-18 Storage & Service Worker regression check PASSED.");

  console.log("=== ALL NATIVE-21 AND NATIVE-18 TESTS COMPLETED SUCCESSFULLY ===");
}

runNative21Verification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
