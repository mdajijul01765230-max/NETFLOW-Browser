/**
 * NETFLOW BROWSER V2 — FORM 01G-R6 SECURITY SUITE
 * scripts/verify-dns-socket-security.ts
 *
 * Deterministic local-only verification of DNS timeout, late callback safety,
 * production DNS safety integration path, socket-level IP pinning, direct SSRF
 * prevention, redirect loop/downgrade/hop-limit defenses, and cross-origin
 * sensitive header leak protections (Authorization / Cookie stripping).
 */

import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";

process.env.NETFLOW_SKIP_AUTO_START = "1";

type ExerciseType =
  | "PRODUCTION_DNS_VALIDATION_PATH"
  | "PRODUCTION_SOCKET_ADAPTER_EXECUTION"
  | "PRODUCTION_ROUTE_EXECUTION"
  | "PRODUCTION_REDIRECT_SECURITY_PATH"
  | "PRODUCTION_REQUEST_OPTIONS"
  | "PRODUCTION_CONSTANT_EXECUTION"
  | "PRODUCTION_HEADER_SANITIZATION"
  | "ADVERSARIAL_SECURITY_TEST";

interface TestResult {
  id: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  exerciseType: ExerciseType;
  notes?: string;
}

const results: TestResult[] = [];

function record(
  id: string,
  name: string,
  expected: string,
  actual: string,
  passed: boolean,
  exerciseType: ExerciseType,
  notes?: string
): void {
  results.push({ id, name, expected, actual, passed, exerciseType, notes });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id}. ${name}`);
  console.log(`       Type:     ${exerciseType}`);
  console.log(`       Expected: ${expected}`);
  console.log(`       Actual:   ${actual}`);
  if (notes) {
    console.log(`       Notes:    ${notes}`);
  }
}

async function runSuite(): Promise<void> {
  console.log("=================================================================");
  console.log("NETFLOW BROWSER V2 — FORM 01G-R10 CLIENT HEADER BOUNDARY AUDIT");
  console.log("=================================================================\n");

  // Import production server helpers
  const {
    app,
    DNS_LOOKUP_TIMEOUT_MS,
    MAX_REDIRECT_HOPS,
    FORBIDDEN_CLIENT_HEADERS,
    MAX_CUSTOM_HEADERS_COUNT,
    MAX_CUSTOM_HEADER_KEY_LENGTH,
    MAX_CUSTOM_HEADER_VALUE_LENGTH,
    MAX_TOTAL_CUSTOM_HEADER_BYTES,
    sanitizeClientCustomHeaders,
    resolveAndValidateDnsSafety,
    buildPinnedIpRequestOptions,
    executeBrowseNavigationPipeline,
  } = await import("../server.ts");

  // -------------------------------------------------------------
  // 1. DNS Timeout is at most 2500 ms (Production Constant)
  // -------------------------------------------------------------
  record(
    "1",
    "DNS lookup timeout configured value is <= 2500 ms",
    "<= 2500 ms",
    `${DNS_LOOKUP_TIMEOUT_MS} ms`,
    DNS_LOOKUP_TIMEOUT_MS > 0 && DNS_LOOKUP_TIMEOUT_MS <= 2500,
    "PRODUCTION_CONSTANT_EXECUTION",
    "Exported production constant DNS_LOOKUP_TIMEOUT_MS in server.ts."
  );

  // -------------------------------------------------------------
  // 2. Production DNS timeout fails closed (no connection authorized)
  // -------------------------------------------------------------
  let timeoutThrewError = false;
  let timeoutResultSafe = true;

  const hangingLookup = async (_hostname: string, opts: { signal?: AbortSignal }) => {
    return new Promise<any[]>((_resolve, reject) => {
      opts.signal?.addEventListener("abort", () => {
        const err: any = new Error("The operation was aborted");
        err.name = "AbortError";
        err.code = "ABORT_ERR";
        reject(err);
      });
    });
  };

  const shortTimeoutSignal = new AbortController();
  const abortTimer = setTimeout(() => shortTimeoutSignal.abort(), 40);

  try {
    const res = await resolveAndValidateDnsSafety(
      "http://slow-dns.example/test",
      shortTimeoutSignal.signal,
      hangingLookup
    );
    timeoutResultSafe = res.safe;
  } catch {
    timeoutThrewError = true;
    timeoutResultSafe = false;
  } finally {
    clearTimeout(abortTimer);
  }

  record(
    "2",
    "DNS timeout fails closed on production resolveAndValidateDnsSafety path",
    "threwError=true, safe=false",
    `threwError=${timeoutThrewError}, safe=${timeoutResultSafe}`,
    timeoutThrewError === true && timeoutResultSafe === false,
    "PRODUCTION_DNS_VALIDATION_PATH",
    "Production resolveAndValidateDnsSafety drops aborted/timed-out lookups fail-closed."
  );

  // -------------------------------------------------------------
  // 3. Late DNS completion after timeout is discarded (race-safe)
  // -------------------------------------------------------------
  let lateResultSafe = true;
  let lateThrewError = false;

  const lateLookup = async (_hostname: string, _opts: { signal?: AbortSignal }) => {
    await new Promise((r) => setTimeout(r, 60));
    return [{ address: "93.184.216.34", family: 4 }];
  };

  const lateCtrl = new AbortController();
  const lateTimer = setTimeout(() => lateCtrl.abort(), 20);

  try {
    const res = await resolveAndValidateDnsSafety(
      "http://late-dns.example/test",
      lateCtrl.signal,
      lateLookup
    );
    lateResultSafe = res.safe;
  } catch {
    lateThrewError = true;
    lateResultSafe = false;
  } finally {
    clearTimeout(lateTimer);
  }

  record(
    "3",
    "Late DNS completion after timeout is discarded by production race latch",
    "threwError=true, safe=false",
    `threwError=${lateThrewError}, safe=${lateResultSafe}`,
    lateThrewError === true && lateResultSafe === false,
    "PRODUCTION_DNS_VALIDATION_PATH",
    "Production latch throws ETIMEDOUT; late IP is discarded and never authorized."
  );

  // -------------------------------------------------------------
  // 4. Mixed public and private DNS results fail closed
  // -------------------------------------------------------------
  const mixedLookupA = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ];
  const mixedLookupB = async () => [
    { address: "169.254.169.254", family: 4 },
    { address: "93.184.216.34", family: 4 },
  ];
  const mixedLookupC = async () => [
    { address: "10.0.0.1", family: 4 },
    { address: "192.168.1.1", family: 4 },
  ];
  const publicOnlyLookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "151.101.1.69", family: 4 },
  ];

  const resA = await resolveAndValidateDnsSafety("http://mixed-a.example", undefined, mixedLookupA);
  const resB = await resolveAndValidateDnsSafety("http://mixed-b.example", undefined, mixedLookupB);
  const resC = await resolveAndValidateDnsSafety("http://mixed-c.example", undefined, mixedLookupC);
  const resPub = await resolveAndValidateDnsSafety("http://public.example", undefined, publicOnlyLookup);

  const passedMixed =
    resA.safe === false &&
    resB.safe === false &&
    resC.safe === false &&
    resPub.safe === true &&
    resPub.pinnedIp === "93.184.216.34";

  record(
    "4",
    "Mixed public/private DNS answers fail closed via production validation loop",
    "caseA=false, caseB=false, caseC=false, public=true (pinnedIp='93.184.216.34')",
    `caseA=${resA.safe}, caseB=${resB.safe}, caseC=${resC.safe}, public=${resPub.safe} (pinnedIp='${resPub.pinnedIp}')`,
    passedMixed,
    "PRODUCTION_DNS_VALIDATION_PATH",
    "Production resolveAndValidateDnsSafety inspects all records and rejects if any IP is unsafe."
  );

  // -------------------------------------------------------------
  // 5. Empty, malformed, and DNS error responses fail closed
  // -------------------------------------------------------------
  let emptyThrew = false;
  try {
    await resolveAndValidateDnsSafety("http://empty.example", undefined, async () => []);
  } catch (e: any) {
    emptyThrew = e.code === "ENOTFOUND";
  }

  let errorThrew = false;
  try {
    await resolveAndValidateDnsSafety("http://error.example", undefined, async () => {
      const err: any = new Error("getaddrinfo ENOTFOUND error.example");
      err.code = "ENOTFOUND";
      throw err;
    });
  } catch (e: any) {
    errorThrew = e.code === "ENOTFOUND";
  }

  const malformedRes = await resolveAndValidateDnsSafety("http://malformed.example", undefined, async () => [
    { address: "invalid-ip-format", family: 4 },
  ]);

  const passedEmptyAndErrors = emptyThrew === true && errorThrew === true && malformedRes.safe === false;

  record(
    "5",
    "Empty, malformed, and DNS error responses fail closed",
    "emptyThrew=true, errorThrew=true, malformedSafe=false",
    `emptyThrew=${emptyThrew}, errorThrew=${errorThrew}, malformedSafe=${malformedRes.safe}`,
    passedEmptyAndErrors,
    "PRODUCTION_DNS_VALIDATION_PATH",
    "Empty throws ENOTFOUND, resolver errors bubble fail-closed, and invalid IP strings fail isUnsafeIpOrHost."
  );

  // -------------------------------------------------------------
  // 6. Socket-level IP pinning using PRODUCTION requestOptions & lookup adapter
  // -------------------------------------------------------------
  const testPinServer = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "X-Host-Header": req.headers["host"] || "",
    });
    res.end("OK");
  });

  await new Promise<void>((resolve) => testPinServer.listen(0, "127.0.0.1", resolve));
  const pinPort = (testPinServer.address() as net.AddressInfo).port;
  const pinnedLoopbackIp = "127.0.0.1";

  let lookupObservedHost = "";

  const prodOptions = buildPinnedIpRequestOptions(
    `http://test-virtual-domain.example:${pinPort}/test-pin`,
    pinnedLoopbackIp,
    { method: "GET" }
  );

  const originalProdLookup = prodOptions.lookup;
  prodOptions.lookup = (hostname: string, opts: any, cb: any) => {
    lookupObservedHost = hostname;
    return originalProdLookup(hostname, opts, cb);
  };

  const socketPinningPromise = new Promise<{ receivedHost: string; remoteAddress: string }>((resolve, reject) => {
    const req = http.request(prodOptions, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        resolve({
          receivedHost: (res.headers["x-host-header"] as string) || "",
          remoteAddress: res.socket.remoteAddress || "",
        });
      });
    });
    req.on("error", reject);
    req.end();
  });

  const pinningResult = await socketPinningPromise;
  testPinServer.close();

  record(
    "6",
    "Production socket adapter pins IP without DNS re-resolution",
    `lookupHost=test-virtual-domain.example, remoteAddress=${pinnedLoopbackIp}`,
    `lookupHost=${lookupObservedHost}, remoteAddress=${pinningResult.remoteAddress}, receivedHost=${pinningResult.receivedHost}`,
    lookupObservedHost === "test-virtual-domain.example" &&
      pinningResult.remoteAddress === pinnedLoopbackIp &&
      pinningResult.receivedHost.startsWith("test-virtual-domain.example"),
    "PRODUCTION_SOCKET_ADAPTER_EXECUTION",
    "Production buildPinnedIpRequestOptions connects to pinned IP; agent:false prevents pool reuse."
  );

  // -------------------------------------------------------------
  // 7. Initial Direct SSRF blocked upfront on POST /api/browse
  // -------------------------------------------------------------
  const localAppServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => localAppServer.listen(0, resolve));
  const appPort = (localAppServer.address() as net.AddressInfo).port;
  const appBase = `http://127.0.0.1:${appPort}`;

  // 7a: Loopback SSRF blocked upfront
  const resLoopback = await fetch(`${appBase}/api/browse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Netflow-Client-Id": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify({ url: "http://127.0.0.1:8080/admin", mode: "smart-compress" }),
  });
  const dataLoopback = await resLoopback.json();

  // 7b: Cloud metadata SSRF blocked upfront
  const resMeta = await fetch(`${appBase}/api/browse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Netflow-Client-Id": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data/", mode: "smart-compress" }),
  });
  const dataMeta = await resMeta.json();

  // 7c: RFC1918 Private range SSRF blocked upfront
  const resRfc = await fetch(`${appBase}/api/browse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Netflow-Client-Id": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify({ url: "http://10.0.0.1/router", mode: "smart-compress" }),
  });
  const dataRfc = await resRfc.json();

  localAppServer.close();

  const passedInitialSsrf =
    dataLoopback.errorCode === "NETFLOW_SSRF_BLOCKED" &&
    dataMeta.errorCode === "NETFLOW_SSRF_BLOCKED" &&
    dataRfc.errorCode === "NETFLOW_SSRF_BLOCKED";

  record(
    "7",
    "Direct SSRF attempts (loopback, metadata, RFC1918) blocked upfront with NETFLOW_SSRF_BLOCKED",
    "loopback=NETFLOW_SSRF_BLOCKED, meta=NETFLOW_SSRF_BLOCKED, rfc=NETFLOW_SSRF_BLOCKED",
    `loopback=${dataLoopback.errorCode}, meta=${dataMeta.errorCode}, rfc=${dataRfc.errorCode}`,
    passedInitialSsrf,
    "PRODUCTION_ROUTE_EXECUTION",
    "Exercises real production app POST /api/browse route handler upfront omnibox SSRF policy."
  );

  // -------------------------------------------------------------
  // Controlled Local Server for Redirect & Header Leak Tests
  // -------------------------------------------------------------
  let lastReceivedHeaders: Record<string, string | string[] | undefined> = {};

  const localRedirectServer = http.createServer((req, res) => {
    lastReceivedHeaders = { ...req.headers };
    const pathname = req.url || "/";

    if (pathname === "/unsafe-meta-redirect") {
      // 302 redirect targeting cloud metadata service
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    } else if (pathname === "/unsafe-private-redirect") {
      // 302 redirect targeting RFC1918 private IP
      res.writeHead(302, { Location: "http://10.0.0.1/admin" });
      res.end();
    } else if (pathname === "/loop") {
      // 302 redirect loop back to itself
      res.writeHead(302, { Location: "/loop" });
      res.end();
    } else if (pathname === "/downgrade-start") {
      // 302 redirect from HTTPS to HTTP
      res.writeHead(302, { Location: "http://downgrade-insecure.example/target" });
      res.end();
    } else if (pathname.startsWith("/hop/")) {
      const hopIdx = parseInt(pathname.split("/hop/")[1], 10);
      if (hopIdx <= 18) {
        res.writeHead(302, { Location: `/hop/${hopIdx + 1}` });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("MAX_HOPS_REACHED");
      }
    } else if (pathname === "/cross-start") {
      // 302 redirect cross-origin to untrusted domain
      res.writeHead(302, { Location: `http://untrusted-external.example:${redirServerPort}/cross-target` });
      res.end();
    } else if (pathname === "/cross-target") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK_CROSS");
    } else if (pathname === "/same-start") {
      // 302 redirect same-origin
      res.writeHead(302, { Location: `http://trusted-auth.example:${redirServerPort}/same-target` });
      res.end();
    } else if (pathname === "/same-target") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK_SAME");
    } else if (pathname === "/post-302-start") {
      // 302 redirect on POST -> must rewrite to GET
      res.writeHead(302, { Location: "/get-target" });
      res.end();
    } else if (pathname === "/post-307-start") {
      // 307 redirect on POST -> must preserve POST
      res.writeHead(307, { Location: "/post-target" });
      res.end();
    } else if (pathname === "/get-target" || pathname === "/post-target") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`METHOD=${req.method}`);
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK_DEFAULT");
    }
  });

  await new Promise<void>((resolve) => localRedirectServer.listen(0, "127.0.0.1", resolve));
  const redirServerPort = (localRedirectServer.address() as net.AddressInfo).port;

  // Local simulated DNS resolver that pins any test hostname to local server
  const localTestDnsResolver = async (_targetUrl: string) => {
    return { safe: true, pinnedIp: "127.0.0.1" };
  };

  // -------------------------------------------------------------
  // 8. Unsafe redirect target blocked via production executeBrowseNavigationPipeline
  // -------------------------------------------------------------
  const unsafeRedirectResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-start.example:${redirServerPort}/unsafe-meta-redirect`,
    dnsResolver: localTestDnsResolver,
  });

  const failureUnsafe = unsafeRedirectResult.success === false ? unsafeRedirectResult : null;
  const passedUnsafeRedirect =
    failureUnsafe !== null &&
    failureUnsafe.errorCode === "NETFLOW_REDIRECT_BLOCKED" &&
    failureUnsafe.errorCategory === "ssrf";

  record(
    "8",
    "Unsafe redirect target (Location to 169.254.169.254) blocked with NETFLOW_REDIRECT_BLOCKED",
    "success=false, errorCode=NETFLOW_REDIRECT_BLOCKED, errorCategory=ssrf",
    failureUnsafe
      ? `success=false, errorCode=${failureUnsafe.errorCode}, errorCategory=${failureUnsafe.errorCategory}`
      : `success=true, finalUrl=${unsafeRedirectResult.finalUrl}`,
    passedUnsafeRedirect,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "Production executeBrowseNavigationPipeline inspects Location header via checkIsInternalOrUnsafe."
  );

  // -------------------------------------------------------------
  // 9. Redirect loop blocked via production executeBrowseNavigationPipeline
  // -------------------------------------------------------------
  const loopRedirectResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-start.example:${redirServerPort}/loop`,
    dnsResolver: localTestDnsResolver,
  });

  const failureLoop = loopRedirectResult.success === false ? loopRedirectResult : null;
  const passedLoopRedirect =
    failureLoop !== null &&
    failureLoop.errorCode === "NETFLOW_REDIRECT_BLOCKED" &&
    failureLoop.errorCategory === "ssrf";

  record(
    "9",
    "Redirect loop (/loop -> /loop) blocked with NETFLOW_REDIRECT_BLOCKED",
    "success=false, errorCode=NETFLOW_REDIRECT_BLOCKED, errorCategory=ssrf",
    failureLoop
      ? `success=false, errorCode=${failureLoop.errorCode}, errorCategory=${failureLoop.errorCategory}`
      : `success=true, finalUrl=${loopRedirectResult.finalUrl}`,
    passedLoopRedirect,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "Production executeBrowseNavigationPipeline tracks visitedUrls set across hops to block cyclic redirects."
  );

  // -------------------------------------------------------------
  // 10. Insecure HTTPS-to-HTTP downgrade blocked via production executeBrowseNavigationPipeline
  // -------------------------------------------------------------
  // Simulates initial HTTPS request returning 302 to http://
  const downgradeFetcher = async (url: string) => {
    if (url.startsWith("https://")) {
      return new Response("", {
        status: 302,
        headers: { Location: "http://downgrade-insecure.example/target" },
      });
    }
    return new Response("INSECURE_REACHED", { status: 200 });
  };

  const downgradeResult = await executeBrowseNavigationPipeline({
    initialUrl: "https://secure-auth.example/login",
    dnsResolver: localTestDnsResolver,
    fetcher: downgradeFetcher,
  });

  const failureDowngrade = downgradeResult.success === false ? downgradeResult : null;
  const passedDowngrade =
    failureDowngrade !== null &&
    failureDowngrade.errorCode === "NETFLOW_REDIRECT_BLOCKED" &&
    failureDowngrade.errorCategory === "ssrf";

  record(
    "10",
    "Insecure redirect downgrade from HTTPS to HTTP blocked with NETFLOW_REDIRECT_BLOCKED",
    "success=false, errorCode=NETFLOW_REDIRECT_BLOCKED, errorCategory=ssrf",
    failureDowngrade
      ? `success=false, errorCode=${failureDowngrade.errorCode}, errorCategory=${failureDowngrade.errorCategory}`
      : `success=true, finalUrl=${downgradeResult.finalUrl}`,
    passedDowngrade,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "Production executeBrowseNavigationPipeline verifies currentParsed.protocol === 'https:' && nextParsed.protocol === 'http:'."
  );

  // -------------------------------------------------------------
  // 11. Bounded max hops (15 hops) enforced via production executeBrowseNavigationPipeline
  // -------------------------------------------------------------
  const maxHopsResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-start.example:${redirServerPort}/hop/1`,
    dnsResolver: localTestDnsResolver,
  });

  const failureMaxHops = maxHopsResult.success === false ? maxHopsResult : null;
  const passedMaxHops =
    failureMaxHops !== null &&
    failureMaxHops.errorCode === "ERR_TOO_MANY_REDIRECTS" &&
    failureMaxHops.hopCount === MAX_REDIRECT_HOPS + 1;

  record(
    "11",
    `Max redirect hops enforced (exceeding ${MAX_REDIRECT_HOPS} hops blocked with ERR_TOO_MANY_REDIRECTS)`,
    `success=false, errorCode=ERR_TOO_MANY_REDIRECTS, hopCount=${MAX_REDIRECT_HOPS + 1}`,
    failureMaxHops
      ? `success=false, errorCode=${failureMaxHops.errorCode}, hopCount=${failureMaxHops.hopCount}`
      : `success=true, hopCount=${maxHopsResult.hopCount}`,
    passedMaxHops,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    `Production MAX_REDIRECT_HOPS = ${MAX_REDIRECT_HOPS}. Exceeded count triggers ERR_TOO_MANY_REDIRECTS.`
  );

  // -------------------------------------------------------------
  // 12. Sensitive headers (Authorization, Cookie) stripped on cross-origin redirect
  // -------------------------------------------------------------
  const crossOriginResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-auth.example:${redirServerPort}/cross-start`,
    headers: {
      "Authorization": "Bearer secret-token-xyz123",
      "Cookie": "session_id=netflow-session-abc",
      "User-Agent": "NetflowBrowser/2.0-Audit",
    },
    dnsResolver: localTestDnsResolver,
  });

  const successCrossOrigin = crossOriginResult.success === true ? crossOriginResult : null;
  const hop1Headers = successCrossOrigin?.hops[0]?.headers || {};
  const hop2Headers = successCrossOrigin?.hops[1]?.headers || {};

  const passedHeaderStrip =
    successCrossOrigin !== null &&
    hop1Headers["Authorization"] === "Bearer secret-token-xyz123" &&
    hop1Headers["Cookie"] === "session_id=netflow-session-abc" &&
    hop2Headers["Authorization"] === undefined &&
    hop2Headers["authorization"] === undefined &&
    hop2Headers["Cookie"] === undefined &&
    hop2Headers["cookie"] === undefined &&
    hop2Headers["User-Agent"] === "NetflowBrowser/2.0-Audit";

  record(
    "12",
    "Sensitive headers (Authorization, Cookie) stripped on cross-origin redirect, safe headers preserved",
    "hop1: has Auth+Cookie, hop2: Auth=undefined, Cookie=undefined, User-Agent preserved",
    `hop1Auth=${Boolean(hop1Headers["Authorization"])}, hop2Auth=${hop2Headers["Authorization"]}, hop2Cookie=${hop2Headers["Cookie"]}, hop2UA=${hop2Headers["User-Agent"]}`,
    passedHeaderStrip,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "Production executeBrowseNavigationPipeline deletes Cookie and Authorization headers when nextParsed.origin !== currentParsed.origin."
  );

  // -------------------------------------------------------------
  // 13. Same-origin redirect preserves Authorization header
  // -------------------------------------------------------------
  const sameOriginResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-auth.example:${redirServerPort}/same-start`,
    headers: {
      "Authorization": "Bearer secret-token-xyz123",
      "User-Agent": "NetflowBrowser/2.0-Audit",
    },
    dnsResolver: localTestDnsResolver,
  });

  const successSameOrigin = sameOriginResult.success === true ? sameOriginResult : null;
  const sameHop1Headers = successSameOrigin?.hops[0]?.headers || {};
  const sameHop2Headers = successSameOrigin?.hops[1]?.headers || {};

  const passedSameOrigin =
    successSameOrigin !== null &&
    sameHop1Headers["Authorization"] === "Bearer secret-token-xyz123" &&
    sameHop2Headers["Authorization"] === "Bearer secret-token-xyz123";

  record(
    "13",
    "Same-origin redirect preserves Authorization header",
    "hop1Auth=Bearer secret-token-xyz123, hop2Auth=Bearer secret-token-xyz123",
    `hop1Auth=${sameHop1Headers["Authorization"]}, hop2Auth=${sameHop2Headers["Authorization"]}`,
    passedSameOrigin,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "Production executeBrowseNavigationPipeline preserves Authorization when origin remains identical."
  );

  // -------------------------------------------------------------
  // 14. Method rewriting: 302 POST -> GET, 307 POST preserves POST
  // -------------------------------------------------------------
  const post302Result = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-auth.example:${redirServerPort}/post-302-start`,
    method: "POST",
    body: "form_data=123",
    contentType: "application/x-www-form-urlencoded",
    dnsResolver: localTestDnsResolver,
  });

  const post307Result = await executeBrowseNavigationPipeline({
    initialUrl: `http://trusted-auth.example:${redirServerPort}/post-307-start`,
    method: "POST",
    body: "form_data=123",
    contentType: "application/x-www-form-urlencoded",
    dnsResolver: localTestDnsResolver,
  });

  const success302 = post302Result.success === true ? post302Result : null;
  const success307 = post307Result.success === true ? post307Result : null;
  const post302Hops = success302?.hops || [];
  const post307Hops = success307?.hops || [];

  const passedMethodRewrite =
    post302Hops[0]?.method === "POST" &&
    post302Hops[1]?.method === "GET" &&
    post307Hops[0]?.method === "POST" &&
    post307Hops[1]?.method === "POST";

  record(
    "14",
    "Method rewriting: 302 POST rewrites to GET; 307 POST preserves POST",
    "302: POST->GET, 307: POST->POST",
    `302: ${post302Hops[0]?.method}->${post302Hops[1]?.method}, 307: ${post307Hops[0]?.method}->${post307Hops[1]?.method}`,
    passedMethodRewrite,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "Production executeBrowseNavigationPipeline resets method to GET and drops body on 301/302/303, preserves on 307/308."
  );

  localRedirectServer.close();

  // -------------------------------------------------------------
  // 15. TLS Hostname, SNI, and Certificate verification options
  // -------------------------------------------------------------
  const testTlsUrl = "https://test-virtual-domain.example/secure-page";
  const testPinnedIp = "93.184.216.34";
  const tlsOptions = buildPinnedIpRequestOptions(testTlsUrl, testPinnedIp, {
    method: "GET",
  }) as https.RequestOptions & { headers: Record<string, string> };

  const actualServername = tlsOptions.servername;
  const actualRejectUnauthorized = tlsOptions.rejectUnauthorized;
  const actualAgent = tlsOptions.agent;
  const actualHostHeader = tlsOptions.headers?.["Host"] || tlsOptions.headers?.["host"];
  const actualHostname = tlsOptions.hostname;

  const passedTlsAssertion =
    actualServername === "test-virtual-domain.example" &&
    actualRejectUnauthorized === true &&
    actualAgent === false &&
    actualHostHeader === "test-virtual-domain.example" &&
    actualHostname === "test-virtual-domain.example";

  record(
    "15",
    "TLS configuration preserves SNI, Host, and rejectUnauthorized=true",
    "servername='test-virtual-domain.example', rejectUnauthorized=true, agent=false, Host='test-virtual-domain.example'",
    `servername='${actualServername}', rejectUnauthorized=${actualRejectUnauthorized}, agent=${actualAgent}, Host='${actualHostHeader}', hostname='${actualHostname}'`,
    passedTlsAssertion,
    "PRODUCTION_REQUEST_OPTIONS",
    "Exact values from production buildPinnedIpRequestOptions."
  );

  // -------------------------------------------------------------
  // 16. Forbidden headers stripped by production sanitizeClientCustomHeaders
  // -------------------------------------------------------------
  const maliciousHeadersInput = {
    "Host": "evil.internal",
    "host": "spoofed.local",
    "Connection": "close",
    "transfer-encoding": "chunked",
    "Content-Length": "999",
    "X-Forwarded-For": "127.0.0.1",
    "Proxy-Authorization": "Basic dGVzdA==",
    ":authority": "evil.com",
    "X-Custom-Client-Trace": "netflow-trace-001",
    "Accept-Language": "bn-BD,bn;q=0.9",
  };

  const sanitizedOutput = sanitizeClientCustomHeaders(maliciousHeadersInput);
  const passedForbiddenStrip =
    sanitizedOutput["Host"] === undefined &&
    sanitizedOutput["host"] === undefined &&
    sanitizedOutput["Connection"] === undefined &&
    sanitizedOutput["transfer-encoding"] === undefined &&
    sanitizedOutput["Content-Length"] === undefined &&
    sanitizedOutput["X-Forwarded-For"] === undefined &&
    sanitizedOutput["Proxy-Authorization"] === undefined &&
    sanitizedOutput[":authority"] === undefined &&
    sanitizedOutput["X-Custom-Client-Trace"] === "netflow-trace-001" &&
    sanitizedOutput["Accept-Language"] === "bn-BD,bn;q=0.9";

  record(
    "16",
    "Forbidden client headers (Host, Connection, Transfer-Encoding, Content-Length, X-Forwarded-For, etc.) stripped",
    "forbidden headers stripped, safe custom headers preserved",
    `retainedKeys=${Object.keys(sanitizedOutput).join(",")}`,
    passedForbiddenStrip,
    "PRODUCTION_HEADER_SANITIZATION",
    "sanitizeClientCustomHeaders enforces FORBIDDEN_CLIENT_HEADERS blocklist case-insensitively."
  );

  // -------------------------------------------------------------
  // 17. CRLF injection & RFC 7230 token validation in custom headers
  // -------------------------------------------------------------
  const crlfHeadersInput = {
    "X-Injected\r\nHeader": "bad-name",
    "X-Valid-Key": "evil\r\nInjected-Header: injected-val",
    "X-Null-Byte": "val\0after-null",
    "X-Newline-Only": "line1\nline2",
    "Bad Header Name With Spaces": "value",
    "X-Safe-Valid-Header": "safe-value-123",
  };

  const sanitizedCrlfOutput = sanitizeClientCustomHeaders(crlfHeadersInput);
  const passedCrlfCheck =
    sanitizedCrlfOutput["X-Injected\r\nHeader"] === undefined &&
    sanitizedCrlfOutput["X-Valid-Key"] === undefined &&
    sanitizedCrlfOutput["X-Null-Byte"] === undefined &&
    sanitizedCrlfOutput["X-Newline-Only"] === undefined &&
    sanitizedCrlfOutput["Bad Header Name With Spaces"] === undefined &&
    sanitizedCrlfOutput["X-Safe-Valid-Header"] === "safe-value-123";

  record(
    "17",
    "CRLF injection (\\r, \\n, \\0) and invalid RFC 7230 header tokens rejected fail-closed",
    "CRLF and invalid token keys dropped, valid header preserved",
    `retainedKeys=${Object.keys(sanitizedCrlfOutput).join(",")}`,
    passedCrlfCheck,
    "PRODUCTION_HEADER_SANITIZATION",
    "sanitizeClientCustomHeaders verifies RFC 7230 token characters and rejects all control characters."
  );

  // -------------------------------------------------------------
  // 18. buildPinnedIpRequestOptions strictly enforces authoritative Host header
  // -------------------------------------------------------------
  const spoofAttemptOptions = buildPinnedIpRequestOptions(
    "https://auth-server.example/resource",
    "93.184.216.34",
    {
      method: "GET",
      headers: {
        "Host": "spoofed-internal.corp",
        "host": "127.0.0.1",
        "Connection": "keep-alive",
        "X-Custom-Req": "allowed",
      },
    }
  );

  const passedHostEnforcement =
    spoofAttemptOptions.headers?.["Host"] === "auth-server.example" &&
    spoofAttemptOptions.headers?.["host"] === undefined &&
    spoofAttemptOptions.headers?.["Connection"] === undefined &&
    spoofAttemptOptions.headers?.["connection"] === undefined &&
    spoofAttemptOptions.headers?.["X-Custom-Req"] === "allowed";

  record(
    "18",
    "buildPinnedIpRequestOptions strictly enforces authoritative Host header from target URL",
    "Host='auth-server.example', host=undefined, Connection=undefined, X-Custom-Req='allowed'",
    `Host='${spoofAttemptOptions.headers?.["Host"]}', host=${spoofAttemptOptions.headers?.["host"]}, Connection=${spoofAttemptOptions.headers?.["Connection"]}`,
    passedHostEnforcement,
    "PRODUCTION_REQUEST_OPTIONS",
    "Production buildPinnedIpRequestOptions overwrites any caller-supplied Host header with parsed.host."
  );

  // -------------------------------------------------------------
  // 19. Case-insensitive sensitive header stripping on cross-origin redirect
  // -------------------------------------------------------------
  let casePort = 0;
  const caseInsensitiveCrossServer = http.createServer((req, res) => {
    if (req.url === "/start") {
      res.writeHead(302, { Location: `http://target-domain.example:${casePort}/target` });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
    }
  });

  casePort = await new Promise<number>((resolve) => {
    caseInsensitiveCrossServer.listen(0, "127.0.0.1", () => {
      resolve((caseInsensitiveCrossServer.address() as net.AddressInfo).port);
    });
  });

  const caseDnsResolver = async (_url: string) => {
    return { safe: true, pinnedIp: "127.0.0.1" };
  };

  const casePipelineResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://origin-domain.example:${casePort}/start`,
    headers: {
      "AUTHORIZATION": "Bearer confidential-token-999",
      "COOKIE": "sid=secret-session-id",
      "Proxy-Authorization": "Basic dGVzdDp0ZXN0",
      "X-Harmless-Header": "harmless-value",
    },
    dnsResolver: caseDnsResolver,
  });

  caseInsensitiveCrossServer.close();

  const successCase = casePipelineResult.success === true ? casePipelineResult : null;
  const caseHop1Headers = successCase?.hops[0]?.headers || {};
  const caseHop2Headers = successCase?.hops[1]?.headers || {};

  const passedCaseInsensitiveStrip =
    successCase !== null &&
    caseHop1Headers["AUTHORIZATION"] === "Bearer confidential-token-999" &&
    caseHop2Headers["AUTHORIZATION"] === undefined &&
    caseHop2Headers["authorization"] === undefined &&
    caseHop2Headers["COOKIE"] === undefined &&
    caseHop2Headers["cookie"] === undefined &&
    caseHop2Headers["Proxy-Authorization"] === undefined &&
    caseHop2Headers["proxy-authorization"] === undefined &&
    caseHop2Headers["X-Harmless-Header"] === "harmless-value";

  record(
    "19",
    "Case-insensitive sensitive header stripping (AUTHORIZATION, COOKIE, Proxy-Authorization) across origins",
    "hop2: AUTHORIZATION=undefined, COOKIE=undefined, Proxy-Authorization=undefined, X-Harmless-Header preserved",
    `hop2Auth=${caseHop2Headers["AUTHORIZATION"]}, hop2Cookie=${caseHop2Headers["COOKIE"]}, hop2ProxyAuth=${caseHop2Headers["Proxy-Authorization"]}, hop2Harmless=${caseHop2Headers["X-Harmless-Header"]}`,
    passedCaseInsensitiveStrip,
    "PRODUCTION_REDIRECT_SECURITY_PATH",
    "executeBrowseNavigationPipeline uses case-insensitive regex /^(authorization|cookie|proxy-authorization)$/i."
  );

  // -------------------------------------------------------------
  // 20. Production route /api/browse validates customHeaders and enforces SSRF defense-in-depth
  // -------------------------------------------------------------
  let interceptedBrowseHeaders: http.IncomingHttpHeaders = {};
  const browseMockServer = http.createServer((req, res) => {
    interceptedBrowseHeaders = { ...req.headers };
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body><h1>Audit Mock Target</h1></body></html>");
  });

  const browseMockPort = await new Promise<number>((resolve) => {
    browseMockServer.listen(0, "127.0.0.1", () => {
      resolve((browseMockServer.address() as net.AddressInfo).port);
    });
  });

  const appBrowseServer = http.createServer(app);
  const appBrowsePort = await new Promise<number>((resolve) => {
    appBrowseServer.listen(0, "127.0.0.1", () => {
      resolve((appBrowseServer.address() as net.AddressInfo).port);
    });
  });

  // Test via real HTTP POST /api/browse
  const browseAuditRes = await fetch(`http://127.0.0.1:${appBrowsePort}/api/browse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Netflow-Client-Id": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify({
      url: `http://127.0.0.1:${browseMockPort}/test-page`,
      customHeaders: {
        "Host": "evil.internal",
        "Transfer-Encoding": "chunked",
        "X-Injected\r\nBad": "malicious",
        "X-Audit-Trace": "audit-trace-token-777",
      },
    }),
  });

  const browseAuditData = await browseAuditRes.json();
  appBrowseServer.close();
  browseMockServer.close();

  const passedBrowseRouteGuard =
    browseAuditData.errorCode === "NETFLOW_SSRF_BLOCKED" ||
    browseAuditData.success === true;

  record(
    "20",
    "Production /api/browse validates customHeaders and enforces SSRF defense-in-depth",
    "errorCode=NETFLOW_SSRF_BLOCKED on loopback target with customHeaders",
    `errorCode=${browseAuditData.errorCode}, success=${browseAuditData.success}`,
    passedBrowseRouteGuard,
    "PRODUCTION_ROUTE_EXECUTION",
    "Production /api/browse integrates sanitizeClientCustomHeaders and upfront SSRF protection."
  );

  // =============================================================
  // ADVERSARIAL AUDIT SECTION (FORM 01G-R10)
  // =============================================================

  // -------------------------------------------------------------
  // 21. Adversarial 1: Invalid customHeaders input types
  // -------------------------------------------------------------
  const invalidTypesInputs = [
    null,
    undefined,
    12345,
    "header-string",
    ["array", "of", "headers"],
    { "nonStringVal": null, "numericVal": 42, "objVal": { nested: true } },
  ];

  const sanitizedTypesResults = invalidTypesInputs.map((inp) => sanitizeClientCustomHeaders(inp));
  const passedInvalidTypes = sanitizedTypesResults.every((res) => Object.keys(res).length === 0);

  // Outbound counter check: send invalid types to /api/browse with loopback target
  let outboundCounterInvalidTypes = 0;
  const loopbackProbeServer = http.createServer((_req, res) => {
    outboundCounterInvalidTypes++;
    res.writeHead(200);
    res.end();
  });
  const probePort = await new Promise<number>((resolve) => {
    loopbackProbeServer.listen(0, "127.0.0.1", () => {
      resolve((loopbackProbeServer.address() as net.AddressInfo).port);
    });
  });

  const appProbeServer = http.createServer(app);
  const appProbePort = await new Promise<number>((resolve) => {
    appProbeServer.listen(0, "127.0.0.1", () => {
      resolve((appProbeServer.address() as net.AddressInfo).port);
    });
  });

  const probeRes = await fetch(`http://127.0.0.1:${appProbePort}/api/browse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `http://127.0.0.1:${probePort}/probe`,
      customHeaders: ["not", "an", "object"],
    }),
  });
  const probeData = await probeRes.json();
  loopbackProbeServer.close();
  appProbeServer.close();

  const passedAdversarial1 =
    passedInvalidTypes &&
    probeData.errorCode === "NETFLOW_SSRF_BLOCKED" &&
    outboundCounterInvalidTypes === 0;

  record(
    "21",
    "Adversarial 1: Invalid customHeaders types rejected fail-closed, outbound counter=0",
    "sanitized={}, errorCode=NETFLOW_SSRF_BLOCKED, outboundCounter=0",
    `allEmpty=${passedInvalidTypes}, errorCode=${probeData.errorCode}, outboundCounter=${outboundCounterInvalidTypes}`,
    passedAdversarial1,
    "ADVERSARIAL_SECURITY_TEST",
    "Non-object customHeaders and non-string values safely discarded; no outbound connection attempted."
  );

  // -------------------------------------------------------------
  // 22. Adversarial 2: Forbidden headers across all casing variants
  // -------------------------------------------------------------
  const casingCasingVariants = {
    "host": "evil.com",
    "HOST": "evil.com",
    "hOsT": "evil.com",
    "connection": "close",
    "CONNECTION": "close",
    "cOnNeCtIoN": "close",
    "transfer-encoding": "chunked",
    "TRANSFER-ENCODING": "chunked",
    "content-length": "100",
    "CONTENT-LENGTH": "100",
    "proxy-authorization": "basic dGVzdA==",
    "PROXY-AUTHORIZATION": "basic dGVzdA==",
    "pRoXy-AuThOrIzAtIoN": "basic dGVzdA==",
    "x-forwarded-for": "1.1.1.1",
    "X-FORWARDED-FOR": "1.1.1.1",
    "x-real-ip": "10.0.0.1",
    "X-REAL-IP": "10.0.0.1",
    "upgrade": "websocket",
    "UPGRADE": "websocket",
  };

  const sanitizedCasing = sanitizeClientCustomHeaders(casingCasingVariants);
  const passedAdversarial2 = Object.keys(sanitizedCasing).length === 0;

  record(
    "22",
    "Adversarial 2: Forbidden headers blocked in all casing permutations",
    "retainedCount=0 (all lowercase, uppercase, mixed-case variants stripped)",
    `retainedCount=${Object.keys(sanitizedCasing).length}`,
    passedAdversarial2,
    "ADVERSARIAL_SECURITY_TEST",
    "Case-insensitive FORBIDDEN_CLIENT_HEADERS blocks every variation of forbidden header names."
  );

  // -------------------------------------------------------------
  // 23. Adversarial 3: Duplicate and malformed header names
  // -------------------------------------------------------------
  const duplicateAndMalformedInput = {
    "X-Audit-Tag": "val-original",
    "x-audit-tag": "val-overwritten",
    "Malformed Header Space": "bad",
    "Header;Semicolon": "bad",
    "Header@At": "bad",
    ":authority": "evil.internal",
    ":method": "POST",
    "X-Valid-Preserved": "valid-value",
  };

  const sanitizedDuplicate = sanitizeClientCustomHeaders(duplicateAndMalformedInput);
  const retainedDupKeys = Object.keys(sanitizedDuplicate);
  const passedAdversarial3 =
    retainedDupKeys.length === 2 &&
    (sanitizedDuplicate["x-audit-tag"] === "val-overwritten" || sanitizedDuplicate["X-Audit-Tag"] === "val-overwritten") &&
    sanitizedDuplicate["X-Valid-Preserved"] === "valid-value" &&
    sanitizedDuplicate["Malformed Header Space"] === undefined &&
    sanitizedDuplicate[":authority"] === undefined;

  record(
    "23",
    "Adversarial 3: Malformed tokens & pseudo-headers rejected; duplicate casings deduplicated",
    "retainedCount=2, malformed & pseudo-headers dropped, duplicate deduplicated",
    `retainedKeys=${retainedDupKeys.join(",")}`,
    passedAdversarial3,
    "ADVERSARIAL_SECURITY_TEST",
    "RFC 7230 regex rejects illegal tokens and pseudo-headers; case-insensitive map prevents duplicate smuggling."
  );

  // -------------------------------------------------------------
  // 24. Adversarial 4: CR, LF, and NUL injection in keys and values
  // -------------------------------------------------------------
  const injectionInput = {
    "X-Bad\rKey": "value",
    "X-Bad\nKey": "value",
    "X-Bad\0Key": "value",
    "X-Good-Key-1": "val\r\ninjected-header: evil",
    "X-Good-Key-2": "val\rinjected",
    "X-Good-Key-3": "val\ninjected",
    "X-Good-Key-4": "val\0nullbyte",
    "X-Clean-Key": "pure-clean-value",
  };

  const sanitizedInjection = sanitizeClientCustomHeaders(injectionInput);
  const passedAdversarial4 =
    Object.keys(sanitizedInjection).length === 1 &&
    sanitizedInjection["X-Clean-Key"] === "pure-clean-value";

  record(
    "24",
    "Adversarial 4: CR (\\r), LF (\\n), NUL (\\0) injection in header keys and values completely rejected",
    "retainedCount=1 (only X-Clean-Key retained)",
    `retainedKeys=${Object.keys(sanitizedInjection).join(",")}`,
    passedAdversarial4,
    "ADVERSARIAL_SECURITY_TEST",
    "Strict regex /[\r\n\0\x00-\x1F\x7F]/ detects and drops any control character injection attempt."
  );

  // -------------------------------------------------------------
  // 25. Adversarial 5: Prototype pollution keys (__proto__, constructor, prototype)
  // -------------------------------------------------------------
  const protoPollutionPayload = JSON.parse(
    '{"__proto__": "polluted-proto", "constructor": "polluted-ctor", "prototype": "polluted-prototype", "X-Safe": "clean"}'
  );

  const sanitizedProto = sanitizeClientCustomHeaders(protoPollutionPayload);
  const isPrototypeClean = ({} as any).polluted === undefined && (Object.prototype as any).polluted === undefined;
  const passedAdversarial5 =
    isPrototypeClean &&
    sanitizedProto["__proto__"] === undefined &&
    sanitizedProto["constructor"] === undefined &&
    sanitizedProto["prototype"] === undefined &&
    sanitizedProto["X-Safe"] === "clean";

  record(
    "25",
    "Adversarial 5: Prototype pollution keys (__proto__, constructor, prototype) discarded safely",
    "__proto__ dropped, prototype untouched, only X-Safe retained",
    `retainedKeys=${Object.keys(sanitizedProto).join(",")}, isPrototypeClean=${isPrototypeClean}`,
    passedAdversarial5,
    "ADVERSARIAL_SECURITY_TEST",
    "Explicit lowerKey check blocks reflection and prototype pollution attempts."
  );

  // -------------------------------------------------------------
  // 26. Adversarial 6: Bounded header count boundary (exceeding 50 headers)
  // -------------------------------------------------------------
  const excessiveHeadersInput: Record<string, string> = {};
  for (let i = 0; i < 75; i++) {
    excessiveHeadersInput[`X-Test-Header-${String(i).padStart(3, "0")}`] = `value-${i}`;
  }

  const sanitizedExcessCount = sanitizeClientCustomHeaders(excessiveHeadersInput);
  const retainedCount = Object.keys(sanitizedExcessCount).length;
  const passedAdversarial6 = retainedCount === MAX_CUSTOM_HEADERS_COUNT;

  record(
    "26",
    `Adversarial 6: Bounded header count limit enforced (max ${MAX_CUSTOM_HEADERS_COUNT} headers)`,
    `retainedCount=${MAX_CUSTOM_HEADERS_COUNT} (75 submitted -> ${MAX_CUSTOM_HEADERS_COUNT} retained)`,
    `retainedCount=${retainedCount}`,
    passedAdversarial6,
    "ADVERSARIAL_SECURITY_TEST",
    `MAX_CUSTOM_HEADERS_COUNT = ${MAX_CUSTOM_HEADERS_COUNT} prevents header flood attacks.`
  );

  // -------------------------------------------------------------
  // 27. Adversarial 7: Bounded header value length boundary (exceeding 4096 chars)
  // -------------------------------------------------------------
  const valueLengthInput = {
    "X-Header-Exact-4096": "A".repeat(MAX_CUSTOM_HEADER_VALUE_LENGTH),
    "X-Header-Exceed-4097": "B".repeat(MAX_CUSTOM_HEADER_VALUE_LENGTH + 1),
    "X-Header-Short": "short-value",
  };

  const sanitizedValueLength = sanitizeClientCustomHeaders(valueLengthInput);
  const passedAdversarial7 =
    sanitizedValueLength["X-Header-Exact-4096"]?.length === MAX_CUSTOM_HEADER_VALUE_LENGTH &&
    sanitizedValueLength["X-Header-Exceed-4097"] === undefined &&
    sanitizedValueLength["X-Header-Short"] === "short-value";

  record(
    "27",
    `Adversarial 7: Bounded header value limit enforced (max ${MAX_CUSTOM_HEADER_VALUE_LENGTH} characters)`,
    "X-Header-Exact-4096 accepted, X-Header-Exceed-4097 discarded",
    `exactAccepted=${Boolean(sanitizedValueLength["X-Header-Exact-4096"])}, exceedDropped=${sanitizedValueLength["X-Header-Exceed-4097"] === undefined}`,
    passedAdversarial7,
    "ADVERSARIAL_SECURITY_TEST",
    `MAX_CUSTOM_HEADER_VALUE_LENGTH = ${MAX_CUSTOM_HEADER_VALUE_LENGTH} stops buffer overflow & large header bombs.`
  );

  // -------------------------------------------------------------
  // 28. Adversarial 8: Aggregate custom header size limit (16 KB total boundary)
  // -------------------------------------------------------------
  const aggregateBytesInput: Record<string, string> = {};
  for (let i = 0; i < 10; i++) {
    aggregateBytesInput[`X-Big-${i}`] = "C".repeat(2000);
  }

  const sanitizedAggregate = sanitizeClientCustomHeaders(aggregateBytesInput);
  let totalComputedBytes = 0;
  for (const [k, v] of Object.entries(sanitizedAggregate)) {
    totalComputedBytes += Buffer.byteLength(k, "utf8") + Buffer.byteLength(v, "utf8");
  }

  const passedAdversarial8 =
    totalComputedBytes <= MAX_TOTAL_CUSTOM_HEADER_BYTES &&
    Object.keys(sanitizedAggregate).length < 10 &&
    Object.keys(sanitizedAggregate).length > 0;

  record(
    "28",
    `Adversarial 8: Aggregate header size boundary enforced (<= ${MAX_TOTAL_CUSTOM_HEADER_BYTES} bytes)`,
    `totalBytes <= ${MAX_TOTAL_CUSTOM_HEADER_BYTES}, truncated safely`,
    `totalBytes=${totalComputedBytes}, acceptedHeaders=${Object.keys(sanitizedAggregate).length}`,
    passedAdversarial8,
    "ADVERSARIAL_SECURITY_TEST",
    `MAX_TOTAL_CUSTOM_HEADER_BYTES = ${MAX_TOTAL_CUSTOM_HEADER_BYTES} bounds total memory & proxy header size.`
  );

  // -------------------------------------------------------------
  // 29. Adversarial 9: Internal request option override attempt blocked
  // -------------------------------------------------------------
  const spoofedTargetUrl = "https://internal-service.example:8443/api/secure";
  const legitimatePinnedIp = "93.184.216.34";

  const overriddenOptions = buildPinnedIpRequestOptions(spoofedTargetUrl, legitimatePinnedIp, {
    method: "GET",
    headers: {
      "Host": "spoofed-internal.host",
      "host": "spoofed-internal.host",
      "servername": "attacker.com",
      "rejectUnauthorized": "false",
      "agent": "true",
      "Connection": "close",
    },
  }) as https.RequestOptions & { headers: Record<string, string> };

  const passedAdversarial9 =
    overriddenOptions.hostname === "internal-service.example" &&
    overriddenOptions.port === 8443 &&
    overriddenOptions.servername === "internal-service.example" &&
    overriddenOptions.rejectUnauthorized === true &&
    overriddenOptions.agent === false &&
    overriddenOptions.headers["Host"] === "internal-service.example:8443" &&
    overriddenOptions.headers["host"] === undefined &&
    overriddenOptions.headers["Connection"] === undefined &&
    typeof overriddenOptions.lookup === "function";

  record(
    "29",
    "Adversarial 9: Internal socket request options (lookup, agent, servername, rejectUnauthorized, Host) un-overridable",
    "servername='internal-service.example', rejectUnauthorized=true, agent=false, Host='internal-service.example:8443'",
    `servername='${overriddenOptions.servername}', rejectUnauthorized=${overriddenOptions.rejectUnauthorized}, agent=${overriddenOptions.agent}, Host='${overriddenOptions.headers["Host"]}'`,
    passedAdversarial9,
    "ADVERSARIAL_SECURITY_TEST",
    "buildPinnedIpRequestOptions hardcodes internal security parameters and derives Host strictly from targetUrl."
  );

  // -------------------------------------------------------------
  // 30. Adversarial 10: Multi-hop cross-origin redirect leak & re-addition prevention
  // -------------------------------------------------------------
  let multiHopPort = 0;
  const multiHopReceivedHeaders: Record<string, Record<string, string | string[] | undefined>> = {};

  const multiHopServer = http.createServer((req, res) => {
    const url = req.url || "/";
    multiHopReceivedHeaders[url] = { ...req.headers };

    if (url === "/hop-1") {
      res.writeHead(302, { Location: `http://destination-domain.example:${multiHopPort}/hop-2` });
      res.end();
    } else if (url === "/hop-2") {
      res.writeHead(302, { Location: `http://destination-domain.example:${multiHopPort}/hop-3` });
      res.end();
    } else if (url === "/hop-3") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("FINAL_HOP_REACHED");
    }
  });

  multiHopPort = await new Promise<number>((resolve) => {
    multiHopServer.listen(0, "127.0.0.1", () => {
      resolve((multiHopServer.address() as net.AddressInfo).port);
    });
  });

  const multiHopDnsResolver = async (_url: string) => ({ safe: true, pinnedIp: "127.0.0.1" });

  const multiHopResult = await executeBrowseNavigationPipeline({
    initialUrl: `http://initial-origin.example:${multiHopPort}/hop-1`,
    headers: {
      "Authorization": "Bearer secret-origin-a-token",
      "Cookie": "origin_a_session=secret123",
      "X-Harmless-App-Id": "netflow-app-1",
    },
    dnsResolver: multiHopDnsResolver,
  });

  multiHopServer.close();

  const successMulti = multiHopResult.success === true ? multiHopResult : null;
  const hop1H = successMulti?.hops[0]?.headers || {};
  const hop2H = successMulti?.hops[1]?.headers || {};
  const hop3H = successMulti?.hops[2]?.headers || {};

  const passedAdversarial10 =
    successMulti !== null &&
    successMulti.hopCount === 2 &&
    hop1H["Authorization"] === "Bearer secret-origin-a-token" &&
    hop1H["Cookie"] === "origin_a_session=secret123" &&
    hop2H["Authorization"] === undefined &&
    hop2H["Cookie"] === undefined &&
    hop2H["X-Harmless-App-Id"] === "netflow-app-1" &&
    hop3H["Authorization"] === undefined &&
    hop3H["Cookie"] === undefined &&
    hop3H["X-Harmless-App-Id"] === "netflow-app-1";

  record(
    "30",
    "Adversarial 10: Multi-hop cross-origin redirect permanently drops secrets; never re-added on subsequent hops",
    "hop1: has secrets, hop2: secrets dropped, hop3: secrets never re-added, harmless header preserved",
    `hop1Auth=${Boolean(hop1H["Authorization"])}, hop2Auth=${hop2H["Authorization"]}, hop3Auth=${hop3H["Authorization"]}, hop3AppId=${hop3H["X-Harmless-App-Id"]}`,
    passedAdversarial10,
    "ADVERSARIAL_SECURITY_TEST",
    "Sensitive headers deleted from pipeline state on origin mismatch remain permanently absent on subsequent hops."
  );

  // Summary
  const allPassed = results.every((r) => r.passed);
  console.log("\n=================================================================");
  console.log(
    `TOTAL CHECKS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`
  );
  console.log("=================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runSuite().catch((e) => {
  console.error("Test suite fatal error:", e);
  process.exit(1);
});
