import React, { useState } from "react";
import { Bookmark as BookmarkIcon, Star, X, Trash2, Search, ArrowUpRight } from "lucide-react";
import { Bookmark } from "../types";
import { Language, translations } from "../locales";

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onRemoveBookmark: (id: string) => void;
  onClearBookmarks: () => void;
  lang: Language;
}

export const BookmarksModal: React.FC<BookmarksModalProps> = ({
  isOpen,
  onClose,
  bookmarks,
  onNavigate,
  onRemoveBookmark,
  onClearBookmarks,
  lang,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const t = translations[lang];

  const filtered = bookmarks.filter(
    (b) =>
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      id="bookmarks-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="bookmarks-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmarks-modal-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
            <div>
              <h2
                id="bookmarks-modal-title"
                className="text-sm font-bold text-stone-900 dark:text-stone-100"
              >
                {t.bookmarksModalTitle}
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {lang === "bn"
                  ? "স্থানীয় মেমোরি • কোনো সার্ভারে ডেটা পাঠানো হয় না"
                  : "Local-only • Stored strictly on device"}
              </p>
            </div>
          </div>
          <button
            id="btn-close-bookmarks"
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
              id="input-search-bookmarks"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={lang === "bn" ? "বুকমার্ক খুঁজুন..." : "Search bookmarks..."}
              aria-label={lang === "bn" ? "বুকমার্ক খুঁজুন" : "Search bookmarks"}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-xs focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-stone-900 dark:text-stone-100"
            />
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {bookmarks.length > 0 && (
            <>
              {showConfirmClear ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="btn-confirm-clear-bookmarks"
                    onClick={() => {
                      onClearBookmarks();
                      setShowConfirmClear(false);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors touch-manipulation cursor-pointer"
                  >
                    {lang === "bn" ? "নিশ্চিত" : "Confirm"}
                  </button>
                  <button
                    id="btn-cancel-clear-bookmarks"
                    onClick={() => setShowConfirmClear(false)}
                    className="px-2 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-[11px] transition-colors touch-manipulation cursor-pointer"
                  >
                    {lang === "bn" ? "বাতিল" : "Cancel"}
                  </button>
                </div>
              ) : (
                <button
                  id="btn-clear-all-bookmarks"
                  onClick={() => setShowConfirmClear(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium text-xs flex items-center gap-1 shrink-0 transition-colors touch-manipulation cursor-pointer"
                  title={t.clearBookmarks}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{lang === "bn" ? "সব মুছুন" : "Clear All"}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Bookmarks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {bookmarks.length === 0 ? (
            <div className="text-center py-10 text-stone-400 space-y-2">
              <Star className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-700" />
              <p className="text-xs max-w-xs mx-auto">
                {t.noBookmarksYet}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-stone-400 text-xs">
              {lang === "bn" ? "কোনো মিল পাওয়া যায়নি।" : "No matching bookmarks found."}
            </p>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                id={`bookmark-item-${item.id}`}
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
                <div className="p-2 rounded-lg bg-stone-200/60 dark:bg-stone-800 text-amber-500 shrink-0 group-hover:bg-amber-100 dark:group-hover:bg-amber-950/40 transition-colors">
                  <BookmarkIcon className="w-4 h-4 fill-amber-400 text-amber-500" />
                </div>

                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block truncate group-hover:text-emerald-600 transition-colors">
                    {item.title || item.url}
                  </span>
                  <span className="text-[11px] text-stone-400 block truncate mt-0.5">
                    {item.url}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    id={`btn-remove-bm-${item.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBookmark(item.id);
                    }}
                    className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/60 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors touch-manipulation cursor-pointer"
                    title={t.deleteBookmark}
                    aria-label={t.deleteBookmark}
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
