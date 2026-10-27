# NETFLOW Browser V2 — Backend Deployment Guide (ব্যাকএন্ড ডিপ্লয়মেন্ট গাইড)

**Execution Marker:** `NETFLOW-BACKEND-DEPLOY-READINESS-01`  
**Audience:** Beginners & Self-Hosters (নতুন ব্যবহারকারী এবং সেলফ-হোস্টারদের জন্য ধাপে ধাপে নির্দেশিকা)

---

## 1. Overview (সংক্ষিপ্ত পরিচিতি)

**English:**  
NETFLOW Browser V2 consists of:
1. **Frontend / Android Shell:** The React UI and native Android WebView engine.
2. **Backend Proxy & AI Server (`server.ts` -> `dist/server.cjs`):** Handles Smart-Compress/Reader/Text-Only proxy requests (`/api/browse`), scoped cookie clearing (`/api/cookies/clear`), and optional AI assistance (`/api/ai/*`).

You can deploy this backend on **any generic Linux container hosting platform or VPS** that supports Node.js 20+ and provides an HTTPS reverse proxy / TLS termination. No paid or proprietary cloud service is required.

**বাংলা:**  
NETFLOW Browser V2-এর দুটি প্রধান অংশ রয়েছে:
1. **ফ্রন্টএন্ড / অ্যান্ড্রয়েড শেল:** React ইউজার ইন্টারফেস এবং নেটিভ Android WebView ইঞ্জিন।
2. **ব্যাকএন্ড প্রক্সি ও AI সার্ভার (`server.ts` -> `dist/server.cjs`):** যা Smart-Compress/Reader/Text-Only মোডের প্রক্সি রিকোয়েস্ট (`/api/browse`), কুকি ক্লিয়ারিং (`/api/cookies/clear`), এবং ঐচ্ছিক AI ফিচার (`/api/ai/*`) পরিচালনা করে।

এই ব্যাকএন্ডটি **যেকোনো সাধারণ কন্টেইনার হোস্টিং প্ল্যাটফর্ম বা লিনাক্স সার্ভারে** (যেখানে Node.js 20+ এবং HTTPS সাপোর্ট আছে) সহজেই চালানো যায়। কোনো নির্দিষ্ট পেইড সার্ভিস ব্যবহার করা বাধ্যতামূলক নয়।

---

## 2. Step-by-Step Build & Run (বিল্ড এবং রান করার ধাপসমূহ)

### Step 1: Install Dependencies (ডিপেন্ডেন্সি ইনস্টল করুন)
```bash
npm install
```

### Step 2: Build Frontend & Backend Bundle (ফ্রন্টএন্ড এবং ব্যাকএন্ড বিল্ড করুন)
```bash
npm run build
```
- **English:** This runs `vite build` (outputs static frontend assets into `dist/`) and `esbuild server.ts` (bundles the backend into `dist/server.cjs`).
- **বাংলা:** এই কমান্ডটি ফ্রন্টএন্ড বিল্ড করে `dist/` ফোল্ডারে রাখে এবং ব্যাকএন্ড সার্ভারকে বান্ডেল করে `dist/server.cjs` ফাইল তৈরি করে।

### Step 3: Run the Production Server (প্রোডাকশন সার্ভার চালু করুন)
```bash
NODE_ENV=production node dist/server.cjs
```
*(Or `npm start`, which executes `node dist/server.cjs`.)*

- **English:** In production mode (`NODE_ENV=production`), `dist/server.cjs` serves the compiled static files from `dist/` and mounts all `/api/*` endpoints on `0.0.0.0:$PORT` (default port `3000`).
- **বাংলা:** প্রোডাকশন মোডে (`NODE_ENV=production`), `dist/server.cjs` স্বয়ংক্রিয়ভাবে `dist/` থেকে স্ট্যাটিক ফাইল এবং `/api/*` এন্ডপয়েন্টগুলো পোর্ট `3000`-এ (অথবা আপনার নির্ধারিত `PORT`-এ) চালু করে।

---

## 3. Why HTTPS is Required (HTTPS কেন বাধ্যতামূলক)

**English:**
1. **Android Cleartext Restriction:** Android blocks plain `http://` traffic by default (`usesCleartextTraffic="false"`). The Android app will refuse to talk to a non-HTTPS backend URL.
2. **CORS Allow-List Enforcement:** `server.ts` strictly ignores any `http://` entries in `ALLOWED_ORIGINS` (except local loopback during development).
3. **Credential & Token Protection:** Header tokens (`X-Netflow-Access-Token`), client IDs (`X-Netflow-Client-Id`), and browsed page contents are only encrypted in transit when TLS/HTTPS is active.

**বাংলা:**
1. **অ্যান্ড্রয়েড নিরাপত্তা নীতি:** অ্যান্ড্রয়েড অ্যাপ ডিফল্টভাবে সাধারণ `http://` সংযোগ ব্লক করে। তাই ব্যাকএন্ড অবশ্যই `https://` হতে হবে।
2. **CORS সুরক্ষা:** `ALLOWED_ORIGINS`-এ `https://` ছাড়া কোনো ডোমেইন গ্রহণ করা হয় না।
3. **ডেটা এনক্রিপশন:** ইউজারের ব্রাউজিং ডেটা এবং হেডার টোকেন (`X-Netflow-Access-Token`) সুরক্ষিত রাখতে HTTPS অপরিহার্য।

---

## 4. Environment Variables & Defaults (এনভায়রনমেন্ট ভেরিয়েবল এবং ডিফল্ট মান)

| Variable | Default | Required? | Description (English & বাংলা) |
| :--- | :--- | :--- | :--- |
| `PORT` | `3000` | No | **EN:** TCP port the Node HTTP server listens on (`0.0.0.0`).<br>**BN:** সার্ভার যে পোর্টে চলবে (ডিফল্ট `3000`)। |
| `GEMINI_API_KEY` | *(empty / unset)* | No (Optional) | **EN:** Google Gemini API key for `/api/ai/*` endpoints. If unset, AI routes remain functional using built-in deterministic offline/local fallbacks.<br>**BN:** AI ফিচারের জন্য Gemini API কী। এটি না দিলেও সার্ভার ক্র্যাশ করবে না; স্বয়ংক্রিয়ভাবে লোকাল ফলব্যাক মোডে কাজ করবে। |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | No (Optional) | **EN:** Gemini model identifier used when `GEMINI_API_KEY` is set (default `gemini-3-flash-preview`).<br>**BN:** `GEMINI_API_KEY` দেওয়া থাকলে যে Gemini মডেলটি ব্যবহৃত হবে (ডিফল্ট `gemini-3-flash-preview`)। |
| `ALLOWED_ORIGINS` | `""` *(empty)* | No | **EN:** Comma-separated list of exact `https://` origins allowed for cross-origin API calls (e.g. `https://browser.example.com`). Built-in local origins (`https://localhost`, `capacitor://localhost`, `http://localhost`) are always permitted for the Android WebView shell. Wildcards (`*`) and `http://` origins are ignored.<br>**BN:** কমা দিয়ে আলাদা করা অনুমোদিত `https://` অরিজিন তালিকা। অ্যান্ড্রয়েড অ্যাপের `https://localhost` ডিফল্টভাবেই অনুমোদিত থাকে। `*` বা `http://` গ্রহণ করা হয় না। |
| `NETFLOW_API_ACCESS_TOKEN` | `""` *(disabled)* | No | **EN:** Shared access token checked in constant time against the `X-Netflow-Access-Token` request header on `/api/browse` and `/api/ai/*`. When empty, the token gate is disabled.<br>**BN:** `/api/browse` ও `/api/ai/*` সুরক্ষিত করার জন্য অ্যাক্সেস টোকেন। খালি রাখলে এই গেট নিষ্ক্রিয় থাকে। |
| `TRUST_PROXY` | `off` (`false`) | Recommended on container hosts (`1`) | **EN:** Controls whether Express trusts reverse-proxy `X-Forwarded-For` headers. Default is `off` (`false`), which uses the direct socket address (`req.socket.remoteAddress`) and ignores `X-Forwarded-For` so clients cannot spoof their IP. Set to a hop count (e.g. `TRUST_PROXY=1`) when running behind 1 reverse proxy / load balancer.<br>**BN:** ডিফল্ট `off` থাকলে সার্ভার সরাসরি সকেট IP ব্যবহার করে এবং নকল `X-Forwarded-For` হেডার উপেক্ষা করে। কন্টেইনার হোস্টিং বা রিভার্স প্রক্সির পেছনে চালালে `TRUST_PROXY=1` সেট করুন। |
| `MAX_RESPONSE_BYTES` | `5242880` *(5 MB)* | No | **EN:** Maximum upstream response body size in bytes read by `/api/browse`. Responses exceeding this limit abort streaming and return `NETFLOW_RESPONSE_TOO_LARGE`.<br>**BN:** `/api/browse` দ্বারা লোড করা ওয়েবপেজের সর্বোচ্চ আকার (ডিফল্ট ৫ মেগাবাইট)। |
| `RATE_LIMIT_WINDOW_MS` | `60000` *(60s)* | No | **EN:** Sliding window duration in milliseconds for all rate limiters.<br>**BN:** রেট লিমিট হিসাব করার সময়কাল (ডিফল্ট ৬০,০০০ মিলিসেকেন্ড বা ১ মিনিট)। |
| `BROWSE_RATE_LIMIT_PER_MIN` | `60` | No | **EN:** Max `/api/browse` requests per client (`IP + clientId`) per window.<br>**BN:** প্রতি মিনিটে প্রতি ক্লায়েন্টের সর্বোচ্চ `/api/browse` রিকোয়েস্ট সংখ্যা (ডিফল্ট ৬০)। |
| `AI_RATE_LIMIT_PER_MIN` | `20` | No | **EN:** Max `/api/ai/*` requests per client (`IP + clientId`) per window.<br>**BN:** প্রতি মিনিটে প্রতি ক্লায়েন্টের সর্বোচ্চ `/api/ai/*` রিকোয়েস্ট সংখ্যা (ডিফল্ট ২০)। |
| `COOKIES_CLEAR_RATE_LIMIT_PER_MIN` | `30` | No | **EN:** Max `/api/cookies/clear` requests per client (`IP + clientId`) per window.<br>**BN:** প্রতি মিনিটে প্রতি ক্লায়েন্টের সর্বোচ্চ `/api/cookies/clear` রিকোয়েস্ট সংখ্যা (ডিফল্ট ৩০)। |

### Why `TRUST_PROXY` Matters (কেন `TRUST_PROXY` অত্যন্ত গুরুত্বপূর্ণ)
- **English:** Container hosting platforms (such as generic container runtimes, Cloud Run, Render, or Nginx/Caddy reverse proxies) terminate HTTPS at a load balancer and forward traffic to your container over an internal network.
  - **Without `TRUST_PROXY=1`:** Every request appears to come from the load balancer's single internal socket IP. All users without a distinct client ID would share one IP bucket and hit rate limits together.
  - **When running directly without a reverse proxy (Default `TRUST_PROXY=off`):** Leaving `TRUST_PROXY=off` ensures an attacker cannot send fake `X-Forwarded-For: 1.2.3.4` headers to bypass rate limiting.
- **বাংলা:** যেকোনো কন্টেইনার হোস্টিং প্ল্যাটফর্মে (যেমন Cloud Run, Render, বা Nginx রিভার্স প্রক্সি) সব ইউজারের রিকোয়েস্ট একটি লোড ব্যালেন্সারের মাধ্যমে কন্টেইনারে আসে।
  - **`TRUST_PROXY=1` না দিলে:** সার্ভার মনে করবে সব রিকোয়েস্ট একই লোড ব্যালেন্সার IP থেকে আসছে, ফলে সকল ব্যবহারকারী একই রেট-লিমিটে আটকে যাবে।
  - **সরাসরি সার্ভার চালালে (`TRUST_PROXY=off` ডিফল্ট):** কেউ ভুয়া `X-Forwarded-For` হেডার পাঠিয়ে রেট-লিমিট ফাঁকি দিতে পারবে না।

---

## 5. Configuring the Android Build (`VITE_API_BASE_URL` & `VITE_API_ACCESS_TOKEN`)

**English:**  
When building the Android APK to connect to your deployed HTTPS backend:

1. Set the build-time Vite environment variables before running `npm run build`:
   ```bash
   VITE_API_BASE_URL="https://your-backend.example.com" \
   VITE_API_ACCESS_TOKEN="your-random-access-token" \
   npm run build
   ```
2. Sync the compiled `dist/` bundle into the Android Capacitor project:
   ```bash
   npx cap sync android
   ```
3. Set the matching server token on your backend container:
   ```bash
   NETFLOW_API_ACCESS_TOKEN="your-random-access-token"
   ```

> **⚠️ IMPORTANT SECURITY NOTE (গুরুত্বপূর্ণ নিরাপত্তা সতর্কতা):**  
> **English:** Any `VITE_API_ACCESS_TOKEN` compiled into a frontend bundle or Android APK can be extracted by anyone who unpacks or inspects the APK. It serves **ONLY as a weak abuse/traffic gate** against casual automated scanners—**NOT as a true secret**. Real secrets (such as `GEMINI_API_KEY`) must NEVER be placed in `VITE_*` variables and must stay strictly on the backend server.  
> **বাংলা:** অ্যান্ড্রয়েড APK বা ফ্রন্টএন্ড বিল্ডের ভেতরে থাকা `VITE_API_ACCESS_TOKEN` যে কেউ APK ডিকম্পাইল করে দেখে ফেলতে পারে। তাই এটি শুধুমাত্র সাধারণ বট বা অযাচিত ট্রাফিক ঠেকানোর একটি **দুর্বল গেট (weak gate)** হিসেবে কাজ করে—এটি কখনোই সম্পূর্ণ গোপনীয় পাসওয়ার্ড নয়। আসল গোপন কী (যেমন `GEMINI_API_KEY`) কখনোই `VITE_*`-এ দেবেন না, সর্বদা ব্যাকএন্ড সার্ভারে রাখবেন।

---

## 6. Deployment Checklist (ডিপ্লয়মেন্ট চেকলিস্ট)

- [ ] **HTTPS Active:** Backend URL is served over valid `https://` TLS (**ব্যাকএন্ডে বৈধ `https://` সক্রিয় আছে**).
- [ ] **Production Build Verified:** `npm run build` succeeds and produces `dist/server.cjs` (**`npm run build` সফলভাবে `dist/server.cjs` তৈরি করেছে**).
- [ ] **Proxy Hop Configured:** `TRUST_PROXY=1` is set if hosted behind a single container load balancer / reverse proxy (**রিভার্স প্রক্সির পেছনে থাকলে `TRUST_PROXY=1` সেট করা হয়েছে**).
- [ ] **CORS Origins Configured:** `ALLOWED_ORIGINS` lists any additional `https://` web origins if accessed outside same-origin / Android shell (**প্রয়োজনে `ALLOWED_ORIGINS`-এ `https://` ডোমেইন যুক্ত করা হয়েছে**).
- [ ] **Secrets Server-Side Only:** `GEMINI_API_KEY` is set only in server environment variables, never in `VITE_*` (**`GEMINI_API_KEY` শুধুমাত্র সার্ভারে রাখা হয়েছে**).
- [ ] **Access Token Matched (Optional):** If `NETFLOW_API_ACCESS_TOKEN` is set on the server, the same value was passed as `VITE_API_ACCESS_TOKEN` during the Android build (**টোকেন ব্যবহার করলে সার্ভার ও অ্যাপ বিল্ডে একই টোকেন দেওয়া হয়েছে**).

---

## 7. What to Test After Deploy (`curl` Examples / ডিপ্লয় পরবর্তী পরীক্ষা)

Replace `https://your-backend.example.com` with your deployed HTTPS URL.

### 1. Health Check (হেলথ চেক — কোনো API কী তথ্য ফাঁস করে না)
```bash
curl -i https://your-backend.example.com/api/health
```
**Expected:** `HTTP/2 200` with `{"status":"ok","browser":"NETFLOW Human-First Smart Browser","version":"1.0.0","engine":"Network-Aware Adaptive Core"}`.

### 2. Android Shell CORS Preflight Allow (অ্যান্ড্রয়েড শেল CORS পরীক্ষা)
```bash
curl -i -X OPTIONS https://your-backend.example.com/api/browse \
  -H "Origin: https://localhost" \
  -H "Sec-Fetch-Site: cross-site"
```
**Expected:** `HTTP/2 204` with `Access-Control-Allow-Origin: https://localhost`.

### 3. Untrusted Origin CORS Block (অননুমোদিত অরিজিন ব্লক পরীক্ষা)
```bash
curl -i -X OPTIONS https://your-backend.example.com/api/browse \
  -H "Origin: https://evil.example.org"
```
**Expected:** `HTTP/2 403` with `{"success":false,"errorCode":"NETFLOW_CORS_BLOCKED",...}`.

### 4. Browse Proxy Test (`/api/browse` প্রক্সি পরীক্ষা)
```bash
curl -s -X POST https://your-backend.example.com/api/browse \
  -H "Content-Type: application/json" \
  -H "X-Netflow-Client-Id: 11111111-1111-4111-8111-111111111111" \
  -H "X-Netflow-Access-Token: YOUR_TOKEN_IF_ENABLED" \
  -d '{"url":"https://example.com/","mode":"smart-compress"}' | head -c 400
```
**Expected:** JSON containing `"success":true`, `"title":"Example Domain"`.

### 5. Cookie Clear Endpoint & Rate Limit (`/api/cookies/clear` পরীক্ষা)
```bash
curl -i -X POST https://your-backend.example.com/api/cookies/clear \
  -H "Content-Type: application/json" \
  -H "X-Netflow-Client-Id: 11111111-1111-4111-8111-111111111111" \
  -d '{}'
```
**Expected:** `HTTP/2 200` with `{"success":true,"clearedAll":true}` (and `HTTP/2 429` with `NETFLOW_RATE_LIMITED` if called more than 30 times per minute).

---

## 8. Architectural Limitations: Single-Instance Memory & DNS-Rebinding TOCTOU (স্থাপত্যগত সীমাবদ্ধতা)

### 8.1 Single-Instance In-Memory Rate Limiters & Cookie Jars (`F-24`)
- **English:** Rate-limit buckets (`browseRateLimiter`, `aiRateLimiter`, `cookiesClearRateLimiter`) and `clientTabCookieJars` (`${clientId}::${tabId}`) are stored in Node process memory (`Map`). If you run multiple container replicas behind a load balancer without sticky sessions, each replica maintains a separate counter and separate cookie jar. **Recommendation:** Deploy as a **single container instance (`max-instances=1`)** for personal/small-team deployments, or move rate-limit and cookie state to a shared Redis store before scaling horizontally.
- **বাংলা:** রেট-লিমিট কাউন্টার এবং ট্যাব কুকি জার (`${clientId}::${tabId}`) সরাসরি Node প্রসেসের মেমোরিতে (`Map`) সংরক্ষিত থাকে। একাধিক কন্টেইনার রেপ্লিকা চালালে প্রতিটি ইনস্ট্যান্সে আলাদা কাউন্টার ও কুকি জার তৈরি হবে। **পরামর্শ:** সাধারণ ব্যবহারের জন্য **সিঙ্গেল ইনস্ট্যান্স (`max-instances=1`)** হিসেবে ডিপ্লয় করুন, অথবা একাধিক রেপ্লিকা ব্যবহারের আগে Redis-এর মতো শেয়ার্ড স্টোর যুক্ত করুন।

### 8.2 DNS-Rebinding TOCTOU Window (`F-06`)
- **English:** Before fetching any upstream URL (and on each redirect hop), `resolveAndValidateDnsSafety` resolves all `A`/`AAAA` records via `dns.lookup(..., { all: true })` and blocks loopback, RFC1918, link-local, CGNAT, and cloud metadata IPs. However, Node's global `fetch()` performs its own socket-level DNS resolution milliseconds later (`Time-of-Check to Time-of-Use` / TOCTOU). **Recommendation:** On cloud/VPS hosts, configure host-level egress firewall rules (`iptables`/`nftables`/VPC egress) to block outbound container traffic to `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `fc00::/7`, and `fe80::/10`.
- **বাংলা:** `/api/browse` প্রতিটি রিকোয়েস্ট ও রিডাইরেক্ট হপের আগে `dns.lookup(..., { all: true })` দ্বারা প্রাইভেট ও মেটাডেটা IP ব্লক করে। তবে এরপর Node-এর `fetch()` সকেট সংযোগের সময় পুনরায় DNS দেখে, যার ফলে `TTL=0` DNS রিবাইন্ডিংয়ের একটি ক্ষুদ্র TOCTOU ঝুঁকি থেকে যায়। **পরামর্শ:** আপনার সার্ভার বা কন্টেইনার হোস্টের নেটওয়ার্ক ফায়ারওয়ালে প্রাইভেট ও মেটাডেটা IP রেঞ্জে (`169.254.0.0/16`, `10.0.0.0/8`, `127.0.0.0/8` ইত্যাদি) আউটবাউন্ড ট্রাফিক ব্লক করে রাখুন।

