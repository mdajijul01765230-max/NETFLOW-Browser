import React from "react";
import { Plus, X, Globe, EyeOff, Cpu, Check, Layers, RotateCcw } from "lucide-react";
import { BrowserTab } from "../types";
import { Language, translations } from "../locales";

interface TabSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOtherTabs?: (keepTabId: string) => void;
  onNewTab: (isPrivate?: boolean) => void;
  onRestoreClosedTab?: () => void;
  recentlyClosedCount?: number;
  lang: Language;
}

export const TabSwitcherModal: React.FC<TabSwitcherModalProps> = ({
  isOpen,
  onClose,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onNewTab,
  onRestoreClosedTab,
  recentlyClosedCount = 0,
  lang,
}) => {
  if (!isOpen) return null;

  const t = translations[lang];

  return (
    <div
      id="tab-switcher-backdrop"
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4 text-stone-800 dark:text-stone-200 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        id="tab-switcher-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tab-switcher-title"
        className="w-full sm:max-w-2xl bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3 sm:p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="tab-switcher-title"
                  className="text-sm font-bold text-stone-900 dark:text-stone-100"
                >
                  {`${t.openTabs} (${tabs.length})`}
                </h2>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {t.tabSwitcherSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {tabs.length > 1 && onCloseOtherTabs && (
              <button
                id="btn-close-other-tabs"
                type="button"
                onClick={() => onCloseOtherTabs(activeTabId)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 bg-stone-200 hover:bg-stone-300 dark:bg-stone-750 dark:hover:bg-stone-700 transition-colors touch-manipulation cursor-pointer"
                title={t.closeOtherTabsDesc}
              >
                {t.closeOtherTabs}
              </button>
            )}

            <button
              id="btn-close-tab-switcher"
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-750 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 transition-colors touch-manipulation"
              title={t.close || "Close"}
              aria-label={t.close || "Close"}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Cards Grid */}
        <div
          id="tabs-grid"
          className="p-3 sm:p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 flex-1 max-h-[60vh] sm:max-h-[55vh]"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const displayTitle =
              tab.title ||
              (tab.url ? tab.url.replace(/^https?:\/\//, "").split("/")[0] : t.newTab);
            const displayUrl = tab.url ? tab.url : t.home;

            return (
              <div
                key={tab.id}
                id={`tab-card-${tab.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectTab(tab.id);
                  }
                }}
                className={`group relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer touch-manipulation min-h-[96px] focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50 ${
                  isActive
                    ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-2 border-emerald-600 dark:border-emerald-500 shadow-sm ring-1 ring-emerald-500/30"
                    : "bg-stone-50/70 dark:bg-stone-850/50 border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 hover:bg-stone-100/60 dark:hover:bg-stone-800/60"
                }`}
              >
                {/* Card Top Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {tab.isPrivate ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 shrink-0">
                        <EyeOff className="w-3 h-3" />
                        <span>{t.privateTab}</span>
                      </span>
                    ) : tab.isSuspended ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 shrink-0">
                        <Cpu className="w-3 h-3 text-amber-600" />
                        <span>{t.sleepingTab}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 shrink-0">
                        {tab.favicon ? (
                          <img
                            src={tab.favicon}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm shrink-0 object-contain"
                          />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </span>
                    )}

                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white dark:bg-emerald-500 dark:text-stone-950 shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>{t.activeTab}</span>
                      </span>
                    )}
                  </div>

                  {/* Individual Close Button */}
                  <button
                    id={`btn-close-tab-${tab.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-750 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors touch-manipulation"
                    title={t.closeTab}
                    aria-label={`${t.closeTab}: ${displayTitle}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Card Body */}
                <div className="mt-1">
                  <div className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                    {displayTitle}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                    {displayUrl}
                  </div>
                </div>

                {/* Card Bottom Meta */}
                <div className="mt-2 pt-1.5 border-t border-stone-200/60 dark:border-stone-800/60 flex items-center justify-between text-[10px] text-stone-400 dark:text-stone-500">
                  <span>
                    {lang === "bn"
                      ? `${tab.history?.length || 1} পেজ হিস্ট্রি`
                      : `${tab.history?.length || 1} page history`}
                  </span>
                  {tab.isLoading && (
                    <span className="text-emerald-600 dark:text-emerald-400 animate-pulse font-medium">
                      {lang === "bn" ? "লোড হচ্ছে..." : "Loading..."}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-stone-50 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="btn-footer-new-tab"
              type="button"
              onClick={() => onNewTab(false)}
              className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-100 bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 flex items-center justify-center gap-1.5 transition-colors touch-manipulation cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t.newTab}</span>
            </button>

            <button
              id="btn-footer-new-private-tab"
              type="button"
              onClick={() => onNewTab(true)}
              className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 dark:text-purple-300 dark:bg-purple-950/60 dark:hover:bg-purple-900/80 flex items-center justify-center gap-1.5 transition-colors touch-manipulation cursor-pointer"
            >
              <EyeOff className="w-4 h-4" />
              <span>{t.privateTab}</span>
            </button>

            {onRestoreClosedTab && recentlyClosedCount > 0 && (
              <button
                id="btn-footer-restore-tab"
                type="button"
                onClick={onRestoreClosedTab}
                className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 dark:text-amber-300 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 flex items-center justify-center gap-1.5 transition-colors touch-manipulation cursor-pointer"
                title={lang === "bn" ? "সর্বশেষ বন্ধ করা ট্যাব পুনরুদ্ধার করুন" : "Restore recently closed tab"}
              >
                <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>
                  {lang === "bn"
                    ? `পুনরুদ্ধার (${recentlyClosedCount})`
                    : `Restore (${recentlyClosedCount})`}
                </span>
              </button>
            )}
          </div>

          <button
            id="btn-modal-done"
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
};
