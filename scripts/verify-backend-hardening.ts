/**
 * NETFLOW BROWSER V2 — FORM B1 (`NETFLOW-BACKEND-HARDENING-BUNDLE-01`)
 * Part 5 Verification Suite: scripts/verify-backend-hardening.ts
 *
 * Runs against the live local server (http://127.0.0.1:3000) and a dedicated
 * env-configured local server instance for ALLOWED_ORIGINS, MAX_RESPONSE_BYTES,
 * rate-limit window/count, and NETFLOW_API_ACCESS_TOKEN tests.
 */

process.env.NETFLOW_SKIP_AUTO_START = "1";
delete process.env.GEMINI_API_KEY;

interface TestRow {
  test: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
}

const results: TestRow[] = [];

function recordRow(test: string, expected: string, actual: string, passed: boolean): void {
  const status = passed ? "PASS" : "FAIL";
  results.push({ test, expected, actual, status });
  console.log(`${test} | ${expected} | ${actual} | ${status}`);
}

async function runVerification(): Promise<void> {
  const { app, getAllowedOriginsFromEnv, getStoredCookieJarCount, evictCookieJars } = await import(
    "../server.ts"
  );

  // Start env-configurable local server instance
  const srv = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => srv.once("listening", resolve));
  const envPort = (srv.address() as { port: number }).port;
  const envServerBase = `http://127.0.0.1:${envPort}`;

  // Use live port 3000 server if reachable, otherwise use local server instance
  let liveBase = envServerBase;
  try {
    const ping = await fetch("http://127.0.0.1:3000/api/health");
    if (ping.ok) {
      liveBase = "http://127.0.0.1:3000";
    }
  } catch {
    liveBase = envServerBase;
  }

  try {
    // 1. Same-origin POST /api/browse https://example.com/ -> ok
    {
      const res = await fetch(`${liveBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": "11111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({ url: "https://example.com/", mode: "smart-compress" }),
      });
      const data = await res.json();
      const passed =
        res.status === 200 &&
        data.success === true &&
        typeof data.contentHtml === "string" &&
        data.contentHtml.includes("Example Domain");
      recordRow(
        "same-origin POST /api/browse https://example.com/",
        "HTTP 200, success:true, Example Domain HTML",
        `HTTP ${res.status}, success:${data.success}, hasContent:${Boolean(data.contentHtml?.includes("Example Domain"))}`,
        passed
      );
    }

    // 2. Evil Origin POST and OPTIONS -> 403, no ACAO
    {
      const optRes = await fetch(`${liveBase}/api/browse`, {
        method: "OPTIONS",
        headers: { Origin: "https://evil-attacker.example.org" },
      });
      const postRes = await fetch(`${liveBase}/api/browse`, {
        method: "POST",
        headers: {
          Origin: "https://evil-attacker.example.org",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      const optAcao = optRes.headers.get("access-control-allow-origin");
      const postAcao = postRes.headers.get("access-control-allow-origin");
      const passed =
        optRes.status === 403 &&
        postRes.status === 403 &&
        optAcao === null &&
        postAcao === null;
      recordRow(
        "evil Origin POST and OPTIONS",
        "OPTIONS=403 (ACAO=null), POST=403 (ACAO=null)",
        `OPTIONS=${optRes.status} (ACAO=${optAcao}), POST=${postRes.status} (ACAO=${postAcao})`,
        passed
      );
    }

    // 3. Allow-listed Origin (ALLOWED_ORIGINS + https://localhost) OPTIONS -> 204 exact ACAO; "*" and http:// ignored
    {
      process.env.ALLOWED_ORIGINS =
        "https://trusted.netflow.app, *, http://insecure.netflow.app, https://*.wildcard.netflow.app";
      const parsedSet = getAllowedOriginsFromEnv();

      const localOpt = await fetch(`${envServerBase}/api/browse`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://localhost",
          "Sec-Fetch-Site": "cross-site",
        },
      });
      const envOpt = await fetch(`${envServerBase}/api/browse`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://trusted.netflow.app",
          "Sec-Fetch-Site": "cross-site",
        },
      });
      const httpIgnoredOpt = await fetch(`${envServerBase}/api/browse`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://insecure.netflow.app",
        },
      });

      const localAcao = localOpt.headers.get("access-control-allow-origin");
      const envAcao = envOpt.headers.get("access-control-allow-origin");
      const allowCreds = envOpt.headers.get("access-control-allow-credentials");
      const httpAcao = httpIgnoredOpt.headers.get("access-control-allow-origin");

      const passed =
        localOpt.status === 204 &&
        localAcao === "https://localhost" &&
        envOpt.status === 204 &&
        envAcao === "https://trusted.netflow.app" &&
        allowCreds === null &&
        parsedSet.size === 1 &&
        parsedSet.has("https://trusted.netflow.app") &&
        httpIgnoredOpt.status === 403 &&
        httpAcao === null;

      recordRow(
        "allow-listed Origin OPTIONS (https://localhost & ALLOWED_ORIGINS; * and http:// ignored)",
        "204 exact ACAO, no Allow-Credentials, * and http:// ignored (403)",
        `localhost=${localOpt.status}(${localAcao}), trusted=${envOpt.status}(${envAcao}), http=${httpIgnoredOpt.status}(${httpAcao}), parsedSetSize=${parsedSet.size}`,
        passed
      );
      delete process.env.ALLOWED_ORIGINS;
    }

    // 4. Cookie isolation: Client A sets x=1 (same tabId), Client B (same tabId) does NOT see x=1; A's clear does not remove B's cookie
    {
      const clientA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
      const clientB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
      const sharedTabId = "tab-shared-isolation";

      // Client A sets x=1
      const setA = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clientA,
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies/set?x=1",
          tabId: sharedTabId,
        }),
      });
      const setAData = await setA.json();
      const aHasX = Boolean(setAData.success && String(setAData.rawText).includes('"x": "1"'));

      // Client B requests https://httpbin.org/cookies on same tabId
      const getB = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clientB,
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies",
          tabId: sharedTabId,
        }),
      });
      const getBData = await getB.json();
      const bSeesX = String(getBData.rawText || "").includes('"x": "1"');

      // Client B sets y=2 on sharedTabId, then Client A clears all cookies
      await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clientB,
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies/set?y=2",
          tabId: sharedTabId,
        }),
      });

      await fetch(`${envServerBase}/api/cookies/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clientA,
        },
        body: JSON.stringify({}),
      });

      // Verify Client B still has y=2 while Client A no longer has x=1
      const getBAfterClear = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clientB,
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies",
          tabId: sharedTabId,
        }),
      });
      const getBAfterData = await getBAfterClear.json();
      const bPreservedY = String(getBAfterData.rawText || "").includes('"y": "2"');

      const getAAfterClear = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clientA,
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies",
          tabId: sharedTabId,
        }),
      });
      const getAAfterData = await getAAfterClear.json();
      const aClearedX = !String(getAAfterData.rawText || "").includes('"x": "1"');

      const passed = aHasX && !bSeesX && bPreservedY && aClearedX;
      recordRow(
        "cookie isolation (Client A vs Client B on same tabId + scoped clear)",
        "aHasX=true, bSeesX=false, bPreservedY=true, aClearedX=true",
        `aHasX=${aHasX}, bSeesX=${bSeesX}, bPreservedY=${bPreservedY}, aClearedX=${aClearedX}`,
        passed
      );
    }

    // 5. Invalid clientId -> ephemeral jar, nothing stored
    {
      evictCookieJars();
      const beforeJarCount = getStoredCookieJarCount();

      const setInvalid = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": "invalid_short!",
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies/set?ephemeral_test=1",
          tabId: "tab-ephemeral",
        }),
      });
      await setInvalid.json();

      const afterJarCount = getStoredCookieJarCount();

      const followUpInvalid = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": "invalid_short!",
        },
        body: JSON.stringify({
          url: "https://httpbin.org/cookies",
          tabId: "tab-ephemeral",
        }),
      });
      const followUpData = await followUpInvalid.json();
      const persistedCookieFound = String(followUpData.rawText || "").includes(
        '"ephemeral_test": "1"'
      );

      const passed = beforeJarCount === afterJarCount && !persistedCookieFound;
      recordRow(
        "invalid clientId -> ephemeral jar, nothing stored",
        `jarDelta=0, persistedCookieFound=false`,
        `jarDelta=${afterJarCount - beforeJarCount}, persistedCookieFound=${persistedCookieFound}`,
        passed
      );
    }

    // 6. Rate limit: exceed limit -> NETFLOW_RATE_LIMITED, then recovers after the window
    {
      process.env.RATE_LIMIT_WINDOW_MS = "1200";
      process.env.BROWSE_RATE_LIMIT_PER_MIN = "2";
      process.env.AI_RATE_LIMIT_PER_MIN = "1";
      const rlClientId = "dddddddd-4444-4444-8444-dddddddddddd";

      await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": rlClientId,
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": rlClientId,
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      const exceededBrowse = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": rlClientId,
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      const exceededBrowseData = await exceededBrowse.json();

      // Also verify /api/ai/* returns 429 JSON with Retry-After
      await fetch(`${envServerBase}/api/ai/simplify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": rlClientId,
        },
        body: JSON.stringify({ phrase: "bandwidth" }),
      });
      const exceededAi = await fetch(`${envServerBase}/api/ai/simplify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": rlClientId,
        },
        body: JSON.stringify({ phrase: "bandwidth" }),
      });
      const exceededAiData = await exceededAi.json();
      const aiRetryAfter = exceededAi.headers.get("retry-after");

      // Wait for window to slide past
      await new Promise((r) => setTimeout(r, 1300));

      const recoveredBrowse = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": rlClientId,
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      const recoveredBrowseData = await recoveredBrowse.json();

      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.BROWSE_RATE_LIMIT_PER_MIN;
      delete process.env.AI_RATE_LIMIT_PER_MIN;

      const passed =
        exceededBrowse.status === 200 &&
        exceededBrowseData.statusCode === 429 &&
        exceededBrowseData.errorCode === "NETFLOW_RATE_LIMITED" &&
        exceededBrowseData.errorCategory === "rate_limited" &&
        typeof exceededBrowseData.retryAfterSec === "number" &&
        exceededAi.status === 429 &&
        Boolean(aiRetryAfter) &&
        exceededAiData.errorCode === "NETFLOW_RATE_LIMITED" &&
        recoveredBrowseData.errorCode !== "NETFLOW_RATE_LIMITED";

      recordRow(
        "rate limit: exceed limit -> NETFLOW_RATE_LIMITED, then recovers after window",
        "browse=200/429(NETFLOW_RATE_LIMITED), ai=429(Retry-After), recovered!=NETFLOW_RATE_LIMITED",
        `browse=${exceededBrowse.status}/${exceededBrowseData.statusCode}(${exceededBrowseData.errorCode}), ai=${exceededAi.status}(Retry-After=${aiRetryAfter}), recovered=${recoveredBrowseData.errorCode}`,
        passed
      );
    }

    // 7. Byte cap: with MAX_RESPONSE_BYTES=500, example.com -> NETFLOW_RESPONSE_TOO_LARGE
    {
      process.env.MAX_RESPONSE_BYTES = "500";
      const capRes = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": "eeeeeeee-5555-4555-8555-eeeeeeeeeeee",
        },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      const capData = await capRes.json();
      delete process.env.MAX_RESPONSE_BYTES;

      const passed =
        capRes.status === 200 &&
        capData.success === false &&
        capData.errorCode === "NETFLOW_RESPONSE_TOO_LARGE";
      recordRow(
        "byte cap: MAX_RESPONSE_BYTES=500 on https://example.com/",
        "HTTP 200, success:false, errorCode:NETFLOW_RESPONSE_TOO_LARGE",
        `HTTP ${capRes.status}, success:${capData.success}, errorCode:${capData.errorCode}`,
        passed
      );
    }

    // 8. Access token gate on/off behavior
    {
      // Gate OFF (unset) -> allowed without token
      delete process.env.NETFLOW_API_ACCESS_TOKEN;
      const offRes = await fetch(`${envServerBase}/api/ai/simplify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: "DNS" }),
      });

      // Gate ON -> requires matching X-Netflow-Access-Token
      process.env.NETFLOW_API_ACCESS_TOKEN = "netflow-test-access-token-2026";
      const missingBrowseRes = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      const missingBrowseData = await missingBrowseRes.json();

      const wrongAiRes = await fetch(`${envServerBase}/api/ai/simplify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Access-Token": "wrong-token",
        },
        body: JSON.stringify({ phrase: "DNS" }),
      });

      const validAiRes = await fetch(`${envServerBase}/api/ai/simplify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Access-Token": "netflow-test-access-token-2026",
        },
        body: JSON.stringify({ phrase: "DNS" }),
      });
      delete process.env.NETFLOW_API_ACCESS_TOKEN;

      const passed =
        offRes.status === 200 &&
        missingBrowseRes.status === 200 &&
        missingBrowseData.statusCode === 401 &&
        missingBrowseData.errorCode === "NETFLOW_UNAUTHORIZED" &&
        wrongAiRes.status === 401 &&
        validAiRes.status === 200;

      recordRow(
        "access token gate on/off behavior",
        "off=200, on(missing browse)=200/401, on(wrong ai)=401, on(valid ai)=200",
        `off=${offRes.status}, on(missing browse)=${missingBrowseRes.status}/${missingBrowseData.statusCode}, on(wrong ai)=${wrongAiRes.status}, on(valid ai)=${validAiRes.status}`,
        passed
      );
    }

    // 9. /api/health has no key-presence flag
    {
      const hRes = await fetch(`${liveBase}/api/health`);
      const hData = await hRes.json();
      const hasAiKeyFlag =
        "aiConnected" in hData ||
        "hasKey" in hData ||
        "geminiKey" in hData ||
        "apiKey" in hData;
      const passed = hRes.status === 200 && hData.status === "ok" && !hasAiKeyFlag;
      recordRow(
        "/api/health has no key-presence flag",
        "HTTP 200, status:ok, no aiConnected/key flags",
        `HTTP ${hRes.status}, status:${hData.status}, keys:[${Object.keys(hData).join(",")}]`,
        passed
      );
    }

    // 10. 2mb limit: oversized body rejected cleanly (not a crash)
    {
      const oversizedPayload = JSON.stringify({
        url: "https://example.com/",
        padding: "x".repeat(2_200_000),
      });
      const bigRes = await fetch(`${liveBase}/api/browse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: oversizedPayload,
      });
      const bigData = await bigRes.json();
      // Verify server is still alive immediately after rejecting oversized body
      const healthAfter = await fetch(`${liveBase}/api/health`);
      const passed =
        bigRes.status === 413 &&
        bigData.errorCode === "NETFLOW_PAYLOAD_TOO_LARGE" &&
        healthAfter.status === 200;
      recordRow(
        "2mb limit: oversized body rejected cleanly (not a crash)",
        "HTTP 413 (NETFLOW_PAYLOAD_TOO_LARGE), server stays healthy (200)",
        `HTTP ${bigRes.status} (${bigData.errorCode}), healthAfter=${healthAfter.status}`,
        passed
      );
    }

    // 11. TRUST_PROXY off (default) ignores spoofed X-Forwarded-For (cannot bypass rate limit)
    {
      delete process.env.TRUST_PROXY;
      process.env.RATE_LIMIT_WINDOW_MS = "1500";
      process.env.BROWSE_RATE_LIMIT_PER_MIN = "2";
      const spoofClientId = "f1111111-1111-4111-8111-111111111111";

      // Send 3 requests with 3 different spoofed X-Forwarded-For IPs
      const r1 = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": spoofClientId,
          "X-Forwarded-For": "203.0.113.101",
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      const r2 = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": spoofClientId,
          "X-Forwarded-For": "203.0.113.102",
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      const r3 = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": spoofClientId,
          "X-Forwarded-For": "203.0.113.103",
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });

      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();

      await new Promise((r) => setTimeout(r, 1600));
      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.BROWSE_RATE_LIMIT_PER_MIN;

      const passed =
        d1.errorCode !== "NETFLOW_RATE_LIMITED" &&
        d2.errorCode !== "NETFLOW_RATE_LIMITED" &&
        d3.statusCode === 429 &&
        d3.errorCode === "NETFLOW_RATE_LIMITED";

      recordRow(
        "TRUST_PROXY off (default) ignores spoofed X-Forwarded-For",
        "r1!=RATE_LIMITED, r2!=RATE_LIMITED, r3=429(NETFLOW_RATE_LIMITED)",
        `r1=${d1.errorCode}, r2=${d2.errorCode}, r3=${d3.statusCode}(${d3.errorCode})`,
        passed
      );
    }

    // 12. TRUST_PROXY=1 honors X-Forwarded-For per client IP behind proxy
    {
      process.env.TRUST_PROXY = "1";
      process.env.RATE_LIMIT_WINDOW_MS = "1500";
      process.env.BROWSE_RATE_LIMIT_PER_MIN = "1";

      // Client at IP 198.51.100.10: 1st request allowed, 2nd request rate-limited
      const ipAReq1 = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.10",
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });
      const ipAReq2 = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.10",
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });

      // Distinct user at IP 198.51.100.20 behind the same proxy -> allowed in its own bucket
      const ipBReq1 = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.20",
        },
        body: JSON.stringify({ url: "http://127.0.0.1" }),
      });

      const ipAData1 = await ipAReq1.json();
      const ipAData2 = await ipAReq2.json();
      const ipBData1 = await ipBReq1.json();

      await new Promise((r) => setTimeout(r, 1600));
      delete process.env.TRUST_PROXY;
      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.BROWSE_RATE_LIMIT_PER_MIN;

      const passed =
        ipAData1.errorCode !== "NETFLOW_RATE_LIMITED" &&
        ipAData2.statusCode === 429 &&
        ipAData2.errorCode === "NETFLOW_RATE_LIMITED" &&
        ipBData1.errorCode !== "NETFLOW_RATE_LIMITED";

      recordRow(
        "TRUST_PROXY=1 honors X-Forwarded-For (per-IP buckets behind proxy)",
        "ipA_1!=RATE_LIMITED, ipA_2=429(NETFLOW_RATE_LIMITED), ipB_1!=RATE_LIMITED",
        `ipA_1=${ipAData1.errorCode}, ipA_2=${ipAData2.statusCode}(${ipAData2.errorCode}), ipB_1=${ipBData1.errorCode}`,
        passed
      );
    }

    // 13. /api/cookies/clear rate limit (default 30/min per client; enforces 429 + Retry-After)
    {
      const { getCookiesClearRateLimitPerWindow } = await import("../server.ts");
      delete process.env.COOKIES_CLEAR_RATE_LIMIT_PER_MIN;
      const defaultClearLimit = getCookiesClearRateLimitPerWindow();

      process.env.RATE_LIMIT_WINDOW_MS = "1500";
      process.env.COOKIES_CLEAR_RATE_LIMIT_PER_MIN = "2";
      const clearClientId = "f2222222-2222-4222-8222-222222222222";

      const c1 = await fetch(`${envServerBase}/api/cookies/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clearClientId,
        },
        body: JSON.stringify({}),
      });
      const c2 = await fetch(`${envServerBase}/api/cookies/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clearClientId,
        },
        body: JSON.stringify({}),
      });
      const c3 = await fetch(`${envServerBase}/api/cookies/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Netflow-Client-Id": clearClientId,
        },
        body: JSON.stringify({}),
      });
      const c3Data = await c3.json();
      const retryAfter = c3.headers.get("retry-after");

      await new Promise((r) => setTimeout(r, 1600));
      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.COOKIES_CLEAR_RATE_LIMIT_PER_MIN;

      const passed =
        defaultClearLimit === 30 &&
        c1.status === 200 &&
        c2.status === 200 &&
        c3.status === 429 &&
        c3Data.errorCode === "NETFLOW_RATE_LIMITED" &&
        Boolean(retryAfter);

      recordRow(
        "/api/cookies/clear rate limit (default 30/min, 429 NETFLOW_RATE_LIMITED on exceed)",
        "default=30, c1=200, c2=200, c3=429(NETFLOW_RATE_LIMITED, Retry-After)",
        `default=${defaultClearLimit}, c1=${c1.status}, c2=${c2.status}, c3=${c3.status}(${c3Data.errorCode}, Retry-After=${retryAfter})`,
        passed
      );
    }

    // 14. Request header cap (431) & zero stack-trace leak on malformed/unexpected errors
    {
      const hugeHeaderRes = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Oversized": "H".repeat(9500),
        },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      const hugeHeaderData = await hugeHeaderRes.json();

      const badJsonRes = await fetch(`${envServerBase}/api/browse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"url": "https://example.com/", broken_json',
      });
      const badJsonText = await badJsonRes.text();
      const hasStackTrace =
        badJsonText.includes("at ") ||
        badJsonText.includes("SyntaxError:") ||
        JSON.stringify(hugeHeaderData).includes("at ");

      const passed =
        hugeHeaderRes.status === 431 &&
        hugeHeaderData.errorCode === "NETFLOW_HEADERS_TOO_LARGE" &&
        badJsonRes.status === 400 &&
        !hasStackTrace;

      recordRow(
        "header size cap (431) and no stack-trace leak on errors",
        "hugeHeader=431(NETFLOW_HEADERS_TOO_LARGE), badJson=400, hasStackTrace=false",
        `hugeHeader=${hugeHeaderRes.status}(${hugeHeaderData.errorCode}), badJson=${badJsonRes.status}, hasStackTrace=${hasStackTrace}`,
        passed
      );
    }

    // 15. Log hygiene: no secrets or URLs-with-query in captured server output during browse of https://example.com/?token=abc123
    {
      const capturedLogs: string[] = [];
      const origLog = console.log;
      const origInfo = console.info;
      const origWarn = console.warn;
      const origError = console.error;

      const captureArgs = (...args: unknown[]) => {
        capturedLogs.push(
          args
            .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
            .join(" ")
        );
      };

      console.log = (...args: unknown[]) => {
        captureArgs(...args);
      };
      console.info = (...args: unknown[]) => {
        captureArgs(...args);
      };
      console.warn = (...args: unknown[]) => {
        captureArgs(...args);
      };
      console.error = (...args: unknown[]) => {
        captureArgs(...args);
      };

      let browseOk = false;
      try {
        const browseRes = await fetch(`${envServerBase}/api/browse`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Netflow-Client-Id": "f3333333-3333-4333-8333-333333333333",
            Authorization: "Bearer super_secret_bearer_999",
            Cookie: "session_token=super_secret_cookie_888",
          },
          body: JSON.stringify({
            url: "https://example.com/?token=abc123",
            mode: "smart-compress",
            postBody: "password=super_secret_post_body_777",
          }),
        });
        const browseData = await browseRes.json();
        browseOk = browseRes.status === 200 && browseData.success === true;

        // Also exercise AI summarize fallback with a URL containing ?token=abc123
        const sumRes = await fetch(`${envServerBase}/api/ai/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "",
            url: "https://example.com/?token=abc123",
            text: "This is a test article paragraph with enough characters to trigger the summary endpoint.",
            language: "en",
          }),
        });
        const sumText = await sumRes.text();
        capturedLogs.push(sumText);
      } finally {
        console.log = origLog;
        console.info = origInfo;
        console.warn = origWarn;
        console.error = origError;
      }

      const combinedOutput = capturedLogs.join("\n");
      const leakedQueryToken =
        combinedOutput.includes("token=abc123") || combinedOutput.includes("abc123");
      const leakedSecrets =
        combinedOutput.includes("super_secret_bearer_999") ||
        combinedOutput.includes("super_secret_cookie_888") ||
        combinedOutput.includes("super_secret_post_body_777");

      const passed = browseOk && !leakedQueryToken && !leakedSecrets;
      recordRow(
        "no secrets/URLs-with-query in captured server output during browse of https://example.com/?token=abc123",
        "browseOk=true, leakedQueryToken=false, leakedSecrets=false",
        `browseOk=${browseOk}, leakedQueryToken=${leakedQueryToken}, leakedSecrets=${leakedSecrets}`,
        passed
      );
    }
  } finally {
    srv.close();
  }

  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
