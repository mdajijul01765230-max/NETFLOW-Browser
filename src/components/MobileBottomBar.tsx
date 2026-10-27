import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Home,
  MoreVertical,
  Star,
  Clock,
  Radio,
  ShieldCheck,
  Cpu,
  DownloadCloud,
  Sparkles,
  HeartHandshake,
  Languages,
  Search,
  X,
  FileCode2,
  ZoomIn,
  Plus,
  Minus,
  Monitor,
  Smartphone,
  Globe,
  Printer,
  FileDown,
  Trash2,
  Sliders,
  Download,
} from "lucide-react";
import { Language, translations } from "../locales";
import { SiteMode } from "../types";

interface MobileBottomBarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  tabsCount: number;
  lang: Language;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoHome: () => void;
  onOpenTabSwitcher: () => void;
  onOpenBookmarksModal?: () => void;
  onOpenHistoryModal?: () => void;
  onOpenDownloadsModal?: () => void;
  downloadsCount?: number;
  onOpenNetworkModal?: () => void;
  onOpenPrivacyModal?: () => void;
  onOpenDeviceModal?: () => void;
  onOpenOfflineModal?: () => void;
  onOpenAiModal?: () => void;
  onOpenFindInPage?: () => void;
  onOpenPromiseModal?: (tab?: "covenant" | "values" | "workbench" | "boundaries") => void;
  onOpenReleaseNotes?: () => void;
  onToggleLanguage?: () => void;
  onTranslatePage?: () => void;
  isPageTranslated?: boolean;
  currentZoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  siteMode?: SiteMode;
  onSetSiteMode?: (mode: SiteMode) => void;
  onPrintPage?: () => void;
  onSavePage?: () => void;
  onOpenClearData?: () => void;
  onOpenSiteSettings?: () => void;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  canGoBack,
  canGoForward,
  tabsCount,
  lang,
  onGoBack,
  onGoForward,
  onGoHome,
  onOpenTabSwitcher,
  onOpenBookmarksModal,
  onOpenHistoryModal,
  onOpenDownloadsModal,
  downloadsCount = 0,
  onOpenNetworkModal,
  onOpenPrivacyModal,
  onOpenDeviceModal,
  onOpenOfflineModal,
  onOpenAiModal,
  onOpenFindInPage,
  onOpenPromiseModal,
  onOpenReleaseNotes,
  onToggleLanguage,
  onTranslatePage,
  isPageTranslated,
  currentZoom = 100,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  siteMode = "default",
  onSetSiteMode,
  onPrintPage,
  onSavePage,
  onOpenClearData,
  onOpenSiteSettings,
}) => {
  const t = translations[lang];
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenuAndRun = (action?: () => void) => {
    setIsMenuOpen(false);
    if (action) {
      action();
    }
  };

  return (
    <>
      {/* Mobile More/Options Bottom Sheet Backdrop */}
      {isMenuOpen && (
        <div
          id="mobile-bottom-menu-backdrop"
          className="md:hidden fixed inset-0 z-40 bg-stone-950/60 backdrop-blur-xs select-none transition-opacity"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile More/Options Bottom Sheet */}
      {isMenuOpen && (
        <div
          id="mobile-bottom-menu-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t.menu}
          className="md:hidden fixed bottom-[56px] left-0 right-0 z-50 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 rounded-t-2xl shadow-2xl p-4 max-h-[75vh] overflow-y-auto select-none animate-in slide-in-from-bottom duration-150"
        >
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                {t.menu}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                NETFLOW
              </span>
            </div>
            <button
              id="mobile-menu-close-btn"
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="min-w-[40px] min-h-[40px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
              aria-label={t.close || "Close"}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
            {/* Bookmarks */}
            <button
              id="mobile-menu-bookmarks"
              type="button"
              onClick={() => closeMenuAndRun(onOpenBookmarksModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <Star className="w-4 h-4 text-amber-500 shrink-0 fill-amber-400" />
              <span className="truncate">{t.bookmarksModalTitle}</span>
            </button>

            {/* History */}
            <button
              id="mobile-menu-history"
              type="button"
              onClick={() => closeMenuAndRun(onOpenHistoryModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{t.historyModalTitle}</span>
            </button>

            {/* Downloads */}
            {onOpenDownloadsModal && (
              <button
                id="mobile-menu-downloads"
                type="button"
                onClick={() => closeMenuAndRun(onOpenDownloadsModal)}
                className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="truncate">{t.downloadsModalTitle || "Downloads"}</span>
                </div>
                {downloadsCount > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono">
                    {downloadsCount}
                  </span>
                )}
              </button>
            )}

            {/* Clear Browsing Data */}
            {onOpenClearData && (
              <button
                id="mobile-menu-clear-data"
                type="button"
                onClick={() => closeMenuAndRun(onOpenClearData)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-left font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="truncate">{t.clearBrowsingDataTitle || "Clear Browsing Data"}</span>
              </button>
            )}

            {/* Site Settings */}
            {onOpenSiteSettings && (
              <button
                id="mobile-menu-site-settings"
                type="button"
                onClick={() => closeMenuAndRun(onOpenSiteSettings)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <Sliders className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                <span className="truncate">{t.siteSettingsTitle || "Site Settings"}</span>
              </button>
            )}

            {/* Smart Network */}
            <button
              id="mobile-menu-network"
              type="button"
              onClick={() => closeMenuAndRun(onOpenNetworkModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{t.networkModalTitle}</span>
            </button>

            {/* Privacy Shield */}
            <button
              id="mobile-menu-privacy"
              type="button"
              onClick={() => closeMenuAndRun(onOpenPrivacyModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="truncate">{t.privacyModalTitle}</span>
            </button>

            {/* Low RAM Optimizer */}
            <button
              id="mobile-menu-device"
              type="button"
              onClick={() => closeMenuAndRun(onOpenDeviceModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <Cpu className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">{t.performanceModalTitle}</span>
            </button>

            {/* Offline Capsules */}
            <button
              id="mobile-menu-offline"
              type="button"
              onClick={() => closeMenuAndRun(onOpenOfflineModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <DownloadCloud className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span className="truncate">{t.offlineModalTitle}</span>
            </button>

            {/* AI Assistant */}
            <button
              id="mobile-menu-ai"
              type="button"
              onClick={() => closeMenuAndRun(onOpenAiModal)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{t.aiAssistant}</span>
            </button>

            {/* Find in page */}
            {onOpenFindInPage && (
              <button
                id="mobile-menu-find-in-page"
                type="button"
                onClick={() => closeMenuAndRun(onOpenFindInPage)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <Search className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate">{t.findInPage}</span>
              </button>
            )}

            {/* Mobile Page Zoom / Text Scaling Control */}
            <div
              id="mobile-zoom-control"
              className="col-span-2 flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200/50 dark:border-stone-800"
            >
              <div className="flex items-center gap-2.5">
                <ZoomIn className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                  {lang === "bn" ? "পৃষ্ঠা জুম" : "Page Zoom"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-mobile-zoom-out"
                  type="button"
                  onClick={() => onZoomOut?.()}
                  disabled={currentZoom <= 50}
                  title={lang === "bn" ? "জুম আউট" : "Zoom out"}
                  aria-label={lang === "bn" ? "জুম আউট" : "Zoom out"}
                  className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed text-stone-800 dark:text-stone-200 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  id="btn-mobile-zoom-reset"
                  type="button"
                  onClick={() => onZoomReset?.()}
                  title={lang === "bn" ? "১০০% এ রিসেট করুন" : "Reset to 100%"}
                  aria-label={lang === "bn" ? "১০০% এ রিসেট করুন" : "Reset to 100%"}
                  className="px-2.5 py-1 min-h-[32px] rounded-lg font-mono text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
                >
                  {currentZoom}%
                </button>
                <button
                  id="btn-mobile-zoom-in"
                  type="button"
                  onClick={() => onZoomIn?.()}
                  disabled={currentZoom >= 200}
                  title={lang === "bn" ? "জুম ইন" : "Zoom in"}
                  aria-label={lang === "bn" ? "জুম ইন" : "Zoom in"}
                  className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed text-stone-800 dark:text-stone-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Site Mode (Default / Desktop / Mobile) */}
            {onSetSiteMode && (
              <div
                id="mobile-menu-sitemode"
                className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 text-stone-800 dark:text-stone-200"
              >
                <div className="flex items-center gap-2.5">
                  {siteMode === "desktop" ? (
                    <Monitor className="w-4 h-4 text-blue-500 shrink-0" />
                  ) : siteMode === "mobile" ? (
                    <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Globe className="w-4 h-4 text-stone-500 shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="text-xs font-semibold">
                      {lang === "bn" ? "সাইট সংস্করণ" : "Site Mode"}
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400">
                      {siteMode === "desktop"
                        ? lang === "bn" ? "ডেস্কটপ ভিউ" : "Desktop site"
                        : siteMode === "mobile"
                        ? lang === "bn" ? "মোবাইল ভিউ" : "Mobile site"
                        : lang === "bn" ? "স্বাভাবিক ভিউ" : "Default responsive"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center bg-stone-200 dark:bg-stone-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(() => onSetSiteMode("default"))}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      siteMode === "default"
                        ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs"
                        : "text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(() => onSetSiteMode("desktop"))}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                      siteMode === "desktop"
                        ? "bg-white dark:bg-stone-900 text-blue-600 dark:text-blue-400 shadow-xs"
                        : "text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    <Monitor className="w-3 h-3" />
                    Desk
                  </button>
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(() => onSetSiteMode("mobile"))}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                      siteMode === "mobile"
                        ? "bg-white dark:bg-stone-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                        : "text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    <Smartphone className="w-3 h-3" />
                    Mob
                  </button>
                </div>
              </div>
            )}

            {/* Translate Page */}
            {onTranslatePage && (
              <button
                id="mobile-menu-translate-page"
                type="button"
                onClick={() => closeMenuAndRun(onTranslatePage)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <Languages className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  {isPageTranslated ? t.viewOriginal : t.translatePage || "Translate Page"}
                </span>
              </button>
            )}

            {/* Save Page */}
            {onSavePage && (
              <button
                id="mobile-menu-save-page"
                type="button"
                onClick={() => closeMenuAndRun(onSavePage)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <FileDown className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                <span className="truncate">{t.savePage || "Save Page As..."}</span>
              </button>
            )}

            {/* Print Page */}
            {onPrintPage && (
              <button
                id="mobile-menu-print-page"
                type="button"
                onClick={() => closeMenuAndRun(onPrintPage)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <Printer className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                <span className="truncate">{t.printPage || "Print..."}</span>
              </button>
            )}

            {/* 5 Values & Promise */}
            <button
              id="mobile-menu-promise"
              type="button"
              onClick={() => closeMenuAndRun(() => onOpenPromiseModal?.("values"))}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
            >
              <HeartHandshake className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="truncate">{t.fiveValues.title}</span>
            </button>

            {/* Release Notes */}
            {onOpenReleaseNotes && (
              <button
                id="mobile-menu-release-notes"
                type="button"
                onClick={() => closeMenuAndRun(onOpenReleaseNotes)}
                className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-left font-medium transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileCode2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">{t.releaseNotes}</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold shrink-0">
                  v2.0.0
                </span>
              </button>
            )}
          </div>

          {/* Language Switch */}
          {onToggleLanguage && (
            <button
              id="mobile-menu-language"
              type="button"
              onClick={() => closeMenuAndRun(onToggleLanguage)}
              className="mt-3 w-full py-2.5 px-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4" />
                <span>{lang === "bn" ? "Switch to English" : "বাংলায় ব্রাউজ করুন"}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-mono">
                {lang === "bn" ? "EN" : "BN"}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Fixed Mobile Thumb-Zone Bottom Navigation Bar */}
      <nav
        id="mobile-bottom-bar"
        aria-label="Mobile Navigation Toolbar"
        className="md:hidden shrink-0 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 select-none pb-[max(0.375rem,env(safe-area-inset-bottom,0px))]"
      >
        <div className="flex items-center justify-around px-2 py-1 h-12 max-w-lg mx-auto">
          {/* 1. Back */}
          <button
            id="mobile-nav-back"
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 active:bg-stone-200 dark:active:bg-stone-750 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors touch-manipulation cursor-pointer"
            title={t.back}
            aria-label={t.back}
            aria-disabled={!canGoBack}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* 2. Forward */}
          <button
            id="mobile-nav-forward"
            type="button"
            onClick={onGoForward}
            disabled={!canGoForward}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 active:bg-stone-200 dark:active:bg-stone-750 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors touch-manipulation cursor-pointer"
            title={t.forward}
            aria-label={t.forward}
            aria-disabled={!canGoForward}
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* 3. Home */}
          <button
            id="mobile-nav-home"
            type="button"
            onClick={onGoHome}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 active:bg-stone-200 dark:active:bg-stone-750 transition-colors touch-manipulation cursor-pointer text-stone-700 dark:text-stone-300 active:text-emerald-600 dark:active:text-emerald-400"
            title={t.home}
            aria-label={t.home}
          >
            <Home className="w-5 h-5" />
          </button>

          {/* 4. Tab Switcher with tab count */}
          <button
            id="mobile-nav-tabs"
            type="button"
            onClick={onOpenTabSwitcher}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 active:bg-stone-200 dark:active:bg-stone-750 transition-colors touch-manipulation cursor-pointer"
            title={`${t.openTabs} (${tabsCount})`}
            aria-label={`${t.openTabs} (${tabsCount})`}
          >
            <div className="w-[22px] h-[22px] rounded-[5px] border-2 border-current flex items-center justify-center text-[10.5px] font-extrabold leading-none select-none tracking-tight">
              {tabsCount > 99 ? "99+" : tabsCount}
            </div>
          </button>

          {/* 5. More / Menu */}
          <button
            id="mobile-nav-menu"
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors touch-manipulation cursor-pointer ${
              isMenuOpen
                ? "bg-stone-200 dark:bg-stone-800 text-emerald-600 dark:text-emerald-400"
                : "hover:bg-stone-100 dark:hover:bg-stone-800 active:bg-stone-200 dark:active:bg-stone-750"
            }`}
            title={t.menu}
            aria-label={t.menu}
            aria-expanded={isMenuOpen}
            aria-haspopup="dialog"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </nav>
    </>
  );
};
