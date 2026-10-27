import {
  createSessionPersistenceEngine,
  validateAndVerifySnapshot,
  computeSnapshotChecksum,
  sanitizeUrlForSession,
  buildSessionSnapshotV2,
  SESSION_V2_PRIMARY_KEY,
  SESSION_V2_BACKUP_KEY,
  SESSION_V2_TEMP_KEY,
  SESSION_V1_LEGACY_KEY,
  SESSION_V1_ACTIVE_TAB_KEY,
  SESSION_STORAGE_KEYS,
  MAX_PERSISTED_TABS,
  MAX_SNAPSHOT_BYTES,
  SessionStorageAdapter,
  SessionTabRuntime,
} from "../src/services/sessionPersistence";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function createMemoryStorage(initial: Record<string, string> = {}): SessionStorageAdapter & {
  dump: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    dump(): Record<string, string> {
      return Object.fromEntries(map.entries());
    },
  };
}

function makeSampleTab(overrides: Partial<SessionTabRuntime> & { id: string }): SessionTabRuntime {
  const url = overrides.url ?? "https://example.com/articles/1";
  return {
    id: overrides.id,
    url,
    title: overrides.title ?? `Title for ${overrides.id}`,
    history: overrides.history ?? [url],
    historyIndex: overrides.historyIndex ?? 0,
    isLoading: overrides.isLoading ?? false,
    isPrivate: overrides.isPrivate ?? false,
    isReaderMode: overrides.isReaderMode ?? false,
    isSuspended: overrides.isSuspended ?? false,
    zoomLevel: overrides.zoomLevel ?? 100,
    siteMode: overrides.siteMode ?? "default",
    contentHtml: overrides.contentHtml ?? "<p>Committed content</p>",
    error: overrides.error,
    errorInfo: overrides.errorInfo,
    isNativeWebView: overrides.isNativeWebView ?? false,
    renderMode: overrides.renderMode ?? "sanitized_html",
    scrollY: overrides.scrollY ?? 240,
    lastMethod: overrides.lastMethod ?? "GET",
  };
}

console.log("=== STARTING NETFLOW SESSION PERSISTENCE ENGINE V2 VERIFICATION SUITE ===");

// ---------------------------------------------------------------------------
// 1. Checksum valid / invalid detection
// ---------------------------------------------------------------------------
console.log("1. Testing checksum computation and tamper detection...");
{
  const tab1 = makeSampleTab({ id: "tab-1", url: "https://example.com/news" });
  const snap = buildSessionSnapshotV2([tab1], "tab-1");
  assert(snap !== null, "Snapshot should be created");
  assert(validateAndVerifySnapshot(snap), "Untampered snapshot must pass checksum verification");

  // Tamper with URL without updating checksum
  const tamperedUrl = JSON.parse(JSON.stringify(snap));
  tamperedUrl.tabs[0].url = "https://evil.example.com/";
  assert(
    !validateAndVerifySnapshot(tamperedUrl),
    "Snapshot with tampered URL must fail checksum verification"
  );

  // Tamper with checksum directly
  const tamperedChk = JSON.parse(JSON.stringify(snap));
  tamperedChk.checksum = "nfv2_0000000000000000_999";
  assert(
    !validateAndVerifySnapshot(tamperedChk),
    "Snapshot with forged checksum must fail verification"
  );
  console.log("✓ Checksum valid/invalid verification passed.");
}

// ---------------------------------------------------------------------------
// 2. Corrupt primary -> backup used (and heals primary)
// ---------------------------------------------------------------------------
console.log("2. Testing corrupt primary fallback to verified backup slot...");
{
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage });

  // First save (populates primary and backup)
  const tabsV1 = [
    makeSampleTab({ id: "tab-good-1", url: "https://example.com/first", scrollY: 320 }),
  ];
  const res1 = engine.saveSnapshotAtomic(tabsV1, "tab-good-1");
  assert(res1.success, "First atomic save should succeed");

  // Second save (moves first save to backup, writes new primary)
  const tabsV2 = [
    makeSampleTab({ id: "tab-good-1", url: "https://example.com/first", scrollY: 320 }),
    makeSampleTab({ id: "tab-good-2", url: "https://example.com/second", scrollY: 540 }),
  ];
  const res2 = engine.saveSnapshotAtomic(tabsV2, "tab-good-2");
  assert(res2.success, "Second atomic save should succeed");

  // Now simulate power-loss corruption in primary slot (half-written JSON)
  storage.setItem(SESSION_V2_PRIMARY_KEY, '{"schemaVersion":2,"savedAt":1700000,"corrupted_half');

  const loaded = engine.loadSession();
  assert(loaded.source === "backup", `Expected source 'backup', got '${loaded.source}'`);
  assert(loaded.tabs.length === 1 && loaded.tabs[0].id === "tab-good-1", "Should restore backup tab state");
  assert(loaded.tabs[0].scrollY === 320, "Should restore backup scrollY=320");
  assert(loaded.wasRestored === true, "wasRestored should be true");

  // Confirm primary was healed from backup
  const healedPrimary = JSON.parse(storage.getItem(SESSION_V2_PRIMARY_KEY)!);
  assert(validateAndVerifySnapshot(healedPrimary), "Primary slot should be healed from backup");
  console.log("✓ Corrupt primary -> backup fallback passed.");
}

// ---------------------------------------------------------------------------
// 3. Both primary and backup corrupt -> fresh start, no throw
// ---------------------------------------------------------------------------
console.log("3. Testing both primary & backup corrupt -> safe fresh start without throwing...");
{
  const storage = createMemoryStorage({
    [SESSION_V2_PRIMARY_KEY]: "{not-valid-json",
    [SESSION_V2_BACKUP_KEY]: '{"schemaVersion":2,"savedAt":123,"activeTabId":"x","checksum":"nfv2_bad","tabs":[]}',
  });
  const engine = createSessionPersistenceEngine({ storage });

  let loaded;
  try {
    loaded = engine.loadSession();
  } catch (err) {
    throw new Error(`loadSession must never throw on corrupt storage, but threw: ${err}`);
  }

  assert(loaded.source === "fresh", `Expected source 'fresh', got '${loaded.source}'`);
  assert(loaded.wasRestored === false, "Fresh start must have wasRestored=false");
  assert(loaded.tabs.length === 1 && loaded.tabs[0].url === "", "Fresh start must return 1 blank start tab");
  console.log("✓ Both corrupt -> fresh start without throw passed.");
}

// ---------------------------------------------------------------------------
// 4. Private tabs strictly excluded
// ---------------------------------------------------------------------------
console.log("4. Testing private tab exclusion...");
{
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage });

  const mixedTabs: SessionTabRuntime[] = [
    makeSampleTab({ id: "normal-1", url: "https://example.com/public", isPrivate: false }),
    makeSampleTab({ id: "private-1", url: "https://secret.example.com/private", isPrivate: true }),
    makeSampleTab({ id: "normal-2", url: "https://example.org/docs", isPrivate: false }),
  ];

  // Even if activeTabId points to private-1, private-1 must be excluded and activeTabId falls back to a normal tab
  const saveRes = engine.saveSnapshotAtomic(mixedTabs, "private-1");
  assert(saveRes.success && saveRes.snapshot, "Save with mixed tabs should succeed");
  assert(saveRes.snapshot!.tabs.length === 2, "Only the 2 non-private tabs may be persisted");
  assert(
    saveRes.snapshot!.tabs.every((t) => t.id !== "private-1" && !t.url.includes("secret.example.com")),
    "Private tab ID and URL must be completely absent from snapshot"
  );
  assert(
    saveRes.snapshot!.activeTabId === "normal-2",
    "Active tab ID must resolve to a non-private tab when private tab was active"
  );

  const rawPrimary = storage.getItem(SESSION_V2_PRIMARY_KEY) || "";
  assert(!rawPrimary.includes("private-1") && !rawPrimary.includes("secret.example.com"), "Raw storage must contain zero private tab data");
  console.log("✓ Private tab exclusion passed.");
}

// ---------------------------------------------------------------------------
// 5. Token / password / auth / key / secret / session / signature URL params and userinfo stripped
// ---------------------------------------------------------------------------
console.log("5. Testing URL sanitizer strips sensitive params and userinfo...");
{
  const dirtyUrl =
    "https://adminUser:superSecretPass@example.com/account/callback?page=3&token=tok_12345&password=myPass99&auth=bearerXYZ&api_key=k_999&secret=sec_abc&session=sess_777&signature=sig_888&lang=bn#access_token=frag_tok_111&section=top";
  const cleaned = sanitizeUrlForSession(dirtyUrl);

  assert(cleaned === "https://example.com/account/callback?page=3&lang=bn#section=top", `Unexpected sanitized URL: ${cleaned}`);
  assert(!cleaned.includes("adminUser"), "Username must be stripped");
  assert(!cleaned.includes("superSecretPass"), "Password userinfo must be stripped");
  assert(!cleaned.includes("tok_12345") && !cleaned.includes("token="), "Token param must be stripped");
  assert(!cleaned.includes("myPass99") && !cleaned.includes("password="), "Password param must be stripped");
  assert(!cleaned.includes("bearerXYZ") && !cleaned.includes("auth="), "Auth param must be stripped");
  assert(!cleaned.includes("k_999") && !cleaned.includes("api_key="), "Key param must be stripped");
  assert(!cleaned.includes("sec_abc") && !cleaned.includes("secret="), "Secret param must be stripped");
  assert(!cleaned.includes("sess_777") && !cleaned.includes("session="), "Session param must be stripped");
  assert(!cleaned.includes("sig_888") && !cleaned.includes("signature="), "Signature param must be stripped");
  assert(!cleaned.includes("frag_tok_111") && !cleaned.includes("access_token"), "Hash token must be stripped");
  console.log("✓ URL sensitive params and userinfo stripping passed.");
}

// ---------------------------------------------------------------------------
// 6. POST body absent, forbidden fields absent, and lastMethod="POST" kept
// ---------------------------------------------------------------------------
console.log("6. Testing POST body / sensitive fields absence and lastMethod preservation...");
{
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage });

  const tabWithExtraSecrets = {
    ...makeSampleTab({
      id: "tab-post-1",
      url: "https://example.com/checkout/submit",
      lastMethod: "POST",
    }),
    // Simulate extra runtime properties that must NEVER be persisted
    postBody: "cardNumber=4111222233334444&cvv=999",
    cookies: "SID=secret_cookie_value",
    password: "hidden_password_123",
    formDrafts: { card: "4111222233334444" },
  } as unknown as SessionTabRuntime;

  const saveRes = engine.saveSnapshotAtomic([tabWithExtraSecrets], "tab-post-1");
  assert(saveRes.success, "Save of POST tab should succeed");

  const rawJson = storage.getItem(SESSION_V2_PRIMARY_KEY)!;
  assert(!rawJson.includes("4111222233334444"), "POST body / card data must never be stored");
  assert(!rawJson.includes("postBody"), "postBody key must never be stored");
  assert(!rawJson.includes("secret_cookie_value"), "Cookies must never be stored");
  assert(!rawJson.includes("hidden_password_123"), "Passwords must never be stored");
  assert(!rawJson.includes("formDrafts"), "Form drafts must never be stored");

  const loaded = engine.loadSession();
  assert(loaded.tabs[0].lastMethod === "POST", "lastMethod='POST' must be preserved");
  assert(
    loaded.activeTabRequiresPostConfirm === true,
    "Restored active tab with lastMethod='POST' must flag activeTabRequiresPostConfirm=true"
  );
  console.log("✓ POST body absence and lastMethod='POST' preservation passed.");
}

// ---------------------------------------------------------------------------
// 7. 25-tab cap and 256 KB trimming keeps active tab
// ---------------------------------------------------------------------------
console.log("7. Testing 25-tab cap and 256 KB size trimming (preserving active tab)...");
{
  // 7a. 30 tabs where active tab is the oldest tab (tab-0): must cap at 25 and keep tab-0
  const thirtyTabs: SessionTabRuntime[] = Array.from({ length: 30 }, (_, idx) =>
    makeSampleTab({
      id: `tab-${idx}`,
      url: `https://example.com/page-${idx}`,
      title: `Tab Number ${idx}`,
    })
  );
  const snap25 = buildSessionSnapshotV2(thirtyTabs, "tab-0");
  assert(snap25 !== null, "Snapshot for 30 tabs should be built");
  assert(
    snap25!.tabs.length === MAX_PERSISTED_TABS,
    `Expected ${MAX_PERSISTED_TABS} tabs, got ${snap25!.tabs.length}`
  );
  assert(
    snap25!.tabs.some((t) => t.id === "tab-0"),
    "Active tab 'tab-0' must NEVER be dropped during 25-tab cap trimming"
  );
  assert(
    !snap25!.tabs.some((t) => t.id === "tab-1"),
    "Oldest non-active background tab 'tab-1' should be dropped first"
  );

  // 7b. Exceed 256 KB byte limit with 25 tabs containing large history URLs (~15 KB per tab -> ~375 KB raw)
  const heavyTabs: SessionTabRuntime[] = Array.from({ length: 25 }, (_, idx) => {
    const longHistory = Array.from(
      { length: 30 },
      (__, hIdx) => `https://example.com/tab-${idx}/hist-${hIdx}/${"a".repeat(480)}`
    );
    return makeSampleTab({
      id: `heavy-tab-${idx}`,
      url: longHistory[longHistory.length - 1],
      history: longHistory,
      historyIndex: longHistory.length - 1,
    });
  });

  const heavySnap = buildSessionSnapshotV2(heavyTabs, "heavy-tab-0");
  assert(heavySnap !== null, "Heavy snapshot should be built");
  const encodedBytes = new TextEncoder().encode(JSON.stringify(heavySnap)).length;
  assert(
    encodedBytes <= MAX_SNAPSHOT_BYTES,
    `Expected snapshot byte size <= ${MAX_SNAPSHOT_BYTES}, got ${encodedBytes}`
  );
  assert(
    heavySnap!.tabs.some((t) => t.id === "heavy-tab-0"),
    "Active tab 'heavy-tab-0' must be preserved after 256 KB trimming"
  );
  assert(
    validateAndVerifySnapshot(heavySnap),
    "Trimmed 256 KB snapshot must have a valid checksum"
  );
  console.log(`✓ 25-tab cap and 256 KB trimming passed (trimmed size: ${encodedBytes} bytes).`);
}

// ---------------------------------------------------------------------------
// 8. Migration from old key `netflow_tabs_session` (and keeps V1 if V2 fails)
// ---------------------------------------------------------------------------
console.log("8. Testing migration from legacy key netflow_tabs_session...");
{
  const legacyV1Payload = JSON.stringify([
    {
      id: "legacy-1",
      url: "https://user:pass@example.com/legacy-article?token=secret99&ref=home",
      title: "Legacy Article",
      history: ["", "https://user:pass@example.com/legacy-article?token=secret99&ref=home"],
      historyIndex: 1,
      isReaderMode: true,
      zoomLevel: 125,
      siteMode: "desktop",
    },
    {
      id: "legacy-2",
      url: "https://example.org/second",
      title: "Second Legacy Tab",
      history: ["https://example.org/second"],
      historyIndex: 0,
      isReaderMode: false,
      zoomLevel: 100,
      siteMode: "default",
    },
  ]);

  // 8a. Verify that if V2 write fails, V1 data is NOT deleted
  const readOnlyV2Storage: SessionStorageAdapter = {
    getItem(key: string) {
      if (key === SESSION_V1_LEGACY_KEY) return legacyV1Payload;
      if (key === SESSION_V1_ACTIVE_TAB_KEY) return "legacy-2";
      return null;
    },
    setItem() {
      throw new Error("Simulated QuotaExceededError on V2 write");
    },
    removeItem(key: string) {
      if (key === SESSION_V1_LEGACY_KEY) {
        throw new Error("MUST NOT delete legacy V1 key when V2 verification fails!");
      }
    },
  };
  const failEngine = createSessionPersistenceEngine({ storage: readOnlyV2Storage });
  const migratedWithoutWrite = failEngine.loadSession();
  assert(
    migratedWithoutWrite.source === "migrated_v1",
    "Should still convert V1 in memory even if V2 write fails"
  );

  // 8b. Normal migration: converts V1 -> V2, verifies V2, then removes V1 key
  const storage = createMemoryStorage({
    [SESSION_V1_LEGACY_KEY]: legacyV1Payload,
    [SESSION_V1_ACTIVE_TAB_KEY]: "legacy-2",
  });
  const engine = createSessionPersistenceEngine({ storage });
  const migrated = engine.loadSession();

  assert(migrated.source === "migrated_v1", `Expected 'migrated_v1', got '${migrated.source}'`);
  assert(migrated.tabs.length === 2, "Should migrate both legacy tabs");
  assert(migrated.activeTabId === "legacy-2", "Should preserve legacy active tab ID");
  assert(
    migrated.tabs[0].url === "https://example.com/legacy-article?ref=home",
    `Legacy URL should be sanitized during V2 migration, got: ${migrated.tabs[0].url}`
  );
  assert(migrated.tabs[0].zoomLevel === 125 && migrated.tabs[0].siteMode === "desktop", "Should preserve zoomLevel and siteMode");
  assert(
    storage.getItem(SESSION_V1_LEGACY_KEY) === null,
    "Legacy key should be removed after V2 snapshot is verified"
  );
  assert(
    validateAndVerifySnapshot(JSON.parse(storage.getItem(SESSION_V2_PRIMARY_KEY)!)),
    "V2 primary key must contain verified snapshot after migration"
  );
  console.log("✓ Legacy V1 -> V2 migration passed.");
}

// ---------------------------------------------------------------------------
// 9. Failed / in-flight navigation persists LAST COMMITTED history URL
// ---------------------------------------------------------------------------
console.log("9. Testing failed / in-flight navigation persists last committed URL...");
{
  // Case A: Tab committed https://good.example.com/page1, then navigated to https://broken.example.com/fail which failed
  const failedTab = makeSampleTab({
    id: "tab-fail-1",
    url: "https://broken.example.com/fail",
    history: ["", "https://good.example.com/page1"],
    historyIndex: 1,
    contentHtml: undefined,
    error: "Connection timed out",
    isLoading: false,
  });

  // Case B: Tab is currently in-flight loading https://slow.example.com/loading after committing https://good.example.com/page2
  const inFlightTab = makeSampleTab({
    id: "tab-inflight-1",
    url: "https://slow.example.com/loading",
    history: ["https://good.example.com/page2"],
    historyIndex: 0,
    contentHtml: "<p>Prior page content still mounted</p>",
    isLoading: true,
  });

  // Case C: Brand new tab on Start Page ("") that failed its very first navigation
  const firstNavFailedTab = makeSampleTab({
    id: "tab-first-fail",
    url: "https://unreachable.example.com/",
    history: [""],
    historyIndex: 0,
    contentHtml: undefined,
    error: "DNS lookup failed",
    isLoading: false,
  });

  const snap = buildSessionSnapshotV2(
    [failedTab, inFlightTab, firstNavFailedTab],
    "tab-fail-1"
  );
  assert(snap !== null, "Snapshot should be built");
  assert(
    snap!.tabs[0].url === "https://good.example.com/page1",
    `Failed navigation must persist last committed URL 'https://good.example.com/page1', got '${snap!.tabs[0].url}'`
  );
  assert(
    snap!.tabs[1].url === "https://good.example.com/page2",
    `In-flight navigation must persist last committed URL 'https://good.example.com/page2', got '${snap!.tabs[1].url}'`
  );
  assert(
    snap!.tabs[2].url === "",
    `First-navigation failure from Start Page must persist '', got '${snap!.tabs[2].url}'`
  );
  console.log("✓ Failed/in-flight navigation last-committed URL preservation passed.");
}

// ---------------------------------------------------------------------------
// 10. Scroll capture isolation rule (non-iframe captures number, iframe stores null)
// ---------------------------------------------------------------------------
console.log("10. Testing scrollY capture respects Form 3/6 iframe isolation...");
{
  const nonIframeTab = makeSampleTab({
    id: "tab-reader",
    url: "https://example.com/article",
    isNativeWebView: false,
    renderMode: "sanitized_html",
    scrollY: 480,
  });
  const iframeTab = makeSampleTab({
    id: "tab-iframe",
    url: "https://example.com/interactive",
    isNativeWebView: true,
    renderMode: "native_webview",
    scrollY: 480, // Even if passed, must be forced to null for iframe renderer
  });

  const snap = buildSessionSnapshotV2([nonIframeTab, iframeTab], "tab-reader", {
    browsingMode: "smart-compress",
  });
  assert(snap !== null, "Snapshot should be built");
  assert(snap!.tabs[0].scrollY === 480, "Non-iframe renderer must persist scrollY=480");
  assert(snap!.tabs[1].scrollY === null, "Iframe renderer must persist scrollY=null");
  console.log("✓ Scroll capture isolation check passed.");
}

// ---------------------------------------------------------------------------
// 11. Clear-all leaves no old history in any V2 key & backup slot is also clean
// ---------------------------------------------------------------------------
console.log("11. Testing clear-all purges old history from all V2 keys including backup slot...");
{
  const storage = createMemoryStorage({
    [SESSION_V1_LEGACY_KEY]: JSON.stringify([{ id: "old-v1", url: "https://legacy-secret.example.com" }]),
    netflow_client_id: "client-uuid-preserve-check-01",
  });
  const engine = createSessionPersistenceEngine({ storage });

  const tabWithHistory = makeSampleTab({
    id: "tab-open-1",
    url: "https://current-open.example.com/dashboard",
    history: [
      "https://old-history-1.example.com/step1",
      "https://old-history-2.example.com/step2",
      "https://current-open.example.com/dashboard",
    ],
    historyIndex: 2,
  });

  // Save twice so both PRIMARY and BACKUP contain the old history URLs
  engine.saveSnapshotAtomic([tabWithHistory], "tab-open-1");
  engine.saveSnapshotAtomic([tabWithHistory], "tab-open-1");

  assert(
    (storage.getItem(SESSION_V2_PRIMARY_KEY) || "").includes("old-history-1.example.com"),
    "Precondition: primary key should have old history before clear"
  );
  assert(
    (storage.getItem(SESSION_V2_BACKUP_KEY) || "").includes("old-history-1.example.com"),
    "Precondition: backup key should have old history before clear"
  );

  // Execute clear-all (open non-private tab keeps its own current URL, history reduced to [currentUrl])
  const clearRes = engine.purgeAndResaveForClear([tabWithHistory], "tab-open-1", {
    type: "all_time",
  });
  assert(clearRes.saveResult.success, "Clear-all resave must succeed");

  for (const key of SESSION_STORAGE_KEYS) {
    const val = storage.getItem(key) || "";
    assert(
      !val.includes("old-history-1.example.com") &&
        !val.includes("old-history-2.example.com") &&
        !val.includes("legacy-secret.example.com"),
      `Key '${key}' must contain zero old history URLs after clear-all`
    );
  }

  assert(storage.getItem(SESSION_V2_TEMP_KEY) === null, "Temp key must be null after clear-all");
  assert(storage.getItem(SESSION_V1_LEGACY_KEY) === null, "Legacy V1 key must be null after clear-all");

  const primaryAfter = JSON.parse(storage.getItem(SESSION_V2_PRIMARY_KEY)!);
  const backupAfter = JSON.parse(storage.getItem(SESSION_V2_BACKUP_KEY)!);
  assert(validateAndVerifySnapshot(primaryAfter), "Primary slot after clear-all must be valid V2");
  assert(validateAndVerifySnapshot(backupAfter), "Backup slot after clear-all must be valid V2");
  assert(
    primaryAfter.tabs[0].history.length === 1 &&
      primaryAfter.tabs[0].history[0] === "https://current-open.example.com/dashboard",
    "Primary slot must retain only current open tab URL with history length 1"
  );
  assert(
    backupAfter.tabs[0].history.length === 1 &&
      backupAfter.tabs[0].history[0] === "https://current-open.example.com/dashboard",
    "Backup slot must also be clean and retain only current open tab URL"
  );
  console.log("✓ Clear-all V2 primary + backup slot cleanliness passed.");
}

// ---------------------------------------------------------------------------
// 12. Time-range clear reduces history arrays accordingly
// ---------------------------------------------------------------------------
console.log("12. Testing time-range clear removes recent history while preserving older history...");
{
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage });

  const tabTimeRange = makeSampleTab({
    id: "tab-tr-1",
    url: "https://current.example.com/page",
    history: [
      "https://two-days-ago.example.com/archive",
      "https://five-mins-ago.example.com/recent",
      "https://current.example.com/page",
    ],
    historyIndex: 2,
  });

  engine.saveSnapshotAtomic([tabTimeRange], "tab-tr-1");
  engine.purgeAndResaveForClear([tabTimeRange], "tab-tr-1", {
    type: "time_range",
    cutoffTimestamp: Date.now() - 3600_000,
    clearedUrls: ["https://five-mins-ago.example.com/recent"],
    survivingUrls: ["https://two-days-ago.example.com/archive"],
  });

  const primaryRaw = storage.getItem(SESSION_V2_PRIMARY_KEY)!;
  const backupRaw = storage.getItem(SESSION_V2_BACKUP_KEY)!;
  assert(!primaryRaw.includes("five-mins-ago.example.com"), "Cleared time-range URL must be removed from primary");
  assert(!backupRaw.includes("five-mins-ago.example.com"), "Cleared time-range URL must be removed from backup");
  assert(primaryRaw.includes("two-days-ago.example.com"), "Older surviving history URL must remain in primary");
  console.log("✓ Time-range clear history reduction passed.");
}

// ---------------------------------------------------------------------------
// 13. Single-site clear removes ONLY that domain and preserves other domains
// ---------------------------------------------------------------------------
console.log("13. Testing single-site clear removes only target domain...");
{
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage });

  const tab1 = makeSampleTab({
    id: "tab-site-1",
    url: "https://kept-news.example.org/story",
    history: [
      "https://kept-docs.example.net/intro",
      "https://bad-tracker.example.com/click",
      "https://sub.bad-tracker.example.com/pixel",
      "https://kept-news.example.org/story",
    ],
    historyIndex: 3,
  });

  const tab2 = makeSampleTab({
    id: "tab-site-2",
    url: "https://bad-tracker.example.com/landing",
    history: [
      "https://kept-forum.example.org/thread",
      "https://bad-tracker.example.com/landing",
    ],
    historyIndex: 1,
  });

  engine.saveSnapshotAtomic([tab1, tab2], "tab-site-1");
  engine.saveSnapshotAtomic([tab1, tab2], "tab-site-1");

  const clearSiteRes = engine.purgeAndResaveForClear([tab1, tab2], "tab-site-1", {
    type: "single_site",
    domain: "bad-tracker.example.com",
  });
  assert(clearSiteRes.saveResult.success, "Single-site clear resave must succeed");

  const primaryRaw = storage.getItem(SESSION_V2_PRIMARY_KEY)!;
  const backupRaw = storage.getItem(SESSION_V2_BACKUP_KEY)!;

  assert(
    !primaryRaw.includes("bad-tracker.example.com") && !backupRaw.includes("bad-tracker.example.com"),
    "Target domain and its subdomains must be completely removed from primary and backup slots"
  );
  assert(
    primaryRaw.includes("kept-docs.example.net") &&
      primaryRaw.includes("kept-news.example.org") &&
      primaryRaw.includes("kept-forum.example.org"),
    "Non-matching domains must be preserved after single-site clear"
  );
  console.log("✓ Single-site clear domain isolation passed.");
}

// ---------------------------------------------------------------------------
// 14. Client ID (netflow_client_id) survives all clear operations
// ---------------------------------------------------------------------------
console.log("14. Testing netflow_client_id survives all clear actions...");
{
  const CLIENT_ID_KEY = "netflow_client_id";
  const CLIENT_ID_VAL = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const storage = createMemoryStorage({
    [CLIENT_ID_KEY]: CLIENT_ID_VAL,
  });
  const engine = createSessionPersistenceEngine({ storage });
  const sample = makeSampleTab({
    id: "tab-cid-1",
    url: "https://example.com/a",
    history: ["https://example.com/old", "https://example.com/a"],
    historyIndex: 1,
  });

  engine.saveSnapshotAtomic([sample], "tab-cid-1");
  engine.purgeAndResaveForClear([sample], "tab-cid-1", { type: "all_time" });
  engine.purgeAndResaveForClear([sample], "tab-cid-1", {
    type: "single_site",
    domain: "example.com",
  });
  engine.clearSessionStorage();

  assert(
    storage.getItem(CLIENT_ID_KEY) === CLIENT_ID_VAL,
    `Expected netflow_client_id '${CLIENT_ID_VAL}' to survive all clear operations, got '${storage.getItem(CLIENT_ID_KEY)}'`
  );
  console.log("✓ netflow_client_id survival check passed.");
}

// ---------------------------------------------------------------------------
// 15. Restore after clear shows no cleared URLs (even if primary corrupts -> backup fallback)
// ---------------------------------------------------------------------------
console.log("15. Testing startup restore after clear never resurrects cleared URLs...");
{
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage });

  const tabBeforeClear = makeSampleTab({
    id: "tab-res-1",
    url: "https://kept.example.com/current",
    history: [
      "https://secret-cleared-1.example.com/private-doc",
      "https://secret-cleared-2.example.com/account",
      "https://kept.example.com/current",
    ],
    historyIndex: 2,
  });

  engine.saveSnapshotAtomic([tabBeforeClear], "tab-res-1");
  engine.saveSnapshotAtomic([tabBeforeClear], "tab-res-1");

  // Clear all history
  engine.purgeAndResaveForClear([tabBeforeClear], "tab-res-1", { type: "all_time" });

  // 15a. Normal startup restore
  const restoredNormal = engine.loadSession();
  assert(
    restoredNormal.tabs.every(
      (t) =>
        !t.url.includes("secret-cleared") &&
        t.history.every((h) => !h.includes("secret-cleared"))
    ),
    "Normal restore after clear must not contain any cleared URLs"
  );

  // 15b. Simulate power-loss corruption of primary slot after clear to force backup slot restore
  storage.setItem(SESSION_V2_PRIMARY_KEY, "{corrupted_after_clear");
  const restoredFromBackup = engine.loadSession();
  assert(restoredFromBackup.source === "backup", "Should fall back to backup slot");
  assert(
    restoredFromBackup.tabs.every(
      (t) =>
        !t.url.includes("secret-cleared") &&
        t.history.every((h) => !h.includes("secret-cleared"))
    ),
    "Backup slot restore after clear must NEVER resurrect pre-clear URLs"
  );
  console.log("✓ Restore after clear (primary & backup fallback) check passed.");
}

// ---------------------------------------------------------------------------
// 16. Pending debounced save & stale epoch token after clear cannot restore old history
// ---------------------------------------------------------------------------
console.log("16. Testing pending debounced save and pagehide flush after clear cannot resurrect old history...");
(async () => {
  const storage = createMemoryStorage();
  const engine = createSessionPersistenceEngine({ storage, debounceMs: 40 });

  const tabWithOldHistory = makeSampleTab({
    id: "tab-race-1",
    url: "https://active.example.com/live",
    history: [
      "https://zombie-history-1.example.com/leak",
      "https://zombie-history-2.example.com/leak",
      "https://active.example.com/live",
    ],
    historyIndex: 2,
  });

  const preClearEpoch = engine.getSaveEpoch();

  // 1. Schedule a debounced save with old history (timer is now pending for 40ms)
  engine.scheduleSave([tabWithOldHistory], "tab-race-1");

  // 2. Immediately trigger clear-all BEFORE the 40ms debounce timer fires
  const clearRes = engine.purgeAndResaveForClear([tabWithOldHistory], "tab-race-1", {
    type: "all_time",
  });
  assert(clearRes.epoch > preClearEpoch, "Clear operation must increment saveEpoch");

  // 3. Wait 90ms (past the 40ms debounce window) to prove the pending timer was cancelled/invalidated
  await new Promise((resolve) => setTimeout(resolve, 90));

  // 4. Attempt explicit save with stale pre-clear epoch token (must be rejected as stale)
  const staleSaveAttempt = engine.saveSnapshotAtomic([tabWithOldHistory], "tab-race-1", {
    expectedEpoch: preClearEpoch,
  });
  assert(
    staleSaveAttempt.success === false && staleSaveAttempt.stale === true,
    "Save with stale pre-clear epoch token must be discarded"
  );

  // 5. Trigger flushNow() with no args (simulating pagehide / visibilitychange=hidden after clear)
  const flushAfterClear = engine.flushNow();
  assert(flushAfterClear.success === true, "Post-clear pagehide/visibility flush should succeed");

  const primaryRaw = storage.getItem(SESSION_V2_PRIMARY_KEY) || "";
  const backupRaw = storage.getItem(SESSION_V2_BACKUP_KEY) || "";
  assert(
    !primaryRaw.includes("zombie-history") && !backupRaw.includes("zombie-history"),
    "Pending debounced save or post-clear flush must NEVER resurrect cleared history in primary or backup"
  );

  const restored = engine.loadSession();
  assert(
    restored.tabs[0].history.length === 1 &&
      restored.tabs[0].history[0] === "https://active.example.com/live",
    "Restored session after debounce race must contain only post-clear state"
  );

  engine.destroy();
  console.log("✓ Pending debounced save & epoch token race protection passed.");
  console.log("=== ALL NETFLOW SESSION PERSISTENCE ENGINE V2 CHECKS PASSED SUCCESSFULLY ===");
})();
