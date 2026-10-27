# NETFLOW Browser V2 — FORM 29
## Root Cause Analysis (RCA) of 4 Real-World Failures

**Form ID:** `NETFLOW-ROOT-CAUSE-29`  
**Priority:** P0 (Critical Bug Investigation)  
**Execution Mode:** STRICT READ-ONLY / AUDIT VERIFIED  
**Date:** October 2026

---

### Failure 1: YouTube Black Screen (ভিডিও প্লেয়ারে কালো স্ক্রিন)

* **ত্রুটির লক্ষণ (Symptom):**  
  YouTube Portal বা লিঙ্ক থেকে কোনো ভিডিও ওপেন করলে প্লেয়ার ফ্রেম লোড হলেও ভেতরে ভিডিও চালু হয় না এবং কালো স্ক্রিন হয়ে থাকে।

* **আসল কারণ (Root Cause):**  
  1. `src/components/WebRenderer.tsx` ফাইলের ৩১২৬–৩১৩০ লাইনে YouTube ভিডিও এমবেড করার জন্য `<iframe>` ব্যবহার করা হয়েছে:
     ```tsx
     <iframe
       src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=1&enablejsapi=1`}
       sandbox={iframeSandbox}
       allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
       ...
     />
     ```
  2. এই iframe-এর `sandbox` প্রপার্টি `iframeSandbox` স্টেট দ্বারা নির্ধারিত হয় (`WebRenderer.tsx:904-922`), যেখানে প্রক্সি পেজের নিরাপত্তার জন্য স্ক্রিপ্ট এনাবল থাকলে ইচ্ছাকৃতভাবেই `allow-same-origin` বাদ রাখা হয়েছে (`sandbox="allow-forms allow-downloads allow-modals allow-presentation allow-scripts allow-popups"` — omitting `allow-same-origin`)।
  3. কিন্তু YouTube-এর অফিসিয়াল HTML5 MSE/EME প্লেয়ার এবং DRM/Encrypted Media ডিক্রিপশন ইঞ্জিন নিজস্ব অরিজিন স্টোরেজ (IndexedDB, LocalStorage, postMessage ও SharedWorker) অ্যাক্সেস করতে না পারলে ইউনিক ওয়েক (`null`) অরিজিনে চলে যায়। ফলস্বরূপ, YouTube প্লেয়ারের স্ক্রিপ্ট এক্সিকিউট হতে পারে না এবং ভিডিও ফ্রেম ডিক্রিপ্ট না হয়ে কালো স্ক্রিন প্রদর্শন করে।

* **প্রভাবিত ফাইল ও লাইন (Affected File & Lines):**  
  * `src/components/WebRenderer.tsx` — লাইন **904–922** (Strict sandbox policy definition) এবং লাইন **3126–3135** (YouTube embed iframe rendering).

* **প্রস্তাবিত সমাধান (Fix Strategy):**  
  YouTube এমবেড ফ্রেমের ক্ষেত্রে জেনারেল প্রক্সি পেজের `iframeSandbox` ব্যবহার না করে ডেডিকেটেড স্যান্ডবক্স ডিরেক্টিভ ব্যবহার করতে হবে যাতে `allow-same-origin` উপস্থিত থাকে (অথবা YouTube-এর জন্য স্যান্ডবক্স প্রোপার্টি পুরোপুরি বাদ দিয়ে স্ট্যান্ডার্ড ক্রস-অরিজিন আইসোলেশন ও `referrerPolicy="strict-origin-when-cross-origin"` ব্যবহার করতে হবে)।

---

### Failure 2: YouTube Portal White Screen (পোর্টাল খোলার সময় সাদা স্ক্রিন)

* **ত্রুটির লক্ষণ (Symptom):**  
  YouTube Portal ট্যাবে প্রবেশ করলে অনেক সময় সম্পূর্ণ সাদা স্ক্রিন দেখা যায়, কোনো থাম্বনেইল বা সার্চ গ্রিড আসে না।

* **আসল কারণ (Root Cause):**  
  1. `src/components/YouTubeFallbackPortal.tsx` ফাইলের ৫৩–৫৭ লাইনে দেখা যায়:
     ```tsx
     const [results, setResults] = useState<YouTubeSearchResult[]>([]);
     const [isLoading, setIsLoading] = useState(false);
     const [searchError, setSearchError] = useState<string | null>(null);
     ```
     অ্যাপ্লিকেশনে প্রাথমিক মাউন্টে `isLoading` এর মান `false` থাকে এবং `results` এর মান খালি অ্যারে (`[]`) থাকে। ব্যাকএন্ডের `/api/youtube/search` এপিআই রেসপন্স আসার আগ পর্যন্ত বা সার্চ ফেইল করলে কোনো ডিফল্ট বা ক্যাশড ডেটা না থাকায় গ্রিড কন্টেইনার শূন্য থাকে।
  2. `src/components/WebRenderer.tsx` এর ৯৪৭–৯৫৪ এবং ৩১৪২–৩১৫০ লাইনে, যখন ট্যাব ইউআরএল `youtube.com` থাকে এবং ব্রাউজিং মোড `smart-compress` থাকে, তখন `isYtPortal` ট্রু হয় এবং সরাসরি `<YouTubeFallbackPortal />` রিটার্ন করে।
  3. কিন্তু প্যারেন্ট কন্টেইনার `<main id="netflow-viewport">` (লাইন ৩১৮৭) এর বাইরে এটি আর্লি রিটার্ন হওয়ায় CSS ফ্লেক্সবক্স হাইট কলাপ্স করে (`min-h-0` / `h-full` রিলেটিভ স্ট্রেচ ফেইল করে) এবং ট্রানজিশন স্টেটে `tab.contentHtml` ফাঁকা থাকলে রেন্ডারার সরাসরি সাদা ব্যাকগ্রাউন্ডের খালি পেজ (`bg-white`) দেখায়।

* **প্রভাবিত ফাইল ও লাইন (Affected File & Lines):**  
  * `src/components/YouTubeFallbackPortal.tsx` — লাইন **53–57**, **118–124**, **336–364**
  * `src/components/WebRenderer.tsx` — লাইন **3142–3150**, **3187–3190**

* **প্রস্তাবিত সমাধান (Fix Strategy):**  
  1. `YouTubeFallbackPortal.tsx`-এ প্রাথমিক লোডিং স্টেট ডিফল্ট হিসেবে `true` রাখা অথবা অফলাইন/স্ট্যাটিক রিকমেন্ডেড ভিডিও ক্যাশ ফলব্যাক হিসেবে রাখা।
  2. `WebRenderer.tsx`-এ আর্লি রিটার্ন না করে রেগুলার ভিউপোর্ট র্যাপারের ভেতরে রেসপন্সিভ হাইট (`h-full w-full flex-1 min-h-[100dvh]`) নিশ্চিত করে পোর্টাল রেন্ডার করা এবং লোডিং কঙ্কাল (Skeleton loader) প্রদান করা।

---

### Failure 3: Facebook HTTP 400 Bad Request

* **ত্রুটির লক্ষণ (Symptom):**  
  এড্রেসবারে `facebook.com` লিখে এন্টার দিলে প্রক্সি সার্ভার `HTTP 400 Bad Request` রেসপন্স প্রদান করে এবং ব্রাউজারে এরর রিকভারি সেন্টার পেজ প্রদর্শিত হয়।

* **আসল কারণ (Root Cause):**  
  1. `server.ts` ফাইলের ২৩৭৪–২৩৮৮ লাইনে আউটবাউন্ড প্রক্সি রিকোয়েস্টের জন্য হেডারের অবজেক্ট তৈরি করা হয়:
     ```ts
     const forwardHeaders: Record<string, string> = {
       'User-Agent': selectedUserAgent, // Modern Chrome 120+ UA
       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,...',
       'Accept-Language': clientAcceptLanguage || 'en-US,en;q=0.9',
       'Save-Data': 'on',
       ...
     };
     ```
  2. এতে কোনো **Sec-Fetch Fetch Metadata Headers** (`Sec-Fetch-Dest: document`, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Site: none`, `Sec-Fetch-User: ?1`) অথবা `Upgrade-Insecure-Requests: 1` পাঠানো হয় না।
  3. **বাস্তব প্রমাণ (Empirical Verification):**  
     মেটা/ফেসবুকের এজ প্রক্সি (Proxygen/Akamai WAF) মডার্ন ক্রোম ইউজার-এজেন্টযুক্ত কোনো ব্রাউজার রিকোয়েস্টে `Sec-Fetch-*` মেটাডাটা হেডার না থাকলে সেটিকে বট/স্পুফিং রিকোয়েস্ট হিসেবে শনাক্ত করে অবিলম্বে **`HTTP 400 Bad Request`** প্রদান করে।
  4. এই `400` স্ট্যাটাসটি `server.ts:2787` থেকে ক্লায়েন্টে পাঠানো হয়, যা `src/App.tsx:1570-1600` ক্যাচ করে ব্যবহারকারীকে HTTP 400 এরর পেজ দেখায়।

* **প্রভাবিত ফাইল ও লাইন (Affected File & Lines):**  
  * `server.ts` — লাইন **2374–2388** (Missing Chromium Fetch Metadata Headers in `prepareProxyHeaders`), লাইন **2719–2799** (Proxy upstream execution).
  * `src/App.tsx` — লাইন **1570–1600** (Handling 400 status error dispatch).

* **প্রস্তাবিত সমাধান (Fix Strategy):**  
  `server.ts` এর `forwardHeaders`-এ স্ট্যান্ডার্ড ক্রোমিয়াম নেভিগেশন হেডার যুক্ত করা:
  ```ts
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
  ```
  *(পরীক্ষায় প্রমাণিত হয়েছে যে এই ৫টি হেডার যোগ করার সাথে সাথেই ফেসবুক প্রক্সি থেকে `HTTP 200 OK` রেসপন্স দেয়।)*

---

### Failure 4: Session Restore White Screen (সেশন রিস্টোরে সাদা স্ক্রিন)

* **ত্রুটির লক্ষণ (Symptom):**  
  ব্রাউজার রিলোড দিলে আগের ট্যাবগুলো ইউআরএল সহ রিস্টোর হয় এবং "Session Restored" নোটিফিকেশন আসে, কিন্তু পেইজে কিছুই লোড হয় না এবং সাদা ক্যানভাস হয়ে থাকে।

* **আসল কারণ (Root Cause):**  
  1. **কন্টেন্ট সেভ না থাকা (Missing `contentHtml`):**  
     `src/services/sessionPersistence.ts` এর ৬০৮–৬২৬ লাইনে `snapshotToRuntimeTabs` ফাংশনে লোকাল স্টোরেজের মেমোরি কোটা (256 KB) রক্ষা করার জন্য শুধুমাত্র মেটাডাটা (`id`, `url`, `title`, `history`, `zoomLevel`) সেভ করা হয়। ট্যাবের `contentHtml` ফিল্ডটি ফিল্টার করে বাদ দেওয়া হয়।
  2. **স্টার্টআপে কোনো অটো-ফেচ না থাকা (No Auto-Fetch on Startup):**  
     `src/App.tsx` এর মাউন্ট ইফেক্টে (`useEffect` / সেশন রিস্টোরার) ট্যাব রিস্টোর হলেও সক্রিয় ট্যাবের জন্য কোনো `handleNavigate(activeTab.url, activeTab.id)` ট্রিগার করা হয় না। ফলে রিস্টোর হওয়া ট্যাবের স্টেট থাকে: `isLoading: false`, `error: undefined`, এবং `contentHtml: undefined`।
  3. **রেন্ডারারের স্টলড অবস্থা (Stalled White Canvas):**  
     `src/components/WebRenderer.tsx` এর ৩১৫২–৩১৭৭ লাইনে যখন `tab.contentHtml` খালি থাকে, তখন এটি কোনো প্রগ্রেস বার বা অটো-লোড ছাড়াই শুধুমাত্র একটি প্যাসিভ বাটন ("Load Page") সহ সাদা ব্যাকগ্রাউন্ডে দাঁড়িয়ে থাকে। বিশেষ করে YouTube বা ফ্রেম-ভিত্তিক পেজের ক্ষেত্রে `isYtPortal` ট্রু থাকায় ইউজার কোনো রেসপন্স পায় না এবং স্ক্রিন পুরোপুরি ফাঁকা ও সাদা দেখায়।

* **প্রভাবিত ফাইল ও লাইন (Affected File & Lines):**  
  * `src/services/sessionPersistence.ts` — লাইন **51–64**, **608–626**
  * `src/App.tsx` — লাইন **662–690** (Session loading state initialization), লাইন **850–863**, **6856–6876** (Missing active tab re-fetch trigger).
  * `src/components/WebRenderer.tsx` — লাইন **3152–3177** (Blank fallback without auto-hydration).

* **প্রস্তাবিত সমাধান (Fix Strategy):**  
  `src/App.tsx`-এ যখন সেশন রিস্টোর সফল হয়, তখন সক্রিয় ট্যাবের জন্য স্বয়ংক্রিয়ভাবে একটি লাইটওয়েট রি-ফেচ ট্রিগার করা (`handleNavigate(activeTab.url, activeTab.id, true)`) যাতে ট্যাব রিলোড হওয়ার সাথে সাথে তার কনটেন্ট হাইড্রেশন হয়ে যায় এবং ব্যবহারকারী কোনো ফাঁকা সাদা স্ক্রিন না দেখে।

---

### সারসংক্ষেপ (Summary Table)

| ত্রুটি | মূল ফাইল | মূল কারণ | ফিক্স স্ট্র্যাটেজি |
| :--- | :--- | :--- | :--- |
| **১. YouTube Black Screen** | `WebRenderer.tsx:3126` | `iframeSandbox`-এ `allow-same-origin` না থাকায় YouTube DRM/HTML5 প্লেয়ার অরিজিন ব্লকিংয়ে পড়ে। | YouTube এমবেডের জন্য ডেডিকেটেড পারমিশন ও আইসোলেটেড স্যান্ডবক্স প্রয়োগ। |
| **২. YouTube Portal White Screen** | `YouTubeFallbackPortal.tsx:53`, `WebRenderer.tsx:3142` | ইনিশিয়াল লোডিং স্টেট `false` থাকা এবং প্যারেন্ট ভিউপোর্টের উচ্চতা কলাপ্স করা। | ডিফল্ট লোডিং কঙ্কাল যোগ করা ও ভিউপোর্ট হাইট ফ্লেক্সবক্স ফিক্স করা। |
| **৩. Facebook 400 Bad Request** | `server.ts:2374` | প্রক্সি হেডারে ক্রোমিয়াম `Sec-Fetch-*` ও `Upgrade-Insecure-Requests` হেডার অনুপস্থিত থাকায় ফেসবুক বট হিসেবে ড্রপ করে। | `prepareProxyHeaders`-এ আধুনিক ক্রোমিয়াম ফেচ মেটাডাটা হেডার সংযোজন। |
| **৪. Session Restore White Screen** | `sessionPersistence.ts:608`, `App.tsx:850` | কোটার কারণে সেশনে HTML সেভ না হওয়া এবং স্টার্টআপে এক্টিভ ট্যাবের কোনো অটো-নেভিগেশন ট্রিগার না থাকা। | সেশন রিস্টোরের পর সক্রিয় ট্যাবের জন্য স্বয়ংক্রিয় রি-ফেচ চালু করা। |
