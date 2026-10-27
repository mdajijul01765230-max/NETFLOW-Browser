import React, { useState, useRef, useEffect } from "react";
import {
  ShieldCheck,
  X,
  EyeOff,
  Lock,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Camera,
  MapPin,
  Mic,
  Download,
  Globe,
  Sliders,
  RotateCcw,
} from "lucide-react";
import { PrivacyConfig, SearchEngineId, SitePrivacyOverride } from "../types";
import { Language, translations } from "../locales";
import { formatBytes, getCleanDomain } from "../utils/formatters";

interface PrivacyShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  privacyConfig: PrivacyConfig;
  onUpdateConfig: (config: Partial<PrivacyConfig>) => void;
  onClearCache: () => void;
  totalTrackersBlocked: number;
  totalSavedBytes?: number;
  lang: Language;
  currentUrl?: string;
  siteOverride?: SitePrivacyOverride;
  onUpdateSiteOverride?: (domain: string, override: Partial<SitePrivacyOverride> | null) => void;
  onOpenClearData?: () => void;
  onOpenSiteSettings?: () => void;
  searchEngineId?: SearchEngineId;
  onSetSearchEngine?: (engineId: SearchEngineId) => void;
}

export const PrivacyShieldModal: React.FC<PrivacyShieldModalProps> = ({
  isOpen,
  onClose,
  privacyConfig,
  onUpdateConfig,
  onClearCache,
  totalTrackersBlocked,
  totalSavedBytes,
  lang,
  currentUrl = "",
  siteOverride,
  onUpdateSiteOverride,
  onOpenClearData,
  onOpenSiteSettings,
  searchEngineId = "google",
  onSetSearchEngine,
}) => {
  const t = translations[lang];
  const [clearedToast, setClearedToast] = useState(false);
  const [exportedToast, setExportedToast] = useState(false);
  const clearedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearedToastTimerRef.current) clearTimeout(clearedToastTimerRef.current);
      if (exportedToastTimerRef.current) clearTimeout(exportedToastTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const currentDomain = currentUrl && !currentUrl.startsWith("search://") ? getCleanDomain(currentUrl) : "";
  const hasValidDomain = Boolean(currentDomain && !currentDomain.includes(" ") && currentDomain.includes("."));

  const handleClear = () => {
    onClearCache();
    if (clearedToastTimerRef.current) clearTimeout(clearedToastTimerRef.current);
    setClearedToast(true);
    clearedToastTimerRef.current = setTimeout(() => {
      setClearedToast(false);
      clearedToastTimerRef.current = null;
    }, 2500);
  };

  const handleExportReceipt = () => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const receipt = {
      receiptType: "NETFLOW_PRIVACY_AUDIT_RECEIPT",
      application: "NETFLOW Browser",
      version: "2.0.0-dev",
      exportedAt: now.toISOString(),
      sessionAudit: {
        trackersFiltered: totalTrackersBlocked,
        bandwidthSavedBytes: totalSavedBytes ?? 0,
        bandwidthSavedFormatted: formatBytes(totalSavedBytes ?? 0),
      },
      protectionSettings: {
        adAndTrackerBlocking: privacyConfig.blockTrackers,
        browserFingerprintShield: privacyConfig.spoofFingerprint,
        httpsOnlyMode: privacyConfig.httpsOnly,
        blockHeavyImages: privacyConfig.blockHeavyImages,
        zeroTelemetryEnforced: privacyConfig.zeroTelemetry,
      },
      hardwarePermissionGuard: {
        camera: "BLOCKED",
        microphone: "BLOCKED",
        location: "BLOCKED",
      },
      privacyPledge: {
        clientSideExportOnly: true,
        remoteTransmission: false,
        historyExported: false,
        credentialsStored: false,
      },
    };

    const jsonString = JSON.stringify(receipt, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `netflow-privacy-receipt-${dateStr}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    if (exportedToastTimerRef.current) clearTimeout(exportedToastTimerRef.current);
    setExportedToast(true);
    exportedToastTimerRef.current = setTimeout(() => {
      setExportedToast(false);
      exportedToastTimerRef.current = null;
    }, 3000);
  };

  return (
    <div
      id="privacy-shield-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="privacy-shield-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-shield-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2
                id="privacy-shield-title"
                className="text-sm font-bold text-stone-900 dark:text-stone-100"
              >
                {t.privacyModalTitle}
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                User-First Security • Zero Telemetry Pledge
              </p>
            </div>
          </div>
          <button
            id="btn-close-privacy-shield"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors touch-manipulation cursor-pointer"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Tracker stats summary */}
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-600 text-white rounded-lg">
                <EyeOff className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-emerald-950 dark:text-emerald-200 text-sm block">
                  {totalTrackersBlocked} Trackers Filtered
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Analytics, pixels &amp; behavioral profiling stopped
                </span>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">
              Active
            </span>
          </div>

          {/* Omnibox Default Search Engine Setting (BN+EN) */}
          {onSetSearchEngine && (
            <div
              id="settings-search-engine-section"
              className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-2"
            >
              <div>
                <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                  {t.searchEngineLabel || (lang === "bn" ? "সার্চ ইঞ্জিন" : "Search Engine")}
                </span>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {t.searchEngineDesc ||
                    (lang === "bn"
                      ? "অ্যাড্রেস বার (Omnibox) থেকে সরাসরি অনুসন্ধানের ডিফল্ট ইঞ্জিন"
                      : "Default search engine for Omnibox non-URL queries")}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "google", label: t.searchEngineGoogle || (lang === "bn" ? "গুগল (Google)" : "Google") },
                    {
                      id: "duckduckgo",
                      label: t.searchEngineDuckDuckGo || (lang === "bn" ? "ডাকডাকগো (DuckDuckGo)" : "DuckDuckGo"),
                    },
                    { id: "bing", label: t.searchEngineBing || (lang === "bn" ? "বিং (Bing)" : "Bing") },
                  ] as const
                ).map((eng) => (
                  <button
                    key={eng.id}
                    id={`settings-search-engine-${eng.id}`}
                    type="button"
                    onClick={() => onSetSearchEngine(eng.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      searchEngineId === eng.id
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
                    }`}
                  >
                    {eng.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Toggles */}
          <div className="space-y-3">
            <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
              Protection Controls
            </h3>

            {/* Toggle 1: Block Trackers */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="space-y-0.5 pr-3">
                <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                  Ad &amp; Tracker Blocker
                </span>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Strips Google Analytics, Facebook Pixel, Criteo, and tracking cookies.
                </p>
              </div>
              <input
                id="toggle-block-trackers"
                type="checkbox"
                aria-label="Ad & Tracker Blocker"
                checked={privacyConfig.blockTrackers}
                onChange={(e) => onUpdateConfig({ blockTrackers: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Toggle 2: Fingerprint Shield */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="space-y-0.5 pr-3 flex items-start gap-2">
                <Fingerprint className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                    Browser Fingerprint Shield
                  </span>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Injects subtle noise to prevent third-parties from fingerprinting your device hardware.
                  </p>
                </div>
              </div>
              <input
                id="toggle-spoof-fingerprint"
                type="checkbox"
                aria-label="Browser Fingerprint Shield"
                checked={privacyConfig.spoofFingerprint}
                onChange={(e) => onUpdateConfig({ spoofFingerprint: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Toggle 3: HTTPS Only */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="space-y-0.5 pr-3 flex items-start gap-2">
                <Lock className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                    HTTPS-Only Mode
                  </span>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Automatically upgrades unencrypted HTTP requests to secure TLS connections.
                  </p>
                </div>
              </div>
              <input
                id="toggle-https-only"
                type="checkbox"
                aria-label="HTTPS-Only Mode"
                checked={privacyConfig.httpsOnly}
                onChange={(e) => onUpdateConfig({ httpsOnly: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
            </div>
          </div>

          {/* Per-Site Privacy Exception / Whitelist Section */}
          {hasValidDomain && onUpdateSiteOverride && (
            <div
              id="site-privacy-override-container"
              className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-850/60 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-stone-900 dark:text-stone-100 block text-xs">
                      {t.sitePrivacySection}
                    </span>
                    <span className="text-[11px] font-mono text-stone-600 dark:text-stone-300">
                      {currentDomain}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    siteOverride?.allowTrackers
                      ? "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                      : "bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                  }`}
                >
                  {siteOverride?.allowTrackers ? t.siteCustomExceptionActive : t.siteGlobalDefaultActive}
                </span>
              </div>

              <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-normal">
                {t.sitePrivacyNotice}
              </p>

              {/* Toggle: allow trackers on this site only */}
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5 pr-3">
                  <span className="font-medium text-stone-800 dark:text-stone-200 block text-[11px]">
                    {t.siteAllowTrackers}
                  </span>
                  <span className="text-[10px] text-stone-500 dark:text-stone-400 block">
                    {t.siteAllowTrackersDesc}
                  </span>
                </div>
                <input
                  id="toggle-site-allow-trackers"
                  type="checkbox"
                  aria-label={t.siteAllowTrackers}
                  checked={siteOverride?.allowTrackers ?? false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked) {
                      onUpdateSiteOverride(currentDomain, {
                        domain: currentDomain,
                        allowTrackers: true,
                        createdAt: Date.now(),
                      });
                    } else {
                      // Remove exception to revert to global defaults
                      onUpdateSiteOverride(currentDomain, null);
                    }
                  }}
                  className="w-4 h-4 accent-amber-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Reset to global default button if override exists */}
              {siteOverride && (
                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-end">
                  <button
                    id="btn-reset-site-privacy"
                    type="button"
                    onClick={() => onUpdateSiteOverride(currentDomain, null)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-stone-500" />
                    <span>{t.resetSitePrivacy}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Strict Permission Guard */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                {t.permissionsHeading || "Hardware Permission Guard"}
              </h3>
              {currentDomain && onOpenSiteSettings && (
                <button
                  id="btn-open-site-settings-from-shield"
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSiteSettings();
                  }}
                  className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{t.siteSettingsTitle || "Configure Site"}</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center">
                <Camera className="w-4 h-4 mx-auto text-stone-500 mb-1" />
                <span className="font-medium text-stone-700 dark:text-stone-300 block text-[11px]">
                  {t.cameraPermission || "Camera"}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase ${
                    siteOverride?.camera === "allow" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {siteOverride?.camera === "allow"
                    ? "Allowed"
                    : siteOverride?.camera === "ask"
                    ? "Ask"
                    : "Blocked"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center">
                <Mic className="w-4 h-4 mx-auto text-stone-500 mb-1" />
                <span className="font-medium text-stone-700 dark:text-stone-300 block text-[11px]">
                  {t.microphonePermission || "Microphone"}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase ${
                    siteOverride?.microphone === "allow" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {siteOverride?.microphone === "allow"
                    ? "Allowed"
                    : siteOverride?.microphone === "ask"
                    ? "Ask"
                    : "Blocked"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center">
                <MapPin className="w-4 h-4 mx-auto text-stone-500 mb-1" />
                <span className="font-medium text-stone-700 dark:text-stone-300 block text-[11px]">
                  {t.locationPermission || "Location"}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase ${
                    siteOverride?.geolocation === "allow" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {siteOverride?.geolocation === "allow"
                    ? "Allowed"
                    : siteOverride?.geolocation === "ask"
                    ? "Ask"
                    : "Blocked"}
                </span>
              </div>
            </div>
          </div>

          {/* Privacy Receipt Export */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-1.5">
            <button
              id="btn-export-privacy-receipt"
              onClick={handleExportReceipt}
              className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border border-emerald-200/70 dark:border-emerald-800/70 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{t.exportPrivacyReceipt}</span>
            </button>
            {exportedToast && (
              <p className="text-emerald-600 dark:text-emerald-400 text-[11px] text-center font-medium">
                ✓ {t.privacyReceiptDownloaded}
              </p>
            )}
          </div>

          {/* Clear Browsing Data & Cache */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-2">
            <button
              id="btn-open-clear-data-from-privacy"
              type="button"
              onClick={() => {
                if (onOpenClearData) {
                  onClose();
                  onOpenClearData();
                } else {
                  handleClear();
                }
              }}
              className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border border-rose-200/60 dark:border-rose-800/60 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.clearBrowsingDataTitle || "Clear Browsing Data"}...</span>
            </button>
            {clearedToast && (
              <p className="text-emerald-600 text-[11px] text-center mt-1.5 font-medium">
                {t.cacheCleared}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
