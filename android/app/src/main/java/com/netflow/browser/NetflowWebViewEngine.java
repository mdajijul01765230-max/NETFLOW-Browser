package com.netflow.browser;

import android.Manifest;
import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.HttpAuthHandler;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebBackForwardList;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.RequiresApi;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * NETFLOW Browser V2 — Native Android System WebView / Chromium Core Browser Engine
 *
 * FORM-N2 Implementation:
 * 1. Per-tab native android.webkit.WebView ownership & lifecycle isolation
 * 2. Full WebSettings & CookieManager configuration (zero privileged JS bridge on content WebViews)
 * 3. WebViewClient (navigation interception, SSRF/scheme guard, Google OAuth external fallback,
 *    page lifecycle, SPA doUpdateVisitedHistory, main-frame error handling, SSL error cancellation,
 *    onRenderProcessGone crash isolation)
 * 4. WebChromeClient (progress, title, user-gesture onCreateWindow popup/new-tab boundary,
 *    fullscreen custom view, runtime permission boundary, geolocation boundary, file chooser, JS dialogs)
 * 5. DownloadListener integration (onDownloadStart -> NETFLOW download lifecycle)
 * 6. Viewport bounds & visibility synchronization with the React/Capacitor UI Shell
 */
public class NetflowWebViewEngine {

    public interface EngineEventSink {
        void onEngineEvent(String eventType, JSONObject payload);
    }

    public static final String MOBILE_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Mobile; NETFLOW/2.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
    public static final String DESKTOP_USER_AGENT =
            "Mozilla/5.0 (X11; Linux x86_64; NETFLOW/2.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

    public static final int FILE_CHOOSER_REQUEST_CODE = 54321;
    public static final int OS_PERMISSION_REQUEST_CODE_BASE = 54400;
    public static final int OS_PERMISSION_REQUEST_CODE_MAX = 54899;
    public static final int MAX_FAVICON_DIMENSION_PX = 48;
    public static final int MAX_FAVICON_BASE64_BYTES = 8 * 1024; // 8 KB
    public static final long INTERACTIVE_REQUEST_TIMEOUT_MS = 30000L;
    public static final long DNS_CACHE_TTL_MS = 60000L;
    public static final long DNS_LOOKUP_TIMEOUT_MS = 1500L;
    public static final int MAX_CONCURRENT_DNS_LOOKUPS = 4;
    public static final long SUBRESOURCE_SAMPLE_INTERVAL_MS = 1000L;
    public static final int MAX_DNS_CACHE_ENTRIES = 1024;
    private static final long TRANSPORT_WEBVIEW_TIMEOUT_MS = 5000L;
    private static final long RENDER_CRASH_LOOP_WINDOW_MS = 15000L;
    private static final int MAX_RENDER_CRASH_AUTO_RELOADS = 1;
    public static final String PRIVATE_PROFILE_NAME = "NetflowPrivateProfile";
    public static final long PRIVATE_PROFILE_DELETE_DELAY_MS = 100L;

    private static final Set<String> LIGHT_MODE_FONT_EXTENSIONS = new HashSet<>(Arrays.asList(
            ".woff", ".woff2", ".ttf", ".otf", ".eot"
    ));
    private static final Set<String> LIGHT_MODE_FONT_HOSTS = new HashSet<>(Arrays.asList(
            "fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net"
    ));
    private static final String[] LIGHT_MODE_TRACKER_HOSTS = new String[]{
            "google-analytics.com",
            "googletagmanager.com",
            "doubleclick.net",
            "connect.facebook.net",
            "pixel.facebook.com",
            "clarity.ms",
            "hotjar.com",
            "criteo.com",
            "adnxs.com",
            "outbrain.com",
            "taboola.com",
            "amazon-adsystem.com",
            "scorecardresearch.com"
    };

    private static class DnsCacheEntry {
        final boolean isSafe;
        final long expiresAtMs;

        DnsCacheEntry(boolean isSafe, long expiresAtMs) {
            this.isSafe = isSafe;
            this.expiresAtMs = expiresAtMs;
        }
    }

    private static class PendingInteractiveRequest {
        final String requestId;
        final String tabId;
        final long epoch;
        final String kind;
        final AtomicBoolean resolved = new AtomicBoolean(false);
        PermissionRequest permissionRequest;
        GeolocationPermissions.Callback geolocationCallback;
        String geolocationOrigin;
        ValueCallback<Uri[]> filePathCallback;
        WebChromeClient.FileChooserParams fileChooserParams;
        JsResult jsResult;
        JsPromptResult jsPromptResult;
        HttpAuthHandler httpAuthHandler;
        Runnable timeoutRunnable;
        int osPermissionRequestCode = -1;
        List<String> shellApprovedNativeResources;

        PendingInteractiveRequest(String requestId, String tabId, long epoch, String kind) {
            this.requestId = requestId;
            this.tabId = tabId;
            this.epoch = epoch;
            this.kind = kind;
        }
    }

    private final Activity activity;
    private final Handler mainHandler;
    private final EngineEventSink eventSink;
    private final NetflowDownloadManager downloadManager;
    private final Map<String, TabWebViewHolder> tabHolders = new ConcurrentHashMap<>();
    private final Map<String, PendingInteractiveRequest> pendingInteractiveRequests = new ConcurrentHashMap<>();
    private final Map<Integer, PendingInteractiveRequest> pendingOsPermissionRequests = new ConcurrentHashMap<>();
    private final AtomicInteger nextOsPermRequestCode = new AtomicInteger(OS_PERMISSION_REQUEST_CODE_BASE);
    private final Map<String, DnsCacheEntry> dnsSafetyCache = new ConcurrentHashMap<>();
    private final ExecutorService dnsLookupExecutor = Executors.newFixedThreadPool(MAX_CONCURRENT_DNS_LOOKUPS, r -> {
        Thread t = new Thread(r, "netflow-subresource-dns");
        t.setDaemon(true);
        return t;
    });
    // UI-thread WeakHashMap set guaranteeing every created WebView is destroyed at most once
    private final Set<WebView> destroyedWebViews = Collections.newSetFromMap(new WeakHashMap<>());

    private volatile WebView shellWebViewRef;
    private volatile FrameLayout contentContainer;
    private volatile FrameLayout fullscreenContainer;
    private volatile View activeCustomView;
    private volatile WebChromeClient.CustomViewCallback activeCustomViewCallback;
    private volatile String activeFullscreenTabId;
    private volatile ValueCallback<Uri[]> activeFileUploadCallback;

    private volatile String activeTabId = null;
    private volatile boolean isViewportVisible = true;
    private volatile int viewportLeftCssPx = 0;
    private volatile int viewportTopCssPx = 0;
    private volatile int viewportWidthCssPx = 0;
    private volatile int viewportHeightCssPx = 0;
    private volatile ConnectivityManager.NetworkCallback networkCallback;
    private volatile boolean privateProfileIsolationActive = false;
    private volatile boolean privateProfileDeletionPendingRetry = false;
    private Runnable pendingPrivateProfileDeleteRunnable = null;

    public static class TabWebViewHolder {
        public final String tabId;
        public final boolean isPrivate;
        public WebView webView;
        public volatile String currentUrl = "";
        public volatile String lastCommittedUrl = "";
        public volatile String lastHttpMethod = "GET";
        public volatile String currentTitle = "New Tab";
        public volatile int progress = 0;
        public volatile boolean isLoading = false;
        public volatile boolean canGoBackCached = false;
        public volatile String siteMode = "default";
        public volatile int zoomLevel = 100;
        public volatile boolean javascriptAllowed = true;
        public volatile boolean popupsAllowed = true;
        public volatile boolean lightModeEnabled = false;
        public volatile boolean lightModeBlockNetworkImage = false;
        public volatile boolean lightModeBlockWebFonts = false;
        public volatile boolean lightModeBlockMediaPreload = false;
        public volatile boolean lightModeBlockTrackers = false;
        public volatile String lightModeCacheMode = "LOAD_DEFAULT";
        public volatile boolean renderProcessGone = false;
        public volatile boolean needsCrashReloadOnShow = false;
        public volatile long lastRenderCrashTimestampMs = 0L;
        public volatile int consecutiveRenderCrashCount = 0;
        public final Set<WebView> pendingTransportWebViews = ConcurrentHashMap.newKeySet();
        public final AtomicLong requestEpoch = new AtomicLong(1);
        public final AtomicInteger subresourceErrorCountSinceEmit = new AtomicInteger(0);
        public final AtomicLong lastSubresourceEmitMs = new AtomicLong(0L);

        public TabWebViewHolder(String tabId, boolean isPrivate) {
            this.tabId = tabId;
            this.isPrivate = isPrivate;
        }
    }

    public NetflowWebViewEngine(Activity activity) {
        this(activity, (eventType, payload) -> {
            WebView shellWebView = (activity instanceof com.getcapacitor.BridgeActivity && ((com.getcapacitor.BridgeActivity) activity).getBridge() != null)
                    ? ((com.getcapacitor.BridgeActivity) activity).getBridge().getWebView()
                    : null;
            NetflowBrowserPlugin.dispatchEngineEventToShell(activity, shellWebView, eventType, payload);
        });
    }

    public WebView getWebView() {
        if (activeTabId == null) {
            return null;
        }
        TabWebViewHolder holder = tabHolders.get(activeTabId);
        if (holder != null && holder.webView != null) {
            return holder.webView;
        }
        return null;
    }

    public NetflowWebViewEngine(Activity activity, EngineEventSink eventSink) {
        this.activity = activity;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.eventSink = eventSink;
        this.downloadManager = new NetflowDownloadManager(
                activity,
                this.mainHandler,
                new NetflowDownloadManager.EngineBridge() {
                    @Override
                    public boolean isDownloadUrlSafe(String url) {
                        return evaluateUrlSafety(url).isSafe;
                    }

                    @Override
                    public String extractOrigin(String url) {
                        return NetflowWebViewEngine.extractOrigin(url);
                    }

                    @Override
                    public void emitContractEvent(String eventType, JSONObject payload) {
                        emitEvent(eventType, payload);
                    }
                }
        );
        runOnUiThread(() -> {
            registerNetworkCallbackOnUiThread();
            emitCapabilitiesEventOnUiThread();
        });
    }

    public void setShellWebView(final WebView shellWebView) {
        runOnUiThread(() -> {
            this.shellWebViewRef = shellWebView;
        });
    }

    public void emitCapabilitiesEvent() {
        runOnUiThread(this::emitCapabilitiesEventOnUiThread);
    }

    private void emitCapabilitiesEventOnUiThread() {
        String targetTabId = activeTabId != null ? activeTabId : "default-tab";
        TabWebViewHolder activeHolder = activeTabId != null ? tabHolders.get(activeTabId) : null;
        long epoch = activeHolder != null ? activeHolder.requestEpoch.get() : 1L;
        String origin = activeHolder != null ? extractOrigin(activeHolder.currentUrl) : "about:blank";
        String chromiumVersion = "";
        int chromiumMajorVersion = 0;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PackageInfo info = WebView.getCurrentWebViewPackage();
                if (info != null && info.versionName != null) {
                    chromiumVersion = info.versionName.trim();
                    int dotIdx = chromiumVersion.indexOf('.');
                    String majorStr = dotIdx > 0 ? chromiumVersion.substring(0, dotIdx) : chromiumVersion;
                    String digitsOnly = majorStr.replaceAll("[^0-9]", "");
                    if (!digitsOnly.isEmpty()) {
                        chromiumMajorVersion = Integer.parseInt(digitsOnly);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        this.privateProfileIsolationActive = isMultiProfileIsolationSupportedOnUiThread();
        JSONObject ev = createContractEnvelope("onCapabilities", targetTabId, UUID.randomUUID().toString(), epoch, true, origin);
        try {
            ev.put("lightMode", true);
            ev.put("subresourceIntercept", true);
            ev.put("privateIsolation", this.privateProfileIsolationActive);
            ev.put("interactiveCallbacks", true);
            if (!chromiumVersion.isEmpty()) {
                ev.put("chromiumVersion", chromiumVersion);
                ev.put("webViewVersion", chromiumVersion);
            }
            if (chromiumMajorVersion > 0) {
                ev.put("chromiumMajorVersion", chromiumMajorVersion);
            }
        } catch (JSONException ignored) {
        }
        emitEvent("onCapabilities", ev);
    }

    private boolean isMultiProfileIsolationSupportedOnUiThread() {
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                return false;
            }
            ProfileStore store = ProfileStore.getInstance();
            return store != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private Profile getOrCreatePrivateProfileOnUiThread(final String initializingTabId) {
        if (!this.privateProfileIsolationActive) {
            return null;
        }
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                return null;
            }
            // Cancel any pending delayed deletion runnable if a new private session starts
            if (pendingPrivateProfileDeleteRunnable != null) {
                mainHandler.removeCallbacks(pendingPrivateProfileDeleteRunnable);
                pendingPrivateProfileDeleteRunnable = null;
                this.privateProfileDeletionPendingRetry = true;
            }
            // If a previous private-profile deletion failed (or was still pending when the new session started)
            // and no other private WebView is currently using the profile, retry deletion before creating the fresh session profile
            if (this.privateProfileDeletionPendingRetry && !hasAnyActivePrivateWebViewOnUiThread(initializingTabId)) {
                retryDeletePrivateProfileBeforeNewSessionOnUiThread();
            }
            ProfileStore store = ProfileStore.getInstance();
            if (store == null) {
                return null;
            }
            return store.getOrCreateProfile(PRIVATE_PROFILE_NAME);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private Profile getOrCreatePrivateProfileOnUiThread() {
        return getOrCreatePrivateProfileOnUiThread(null);
    }

    private boolean hasAnyOpenPrivateTabOnUiThread() {
        for (TabWebViewHolder h : tabHolders.values()) {
            if (h != null && h.isPrivate) {
                return true;
            }
        }
        return false;
    }

    private boolean hasAnyActivePrivateWebViewOnUiThread(final String excludeTabId) {
        for (TabWebViewHolder h : tabHolders.values()) {
            if (h == null || !h.isPrivate) {
                continue;
            }
            if (excludeTabId != null && excludeTabId.equals(h.tabId) && h.webView == null) {
                continue;
            }
            if (h.webView != null || !h.pendingTransportWebViews.isEmpty()) {
                return true;
            }
        }
        return false;
    }

    private void retryDeletePrivateProfileBeforeNewSessionOnUiThread() {
        if (hasAnyActivePrivateWebViewOnUiThread(null)) {
            return;
        }
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                return;
            }
            ProfileStore store = ProfileStore.getInstance();
            if (store == null) {
                return;
            }
            Profile existingProfile = store.getProfile(PRIVATE_PROFILE_NAME);
            if (existingProfile != null) {
                try {
                    CookieManager privateCm = existingProfile.getCookieManager();
                    if (privateCm != null) {
                        privateCm.removeAllCookies(null);
                        privateCm.flush();
                    }
                } catch (Throwable ignored) {
                }
                try {
                    WebStorage privateStorage = existingProfile.getWebStorage();
                    if (privateStorage != null) {
                        privateStorage.deleteAllData();
                    }
                } catch (Throwable ignored) {
                }
                boolean deleted = store.deleteProfile(PRIVATE_PROFILE_NAME);
                this.privateProfileDeletionPendingRetry = !deleted;
            } else {
                this.privateProfileDeletionPendingRetry = false;
            }
        } catch (Throwable ignored) {
            this.privateProfileDeletionPendingRetry = true;
        }
    }

    private void schedulePrivateProfileDeletionAfterDestroyOnUiThread() {
        if (!this.privateProfileIsolationActive) {
            return;
        }
        if (pendingPrivateProfileDeleteRunnable != null) {
            mainHandler.removeCallbacks(pendingPrivateProfileDeleteRunnable);
        }
        pendingPrivateProfileDeleteRunnable = () -> {
            pendingPrivateProfileDeleteRunnable = null;
            deletePrivateProfileSafelyOnUiThread();
        };
        mainHandler.postDelayed(pendingPrivateProfileDeleteRunnable, PRIVATE_PROFILE_DELETE_DELAY_MS);
    }

    private void deletePrivateProfileSafelyOnUiThread() {
        if (!this.privateProfileIsolationActive) {
            return;
        }
        if (hasAnyOpenPrivateTabOnUiThread() || hasAnyActivePrivateWebViewOnUiThread(null)) {
            return;
        }
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                return;
            }
            ProfileStore store = ProfileStore.getInstance();
            if (store == null) {
                return;
            }
            Profile existingProfile = store.getProfile(PRIVATE_PROFILE_NAME);
            if (existingProfile != null) {
                try {
                    CookieManager privateCm = existingProfile.getCookieManager();
                    if (privateCm != null) {
                        privateCm.removeAllCookies(null);
                        privateCm.flush();
                    }
                } catch (Throwable ignored) {
                }
                try {
                    WebStorage privateStorage = existingProfile.getWebStorage();
                    if (privateStorage != null) {
                        privateStorage.deleteAllData();
                    }
                } catch (Throwable ignored) {
                }
                boolean deleted = store.deleteProfile(PRIVATE_PROFILE_NAME);
                this.privateProfileDeletionPendingRetry = !deleted;
            } else {
                this.privateProfileDeletionPendingRetry = false;
            }
        } catch (Throwable ignored) {
            this.privateProfileDeletionPendingRetry = true;
        }
    }

    private void registerNetworkCallbackOnUiThread() {
        try {
            final ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        NetworkCapabilities caps = null;
                        try {
                            caps = cm.getNetworkCapabilities(network);
                        } catch (Exception ignored) {
                        }
                        notifyNetworkAvailability(true);
                        emitNetworkStateChanged(caps, true);
                    }

                    @Override
                    public void onLost(Network network) {
                        notifyNetworkAvailability(false);
                        emitNetworkStateChanged(null, false);
                    }

                    @Override
                    public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                        boolean hasInternet = caps != null
                                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                        notifyNetworkAvailability(hasInternet);
                        emitNetworkStateChanged(caps, true);
                    }
                };
                cm.registerDefaultNetworkCallback(networkCallback);
            }
        } catch (Exception ignored) {
        }
    }

    private void emitNetworkStateChanged(final NetworkCapabilities caps, final boolean hasActiveNetwork) {
        boolean validated = hasActiveNetwork
                && caps != null
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        boolean metered = caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
        String transport = "none";
        int downKbps = 0;
        int upKbps = 0;
        if (hasActiveNetwork && caps != null) {
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                transport = "wifi";
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                transport = "cellular";
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                transport = "ethernet";
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                transport = "vpn";
            } else {
                transport = "other";
            }
            downKbps = Math.max(0, caps.getLinkDownstreamBandwidthKbps());
            upKbps = Math.max(0, caps.getLinkUpstreamBandwidthKbps());
        }

        final boolean finalValidated = validated;
        final boolean finalMetered = metered;
        final String finalTransport = transport;
        final int finalDownKbps = downKbps;
        final int finalUpKbps = upKbps;

        runOnUiThread(() -> {
            String targetTabId = activeTabId != null ? activeTabId : "default-tab";
            TabWebViewHolder activeHolder = activeTabId != null ? tabHolders.get(activeTabId) : null;
            long epoch = activeHolder != null ? activeHolder.requestEpoch.get() : 1L;
            String origin = activeHolder != null ? extractOrigin(activeHolder.currentUrl) : "about:blank";
            JSONObject ev = createContractEnvelope(
                    "onNetworkStateChanged",
                    targetTabId,
                    UUID.randomUUID().toString(),
                    epoch,
                    true,
                    origin
            );
            try {
                ev.put("validated", finalValidated);
                ev.put("metered", finalMetered);
                ev.put("transport", finalTransport);
                ev.put("downKbps", finalDownKbps);
                ev.put("upKbps", finalUpKbps);
            } catch (JSONException ignored) {
            }
            emitEvent("onNetworkStateChanged", ev);
        });
    }

    private void notifyNetworkAvailability(final boolean isAvailable) {
        runOnUiThread(() -> {
            if (activeTabId != null) {
                TabWebViewHolder active = tabHolders.get(activeTabId);
                if (active != null && active.webView != null) {
                    active.webView.setNetworkAvailable(isAvailable);
                }
            }
            JSONObject ev = new JSONObject();
            try {
                ev.put("isAvailable", isAvailable);
            } catch (JSONException ignored) {
            }
            emitEvent("onNetworkAvailabilityChanged", ev);
        });
    }

    public void attachContainers(final FrameLayout contentContainer, final FrameLayout fullscreenContainer) {
        runOnUiThread(() -> {
            this.contentContainer = contentContainer;
            this.fullscreenContainer = fullscreenContainer;
            if (this.contentContainer != null) {
                this.contentContainer.setVisibility(View.VISIBLE);
            }
            if (this.fullscreenContainer != null) {
                this.fullscreenContainer.setVisibility(View.GONE);
            }
        });
    }

    private void runOnUiThread(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action.run();
        } else {
            mainHandler.post(action);
        }
    }

    private JSONObject createContractEnvelope(
            String eventType,
            String tabId,
            String requestId,
            long epoch,
            boolean isMainFrame,
            String origin
    ) {
        long now = System.currentTimeMillis();
        JSONObject ev = new JSONObject();
        try {
            ev.put("eventType", eventType);
            ev.put("tabId", tabId != null ? tabId : "");
            ev.put("requestId", requestId != null ? requestId : UUID.randomUUID().toString());
            ev.put("epoch", epoch);
            ev.put("ts", now);
            ev.put("timestamp", now);
            ev.put("isMainFrame", isMainFrame);
            ev.put("origin", origin != null && !origin.isEmpty() ? origin : "about:blank");
        } catch (JSONException ignored) {
        }
        return ev;
    }

    public static String extractOrigin(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return "about:blank";
        }
        String trimmed = rawUrl.trim();
        if ("about:blank".equalsIgnoreCase(trimmed)) {
            return "about:blank";
        }
        try {
            Uri uri = Uri.parse(trimmed);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
            String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
            int port = uri.getPort();
            if ((scheme.equals("https") || scheme.equals("http")) && !host.isEmpty()) {
                if (port > 0 && !((scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80))) {
                    return scheme + "://" + host + ":" + port;
                }
                return scheme + "://" + host;
            }
        } catch (Exception ignored) {
        }
        return "about:blank";
    }

    private void emitEvent(String eventType, JSONObject payload) {
        if (eventSink == null) return;
        try {
            payload.put("eventType", eventType);
            if (!payload.has("ts")) {
                payload.put("ts", System.currentTimeMillis());
            }
            payload.put("timestamp", System.currentTimeMillis());
        } catch (JSONException ignored) {
        }
        eventSink.onEngineEvent(eventType, payload);
    }

    // -------------------------------------------------------------------------
    // 1. Per-Tab Native WebView Ownership & Lifecycle
    // -------------------------------------------------------------------------

    public void createOrUpdateTab(
            final String tabId,
            final boolean isPrivate,
            final String siteMode,
            final int zoomLevel,
            final boolean javascriptAllowed,
            final boolean popupsAllowed
    ) {
        if (tabId == null || tabId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            if (isPrivate && !this.privateProfileIsolationActive) {
                return;
            }
            TabWebViewHolder holder = ensureTabHolderOnUiThread(tabId, isPrivate);
            holder.siteMode = siteMode != null ? siteMode : "default";
            holder.zoomLevel = zoomLevel > 0 ? zoomLevel : 100;
            holder.javascriptAllowed = javascriptAllowed;
            holder.popupsAllowed = popupsAllowed;
            if (holder.webView != null) {
                applyTabWebSettings(holder);
            }
        });
    }

    private TabWebViewHolder ensureTabHolderOnUiThread(String tabId, boolean isPrivate) {
        TabWebViewHolder existing = tabHolders.get(tabId);
        if (existing != null && existing.webView != null && !existing.renderProcessGone) {
            return existing;
        }
        TabWebViewHolder holder = existing != null ? existing : new TabWebViewHolder(tabId, isPrivate);
        holder.renderProcessGone = false;
        holder.webView = createConfiguredWebView(holder);
        tabHolders.put(tabId, holder);

        if (contentContainer != null && holder.webView.getParent() == null) {
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
            );
            holder.webView.setLayoutParams(lp);
            holder.webView.setVisibility(View.VISIBLE);
            contentContainer.addView(holder.webView);
        }
        return holder;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createConfiguredWebView(final TabWebViewHolder holder) {
        final WebView webView = new WebView(activity);
        webView.setBackgroundColor(Color.WHITE);

        // Assign profile BEFORE any first load or CookieManager configuration on this WebView
        Profile privateProfile = null;
        if (this.privateProfileIsolationActive) {
            try {
                if (holder.isPrivate) {
                    privateProfile = getOrCreatePrivateProfileOnUiThread(holder.tabId);
                    WebViewCompat.setProfile(webView, PRIVATE_PROFILE_NAME);
                } else {
                    WebViewCompat.setProfile(webView, Profile.DEFAULT_PROFILE_NAME);
                }
            } catch (Throwable ignored) {
            }
        }

        // Security invariant: NEVER call webView.addJavascriptInterface(...) on content WebViews!
        // Remove any legacy default Android interfaces if present
        webView.removeJavascriptInterface("searchBoxJavaBridge_");
        webView.removeJavascriptInterface("accessibility");
        webView.removeJavascriptInterface("accessibilityTraversal");

        applyTabWebSettings(holder, webView);

        CookieManager cookieManager = null;
        if (holder.isPrivate && this.privateProfileIsolationActive) {
            if (privateProfile == null) {
                privateProfile = getOrCreatePrivateProfileOnUiThread();
            }
            if (privateProfile != null) {
                cookieManager = privateProfile.getCookieManager();
            }
        } else {
            cookieManager = CookieManager.getInstance();
        }
        if (cookieManager != null) {
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, false);
        }

        webView.setWebViewClient(new NetflowTabWebViewClient(holder));
        webView.setWebChromeClient(new NetflowTabWebChromeClient(holder));
        webView.setDownloadListener(new NetflowTabDownloadListener(holder));

        webView.setFindListener((activeMatchOrdinal, numberOfMatches, isDoneCounting) -> {
            JSONObject ev = new JSONObject();
            try {
                ev.put("tabId", holder.tabId);
                ev.put("activeMatchOrdinal", activeMatchOrdinal);
                ev.put("numberOfMatches", numberOfMatches);
                ev.put("isDoneCounting", isDoneCounting);
            } catch (JSONException ignored) {
            }
            emitEvent("onFindResultReceived", ev);
        });

        webView.setOnLongClickListener(v -> handleWebViewLongClickOnUiThread(holder, webView));

        return webView;
    }

    private boolean handleWebViewLongClickOnUiThread(final TabWebViewHolder holder, final WebView webView) {
        if (holder == null || webView == null || (holder.isPrivate && !this.privateProfileIsolationActive)) {
            return false;
        }
        WebView.HitTestResult hitTest = webView.getHitTestResult();
        if (hitTest == null) {
            return false;
        }
        int hitType = hitTest.getType();
        switch (hitType) {
            case WebView.HitTestResult.SRC_ANCHOR_TYPE: {
                String safeLinkUrl = sanitizeHttpOrHttpsContextMenuUrl(hitTest.getExtra());
                if (safeLinkUrl == null) {
                    return false;
                }
                emitContextMenuRequestedOnUiThread(holder, "SRC_ANCHOR_TYPE", safeLinkUrl, null);
                return true;
            }
            case WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE: {
                final String fallbackImageExtra = hitTest.getExtra();
                Handler hrefHandler = new Handler(Looper.getMainLooper()) {
                    @Override
                    public void handleMessage(Message msg) {
                        Bundle data = msg != null ? msg.getData() : null;
                        String rawLink = data != null ? data.getString("url") : null;
                        String rawSrc = data != null ? data.getString("src") : null;
                        if (rawSrc == null || rawSrc.trim().isEmpty()) {
                            rawSrc = fallbackImageExtra;
                        }
                        String safeLinkUrl = sanitizeHttpOrHttpsContextMenuUrl(rawLink);
                        String safeImageUrl = sanitizeHttpOrHttpsContextMenuUrl(rawSrc);
                        if (safeLinkUrl != null && safeImageUrl != null) {
                            emitContextMenuRequestedOnUiThread(
                                    holder,
                                    "SRC_IMAGE_ANCHOR_TYPE",
                                    safeLinkUrl,
                                    safeImageUrl
                            );
                        } else if (safeLinkUrl != null) {
                            emitContextMenuRequestedOnUiThread(
                                    holder,
                                    "SRC_ANCHOR_TYPE",
                                    safeLinkUrl,
                                    null
                            );
                        } else if (safeImageUrl != null) {
                            emitContextMenuRequestedOnUiThread(
                                    holder,
                                    "IMAGE_TYPE",
                                    null,
                                    safeImageUrl
                            );
                        }
                    }
                };
                Message hrefMsg = hrefHandler.obtainMessage();
                webView.requestFocusNodeHref(hrefMsg);
                return true;
            }
            case WebView.HitTestResult.IMAGE_TYPE: {
                String safeImageUrl = sanitizeHttpOrHttpsContextMenuUrl(hitTest.getExtra());
                if (safeImageUrl == null) {
                    return false;
                }
                emitContextMenuRequestedOnUiThread(holder, "IMAGE_TYPE", null, safeImageUrl);
                return true;
            }
            default:
                // Return false for all non-link/non-image types (such as EDIT_TEXT_TYPE or UNKNOWN_TYPE)
                // so normal Android WebView text selection works unimpeded.
                return false;
        }
    }

    private static String sanitizeHttpOrHttpsContextMenuUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return null;
        }
        String trimmed = rawUrl.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            return null;
        }
        if (!evaluateUrlSafety(trimmed).isSafe) {
            return null;
        }
        return trimmed;
    }

    private void emitContextMenuRequestedOnUiThread(
            TabWebViewHolder holder,
            String type,
            String linkUrl,
            String imageUrl
    ) {
        if (holder == null || (holder.isPrivate && !this.privateProfileIsolationActive)) return;
        if (linkUrl == null && imageUrl == null) return;
        long epoch = holder.requestEpoch.get();
        String origin = extractOrigin(holder.currentUrl);
        JSONObject ev = createContractEnvelope(
                "onContextMenuRequested",
                holder.tabId,
                UUID.randomUUID().toString(),
                epoch,
                true,
                origin
        );
        try {
            ev.put("type", type);
            ev.put("isPrivate", holder.isPrivate);
            if (linkUrl != null) {
                ev.put("linkUrl", linkUrl);
            }
            if (imageUrl != null) {
                ev.put("imageUrl", imageUrl);
            }
        } catch (JSONException ignored) {
        }
        emitEvent("onContextMenuRequested", ev);
    }

    private void applyTabWebSettings(TabWebViewHolder holder) {
        if (holder.webView != null) {
            applyTabWebSettings(holder, holder.webView);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void applyTabWebSettings(TabWebViewHolder holder, WebView webView) {
        WebSettings settings = webView.getSettings();
        // Part 3 invariant: Light Mode NEVER disables JavaScript; respect per-site javascriptAllowed setting
        boolean jsEnabled = holder.javascriptAllowed;
        settings.setJavaScriptEnabled(jsEnabled);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Security baseline: block file:// and content:// access, block mixed content,
        // and enable geolocation prompt delegation (default remains deny until shell grants)
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setGeolocationEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        if (holder.isPrivate) {
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            try {
                settings.setSaveFormData(false);
            } catch (Throwable ignored) {
            }
            webView.clearFormData();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            }
        } else if (holder.lightModeEnabled && "LOAD_CACHE_ELSE_NETWORK".equalsIgnoreCase(holder.lightModeCacheMode)) {
            settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        } else if (holder.lightModeEnabled && "LOAD_NO_CACHE".equalsIgnoreCase(holder.lightModeCacheMode)) {
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        } else if (holder.lightModeEnabled && "LOAD_CACHE_ONLY".equalsIgnoreCase(holder.lightModeCacheMode)) {
            settings.setCacheMode(WebSettings.LOAD_CACHE_ONLY);
        } else {
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        }

        if (!holder.isPrivate) {
            try {
                settings.setSaveFormData(true);
            } catch (Throwable ignored) {
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
            }
        }

        settings.setBlockNetworkImage(holder.lightModeEnabled && holder.lightModeBlockNetworkImage);

        // Viewport & Zoom
        boolean isDesktop = "desktop".equalsIgnoreCase(holder.siteMode);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(Math.max(50, Math.min(200, holder.zoomLevel)));

        // Multi-window support (popup handling via WebChromeClient.onCreateWindow with user gesture gate)
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(holder.lightModeEnabled && holder.lightModeBlockMediaPreload);

        settings.setUserAgentString(isDesktop ? DESKTOP_USER_AGENT : MOBILE_USER_AGENT);
    }

    public void selectTab(final String tabId, final boolean isPrivate) {
        if (tabId == null || tabId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            String previousTabId = this.activeTabId;
            this.activeTabId = tabId;

            if (previousTabId != null && !previousTabId.equals(tabId)) {
                TabWebViewHolder prevHolder = tabHolders.get(previousTabId);
                if (prevHolder != null && prevHolder.webView != null) {
                    prevHolder.webView.onPause();
                    prevHolder.webView.setVisibility(View.GONE);
                }
            }

            if (isPrivate && !this.privateProfileIsolationActive) {
                if (contentContainer != null) {
                    contentContainer.setVisibility(View.GONE);
                }
                return;
            }

            TabWebViewHolder existingHolder = tabHolders.get(tabId);
            if (existingHolder != null && (existingHolder.renderProcessGone || existingHolder.needsCrashReloadOnShow)) {
                recoverCrashedTabOnShowOnUiThread(existingHolder);
                return;
            }

            TabWebViewHolder currHolder = ensureTabHolderOnUiThread(tabId, isPrivate);
            if (currHolder.webView != null) {
                boolean hasContentOrLoading = !currHolder.currentUrl.isEmpty() || currHolder.isLoading;
                if (isViewportVisible && hasContentOrLoading) {
                    currHolder.webView.setVisibility(View.VISIBLE);
                    currHolder.webView.onResume();
                    if (contentContainer != null) {
                        contentContainer.setVisibility(View.VISIBLE);
                    }
                } else {
                    currHolder.webView.setVisibility(View.GONE);
                }
                emitTabStateEvent("onTabSwitched", currHolder);
            }
        });
    }

    private void recoverCrashedTabOnShowOnUiThread(TabWebViewHolder holder) {
        if (holder == null) return;
        long now = System.currentTimeMillis();
        boolean isRepeatedCrashInWindow = holder.consecutiveRenderCrashCount > MAX_RENDER_CRASH_AUTO_RELOADS
                && (now - holder.lastRenderCrashTimestampMs) <= RENDER_CRASH_LOOP_WINDOW_MS;

        if (isRepeatedCrashInWindow) {
            holder.needsCrashReloadOnShow = false;
            if (contentContainer != null) {
                contentContainer.setVisibility(View.GONE);
            }
            JSONObject errEv = new JSONObject();
            try {
                errEv.put("tabId", holder.tabId);
                errEv.put("errorCode", -15);
                errEv.put("errorKind", "generic");
                errEv.put("description", "Webpage renderer crashed repeatedly. Automatic reload was stopped to prevent a crash loop.");
                errEv.put("failingUrl", !holder.lastCommittedUrl.isEmpty() ? holder.lastCommittedUrl : holder.currentUrl);
                errEv.put("isForMainFrame", true);
                errEv.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onReceivedError", errEv);
            return;
        }

        // Never auto-reload a POST request after renderer termination
        if ("POST".equalsIgnoreCase(holder.lastHttpMethod)) {
            holder.needsCrashReloadOnShow = false;
            if (contentContainer != null) {
                contentContainer.setVisibility(View.GONE);
            }
            JSONObject errEv = new JSONObject();
            try {
                errEv.put("tabId", holder.tabId);
                errEv.put("errorCode", -15);
                errEv.put("errorKind", "generic");
                errEv.put("description", "Form submission (POST) tab was not automatically reloaded after renderer termination to prevent duplicate submission.");
                errEv.put("failingUrl", !holder.lastCommittedUrl.isEmpty() ? holder.lastCommittedUrl : holder.currentUrl);
                errEv.put("isForMainFrame", true);
                errEv.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onReceivedError", errEv);
            return;
        }

        String reloadUrl = !holder.lastCommittedUrl.isEmpty() ? holder.lastCommittedUrl : holder.currentUrl;
        holder.needsCrashReloadOnShow = false;
        ensureTabHolderOnUiThread(holder.tabId, holder.isPrivate);
        if (holder.webView != null && reloadUrl != null && !reloadUrl.isEmpty() && evaluateUrlSafety(reloadUrl).isSafe) {
            holder.requestEpoch.incrementAndGet();
            holder.isLoading = true;
            if (isViewportVisible && holder.tabId.equals(activeTabId)) {
                holder.webView.setVisibility(View.VISIBLE);
                holder.webView.onResume();
                if (contentContainer != null) {
                    contentContainer.setVisibility(View.VISIBLE);
                }
            }
            holder.webView.loadUrl(reloadUrl);
            emitTabStateEvent("onTabSwitched", holder);
        }
    }

    public void closeTab(final String tabId) {
        if (tabId == null) return;
        runOnUiThread(() -> {
            cancelPendingInteractiveRequestsForTabOnUiThread(tabId);
            downloadManager.onTabClosed(tabId);
            TabWebViewHolder holder = tabHolders.remove(tabId);
            if (holder != null) {
                boolean wasPrivate = holder.isPrivate;
                destroyPendingTransportWebViews(holder);
                destroyWebViewInstance(holder.webView);
                holder.webView = null;

                if (wasPrivate && !hasAnyOpenPrivateTabOnUiThread()) {
                    schedulePrivateProfileDeletionAfterDestroyOnUiThread();
                }
            }
            if (tabId.equals(activeFullscreenTabId)) {
                exitCustomFullscreenView();
            }
            if (tabId.equals(activeTabId)) {
                activeTabId = null;
            }
            JSONObject ev = new JSONObject();
            try {
                ev.put("tabId", tabId);
            } catch (JSONException ignored) {
            }
            emitEvent("onTabClosed", ev);
        });
    }

    private void destroyPendingTransportWebViews(TabWebViewHolder holder) {
        if (holder == null) return;
        for (WebView transportView : holder.pendingTransportWebViews) {
            destroyWebViewInstance(transportView);
        }
        holder.pendingTransportWebViews.clear();
    }

    private void destroyWebViewInstance(WebView webView) {
        if (webView == null) return;
        // Guarantee every created WebView is destroyed at most once (must run on UI thread)
        if (!destroyedWebViews.add(webView)) {
            return;
        }
        try {
            webView.setWebChromeClient(null);
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.stopLoading();
            webView.onPause();
            webView.clearHistory();
            webView.clearFormData();
            webView.clearCache(false);
            webView.removeAllViews();
            webView.destroy();
        } catch (Exception ignored) {
        }
    }

    // -------------------------------------------------------------------------
    // 2. Navigation & Browser Controls
    // -------------------------------------------------------------------------

    public void loadUrl(
            final String tabId,
            final String rawUrl,
            final boolean isPrivate,
            final String siteMode,
            final int zoomLevel,
            final boolean javascriptAllowed,
            final boolean popupsAllowed,
            final long requestEpoch
    ) {
        if (tabId == null || rawUrl == null) return;
        final String trimmedUrl = rawUrl.trim();
        runOnUiThread(() -> {
            if (isPrivate && !this.privateProfileIsolationActive) {
                if (contentContainer != null && tabId.equals(activeTabId)) {
                    contentContainer.setVisibility(View.GONE);
                }
                return;
            }

            // Pre-validate URL safety before dispatching to Chromium WebView
            UrlSafetyResult safety = evaluateUrlSafety(trimmedUrl);
            if (!safety.isSafe) {
                JSONObject errEv = new JSONObject();
                try {
                    errEv.put("tabId", tabId);
                    errEv.put("errorCode", -10);
                    errEv.put("errorKind", safety.isSsrf ? "security_ssrf" : "generic");
                    errEv.put("description", safety.reason);
                    errEv.put("failingUrl", trimmedUrl);
                    errEv.put("isForMainFrame", true);
                    errEv.put("requestEpoch", requestEpoch);
                } catch (JSONException ignored) {
                }
                emitEvent("onReceivedError", errEv);
                return;
            }

            // Google Sign-In / OAuth external browser boundary check
            if (isGoogleAuthUrl(trimmedUrl)) {
                emitExternalAuthRequired(tabId, trimmedUrl, "Google Sign-In / OAuth requires external system browser.");
                return;
            }

            TabWebViewHolder holder = ensureTabHolderOnUiThread(tabId, isPrivate);
            cancelPendingInteractiveRequestsForTabOnUiThread(tabId);
            holder.siteMode = siteMode != null ? siteMode : holder.siteMode;
            holder.zoomLevel = zoomLevel > 0 ? zoomLevel : holder.zoomLevel;
            holder.javascriptAllowed = javascriptAllowed;
            holder.popupsAllowed = popupsAllowed;
            if (requestEpoch > 0) {
                holder.requestEpoch.set(requestEpoch);
            } else {
                holder.requestEpoch.incrementAndGet();
            }

            applyTabWebSettings(holder);
            holder.currentUrl = trimmedUrl;
            holder.lastHttpMethod = "GET";
            holder.isLoading = true;

            if (activeTabId == null) {
                activeTabId = tabId;
            }
            if (tabId.equals(activeTabId)) {
                holder.webView.setVisibility(View.VISIBLE);
                holder.webView.onResume();
                if (contentContainer != null) {
                    contentContainer.setVisibility(View.VISIBLE);
                }
            } else {
                holder.webView.setVisibility(View.GONE);
            }

            holder.webView.loadUrl(trimmedUrl);
        });
    }

    public void reload(final String tabId) {
        runOnUiThread(() -> {
            cancelPendingInteractiveRequestsForTabOnUiThread(tabId);
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder == null) return;
            if (holder.renderProcessGone || holder.webView == null) {
                String urlToRecover = holder.currentUrl;
                ensureTabHolderOnUiThread(tabId, holder.isPrivate);
                if (urlToRecover != null && !urlToRecover.isEmpty()) {
                    holder.webView.loadUrl(urlToRecover);
                }
                return;
            }
            holder.requestEpoch.incrementAndGet();
            holder.isLoading = true;
            holder.webView.reload();
        });
    }

    public void stopLoading(final String tabId) {
        runOnUiThread(() -> {
            cancelPendingInteractiveRequestsForTabOnUiThread(tabId);
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null && holder.webView != null) {
                holder.requestEpoch.incrementAndGet();
                holder.isLoading = false;
                holder.webView.stopLoading();
                emitTabStateEvent("onLoadStopped", holder);
            }
        });
    }

    public void goBack(final String tabId) {
        runOnUiThread(() -> {
            cancelPendingInteractiveRequestsForTabOnUiThread(tabId);
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null && holder.webView != null && holder.webView.canGoBack()) {
                holder.requestEpoch.incrementAndGet();
                holder.lastHttpMethod = "GET";
                holder.webView.goBack();
                emitTabStateEvent("onHistoryNavigation", holder);
            }
        });
    }

    public void goForward(final String tabId) {
        runOnUiThread(() -> {
            cancelPendingInteractiveRequestsForTabOnUiThread(tabId);
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null && holder.webView != null && holder.webView.canGoForward()) {
                holder.requestEpoch.incrementAndGet();
                holder.lastHttpMethod = "GET";
                holder.webView.goForward();
                emitTabStateEvent("onHistoryNavigation", holder);
            }
        });
    }

    public void findInPage(final String tabId, final String query) {
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null && holder.webView != null) {
                if (query == null || query.trim().isEmpty()) {
                    holder.webView.clearMatches();
                } else {
                    holder.webView.findAllAsync(query.trim());
                }
            }
        });
    }

    public void findNext(final String tabId, final boolean forward) {
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null && holder.webView != null) {
                holder.webView.findNext(forward);
            }
        });
    }

    public void clearFindMatches(final String tabId) {
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null && holder.webView != null) {
                holder.webView.clearMatches();
            }
        });
    }

    public void setZoomLevel(final String tabId, final int zoomLevel) {
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null) {
                holder.zoomLevel = Math.max(50, Math.min(200, zoomLevel));
                if (holder.webView != null) {
                    holder.webView.getSettings().setTextZoom(holder.zoomLevel);
                }
            }
        });
    }

    public void setSiteMode(final String tabId, final String siteMode, final boolean reloadNow) {
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder != null) {
                holder.siteMode = siteMode != null ? siteMode : "default";
                applyTabWebSettings(holder);
                if (reloadNow && holder.webView != null && !holder.currentUrl.isEmpty()) {
                    holder.webView.reload();
                }
            }
        });
    }

    public void setLightMode(final String tabId, final JSONObject policy) {
        if (tabId == null || tabId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder == null) return;
            if (policy == null) {
                holder.lightModeEnabled = false;
                holder.lightModeBlockNetworkImage = false;
                holder.lightModeBlockWebFonts = false;
                holder.lightModeBlockMediaPreload = false;
                holder.lightModeBlockTrackers = false;
                holder.lightModeCacheMode = "LOAD_DEFAULT";
            } else {
                holder.lightModeBlockNetworkImage = policy.optBoolean("blockNetworkImage", false);
                holder.lightModeBlockWebFonts = policy.optBoolean("blockWebFonts", true);
                holder.lightModeBlockMediaPreload = policy.optBoolean("blockMediaPreload", true);
                holder.lightModeBlockTrackers = policy.optBoolean("blockThirdPartyTrackers", true);
                holder.lightModeCacheMode = policy.optString("cacheMode", "LOAD_CACHE_ELSE_NETWORK");
                // Part 3 invariant: JavaScript is NEVER disabled by Light Mode
                holder.lightModeEnabled = holder.lightModeBlockNetworkImage
                        || holder.lightModeBlockWebFonts
                        || holder.lightModeBlockMediaPreload
                        || holder.lightModeBlockTrackers
                        || "LOAD_CACHE_ELSE_NETWORK".equalsIgnoreCase(holder.lightModeCacheMode);
            }
            applyTabWebSettings(holder);
        });
    }

    // -------------------------------------------------------------------------
    // 2b. Interactive Contract Resolution Commands (Part 1)
    // -------------------------------------------------------------------------

    private PendingInteractiveRequest claimPendingRequestOnUiThread(String requestId) {
        if (requestId == null || requestId.trim().isEmpty()) return null;
        PendingInteractiveRequest pending = pendingInteractiveRequests.remove(requestId.trim());
        if (pending == null) return null;
        if (!pending.resolved.compareAndSet(false, true)) {
            return null;
        }
        if (pending.timeoutRunnable != null) {
            mainHandler.removeCallbacks(pending.timeoutRunnable);
            pending.timeoutRunnable = null;
        }
        return pending;
    }

    private void registerPendingRequestOnUiThread(final PendingInteractiveRequest pending) {
        if (pending == null || pending.requestId == null) return;
        pendingInteractiveRequests.put(pending.requestId, pending);
        Runnable timeoutTask = () -> denyOrCancelPendingRequestOnUiThread(pending.requestId);
        pending.timeoutRunnable = timeoutTask;
        mainHandler.postDelayed(timeoutTask, INTERACTIVE_REQUEST_TIMEOUT_MS);
    }

    private void denyOrCancelPendingRequestOnUiThread(String requestId) {
        PendingInteractiveRequest pending = claimPendingRequestOnUiThread(requestId);
        if (pending == null) return;
        executeDefaultDenyOnUiThread(pending);
    }

    private void executeDefaultDenyOnUiThread(PendingInteractiveRequest pending) {
        if (pending == null) return;
        try {
            switch (pending.kind) {
                case "permission":
                    if (pending.permissionRequest != null) {
                        pending.permissionRequest.deny();
                    }
                    break;
                case "geolocation":
                    if (pending.geolocationCallback != null) {
                        pending.geolocationCallback.invoke(
                                pending.geolocationOrigin != null ? pending.geolocationOrigin : "",
                                false,
                                false
                        );
                    }
                    break;
                case "fileChooser":
                    if (pending.filePathCallback != null) {
                        pending.filePathCallback.onReceiveValue(null);
                    }
                    break;
                case "jsPrompt":
                    if (pending.jsPromptResult != null) {
                        pending.jsPromptResult.cancel();
                    } else if (pending.jsResult != null) {
                        pending.jsResult.cancel();
                    }
                    break;
                case "jsAlert":
                case "jsConfirm":
                case "jsBeforeUnload":
                    if (pending.jsResult != null) {
                        pending.jsResult.cancel();
                    }
                    break;
                case "httpAuth":
                    if (pending.httpAuthHandler != null) {
                        pending.httpAuthHandler.cancel();
                    }
                    break;
                default:
                    break;
            }
        } catch (Exception ignored) {
        }
    }

    private void cancelPendingInteractiveRequestsForTabOnUiThread(String tabId) {
        if (tabId == null) return;
        List<String> matchingIds = new ArrayList<>();
        for (Map.Entry<String, PendingInteractiveRequest> entry : pendingInteractiveRequests.entrySet()) {
            PendingInteractiveRequest req = entry.getValue();
            if (req != null && tabId.equals(req.tabId)) {
                matchingIds.add(entry.getKey());
            }
        }
        for (String reqId : matchingIds) {
            denyOrCancelPendingRequestOnUiThread(reqId);
        }
        List<Integer> matchingOsCodes = new ArrayList<>();
        for (Map.Entry<Integer, PendingInteractiveRequest> entry : pendingOsPermissionRequests.entrySet()) {
            PendingInteractiveRequest req = entry.getValue();
            if (req != null && tabId.equals(req.tabId)) {
                matchingOsCodes.add(entry.getKey());
            }
        }
        for (Integer code : matchingOsCodes) {
            denyOrCancelPendingOsPermissionRequestOnUiThread(code);
        }
    }

    private void cancelAllPendingInteractiveRequestsOnUiThread() {
        List<String> allIds = new ArrayList<>(pendingInteractiveRequests.keySet());
        for (String reqId : allIds) {
            denyOrCancelPendingRequestOnUiThread(reqId);
        }
        List<Integer> allOsCodes = new ArrayList<>(pendingOsPermissionRequests.keySet());
        for (Integer code : allOsCodes) {
            denyOrCancelPendingOsPermissionRequestOnUiThread(code);
        }
        if (activeFileUploadCallback != null) {
            try {
                activeFileUploadCallback.onReceiveValue(null);
            } catch (Exception ignored) {
            }
            activeFileUploadCallback = null;
        }
    }

    private boolean hasOsPermission(String androidPermission) {
        if (activity == null || androidPermission == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return activity.checkSelfPermission(androidPermission) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private boolean hasLocationOsPermission() {
        return hasOsPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                || hasOsPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private int allocateOsPermissionRequestCode() {
        int code = nextOsPermRequestCode.getAndIncrement();
        if (code > OS_PERMISSION_REQUEST_CODE_MAX) {
            nextOsPermRequestCode.set(OS_PERMISSION_REQUEST_CODE_BASE + 1);
            code = OS_PERMISSION_REQUEST_CODE_BASE;
        }
        return code;
    }

    private void registerPendingOsPermissionRequestOnUiThread(
            final int requestCode,
            final PendingInteractiveRequest pending
    ) {
        if (pending == null) return;
        pending.osPermissionRequestCode = requestCode;
        pending.resolved.set(false);
        pendingOsPermissionRequests.put(requestCode, pending);
        Runnable timeoutTask = () -> denyOrCancelPendingOsPermissionRequestOnUiThread(requestCode);
        pending.timeoutRunnable = timeoutTask;
        mainHandler.postDelayed(timeoutTask, INTERACTIVE_REQUEST_TIMEOUT_MS);
    }

    private PendingInteractiveRequest claimPendingOsPermissionRequestOnUiThread(int requestCode) {
        PendingInteractiveRequest pending = pendingOsPermissionRequests.remove(requestCode);
        if (pending == null) return null;
        if (!pending.resolved.compareAndSet(false, true)) {
            return null;
        }
        if (pending.timeoutRunnable != null) {
            mainHandler.removeCallbacks(pending.timeoutRunnable);
            pending.timeoutRunnable = null;
        }
        return pending;
    }

    private void denyOrCancelPendingOsPermissionRequestOnUiThread(int requestCode) {
        PendingInteractiveRequest pending = claimPendingOsPermissionRequestOnUiThread(requestCode);
        if (pending == null) return;
        executeDefaultDenyOnUiThread(pending);
    }

    public void resolvePermission(final String requestId, final List<String> grantedResources) {
        runOnUiThread(() -> {
            PendingInteractiveRequest pending = claimPendingRequestOnUiThread(requestId);
            if (pending == null) return;
            TabWebViewHolder holder = pending.tabId != null ? tabHolders.get(pending.tabId) : null;
            if (holder == null || holder.requestEpoch.get() != pending.epoch) {
                executeDefaultDenyOnUiThread(pending);
                return;
            }
            Set<String> grantedSet = new HashSet<>();
            if (grantedResources != null) {
                for (String r : grantedResources) {
                    if (r != null) {
                        grantedSet.add(r.trim().toLowerCase(Locale.ROOT));
                    }
                }
            }
            try {
                if ("geolocation".equals(pending.kind)) {
                    if (pending.geolocationCallback != null) {
                        boolean allowGeo = grantedSet.contains("geolocation");
                        if (!allowGeo) {
                            pending.geolocationCallback.invoke(
                                    pending.geolocationOrigin != null ? pending.geolocationOrigin : "",
                                    false,
                                    false
                            );
                            return;
                        }
                        if (hasLocationOsPermission()) {
                            pending.geolocationCallback.invoke(
                                    pending.geolocationOrigin != null ? pending.geolocationOrigin : "",
                                    true,
                                    false
                            );
                            return;
                        }
                        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            int reqCode = allocateOsPermissionRequestCode();
                            registerPendingOsPermissionRequestOnUiThread(reqCode, pending);
                            activity.requestPermissions(
                                    new String[]{
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                    },
                                    reqCode
                            );
                        } else {
                            pending.geolocationCallback.invoke(
                                    pending.geolocationOrigin != null ? pending.geolocationOrigin : "",
                                    false,
                                    false
                            );
                        }
                    }
                    return;
                }
                if ("permission".equals(pending.kind) && pending.permissionRequest != null) {
                    // Unknown resources are ALWAYS denied; camera, microphone, and protectedMedia require explicit shell approval
                    String[] requestedNative = pending.permissionRequest.getResources();
                    List<String> approvedNative = new ArrayList<>();
                    if (requestedNative != null) {
                        for (String nativeRes : requestedNative) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(nativeRes) && grantedSet.contains("camera")) {
                                approvedNative.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(nativeRes) && grantedSet.contains("microphone")) {
                                approvedNative.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                            } else if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(nativeRes)
                                    && (grantedSet.contains("protectedmedia") || grantedSet.contains("protected_media"))) {
                                approvedNative.add(PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID);
                            }
                        }
                    }
                    if (approvedNative.isEmpty()) {
                        pending.permissionRequest.deny();
                        return;
                    }
                    List<String> missingOsPerms = new ArrayList<>();
                    for (String nativeRes : approvedNative) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(nativeRes)
                                && !hasOsPermission(Manifest.permission.CAMERA)) {
                            if (!missingOsPerms.contains(Manifest.permission.CAMERA)) {
                                missingOsPerms.add(Manifest.permission.CAMERA);
                            }
                        } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(nativeRes)
                                && !hasOsPermission(Manifest.permission.RECORD_AUDIO)) {
                            if (!missingOsPerms.contains(Manifest.permission.RECORD_AUDIO)) {
                                missingOsPerms.add(Manifest.permission.RECORD_AUDIO);
                            }
                        }
                    }
                    if (missingOsPerms.isEmpty()) {
                        pending.permissionRequest.grant(approvedNative.toArray(new String[0]));
                        return;
                    }
                    if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        pending.shellApprovedNativeResources = approvedNative;
                        int reqCode = allocateOsPermissionRequestCode();
                        registerPendingOsPermissionRequestOnUiThread(reqCode, pending);
                        activity.requestPermissions(missingOsPerms.toArray(new String[0]), reqCode);
                    } else {
                        pending.permissionRequest.deny();
                    }
                }
            } catch (Exception ignored) {
                executeDefaultDenyOnUiThread(pending);
            }
        });
    }

    public void onRequestPermissionsResult(
            final int requestCode,
            final String[] permissions,
            final int[] grantResults
    ) {
        runOnUiThread(() -> {
            PendingInteractiveRequest pending = claimPendingOsPermissionRequestOnUiThread(requestCode);
            if (pending == null) return;
            TabWebViewHolder holder = pending.tabId != null ? tabHolders.get(pending.tabId) : null;
            if (holder == null || holder.requestEpoch.get() != pending.epoch) {
                executeDefaultDenyOnUiThread(pending);
                return;
            }
            try {
                if ("geolocation".equals(pending.kind)) {
                    if (pending.geolocationCallback != null) {
                        boolean osGranted = hasLocationOsPermission();
                        pending.geolocationCallback.invoke(
                                pending.geolocationOrigin != null ? pending.geolocationOrigin : "",
                                osGranted,
                                false
                        );
                    }
                    return;
                }
                if ("permission".equals(pending.kind) && pending.permissionRequest != null) {
                    List<String> finalGrantedNative = new ArrayList<>();
                    if (pending.shellApprovedNativeResources != null) {
                        for (String nativeRes : pending.shellApprovedNativeResources) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(nativeRes)
                                    && hasOsPermission(Manifest.permission.CAMERA)) {
                                finalGrantedNative.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(nativeRes)
                                    && hasOsPermission(Manifest.permission.RECORD_AUDIO)) {
                                finalGrantedNative.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                            } else if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(nativeRes)) {
                                finalGrantedNative.add(PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID);
                            }
                        }
                    }
                    if (!finalGrantedNative.isEmpty()) {
                        pending.permissionRequest.grant(finalGrantedNative.toArray(new String[0]));
                    } else {
                        pending.permissionRequest.deny();
                    }
                }
            } catch (Exception ignored) {
                executeDefaultDenyOnUiThread(pending);
            }
        });
    }

    public void resolveFileChooser(final String requestId, final boolean allow) {
        runOnUiThread(() -> {
            PendingInteractiveRequest pending = claimPendingRequestOnUiThread(requestId);
            if (pending == null || !"fileChooser".equals(pending.kind) || pending.filePathCallback == null) {
                return;
            }
            if (!allow) {
                try {
                    pending.filePathCallback.onReceiveValue(null);
                } catch (Exception ignored) {
                }
                return;
            }
            if (activeFileUploadCallback != null) {
                try {
                    activeFileUploadCallback.onReceiveValue(null);
                } catch (Exception ignored) {
                }
                activeFileUploadCallback = null;
            }
            activeFileUploadCallback = pending.filePathCallback;
            try {
                Intent chooserIntent = null;
                boolean allowMultiple = false;
                if (pending.fileChooserParams != null) {
                    allowMultiple = pending.fileChooserParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
                    chooserIntent = pending.fileChooserParams.createIntent();
                }
                if (chooserIntent == null) {
                    chooserIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    chooserIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    chooserIntent.setType("*/*");
                }
                if (allowMultiple) {
                    chooserIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                activity.startActivityForResult(
                        Intent.createChooser(chooserIntent, "Select File"),
                        FILE_CHOOSER_REQUEST_CODE
                );
            } catch (Exception e) {
                ValueCallback<Uri[]> cb = activeFileUploadCallback;
                activeFileUploadCallback = null;
                if (cb != null) {
                    try {
                        cb.onReceiveValue(null);
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    public void onFileChooserActivityResult(final int resultCode, final Intent data) {
        runOnUiThread(() -> {
            ValueCallback<Uri[]> cb = activeFileUploadCallback;
            activeFileUploadCallback = null;
            if (cb == null) return;
            Uri[] results = null;
            try {
                if (resultCode == Activity.RESULT_OK && data != null) {
                    ClipData clipData = data.getClipData();
                    if (clipData != null && clipData.getItemCount() > 0) {
                        List<Uri> uris = new ArrayList<>();
                        for (int i = 0; i < clipData.getItemCount(); i++) {
                            ClipData.Item item = clipData.getItemAt(i);
                            Uri u = item != null ? item.getUri() : null;
                            if (u != null && !"file".equalsIgnoreCase(u.getScheme())) {
                                uris.add(u);
                            }
                        }
                        if (!uris.isEmpty()) {
                            results = uris.toArray(new Uri[0]);
                        }
                    } else {
                        Uri[] parsed = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                        if (parsed != null) {
                            List<Uri> safeUris = new ArrayList<>();
                            for (Uri u : parsed) {
                                if (u != null && !"file".equalsIgnoreCase(u.getScheme())) {
                                    safeUris.add(u);
                                }
                            }
                            if (!safeUris.isEmpty()) {
                                results = safeUris.toArray(new Uri[0]);
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
            }
            try {
                cb.onReceiveValue(results);
            } catch (Exception ignored) {
            }
        });
    }

    public void resolveJsDialog(final String requestId, final boolean confirmed, final String value) {
        runOnUiThread(() -> {
            PendingInteractiveRequest pending = claimPendingRequestOnUiThread(requestId);
            if (pending == null) return;
            try {
                if ("jsPrompt".equals(pending.kind) && pending.jsPromptResult != null) {
                    if (confirmed) {
                        pending.jsPromptResult.confirm(value != null ? value : "");
                    } else {
                        pending.jsPromptResult.cancel();
                    }
                } else if (pending.jsResult != null) {
                    if (confirmed) {
                        pending.jsResult.confirm();
                    } else {
                        pending.jsResult.cancel();
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    public void resolveHttpAuth(
            final String requestId,
            final boolean proceed,
            final String username,
            final String password
    ) {
        runOnUiThread(() -> {
            PendingInteractiveRequest pending = claimPendingRequestOnUiThread(requestId);
            if (pending == null || !"httpAuth".equals(pending.kind) || pending.httpAuthHandler == null) {
                return;
            }
            try {
                if (proceed && username != null && password != null) {
                    // Credentials travel in memory only; never logged or stored
                    pending.httpAuthHandler.proceed(username, password);
                } else {
                    pending.httpAuthHandler.cancel();
                }
            } catch (Exception ignored) {
            }
        });
    }

    public void resolveDownload(final String requestId, final boolean allow, final String fileName) {
        downloadManager.resolveDownload(requestId, allow, fileName);
    }

    public void cancelDownload(final String downloadId) {
        downloadManager.cancelDownload(downloadId);
    }

    public void openDownload(final String downloadId) {
        downloadManager.openDownload(downloadId);
    }

    public void deleteDownload(final String downloadId) {
        downloadManager.deleteDownload(downloadId);
    }

    public void reconcileDownloads(final List<String> downloadIds) {
        downloadManager.reconcileDownloads(downloadIds);
    }

    public void requestImageDownload(final String tabId, final String rawImageUrl) {
        if (tabId == null || rawImageUrl == null) return;
        runOnUiThread(() -> {
            TabWebViewHolder holder = tabHolders.get(tabId);
            if (holder == null || holder.isPrivate) return;
            String safeImageUrl = sanitizeHttpOrHttpsContextMenuUrl(rawImageUrl);
            if (safeImageUrl == null) return;
            String effectiveUserAgent = (holder.webView != null && holder.webView.getSettings() != null)
                    ? holder.webView.getSettings().getUserAgentString()
                    : MOBILE_USER_AGENT;
            String guessedMime = inferImageMimeTypeFromUrl(safeImageUrl);
            downloadManager.onDownloadStart(
                    holder.tabId,
                    false,
                    holder.currentUrl,
                    safeImageUrl,
                    effectiveUserAgent,
                    null,
                    guessedMime,
                    0L
            );
        });
    }

    private static String inferImageMimeTypeFromUrl(String rawUrl) {
        if (rawUrl == null) return "image/jpeg";
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String path = uri.getPath() != null ? uri.getPath().toLowerCase(Locale.ROOT) : "";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".webp")) return "image/webp";
            if (path.endsWith(".gif")) return "image/gif";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".avif")) return "image/avif";
            if (path.endsWith(".bmp")) return "image/bmp";
            if (path.endsWith(".ico")) return "image/x-icon";
        } catch (Exception ignored) {
        }
        return "image/jpeg";
    }

    public void setViewportBounds(
            final int leftCssPx,
            final int topCssPx,
            final int widthCssPx,
            final int heightCssPx,
            final boolean visible
    ) {
        runOnUiThread(() -> applyViewportBoundsOnUiThread(leftCssPx, topCssPx, widthCssPx, heightCssPx, visible));
    }

    private void applyViewportBoundsOnUiThread(
            final int leftCssPx,
            final int topCssPx,
            final int widthCssPx,
            final int heightCssPx,
            final boolean visible
    ) {
        this.viewportLeftCssPx = Math.max(0, leftCssPx);
        this.viewportTopCssPx = Math.max(0, topCssPx);
        this.viewportWidthCssPx = widthCssPx;
        this.viewportHeightCssPx = heightCssPx;
        this.isViewportVisible = visible;

        if (contentContainer == null) return;

        // Convert CSS pixels (from getBoundingClientRect in the shell WebView) to physical device pixels
        // using DisplayMetrics.density, and offset relative to the shell WebView's origin inside the parent.
        DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
        float density = (metrics != null && metrics.density > 0f) ? metrics.density : 1.0f;

        int shellOffsetX = 0;
        int shellOffsetY = 0;
        View shellWebView = this.shellWebViewRef;
        View parentView = contentContainer.getParent() instanceof View
                ? (View) contentContainer.getParent()
                : null;
        if (shellWebView != null && parentView != null) {
            int[] shellLoc = new int[2];
            int[] parentLoc = new int[2];
            shellWebView.getLocationInWindow(shellLoc);
            parentView.getLocationInWindow(parentLoc);
            shellOffsetX = shellLoc[0] - parentLoc[0];
            shellOffsetY = shellLoc[1] - parentLoc[1];
        }

        int clampedCssLeft = Math.max(0, leftCssPx);
        int clampedCssTop = Math.max(0, topCssPx);
        int clampedCssWidth = Math.max(0, widthCssPx);
        int clampedCssHeight = Math.max(0, heightCssPx);

        this.viewportWidthCssPx = clampedCssWidth;
        this.viewportHeightCssPx = clampedCssHeight;

        int physicalLeftPx = Math.max(0, shellOffsetX + Math.round(clampedCssLeft * density));
        int physicalTopPx = Math.max(0, shellOffsetY + Math.round(clampedCssTop * density));
        int physicalWidthPx = Math.max(0, Math.round(clampedCssWidth * density));
        int physicalHeightPx = Math.max(0, Math.round(clampedCssHeight * density));

        // Mutate existing LayoutParams in place without replacing one layout type's params with another
        ViewGroup.LayoutParams rawLp = contentContainer.getLayoutParams();
        if (rawLp instanceof FrameLayout.LayoutParams) {
            FrameLayout.LayoutParams flp = (FrameLayout.LayoutParams) rawLp;
            flp.width = physicalWidthPx;
            flp.height = physicalHeightPx;
            flp.leftMargin = physicalLeftPx;
            flp.topMargin = physicalTopPx;
            flp.gravity = Gravity.TOP | Gravity.START;
            contentContainer.setLayoutParams(flp);
        } else if (rawLp instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) rawLp;
            mlp.width = physicalWidthPx;
            mlp.height = physicalHeightPx;
            mlp.leftMargin = physicalLeftPx;
            mlp.topMargin = physicalTopPx;
            contentContainer.setLayoutParams(mlp);
        } else if (rawLp != null) {
            rawLp.width = physicalWidthPx;
            rawLp.height = physicalHeightPx;
            contentContainer.setLayoutParams(rawLp);
        }
        contentContainer.requestLayout();

        TabWebViewHolder activeHolder = activeTabId != null ? tabHolders.get(activeTabId) : null;
        if (visible && activeHolder != null && (activeHolder.renderProcessGone || activeHolder.needsCrashReloadOnShow)) {
            recoverCrashedTabOnShowOnUiThread(activeHolder);
            return;
        }

        boolean hasPositiveSize = physicalWidthPx > 0 && physicalHeightPx > 0;
        boolean hasContentOrLoading = (activeHolder != null)
                && (!activeHolder.currentUrl.isEmpty() || activeHolder.isLoading);
        boolean shouldShow = visible
                && hasPositiveSize
                && activeHolder != null
                && (!activeHolder.isPrivate || this.privateProfileIsolationActive)
                && activeHolder.webView != null
                && !activeHolder.renderProcessGone
                && hasContentOrLoading;

        contentContainer.setVisibility(shouldShow ? View.VISIBLE : View.GONE);
        if (activeHolder != null && activeHolder.webView != null) {
            activeHolder.webView.setVisibility(shouldShow ? View.VISIBLE : View.GONE);
        }
    }

    public void setWebViewVisible(final boolean visible) {
        runOnUiThread(() -> applyViewportBoundsOnUiThread(
                this.viewportLeftCssPx,
                this.viewportTopCssPx,
                this.viewportWidthCssPx,
                this.viewportHeightCssPx,
                visible
        ));
    }

    public void clearBrowsingData(
            final boolean clearCache,
            final boolean clearCookies,
            final boolean clearStorage,
            final boolean clearHistory
    ) {
        runOnUiThread(() -> {
            if (clearCookies) {
                CookieManager cm = CookieManager.getInstance();
                cm.removeAllCookies(null);
                cm.flush();
            }
            if (clearStorage) {
                WebStorage.getInstance().deleteAllData();
            }
            if (this.privateProfileIsolationActive && (clearCookies || clearStorage)) {
                try {
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                        ProfileStore store = ProfileStore.getInstance();
                        Profile privProfile = store != null ? store.getProfile(PRIVATE_PROFILE_NAME) : null;
                        if (privProfile != null) {
                            if (clearCookies && privProfile.getCookieManager() != null) {
                                privProfile.getCookieManager().removeAllCookies(null);
                                privProfile.getCookieManager().flush();
                            }
                            if (clearStorage && privProfile.getWebStorage() != null) {
                                privProfile.getWebStorage().deleteAllData();
                            }
                        }
                    }
                } catch (Throwable ignored) {
                }
                if (!hasAnyOpenPrivateTabOnUiThread()) {
                    schedulePrivateProfileDeletionAfterDestroyOnUiThread();
                }
            }
            for (TabWebViewHolder holder : tabHolders.values()) {
                if (holder.webView != null) {
                    if (clearCache) {
                        holder.webView.clearCache(true);
                    }
                    if (clearHistory) {
                        holder.webView.clearHistory();
                        holder.webView.clearFormData();
                    }
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // 3. Activity Lifecycle & Back Press Handling
    // -------------------------------------------------------------------------

    public void onHostResume() {
        runOnUiThread(() -> {
            if (activeTabId != null) {
                TabWebViewHolder active = tabHolders.get(activeTabId);
                if (active != null && active.webView != null) {
                    active.webView.onResume();
                    active.webView.resumeTimers();
                }
            }
        });
    }

    public void onHostPause() {
        runOnUiThread(() -> {
            if (activeTabId != null) {
                TabWebViewHolder active = tabHolders.get(activeTabId);
                if (active != null && active.webView != null) {
                    active.webView.onPause();
                }
            }
            CookieManager.getInstance().flush();
        });
    }

    public void onHostDestroy() {
        runOnUiThread(() -> {
            cancelAllPendingInteractiveRequestsOnUiThread();
            downloadManager.onHostDestroy();
            mainHandler.removeCallbacksAndMessages(null);
            try {
                if (networkCallback != null) {
                    ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
                    if (cm != null) {
                        cm.unregisterNetworkCallback(networkCallback);
                    }
                    networkCallback = null;
                }
            } catch (Exception ignored) {
            }
            exitCustomFullscreenView();
            for (TabWebViewHolder holder : tabHolders.values()) {
                destroyPendingTransportWebViews(holder);
                destroyWebViewInstance(holder.webView);
                holder.webView = null;
            }
            tabHolders.clear();
            schedulePrivateProfileDeletionAfterDestroyOnUiThread();
            dnsSafetyCache.clear();
            try {
                dnsLookupExecutor.shutdownNow();
            } catch (Exception ignored) {
            }
            shellWebViewRef = null;
            contentContainer = null;
            fullscreenContainer = null;
        });
    }

    public boolean handleBackPressed() {
        if (activeCustomView != null) {
            runOnUiThread(this::exitCustomFullscreenView);
            return true;
        }
        String currentTabId = activeTabId;
        if (currentTabId != null && isViewportVisible) {
            TabWebViewHolder active = tabHolders.get(currentTabId);
            if (active != null) {
                boolean canBack;
                if (Looper.myLooper() == Looper.getMainLooper()) {
                    canBack = active.webView != null && active.webView.canGoBack();
                } else {
                    canBack = active.canGoBackCached;
                }
                if (canBack) {
                    runOnUiThread(() -> {
                        if (active.webView != null && active.webView.canGoBack()) {
                            active.webView.goBack();
                            emitTabStateEvent("onHistoryNavigation", active);
                        }
                    });
                    return true;
                }
            }
        }
        return false;
    }

    private void exitCustomFullscreenView() {
        if (activeCustomView == null) return;
        try {
            if (fullscreenContainer != null) {
                fullscreenContainer.removeAllViews();
                fullscreenContainer.setVisibility(View.GONE);
            }
            if (activeCustomViewCallback != null) {
                activeCustomViewCallback.onCustomViewHidden();
            }
        } catch (Exception ignored) {
        } finally {
            String fsTab = activeFullscreenTabId;
            activeCustomView = null;
            activeCustomViewCallback = null;
            activeFullscreenTabId = null;
            if (fsTab != null) {
                JSONObject ev = new JSONObject();
                try {
                    ev.put("tabId", fsTab);
                } catch (JSONException ignored) {
                }
                emitEvent("onExitFullscreen", ev);
            }
        }
    }

    // -------------------------------------------------------------------------
    // 4. URL Safety, SSRF & External OAuth Helpers
    // -------------------------------------------------------------------------

    public static class UrlSafetyResult {
        public final boolean isSafe;
        public final boolean isSsrf;
        public final String reason;

        public UrlSafetyResult(boolean isSafe, boolean isSsrf, String reason) {
            this.isSafe = isSafe;
            this.isSsrf = isSsrf;
            this.reason = reason;
        }
    }

    public static UrlSafetyResult evaluateUrlSafety(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return new UrlSafetyResult(false, false, "Empty or invalid URL");
        }
        String trimmed = rawUrl.trim();
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (c <= 0x20 || c == 0x7F) {
                return new UrlSafetyResult(false, false, "Whitespace or control characters not allowed in URL");
            }
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);

        if (lower.startsWith("javascript:")
                || lower.startsWith("file:")
                || lower.startsWith("content:")
                || lower.startsWith("about:config")
                || lower.startsWith("data:text/html")
                || lower.startsWith("data:application")
                || lower.startsWith("blob:null")
                || lower.startsWith("vbscript:")) {
            return new UrlSafetyResult(false, false, "Blocked unsafe URL scheme");
        }

        if ("about:blank".equals(lower)) {
            return new UrlSafetyResult(true, false, null);
        }

        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            return new UrlSafetyResult(false, false, "Unsupported non-web scheme");
        }

        try {
            int schemeEnd = trimmed.indexOf("://");
            if (schemeEnd < 0) {
                return new UrlSafetyResult(false, false, "Missing scheme separator");
            }
            String afterScheme = trimmed.substring(schemeEnd + 3);
            if (afterScheme.isEmpty() || afterScheme.startsWith("/") || afterScheme.startsWith("\\")) {
                return new UrlSafetyResult(false, false, "Missing or ambiguous authority in URL");
            }

            int authEnd = afterScheme.length();
            for (int i = 0; i < afterScheme.length(); i++) {
                char c = afterScheme.charAt(i);
                if (c == '/' || c == '?' || c == '#') {
                    authEnd = i;
                    break;
                }
            }
            String rawAuthority = afterScheme.substring(0, authEnd);
            if (rawAuthority.isEmpty()) {
                return new UrlSafetyResult(false, false, "Missing authority in URL");
            }

            // Detect userinfo / backslash tricks (e.g. http://good.com@127.0.0.1 or http://good.com\@127.0.0.1)
            boolean hasBackslashInAuthority = rawAuthority.indexOf('\\') >= 0;
            String authorityNormalizedSep = rawAuthority.replace('\\', '@');
            int lastAt = authorityNormalizedSep.lastIndexOf('@');
            String hostPort = lastAt >= 0 ? authorityNormalizedSep.substring(lastAt + 1) : authorityNormalizedSep;

            if (lastAt >= 0) {
                String[] userinfoSegments = authorityNormalizedSep.substring(0, lastAt).split("@");
                for (String seg : userinfoSegments) {
                    String candidate = extractHostFromHostPort(seg);
                    if (candidate != null && !candidate.isEmpty()) {
                        String normCandidate = normalizeHostForSafety(candidate);
                        if (isPrivateOrReservedHostLiteralOrName(normCandidate)) {
                            return new UrlSafetyResult(
                                    false,
                                    true,
                                    "Blocked internal network or cloud metadata SSRF target"
                            );
                        }
                    }
                }
            }

            String extractedHost = extractHostFromHostPort(hostPort);
            if (extractedHost == null || extractedHost.isEmpty()) {
                return new UrlSafetyResult(false, false, "Missing or malformed hostname in URL");
            }

            String normalizedHost = normalizeHostForSafety(extractedHost);
            if (normalizedHost.isEmpty()) {
                return new UrlSafetyResult(false, false, "Missing hostname in URL");
            }

            if (isPrivateOrReservedHostLiteralOrName(normalizedHost)) {
                return new UrlSafetyResult(
                        false,
                        true,
                        "Blocked internal network or cloud metadata SSRF target"
                );
            }

            if (hasBackslashInAuthority) {
                return new UrlSafetyResult(false, false, "Blocked ambiguous backslash in URL authority");
            }

            // Cross-check android.net.Uri parser so no parser-differential can bypass host validation
            Uri uri = Uri.parse(trimmed);
            String uriHost = uri != null ? uri.getHost() : null;
            if (uriHost != null && !uriHost.trim().isEmpty()) {
                String normUriHost = normalizeHostForSafety(uriHost);
                if (!normUriHost.isEmpty() && isPrivateOrReservedHostLiteralOrName(normUriHost)) {
                    return new UrlSafetyResult(
                            false,
                            true,
                            "Blocked internal network or cloud metadata SSRF target"
                    );
                }
            }

            return new UrlSafetyResult(true, false, null);
        } catch (Exception e) {
            return new UrlSafetyResult(false, false, "Malformed target URL");
        }
    }

    private static String extractHostFromHostPort(String hostPort) {
        if (hostPort == null) return null;
        String trimmed = hostPort.trim();
        if (trimmed.isEmpty()) return null;
        if (trimmed.startsWith("[")) {
            int closeIdx = trimmed.indexOf(']');
            if (closeIdx <= 1) return null;
            String inside = trimmed.substring(1, closeIdx);
            String rest = trimmed.substring(closeIdx + 1);
            if (!rest.isEmpty()) {
                if (!rest.startsWith(":")) return null;
                String portStr = rest.substring(1);
                if (!isValidPortString(portStr)) return null;
            }
            return inside;
        }
        if (trimmed.indexOf('[') >= 0 || trimmed.indexOf(']') >= 0) {
            return null;
        }
        int firstColon = trimmed.indexOf(':');
        int lastColon = trimmed.lastIndexOf(':');
        if (firstColon >= 0) {
            if (firstColon != lastColon) {
                // Unbracketed IPv6 candidate
                return trimmed;
            }
            String portStr = trimmed.substring(firstColon + 1);
            if (!isValidPortString(portStr)) {
                return null;
            }
            return trimmed.substring(0, firstColon);
        }
        return trimmed;
    }

    private static boolean isValidPortString(String portStr) {
        if (portStr == null || portStr.isEmpty() || portStr.length() > 5) return false;
        for (int i = 0; i < portStr.length(); i++) {
            char c = portStr.charAt(i);
            if (c < '0' || c > '9') return false;
        }
        try {
            int p = Integer.parseInt(portStr);
            return p >= 1 && p <= 65535;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public static String normalizeHostForSafety(String rawHost) {
        if (rawHost == null) return "";
        String h = percentDecodeHostSafely(rawHost.trim()).toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]") && h.length() >= 2) {
            h = h.substring(1, h.length() - 1);
        }
        int zoneIdx = h.indexOf('%');
        if (zoneIdx > 0) {
            h = h.substring(0, zoneIdx);
        }
        while (h.endsWith(".")) {
            h = h.substring(0, h.length() - 1);
        }
        return h.trim();
    }

    private static String percentDecodeHostSafely(String input) {
        if (input == null || input.indexOf('%') < 0) return input != null ? input : "";
        StringBuilder sb = new StringBuilder(input.length());
        int i = 0;
        while (i < input.length()) {
            char c = input.charAt(i);
            if (c == '%' && i + 2 < input.length()) {
                int d1 = Character.digit(input.charAt(i + 1), 16);
                int d2 = Character.digit(input.charAt(i + 2), 16);
                if (d1 >= 0 && d2 >= 0) {
                    sb.append((char) ((d1 << 4) | d2));
                    i += 3;
                    continue;
                }
            }
            sb.append(c);
            i++;
        }
        return sb.toString();
    }

    public static boolean isPrivateOrReservedHostLiteralOrName(String rawHost) {
        String host = normalizeHostForSafety(rawHost);
        if (host.isEmpty()) return true;

        // 1. Localhost, cloud metadata, and internal/mDNS suffixes
        if ("localhost".equals(host)
                || host.endsWith(".localhost")
                || "metadata.google.internal".equals(host)
                || "metadata".equals(host)
                || "metadata.goog".equals(host)
                || host.endsWith(".google.internal")
                || "instance-data".equals(host)
                || "instance-data.ec2.internal".equals(host)
                || host.endsWith(".internal")
                || host.endsWith(".local")
                || host.endsWith(".home.arpa")
                || host.endsWith(".localdomain")
                || host.endsWith(".lan")) {
            return true;
        }

        // 2. Pure zero-DNS IPv6 literal parsing (loopback ::1, unspecified ::, ULA fc00::/7, link-local fe80::/10, IPv4-mapped ::ffff:0:0/96)
        if (host.indexOf(':') >= 0) {
            byte[] ipv6Bytes = tryParseIpv6LiteralToBytes(host);
            if (ipv6Bytes == null) {
                // Malformed IPv6 literal is treated as unsafe/blocked
                return true;
            }
            return isPrivateOrReservedIpv6Bytes(ipv6Bytes);
        }

        // 3. Pure zero-DNS IPv4 literal parsing (decimal, hex 0x..., octal 0..., shortened 1/2/3-part forms)
        byte[] ipv4Bytes = tryParseIpv4LiteralToBytes(host);
        if (ipv4Bytes != null) {
            return isPrivateOrReservedIpv4Bytes(ipv4Bytes, 0);
        }
        if (isNumericIpv4Attempt(host)) {
            // Out-of-range or invalid octal/numeric IPv4 attempt (e.g. 999.999.999.999 or 018.0.0.1)
            return true;
        }

        return false;
    }

    private static boolean isNumericIpv4Attempt(String host) {
        if (host == null || host.isEmpty()) return false;
        String[] parts = host.split("\\.", -1);
        if (parts.length < 1 || parts.length > 4) return false;
        for (String p : parts) {
            if (p.isEmpty()) return true;
            if (p.startsWith("0x")) {
                if (p.length() <= 2) return true;
                for (int i = 2; i < p.length(); i++) {
                    if (Character.digit(p.charAt(i), 16) < 0) return false;
                }
            } else {
                for (int i = 0; i < p.length(); i++) {
                    char c = p.charAt(i);
                    if (c < '0' || c > '9') return false;
                }
            }
        }
        return true;
    }

    public static byte[] tryParseIpv4LiteralToBytes(String rawHost) {
        if (rawHost == null || rawHost.isEmpty()) return null;
        String[] parts = rawHost.split("\\.", -1);
        if (parts.length < 1 || parts.length > 4) return null;
        long[] values = new long[parts.length];
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (part.isEmpty()) return null;
            long val;
            try {
                if (part.startsWith("0x") || part.startsWith("0X")) {
                    if (part.length() <= 2 || part.length() > 10) return null;
                    for (int j = 2; j < part.length(); j++) {
                        if (Character.digit(part.charAt(j), 16) < 0) return null;
                    }
                    val = Long.parseLong(part.substring(2), 16);
                } else if (part.startsWith("0") && part.length() > 1) {
                    if (part.length() > 13) return null;
                    for (int j = 1; j < part.length(); j++) {
                        char c = part.charAt(j);
                        if (c < '0' || c > '7') return null;
                    }
                    val = Long.parseLong(part, 8);
                } else {
                    if (part.length() > 10) return null;
                    for (int j = 0; j < part.length(); j++) {
                        char c = part.charAt(j);
                        if (c < '0' || c > '9') return null;
                    }
                    val = Long.parseLong(part, 10);
                }
            } catch (NumberFormatException e) {
                return null;
            }
            if (val < 0) return null;
            values[i] = val;
        }

        long packed;
        switch (parts.length) {
            case 1:
                if (values[0] > 0xFFFFFFFFL) return null;
                packed = values[0];
                break;
            case 2:
                if (values[0] > 0xFFL || values[1] > 0xFFFFFFL) return null;
                packed = (values[0] << 24) | values[1];
                break;
            case 3:
                if (values[0] > 0xFFL || values[1] > 0xFFL || values[2] > 0xFFFFL) return null;
                packed = (values[0] << 24) | (values[1] << 16) | values[2];
                break;
            case 4:
                if (values[0] > 0xFFL || values[1] > 0xFFL || values[2] > 0xFFL || values[3] > 0xFFL) {
                    return null;
                }
                packed = (values[0] << 24) | (values[1] << 16) | (values[2] << 8) | values[3];
                break;
            default:
                return null;
        }

        return new byte[]{
                (byte) ((packed >>> 24) & 0xFF),
                (byte) ((packed >>> 16) & 0xFF),
                (byte) ((packed >>> 8) & 0xFF),
                (byte) (packed & 0xFF)
        };
    }

    public static byte[] tryParseIpv6LiteralToBytes(String rawHost) {
        if (rawHost == null || rawHost.isEmpty()) return null;
        String h = rawHost.trim().toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]") && h.length() >= 2) {
            h = h.substring(1, h.length() - 1);
        }
        int zoneIdx = h.indexOf('%');
        if (zoneIdx > 0) {
            h = h.substring(0, zoneIdx);
        }
        if (h.indexOf(':') < 0 || h.indexOf(":::") >= 0) {
            return null;
        }

        // Convert embedded IPv4 tail (e.g. ::ffff:127.0.0.1) into two hex hextets
        if (h.indexOf('.') >= 0) {
            int lastColon = h.lastIndexOf(':');
            if (lastColon < 0) return null;
            String ipv4Tail = h.substring(lastColon + 1);
            byte[] v4 = tryParseIpv4LiteralToBytes(ipv4Tail);
            if (v4 == null) return null;
            int hi = ((v4[0] & 0xFF) << 8) | (v4[1] & 0xFF);
            int lo = ((v4[2] & 0xFF) << 8) | (v4[3] & 0xFF);
            h = h.substring(0, lastColon + 1) + Integer.toHexString(hi) + ":" + Integer.toHexString(lo);
        }

        int doubleColon = h.indexOf("::");
        if (doubleColon >= 0 && h.indexOf("::", doubleColon + 2) >= 0) {
            return null;
        }

        String[] leftParts;
        String[] rightParts;
        if (doubleColon >= 0) {
            String leftStr = h.substring(0, doubleColon);
            String rightStr = h.substring(doubleColon + 2);
            if (leftStr.startsWith(":") || leftStr.endsWith(":") || rightStr.startsWith(":") || rightStr.endsWith(":")) {
                return null;
            }
            leftParts = leftStr.isEmpty() ? new String[0] : leftStr.split(":", -1);
            rightParts = rightStr.isEmpty() ? new String[0] : rightStr.split(":", -1);
            if (leftParts.length + rightParts.length > 7) {
                return null;
            }
        } else {
            if (h.startsWith(":") || h.endsWith(":")) {
                return null;
            }
            leftParts = h.split(":", -1);
            rightParts = new String[0];
            if (leftParts.length != 8) {
                return null;
            }
        }

        byte[] out = new byte[16];
        for (int i = 0; i < leftParts.length; i++) {
            int val = parseHex16Group(leftParts[i]);
            if (val < 0) return null;
            out[i * 2] = (byte) ((val >>> 8) & 0xFF);
            out[i * 2 + 1] = (byte) (val & 0xFF);
        }
        int rightStartGroup = 8 - rightParts.length;
        for (int i = 0; i < rightParts.length; i++) {
            int val = parseHex16Group(rightParts[i]);
            if (val < 0) return null;
            int groupIdx = rightStartGroup + i;
            out[groupIdx * 2] = (byte) ((val >>> 8) & 0xFF);
            out[groupIdx * 2 + 1] = (byte) (val & 0xFF);
        }
        return out;
    }

    private static int parseHex16Group(String group) {
        if (group == null || group.isEmpty() || group.length() > 4) return -1;
        int val = 0;
        for (int i = 0; i < group.length(); i++) {
            int d = Character.digit(group.charAt(i), 16);
            if (d < 0) return -1;
            val = (val << 4) | d;
        }
        return val;
    }

    public static boolean isPrivateOrReservedInetAddress(InetAddress addr) {
        if (addr == null) return false;
        if (addr.isAnyLocalAddress()
                || addr.isLoopbackAddress()
                || addr.isLinkLocalAddress()
                || addr.isSiteLocalAddress()
                || addr.isMulticastAddress()) {
            return true;
        }
        byte[] raw = addr.getAddress();
        if (raw == null) return false;
        if (raw.length == 4) {
            return isPrivateOrReservedIpv4Bytes(raw, 0);
        }
        if (raw.length == 16) {
            return isPrivateOrReservedIpv6Bytes(raw);
        }
        return false;
    }

    private static boolean isPrivateOrReservedIpv6Bytes(byte[] raw) {
        if (raw == null || raw.length < 16) return false;
        // Check :: (unspecified) and ::1 (loopback)
        boolean first15Zero = true;
        for (int i = 0; i < 15; i++) {
            if (raw[i] != 0) {
                first15Zero = false;
                break;
            }
        }
        if (first15Zero && (raw[15] == 0 || raw[15] == 1)) {
            return true;
        }
        int b0 = raw[0] & 0xFF;
        int b1 = raw[1] & 0xFF;
        // IPv6 Unique Local Addresses fc00::/7 (fc00:: - fdff::)
        if ((b0 & 0xFE) == 0xFC) {
            return true;
        }
        // IPv6 link-local fe80::/10 (fe80:: - febf::) and site-local fec0::/10
        if (b0 == 0xFE && ((b1 & 0xC0) == 0x80 || (b1 & 0xC0) == 0xC0)) {
            return true;
        }
        // IPv6 multicast ff00::/8
        if (b0 == 0xFF) {
            return true;
        }
        // IPv6 documentation 2001:db8::/32
        if (b0 == 0x20 && b1 == 0x01 && (raw[2] & 0xFF) == 0x0D && (raw[3] & 0xFF) == 0xB8) {
            return true;
        }
        // IPv4-mapped IPv6 ::ffff:w.x.y.z and IPv4-compatible ::w.x.y.z
        boolean first10Zero = true;
        for (int i = 0; i < 10; i++) {
            if (raw[i] != 0) {
                first10Zero = false;
                break;
            }
        }
        if (first10Zero) {
            int b10 = raw[10] & 0xFF;
            int b11 = raw[11] & 0xFF;
            if ((b10 == 0xFF && b11 == 0xFF) || (b10 == 0 && b11 == 0)) {
                return isPrivateOrReservedIpv4Bytes(raw, 12);
            }
        }
        // NAT64 well-known prefix 64:ff9b::/96
        if (b0 == 0x00 && b1 == 0x64 && (raw[2] & 0xFF) == 0xFF && (raw[3] & 0xFF) == 0x9B) {
            return isPrivateOrReservedIpv4Bytes(raw, 12);
        }
        return false;
    }

    private static boolean isPrivateOrReservedIpv4Bytes(byte[] b, int offset) {
        if (b == null || b.length < offset + 4) return false;
        int b0 = b[offset] & 0xFF;
        int b1 = b[offset + 1] & 0xFF;
        int b2 = b[offset + 2] & 0xFF;
        int b3 = b[offset + 3] & 0xFF;

        // 0.0.0.0/8 (current network) or 10.0.0.0/8 or 127.0.0.0/8
        if (b0 == 0 || b0 == 10 || b0 == 127) {
            return true;
        }
        // 100.64.0.0/10 (Carrier-Grade NAT RFC 6598)
        if (b0 == 100 && (b1 & 0xC0) == 64) {
            return true;
        }
        // 169.254.0.0/16 (Link-local & cloud metadata 169.254.169.254)
        if (b0 == 169 && b1 == 254) {
            return true;
        }
        // 172.16.0.0/12
        if (b0 == 172 && b1 >= 16 && b1 <= 31) {
            return true;
        }
        // 192.168.0.0/16 or 192.0.0.0/24 or 192.0.2.0/24
        if (b0 == 192 && (b1 == 168 || (b1 == 0 && (b2 == 0 || b2 == 2)))) {
            return true;
        }
        // 198.18.0.0/15 (Benchmarking) or 198.51.100.0/24 (TEST-NET-2)
        if (b0 == 198 && (b1 == 18 || b1 == 19 || (b1 == 51 && b2 == 100))) {
            return true;
        }
        // 203.0.113.0/24 (TEST-NET-3)
        if (b0 == 203 && b1 == 0 && b2 == 113) {
            return true;
        }
        // 224.0.0.0/4 (Multicast), 240.0.0.0/4 (Reserved Class E), or 255.255.255.255 (Broadcast)
        if ((b0 & 0xE0) == 224 || (b0 & 0xF0) == 240 || (b0 == 255 && b1 == 255 && b2 == 255 && b3 == 255)) {
            return true;
        }
        return false;
    }

    private boolean isHostnameResolvingToPrivateIpOnBackgroundThread(String rawHost) {
        if (rawHost == null || rawHost.trim().isEmpty()) return false;
        String lowerHost = normalizeHostForSafety(rawHost);
        if (lowerHost.isEmpty()) return false;
        long now = System.currentTimeMillis();

        DnsCacheEntry cached = dnsSafetyCache.get(lowerHost);
        if (cached != null && now < cached.expiresAtMs) {
            return !cached.isSafe;
        }

        try {
            Future<InetAddress[]> future = dnsLookupExecutor.submit(() -> {
                try {
                    return InetAddress.getAllByName(lowerHost);
                } catch (UnknownHostException ignored) {
                    // Part 2 rule: fail-open on DNS resolution error
                    return null;
                }
            });
            InetAddress[] addresses;
            try {
                addresses = future.get(DNS_LOOKUP_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            } catch (TimeoutException te) {
                future.cancel(true);
                return false;
            }
            if (addresses != null && addresses.length > 0) {
                for (InetAddress addr : addresses) {
                    if (isPrivateOrReservedInetAddress(addr)) {
                        putDnsCacheEntry(lowerHost, new DnsCacheEntry(false, now + DNS_CACHE_TTL_MS));
                        return true;
                    }
                }
                putDnsCacheEntry(lowerHost, new DnsCacheEntry(true, now + DNS_CACHE_TTL_MS));
                return false;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private void putDnsCacheEntry(String host, DnsCacheEntry entry) {
        if (dnsSafetyCache.size() >= MAX_DNS_CACHE_ENTRIES) {
            long now = System.currentTimeMillis();
            Iterator<Map.Entry<String, DnsCacheEntry>> it = dnsSafetyCache.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, DnsCacheEntry> e = it.next();
                if (e.getValue() == null || now >= e.getValue().expiresAtMs) {
                    it.remove();
                }
            }
            if (dnsSafetyCache.size() >= MAX_DNS_CACHE_ENTRIES) {
                dnsSafetyCache.clear();
            }
        }
        dnsSafetyCache.put(host, entry);
    }

    private String evaluateLightModeSubresourceBlock(TabWebViewHolder holder, Uri uri) {
        if (holder == null || !holder.lightModeEnabled || uri == null) {
            return null;
        }
        String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
        String path = uri.getPath() != null ? uri.getPath().toLowerCase(Locale.ROOT) : "";

        if (holder.lightModeBlockWebFonts) {
            if (LIGHT_MODE_FONT_HOSTS.contains(host)) {
                return "LIGHT_MODE_WEB_FONT_BLOCKED";
            }
            for (String ext : LIGHT_MODE_FONT_EXTENSIONS) {
                if (path.endsWith(ext)) {
                    return "LIGHT_MODE_WEB_FONT_BLOCKED";
                }
            }
        }

        if (holder.lightModeBlockTrackers && !host.isEmpty()) {
            for (String trackerDomain : LIGHT_MODE_TRACKER_HOSTS) {
                if (host.equals(trackerDomain) || host.endsWith("." + trackerDomain)) {
                    return "LIGHT_MODE_TRACKER_BLOCKED";
                }
            }
        }

        return null;
    }

    private WebResourceResponse createBlockedSubresourceResponse(String reasonPhrase) {
        Map<String, String> headers = Collections.singletonMap("Cache-Control", "no-store");
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                reasonPhrase != null && !reasonPhrase.isEmpty() ? reasonPhrase : "Forbidden",
                headers,
                new ByteArrayInputStream(new byte[0])
        );
    }

    private void recordBlockedSubresourceAndSampleEmit(final TabWebViewHolder holder, final String sampleCode) {
        if (holder == null) return;
        holder.subresourceErrorCountSinceEmit.incrementAndGet();
        long now = System.currentTimeMillis();
        long lastEmit = holder.lastSubresourceEmitMs.get();
        if ((now - lastEmit) >= SUBRESOURCE_SAMPLE_INTERVAL_MS
                && holder.lastSubresourceEmitMs.compareAndSet(lastEmit, now)) {
            final int countToEmit = Math.max(1, holder.subresourceErrorCountSinceEmit.getAndSet(0));
            final long epoch = holder.requestEpoch.get();
            final String origin = extractOrigin(holder.currentUrl);
            runOnUiThread(() -> {
                JSONObject ev = createContractEnvelope(
                        "onSubresourceError",
                        holder.tabId,
                        UUID.randomUUID().toString(),
                        epoch,
                        false,
                        origin
                );
                try {
                    ev.put("count", countToEmit);
                    ev.put("sampleCode", sampleCode != null ? sampleCode : "ERR_BLOCKED_BY_CLIENT");
                } catch (JSONException ignored) {
                }
                emitEvent("onSubresourceError", ev);
            });
        }
    }

    public static boolean isGoogleAuthUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
            String path = uri.getPath() != null ? uri.getPath().toLowerCase(Locale.ROOT) : "";

            if ("accounts.google.com".equals(host)
                    || "accounts.google.co.uk".equals(host)
                    || "accounts.google.ca".equals(host)
                    || "accounts.youtube.com".equals(host)
                    || "oauth2.googleapis.com".equals(host)) {
                return true;
            }

            if ((host.equals("google.com") || host.endsWith(".google.com") || host.endsWith(".youtube.com"))
                    && (path.startsWith("/signin")
                    || path.startsWith("/servicelogin")
                    || path.startsWith("/accountchooser")
                    || path.startsWith("/interactive_login")
                    || path.startsWith("/o/oauth2")
                    || path.startsWith("/accounts/"))) {
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private void emitExternalAuthRequired(String tabId, String targetUrl, String reason) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("tabId", tabId);
            ev.put("targetUrl", targetUrl);
            ev.put("reason", reason);
        } catch (JSONException ignored) {
        }
        emitEvent("onExternalAuthRequired", ev);
    }

    private void emitTabStateEvent(String eventType, TabWebViewHolder holder) {
        if (holder == null) return;
        JSONObject ev = new JSONObject();
        try {
            boolean canBack = holder.webView != null && holder.webView.canGoBack();
            boolean canForward = holder.webView != null && holder.webView.canGoForward();
            holder.canGoBackCached = canBack;
            ev.put("tabId", holder.tabId);
            ev.put("url", holder.webView != null && holder.webView.getUrl() != null ? holder.webView.getUrl() : holder.currentUrl);
            ev.put("title", holder.webView != null && holder.webView.getTitle() != null ? holder.webView.getTitle() : holder.currentTitle);
            ev.put("progress", holder.progress);
            ev.put("isLoading", holder.isLoading);
            ev.put("canGoBack", canBack);
            ev.put("canGoForward", canForward);
            ev.put("requestEpoch", holder.requestEpoch.get());
            ev.put("renderProcessGone", holder.renderProcessGone);
            if (holder.webView != null) {
                WebBackForwardList bfl = holder.webView.copyBackForwardList();
                JSONArray historyArr = new JSONArray();
                for (int i = 0; i < bfl.getSize(); i++) {
                    if (bfl.getItemAtIndex(i) != null && bfl.getItemAtIndex(i).getUrl() != null) {
                        historyArr.put(bfl.getItemAtIndex(i).getUrl());
                    }
                }
                ev.put("historyUrls", historyArr);
                ev.put("historyIndex", bfl.getCurrentIndex());
            }
        } catch (JSONException ignored) {
        }
        emitEvent(eventType, ev);
    }

    // -------------------------------------------------------------------------
    // 5. WebViewClient Implementation
    // -------------------------------------------------------------------------

    private class NetflowTabWebViewClient extends WebViewClient {
        private final TabWebViewHolder holder;

        NetflowTabWebViewClient(TabWebViewHolder holder) {
            this.holder = holder;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // Part 2 & Part 3: Runs on a background Chromium worker thread.
            // NEVER invoke any UI-thread or WebView methods here.
            if (request == null || request.getUrl() == null) {
                return null;
            }
            Uri uri = request.getUrl();
            String rawUrl = uri.toString();
            boolean isMainFrame = request.isForMainFrame();

            // 1. Fast literal/safety check (zero DNS) for dangerous schemes and literal private/loopback/link-local/metadata IPs
            UrlSafetyResult safety = evaluateUrlSafety(rawUrl);

            // 2. Main-frame handling (F-09): never return an empty 403 subresource body or block on DNS in shouldInterceptRequest;
            // main-frame blocks are handled deterministically by loadUrl, shouldOverrideUrlLoading, and onPageStarted.
            if (isMainFrame) {
                return null;
            }

            if (!safety.isSafe) {
                recordBlockedSubresourceAndSampleEmit(
                        holder,
                        safety.isSsrf ? "ERR_BLOCKED_PRIVATE_IP" : "ERR_DISALLOWED_URL_SCHEME"
                );
                return createBlockedSubresourceResponse("Blocked by NETFLOW security policy");
            }

            // 3. Cached subresource DNS check (F-05: 60s TTL cache max 1024 entries, bounded 4-thread pool, 1500ms timeout, fail-open)
            String host = uri.getHost();
            if (host != null && isHostnameResolvingToPrivateIpOnBackgroundThread(host)) {
                recordBlockedSubresourceAndSampleEmit(holder, "ERR_BLOCKED_DNS_PRIVATE_IP");
                return createBlockedSubresourceResponse("Blocked private network subresource");
            }

            // 4. Light Mode font & tracker blocking for subresources
            String lightModeBlockCode = evaluateLightModeSubresourceBlock(holder, uri);
            if (lightModeBlockCode != null) {
                recordBlockedSubresourceAndSampleEmit(holder, lightModeBlockCode);
                return createBlockedSubresourceResponse("Blocked by Light Mode");
            }

            return null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request == null || request.getUrl() == null) return true;
            String url = request.getUrl().toString();
            boolean isMainFrame = request.isForMainFrame();
            boolean isRedirect = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && request.isRedirect();
            boolean hasGesture = request.hasGesture();

            // 1. Handle safe external non-HTTP(S) schemes (mailto:, tel:, sms:) only on main-frame user gesture
            String scheme = request.getUrl().getScheme() != null
                    ? request.getUrl().getScheme().toLowerCase(Locale.ROOT)
                    : "";
            if ("mailto".equals(scheme) || "tel".equals(scheme) || "sms".equals(scheme)) {
                if (isMainFrame && hasGesture) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, request.getUrl());
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        intent.setComponent(null);
                        intent.setSelector(null);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(intent);
                    } catch (Exception ignored) {
                    }
                }
                return true;
            }

            // 2. Validate URL safety (block javascript:, file:, content:, SSRF private IPs)
            UrlSafetyResult safety = evaluateUrlSafety(url);
            if (!safety.isSafe) {
                if (isMainFrame) {
                    JSONObject errEv = new JSONObject();
                    try {
                        errEv.put("tabId", holder.tabId);
                        errEv.put("errorCode", -10);
                        errEv.put("errorKind", safety.isSsrf ? "security_ssrf" : "generic");
                        errEv.put("description", safety.reason);
                        errEv.put("failingUrl", url);
                        errEv.put("isForMainFrame", true);
                        errEv.put("requestEpoch", holder.requestEpoch.get());
                    } catch (JSONException ignored) {
                    }
                    emitEvent("onReceivedError", errEv);
                }
                return true;
            }

            // 3. Google Sign-In / OAuth external browser fallback
            if (isMainFrame && isGoogleAuthUrl(url)) {
                emitExternalAuthRequired(holder.tabId, url, "Google Sign-In / OAuth intercepted for external browser security.");
                return true;
            }

            // 4. Emit navigation/redirect interception notification for main-frame navigations
            if (isMainFrame) {
                cancelPendingInteractiveRequestsForTabOnUiThread(holder.tabId);
                holder.currentUrl = url;
                if (request.getMethod() != null && !request.getMethod().trim().isEmpty()) {
                    holder.lastHttpMethod = request.getMethod().trim().toUpperCase(Locale.ROOT);
                }
                JSONObject navEv = new JSONObject();
                try {
                    navEv.put("tabId", holder.tabId);
                    navEv.put("url", url);
                    navEv.put("isRedirect", isRedirect);
                    navEv.put("hasGesture", hasGesture);
                    navEv.put("canGoBack", view.canGoBack());
                    navEv.put("canGoForward", view.canGoForward());
                    navEv.put("requestEpoch", holder.requestEpoch.get());
                } catch (JSONException ignored) {
                }
                emitEvent("onNavigationIntercepted", navEv);
            }

            // Return false to let Android System Chromium WebView execute the navigation directly
            return false;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            cancelPendingInteractiveRequestsForTabOnUiThread(holder.tabId);
            if (url != null && !url.trim().isEmpty()) {
                UrlSafetyResult safety = evaluateUrlSafety(url);
                if (!safety.isSafe) {
                    view.stopLoading();
                    holder.isLoading = false;
                    JSONObject errEv = new JSONObject();
                    try {
                        errEv.put("tabId", holder.tabId);
                        errEv.put("errorCode", -10);
                        errEv.put("errorKind", safety.isSsrf ? "security_ssrf" : "generic");
                        errEv.put("description", safety.reason);
                        errEv.put("failingUrl", url);
                        errEv.put("isForMainFrame", true);
                        errEv.put("requestEpoch", holder.requestEpoch.get());
                    } catch (JSONException ignored) {
                    }
                    emitEvent("onReceivedError", errEv);
                    return;
                }
                if (isGoogleAuthUrl(url)) {
                    view.stopLoading();
                    holder.isLoading = false;
                    emitExternalAuthRequired(holder.tabId, url, "Google Sign-In / OAuth intercepted at page start for external browser security.");
                    return;
                }
            }
            holder.currentUrl = url != null ? url : holder.currentUrl;
            holder.isLoading = true;
            holder.progress = 10;
            emitTabStateEvent("onPageStarted", holder);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            super.onPageCommitVisible(view, url);
            if (url != null && !url.trim().isEmpty()) {
                holder.currentUrl = url;
                holder.lastCommittedUrl = url;
            }
            emitTabStateEvent("onPageCommitVisible", holder);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (url != null && !url.trim().isEmpty()) {
                holder.currentUrl = url;
                holder.lastCommittedUrl = url;
            }
            if (view.getTitle() != null && !view.getTitle().trim().isEmpty()) {
                holder.currentTitle = view.getTitle().trim();
            }
            holder.isLoading = false;
            holder.progress = 100;
            holder.consecutiveRenderCrashCount = 0;
            if (!holder.isPrivate) {
                CookieManager.getInstance().flush();
            }
            emitTabStateEvent("onPageFinished", holder);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            super.doUpdateVisitedHistory(view, url, isReload);
            // Synchronize SPA pushState / replaceState / hash navigation with UI Shell
            if (url != null && !url.trim().isEmpty()) {
                holder.currentUrl = url;
                holder.lastCommittedUrl = url;
            }
            JSONObject ev = new JSONObject();
            try {
                ev.put("tabId", holder.tabId);
                ev.put("url", holder.currentUrl);
                ev.put("title", view.getTitle() != null ? view.getTitle() : holder.currentTitle);
                ev.put("isReload", isReload);
                ev.put("canGoBack", view.canGoBack());
                ev.put("canGoForward", view.canGoForward());
                ev.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onHistoryUpdated", ev);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request == null || !request.isForMainFrame()) {
                recordBlockedSubresourceAndSampleEmit(holder, "ERR_SUBRESOURCE_LOAD_FAILED");
                return;
            }
            holder.isLoading = false;
            int errorCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && error != null
                    ? error.getErrorCode()
                    : -1;
            String description = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && error != null && error.getDescription() != null
                    ? error.getDescription().toString()
                    : "Webpage navigation error";
            String failingUrl = request.getUrl() != null ? request.getUrl().toString() : holder.currentUrl;

            JSONObject errEv = new JSONObject();
            try {
                errEv.put("tabId", holder.tabId);
                errEv.put("errorCode", errorCode);
                errEv.put("description", description);
                errEv.put("failingUrl", failingUrl);
                errEv.put("isForMainFrame", true);
                errEv.put("canGoBack", view.canGoBack());
                errEv.put("canGoForward", view.canGoForward());
                errEv.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onReceivedError", errEv);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (request == null || errorResponse == null) {
                return;
            }
            int statusCode = errorResponse.getStatusCode();
            if (!request.isForMainFrame()) {
                if (statusCode >= 400) {
                    recordBlockedSubresourceAndSampleEmit(holder, "HTTP_" + statusCode);
                }
                return;
            }
            if (statusCode < 400) return;

            String reasonPhrase = errorResponse.getReasonPhrase() != null
                    ? errorResponse.getReasonPhrase()
                    : "HTTP Error " + statusCode;
            String failingUrl = request.getUrl() != null ? request.getUrl().toString() : holder.currentUrl;

            JSONObject httpEv = new JSONObject();
            try {
                httpEv.put("tabId", holder.tabId);
                httpEv.put("statusCode", statusCode);
                httpEv.put("reasonPhrase", reasonPhrase);
                httpEv.put("failingUrl", failingUrl);
                httpEv.put("isForMainFrame", true);
                httpEv.put("canGoBack", view.canGoBack());
                httpEv.put("canGoForward", view.canGoForward());
                httpEv.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onReceivedHttpError", httpEv);
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // Security invariant: always cancel on SSL certificate failures
            if (handler != null) {
                handler.cancel();
            }
            holder.isLoading = false;
            String failingUrl = error != null && error.getUrl() != null ? error.getUrl() : holder.currentUrl;
            int primaryError = error != null ? error.getPrimaryError() : -11;
            String host = "";
            if (failingUrl != null && !failingUrl.isEmpty()) {
                try {
                    Uri parsed = Uri.parse(failingUrl);
                    if (parsed != null && parsed.getHost() != null) {
                        host = parsed.getHost().toLowerCase();
                    }
                } catch (Exception ignored) {
                }
            }

            JSONObject sslEv = createContractEnvelope(
                    "onSslError",
                    holder.tabId,
                    UUID.randomUUID().toString(),
                    holder.requestEpoch.get(),
                    true,
                    extractOrigin(failingUrl)
            );
            try {
                sslEv.put("tabId", holder.tabId);
                sslEv.put("primaryError", primaryError);
                sslEv.put("sslPrimaryError", primaryError);
                sslEv.put("host", host);
                sslEv.put("errorCode", -11);
                sslEv.put("description", "Secure SSL/TLS certificate verification failed.");
                sslEv.put("failingUrl", failingUrl);
                sslEv.put("isForMainFrame", true);
                sslEv.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onSslError", sslEv);
        }

        @Override
        public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
            if (handler == null) return;
            String requestId = UUID.randomUUID().toString();
            long epoch = holder.requestEpoch.get();
            String origin = extractOrigin(view != null && view.getUrl() != null ? view.getUrl() : holder.currentUrl);

            PendingInteractiveRequest pending = new PendingInteractiveRequest(requestId, holder.tabId, epoch, "httpAuth");
            pending.httpAuthHandler = handler;
            registerPendingRequestOnUiThread(pending);

            JSONObject authEv = createContractEnvelope(
                    "onHttpAuthRequested",
                    holder.tabId,
                    requestId,
                    epoch,
                    true,
                    origin
            );
            try {
                authEv.put("host", host != null ? host : "");
                authEv.put("realm", realm != null ? realm : "");
            } catch (JSONException ignored) {
            }
            emitEvent("onHttpAuthRequested", authEv);
        }

        @Override
        @RequiresApi(Build.VERSION_CODES.O)
        @TargetApi(Build.VERSION_CODES.O)
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Prevent renderer crash/kill from terminating the Android host app
            cancelPendingInteractiveRequestsForTabOnUiThread(holder.tabId);
            boolean didCrash = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null && detail.didCrash();
            int priority = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null
                    ? detail.rendererPriorityAtExit()
                    : 0;

            long now = System.currentTimeMillis();
            if (now - holder.lastRenderCrashTimestampMs <= RENDER_CRASH_LOOP_WINDOW_MS) {
                holder.consecutiveRenderCrashCount += 1;
            } else {
                holder.consecutiveRenderCrashCount = 1;
            }
            holder.lastRenderCrashTimestampMs = now;
            holder.renderProcessGone = true;
            holder.needsCrashReloadOnShow = true;
            holder.isLoading = false;

            destroyPendingTransportWebViews(holder);
            destroyWebViewInstance(holder.webView);
            holder.webView = null;

            JSONObject crashEv = new JSONObject();
            try {
                crashEv.put("tabId", holder.tabId);
                crashEv.put("didCrash", didCrash);
                crashEv.put("rendererPriorityAtExit", priority);
                crashEv.put("consecutiveCrashCount", holder.consecutiveRenderCrashCount);
                crashEv.put("failingUrl", !holder.lastCommittedUrl.isEmpty() ? holder.lastCommittedUrl : holder.currentUrl);
            } catch (JSONException ignored) {
            }
            emitEvent("onRenderProcessGone", crashEv);
            return true;
        }
    }

    // -------------------------------------------------------------------------
    // 6. WebChromeClient Implementation
    // -------------------------------------------------------------------------

    private class NetflowTabWebChromeClient extends WebChromeClient {
        private final TabWebViewHolder holder;

        NetflowTabWebChromeClient(TabWebViewHolder holder) {
            this.holder = holder;
        }

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            holder.progress = Math.max(0, Math.min(100, newProgress));
            JSONObject ev = new JSONObject();
            try {
                ev.put("tabId", holder.tabId);
                ev.put("progress", holder.progress);
                ev.put("url", view.getUrl() != null ? view.getUrl() : holder.currentUrl);
                ev.put("requestEpoch", holder.requestEpoch.get());
            } catch (JSONException ignored) {
            }
            emitEvent("onProgressChanged", ev);
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            super.onReceivedTitle(view, title);
            if (title != null && !title.trim().isEmpty()) {
                holder.currentTitle = title.trim();
                JSONObject ev = new JSONObject();
                try {
                    ev.put("tabId", holder.tabId);
                    ev.put("title", holder.currentTitle);
                    ev.put("url", view.getUrl() != null ? view.getUrl() : holder.currentUrl);
                    ev.put("requestEpoch", holder.requestEpoch.get());
                } catch (JSONException ignored) {
                }
                emitEvent("onReceivedTitle", ev);
            }
        }

        @Override
        public void onReceivedIcon(WebView view, Bitmap icon) {
            super.onReceivedIcon(view, icon);
            // Part C: Never emit or retain favicons for private tabs
            if (icon == null || icon.isRecycled() || holder.isPrivate) {
                return;
            }
            int width = icon.getWidth();
            int height = icon.getHeight();
            if (width <= 0 || height <= 0) {
                return;
            }
            Bitmap scaled = icon;
            boolean createdScaled = false;
            try {
                // Downscale to <= 48px preserving aspect ratio
                if (width > MAX_FAVICON_DIMENSION_PX || height > MAX_FAVICON_DIMENSION_PX) {
                    float ratio = Math.min(
                            (float) MAX_FAVICON_DIMENSION_PX / (float) width,
                            (float) MAX_FAVICON_DIMENSION_PX / (float) height
                    );
                    int targetW = Math.max(1, Math.min(MAX_FAVICON_DIMENSION_PX, Math.round(width * ratio)));
                    int targetH = Math.max(1, Math.min(MAX_FAVICON_DIMENSION_PX, Math.round(height * ratio)));
                    scaled = Bitmap.createScaledBitmap(icon, targetW, targetH, true);
                    createdScaled = (scaled != icon);
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                if (!scaled.compress(Bitmap.CompressFormat.PNG, 100, baos)) {
                    return;
                }
                byte[] pngBytes = baos.toByteArray();
                if (pngBytes == null || pngBytes.length == 0) {
                    return;
                }
                String base64 = Base64.encodeToString(pngBytes, Base64.NO_WRAP);
                // Enforce <= 8 KB base64 size limit
                if (base64 == null || base64.isEmpty() || base64.length() > MAX_FAVICON_BASE64_BYTES) {
                    return;
                }
                final int finalW = scaled.getWidth();
                final int finalH = scaled.getHeight();
                final String dataUrl = "data:image/png;base64," + base64;
                String currentUrl = (view != null && view.getUrl() != null)
                        ? view.getUrl()
                        : holder.currentUrl;
                JSONObject ev = createContractEnvelope(
                        "onFavicon",
                        holder.tabId,
                        UUID.randomUUID().toString(),
                        holder.requestEpoch.get(),
                        true,
                        extractOrigin(currentUrl)
                );
                try {
                    ev.put("faviconBase64", base64);
                    ev.put("dataUrl", dataUrl);
                    ev.put("width", finalW);
                    ev.put("height", finalH);
                    ev.put("mimeType", "image/png");
                } catch (JSONException ignored) {
                }
                emitEvent("onFavicon", ev);
            } catch (Exception ignored) {
            } finally {
                if (createdScaled && scaled != null && !scaled.isRecycled()) {
                    try {
                        scaled.recycle();
                    } catch (Exception ignored) {
                    }
                }
            }
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // Popup & New-Tab Boundary: Require user gesture and per-site popup permission
            if (!isUserGesture || !holder.popupsAllowed || resultMsg == null) {
                JSONObject blockedEv = new JSONObject();
                try {
                    blockedEv.put("openerTabId", holder.tabId);
                    blockedEv.put("isUserGesture", isUserGesture);
                    blockedEv.put("allowed", false);
                    blockedEv.put("reason", !isUserGesture ? "Popup blocked: no user gesture" : "Popup blocked by site settings");
                } catch (JSONException ignored) {
                }
                emitEvent("onPopupBlocked", blockedEv);
                return false;
            }

            // Inspect hitTestResult first if user clicked an <a target="_blank">
            WebView.HitTestResult hitTest = view.getHitTestResult();
            if (hitTest != null && hitTest.getExtra() != null && !hitTest.getExtra().trim().isEmpty()) {
                String targetUrl = hitTest.getExtra().trim();
                dispatchCreateWindowToShell(holder.tabId, targetUrl, isDialog, isUserGesture);
                return false;
            }

            // Otherwise use a temporary detached transport WebView strictly to capture the target URL
            // without granting window.opener DOM access, with a strict timeout & tab-close cleanup guard
            if (resultMsg.obj instanceof WebView.WebViewTransport) {
                final WebView transportWebView = new WebView(activity);
                if (holder.isPrivate && privateProfileIsolationActive) {
                    try {
                        getOrCreatePrivateProfileOnUiThread();
                        WebViewCompat.setProfile(transportWebView, PRIVATE_PROFILE_NAME);
                    } catch (Throwable ignored) {
                    }
                }
                holder.pendingTransportWebViews.add(transportWebView);
                transportWebView.getSettings().setJavaScriptEnabled(false);
                transportWebView.getSettings().setAllowFileAccess(false);
                transportWebView.getSettings().setAllowContentAccess(false);

                final Runnable transportTimeoutRunnable = () -> {
                    if (holder.pendingTransportWebViews.remove(transportWebView)) {
                        destroyWebViewInstance(transportWebView);
                    }
                };
                mainHandler.postDelayed(transportTimeoutRunnable, TRANSPORT_WEBVIEW_TIMEOUT_MS);

                transportWebView.setWebViewClient(new WebViewClient() {
                    private boolean handled = false;

                    private void handleCapturedPopupUrl(WebView tempView, String targetUrl) {
                        mainHandler.removeCallbacks(transportTimeoutRunnable);
                        holder.pendingTransportWebViews.remove(tempView);
                        if (!handled && targetUrl != null && !targetUrl.trim().isEmpty() && !"about:blank".equalsIgnoreCase(targetUrl.trim())) {
                            handled = true;
                            dispatchCreateWindowToShell(holder.tabId, targetUrl.trim(), isDialog, true);
                        }
                        destroyWebViewInstance(tempView);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView tempView, WebResourceRequest request) {
                        String targetUrl = (request != null && request.getUrl() != null)
                                ? request.getUrl().toString()
                                : null;
                        handleCapturedPopupUrl(tempView, targetUrl);
                        return true;
                    }

                    @Override
                    public void onPageStarted(WebView tempView, String url, Bitmap favicon) {
                        if (url != null && !"about:blank".equalsIgnoreCase(url.trim())) {
                            handleCapturedPopupUrl(tempView, url);
                        }
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(transportWebView);
                resultMsg.sendToTarget();
                return true;
            }

            return false;
        }

        private void dispatchCreateWindowToShell(String openerTabId, String targetUrl, boolean isDialog, boolean isUserGesture) {
            UrlSafetyResult safety = evaluateUrlSafety(targetUrl);
            if (!safety.isSafe) return;

            if (isGoogleAuthUrl(targetUrl)) {
                emitExternalAuthRequired(openerTabId, targetUrl, "Popup navigated to Google Sign-In / OAuth.");
                return;
            }

            JSONObject ev = new JSONObject();
            try {
                ev.put("openerTabId", openerTabId);
                ev.put("targetUrl", targetUrl);
                ev.put("isDialog", isDialog);
                ev.put("isUserGesture", isUserGesture);
                ev.put("hasOpenerAccess", false);
                ev.put("isPrivileged", false);
            } catch (JSONException ignored) {
            }
            emitEvent("onCreateWindow", ev);
        }

        @Override
        public void onCloseWindow(WebView window) {
            super.onCloseWindow(window);
            JSONObject ev = new JSONObject();
            try {
                ev.put("tabId", holder.tabId);
            } catch (JSONException ignored) {
            }
            emitEvent("onCloseWindow", ev);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (activeCustomView != null) {
                if (callback != null) callback.onCustomViewHidden();
                return;
            }
            activeCustomView = view;
            activeCustomViewCallback = callback;
            activeFullscreenTabId = holder.tabId;

            if (fullscreenContainer != null && view != null) {
                fullscreenContainer.removeAllViews();
                fullscreenContainer.addView(
                        view,
                        new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                        )
                );
                fullscreenContainer.setVisibility(View.VISIBLE);
            }

            JSONObject ev = new JSONObject();
            try {
                ev.put("tabId", holder.tabId);
                ev.put("url", holder.currentUrl);
            } catch (JSONException ignored) {
            }
            emitEvent("onEnterFullscreen", ev);
        }

        @Override
        public void onHideCustomView() {
            exitCustomFullscreenView();
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            if (request == null) return;
            String rawOrigin = request.getOrigin() != null ? request.getOrigin().toString() : holder.currentUrl;
            String origin = extractOrigin(rawOrigin);
            JSONArray resourcesArr = new JSONArray();
            boolean hasGrantableResource = false;

            if (request.getResources() != null) {
                for (String res : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                        resourcesArr.put("camera");
                        hasGrantableResource = true;
                    } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                        resourcesArr.put("microphone");
                        hasGrantableResource = true;
                    } else if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(res)) {
                        resourcesArr.put("protectedMedia");
                        hasGrantableResource = true;
                    } else {
                        resourcesArr.put("other");
                    }
                }
            }
            if (resourcesArr.length() == 0) {
                resourcesArr.put("other");
            }

            String requestId = UUID.randomUUID().toString();
            long epoch = holder.requestEpoch.get();
            String tabOrigin = extractOrigin(holder.currentUrl);
            boolean isMainFrame = tabOrigin.isEmpty() || tabOrigin.equalsIgnoreCase(origin);

            PendingInteractiveRequest pending = new PendingInteractiveRequest(requestId, holder.tabId, epoch, "permission");
            pending.permissionRequest = request;
            registerPendingRequestOnUiThread(pending);

            JSONObject ev = createContractEnvelope(
                    "onPermissionRequested",
                    holder.tabId,
                    requestId,
                    epoch,
                    isMainFrame,
                    origin
            );
            try {
                ev.put("resources", resourcesArr);
            } catch (JSONException ignored) {
            }
            emitEvent("onPermissionRequested", ev);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            super.onPermissionRequestCanceled(request);
            if (request == null) return;
            for (Map.Entry<String, PendingInteractiveRequest> entry : pendingInteractiveRequests.entrySet()) {
                PendingInteractiveRequest p = entry.getValue();
                if (p != null && p.permissionRequest == request) {
                    denyOrCancelPendingRequestOnUiThread(entry.getKey());
                    break;
                }
            }
            for (Map.Entry<Integer, PendingInteractiveRequest> entry : pendingOsPermissionRequests.entrySet()) {
                PendingInteractiveRequest p = entry.getValue();
                if (p != null && p.permissionRequest == request) {
                    denyOrCancelPendingOsPermissionRequestOnUiThread(entry.getKey());
                    break;
                }
            }
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (callback == null) return;
            String requestId = UUID.randomUUID().toString();
            long epoch = holder.requestEpoch.get();
            String normalizedOrigin = extractOrigin(origin != null && !origin.isEmpty() ? origin : holder.currentUrl);
            String tabOrigin = extractOrigin(holder.currentUrl);
            boolean isMainFrame = tabOrigin.isEmpty() || tabOrigin.equalsIgnoreCase(normalizedOrigin);

            PendingInteractiveRequest pending = new PendingInteractiveRequest(requestId, holder.tabId, epoch, "geolocation");
            pending.geolocationCallback = callback;
            pending.geolocationOrigin = origin != null ? origin : "";
            registerPendingRequestOnUiThread(pending);

            JSONArray resourcesArr = new JSONArray();
            resourcesArr.put("geolocation");

            JSONObject ev = createContractEnvelope(
                    "onPermissionRequested",
                    holder.tabId,
                    requestId,
                    epoch,
                    isMainFrame,
                    normalizedOrigin
            );
            try {
                ev.put("resources", resourcesArr);
            } catch (JSONException ignored) {
            }
            emitEvent("onPermissionRequested", ev);
        }

        @Override
        public void onGeolocationPermissionsHidePrompt() {
            super.onGeolocationPermissionsHidePrompt();
            for (Map.Entry<String, PendingInteractiveRequest> entry : pendingInteractiveRequests.entrySet()) {
                PendingInteractiveRequest p = entry.getValue();
                if (p != null && holder.tabId.equals(p.tabId) && "geolocation".equals(p.kind)) {
                    denyOrCancelPendingRequestOnUiThread(entry.getKey());
                }
            }
            for (Map.Entry<Integer, PendingInteractiveRequest> entry : pendingOsPermissionRequests.entrySet()) {
                PendingInteractiveRequest p = entry.getValue();
                if (p != null && holder.tabId.equals(p.tabId) && "geolocation".equals(p.kind)) {
                    denyOrCancelPendingOsPermissionRequestOnUiThread(entry.getKey());
                }
            }
        }

        @Override
        public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
        ) {
            if (filePathCallback == null) return false;
            String requestId = UUID.randomUUID().toString();
            long epoch = holder.requestEpoch.get();
            String origin = extractOrigin(webView != null && webView.getUrl() != null ? webView.getUrl() : holder.currentUrl);

            PendingInteractiveRequest pending = new PendingInteractiveRequest(requestId, holder.tabId, epoch, "fileChooser");
            pending.filePathCallback = filePathCallback;
            pending.fileChooserParams = fileChooserParams;
            registerPendingRequestOnUiThread(pending);

            JSONArray acceptArr = new JSONArray();
            boolean multiple = false;
            boolean capture = false;
            if (fileChooserParams != null) {
                if (fileChooserParams.getAcceptTypes() != null) {
                    for (String t : fileChooserParams.getAcceptTypes()) {
                        if (t != null && !t.trim().isEmpty()) {
                            acceptArr.put(t.trim());
                        }
                    }
                }
                multiple = fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                capture = fileChooserParams.isCaptureEnabled();
            }

            JSONObject ev = createContractEnvelope(
                    "onFileChooserRequested",
                    holder.tabId,
                    requestId,
                    epoch,
                    true,
                    origin
            );
            try {
                ev.put("acceptTypes", acceptArr);
                ev.put("multiple", multiple);
                ev.put("capture", capture);
                ev.put("hasUserGesture", true);
            } catch (JSONException ignored) {
            }
            emitEvent("onFileChooserRequested", ev);
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            if (result == null) return false;
            emitAsyncJsDialog("jsAlert", "alert", url, message, "", result, null);
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            if (result == null) return false;
            emitAsyncJsDialog("jsConfirm", "confirm", url, message, "", result, null);
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
            if (result == null) return false;
            emitAsyncJsDialog("jsPrompt", "prompt", url, message, defaultValue, null, result);
            return true;
        }

        @Override
        public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
            if (result == null) return false;
            emitAsyncJsDialog("jsBeforeUnload", "beforeunload", url, message, "", result, null);
            return true;
        }

        private void emitAsyncJsDialog(
                String pendingKind,
                String contractDialogType,
                String url,
                String message,
                String defaultValue,
                JsResult jsResult,
                JsPromptResult jsPromptResult
        ) {
            String requestId = UUID.randomUUID().toString();
            long epoch = holder.requestEpoch.get();
            String origin = extractOrigin(url != null && !url.isEmpty() ? url : holder.currentUrl);

            PendingInteractiveRequest pending = new PendingInteractiveRequest(requestId, holder.tabId, epoch, pendingKind);
            pending.jsResult = jsResult;
            pending.jsPromptResult = jsPromptResult;
            registerPendingRequestOnUiThread(pending);

            JSONObject ev = createContractEnvelope(
                    "onJsDialog",
                    holder.tabId,
                    requestId,
                    epoch,
                    true,
                    origin
            );
            try {
                ev.put("type", contractDialogType);
                ev.put("dialogType", contractDialogType);
                ev.put("url", url != null ? url : holder.currentUrl);
                ev.put("message", message != null ? message : "");
                ev.put("defaultValue", defaultValue != null ? defaultValue : "");
            } catch (JSONException ignored) {
            }
            emitEvent("onJsDialog", ev);
        }
    }

    // -------------------------------------------------------------------------
    // 7. DownloadListener Implementation
    // -------------------------------------------------------------------------

    private class NetflowTabDownloadListener implements DownloadListener {
        private final TabWebViewHolder holder;

        NetflowTabDownloadListener(TabWebViewHolder holder) {
            this.holder = holder;
        }

        @Override
        public void onDownloadStart(
                String url,
                String userAgent,
                String contentDisposition,
                String mimeType,
                long contentLength
        ) {
            if (holder == null) {
                return;
            }
            String effectiveUserAgent = (userAgent != null && !userAgent.trim().isEmpty())
                    ? userAgent
                    : (holder.webView != null && holder.webView.getSettings() != null
                        ? holder.webView.getSettings().getUserAgentString()
                        : MOBILE_USER_AGENT);
            downloadManager.onDownloadStart(
                    holder.tabId,
                    holder.isPrivate,
                    holder.currentUrl,
                    url,
                    effectiveUserAgent,
                    contentDisposition,
                    mimeType,
                    contentLength
            );
        }
    }
}
