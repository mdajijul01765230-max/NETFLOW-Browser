import React, { useState, useMemo } from "react";
import {
  Download,
  Search,
  X,
  Trash2,
  ExternalLink,
  RotateCw,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  File,
  FileText,
  FileCode,
  FileArchive,
  FileVideo,
  FileAudio,
  FileImage,
  Loader2,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import { Language, translations } from "../locales";
import { formatBytes } from "../utils/formatters";
import { PersistedDownloadRecord } from "../services/androidWebViewDownloadPersistenceAndRecovery";
import { DownloadLifecycleState } from "../services/androidWebViewDownloadRequestLifecycle";

interface DownloadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  downloads: PersistedDownloadRecord[];
  onRemoveDownload: (downloadId: string) => void;
  onClearAllDownloads: () => void;
  onRedownload: (url: string, filename: string) => void;
  onOpenFile?: (url: string, downloadId?: string) => void;
  lang: Language;
}

type FilterType = "all" | "completed" | "active" | "interrupted";

function getFileIcon(filename: string, mimeType: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType.toLowerCase();

  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext) || mime.startsWith("image/")) {
    return <FileImage className="w-5 h-5 text-emerald-500" />;
  }
  if (["mp4", "webm", "mkv", "mov", "avi"].includes(ext) || mime.startsWith("video/")) {
    return <FileVideo className="w-5 h-5 text-purple-500" />;
  }
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext) || mime.startsWith("audio/")) {
    return <FileAudio className="w-5 h-5 text-amber-500" />;
  }
  if (["zip", "tar", "gz", "rar", "7z", "apk"].includes(ext) || mime.includes("zip") || mime.includes("tar")) {
    return <FileArchive className="w-5 h-5 text-blue-500" />;
  }
  if (["js", "ts", "html", "css", "json", "py", "sh"].includes(ext)) {
    return <FileCode className="w-5 h-5 text-indigo-500" />;
  }
  if (["pdf", "doc", "docx", "txt", "rtf", "md"].includes(ext) || mime.includes("pdf") || mime.includes("document")) {
    return <FileText className="w-5 h-5 text-rose-500" />;
  }
  return <File className="w-5 h-5 text-stone-400" />;
}

export const DownloadsModal: React.FC<DownloadsModalProps> = ({
  isOpen,
  onClose,
  downloads,
  onRemoveDownload,
  onClearAllDownloads,
  onRedownload,
  onOpenFile,
  lang,
}) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Filter & Search logic
  const filteredDownloads = useMemo(() => {
    return downloads
      .filter((dl) => {
        // Tab / Category filter
        if (filter === "completed") {
          return dl.lifecycleState === DownloadLifecycleState.COMPLETED;
        }
        if (filter === "active") {
          return (
            dl.lifecycleState === DownloadLifecycleState.DOWNLOADING ||
            dl.lifecycleState === DownloadLifecycleState.STARTING ||
            dl.lifecycleState === DownloadLifecycleState.VALIDATING ||
            dl.lifecycleState === DownloadLifecycleState.PENDING_CONSENT
          );
        }
        if (filter === "interrupted") {
          return (
            dl.lifecycleState === DownloadLifecycleState.PAUSED ||
            dl.lifecycleState === DownloadLifecycleState.FAILED ||
            dl.lifecycleState === DownloadLifecycleState.CANCELLED ||
            dl.lifecycleState === DownloadLifecycleState.BLOCKED_SECURITY
          );
        }
        return true;
      })
      .filter((dl) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          dl.filename.toLowerCase().includes(q) ||
          dl.domain.toLowerCase().includes(q) ||
          dl.mimeType.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [downloads, filter, searchQuery]);

  // Aggregate stats
  const totalSizeBytes = useMemo(() => {
    return downloads.reduce((acc, dl) => acc + (dl.totalBytes || dl.receivedBytes || 0), 0);
  }, [downloads]);

  const activeCount = useMemo(() => {
    return downloads.filter(
      (dl) =>
        dl.lifecycleState === DownloadLifecycleState.DOWNLOADING ||
        dl.lifecycleState === DownloadLifecycleState.STARTING ||
        dl.lifecycleState === DownloadLifecycleState.VALIDATING ||
        dl.lifecycleState === DownloadLifecycleState.PENDING_CONSENT
    ).length;
  }, [downloads]);

  if (!isOpen) return null;

  const handleCopyLink = (id: string, url: string) => {
    try {
      navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr));
      }, 2000);
    } catch {
      // Fallback
      setCopiedId(null);
    }
  };

  const formatTimestamp = (ts: number) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      id="downloads-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        id="downloads-modal-card"
        className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="downloads-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  id="downloads-modal-title"
                  className="font-bold text-stone-900 dark:text-stone-100 text-base sm:text-lg truncate"
                >
                  {t.downloadsModalTitle || "Downloads Manager"}
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono">
                  {downloads.length}
                </span>
                {activeCount > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{activeCount} active</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                {t.downloadsSubtitle || "Saved files, progress and download history"} • {formatBytes(totalSizeBytes)}
              </p>
            </div>
          </div>
          <button
            id="btn-close-downloads-modal"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-3 sm:p-4 bg-stone-50/80 dark:bg-stone-850/80 border-b border-stone-100 dark:border-stone-800 shrink-0 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              id="downloads-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchDownloadsPlaceholder || "Search downloaded files..."}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-750 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 text-stone-900 dark:text-stone-100 placeholder-stone-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips & Clear Action */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setFilter("all")}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  filter === "all"
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-750 border border-stone-200 dark:border-stone-700"
                }`}
              >
                {t.filterAll || "All"} ({downloads.length})
              </button>
              <button
                onClick={() => setFilter("completed")}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  filter === "completed"
                    ? "bg-emerald-600 text-white"
                    : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-750 border border-stone-200 dark:border-stone-700"
                }`}
              >
                {t.filterCompleted || "Completed"} (
                {downloads.filter((dl) => dl.lifecycleState === DownloadLifecycleState.COMPLETED).length})
              </button>
              <button
                onClick={() => setFilter("active")}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  filter === "active"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-750 border border-stone-200 dark:border-stone-700"
                }`}
              >
                {t.filterActive || "Active"} ({activeCount})
              </button>
              <button
                onClick={() => setFilter("interrupted")}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  filter === "interrupted"
                    ? "bg-amber-600 text-white"
                    : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-750 border border-stone-200 dark:border-stone-700"
                }`}
              >
                {t.filterInterrupted || "Paused / Failed"} (
                {
                  downloads.filter(
                    (dl) =>
                      dl.lifecycleState === DownloadLifecycleState.PAUSED ||
                      dl.lifecycleState === DownloadLifecycleState.FAILED ||
                      dl.lifecycleState === DownloadLifecycleState.CANCELLED ||
                      dl.lifecycleState === DownloadLifecycleState.BLOCKED_SECURITY
                  ).length
                }
                )
              </button>
            </div>

            {/* Clear All action */}
            {downloads.length > 0 && (
              <div className="shrink-0">
                {confirmClear ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      id="btn-confirm-clear-downloads"
                      onClick={() => {
                        onClearAllDownloads();
                        setConfirmClear(false);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
                    >
                      {t.confirmClearDownloads || "Clear All"}
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="px-2 py-1 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                    >
                      {t.cancelClearDownloads || "Cancel"}
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-clear-downloads-history"
                    onClick={() => setConfirmClear(true)}
                    className="flex items-center gap-1 text-xs text-stone-500 hover:text-rose-600 dark:text-stone-400 dark:hover:text-rose-400 py-1 px-2 rounded-lg transition-colors cursor-pointer"
                    title={t.clearDownloads || "Clear download history"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.clearDownloads || "Clear history"}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Download Items List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 divide-y divide-stone-100 dark:divide-stone-800">
          {filteredDownloads.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400">
                <Download className="w-7 h-7" />
              </div>
              <h3 className="font-semibold text-stone-800 dark:text-stone-200 text-sm mb-1">
                {searchQuery
                  ? "No matching downloads found"
                  : t.noDownloadsYet || "No downloads yet"}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mx-auto">
                {searchQuery
                  ? "Try checking your spelling or adjusting the active filters."
                  : t.noDownloadsYet ||
                    "Files downloaded while browsing will appear here with complete verification and resume support."}
              </p>
            </div>
          ) : (
            filteredDownloads.map((dl) => {
              const isCompleted = dl.lifecycleState === DownloadLifecycleState.COMPLETED;
              const isActive =
                dl.lifecycleState === DownloadLifecycleState.DOWNLOADING ||
                dl.lifecycleState === DownloadLifecycleState.STARTING ||
                dl.lifecycleState === DownloadLifecycleState.VALIDATING ||
                dl.lifecycleState === DownloadLifecycleState.PENDING_CONSENT;
              const isInterrupted = dl.lifecycleState === DownloadLifecycleState.PAUSED;
              const isFailed =
                dl.lifecycleState === DownloadLifecycleState.FAILED ||
                dl.lifecycleState === DownloadLifecycleState.CANCELLED ||
                dl.lifecycleState === DownloadLifecycleState.BLOCKED_SECURITY;

              const progressPercent =
                dl.totalBytes > 0
                  ? Math.min(100, Math.round((dl.receivedBytes / dl.totalBytes) * 100))
                  : undefined;

              return (
                <div
                  key={dl.downloadId}
                  id={`download-item-${dl.downloadId}`}
                  className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-850/60 border border-stone-200/80 dark:border-stone-800 transition-colors"
                >
                  {/* File Info */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 mt-0.5 border border-stone-200/60 dark:border-stone-700/60">
                      {getFileIcon(dl.filename, dl.mimeType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium text-stone-900 dark:text-stone-100 text-xs sm:text-sm truncate block"
                          title={dl.filename}
                        >
                          {dl.filename}
                        </span>
                        {/* Status Badge */}
                        {isCompleted && (
                          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Done</span>
                          </span>
                        )}
                        {isActive && (
                          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center gap-1 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{progressPercent !== undefined ? `${progressPercent}%` : "Downloading"}</span>
                          </span>
                        )}
                        {isInterrupted && (
                          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>
                              {dl.failureReason?.includes("WAITING") ||
                              dl.failureReason?.includes("waiting_network")
                                ? "Waiting network"
                                : "Interrupted"}
                            </span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </div>

                      {/* Meta line */}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500 dark:text-stone-400 flex-wrap">
                        <span className="font-mono">{dl.domain || "web"}</span>
                        <span>•</span>
                        <span>
                          {dl.totalBytes > 0
                            ? formatBytes(dl.totalBytes)
                            : formatBytes(dl.receivedBytes)}
                        </span>
                        {dl.createdAt && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-stone-400" />
                              {formatTimestamp(dl.createdAt)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar for Active / Partial */}
                      {isActive && progressPercent !== undefined && (
                        <div className="mt-2 w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 sm:self-center shrink-0 justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100 dark:border-stone-800">
                    {/* Open File / View URL */}
                    {isCompleted && onOpenFile && (
                      <button
                        onClick={() => {
                          onOpenFile(dl.safeUrl, dl.downloadId);
                          onClose();
                        }}
                        className="p-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        title={t.openFile || "Open file"}
                        aria-label="Open file"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}

                    {/* Re-download / Resume */}
                    <button
                      onClick={() => onRedownload(dl.safeUrl, dl.filename)}
                      className="p-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      title={t.redownload || "Re-download"}
                      aria-label="Re-download"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    {/* Copy Safe URL */}
                    <button
                      onClick={() => handleCopyLink(dl.downloadId, dl.safeUrl)}
                      className="p-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      title={t.copyDownloadLink || "Copy safe download link"}
                      aria-label="Copy link"
                    >
                      {copiedId === dl.downloadId ? (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Remove Record */}
                    <button
                      onClick={() => onRemoveDownload(dl.downloadId)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 dark:text-stone-400 dark:hover:text-rose-400 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      title={t.removeDownload || "Remove from list"}
                      aria-label="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-stone-50 dark:bg-stone-850 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Zero secret exposure • Private downloads strictly ephemeral</span>
          </span>
          <span className="font-mono text-[11px]">
            Ctrl+J / ⌘J
          </span>
        </div>
      </div>
    </div>
  );
};
