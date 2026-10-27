package com.netflow.browser;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * NETFLOW Browser V2 — Native Android Download Manager Integration
 *
 * Execution Marker: NETFLOW-NATIVE-DOWNLOADS-01
 *
 * Responsibilities:
 * 1. Handles tab WebView DownloadListener callbacks without starting downloads automatically.
 *    - Enforces http/https only and URL safety via NetflowWebViewEngine.evaluateUrlSafety.
 *    - Rejects blob: and data: URLs with an explicit onDownloadUnsupported contract event.
 *    - Emits onDownloadRequested with sanitized display URL (origin + path only) and userAgent omitted.
 *    - Guards against private tabs (isPrivate: false).
 * 2. Enqueues approved downloads via android.app.DownloadManager on resolveDownload(allow=true):
 *    - Sanitizes fileName (strips path separators & control chars, max 120 chars, adds extension from MIME if missing).
 *    - Attaches tab User-Agent, Referer origin, and exact-URL Cookie header from CookieManager
 *      (never logged and never sent to the shell).
 *    - Destination: API >= 29 public Downloads via DownloadManager; API < 29 app-specific external files dir.
 * 3. Polls DownloadManager.Query every 1,000ms on the UI Handler ONLY while downloads are active
 *    (no BroadcastReceiver). Maps STATUS_* and PAUSED_* reasons to contract states and emits throttled events.
 * 4. Supports cancelDownload / deleteDownload via DownloadManager.remove(id) and openDownload via
 *    getUriForDownloadedFile + ACTION_VIEW + FLAG_GRANT_READ_URI_PERMISSION inside try/catch ActivityNotFoundException.
 */
public class NetflowDownloadManager {

    public static final long DOWNLOAD_POLL_INTERVAL_MS = 1000L;
    public static final long PENDING_DOWNLOAD_TIMEOUT_MS = 30000L;
    public static final int MAX_COMPLETED_DOWNLOAD_ENTRIES = 128;
    public static final int MAX_FILENAME_LENGTH = 120;
    private static final long PROGRESS_THROTTLE_MS = 900L;
    private static final long PROGRESS_MIN_BYTE_DELTA = 4096L;

    public interface EngineBridge {
        boolean isDownloadUrlSafe(String url);
        String extractOrigin(String url);
        void emitContractEvent(String eventType, JSONObject payload);
    }

    private static final class PendingDownloadRequest {
        final String requestId;
        final String tabId;
        final String rawUrl;
        final String displayUrl;
        final String userAgent;
        final String refererOrigin;
        final String mimeType;
        final long contentLength;
        final String suggestedFileName;
        final boolean isPrivate;
        final AtomicBoolean resolved = new AtomicBoolean(false);
        Runnable timeoutRunnable;

        PendingDownloadRequest(
                String requestId,
                String tabId,
                String rawUrl,
                String displayUrl,
                String userAgent,
                String refererOrigin,
                String mimeType,
                long contentLength,
                String suggestedFileName,
                boolean isPrivate
        ) {
            this.requestId = requestId;
            this.tabId = tabId;
            this.rawUrl = rawUrl;
            this.displayUrl = displayUrl;
            this.userAgent = userAgent;
            this.refererOrigin = refererOrigin;
            this.mimeType = mimeType;
            this.contentLength = contentLength;
            this.suggestedFileName = suggestedFileName;
            this.isPrivate = isPrivate;
        }
    }

    private static final class ActiveDownloadEntry {
        final long systemDownloadId;
        final String downloadId;
        final String tabId;
        final String requestId;
        String fileName;
        String mimeType;
        final String displayUrl;
        String lastEmittedState = "";
        String lastEmittedReason = "";
        long lastEmittedBytes = -1L;
        long lastEmitTimestampMs = 0L;

        ActiveDownloadEntry(
                long systemDownloadId,
                String downloadId,
                String tabId,
                String requestId,
                String fileName,
                String mimeType,
                String displayUrl
        ) {
            this.systemDownloadId = systemDownloadId;
            this.downloadId = downloadId;
            this.tabId = tabId;
            this.requestId = requestId;
            this.fileName = fileName;
            this.mimeType = mimeType;
            this.displayUrl = displayUrl;
        }
    }

    private final Activity activity;
    private final Handler uiHandler;
    private final EngineBridge bridge;

    private final Map<String, PendingDownloadRequest> pendingRequests = new ConcurrentHashMap<>();
    private final Map<Long, ActiveDownloadEntry> activeDownloads = new ConcurrentHashMap<>();
    private final Map<Long, ActiveDownloadEntry> completedDownloads = new ConcurrentHashMap<>();
    private boolean isPollingScheduled = false;

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            isPollingScheduled = false;
            pollActiveDownloadsOnUiThread();
        }
    };

    public NetflowDownloadManager(Activity activity, Handler uiHandler, EngineBridge bridge) {
        this.activity = activity;
        this.uiHandler = uiHandler != null ? uiHandler : new Handler(Looper.getMainLooper());
        this.bridge = bridge;
    }

    private void runOnUiThread(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action.run();
        } else {
            uiHandler.post(action);
        }
    }

    /**
     * Handles WebView DownloadListener.onDownloadStart without starting a download automatically.
     */
    public void onDownloadStart(
            final String tabId,
            final boolean isPrivate,
            final String pageUrl,
            final String rawUrl,
            final String userAgent,
            final String contentDisposition,
            final String mimeType,
            final long contentLength
    ) {
        if (tabId == null || tabId.trim().isEmpty()) {
            return;
        }
        // Guard: Private tabs never use native DownloadManager; block and emit explicit notice
        if (isPrivate) {
            String safeUrl = (rawUrl != null && !rawUrl.trim().isEmpty())
                    ? sanitizeDisplayUrl(rawUrl.trim())
                    : "";
            emitUnsupportedDownloadEvent(
                    tabId,
                    safeUrl,
                    "private",
                    "PRIVATE_TAB_DOWNLOAD_BLOCKED",
                    "Downloads are blocked in Private tabs to prevent saving files or leaking session state to device storage."
            );
            return;
        }
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return;
        }

        final String trimmedUrl = rawUrl.trim();
        final String lowerUrl = trimmedUrl.toLowerCase(Locale.ROOT);

        // Reject blob: and data: schemes with explicit unsupported download event
        if (lowerUrl.startsWith("blob:") || lowerUrl.startsWith("data:")) {
            String scheme = lowerUrl.startsWith("blob:") ? "blob" : "data";
            emitUnsupportedDownloadEvent(
                    tabId,
                    sanitizeDisplayUrl(trimmedUrl),
                    scheme,
                    "UNSUPPORTED_DOWNLOAD_TYPE",
                    scheme + ": downloads are not supported by the native Android system downloader."
            );
            return;
        }

        // Only allow http:// and https:// schemes and enforce evaluateUrlSafety
        if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
            emitUnsupportedDownloadEvent(
                    tabId,
                    sanitizeDisplayUrl(trimmedUrl),
                    "unsupported",
                    "UNSUPPORTED_DOWNLOAD_SCHEME",
                    "Only http and https downloads are supported."
            );
            return;
        }

        if (!bridge.isDownloadUrlSafe(trimmedUrl)) {
            emitUnsupportedDownloadEvent(
                    tabId,
                    sanitizeDisplayUrl(trimmedUrl),
                    "blocked",
                    "BLOCKED_UNSAFE_DOWNLOAD_URL",
                    "Download blocked by URL security policy."
            );
            return;
        }

        final String safeMime = normalizeMimeType(mimeType);
        final String guessedName = URLUtil.guessFileName(trimmedUrl, contentDisposition, safeMime);
        final String suggestedFileName = sanitizeFileName(guessedName, safeMime);
        final String displayUrl = sanitizeDisplayUrl(trimmedUrl);
        final String refererOrigin = bridge.extractOrigin(pageUrl != null ? pageUrl : "");
        final String requestId = UUID.randomUUID().toString();
        final long safeLength = Math.max(0L, contentLength);

        PendingDownloadRequest pending = new PendingDownloadRequest(
                requestId,
                tabId,
                trimmedUrl,
                displayUrl,
                userAgent != null ? userAgent : "",
                refererOrigin,
                safeMime,
                safeLength,
                suggestedFileName,
                false
        );
        Runnable timeoutTask = () -> expirePendingDownloadRequestOnUiThread(requestId);
        pending.timeoutRunnable = timeoutTask;
        pendingRequests.put(requestId, pending);
        uiHandler.postDelayed(timeoutTask, PENDING_DOWNLOAD_TIMEOUT_MS);

        // Emit onDownloadRequested (url sanitized to origin+path only; userAgent strictly omitted)
        JSONObject ev = new JSONObject();
        try {
            ev.put("tabId", tabId);
            ev.put("requestId", requestId);
            ev.put("url", displayUrl);
            ev.put("mimeType", safeMime);
            ev.put("contentLength", safeLength);
            ev.put("suggestedFileName", suggestedFileName);
            ev.put("isPrivate", false);
        } catch (JSONException ignored) {
        }
        bridge.emitContractEvent("onDownloadRequested", ev);
    }

    private void expirePendingDownloadRequestOnUiThread(final String requestId) {
        if (requestId == null || requestId.trim().isEmpty()) return;
        PendingDownloadRequest pending = pendingRequests.remove(requestId.trim());
        if (pending == null) return;
        if (pending.timeoutRunnable != null) {
            uiHandler.removeCallbacks(pending.timeoutRunnable);
            pending.timeoutRunnable = null;
        }
        pending.resolved.compareAndSet(false, true);
    }

    /**
     * Resolves a pending download consent request.
     */
    public void resolveDownload(final String requestId, final boolean allow, final String customFileName) {
        if (requestId == null || requestId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            PendingDownloadRequest pending = pendingRequests.remove(requestId.trim());
            if (pending == null) {
                return;
            }
            if (pending.timeoutRunnable != null) {
                uiHandler.removeCallbacks(pending.timeoutRunnable);
                pending.timeoutRunnable = null;
            }
            if (pending.isPrivate || !pending.resolved.compareAndSet(false, true)) {
                return;
            }
            if (!allow) {
                return;
            }
            if (!bridge.isDownloadUrlSafe(pending.rawUrl)) {
                return;
            }

            DownloadManager dm = getSystemDownloadManager();
            if (dm == null) {
                return;
            }

            String chosenName = (customFileName != null && !customFileName.trim().isEmpty())
                    ? customFileName.trim()
                    : pending.suggestedFileName;
            String sanitizedFileName = sanitizeFileName(chosenName, pending.mimeType);

            try {
                Uri targetUri = Uri.parse(pending.rawUrl);
                DownloadManager.Request request = new DownloadManager.Request(targetUri);
                request.setTitle(sanitizedFileName);
                request.setDescription(pending.displayUrl);
                if (!pending.mimeType.isEmpty()) {
                    request.setMimeType(pending.mimeType);
                }
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                );

                if (pending.userAgent != null && !pending.userAgent.trim().isEmpty()) {
                    request.addRequestHeader("User-Agent", pending.userAgent.trim());
                }
                if (pending.refererOrigin != null && !pending.refererOrigin.trim().isEmpty()) {
                    request.addRequestHeader("Referer", pending.refererOrigin.trim());
                }

                // Attach exact-URL Cookie header from CookieManager (never logged, never sent to shell)
                String cookieHeader = CookieManager.getInstance().getCookie(pending.rawUrl);
                if (cookieHeader != null && !cookieHeader.trim().isEmpty()) {
                    request.addRequestHeader("Cookie", cookieHeader.trim());
                }

                // Destination: API >= 29 public Downloads via DownloadManager;
                // API < 29 app-specific external files dir (no storage permission required)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    request.setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS,
                            sanitizedFileName
                    );
                } else {
                    request.setDestinationInExternalFilesDir(
                            activity,
                            Environment.DIRECTORY_DOWNLOADS,
                            sanitizedFileName
                    );
                }

                long sysId = dm.enqueue(request);
                String downloadId = String.valueOf(sysId);

                ActiveDownloadEntry entry = new ActiveDownloadEntry(
                        sysId,
                        downloadId,
                        pending.tabId,
                        pending.requestId,
                        sanitizedFileName,
                        pending.mimeType,
                        pending.displayUrl
                );
                activeDownloads.put(sysId, entry);

                emitDownloadProgressEvent(
                        entry,
                        "queued",
                        0L,
                        pending.contentLength,
                        "STATUS_PENDING",
                        true
                );
                ensurePollingScheduledOnUiThread();
            } catch (Exception e) {
                JSONObject failEv = new JSONObject();
                try {
                    failEv.put("downloadId", "enqueue_error_" + pending.requestId);
                    failEv.put("tabId", pending.tabId);
                    failEv.put("requestId", pending.requestId);
                    failEv.put("state", "failed");
                    failEv.put("bytes", 0L);
                    failEv.put("total", pending.contentLength);
                    failEv.put("reasonCode", "ENQUEUE_FAILED");
                    failEv.put("fileName", sanitizedFileName);
                    failEv.put("mimeType", pending.mimeType);
                } catch (JSONException ignored) {
                }
                bridge.emitContractEvent("onDownloadProgress", failEv);
            }
        });
    }

    /**
     * Cancels an active download via DownloadManager.remove(id).
     */
    public void cancelDownload(final String downloadId) {
        if (downloadId == null || downloadId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            Long sysId = parseSystemDownloadId(downloadId);
            if (sysId == null) return;

            ActiveDownloadEntry removed = activeDownloads.remove(sysId);
            completedDownloads.remove(sysId);

            DownloadManager dm = getSystemDownloadManager();
            if (dm != null) {
                try {
                    dm.remove(sysId);
                } catch (Exception ignored) {
                }
            }

            JSONObject ev = new JSONObject();
            try {
                ev.put("downloadId", String.valueOf(sysId));
                if (removed != null) {
                    ev.put("tabId", removed.tabId);
                    ev.put("requestId", removed.requestId);
                    ev.put("fileName", removed.fileName);
                    ev.put("mimeType", removed.mimeType);
                }
                ev.put("state", "failed");
                ev.put("bytes", removed != null ? Math.max(0L, removed.lastEmittedBytes) : 0L);
                ev.put("total", -1L);
                ev.put("reasonCode", "USER_CANCELLED");
            } catch (JSONException ignored) {
            }
            bridge.emitContractEvent("onDownloadProgress", ev);

            if (activeDownloads.isEmpty()) {
                stopPollingOnUiThread();
            }
        });
    }

    /**
     * Deletes a download record and underlying file via DownloadManager.remove(id).
     */
    public void deleteDownload(final String downloadId) {
        if (downloadId == null || downloadId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            Long sysId = parseSystemDownloadId(downloadId);
            if (sysId == null) return;

            activeDownloads.remove(sysId);
            completedDownloads.remove(sysId);

            DownloadManager dm = getSystemDownloadManager();
            if (dm != null) {
                try {
                    dm.remove(sysId);
                } catch (Exception ignored) {
                }
            }

            if (activeDownloads.isEmpty()) {
                stopPollingOnUiThread();
            }
        });
    }

    /**
     * Opens a completed download via getUriForDownloadedFile + ACTION_VIEW + FLAG_GRANT_READ_URI_PERMISSION
     * inside try/catch ActivityNotFoundException.
     */
    public void openDownload(final String downloadId) {
        if (downloadId == null || downloadId.trim().isEmpty()) return;
        runOnUiThread(() -> {
            Long sysId = parseSystemDownloadId(downloadId);
            if (sysId == null) return;

            DownloadManager dm = getSystemDownloadManager();
            if (dm == null) return;

            Uri contentUri = null;
            String resolvedMime = null;
            try {
                contentUri = dm.getUriForDownloadedFile(sysId);
                resolvedMime = dm.getMimeTypeForDownloadedFile(sysId);
            } catch (Exception ignored) {
            }

            if (contentUri == null) {
                ActiveDownloadEntry entry = completedDownloads.get(sysId);
                JSONObject errEv = new JSONObject();
                try {
                    errEv.put("downloadId", String.valueOf(sysId));
                    if (entry != null) {
                        errEv.put("tabId", entry.tabId);
                        errEv.put("fileName", entry.fileName);
                    }
                    errEv.put("state", "failed");
                    errEv.put("bytes", 0L);
                    errEv.put("total", -1L);
                    errEv.put("reasonCode", "FILE_URI_UNAVAILABLE");
                } catch (JSONException ignored) {
                }
                bridge.emitContractEvent("onDownloadProgress", errEv);
                return;
            }

            if (resolvedMime == null || resolvedMime.trim().isEmpty()) {
                ActiveDownloadEntry entry = completedDownloads.get(sysId);
                resolvedMime = (entry != null && entry.mimeType != null && !entry.mimeType.isEmpty())
                        ? entry.mimeType
                        : "application/octet-stream";
            }

            Intent openIntent = new Intent(Intent.ACTION_VIEW);
            openIntent.setDataAndType(contentUri, resolvedMime);
            openIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            openIntent.setComponent(null);
            openIntent.setSelector(null);

            try {
                activity.startActivity(openIntent);
            } catch (ActivityNotFoundException notFound) {
                JSONObject errEv = new JSONObject();
                try {
                    errEv.put("downloadId", String.valueOf(sysId));
                    errEv.put("state", "completed");
                    errEv.put("bytes", 0L);
                    errEv.put("total", -1L);
                    errEv.put("reasonCode", "NO_ACTIVITY_TO_OPEN_FILE");
                } catch (JSONException ignored) {
                }
                bridge.emitContractEvent("onDownloadProgress", errEv);
            } catch (Exception ignored) {
            }
        });
    }

    /**
     * Reconciles persisted downloadIds on shell startup against Android DownloadManager.Query.
     */
    public void reconcileDownloads(final List<String> downloadIds) {
        if (downloadIds == null || downloadIds.isEmpty()) return;
        runOnUiThread(() -> {
            DownloadManager dm = getSystemDownloadManager();
            if (dm == null) return;

            for (String rawId : downloadIds) {
                Long sysId = parseSystemDownloadId(rawId);
                if (sysId == null) continue;

                DownloadManager.Query query = new DownloadManager.Query();
                query.setFilterById(sysId);
                Cursor cursor = null;
                try {
                    cursor = dm.query(query);
                    if (cursor != null && cursor.moveToFirst()) {
                        ActiveDownloadEntry existing = activeDownloads.get(sysId);
                        if (existing == null) {
                            String title = getCursorString(cursor, DownloadManager.COLUMN_TITLE, "download");
                            String mediaType = normalizeMimeType(
                                    getCursorString(cursor, DownloadManager.COLUMN_MEDIA_TYPE, "application/octet-stream")
                            );
                            existing = new ActiveDownloadEntry(
                                    sysId,
                                    String.valueOf(sysId),
                                    "",
                                    "",
                                    sanitizeFileName(title, mediaType),
                                    mediaType,
                                    ""
                            );
                            activeDownloads.put(sysId, existing);
                        }
                        inspectCursorRowForEntryOnUiThread(cursor, existing, true);
                    } else {
                        JSONObject missingEv = new JSONObject();
                        try {
                            missingEv.put("downloadId", String.valueOf(sysId));
                            missingEv.put("state", "failed");
                            missingEv.put("bytes", 0L);
                            missingEv.put("total", -1L);
                            missingEv.put("reasonCode", "ERROR_MISSING_FROM_SYSTEM");
                        } catch (JSONException ignored) {
                        }
                        bridge.emitContractEvent("onDownloadProgress", missingEv);
                    }
                } catch (Exception ignored) {
                } finally {
                    if (cursor != null) {
                        try {
                            cursor.close();
                        } catch (Exception ignored) {
                        }
                    }
                }
            }

            if (!activeDownloads.isEmpty()) {
                ensurePollingScheduledOnUiThread();
            }
        });
    }

    public void onTabClosed(final String tabId) {
        if (tabId == null) return;
        for (Map.Entry<String, PendingDownloadRequest> entry : pendingRequests.entrySet()) {
            PendingDownloadRequest req = entry.getValue();
            if (req != null && tabId.equals(req.tabId)) {
                pendingRequests.remove(entry.getKey());
                if (req.timeoutRunnable != null) {
                    uiHandler.removeCallbacks(req.timeoutRunnable);
                    req.timeoutRunnable = null;
                }
                req.resolved.set(true);
            }
        }
    }

    public void onHostDestroy() {
        stopPollingOnUiThread();
        for (PendingDownloadRequest req : pendingRequests.values()) {
            if (req != null && req.timeoutRunnable != null) {
                uiHandler.removeCallbacks(req.timeoutRunnable);
                req.timeoutRunnable = null;
            }
        }
        pendingRequests.clear();
        activeDownloads.clear();
        completedDownloads.clear();
    }

    private void ensurePollingScheduledOnUiThread() {
        if (isPollingScheduled || activeDownloads.isEmpty()) {
            return;
        }
        isPollingScheduled = true;
        uiHandler.postDelayed(pollRunnable, DOWNLOAD_POLL_INTERVAL_MS);
    }

    private void stopPollingOnUiThread() {
        isPollingScheduled = false;
        uiHandler.removeCallbacks(pollRunnable);
    }

    private void pollActiveDownloadsOnUiThread() {
        if (activeDownloads.isEmpty()) {
            stopPollingOnUiThread();
            return;
        }

        DownloadManager dm = getSystemDownloadManager();
        if (dm == null) {
            stopPollingOnUiThread();
            return;
        }

        List<Long> trackedIds = new ArrayList<>(activeDownloads.keySet());
        long[] filterIds = new long[trackedIds.size()];
        for (int i = 0; i < trackedIds.size(); i++) {
            filterIds[i] = trackedIds.get(i);
        }

        DownloadManager.Query query = new DownloadManager.Query();
        query.setFilterById(filterIds);

        List<Long> seenInCursor = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = dm.query(query);
            while (cursor != null && cursor.moveToNext()) {
                int idCol = cursor.getColumnIndex(DownloadManager.COLUMN_ID);
                if (idCol < 0) continue;
                long sysId = cursor.getLong(idCol);
                seenInCursor.add(sysId);

                ActiveDownloadEntry entry = activeDownloads.get(sysId);
                if (entry != null) {
                    inspectCursorRowForEntryOnUiThread(cursor, entry, false);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                try {
                    cursor.close();
                } catch (Exception ignored) {
                }
            }
        }

        // Any active download missing from the cursor was removed externally
        for (Long trackedId : trackedIds) {
            if (!seenInCursor.contains(trackedId)) {
                ActiveDownloadEntry removed = activeDownloads.remove(trackedId);
                if (removed != null) {
                    emitDownloadProgressEvent(
                            removed,
                            "failed",
                            Math.max(0L, removed.lastEmittedBytes),
                            -1L,
                            "ERROR_REMOVED",
                            true
                    );
                }
            }
        }

        if (!activeDownloads.isEmpty()) {
            ensurePollingScheduledOnUiThread();
        } else {
            stopPollingOnUiThread();
        }
    }

    private void inspectCursorRowForEntryOnUiThread(
            Cursor cursor,
            ActiveDownloadEntry entry,
            boolean forceEmit
    ) {
        int status = getCursorInt(cursor, DownloadManager.COLUMN_STATUS, DownloadManager.STATUS_RUNNING);
        int reason = getCursorInt(cursor, DownloadManager.COLUMN_REASON, 0);
        long bytes = Math.max(0L, getCursorLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0L));
        long total = getCursorLong(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES, -1L);
        String mediaType = getCursorString(cursor, DownloadManager.COLUMN_MEDIA_TYPE, entry.mimeType);
        if (mediaType != null && !mediaType.trim().isEmpty()) {
            entry.mimeType = normalizeMimeType(mediaType);
        }

        String state;
        String reasonCode;
        boolean isTerminal = false;

        switch (status) {
            case DownloadManager.STATUS_PENDING:
                state = "queued";
                reasonCode = "STATUS_PENDING";
                break;
            case DownloadManager.STATUS_RUNNING:
                state = "running";
                reasonCode = "STATUS_RUNNING";
                break;
            case DownloadManager.STATUS_PAUSED:
                if (reason == DownloadManager.PAUSED_WAITING_FOR_NETWORK
                        || reason == DownloadManager.PAUSED_WAITING_TO_RETRY
                        || reason == DownloadManager.PAUSED_QUEUED_FOR_WIFI) {
                    state = "waiting_network";
                    reasonCode = mapPausedReasonCode(reason);
                } else {
                    state = "paused";
                    reasonCode = mapPausedReasonCode(reason);
                }
                break;
            case DownloadManager.STATUS_SUCCESSFUL:
                state = "completed";
                reasonCode = "STATUS_SUCCESSFUL";
                isTerminal = true;
                break;
            case DownloadManager.STATUS_FAILED:
            default:
                state = "failed";
                reasonCode = mapFailedReasonCode(reason);
                isTerminal = true;
                break;
        }

        emitDownloadProgressEvent(entry, state, bytes, total, reasonCode, forceEmit || isTerminal);

        if (isTerminal) {
            activeDownloads.remove(entry.systemDownloadId);
            if ("completed".equals(state)) {
                if (completedDownloads.size() >= MAX_COMPLETED_DOWNLOAD_ENTRIES) {
                    completedDownloads.clear();
                }
                completedDownloads.put(entry.systemDownloadId, entry);
                emitDownloadCompletedEvent(entry, bytes, total);
            }
        }
    }

    private void emitDownloadProgressEvent(
            ActiveDownloadEntry entry,
            String state,
            long bytes,
            long total,
            String reasonCode,
            boolean force
    ) {
        long now = System.currentTimeMillis();
        boolean stateChanged = !state.equals(entry.lastEmittedState) || !reasonCode.equals(entry.lastEmittedReason);
        boolean byteDeltaReached = Math.abs(bytes - entry.lastEmittedBytes) >= PROGRESS_MIN_BYTE_DELTA;
        boolean timeReached = (now - entry.lastEmitTimestampMs) >= PROGRESS_THROTTLE_MS;

        if (!force && !stateChanged && !(byteDeltaReached && timeReached)) {
            return;
        }

        entry.lastEmittedState = state;
        entry.lastEmittedReason = reasonCode;
        entry.lastEmittedBytes = bytes;
        entry.lastEmitTimestampMs = now;

        JSONObject ev = new JSONObject();
        try {
            ev.put("downloadId", entry.downloadId);
            if (entry.tabId != null && !entry.tabId.isEmpty()) {
                ev.put("tabId", entry.tabId);
            }
            if (entry.requestId != null && !entry.requestId.isEmpty()) {
                ev.put("requestId", entry.requestId);
            }
            ev.put("state", state);
            ev.put("bytes", bytes);
            ev.put("total", total);
            ev.put("reasonCode", reasonCode);
            ev.put("fileName", entry.fileName);
            ev.put("mimeType", entry.mimeType);
            if (entry.displayUrl != null && !entry.displayUrl.isEmpty()) {
                ev.put("url", entry.displayUrl);
            }
        } catch (JSONException ignored) {
        }
        bridge.emitContractEvent("onDownloadProgress", ev);
    }

    private void emitDownloadCompletedEvent(ActiveDownloadEntry entry, long bytes, long total) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("downloadId", entry.downloadId);
            if (entry.tabId != null && !entry.tabId.isEmpty()) {
                ev.put("tabId", entry.tabId);
            }
            if (entry.requestId != null && !entry.requestId.isEmpty()) {
                ev.put("requestId", entry.requestId);
            }
            ev.put("fileName", entry.fileName);
            ev.put("mimeType", entry.mimeType);
            ev.put("bytes", bytes);
            ev.put("total", total >= 0L ? total : bytes);
            if (entry.displayUrl != null && !entry.displayUrl.isEmpty()) {
                ev.put("url", entry.displayUrl);
            }
        } catch (JSONException ignored) {
        }
        bridge.emitContractEvent("onDownloadCompleted", ev);
    }

    private void emitUnsupportedDownloadEvent(
            String tabId,
            String displayUrl,
            String scheme,
            String reasonCode,
            String message
    ) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("tabId", tabId);
            ev.put("url", displayUrl);
            ev.put("scheme", scheme);
            ev.put("reasonCode", reasonCode);
            ev.put("message", message);
        } catch (JSONException ignored) {
        }
        bridge.emitContractEvent("onDownloadUnsupported", ev);
    }

    private DownloadManager getSystemDownloadManager() {
        try {
            Object svc = activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (svc instanceof DownloadManager) {
                return (DownloadManager) svc;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static Long parseSystemDownloadId(String raw) {
        if (raw == null) return null;
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static int getCursorInt(Cursor cursor, String column, int fallback) {
        int idx = cursor.getColumnIndex(column);
        return idx >= 0 && !cursor.isNull(idx) ? cursor.getInt(idx) : fallback;
    }

    private static long getCursorLong(Cursor cursor, String column, long fallback) {
        int idx = cursor.getColumnIndex(column);
        return idx >= 0 && !cursor.isNull(idx) ? cursor.getLong(idx) : fallback;
    }

    private static String getCursorString(Cursor cursor, String column, String fallback) {
        int idx = cursor.getColumnIndex(column);
        if (idx >= 0 && !cursor.isNull(idx)) {
            String val = cursor.getString(idx);
            if (val != null) return val;
        }
        return fallback;
    }

    private static String mapPausedReasonCode(int reason) {
        switch (reason) {
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK:
                return "PAUSED_WAITING_FOR_NETWORK";
            case DownloadManager.PAUSED_WAITING_TO_RETRY:
                return "PAUSED_WAITING_TO_RETRY";
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI:
                return "PAUSED_QUEUED_FOR_WIFI";
            case DownloadManager.PAUSED_UNKNOWN:
            default:
                return "PAUSED_UNKNOWN";
        }
    }

    private static String mapFailedReasonCode(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_CANNOT_RESUME:
                return "ERROR_CANNOT_RESUME";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND:
                return "ERROR_DEVICE_NOT_FOUND";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS:
                return "ERROR_FILE_ALREADY_EXISTS";
            case DownloadManager.ERROR_FILE_ERROR:
                return "ERROR_FILE_ERROR";
            case DownloadManager.ERROR_HTTP_DATA_ERROR:
                return "ERROR_HTTP_DATA_ERROR";
            case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                return "ERROR_INSUFFICIENT_SPACE";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS:
                return "ERROR_TOO_MANY_REDIRECTS";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE:
                return "ERROR_UNHANDLED_HTTP_CODE";
            case DownloadManager.ERROR_UNKNOWN:
            default:
                return "ERROR_UNKNOWN";
        }
    }

    /**
     * Sanitizes a URL for display so only origin + path are shown (query and fragment stripped).
     */
    public static String sanitizeDisplayUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return "";
        }
        String trimmed = rawUrl.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.startsWith("blob:")) {
            return "blob://unsupported";
        }
        if (lower.startsWith("data:")) {
            return "data://unsupported";
        }
        try {
            Uri uri = Uri.parse(trimmed);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
            String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
            int port = uri.getPort();
            String path = uri.getEncodedPath();
            if (path == null || path.isEmpty()) {
                path = "/";
            }
            if (("http".equals(scheme) || "https".equals(scheme)) && !host.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                sb.append(scheme).append("://").append(host);
                if (port > 0 && !(("http".equals(scheme) && port == 80) || ("https".equals(scheme) && port == 443))) {
                    sb.append(":").append(port);
                }
                sb.append(path);
                return sb.toString();
            }
        } catch (Exception ignored) {
        }
        int qIdx = trimmed.indexOf('?');
        int hIdx = trimmed.indexOf('#');
        int cut = trimmed.length();
        if (qIdx >= 0 && qIdx < cut) cut = qIdx;
        if (hIdx >= 0 && hIdx < cut) cut = hIdx;
        return trimmed.substring(0, cut);
    }

    private static String normalizeMimeType(String rawMime) {
        if (rawMime == null || rawMime.trim().isEmpty()) {
            return "application/octet-stream";
        }
        String trimmed = rawMime.trim();
        int semi = trimmed.indexOf(';');
        if (semi >= 0) {
            trimmed = trimmed.substring(0, semi).trim();
        }
        return trimmed.isEmpty() ? "application/octet-stream" : trimmed.toLowerCase(Locale.ROOT);
    }

    /**
     * Sanitizes a download file name:
     * - Strips path separators, traversal sequences, and control characters
     * - Adds an extension derived from mimeType if missing
     * - Enforces max 120 characters while preserving the extension
     */
    public static String sanitizeFileName(String rawName, String mimeType) {
        String input = rawName != null ? rawName.trim() : "";
        StringBuilder sb = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (c <= 0x1F || c == 0x7F || c == '/' || c == '\\' || c == ':' || c == '*'
                    || c == '?' || c == '"' || c == '<' || c == '>' || c == '|') {
                sb.append('_');
            } else {
                sb.append(c);
            }
        }
        String cleaned = sb.toString().replaceAll("\\.{2,}", ".").trim();
        while (cleaned.startsWith(".") || cleaned.startsWith("_") || cleaned.startsWith(" ")) {
            cleaned = cleaned.substring(1);
        }
        while (cleaned.endsWith(".") || cleaned.endsWith(" ")) {
            cleaned = cleaned.substring(0, cleaned.length() - 1);
        }
        if (cleaned.isEmpty()) {
            cleaned = "download";
        }

        String normMime = normalizeMimeType(mimeType);
        int lastDot = cleaned.lastIndexOf('.');
        boolean hasValidExt = false;
        if (lastDot > 0 && lastDot < cleaned.length() - 1) {
            String candidateExt = cleaned.substring(lastDot + 1);
            if (candidateExt.length() >= 1 && candidateExt.length() <= 10
                    && candidateExt.matches("^[a-zA-Z0-9]+$")) {
                hasValidExt = true;
            }
        }

        String base = cleaned;
        String ext = "";
        if (hasValidExt) {
            base = cleaned.substring(0, lastDot);
            ext = cleaned.substring(lastDot);
        } else {
            String resolvedExt = resolveExtensionForMime(normMime);
            if (!resolvedExt.isEmpty()) {
                ext = "." + resolvedExt;
            }
        }

        if (base.length() + ext.length() > MAX_FILENAME_LENGTH) {
            int maxBase = Math.max(1, MAX_FILENAME_LENGTH - ext.length());
            base = base.substring(0, Math.min(base.length(), maxBase));
            while (base.endsWith(".") || base.endsWith("_") || base.endsWith(" ")) {
                base = base.substring(0, base.length() - 1);
            }
            if (base.isEmpty()) {
                base = "download";
            }
        }

        return base + ext;
    }

    private static String resolveExtensionForMime(String normMime) {
        if (normMime == null || normMime.isEmpty()) return "";
        try {
            String sysExt = MimeTypeMap.getSingleton().getExtensionFromMimeType(normMime);
            if (sysExt != null && !sysExt.trim().isEmpty()) {
                return sysExt.trim().toLowerCase(Locale.ROOT);
            }
        } catch (Exception ignored) {
        }
        switch (normMime) {
            case "application/pdf":
                return "pdf";
            case "application/zip":
            case "application/x-zip-compressed":
                return "zip";
            case "application/gzip":
                return "gz";
            case "application/json":
                return "json";
            case "application/vnd.android.package-archive":
                return "apk";
            case "application/octet-stream":
                return "bin";
            case "text/plain":
                return "txt";
            case "text/html":
                return "html";
            case "text/csv":
                return "csv";
            case "image/jpeg":
                return "jpg";
            case "image/png":
                return "png";
            case "image/gif":
                return "gif";
            case "image/webp":
                return "webp";
            case "audio/mpeg":
                return "mp3";
            case "video/mp4":
                return "mp4";
            default:
                return "";
        }
    }
}
