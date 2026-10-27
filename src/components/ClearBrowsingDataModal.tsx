import React, { useState } from "react";
import { Trash2, X, History, Database, Cookie, Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { Language, translations } from "../locales";

export type ClearTimeRange = "last_hour" | "last_24h" | "last_7d" | "all_time";

export interface ClearBrowsingDataOptions {
  history: boolean;
  cache: boolean;
  cookies: boolean;
  siteOverrides: boolean;
  timeRange: ClearTimeRange;
}

interface ClearBrowsingDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: (options: ClearBrowsingDataOptions) => void;
  historyCount: number;
  capsulesCount: number;
  cookiesCount: number;
  overridesCount: number;
  currentDomain?: string;
  onClearSiteData?: (domain: string) => void;
  lang: Language;
}

export const ClearBrowsingDataModal: React.FC<ClearBrowsingDataModalProps> = ({
  isOpen,
  onClose,
  onConfirmClear,
  historyCount,
  capsulesCount,
  cookiesCount,
  overridesCount,
  currentDomain,
  onClearSiteData,
  lang,
}) => {
  const t = translations[lang];

  const [timeRange, setTimeRange] = useState<ClearTimeRange>("all_time");
  const [clearHistory, setClearHistory] = useState<boolean>(true);
  const [clearCache, setClearCache] = useState<boolean>(true);
  const [clearCookies, setClearCookies] = useState<boolean>(true);
  const [clearSiteOverrides, setClearSiteOverrides] = useState<boolean>(false);

  const [siteDataClearedToast, setSiteDataClearedToast] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"general" | "site_data">("general");

  if (!isOpen) return null;

  const hasSelectedAny = clearHistory || clearCache || clearCookies || clearSiteOverrides;

  const handleClear = () => {
    if (!hasSelectedAny) return;
    onConfirmClear({
      history: clearHistory,
      cache: clearCache,
      cookies: clearCookies,
      siteOverrides: clearSiteOverrides,
      timeRange,
    });
    onClose();
  };

  const handleClearCurrentSite = () => {
    if (!currentDomain || !onClearSiteData) return;
    onClearSiteData(currentDomain);
    setSiteDataClearedToast(true);
    setTimeout(() => {
      setSiteDataClearedToast(false);
    }, 2500);
  };

  return (
    <div
      id="clear-browsing-data-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="clear-browsing-data-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-data-modal-title"
        className="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="clear-data-modal-title"
                className="text-sm font-bold text-stone-900 dark:text-stone-100"
              >
                {t.clearBrowsingDataTitle || "Clear Browsing Data"}
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-1">
                {t.clearBrowsingDataSubtitle || "Safely remove your browsing history, cached files, and cookies"}
              </p>
            </div>
          </div>
          <button
            id="btn-close-clear-data"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-750 transition-colors touch-manipulation cursor-pointer text-stone-500"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher: All Browsing Data vs Current Site Data */}
        {currentDomain && onClearSiteData && (
          <div className="flex border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 px-4 pt-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === "general"
                  ? "border-rose-600 text-rose-600 dark:text-rose-400"
                  : "border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
              }`}
            >
              {lang === "bn" ? "সাধারণ ব্রাউজিং ডেটা" : "All Browsing Data"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("site_data")}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === "site_data"
                  ? "border-rose-600 text-rose-600 dark:text-rose-400"
                  : "border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
              }`}
            >
              {lang === "bn" ? "এই সাইটের ডেটা" : "This Site Data"}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {activeTab === "general" ? (
            <>
              {/* Time Range Selector */}
              <div className="space-y-1.5">
                <label
                  htmlFor="select-clear-timerange"
                  className="font-semibold text-stone-700 dark:text-stone-300 block"
                >
                  {t.timeRange || "Time range"}
                </label>
                <select
                  id="select-clear-timerange"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as ClearTimeRange)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                >
                  <option value="last_hour">{t.timeRangeLastHour || "Last hour"}</option>
                  <option value="last_24h">{t.timeRangeLast24Hours || "Last 24 hours"}</option>
                  <option value="last_7d">{t.timeRangeLast7Days || "Last 7 days"}</option>
                  <option value="all_time">{t.timeRangeAllTime || "All time"}</option>
                </select>
              </div>

              {/* Data Category Options */}
              <div className="space-y-2 pt-1">
                {/* 1. Browsing History */}
                <label className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer hover:bg-stone-100/70 dark:hover:bg-stone-800/70 transition-colors">
                  <input
                    id="checkbox-clear-history"
                    type="checkbox"
                    checked={clearHistory}
                    onChange={(e) => setClearHistory(e.target.checked)}
                    className="w-4 h-4 accent-rose-600 rounded cursor-pointer mt-0.5 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                      <History className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.clearHistoryCheckbox || "Browsing history"}</span>
                      {historyCount > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-750 text-stone-600 dark:text-stone-400">
                          {historyCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {t.clearHistoryDesc || "Local log of visited web pages and source URLs"}
                    </p>
                  </div>
                </label>

                {/* 2. Cached Images and Files */}
                <label className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer hover:bg-stone-100/70 dark:hover:bg-stone-800/70 transition-colors">
                  <input
                    id="checkbox-clear-cache"
                    type="checkbox"
                    checked={clearCache}
                    onChange={(e) => setClearCache(e.target.checked)}
                    className="w-4 h-4 accent-rose-600 rounded cursor-pointer mt-0.5 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                      <Database className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.clearCacheCheckbox || "Cached images and files"}</span>
                      {capsulesCount > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-750 text-stone-600 dark:text-stone-400">
                          {capsulesCount} capsules
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {t.clearCacheDesc || "Offline capsules, saved form drafts, and temporary memory"}
                    </p>
                  </div>
                </label>

                {/* 3. Cookies and Active Site Data */}
                <label className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer hover:bg-stone-100/70 dark:hover:bg-stone-800/70 transition-colors">
                  <input
                    id="checkbox-clear-cookies"
                    type="checkbox"
                    checked={clearCookies}
                    onChange={(e) => setClearCookies(e.target.checked)}
                    className="w-4 h-4 accent-rose-600 rounded cursor-pointer mt-0.5 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                      <Cookie className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.clearCookiesCheckbox || "Cookies and active site data"}</span>
                      {cookiesCount > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-750 text-stone-600 dark:text-stone-400">
                          {cookiesCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {t.clearCookiesDesc || "Website sign-in sessions and server cookies"}
                    </p>
                  </div>
                </label>

                {/* 4. Site Overrides / Permissions */}
                <label className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer hover:bg-stone-100/70 dark:hover:bg-stone-800/70 transition-colors">
                  <input
                    id="checkbox-clear-overrides"
                    type="checkbox"
                    checked={clearSiteOverrides}
                    onChange={(e) => setClearSiteOverrides(e.target.checked)}
                    className="w-4 h-4 accent-rose-600 rounded cursor-pointer mt-0.5 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                      <Shield className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.clearSiteOverridesCheckbox || "Site permissions & privacy settings"}</span>
                      {overridesCount > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-750 text-stone-600 dark:text-stone-400">
                          {overridesCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {t.clearSiteOverridesDesc || "Custom per-domain tracker and image rules"}
                    </p>
                  </div>
                </label>
              </div>

              {/* Bookmark & Download Safety Assurance */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  {t.keepBookmarksNotice || "Your bookmarks and downloaded files are kept completely safe."}
                </span>
              </div>
            </>
          ) : (
            /* Site Data Management Tab for active domain */
            <div className="space-y-4 py-2">
              <div className="p-3.5 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {currentDomain}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {lang === "bn"
                    ? "এই সাইটের কুকিজ এবং ক্যাশ করা সেশন তথ্য সাফ করুন।"
                    : "Remove cached sessions, cookies, and local data for this domain only."}
                </p>
                <div className="pt-2">
                  <button
                    id="btn-clear-domain-data"
                    type="button"
                    onClick={handleClearCurrentSite}
                    className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors border border-rose-200 dark:border-rose-800 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.clearThisSiteData || "Clear Data for This Site"}</span>
                  </button>
                </div>
              </div>

              {siteDataClearedToast && (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-center font-medium">
                  ✓ {t.siteDataCleared || "Cookies and storage data for this site have been cleared"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === "general" && (
          <div className="p-3 bg-stone-50 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-2">
            <button
              id="btn-cancel-clear-data"
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-750 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium transition-colors cursor-pointer"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </button>
            <button
              id="btn-confirm-clear-data"
              type="button"
              disabled={!hasSelectedAny}
              onClick={handleClear}
              className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.clearDataConfirmBtn || "Clear data"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
