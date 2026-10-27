/**
 * NETFLOW BROWSER V2 — FORM B2 (`NETFLOW-RESILIENCE-LIGHTMODE-BUNDLE-01`)
 * PART 4 — Per-Tab Light Mode, Fallback Router & Offline Queue Verification (`scripts/verify-light-mode-fallback.ts`)
 *
 * Verifies:
 *  1. Classifier `canUseProxyFallback(url, tab)` & `classifyProxyFallback(url, tab)` cases:
 *     - login / signin / auth / oauth paths -> false (reasonCode: AUTH_OR_LOGIN_PATH)
 *     - checkout / pay / bank paths -> false (reasonCode: CHECKOUT_OR_PAYMENT_PATH)
 *     - signed-in patterns -> false (reasonCode: SIGNED_IN_SESSION)
 *     - private tabs -> false (reasonCode: PRIVATE_TAB)
 *     - intranet / private hosts (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, .local) -> false (reasonCode: INTRANET_OR_PRIVATE_HOST)
 *     - known client-rendered app shells (mail/docs/figma/notion/app.*) -> false (reasonCode: CLIENT_RENDERED_APP_SHELL)
 *     - ordinary article -> true (reasonCode: ELIGIBLE_PUBLIC_PAGE)
 *     - honest blocked message: "This interactive or signed-in page needs the full browser view. Try Light Mode."
 *  2. `LightModePolicy` defaults:
 *     - blockNetworkImage, blockWebFonts, blockMediaPreload, blockThirdPartyTrackers, cacheMode
 *     - JavaScript is NEVER disabled by Light Mode (`javaScriptEnabled: true` invariant even if caller attempts to override)
 *  3. `nativeBrowserEngine.setLightMode(tabId, policy)` feature-detected command:
 *     - returns `{ supported: false }` safe no-op when native plugin does not advertise `setLightMode`
 *  4. Per-tab `lightMode` boolean persisted in `sessionPersistence` snapshot without breaking checksum/migration
 *  5. Offline Queue (`createOfflineNavigationQueue`):
 *     - stores sanitized URL only (strips tokens, credentials, secrets; never stores POST bodies)
 *     - max 20 items (FIFO eviction of oldest when > 20)
 *     - private tabs strictly excluded
 *     - on validated online: 1 item opens automatically; >1 items require user confirmation (`requiresUserConfirmation: true`)
 *     - Clear Browsing Data (`clearQueue`) purges the queue and storage
 */

import {
  buildLightModePolicy,
  canUseProxyFallback,
  classifyProxyFallback,
  createOfflineNavigationQueue,
  OFFLINE_QUEUE_STORAGE_KEY,
  PROXY_FALLBACK_BLOCKED_MESSAGE_EN,
} from "../src/services/lightModeEngine";
import { createNativeBrowserEngine } from "../src/services/nativeBrowserEngine";
import {
  createSessionPersistenceEngine,
  validateAndVerifySnapshot,
  SESSION_V2_PRIMARY_KEY,
  SessionStorageAdapter,
} from "../src/services/sessionPersistence";

interface TestRow {
  id: number;
  test: string;
  result: "PASS" | "FAIL";
  detail: string;
}

const rows: TestRow[] = [];
let nextId = 1;

function assertTest(test: string, pass: boolean, detail: string) {
  const result: "PASS" | "FAIL" = pass ? "PASS" : "FAIL";
  rows.push({ id: nextId++, test, result, detail });
  if (!pass) {
    throw new Error(`FAIL: ${test} — ${detail}`);
  }
}

function createMemoryStorage(initial: Record<string, string> = {}): SessionStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
  };
}

async function main() {
  console.log("=== NETFLOW BROWSER V2 — VERIFY LIGHT MODE, FALLBACK ROUTER & OFFLINE QUEUE ===");

  // ---------------------------------------------------------------------------
  // Test 1: Classifier — login / signin / auth / oauth paths -> false
  // ---------------------------------------------------------------------------
  {
    const urls = [
      "https://example.com/login",
      "https://accounts.example.com/signin?next=/home",
      "https://idp.example.com/oauth2/authorize",
      "https://portal.example.com/auth/session",
    ];
    const allBlocked = urls.every((u) => {
      const boolRes = canUseProxyFallback(u, { isPrivate: false });
      const detailRes = classifyProxyFallback(u, { isPrivate: false });
      return (
        boolRes === false &&
        detailRes.allowed === false &&
        detailRes.reasonCode === "AUTH_OR_LOGIN_PATH" &&
        detailRes.messageEn === PROXY_FALLBACK_BLOCKED_MESSAGE_EN
      );
    });

    assertTest(
      "Classifier blocks login/signin/auth/oauth paths with AUTH_OR_LOGIN_PATH & honest message",
      allBlocked,
      `tested=${urls.length}, msg="${PROXY_FALLBACK_BLOCKED_MESSAGE_EN}"`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 2: Classifier — checkout / pay / bank paths -> false
  // ---------------------------------------------------------------------------
  {
    const urls = [
      "https://shop.example.com/checkout/payment",
      "https://secure.example.com/pay/confirm",
      "https://netbanking.example-bank.com/transfer",
      "https://bkash.example.com/billing/invoice",
    ];
    const allBlocked = urls.every((u) => {
      const boolRes = canUseProxyFallback(u, { isPrivate: false });
      const detailRes = classifyProxyFallback(u, { isPrivate: false });
      return (
        boolRes === false &&
        detailRes.allowed === false &&
        detailRes.reasonCode === "CHECKOUT_OR_PAYMENT_PATH"
      );
    });

    assertTest(
      "Classifier blocks checkout/pay/bank paths with CHECKOUT_OR_PAYMENT_PATH",
      allBlocked,
      `tested=${urls.length}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3: Classifier — signed-in patterns -> false
  // ---------------------------------------------------------------------------
  {
    const urls = [
      "https://service.example.com/my-account/settings",
      "https://news.example.com/article?session_id=abc123",
    ];
    const allBlocked = urls.every((u) => {
      const boolRes = canUseProxyFallback(u, { isPrivate: false });
      const detailRes = classifyProxyFallback(u, { isPrivate: false });
      return (
        boolRes === false &&
        detailRes.allowed === false &&
        detailRes.reasonCode === "SIGNED_IN_SESSION"
      );
    });

    assertTest(
      "Classifier blocks signed-in session patterns with SIGNED_IN_SESSION",
      allBlocked,
      `tested=${urls.length}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 4: Classifier — private tabs -> false
  // ---------------------------------------------------------------------------
  {
    const url = "https://en.wikipedia.org/wiki/Bangladesh";
    const boolRes = canUseProxyFallback(url, { isPrivate: true });
    const detailRes = classifyProxyFallback(url, { isPrivate: true });
    const pass =
      boolRes === false &&
      detailRes.allowed === false &&
      detailRes.reasonCode === "PRIVATE_TAB";

    assertTest(
      "Classifier blocks private tabs with PRIVATE_TAB",
      pass,
      `allowed=${boolRes}, reasonCode=${detailRes.reasonCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 5: Classifier — intranet / private hosts -> false
  // ---------------------------------------------------------------------------
  {
    const urls = [
      "http://localhost:8080/status",
      "http://127.0.0.1:3000/test",
      "http://192.168.1.1/router",
      "http://10.0.0.15/internal",
      "http://172.20.0.5/portal",
      "http://printer.local/admin",
    ];
    const allBlocked = urls.every((u) => {
      const boolRes = canUseProxyFallback(u, { isPrivate: false });
      const detailRes = classifyProxyFallback(u, { isPrivate: false });
      return (
        boolRes === false &&
        detailRes.allowed === false &&
        detailRes.reasonCode === "INTRANET_OR_PRIVATE_HOST"
      );
    });

    assertTest(
      "Classifier blocks intranet/private hosts with INTRANET_OR_PRIVATE_HOST",
      allBlocked,
      `tested=${urls.length}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 6: Classifier — known client-rendered app shells -> false; ordinary article -> true
  // ---------------------------------------------------------------------------
  {
    const shellUrls = [
      "https://mail.google.com/mail/u/0/",
      "https://docs.google.com/document/d/123",
      "https://app.slack.com/client/T01",
      "https://www.figma.com/file/xyz",
    ];
    const shellsBlocked = shellUrls.every((u) => {
      const boolRes = canUseProxyFallback(u, { isPrivate: false });
      const detailRes = classifyProxyFallback(u, { isPrivate: false });
      return (
        boolRes === false &&
        detailRes.allowed === false &&
        detailRes.reasonCode === "CLIENT_RENDERED_APP_SHELL"
      );
    });

    const articleUrls = [
      "https://en.wikipedia.org/wiki/Packet_switching",
      "https://example.com/2026/10/07/network-resilience-article",
    ];
    const articlesAllowed = articleUrls.every((u) => {
      const boolRes = canUseProxyFallback(u, { isPrivate: false });
      const detailRes = classifyProxyFallback(u, { isPrivate: false });
      return (
        boolRes === true &&
        detailRes.allowed === true &&
        detailRes.reasonCode === "ELIGIBLE_PUBLIC_PAGE"
      );
    });

    assertTest(
      "Classifier blocks client-rendered app shells and allows ordinary articles",
      shellsBlocked && articlesAllowed,
      `shellsBlocked=${shellsBlocked}, articlesAllowed=${articlesAllowed}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 7: LightModePolicy defaults — JS is NEVER disabled by Light Mode
  // ---------------------------------------------------------------------------
  {
    const activePolicy = buildLightModePolicy({ lightMode: true });
    const textOnlyPolicy = buildLightModePolicy({ browsingMode: "text-only" });
    const inactivePolicy = buildLightModePolicy({ lightMode: false, browsingMode: "full" });
    const forcedAttempt = buildLightModePolicy({
      lightMode: true,
      overrides: { javaScriptEnabled: false as any },
    });

    const pass =
      activePolicy.blockWebFonts === true &&
      activePolicy.blockMediaPreload === true &&
      activePolicy.blockThirdPartyTrackers === true &&
      activePolicy.cacheMode === "LOAD_CACHE_ELSE_NETWORK" &&
      activePolicy.javaScriptEnabled === true &&
      textOnlyPolicy.blockNetworkImage === true &&
      textOnlyPolicy.javaScriptEnabled === true &&
      inactivePolicy.javaScriptEnabled === true &&
      forcedAttempt.javaScriptEnabled === true;

    assertTest(
      "LightModePolicy safe defaults & JS is NEVER disabled (javaScriptEnabled === true)",
      pass,
      `blockWebFonts=${activePolicy.blockWebFonts}, blockMediaPreload=${activePolicy.blockMediaPreload}, textOnlyBlockImg=${textOnlyPolicy.blockNetworkImage}, cacheMode=${activePolicy.cacheMode}, jsEnabled=${forcedAttempt.javaScriptEnabled}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 8: nativeBrowserEngine.setLightMode(tabId, policy) feature-detected no-op when unsupported
  // ---------------------------------------------------------------------------
  {
    const engine = createNativeBrowserEngine();
    const policy = buildLightModePolicy({ lightMode: true });
    const resUnsupported = await engine.setLightMode("tab-1", policy);
    const passUnsupported = resUnsupported.supported === false;
    engine.destroy();

    assertTest(
      "nativeBrowserEngine.setLightMode returns {supported:false} no-op when native plugin lacks support",
      passUnsupported,
      `supported=${resUnsupported.supported}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 9: Per-tab lightMode boolean persisted in sessionPersistence snapshot
  // ---------------------------------------------------------------------------
  {
    const storage = createMemoryStorage();
    const persistence = createSessionPersistenceEngine({ storage, debounceMs: 10 });

    const saveRes = persistence.saveSnapshotAtomic(
      [
        {
          id: "tab-light-on",
          url: "https://example.com/a",
          title: "Article A",
          history: ["https://example.com/a"],
          historyIndex: 0,
          isLoading: false,
          isPrivate: false,
          isReaderMode: false,
          isSuspended: false,
          lightMode: true,
        },
        {
          id: "tab-light-off",
          url: "https://example.com/b",
          title: "Article B",
          history: ["https://example.com/b"],
          historyIndex: 0,
          isLoading: false,
          isPrivate: false,
          isReaderMode: false,
          isSuspended: false,
          lightMode: false,
        },
      ],
      "tab-light-on"
    );

    const raw = storage.getItem(SESSION_V2_PRIMARY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const checksumValid = validateAndVerifySnapshot(parsed);
    const restored = persistence.loadSession();
    const tOn = restored.tabs.find((t) => t.id === "tab-light-on");
    const tOff = restored.tabs.find((t) => t.id === "tab-light-off");

    const pass =
      saveRes.success === true &&
      checksumValid === true &&
      typeof parsed?.tabs?.[0]?.lightMode === "boolean" &&
      tOn?.lightMode === true &&
      tOff?.lightMode === false;

    assertTest(
      "Per-tab lightMode persisted as boolean in session snapshot with valid checksum",
      pass,
      `saved=${saveRes.success}, checksumValid=${checksumValid}, tabOn.lightMode=${tOn?.lightMode}, tabOff.lightMode=${tOff?.lightMode}`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 10: Offline Queue — sanitization, no POST body stored, private tab exclusion, max 20 limit, confirmation & Clear Browsing Data purge
  // ---------------------------------------------------------------------------
  {
    const mem = createMemoryStorage();
    const q = createOfflineNavigationQueue({ storage: mem });

    // 1. Private tab excluded
    const privRes = q.enqueueWhenOnline("https://example.com/secret", {
      id: "tab-priv",
      isPrivate: true,
    });

    // 2. URL with tokens/credentials sanitized and postBody/headers stripped before storage
    const sanRes = q.enqueueWhenOnline(
      "https://user:pass@example.com/read?id=42&access_token=secret123&jwt=tok#section2",
      { id: "tab-1", isPrivate: false },
      { postBody: "secret_post_body=1", headers: { Authorization: "Bearer secret" } }
    );
    const storedUrl = sanRes.item?.url || "";
    const rawPersisted = mem.getItem(OFFLINE_QUEUE_STORAGE_KEY) || "";
    const tokenAndBodyStripped =
      storedUrl === "https://example.com/read?id=42" &&
      !storedUrl.includes("secret123") &&
      !storedUrl.includes("user:pass") &&
      !rawPersisted.includes("secret_post_body") &&
      !rawPersisted.includes("Bearer secret");

    // 3. Single item on validated online -> requiresUserConfirmation = false (auto-opens)
    const singleOnline = q.onValidatedOnline();
    const singleAutoOpens =
      singleOnline.action === "AUTO_OPEN_SINGLE" &&
      singleOnline.requiresUserConfirmation === false &&
      singleOnline.itemsToOpen[0]?.url === "https://example.com/read?id=42";

    // 4. Enqueue 25 items -> capped at max 20 items
    for (let i = 1; i <= 25; i++) {
      q.enqueueWhenOnline(`https://example.com/page-${i}`, {
        id: "tab-1",
        isPrivate: false,
      });
    }
    const itemsAfter25 = q.getQueue();
    const cappedAt20 =
      itemsAfter25.length === 20 &&
      itemsAfter25[0].url === "https://example.com/page-6" &&
      itemsAfter25[itemsAfter25.length - 1].url === "https://example.com/page-25";

    // 5. Multiple items on validated online -> requiresUserConfirmation = true
    const multiOnline = q.onValidatedOnline();
    const multiNeedsConfirm =
      multiOnline.action === "CONFIRM_MULTIPLE_QUEUED" &&
      multiOnline.requiresUserConfirmation === true &&
      multiOnline.itemsToOpen.length === 20 &&
      q.isAwaitingUserConfirmation() === true;

    // 6. Clear Browsing Data purges the queue
    q.clearQueue();
    const emptyAfterClear =
      q.getQueue().length === 0 &&
      mem.getItem(OFFLINE_QUEUE_STORAGE_KEY) === null;

    const pass =
      privRes.queued === false &&
      privRes.reasonCode === "PRIVATE_TAB_EXCLUDED" &&
      tokenAndBodyStripped &&
      singleAutoOpens &&
      cappedAt20 &&
      multiNeedsConfirm &&
      emptyAfterClear;

    assertTest(
      "Offline queue enforces sanitization, no POST body/tokens, no private tabs, max 20 cap, >1 confirmation, and Clear Browsing Data purge",
      pass,
      `privExcluded=${!privRes.queued}, sanitizedUrl="${storedUrl}", cap=${itemsAfter25.length}, multiConfirm=${multiNeedsConfirm}, cleared=${emptyAfterClear}`
    );
  }

  console.table(rows);
  console.log(`ALL ${rows.length}/${rows.length} LIGHT MODE, FALLBACK & QUEUE TESTS PASSED.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
