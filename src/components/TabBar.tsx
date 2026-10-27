import React from "react";
import { Plus, X, Globe, EyeOff, Cpu } from "lucide-react";
import { BrowserTab } from "../types";
import { Language, translations } from "../locales";

interface TabBarProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOtherTabs?: (keepTabId: string) => void;
  onNewTab: (isPrivate?: boolean) => void;
  lang: Language;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onNewTab,
  lang,
}) => {
  const t = translations[lang];

  return (
    <div
      id="netflow-tab-bar"
      role="tablist"
      aria-label="Browser tabs"
      className="hidden md:flex items-center px-2 pt-1.5 pb-0 bg-stone-100 border-b border-stone-200 dark:bg-stone-950 dark:border-stone-800 select-none overflow-x-auto no-scrollbar"
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(tab.id);
                }
              }}
              className={`group relative flex items-center gap-2 max-w-[190px] min-w-[110px] sm:min-w-[140px] px-3 py-1.5 text-xs rounded-t-lg transition-all cursor-pointer ${
                isActive
                  ? "bg-white text-stone-900 font-medium shadow-xs border-t-2 border-emerald-600 dark:bg-stone-900 dark:text-stone-100 dark:border-emerald-500"
                  : "bg-stone-200/60 text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-900/40 dark:text-stone-400 dark:hover:bg-stone-850 dark:hover:text-stone-200"
              }`}
              title={tab.title || tab.url || t.newTab}
            >
              {tab.isPrivate ? (
                <EyeOff className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
              ) : tab.isSuspended ? (
                <Cpu
                  className="w-3.5 h-3.5 text-amber-500 shrink-0"
                  title={t.sleepingTab}
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}

              <span className="truncate flex-1">
                {(tab.translation?.isTranslated && tab.translation?.translatedTitle) ||
                  tab.title ||
                  (tab.url ? tab.url.replace(/^https?:\/\//, "") : t.newTab)}
              </span>

              {tab.translation?.isTranslated && (
                <span
                  className="px-1 py-0.2 text-[9px] font-mono font-bold uppercase rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0"
                  title="Page translated"
                >
                  {tab.translation.targetLang}
                </span>
              )}

              {tab.isSuspended && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title={t.sleepingTab} />
              )}

              {tabs.length > 1 && (
                <button
                  id={`close-tab-${tab.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 opacity-70 group-hover:opacity-100 transition-opacity"
                  aria-label={t.closeTab}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          id="btn-new-tab"
          type="button"
          onClick={() => onNewTab(false)}
          className="p-1.5 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-200 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-850 transition-colors"
          title={t.newTab}
          aria-label={t.newTab}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <button
          id="btn-new-private-tab"
          type="button"
          onClick={() => onNewTab(true)}
          className="px-2 py-1 flex items-center gap-1 rounded-md text-[11px] font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 dark:text-purple-300 dark:bg-purple-950/60 dark:hover:bg-purple-900/80 transition-colors shrink-0"
          title={t.privateTab}
          aria-label={t.privateTab}
        >
          <EyeOff className="w-3 h-3" />
          <span className="hidden sm:inline">{t.privateTab}</span>
        </button>

        {tabs.length > 1 && onCloseOtherTabs && (
          <button
            id="btn-tabbar-close-other-tabs"
            type="button"
            onClick={() => onCloseOtherTabs(activeTabId)}
            className="hidden lg:inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-850 transition-colors ml-1"
            title={t.closeOtherTabsDesc}
          >
            {t.closeOtherTabs}
          </button>
        )}
      </div>
    </div>
  );
};
