import React, { useState } from "react";
import {
  DownloadCloud,
  X,
  Trash2,
  ExternalLink,
  Search,
  FileText,
  Clock,
  HardDrive,
} from "lucide-react";
import { OfflineCapsule } from "../types";
import { Language, translations } from "../locales";
import { formatBytes, formatDate } from "../utils/formatters";

interface OfflineCapsulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  capsules: OfflineCapsule[];
  onOpenCapsule: (capsule: OfflineCapsule) => void;
  onDeleteCapsule: (id: string) => void;
  onClearAllCapsules?: () => void;
  lang: Language;
}

export const OfflineCapsulesModal: React.FC<OfflineCapsulesModalProps> = ({
  isOpen,
  onClose,
  capsules,
  onOpenCapsule,
  onDeleteCapsule,
  onClearAllCapsules,
  lang,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const t = translations[lang];

  const totalByteSize = capsules.reduce((acc, cap) => acc + (cap.byteSize || 0), 0);

  const filtered = capsules.filter(
    (c) =>
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      id="offline-capsules-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="offline-capsules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-capsules-modal-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DownloadCloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2
                id="offline-capsules-modal-title"
                className="text-sm font-bold text-stone-900 dark:text-stone-100"
              >
                {t.offlineModalTitle}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                <span>
                  {capsules.length}{" "}
                  {lang === "bn" ? "টি সংরক্ষিত পৃষ্ঠা" : "saved pages"}
                </span>
                <span>•</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {t.capsulesTotalStored}: {formatBytes(totalByteSize)}
                </span>
              </div>
            </div>
          </div>
          <button
            id="btn-close-offline-capsules"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors touch-manipulation cursor-pointer"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Bulk Actions */}
        <div className="p-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <input
              id="input-search-capsules"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.searchCapsulesPlaceholder}
              aria-label={t.searchCapsulesPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-xs focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-stone-900 dark:text-stone-100"
            />
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {capsules.length > 0 && onClearAllCapsules && (
            <>
              {showConfirmClear ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="btn-confirm-clear-capsules"
                    onClick={() => {
                      onClearAllCapsules();
                      setShowConfirmClear(false);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors touch-manipulation cursor-pointer"
                  >
                    {t.confirmClearAllCapsules}
                  </button>
                  <button
                    id="btn-cancel-clear-capsules"
                    onClick={() => setShowConfirmClear(false)}
                    className="px-2 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-[11px] transition-colors touch-manipulation cursor-pointer"
                  >
                    {t.cancelClearAllCapsules}
                  </button>
                </div>
              ) : (
                <button
                  id="btn-clear-all-capsules"
                  onClick={() => setShowConfirmClear(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium text-xs flex items-center gap-1 shrink-0 transition-colors touch-manipulation cursor-pointer"
                  title={t.clearAllCapsules}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.clearAllCapsules}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {capsules.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <HardDrive className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto" />
              <p className="text-stone-500 dark:text-stone-400 text-xs">
                {t.noCapsulesYet}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-6 text-stone-400 text-xs">
              {t.noMatchingCapsules}
            </p>
          ) : (
            filtered.map((cap) => (
              <div
                key={cap.id}
                id={`capsule-item-${cap.id}`}
                className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 hover:border-emerald-500/50 flex items-center justify-between gap-3 transition-colors"
              >
                <div
                  onClick={() => {
                    onOpenCapsule(cap);
                    onClose();
                  }}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block truncate hover:text-emerald-600 transition-colors">
                    {cap.title}
                  </span>
                  <div className="flex items-center gap-3 text-[10px] text-stone-400 mt-1">
                    <span className="truncate max-w-[200px]">{cap.url}</span>
                    <span>•</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {formatBytes(cap.byteSize)}
                    </span>
                    <span>•</span>
                    <span>{formatDate(cap.savedAt, lang)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    id={`btn-open-capsule-${cap.id}`}
                    onClick={() => {
                      onOpenCapsule(cap);
                      onClose();
                    }}
                    className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors touch-manipulation cursor-pointer"
                    title={t.readOffline}
                    aria-label={t.readOffline}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    id={`btn-delete-capsule-${cap.id}`}
                    onClick={() => onDeleteCapsule(cap.id)}
                    className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors touch-manipulation cursor-pointer"
                    title={t.deleteCapsule}
                    aria-label={t.deleteCapsule}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
