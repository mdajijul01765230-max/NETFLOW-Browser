# NETFLOW Browser V2 — Android CI Build Guide (`docs/ANDROID_BUILD.md`)

**Execution Marker:** `NETFLOW-DOCS-TRUTH-SYNC-01` (Form 6 of 7 — Part D)  
**Last Updated:** `2026-10-10`

---

## বাংলা নির্দেশিকা (Bengali Guide)

### ১. প্রজেক্টটি GitHub-এ Push করার নিয়ম
১. আপনার GitHub অ্যাকাউন্টে একটি নতুন repository তৈরি করুন।
২. লোকাল বা এক্সপোর্ট করা প্রজেক্ট ফোল্ডারে নিচের কমান্ডগুলো চালান:
   ```bash
   git init
   git branch -M main
   git add .
   git commit -m "chore: add NETFLOW Browser V2 source and Android CI workflow"
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
   git push -u origin main
   ```

### ২. GitHub Actions Workflow চালানোর নিয়ম
- **স্বয়ংক্রিয়ভাবে (On Push):** `main` ব্রাঞ্চে push করলেই **Android Debug Build & Verification** workflow (`.github/workflows/android-build.yml`) নিজে থেকে চালু হবে।
- **ম্যানুয়ালি (Manual Dispatch):**
  ১. GitHub repository-এর **Actions** ট্যাবে যান।
  ২. বাম পাশের তালিকা থেকে **Android Debug Build & Verification** সিলেক্ট করুন।
  ৩. ডান পাশে **Run workflow** বাটনে ক্লিক করে `main` ব্রাঞ্চ থেকে workflow-টি চালান।

### ৩. `build.log`, Lint Report এবং Debug APK ডাউনলোড করার নিয়ম
১. **Actions** ট্যাবে গিয়ে চলমান বা সম্পন্ন হওয়া workflow run-এ ক্লিক করুন।
২. পেজের নিচে **Artifacts** সেকশনে পাবেন:
   - **`netflow-android-build-logs`** — সবসময় তৈরি হবে (বিল্ড সফল বা ব্যর্থ যাই হোক)। এর ভেতরে `android/build.log` এবং `android/compile-errors.txt` থাকবে।
   - **`netflow-android-debug-apk`** — বিল্ড সফল হলে এর ভেতরে `app-debug.apk` ফাইলটি থাকবে।
   - **`netflow-android-lint-report`** — `lintDebug`-এর লগ ও HTML/XML রিপোর্ট থাকবে।

### ৪. বিল্ড ব্যর্থ (Fail) হলে কী পাঠাতে হবে (Form 5 — `NETFLOW-CI-COMPILE-FIX-01`)
যদি `assembleDebug` ধাপটি ব্যর্থ হয়:
১. Workflow run পেজের **Summary** ট্যাবে থাকা **"First 30 Lines Containing `error:`"** অংশটি কপি করুন, অথবা
২. `netflow-android-build-logs` artifact ডাউনলোড করে `build.log` (বা `compile-errors.txt`) থেকে সমস্ত **`error:`** যুক্ত লাইন এবং `FAILURE: Build failed with an exception` অংশটি কপি করে Form 5-এর `=== BUILD LOG LINES ===` ব্লকে পেস্ট করুন।
৩. আর যদি বিল্ড সম্পূর্ণ সফল হয়, তবে `"CI PASSED"` লিখে জানান।

### ৫. পুশ করার আগে লোকাল স্ট্যাটিক চেক এবং Gradle ডিপেন্ডেন্সি নোট
১. GitHub-এ push করার আগে নিচের কমান্ডগুলো চালিয়ে নিশ্চিত করুন যে TypeScript এবং ১৪টি স্ট্যাটিক Java চেক পাস করেছে (প্রমাণ স্তর: `scripts/verify-java-static.ts` স্ট্যাটিক টেক্সট চেক করে—`14/14 checks passed, 0 failed`; এটি কোনো `javac` কম্পাইলার নয়, তাই Android compile এখানে `NOT VERIFIED`):
   ```bash
   npm run lint
   npm run build
   npx tsx scripts/verify-java-static.ts
   npx tsx scripts/verify-interactive-contract.ts
   npx tsx scripts/verify-form-n2.ts
   npx tsx scripts/verify-native-downloads.ts
   npx tsx scripts/verify-chrome-like-ux.ts
   npx tsx scripts/verify-backend-hardening.ts
   ```
২. **AndroidX WebKit Dependency (`Form 4`):** প্রাইভেট ট্যাবের `WebViewFeature.MULTI_PROFILE` এবং `ProfileStore` আইসোলেশনের জন্য `android/app/build.gradle`-এ `implementation "androidx.webkit:webkit:$androidxWebkitVersion"` (`android/variables.gradle`-এ `androidxWebkitVersion = '1.14.0'`) যুক্ত করা হয়েছে (**`VERIFIED`** in `android/app/build.gradle`; Gradle রেজোলিউশন ও কম্পাইল CI-তে যাচাই হবে—**`NOT VERIFIED`** locally)।
৩. Android APK-তে Low-Bandwidth মোড (`/api/browse`) এবং `MULTI_PROFILE` বিহীন ডিভাইসে Private Tab fallback ব্যবহারের জন্য প্রোডাকশন HTTPS ব্যাকএন্ড URL দিতে চাইলে বিল্ডের আগে `.env.production`-এ `VITE_API_BASE_URL` এবং `VITE_API_ACCESS_TOKEN` সেট করুন (বিস্তারিত `docs/DEPLOY_BACKEND.md`-তে দেখুন)।

---

## English Guide

### 1. How to Push the Project to GitHub
1. Create a new repository on GitHub.
2. From the project root directory, run:
   ```bash
   git init
   git branch -M main
   git add .
   git commit -m "chore: add NETFLOW Browser V2 source and Android CI workflow"
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
   git push -u origin main
   ```

### 2. How to Run the Workflow
- **Automatically:** Pushing to the `main` branch triggers the **Android Debug Build & Verification** workflow (`.github/workflows/android-build.yml`) automatically.
- **Manually (`workflow_dispatch`):**
  1. Open your GitHub repository and go to the **Actions** tab.
  2. Select **Android Debug Build & Verification** in the left sidebar.
  3. Click **Run workflow** → choose branch `main` → click **Run workflow**.

### 3. How to Download `build.log` and the Debug APK Artifact
1. Open the completed workflow run under the **Actions** tab.
2. Scroll down to the **Artifacts** section at the bottom of the run summary page:
   - **`netflow-android-build-logs`**: Uploaded **always** (even if the build fails). Contains `android/build.log` and `android/compile-errors.txt`.
   - **`netflow-android-debug-apk`**: Uploaded on **successful** build. Contains `android/app/build/outputs/apk/debug/app-debug.apk`.
   - **`netflow-android-lint-report`**: Contains `lint.log` and Android Lint report files (`lint-results-debug.html` / `.xml`).

### 4. What to Send Back for Form 5 (`NETFLOW-CI-COMPILE-FIX-01`)
- If `Run Gradle assembleDebug` fails: copy the **"First 30 Lines Containing `error:`"** block from the GitHub Actions **Summary** page (or copy all `error:` lines from `android/build.log` / `android/compile-errors.txt` inside `netflow-android-build-logs`) and paste them into Form 5.
- If `assembleDebug` succeeds with zero errors: paste `"CI PASSED"` into Form 5.

### 5. Pre-Push Static Checks, Dependencies & Related Documentation
1. **Pre-Push Verification (`VERIFIED` by test scripts in `docs/TEST_RESULTS.md`; Java compile `NOT VERIFIED` locally):**
   ```bash
   npm run lint
   npm run build
   npx tsx scripts/verify-java-static.ts
   npx tsx scripts/verify-interactive-contract.ts
   npx tsx scripts/verify-form-n2.ts
   npx tsx scripts/verify-native-downloads.ts
   npx tsx scripts/verify-chrome-like-ux.ts
   npx tsx scripts/verify-backend-hardening.ts
   ```
2. **Programmatic Overlay Containers & `androidx.webkit` (`MainActivity.java`, `res/values/ids.xml`, `android/app/build.gradle`):**
   - Because Capacitor's `BridgeActivity` inflates `capacitor_bridge_layout_main.xml` and ignores `activity_main.xml` (**`VERIFIED`** by inspecting `node_modules/@capacitor/android`), `MainActivity.setupNativeBrowserContainers()` programmatically creates `R.id.netflow_webview_container` and `R.id.netflow_fullscreen_container` around the shell `WebView` parent.
   - `android/app/build.gradle` declares `implementation "androidx.webkit:webkit:$androidxWebkitVersion"` (`1.14.0` from `android/variables.gradle`) for `WebViewFeature.MULTI_PROFILE`, `WebViewCompat.setProfile`, `ProfileStore`, and `Profile`.
3. **Related Project Documentation:**
   - [`docs/TEST_RESULTS.md`](./TEST_RESULTS.md) — Exact printed output and exit codes of all 31 verification scripts (`2026-10-10`).
   - [`docs/HANDOFF.md`](./HANDOFF.md) — Honest project status, architecture, evidence levels, and risk register.
   - [`docs/CHROME_GAP.md`](./CHROME_GAP.md) — Bilingual comparison of Chrome features vs. NETFLOW limitations.
   - [`docs/DEVICE_TEST_PLAN.md`](./DEVICE_TEST_PLAN.md) — Bilingual physical phone test checklist (`A-01`–`E-04`).
   - [`docs/RELEASE_GATES.md`](./RELEASE_GATES.md) — Release gates checklist (`GATE-01`–`GATE-08`, all `NOT DONE`).
   - [`docs/RELEASE_PREP_LATER.md`](./RELEASE_PREP_LATER.md) — Post-gate release checklist (do not start before all gates pass).
   - [`docs/DEPLOY_BACKEND.md`](./DEPLOY_BACKEND.md) — Step-by-step HTTPS backend deployment guide.
   - [`docs/NATIVE_CONTRACT.md`](./NATIVE_CONTRACT.md) — Native Android `<->` TypeScript shell JSON contract.
