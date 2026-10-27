# NETFLOW Browser V2 — Native Interactive Contract Specification

**Execution Marker:** `NETFLOW-INTERACTIVE-CONTRACT-01`  
**Form:** Form 1 of 6 (Contract & Shell Implementation; Android Java implementation scheduled for Form 3)  
**Format:** JSON over Native Bridge (`NetflowNativeBridge.postMessage` / `netflow:native-engine-event`)  
**Language:** English

---

## 1. Overview & Purpose

Historically, the native Android Java engine (`NetflowWebViewEngine.java`) denied permissions, file choosers, JavaScript dialogs, and HTTP authentication challenges synchronously. To enable asynchronous, user-consented decisions governed by the TypeScript shell (`nativeBrowserEngine.ts` + `App.tsx`) while preserving strict security and tab isolation, this document defines the authoritative bidirectional JSON contract between the **Native Host (`native`)** and the **TypeScript UI Shell (`shell`)**.

---

## 2. Common Event Envelope (`native -> shell`)

Every interactive and telemetry event emitted from the native Android engine to the shell carries a common envelope:

```json
{
  "eventType": "onPermissionRequested",
  "tabId": "tab-1",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "epoch": 4,
  "ts": 1760000000000,
  "isMainFrame": true,
  "origin": "https://meet.example.com"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `eventType` | `string` | Yes | Discriminator identifying the native event kind. Unknown `eventType` values are ignored by the shell. |
| `tabId` | `string` | Yes | Target browser tab identifier owning the `WebView` instance. |
| `requestId` | `string` (UUID) | Yes (Interactive) | Unique request identifier (UUID v4) for asynchronous request/response correlation. |
| `epoch` | `number` | Yes | Monotonically increasing per-tab navigation epoch. Events with `epoch < currentTabEpoch` are rejected as stale. |
| `ts` | `number` | Yes | Epoch timestamp in milliseconds when the event was generated. |
| `isMainFrame` | `boolean` | Yes | Indicates whether the event originated from the top-level document frame. |
| `origin` | `string` | Yes | Canonical scheme + host (+ optional port) of the requesting frame (e.g., `"https://example.com"`). |

---

## 3. Events (`native -> shell`)

### 3.1 `onPermissionRequested`
Emitted when `WebChromeClient.onPermissionRequest` or `onGeolocationPermissionsShowPrompt` is triggered by a frame.

```json
{
  "eventType": "onPermissionRequested",
  "tabId": "tab-1",
  "requestId": "c1a9d210-3f2b-4a8e-9b1c-0123456789ab",
  "epoch": 2,
  "ts": 1760000001000,
  "isMainFrame": true,
  "origin": "https://video.example.com",
  "resources": ["camera", "microphone"]
}
```

- **Allowed `resources` values:** `"camera" | "microphone" | "geolocation" | "protectedMedia" | "other"`
- **Shell Policy:**
  - Default is **deny / block** (when `siteOverrides` has no entry for the domain).
  - Non-HTTPS origins (`http://`, `file://`, `javascript:`, `data:`, etc.) are **immediately denied**.
  - `"other"` is **always denied**.
  - For `"camera"`, `"microphone"`, `"geolocation"`, and `"protectedMedia"`:
    - `siteOverrides[domain][resource] === "block"` or unset $\rightarrow$ immediate deny (`grantedResources: []`).
    - `siteOverrides[domain][resource] === "allow"` $\rightarrow$ grant on HTTPS origins (`RESOURCE_PROTECTED_MEDIA_ID` on Android WebView for `"protectedMedia"`).
    - `siteOverrides[domain][resource] === "ask"` $\rightarrow$ display dedicated consent modal (`GeolocationConsentModal` or `CameraMicConsentModal`) with Bengali + English explanations. For `"protectedMedia"`, the UI explicitly discloses that actual DRM playback depends on device-level Widevine/System WebView support (`NOT VERIFIED`).

### 3.2 `onFileChooserRequested`
Emitted when `WebChromeClient.onShowFileChooser` is invoked.

```json
{
  "eventType": "onFileChooserRequested",
  "tabId": "tab-1",
  "requestId": "d2b8e321-4a3c-4b9f-8c2d-123456789abc",
  "epoch": 2,
  "ts": 1760000002000,
  "isMainFrame": true,
  "origin": "https://upload.example.com",
  "acceptTypes": ["image/*", "application/pdf"],
  "multiple": false,
  "capture": false,
  "hasUserGesture": true
}
```

- **Shell Policy:**
  - Allowed (`allow: true`) **only** if `hasUserGesture === true`, the origin is safe, and `tabId` is the currently active foreground tab (`tabId === activeTabId`).
  - Otherwise immediately denied (`allow: false`).

### 3.3 `onJsDialog`
Emitted when `WebChromeClient.onJsAlert`, `onJsConfirm`, `onJsPrompt`, or `onJsBeforeUnload` is invoked.

```json
{
  "eventType": "onJsDialog",
  "tabId": "tab-1",
  "requestId": "e3c7f432-5b4d-4c0a-9d3e-23456789abcd",
  "epoch": 2,
  "ts": 1760000003000,
  "isMainFrame": true,
  "origin": "https://app.example.com",
  "type": "prompt",
  "message": "Enter workspace name:",
  "defaultValue": "My Workspace"
}
```

- **Allowed `type` values:** `"alert" | "confirm" | "prompt" | "beforeunload"`
- **Shell Policy:**
  - Routed through `AndroidWebViewDialogManager` and presented via `JavaScriptDialogModal` with flood/repeat-suppression protection (`suppressFutureDialogs`).
  - `beforeunload` is handled safely via `requestBeforeUnload` so the user can choose to Stay or Leave without trapping the tab.

### 3.4 `onHttpAuthRequested`
Emitted when `WebViewClient.onReceivedHttpAuthRequest` is invoked.

```json
{
  "eventType": "onHttpAuthRequested",
  "tabId": "tab-1",
  "requestId": "f4d6a543-6c5e-4d1b-8e4f-3456789abcde",
  "epoch": 2,
  "ts": 1760000004000,
  "isMainFrame": true,
  "origin": "https://intranet.example.com",
  "host": "intranet.example.com",
  "realm": "Restricted Area"
}
```

- **Shell Policy:**
  - Presented via `HttpAuthModal` showing `host` and `realm`, warning that the remote website (not the browser) is requesting credentials.
  - Password input uses `type="password"`, is cleared from React state immediately on close/submit/cancel, and is **never** logged or persisted anywhere.

### 3.5 `onNetworkStateChanged`
Emitted when Android `ConnectivityManager.NetworkCallback` detects a connectivity change.

```json
{
  "eventType": "onNetworkStateChanged",
  "tabId": "tab-1",
  "requestId": "a5e5b654-7d6f-4e2c-9f5a-456789abcdef",
  "epoch": 2,
  "ts": 1760000005000,
  "isMainFrame": true,
  "origin": "https://example.com",
  "validated": true,
  "metered": true,
  "transport": "cellular",
  "downKbps": 14500,
  "upKbps": 3200
}
```

### 3.6 `onSubresourceError`
Emitted when subresource requests fail or are blocked inside a page without failing the main frame.
- `sampleCode` is a **`string | number`** (for example, string codes such as `"ERR_BLOCKED_PRIVATE_IP"`, `"ERR_BLOCKED_DNS_PRIVATE_IP"`, `"LIGHT_MODE_WEB_FONT_BLOCKED"`, `"LIGHT_MODE_TRACKER_BLOCKED"`, `"HTTP_404"`, or numeric WebView error/status codes such as `-6` or `404`).
- The TypeScript shell keeps string `sampleCode` values intact as strings (never coercing them to `NaN` via `Number()`).

```json
{
  "eventType": "onSubresourceError",
  "tabId": "tab-1",
  "requestId": "b6f4c765-8e7a-4f3d-8a6b-56789abcdef0",
  "epoch": 2,
  "ts": 1760000006000,
  "isMainFrame": false,
  "origin": "https://cdn.example.com",
  "count": 3,
  "sampleCode": "ERR_BLOCKED_PRIVATE_IP"
}
```
*(Numeric example: `"sampleCode": -6`)*

### 3.7 `onCapabilities`
Emitted by the native host to advertise which native engine features are implemented at runtime.

```json
{
  "eventType": "onCapabilities",
  "tabId": "tab-1",
  "requestId": "07a3d876-9f8b-4a4e-9b7c-6789abcdef01",
  "epoch": 1,
  "ts": 1760000000100,
  "isMainFrame": true,
  "origin": "about:blank",
  "lightMode": true,
  "subresourceIntercept": true,
  "privateIsolation": false,
  "interactiveCallbacks": true,
  "chromiumVersion": "124.0.6367.82",
  "chromiumMajorVersion": 124
}
```

- **Capability Gating Invariant:** If `onCapabilities` reports `interactiveCallbacks: false` (or before `onCapabilities` is received with `interactiveCallbacks: true`), the shell does **not** claim interactive native callback support in the UI.
- **System WebView Version Advisory (`< Chromium 110`):** When `chromiumMajorVersion < 110` (or `chromiumVersion` parses to major `< 110`), the shell sets `isOutdatedWebView: true` and displays a non-blocking dismissible banner advising the user to update Android System WebView from Google Play.

### 3.8 `onDownloadRequested`
Emitted when a tab `DownloadListener` intercepts a downloadable `http`/`https` resource. Never starts a download automatically; awaits `resolveDownload`.
- `url` is sanitized for display (`origin + path` only; query string and fragment stripped).
- `userAgent` is **strictly omitted** from the event payload.
- `isPrivate` is always `false` (private tabs do not use the shared-profile native WebView or native `DownloadManager`).

```json
{
  "eventType": "onDownloadRequested",
  "tabId": "tab-1",
  "requestId": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab",
  "url": "https://mirror.example.com/releases/report.pdf",
  "mimeType": "application/pdf",
  "contentLength": 2097152,
  "suggestedFileName": "report.pdf",
  "isPrivate": false
}
```

### 3.9 `onDownloadProgress`
Emitted by `NetflowDownloadManager` while polling `android.app.DownloadManager.Query` (every 1s only while downloads are active) or on state transitions.
- `state`: `"queued" | "running" | "waiting_network" | "paused" | "completed" | "failed"`

```json
{
  "eventType": "onDownloadProgress",
  "downloadId": "849201",
  "tabId": "tab-1",
  "requestId": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab",
  "state": "running",
  "bytes": 524288,
  "total": 2097152,
  "reasonCode": "STATUS_RUNNING"
}
```

### 3.10 `onDownloadCompleted`
Emitted when `android.app.DownloadManager` reports `STATUS_SUCCESSFUL`.

```json
{
  "eventType": "onDownloadCompleted",
  "downloadId": "849201",
  "tabId": "tab-1",
  "requestId": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab",
  "fileName": "report.pdf",
  "mimeType": "application/pdf",
  "bytes": 2097152,
  "total": 2097152
}
```

### 3.11 `onDownloadUnsupported`
Emitted when a download link uses `blob:`, `data:`, or another scheme not supported by `android.app.DownloadManager`.

```json
{
  "eventType": "onDownloadUnsupported",
  "tabId": "tab-1",
  "url": "blob:https://example.com/550e8400",
  "scheme": "blob",
  "reasonCode": "UNSUPPORTED_DOWNLOAD_TYPE",
  "message": "blob: and data: downloads are not supported by the native Android system downloader."
}
```

### 3.12 `onContextMenuRequested`
Emitted when the user long-presses a link (`SRC_ANCHOR_TYPE`), linked image (`SRC_IMAGE_ANCHOR_TYPE` via `WebView.requestFocusNodeHref`), or standalone image (`IMAGE_TYPE`) inside a tab `WebView`. Non-link/non-image hit-test types return `false` in Java so normal Android text selection works unimpeded.
- Only `http://` and `https://` URLs passing `evaluateUrlSafety` are emitted.
- `type`: `"SRC_ANCHOR_TYPE" | "SRC_IMAGE_ANCHOR_TYPE" | "IMAGE_TYPE"` (TypeScript also accepts normalized aliases `"link" | "image_link" | "image"`).

```json
{
  "eventType": "onContextMenuRequested",
  "tabId": "tab-1",
  "type": "SRC_IMAGE_ANCHOR_TYPE",
  "linkUrl": "https://example.com/article",
  "imageUrl": "https://cdn.example.com/photo.jpg"
}
```

### 3.13 `onFavicon`
Emitted by `WebChromeClient.onReceivedIcon` for **non-private** tabs only (`!record.isPrivate`). Downscales the bitmap to at most `48x48` px, encodes as PNG base64, and drops the payload if base64 length exceeds `8192` bytes (`8 KB`).
- Stored in memory only per tab (`tab.favicon` / `state.faviconDataUrl`); **never** emitted or stored for private tabs and **never** persisted in `sessionPersistence` snapshots.

```json
{
  "eventType": "onFavicon",
  "tabId": "tab-1",
  "epoch": 2,
  "faviconBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "width": 32,
  "height": 32,
  "mimeType": "image/png"
}
```

### 3.14 `onSslError`
Emitted by `WebViewClient.onReceivedSslError` immediately after calling `handler.cancel()` (fail-closed; `handler.proceed()` is **never** called).
- Transitions the tab to the Recovery Center error page of `kind="ssl"` with Bengali + English explanations of why the certificate cannot be trusted, `Go back` and `Home` actions, and **no** "proceed anyway" button.

```json
{
  "eventType": "onSslError",
  "tabId": "tab-1",
  "epoch": 2,
  "primaryError": 3,
  "host": "expired.badssl.com",
  "failingUrl": "https://expired.badssl.com/"
}
```

---

## 4. Commands (`shell -> native`)

### 4.1 `resolvePermission`
```json
{
  "action": "resolvePermission",
  "requestId": "c1a9d210-3f2b-4a8e-9b1c-0123456789ab",
  "grantedResources": ["camera", "protectedMedia"]
}
```

### 4.2 `resolveFileChooser`
```json
{
  "action": "resolveFileChooser",
  "requestId": "d2b8e321-4a3c-4b9f-8c2d-123456789abc",
  "allow": true
}
```

### 4.3 `resolveJsDialog`
```json
{
  "action": "resolveJsDialog",
  "requestId": "e3c7f432-5b4d-4c0a-9d3e-23456789abcd",
  "confirmed": true,
  "value": "My Workspace"
}
```

### 4.4 `resolveHttpAuth`
```json
{
  "action": "resolveHttpAuth",
  "requestId": "f4d6a543-6c5e-4d1b-8e4f-3456789abcde",
  "proceed": true,
  "username": "alice",
  "password": "ephemeral-in-memory-secret"
}
```

### 4.5 `setLightMode`
```json
{
  "action": "setLightMode",
  "tabId": "tab-1",
  "policy": {
    "blockNetworkImage": false,
    "blockWebFonts": true,
    "blockMediaPreload": true,
    "blockThirdPartyTrackers": true,
    "cacheMode": "LOAD_CACHE_ELSE_NETWORK",
    "javaScriptEnabled": true
  }
}
```

### 4.6 `resolveDownload`
```json
{
  "action": "resolveDownload",
  "requestId": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab",
  "allow": true,
  "fileName": "report.pdf"
}
```

### 4.7 `cancelDownload`
```json
{
  "action": "cancelDownload",
  "downloadId": "849201"
}
```

### 4.8 `openDownload`
```json
{
  "action": "openDownload",
  "downloadId": "849201"
}
```

### 4.9 `deleteDownload`
```json
{
  "action": "deleteDownload",
  "downloadId": "849201"
}
```

### 4.10 `reconcileDownloads`
```json
{
  "action": "reconcileDownloads",
  "downloadIds": ["849201", "849202"]
}
```

### 4.11 `shareUrl`
Invokes the native Android system share sheet (`Intent.ACTION_SEND` wrapped in `Intent.createChooser` with `setComponent(null)` and `setSelector(null)`) for `http://` or `https://` URLs only.
```json
{
  "action": "shareUrl",
  "url": "https://example.com/article",
  "title": "Example Article"
}
```

### 4.12 `downloadImage`
Initiates an image download from the context menu through the Form 2 `NetflowDownloadManager` flow (`onDownloadStart` $\rightarrow$ `onDownloadRequested` $\rightarrow$ `DownloadConsentModal` $\rightarrow$ `resolveDownload`).
```json
{
  "action": "downloadImage",
  "tabId": "tab-1",
  "imageUrl": "https://cdn.example.com/photo.jpg"
}
```

### 4.13 `openExternalBrowser` / `LAUNCH_EXTERNAL_BROWSER`
Opens an `http://` or `https://` URL in the external Android system browser (`Intent.ACTION_VIEW` + `CATEGORY_BROWSABLE` with `setComponent(null)` and `setSelector(null)`).
```json
{
  "action": "openExternalBrowser",
  "url": "https://example.com/article"
}
```

---

## 5. Safety & Lifecycle Rules

1. **30-Second Auto-Deny / Auto-Cancel Timeout:**
   - Native auto-denies/cancels any unanswered interactive request after **30 seconds (`30,000 ms`)** and on navigation or tab close.
   - The TypeScript shell enforces the same **30-second (`30,000 ms`)** deadline: if an interactive request is not answered within 30s, or if the tab navigates, reloads, stops loading, or closes, the shell automatically resolves it with a deny/cancel payload (`grantedResources: []`, `allow: false`, `confirmed: false`, `proceed: false`) and closes any open prompt.
2. **Exactly-Once Resolution (`requestId`):**
   - Each `requestId` resolves **exactly once**.
   - Subsequent attempts to resolve an already-resolved `requestId` are ignored and emit no duplicate command.
3. **Unknown, Duplicate, Stale, and Wrong-Tab Protection:**
   - Duplicate incoming `requestId`s (already pending or already resolved) are ignored.
   - Unknown `requestId`s passed to `resolve*` commands are ignored.
   - Events carrying a stale `epoch` (`epoch < state.requestEpoch`) are ignored.
   - Interactive requests targeting an unknown tab or a background/non-active tab (`tabId !== activeTabId`) are ignored/rejected without opening prompts over the active tab.
   - Unknown `eventType` values are ignored without throwing or mutating state.
4. **Zero-Persistence & Zero-Logging Credential Invariant:**
   - HTTP authentication credentials (`username`, `password`) travel **in memory only** during the `resolveHttpAuth` call.
   - Passwords and tokens are **never** logged (`console.log`, `console.warn`, `console.error`, `console.info`) and **never** written to `localStorage`, `sessionStorage`, or `sessionPersistence` snapshots on either side.

---

## 6. Native Android Java Implementation (`NETFLOW-JAVA-ENGINE-COMPLETION-01`)

1. **Programmatic Overlay Host (`MainActivity.java`):**
   - Capacitor's `BridgeActivity.onCreate()` calls `setContentView(com.getcapacitor.android.R.layout.capacitor_bridge_layout_main)`, which inflates a `CoordinatorLayout` containing only `CapacitorWebView` (`@+id/webview`) and ignores `app/src/main/res/layout/activity_main.xml`.
   - `MainActivity.setupNativeBrowserContainers()` therefore creates `R.id.netflow_overlay_host`, `R.id.netflow_webview_container`, and `R.id.netflow_fullscreen_container` programmatically around `getBridge().getWebView()`'s parent after `super.onCreate()` and passes non-null container references to `NetflowWebViewEngine`.
2. **Async Interactive Callbacks (`NetflowWebViewEngine.java`):**
   - `onPermissionRequest`, `onGeolocationPermissionsShowPrompt` (with `setGeolocationEnabled(true)` so prompts can fire while defaulting to deny), `onShowFileChooser`, `onJsAlert`, `onJsConfirm`, `onJsPrompt`, `onJsBeforeUnload`, and `onReceivedHttpAuthRequest` store a `PendingInteractiveRequest` keyed by `requestId` (`UUID.randomUUID().toString()`), schedule a 30-second (`INTERACTIVE_REQUEST_TIMEOUT_MS = 30000L`) auto-deny/cancel on the UI `Handler`, and emit the corresponding contract event.
   - `resolvePermission`, `resolveFileChooser`, `resolveJsDialog`, and `resolveHttpAuth` claim the pending entry atomically (`AtomicBoolean.compareAndSet(false, true)`) and execute resolution on the UI thread (`runOnUiThread`).
   - When the shell grants a web permission (`camera`, `microphone`, or `geolocation`), `NetflowWebViewEngine.resolvePermission` checks the Android OS runtime permission (`CAMERA`, `RECORD_AUDIO`, `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`) via `Activity.checkSelfPermission`, requests any missing OS permission via `Activity.requestPermissions` (with a 30-second timeout and epoch/tab validation), and completes or denies the web callback inside `MainActivity.onRequestPermissionsResult` -> `NetflowWebViewEngine.onRequestPermissionsResult`.
   - File chooser uses `Activity.startActivityForResult(Intent.createChooser(...), FILE_CHOOSER_REQUEST_CODE)` when `resolveFileChooser` is called with `allow: true`, and completes the `ValueCallback<Uri[]>` inside `MainActivity.onActivityResult` (filtering out `file://` URIs).
   - Pending requests are automatically denied/cancelled on navigation (`shouldOverrideUrlLoading`, `onPageStarted`, `loadUrl`, `reload`, `stopLoading`, `goBack`, `goForward`), tab close (`closeTab`), renderer crash (`onRenderProcessGone`), and host destroy (`onHostDestroy`).
3. **Subresource Security & Light Mode (`shouldInterceptRequest`):**
   - Runs on Chromium's background worker thread without any UI-thread or `WebView` method calls.
   - Blocks unsafe schemes and private/loopback/link-local/CGNAT/metadata IPv4 & IPv6 literals, and resolves subresource hostnames on the background thread with a 60-second TTL cache (`DNS_CACHE_TTL_MS = 60000L`, failing open on `UnknownHostException`).
   - When Light Mode is active (`setLightMode`), blocks web fonts and third-party tracker domains for subresources while keeping JavaScript enabled.
   - Returns an empty `403 Forbidden` `WebResourceResponse` for blocked subresources and emits `onSubresourceError` sampled at most once per second per tab (`SUBRESOURCE_SAMPLE_INTERVAL_MS = 1000L`).
4. **External `http`/`https` Intent Queueing (`NetflowBrowserPlugin.java`):**
   - `AndroidManifest.xml` declares a `VIEW` + `DEFAULT` + `BROWSABLE` intent filter for `http` and `https`.
   - Incoming `ACTION_VIEW` intents are validated for `http`/`https` and URL safety, queued in `NetflowBrowserPlugin` until the shell signals readiness (`SHELL_READY` / `notifyShellReady` / first tab creation), and then delivered via `onExternalIntentUrl`.

