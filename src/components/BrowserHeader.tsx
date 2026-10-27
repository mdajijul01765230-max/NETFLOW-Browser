import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Lock,
  Unlock,
  ShieldCheck,
  Zap,
  BookOpen,
  Sparkles,
  MoreVertical,
  Wifi,
  WifiOff,
  Search,
  X,
  Languages,
  Scale,
  BadgeCheck,
  HeartHandshake,
  Signal,
  Radio,
  ArrowRightLeft,
  PhoneCall,
  Star,
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
  Camera,
  Mic,
  MapPin,
  Bell,
  Shield,
  ShieldAlert,
  Download,
  Share2,
  Copy,
  ExternalLink,
  AlertTriangle,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  BrowsingMode,
  NetworkState,
  PageStats,
  SearchEngineId,
  SiteMode,
  SitePrivacyOverride,
  WebPageErrorInfo,
} from "../types";
import { Language, translations } from "../locales";
import { formatBytes } from "../utils/formatters";
import { resolveOmniboxSecurityState } from "../services/nativeBrowserEngine";

interface BrowserHeaderProps {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  browsingMode: BrowsingMode;
  networkState: NetworkState;
  activeStats?: PageStats;
  totalSavedBytes: number;
  lang: Language;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onGoHome: () => void;
  onStopLoading?: () => void;
  onToggleReaderMode: () => void;
  isReaderModeActive: boolean;
  isLightModeActive?: boolean;
  onToggleLightMode?: () => void;
  onOpenNetworkModal: (tab?: "engine" | "smart4g" | "callsafe" | "transitions" | "modes" | "boundaries") => void;
  onOpenAiModal: () => void;
  onOpenPrivacyModal: () => void;
  onOpenDeviceModal: () => void;
  onOpenOfflineModal: () => void;
  onOpenHistoryModal: () => void;
  onOpenBookmarksModal?: () => void;
  onOpenDownloadsModal?: () => void;
  downloadsCount?: number;
  isCurrentPageBookmarked?: boolean;
  onToggleBookmark?: () => void;
  bookmarksCount?: number;
  tabsCount?: number;
  onOpenTabSwitcher?: () => void;
  onOpenFindInPage?: () => void;
  onOpenPromiseModal: (tab?: "covenant" | "values" | "workbench" | "boundaries") => void;
  onOpenReleaseNotes?: () => void;
  onToggleLanguage: () => void;
  onTranslatePage?: () => void;
  isPageTranslated?: boolean;
  isTranslating?: boolean;
  transitionNotice?: string | null;
  onDismissTransitionNotice?: () => void;
  currentZoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  siteMode?: SiteMode;
  onSetSiteMode?: (mode: SiteMode) => void;
  onPrintPage?: () => void;
  onSavePage?: () => void;
  onOpenClearData?: () => void;
  siteOverride?: SitePrivacyOverride;
  onOpenSiteSettings?: () => void;
  searchEngineId?: SearchEngineId;
  onSetSearchEngine?: (engineId: SearchEngineId) => void;
  errorInfo?: WebPageErrorInfo;
  onSharePage?: () => void;
  onCopyLink?: () => void;
  onOpenExternalBrowser?: () => void;
  isOutdatedWebView?: boolean;
  chromiumMajorVersion?: number | null;
  onDismissOutdatedWebView?: () => void;
  onOpenAuthModal?: () => void;
}

export const BrowserHeader: React.FC<BrowserHeaderProps> = ({
  url,
  canGoBack,
  canGoForward,
  isLoading,
  browsingMode,
  networkState,
  activeStats,
  totalSavedBytes,
  lang,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onGoHome,
  onStopLoading,
  onToggleReaderMode,
  isReaderModeActive,
  isLightModeActive = false,
  onToggleLightMode,
  onOpenNetworkModal,
  onOpenAiModal,
  onOpenPrivacyModal,
  onOpenDeviceModal,
  onOpenOfflineModal,
  onOpenHistoryModal,
  onOpenBookmarksModal,
  onOpenDownloadsModal,
  downloadsCount,
  isCurrentPageBookmarked,
  onToggleBookmark,
  bookmarksCount = 0,
  tabsCount = 1,
  onOpenTabSwitcher,
  onOpenFindInPage,
  onOpenPromiseModal,
  onOpenReleaseNotes,
  onToggleLanguage,
  onTranslatePage,
  isPageTranslated,
  isTranslating,
  transitionNotice,
  onDismissTransitionNotice,
  currentZoom = 100,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  siteMode = "default",
  onSetSiteMode,
  onPrintPage,
  onSavePage,
  onOpenClearData,
  siteOverride,
  onOpenSiteSettings,
  searchEngineId = "google",
  onSetSearchEngine,
  errorInfo,
  onSharePage,
  onCopyLink,
  onOpenExternalBrowser,
  isOutdatedWebView = false,
  chromiumMajorVersion = null,
  onDismissOutdatedWebView,
  onOpenAuthModal,
}) => {
  const { currentUser } = useAuth();
  const t = translations[lang];
  const [inputUrl, setInputUrl] = useState(url);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSecurityPopupOpen, setIsSecurityPopupOpen] = useState(false);

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    onNavigate(inputUrl.trim());
  };

  const securityState = resolveOmniboxSecurityState(url, errorInfo);
  const isHttps = securityState.isHttps;

  return (
    <>
      <header
        id="netflow-browser-header"
      className="bg-white border-b border-stone-200 dark:bg-stone-900 dark:border-stone-800 px-3 py-2 text-stone-800 dark:text-stone-200 select-none relative z-30"
    >
      <div className="flex items-center gap-2 max-w-7xl mx-auto">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="nav-back"
            onClick={onGoBack}
            disabled={!canGoBack}
            className="min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-2 sm:p-1.5 flex items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors touch-manipulation"
            title={t.back}
            aria-label={t.back}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            id="nav-forward"
            onClick={onGoForward}
            disabled={!canGoForward}
            className="hidden sm:flex min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-2 sm:p-1.5 items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors touch-manipulation"
            title={t.forward}
            aria-label={t.forward}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            id={isLoading ? "nav-stop" : "nav-reload"}
            onClick={isLoading && onStopLoading ? onStopLoading : onReload}
            className="min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-2 sm:p-1.5 flex items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors touch-manipulation"
            title={isLoading ? t.stop : t.reload}
            aria-label={isLoading ? t.stop : t.reload}
          >
            {isLoading ? (
              <X className="w-4 h-4 text-rose-500 animate-pulse" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
          </button>
          <button
            id="nav-home"
            onClick={onGoHome}
            className="hidden sm:flex min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-2 sm:p-1.5 items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors touch-manipulation"
            title={t.home}
            aria-label={t.home}
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Omnibox / Smart Address Bar */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 relative">
          <div className="flex items-center bg-stone-100 dark:bg-stone-800/80 rounded-full border border-stone-300/80 dark:border-stone-700/80 px-3 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:border-emerald-500 transition-all">
            {/* Security Indicator */}
            <button
              type="button"
              id="security-indicator"
              onClick={() => setIsSecurityPopupOpen(!isSecurityPopupOpen)}
              className="mr-2 flex items-center gap-1 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0"
              title={lang === "bn" ? securityState.labelBn : securityState.labelEn}
              aria-label={lang === "bn" ? securityState.labelBn : securityState.labelEn}
            >
              {securityState.state === "ssl_warning" ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span
                    id="omnibox-ssl-warning-badge"
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                  >
                    {t.securitySslWarning || "SSL Error"}
                  </span>
                </>
              ) : securityState.state === "not_secure" ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span
                    id="omnibox-not-secure-badge"
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
                  >
                    {t.securityNotSecure || "Not secure"}
                  </span>
                </>
              ) : (
                <Lock
                  id="omnibox-https-lock"
                  className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
                />
              )}
            </button>

            {/* Input URL */}
            <input
              id="omnibox-input"
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder={t.searchOrUrlPlaceholder}
              aria-label={t.searchOrUrlPlaceholder}
              className="flex-1 bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden min-w-0"
            />

            {inputUrl && (
              <button
                type="button"
                onClick={() => setInputUrl("")}
                className="p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 mr-1"
                aria-label="Clear address bar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Bookmark page toggle */}
            {url && onToggleBookmark && (
              <button
                id="btn-toggle-bookmark"
                type="button"
                onClick={onToggleBookmark}
                className="min-w-[28px] min-h-[28px] p-1 flex items-center justify-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors mr-1 touch-manipulation cursor-pointer"
                title={isCurrentPageBookmarked ? t.removeBookmark : t.bookmarkThisPage}
                aria-label={isCurrentPageBookmarked ? t.removeBookmark : t.bookmarkThisPage}
              >
                <Star
                  className={`w-3.5 h-3.5 transition-colors ${
                    isCurrentPageBookmarked
                      ? "fill-amber-400 text-amber-500"
                      : "text-stone-400 hover:text-amber-500"
                  }`}
                />
              </button>
            )}

            {/* Mode badge inside omnibox */}
            <span
              onClick={onOpenNetworkModal}
              className="cursor-pointer text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 hover:opacity-80 transition-opacity hidden md:inline-flex items-center gap-1 shrink-0"
              title="Click to adjust Network Mode"
            >
              <Zap className="w-2.5 h-2.5" />
              {browsingMode === "smart-compress"
                ? "Smart"
                : browsingMode === "text-only"
                ? "Text-Only"
                : browsingMode === "reader"
                ? "Reader"
                : "Full"}
            </span>
          </div>

          {/* Security details popup */}
          {isSecurityPopupOpen && (
            <div
              id="security-popup"
              className="absolute left-0 top-full mt-2 w-72 p-3 bg-white dark:bg-stone-900 rounded-xl shadow-xl border border-stone-200 dark:border-stone-800 z-50 text-xs text-stone-700 dark:text-stone-300"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100 dark:border-stone-800">
                <span className="font-semibold flex items-center gap-1.5 text-stone-900 dark:text-stone-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Security & Trust Audit
                </span>
                <button
                  onClick={() => setIsSecurityPopupOpen(false)}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                  aria-label={t.close || "Close"}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mb-1.5">
                <strong className="text-stone-900 dark:text-stone-100">Connection:</strong>{" "}
                {securityState.state === "ssl_warning"
                  ? t.sslErrorSubtitle || "Certificate cannot be trusted (SSL Error)"
                  : isHttps
                  ? "Verified TLS 1.3 / HTTPS"
                  : t.securityNotSecure || "Not secure (Unencrypted HTTP)"}
              </p>
              <p className="mb-1.5">
                <strong className="text-stone-900 dark:text-stone-100">Trackers Blocked:</strong>{" "}
                {activeStats?.trackersBlocked ?? 0} trackers
              </p>
              <p className="mb-2">
                <strong className="text-stone-900 dark:text-stone-100">Data Saved on Page:</strong>{" "}
                {activeStats?.savedBytes ? formatBytes(activeStats.savedBytes) : "0 B"} (
                {activeStats?.savedPercentage ?? 0}%)
              </p>
              {/* Permissions Snapshot */}
              <div className="pt-2 mb-2 border-t border-stone-100 dark:border-stone-800 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-stone-600 dark:text-stone-400">
                    <Camera className="w-3 h-3 text-stone-400" />
                    <span>{t.cameraPermission || "Camera"}:</span>
                  </span>
                  <span
                    className={`font-medium capitalize ${
                      siteOverride?.camera === "allow"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-stone-500"
                    }`}
                  >
                    {siteOverride?.camera || "block"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-stone-600 dark:text-stone-400">
                    <Mic className="w-3 h-3 text-stone-400" />
                    <span>{t.microphonePermission || "Microphone"}:</span>
                  </span>
                  <span
                    className={`font-medium capitalize ${
                      siteOverride?.microphone === "allow"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-stone-500"
                    }`}
                  >
                    {siteOverride?.microphone || "block"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-stone-600 dark:text-stone-400">
                    <MapPin className="w-3 h-3 text-stone-400" />
                    <span>{t.locationPermission || "Location"}:</span>
                  </span>
                  <span
                    className={`font-medium capitalize ${
                      siteOverride?.geolocation === "allow"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-stone-500"
                    }`}
                  >
                    {siteOverride?.geolocation || "block"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-stone-600 dark:text-stone-400">
                    <Shield className="w-3 h-3 text-stone-400" />
                    <span>{t.protectedMediaPermission || "Protected Media (DRM)"}:</span>
                  </span>
                  <span
                    className={`font-medium capitalize ${
                      siteOverride?.protectedMedia === "allow"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-stone-500"
                    }`}
                  >
                    {siteOverride?.protectedMedia || "block"}
                  </span>
                </div>
              </div>

              {onOpenSiteSettings && url && (
                <button
                  id="btn-open-site-settings-from-security"
                  type="button"
                  onClick={() => {
                    setIsSecurityPopupOpen(false);
                    onOpenSiteSettings();
                  }}
                  className="w-full py-1.5 px-3 text-center text-xs font-semibold text-stone-800 dark:text-stone-200 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-750 rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-stone-200 dark:border-stone-700 cursor-pointer mb-2"
                >
                  <Sliders className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                  <span>{t.siteSettingsTitle || "Site settings"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsSecurityPopupOpen(false);
                  onOpenPrivacyModal();
                }}
                className="w-full py-1.5 text-center text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 rounded-md transition-colors"
              >
                Open Full Privacy & Shield Settings
              </button>
            </div>
          )}
        </form>

        {/* Action badges & buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Network indicator */}
          <button
            id="btn-network-status"
            type="button"
            onClick={() =>
              onOpenNetworkModal(
                networkState.medium.startsWith("cellular") || networkState.type === "4g"
                  ? "smart4g"
                  : "engine"
              )
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              !networkState.isOnline
                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                : networkState.type === "2g" || networkState.medium === "cellular_2g"
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
                : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
            }`}
            title="NETFLOW Smart Network Engine (Click to manage)"
          >
            {!networkState.isOnline ? (
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
            ) : networkState.medium === "wifi" ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Signal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="hidden sm:inline uppercase text-[11px] font-semibold tracking-wider">
              {!networkState.isOnline
                ? "Offline"
                : networkState.medium === "wifi"
                ? "Wi-Fi"
                : networkState.medium === "cellular_5g"
                ? "5G"
                : networkState.medium === "cellular_4g"
                ? "4G LTE"
                : networkState.medium === "cellular_3g"
                ? "3G"
                : networkState.medium === "cellular_2g"
                ? "2G"
                : networkState.type}
            </span>
            {networkState.isMetered && networkState.isOnline && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Metered Cellular Data" />
            )}
            <span className="hidden xl:inline text-[10px] text-stone-500 dark:text-stone-400">
              {networkState.rttMs > 0 ? `${networkState.rttMs}ms` : ""}
            </span>
          </button>

          {/* Data Saved counter */}
          <button
            id="btn-savings-counter"
            type="button"
            onClick={onOpenNetworkModal}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors"
            title="Total Data Saved in this session"
          >
            <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold">{formatBytes(totalSavedBytes)}</span>
          </button>

          {/* NETFLOW Promise Quick Link */}
          <button
            id="btn-netflow-promise"
            type="button"
            onClick={onOpenPromiseModal}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-stone-900 text-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-500/40 hover:bg-stone-800 transition-colors"
            title="The NETFLOW Promise: Real Capability Over Marketing Claims"
          >
            <Scale className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-[11px] tracking-wide">PROMISE</span>
          </button>

          {/* Reader view toggle */}
          <button
            id="btn-reader-mode"
            type="button"
            onClick={onToggleReaderMode}
            className={`p-1.5 rounded-md transition-colors ${
              isReaderModeActive
                ? "bg-emerald-600 text-white dark:bg-emerald-500"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
            title={t.readerMode}
            aria-label={t.readerMode}
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* AI Assistant button */}
          <button
            id="btn-ai-assistant"
            type="button"
            onClick={onOpenAiModal}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-xs transition-all cursor-pointer"
            title={t.aiAssistant}
            aria-label={t.aiAssistant}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden md:inline">{t.aiAssistant}</span>
          </button>

          {/* User Sign In / Account Button */}
          <button
            id="btn-user-auth"
            type="button"
            onClick={onOpenAuthModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
              currentUser
                ? "bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/25"
                : "bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-300 dark:hover:bg-stone-750 border border-stone-300 dark:border-stone-700"
            }`}
            title={currentUser ? currentUser.email || "Account" : lang === "bn" ? "সাইন ইন করুন" : "Sign In"}
            aria-label="User Account"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {currentUser
                ? currentUser.displayName || currentUser.email?.split("@")[0] || (lang === "bn" ? "ইউজার" : "User")
                : lang === "bn"
                ? "সাইন ইন"
                : "Sign In"}
            </span>
          </button>

          {/* Language switch quick button */}
          <button
            id="btn-toggle-lang"
            type="button"
            onClick={onToggleLanguage}
            className="hidden sm:flex p-1.5 rounded-md text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
            title={t.toggleLanguage}
            aria-label={t.toggleLanguage}
          >
            <Languages className="w-4 h-4" />
          </button>

          {/* Mobile Tab Switcher Button / Counter */}
          <button
            id="btn-tab-switcher"
            type="button"
            onClick={onOpenTabSwitcher}
            className="hidden sm:flex min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] p-2 sm:p-1.5 items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors touch-manipulation cursor-pointer"
            title={`${t.openTabs || "Open tabs"} (${tabsCount})`}
            aria-label={`${t.openTabs || "Open tabs"} (${tabsCount})`}
          >
            <div className="w-5 h-5 rounded-[5px] border-2 border-stone-600 dark:border-stone-400 flex items-center justify-center font-bold text-[11px] leading-none select-none">
              {tabsCount}
            </div>
          </button>

          {/* Menu dropdown button */}
          <div className="relative hidden sm:block">
            <button
              id="btn-main-menu"
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1.5 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
              title={t.menu}
              aria-label={t.menu}
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div
                id="main-menu-dropdown"
                className="absolute right-0 top-full mt-2 w-56 p-1.5 bg-white dark:bg-stone-900 rounded-xl shadow-xl border border-stone-200 dark:border-stone-800 z-50 text-xs text-stone-700 dark:text-stone-200"
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenNetworkModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{lang === "bn" ? "স্মার্ট নেটওয়ার্ক ইঞ্জিন" : "Smart Network Engine"}</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Aware
                  </span>
                </button>

                {onToggleLightMode && (
                  <button
                    id="menu-light-mode-toggle"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onToggleLightMode();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>
                        {lang === "bn" ? "ট্যাব লাইট মোড (Light Mode)" : "Tab Light Mode"}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${
                        isLightModeActive
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                      }`}
                    >
                      {isLightModeActive ? "ON" : "OFF"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenPrivacyModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <span>{t.privacyModalTitle}</span>
                  <span className="text-[10px] text-stone-400">Shield</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenOfflineModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <span>{t.offlineModalTitle}</span>
                  <span className="text-[10px] text-stone-400">0 Data</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenDeviceModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <span>{t.performanceModalTitle}</span>
                  <span className="text-[10px] text-stone-400">Low RAM</span>
                </button>

                <button
                  id="menu-bookmarks"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (onOpenBookmarksModal) onOpenBookmarksModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                    <span>{t.bookmarksModalTitle}</span>
                  </div>
                  <span className="text-[10px] text-stone-400">
                    {bookmarksCount}
                  </span>
                </button>

                <button
                  id="menu-history"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenHistoryModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <span>{t.historyModalTitle}</span>
                  <span className="text-[10px] text-emerald-600">
                    {formatBytes(totalSavedBytes)}
                  </span>
                </button>

                {onOpenDownloadsModal && (
                  <button
                    id="menu-downloads"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenDownloadsModal();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.downloadsModalTitle || "Downloads"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {downloadsCount !== undefined && downloadsCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono">
                          {downloadsCount}
                        </span>
                      )}
                      <span className="text-[10px] text-stone-400 font-mono">
                        Ctrl+J
                      </span>
                    </div>
                  </button>
                )}

                {onOpenClearData && (
                  <button
                    id="menu-clear-browsing-data"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenClearData();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.clearBrowsingDataTitle || "Clear Browsing Data"}</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">
                      Ctrl+Shift+Del
                    </span>
                  </button>
                )}

                {onOpenSiteSettings && url && (
                  <button
                    id="menu-site-settings"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSiteSettings();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.siteSettingsTitle || "Site settings"}</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {siteOverride ? "Custom" : "Default"}
                    </span>
                  </button>
                )}

                <button
                  id="menu-open-tabs"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (onOpenTabSwitcher) onOpenTabSwitcher();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-[3px] border border-stone-600 dark:border-stone-400 flex items-center justify-center font-bold text-[8px] leading-none">
                      {tabsCount}
                    </div>
                    <span>{t.openTabs || "Open tabs"}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-stone-500 dark:text-stone-400">
                    {tabsCount}
                  </span>
                </button>

                {onOpenFindInPage && (
                  <button
                    id="menu-find-in-page"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenFindInPage();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-stone-500" />
                      <span>{t.findInPage}</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">
                      Ctrl+F
                    </span>
                  </button>
                )}

                {/* Chrome-like Page Zoom / Text Scaling control */}
                <div
                  id="menu-zoom-row"
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-850 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <ZoomIn className="w-3.5 h-3.5 text-stone-500" />
                    <span>{lang === "bn" ? "জুম" : "Zoom"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      id="btn-menu-zoom-out"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onZoomOut?.();
                      }}
                      disabled={currentZoom <= 50}
                      title={lang === "bn" ? "জুম আউট" : "Zoom out"}
                      aria-label={lang === "bn" ? "জুম আউট" : "Zoom out"}
                      className="min-w-[26px] min-h-[26px] p-1 flex items-center justify-center rounded-md bg-stone-200 dark:bg-stone-750 hover:bg-stone-300 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer text-stone-800 dark:text-stone-200"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      id="btn-menu-zoom-reset"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onZoomReset?.();
                      }}
                      title={lang === "bn" ? "১০০% এ রিসেট করুন" : "Reset to 100%"}
                      aria-label={lang === "bn" ? "১০০% এ রিসেট করুন" : "Reset to 100%"}
                      className="px-2 py-0.5 min-h-[26px] rounded-md font-mono text-[11px] font-semibold hover:bg-stone-200 dark:hover:bg-stone-750 transition-colors cursor-pointer text-stone-800 dark:text-stone-200"
                    >
                      {currentZoom}%
                    </button>
                    <button
                      id="btn-menu-zoom-in"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onZoomIn?.();
                      }}
                      disabled={currentZoom >= 200}
                      title={lang === "bn" ? "জুম ইন" : "Zoom in"}
                      aria-label={lang === "bn" ? "জুম ইন" : "Zoom in"}
                      className="min-w-[26px] min-h-[26px] p-1 flex items-center justify-center rounded-md bg-stone-200 dark:bg-stone-750 hover:bg-stone-300 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer text-stone-800 dark:text-stone-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Site Mode (Default / Desktop / Mobile) */}
                {onSetSiteMode && (
                  <div
                    id="menu-sitemode-row"
                    className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-850 flex items-center justify-between transition-colors text-xs text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      {siteMode === "desktop" ? (
                        <Monitor className="w-3.5 h-3.5 text-blue-500" />
                      ) : siteMode === "mobile" ? (
                        <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-stone-500" />
                      )}
                      <span className="font-medium">
                        {lang === "bn" ? "সাইট মোড" : "Site Mode"}
                      </span>
                    </div>
                    <div className="flex items-center bg-stone-200/70 dark:bg-stone-750 p-0.5 rounded-lg text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          onSetSiteMode("default");
                        }}
                        className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                          siteMode === "default"
                            ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
                        }`}
                        title={lang === "bn" ? "স্বাভাবিক মোড" : "Auto / Default"}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetSiteMode("desktop");
                        }}
                        className={`px-2 py-0.5 rounded-md font-medium transition-colors flex items-center gap-1 ${
                          siteMode === "desktop"
                            ? "bg-white dark:bg-stone-900 text-blue-600 dark:text-blue-400 shadow-xs"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
                        }`}
                        title={lang === "bn" ? "ডেস্কটপ সংস্করণ" : "Desktop site"}
                      >
                        <Monitor className="w-2.5 h-2.5" />
                        Desk
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetSiteMode("mobile");
                        }}
                        className={`px-2 py-0.5 rounded-md font-medium transition-colors flex items-center gap-1 ${
                          siteMode === "mobile"
                            ? "bg-white dark:bg-stone-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
                        }`}
                        title={lang === "bn" ? "মোবাইল সংস্করণ" : "Mobile site"}
                      >
                        <Smartphone className="w-2.5 h-2.5" />
                        Mob
                      </button>
                    </div>
                  </div>
                )}

                {/* Search Engine Selector (Google default / DuckDuckGo / Bing, BN+EN) */}
                {onSetSearchEngine && (
                  <div
                    id="menu-search-engine-row"
                    className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-850 flex flex-col gap-1.5 transition-colors text-xs text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-medium">
                          {t.searchEngineLabel || (lang === "bn" ? "সার্চ ইঞ্জিন" : "Search Engine")}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-stone-200/70 dark:bg-stone-750 p-0.5 rounded-lg text-[11px]">
                      <button
                        id="btn-search-engine-google"
                        type="button"
                        onClick={() => onSetSearchEngine("google")}
                        className={`px-2 py-1 rounded-md font-medium transition-colors truncate ${
                          searchEngineId === "google"
                            ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
                        }`}
                        title={t.searchEngineGoogle || "Google"}
                      >
                        {lang === "bn" ? "গুগল" : "Google"}
                      </button>
                      <button
                        id="btn-search-engine-duckduckgo"
                        type="button"
                        onClick={() => onSetSearchEngine("duckduckgo")}
                        className={`px-2 py-1 rounded-md font-medium transition-colors truncate ${
                          searchEngineId === "duckduckgo"
                            ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
                        }`}
                        title={t.searchEngineDuckDuckGo || "DuckDuckGo"}
                      >
                        {lang === "bn" ? "ডাকডাকগো" : "DuckDuckGo"}
                      </button>
                      <button
                        id="btn-search-engine-bing"
                        type="button"
                        onClick={() => onSetSearchEngine("bing")}
                        className={`px-2 py-1 rounded-md font-medium transition-colors truncate ${
                          searchEngineId === "bing"
                            ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
                        }`}
                        title={t.searchEngineBing || "Bing"}
                      >
                        {lang === "bn" ? "বিং" : "Bing"}
                      </button>
                    </div>
                  </div>
                )}

                {onTranslatePage && url && (
                  <button
                    id="menu-translate-page"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onTranslatePage();
                    }}
                    disabled={isTranslating}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Languages className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        {isTranslating
                          ? t.translating
                          : isPageTranslated
                          ? t.viewOriginal
                          : t.translatePage || "Translate Page"}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      BN ↔ EN
                    </span>
                  </button>
                )}

                {/* Share Page */}
                {onSharePage && url && (
                  <button
                    id="menu-share-page"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSharePage();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{t.menuSharePage || "Share page"}</span>
                    </div>
                  </button>
                )}

                {/* Copy Link */}
                {onCopyLink && url && (
                  <button
                    id="menu-copy-link"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onCopyLink();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <Copy className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                      <span>{t.menuCopyLink || "Copy link"}</span>
                    </div>
                  </button>
                )}

                {/* Open in External Browser */}
                {onOpenExternalBrowser && url && (
                  <button
                    id="menu-open-external-browser"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenExternalBrowser();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                      <span>{t.menuOpenExternalBrowser || "Open in external browser"}</span>
                    </div>
                  </button>
                )}

                {/* Save Page */}
                {onSavePage && url && (
                  <button
                    id="menu-save-page"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSavePage();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <FileDown className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                      <span>{t.savePage || "Save Page As..."}</span>
                    </div>
                    <span className="text-[10px] font-mono text-stone-400">
                      Ctrl+S
                    </span>
                  </button>
                )}

                {/* Print Page */}
                {onPrintPage && url && (
                  <button
                    id="menu-print-page"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onPrintPage();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
                  >
                    <div className="flex items-center gap-2">
                      <Printer className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                      <span>{t.printPage || "Print..."}</span>
                    </div>
                    <span className="text-[10px] font-mono text-stone-400">
                      Ctrl+P
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenPromiseModal("values");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t.fiveValues.title}</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold uppercase">
                    5 Values
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenNetworkModal("callsafe");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between font-semibold text-blue-700 dark:text-blue-400"
                >
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                    <span>{lang === "bn" ? "কল-সেফ আর্কিটেকচার" : "Call-Safe Architecture"}</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold uppercase">
                    Call-Safe
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenPromiseModal("covenant");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between font-semibold text-stone-700 dark:text-stone-300"
                >
                  <div className="flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t.promise.title}</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 font-bold uppercase">
                    Promise
                  </span>
                </button>

                {onOpenReleaseNotes && (
                  <button
                    id="btn-menu-release-notes"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenReleaseNotes();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between font-semibold text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{t.releaseNotes}</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                      v2.0.0
                    </span>
                  </button>
                )}

                <div className="my-1 border-t border-stone-100 dark:border-stone-800" />

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onToggleLanguage();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-medium"
                >
                  <span>{lang === "bn" ? "Switch to English" : "বাংলায় দেখুন"}</span>
                  <Languages className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

    {/* Non-blocking System WebView (< Chromium 110) Advisory Banner */}
    {isOutdatedWebView && (
      <div
        id="outdated-webview-banner"
        role="status"
        className="bg-amber-950/95 text-amber-100 px-3 sm:px-4 py-1.5 border-b border-amber-600/40 text-xs flex items-center justify-between gap-2 shadow-xs z-20"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate text-[11px] text-amber-100 font-medium">
            {t.webviewOutdatedBanner ||
              "Update Android System WebView from Google Play for security and modern web compatibility."}
            {typeof chromiumMajorVersion === "number" ? ` (Chromium ${chromiumMajorVersion})` : ""}
          </span>
        </div>
        {onDismissOutdatedWebView && (
          <button
            id="btn-dismiss-outdated-webview"
            type="button"
            onClick={onDismissOutdatedWebView}
            className="px-2 py-0.5 rounded bg-amber-900 hover:bg-amber-800 text-amber-200 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
          >
            {t.webviewOutdatedUpdateAction || "Dismiss"}
          </button>
        )}
      </div>
    )}

    {/* Network Transition Notification Strip */}
    {transitionNotice && (
      <div
        id="network-transition-banner"
        className="bg-stone-900 text-white px-4 py-1.5 border-b border-emerald-500/30 text-xs flex items-center justify-between gap-2 shadow-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate text-[11px] text-stone-200 font-medium">
            {transitionNotice}
          </span>
          <span className="hidden sm:inline text-[9px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-500/40 rounded-sm font-semibold uppercase">
            State Preserved
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenNetworkModal}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 cursor-pointer"
          >
            ইঞ্জিন অডিট →
          </button>
          {onDismissTransitionNotice && (
            <button
              type="button"
              onClick={onDismissTransitionNotice}
              className="p-0.5 text-stone-400 hover:text-white"
              aria-label="Dismiss notice"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    )}
  </>
  );
};
