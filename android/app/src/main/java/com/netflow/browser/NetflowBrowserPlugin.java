package com.netflow.browser;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * NETFLOW Browser V2 — Capacitor Plugin & UI-Shell Native Bridge
 *
 * Bridges the React/Capacitor UI Shell to the Native Android Chromium WebView Engine
 * (NetflowWebViewEngine).
 *
 * Security Invariant:
 * The @JavascriptInterface (window.NetflowNativeBridge) is attached ONLY to the trusted
 * Capacitor UI Shell WebView (bridge.getWebView()) and NEVER to any untrusted content WebView.
 */
@CapacitorPlugin(name = "NetflowBrowserEngine")
public class NetflowBrowserPlugin extends Plugin {

    private static volatile NetflowWebViewEngine sharedEngine;
    private static volatile NetflowBrowserPlugin activeInstance;
    private static volatile boolean shellReady = false;
    private static volatile String queuedExternalIntentUrl = null;

    public static void setSharedEngine(NetflowWebViewEngine engine) {
        sharedEngine = engine;
    }

    public static NetflowWebViewEngine getSharedEngine() {
        return sharedEngine;
    }

    public static void clearStaticReferences(NetflowWebViewEngine expectedEngine) {
        if (expectedEngine == null || sharedEngine == expectedEngine) {
            sharedEngine = null;
        }
        activeInstance = null;
        shellReady = false;
        queuedExternalIntentUrl = null;
    }

    public static void enqueueOrDeliverExternalIntentUrl(Activity activity, WebView shellWebView, String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return;
        String trimmed = rawUrl.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) {
            return;
        }
        if (shellReady && activeInstance != null && activity != null && shellWebView != null) {
            deliverExternalIntentUrlNow(activity, shellWebView, trimmed);
        } else {
            queuedExternalIntentUrl = trimmed;
        }
    }

    private static void deliverExternalIntentUrlNow(Activity activity, WebView shellWebView, String targetUrl) {
        if (targetUrl == null || targetUrl.trim().isEmpty()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("eventType", "onExternalIntentUrl");
            payload.put("url", targetUrl);
            payload.put("action", Intent.ACTION_VIEW);
        } catch (JSONException ignored) {
        }
        dispatchEngineEventToShell(activity, shellWebView, "onExternalIntentUrl", payload);
    }

    private void onShellReadySignaled() {
        onShellReadySignaled(true);
    }

    private void onShellReadySignaled(boolean forceEmitCapabilities) {
        boolean wasReady = shellReady;
        shellReady = true;
        if (forceEmitCapabilities || !wasReady) {
            NetflowWebViewEngine engine = sharedEngine;
            if (engine != null) {
                engine.emitCapabilitiesEvent();
            }
        }
        String pendingUrl = queuedExternalIntentUrl;
        if (pendingUrl != null) {
            queuedExternalIntentUrl = null;
            Activity act = getActivity();
            WebView shellWebView = getBridge() != null ? getBridge().getWebView() : null;
            if (act != null && shellWebView != null) {
                deliverExternalIntentUrlNow(act, shellWebView, pendingUrl);
            }
        }
    }

    private volatile NetflowWebViewEngine boundEngine = null;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        boundEngine = sharedEngine;
        final WebView shellWebView = getBridge() != null ? getBridge().getWebView() : null;
        if (shellWebView != null) {
            Runnable attachBridge = () -> {
                try {
                    shellWebView.addJavascriptInterface(new ShellNativeBridge(), "NetflowNativeBridge");
                } catch (Exception ignored) {
                }
            };
            if (Looper.myLooper() == Looper.getMainLooper()) {
                attachBridge.run();
            } else {
                shellWebView.post(attachBridge);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        final WebView shellWebView = getBridge() != null ? getBridge().getWebView() : null;
        if (shellWebView != null) {
            Runnable detachBridge = () -> {
                try {
                    shellWebView.removeJavascriptInterface("NetflowNativeBridge");
                } catch (Exception ignored) {
                }
            };
            if (Looper.myLooper() == Looper.getMainLooper()) {
                detachBridge.run();
            } else {
                shellWebView.post(detachBridge);
            }
        }
        if (activeInstance == this) {
            activeInstance = null;
            if (boundEngine == null || sharedEngine == boundEngine) {
                sharedEngine = null;
            }
            shellReady = false;
        }
        boundEngine = null;
        super.handleOnDestroy();
    }

    public static void dispatchEngineEventToShell(Activity activity, WebView shellWebView, String eventType, JSONObject payload) {
        if (payload == null) return;
        NetflowBrowserPlugin plugin = activeInstance;
        if (plugin != null) {
            try {
                JSObject jsObj = JSObject.fromJSONObject(payload);
                plugin.notifyListeners("engineEvent", jsObj);
            } catch (Exception ignored) {
            }
        }
        if (activity != null && shellWebView != null) {
            final String quotedJson = JSONObject.quote(payload.toString());
            activity.runOnUiThread(() -> {
                try {
                    String script = "window.dispatchEvent(new CustomEvent('netflow:native-engine-event', { detail: JSON.parse(" + quotedJson + ") }));";
                    shellWebView.evaluateJavascript(script, null);
                } catch (Exception ignored) {
                }
            });
        }
    }

    private void executeActionJson(JSONObject actionObj) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine == null || actionObj == null) return;
        String action = actionObj.optString("action", "");
        String tabId = actionObj.optString("tabId", "");
        boolean isPrivate = actionObj.optBoolean("isPrivate", false);
        String siteMode = actionObj.optString("siteMode", "default");
        int zoomLevel = actionObj.optInt("zoomLevel", 100);
        boolean javascriptAllowed = actionObj.optBoolean("javascriptAllowed", true);
        boolean popupsAllowed = actionObj.optBoolean("popupsAllowed", true);
        long requestEpoch = actionObj.optLong("requestEpoch", 0L);

        switch (action) {
            case "CREATE_OR_UPDATE_TAB":
                onShellReadySignaled(false);
                engine.createOrUpdateTab(tabId, isPrivate, siteMode, zoomLevel, javascriptAllowed, popupsAllowed);
                break;
            case "SELECT_TAB":
            case "SWITCH_TAB":
                onShellReadySignaled(false);
                engine.selectTab(tabId, isPrivate);
                break;
            case "SHELL_READY":
            case "shellReady":
                onShellReadySignaled(true);
                break;
            case "CLOSE_TAB":
                engine.closeTab(tabId);
                break;
            case "LOAD_URL": {
                String url = actionObj.optString("url", "");
                engine.loadUrl(tabId, url, isPrivate, siteMode, zoomLevel, javascriptAllowed, popupsAllowed, requestEpoch);
                break;
            }
            case "RELOAD":
                engine.reload(tabId);
                break;
            case "STOP_LOADING":
                engine.stopLoading(tabId);
                break;
            case "GO_BACK":
                engine.goBack(tabId);
                break;
            case "GO_FORWARD":
                engine.goForward(tabId);
                break;
            case "FIND_IN_PAGE":
                engine.findInPage(tabId, actionObj.optString("query", ""));
                break;
            case "FIND_NEXT":
                engine.findNext(tabId, actionObj.optBoolean("forward", true));
                break;
            case "CLEAR_FIND_MATCHES":
                engine.clearFindMatches(tabId);
                break;
            case "SET_ZOOM":
                engine.setZoomLevel(tabId, zoomLevel);
                break;
            case "SET_SITE_MODE":
                engine.setSiteMode(tabId, siteMode, actionObj.optBoolean("reload", true));
                break;
            case "SET_VIEWPORT_BOUNDS":
                engine.setViewportBounds(
                        actionObj.optInt("left", 0),
                        actionObj.optInt("top", 0),
                        actionObj.optInt("width", 0),
                        actionObj.optInt("height", 0),
                        actionObj.optBoolean("visible", true)
                );
                break;
            case "SET_WEBVIEW_VISIBLE":
                engine.setWebViewVisible(actionObj.optBoolean("visible", false));
                break;
            case "CLEAR_BROWSING_DATA":
                engine.clearBrowsingData(
                        actionObj.optBoolean("clearCache", true),
                        actionObj.optBoolean("clearCookies", true),
                        actionObj.optBoolean("clearStorage", true),
                        actionObj.optBoolean("clearHistory", true)
                );
                break;
            case "LAUNCH_EXTERNAL_BROWSER":
            case "openExternalBrowser":
                launchSafeExternalUrl(actionObj.optString("url", ""));
                break;
            case "SHARE_URL":
            case "shareUrl":
                launchSafeShareSheet(
                        actionObj.optString("url", ""),
                        actionObj.optString("title", "")
                );
                break;
            case "DOWNLOAD_IMAGE":
            case "downloadImage": {
                String imageUrl = actionObj.optString("imageUrl", actionObj.optString("url", ""));
                engine.requestImageDownload(tabId, imageUrl);
                break;
            }
            case "resolvePermission": {
                String reqId = actionObj.optString("requestId", "");
                JSONArray arr = actionObj.optJSONArray("grantedResources");
                List<String> grantedList = new ArrayList<>();
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) {
                        String val = arr.optString(i, "");
                        if (val != null && !val.trim().isEmpty()) {
                            grantedList.add(val.trim());
                        }
                    }
                }
                engine.resolvePermission(reqId, grantedList);
                break;
            }
            case "resolveFileChooser": {
                String reqId = actionObj.optString("requestId", "");
                boolean allow = actionObj.optBoolean("allow", false);
                engine.resolveFileChooser(reqId, allow);
                break;
            }
            case "resolveJsDialog": {
                String reqId = actionObj.optString("requestId", "");
                boolean confirmed = actionObj.optBoolean("confirmed", false);
                String val = (actionObj.has("value") && !actionObj.isNull("value"))
                        ? actionObj.optString("value", "")
                        : null;
                engine.resolveJsDialog(reqId, confirmed, val);
                break;
            }
            case "resolveHttpAuth": {
                String reqId = actionObj.optString("requestId", "");
                boolean proceed = actionObj.optBoolean("proceed", false);
                String username = actionObj.has("username") && !actionObj.isNull("username")
                        ? actionObj.optString("username", "")
                        : null;
                String password = actionObj.has("password") && !actionObj.isNull("password")
                        ? actionObj.optString("password", "")
                        : null;
                engine.resolveHttpAuth(reqId, proceed, username, password);
                break;
            }
            case "setLightMode": {
                JSONObject policy = actionObj.optJSONObject("policy");
                engine.setLightMode(tabId, policy);
                break;
            }
            case "resolveDownload": {
                String reqId = actionObj.optString("requestId", "");
                boolean allow = actionObj.optBoolean("allow", false);
                String fileName = (actionObj.has("fileName") && !actionObj.isNull("fileName"))
                        ? actionObj.optString("fileName", "")
                        : null;
                engine.resolveDownload(reqId, allow, fileName);
                break;
            }
            case "cancelDownload": {
                String downloadId = actionObj.optString("downloadId", "");
                engine.cancelDownload(downloadId);
                break;
            }
            case "openDownload": {
                String downloadId = actionObj.optString("downloadId", "");
                engine.openDownload(downloadId);
                break;
            }
            case "deleteDownload": {
                String downloadId = actionObj.optString("downloadId", "");
                engine.deleteDownload(downloadId);
                break;
            }
            case "reconcileDownloads": {
                JSONArray arr = actionObj.optJSONArray("downloadIds");
                List<String> ids = new ArrayList<>();
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) {
                        String val = arr.optString(i, "");
                        if (val != null && !val.trim().isEmpty()) {
                            ids.add(val.trim());
                        }
                    }
                }
                engine.reconcileDownloads(ids);
                break;
            }
            default:
                break;
        }
    }

    private boolean launchSafeExternalUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
        final String trimmed = rawUrl.trim();
        final String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) return false;
        if (!NetflowWebViewEngine.evaluateUrlSafety(trimmed).isSafe) return false;
        final Activity act = getActivity();
        if (act == null) return false;
        act.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(trimmed));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                act.startActivity(intent);
            } catch (Exception ignored) {
            }
        });
        return true;
    }

    private boolean launchSafeShareSheet(String rawUrl, String rawTitle) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
        final String trimmed = rawUrl.trim();
        final String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) return false;
        if (!NetflowWebViewEngine.evaluateUrlSafety(trimmed).isSafe) return false;
        final String safeTitle = rawTitle != null ? rawTitle.trim() : "";
        final Activity act = getActivity();
        if (act == null) return false;
        act.runOnUiThread(() -> {
            try {
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("text/plain");
                if (!safeTitle.isEmpty()) {
                    sendIntent.putExtra(Intent.EXTRA_SUBJECT, safeTitle);
                    sendIntent.putExtra(Intent.EXTRA_TITLE, safeTitle);
                }
                sendIntent.putExtra(Intent.EXTRA_TEXT, trimmed);
                sendIntent.setComponent(null);
                sendIntent.setSelector(null);
                Intent chooser = Intent.createChooser(
                        sendIntent,
                        !safeTitle.isEmpty() ? safeTitle : "Share link"
                );
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                act.startActivity(chooser);
            } catch (Exception ignored) {
            }
        });
        return true;
    }

    public class ShellNativeBridge {
        @JavascriptInterface
        public void onNativeAction(String jsonPayload) {
            try {
                JSONObject obj = new JSONObject(jsonPayload);
                executeActionJson(obj);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void postMessage(String jsonPayload) {
            onNativeAction(jsonPayload);
        }

        @JavascriptInterface
        public void notifyShellReady() {
            onShellReadySignaled();
        }

        @JavascriptInterface
        public String getChromiumVersion() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    PackageInfo info = WebView.getCurrentWebViewPackage();
                    if (info != null && info.versionName != null) {
                        return "Chromium/" + info.versionName;
                    }
                }
            } catch (Exception ignored) {
            }
            return "Android System Chromium WebView";
        }

        @JavascriptInterface
        public boolean launchExternalUrl(String url) {
            return launchSafeExternalUrl(url);
        }

        @JavascriptInterface
        public boolean shareUrl(String url, String title) {
            return launchSafeShareSheet(url, title);
        }
    }

    // -------------------------------------------------------------------------
    // Capacitor @PluginMethod Endpoints
    // -------------------------------------------------------------------------

    @PluginMethod
    public void notifyShellReady(PluginCall call) {
        onShellReadySignaled();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void dispatchAction(PluginCall call) {
        JSObject data = call.getData();
        executeActionJson(data);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void loadUrl(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            Integer zoomObj = call.getInt("zoomLevel", 100);
            Integer epochObj = call.getInt("requestEpoch", 1);
            engine.loadUrl(
                    call.getString("tabId", ""),
                    call.getString("url", ""),
                    Boolean.TRUE.equals(call.getBoolean("isPrivate", false)),
                    call.getString("siteMode", "default"),
                    zoomObj != null ? zoomObj : 100,
                    Boolean.TRUE.equals(call.getBoolean("javascriptAllowed", true)),
                    Boolean.TRUE.equals(call.getBoolean("popupsAllowed", true)),
                    epochObj != null ? epochObj.longValue() : 1L
            );
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void selectTab(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.selectTab(
                    call.getString("tabId", ""),
                    Boolean.TRUE.equals(call.getBoolean("isPrivate", false))
            );
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void closeTab(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.closeTab(call.getString("tabId", ""));
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void goBack(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.goBack(call.getString("tabId", ""));
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void goForward(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.goForward(call.getString("tabId", ""));
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void reload(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.reload(call.getString("tabId", ""));
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopLoading(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.stopLoading(call.getString("tabId", ""));
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setViewportBounds(PluginCall call) {
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            Integer leftObj = call.getInt("left", 0);
            Integer topObj = call.getInt("top", 0);
            Integer widthObj = call.getInt("width", 0);
            Integer heightObj = call.getInt("height", 0);
            engine.setViewportBounds(
                    leftObj != null ? leftObj : 0,
                    topObj != null ? topObj : 0,
                    widthObj != null ? widthObj : 0,
                    heightObj != null ? heightObj : 0,
                    Boolean.TRUE.equals(call.getBoolean("visible", true))
            );
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void shareUrl(PluginCall call) {
        String url = call.getString("url", "");
        String title = call.getString("title", "");
        boolean ok = launchSafeShareSheet(url, title);
        JSObject ret = new JSObject();
        ret.put("success", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void openExternalBrowser(PluginCall call) {
        String url = call.getString("url", "");
        boolean ok = launchSafeExternalUrl(url);
        JSObject ret = new JSObject();
        ret.put("success", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadImage(PluginCall call) {
        String tabId = call.getString("tabId", "");
        String imageUrl = call.getString("imageUrl", call.getString("url", ""));
        NetflowWebViewEngine engine = sharedEngine;
        if (engine != null) {
            engine.requestImageDownload(tabId, imageUrl);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
