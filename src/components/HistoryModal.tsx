import React, { useState } from "react";
import { History, X, Trash2, Search, Zap, ArrowUpRight } from "lucide-react";
import { HistoryEntry } from "../types";
import { Language, translations } from "../locales";
import { formatBytes, formatDate } from "../utils/formatters";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  onNavigate: (url: string) => void;
  onDeleteEntry: (id: string) => void;
  onClearHistory: () => void;
  onOpenClearData?: () => void;
  lang: Language;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onNavigate,
  onDeleteEntry,
  onClearHistory,
  onOpenClearData,
  lang,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const t = translations[lang];

  const filtered = history.filter(
    (h) =>
      h.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      id="history-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2
                id="history-modal-title"
                className="text-sm font-bold text-stone-900 dark:text-stone-100"
              >
                {t.historyModalTitle}
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {lang === "bn"
                  ? "স্থানীয় মেমোরি • কোনো সার্ভারে ডেটা পাঠানো হয় না"
                  : "Local-only audit log • Stored strictly on device"}
              </p>
            </div>
          </div>
          <button
            id="btn-close-history"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors touch-manipulation cursor-pointer"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <input
              id="input-search-history"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={lang === "bn" ? "ইতিহাস খুঁজুন..." : "Search history..."}
              aria-label={lang === "bn" ? "ইতিহাস খুঁজুন" : "Search history"}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-xs focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-stone-900 dark:text-stone-100"
            />
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {history.length > 0 && (
            <>
              {showConfirmClear ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="btn-confirm-clear-history"
                    onClick={() => {
                      onClearHistory();
                      setShowConfirmClear(false);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors touch-manipulation cursor-pointer"
                  >
                    {lang === "bn" ? "নিশ্চিত" : "Confirm"}
                  </button>
                  <button
                    id="btn-cancel-clear-history"
                    onClick={() => setShowConfirmClear(false)}
                    className="px-2 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-[11px] transition-colors touch-manipulation cursor-pointer"
                  >
                    {lang === "bn" ? "বাতিল" : "Cancel"}
                  </button>
                </div>
              ) : (
                <button
                  id="btn-clear-all-history"
                  onClick={() => {
                    if (onOpenClearData) {
                      onClose();
                      onOpenClearData();
                    } else {
                      setShowConfirmClear(true);
                    }
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium text-xs flex items-center gap-1 shrink-0 transition-colors touch-manipulation cursor-pointer"
                  title={t.clearBrowsingDataTitle || "Clear Browsing Data"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.clearBrowsingDataTitle || "Clear Browsing Data"}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {history.length === 0 ? (
            <div className="text-center py-10 text-stone-400 space-y-2">
              <History className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-700" />
              <p className="text-xs">
                {lang === "bn" ? "কোনো ব্রাউজিং ইতিহাস সংরক্ষিত নেই।" : "No browsing history yet."}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-stone-400 text-xs">
              {lang === "bn" ? "কোনো মিল পাওয়া যায়নি।" : "No matching records found."}
            </p>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                id={`history-item-${item.id}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onNavigate(item.url);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigate(item.url);
                    onClose();
                  }
                }}
                className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 hover:border-emerald-500/50 cursor-pointer flex items-center justify-between gap-3 transition-colors group focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block truncate group-hover:text-emerald-600 transition-colors">
                    {item.title || item.url}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-1">
                    <span className="truncate max-w-[200px] sm:max-w-[260px]">{item.url}</span>
                    <span>•</span>
                    <span>{formatDate(item.timestamp, lang)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.savedBytes > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full shrink-0">
                      <Zap className="w-3 h-3" />
                      <span>{formatBytes(item.savedBytes)}</span>
                    </div>
                  )}

                  <button
                    id={`btn-delete-hist-${item.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEntry(item.id);
                    }}
                    className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/60 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors touch-manipulation cursor-pointer"
                    title={t.deleteHistoryEntry}
                    aria-label={t.deleteHistoryEntry}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <ArrowUpRight className="w-4 h-4 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
