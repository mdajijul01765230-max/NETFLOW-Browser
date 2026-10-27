import React, { useState } from "react";
import {
  X,
  Camera,
  Mic,
  MapPin,
  Bell,
  Code2,
  ExternalLink,
  Shield,
  EyeOff,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Language, translations } from "../locales";
import { SitePrivacyOverride, SitePermissionState } from "../types";

interface SiteSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  url: string;
  siteOverride?: SitePrivacyOverride;
  onUpdateSiteOverride: (domain: string, override: Partial<SitePrivacyOverride> | null) => void;
  onClearSiteData?: (domain: string) => void;
  lang: Language;
}

export const SiteSettingsModal: React.FC<SiteSettingsModalProps> = ({
  isOpen,
  onClose,
  domain,
  url,
  siteOverride,
  onUpdateSiteOverride,
  onClearSiteData,
  lang,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const t = translations[lang];
  const isHttps = url.toLowerCase().startsWith("https://");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Safe defaults if no site-specific override exists
  const currentCamera: SitePermissionState = siteOverride?.camera ?? "block";
  const currentMic: SitePermissionState = siteOverride?.microphone ?? "block";
  const currentLocation: SitePermissionState = siteOverride?.geolocation ?? "block";
  const currentNotifications: SitePermissionState = siteOverride?.notifications ?? "block";
  const currentProtectedMedia: SitePermissionState = siteOverride?.protectedMedia ?? "block";
  const currentJs = siteOverride?.javascript ?? "allow";
  const currentPopups = siteOverride?.popups ?? "block";
  const allowTrackers = siteOverride?.allowTrackers ?? false;
  const allowHeavyImages = siteOverride?.allowHeavyImages ?? false;

  const handleUpdate = (updates: Partial<SitePrivacyOverride>) => {
    if (!domain) return;
    onUpdateSiteOverride(domain, {
      domain,
      camera: currentCamera,
      microphone: currentMic,
      geolocation: currentLocation,
      notifications: currentNotifications,
      protectedMedia: currentProtectedMedia,
      javascript: currentJs,
      popups: currentPopups,
      allowTrackers,
      allowHeavyImages,
      createdAt: siteOverride?.createdAt || Date.now(),
      ...updates,
    });
  };

  const handleResetToDefaults = () => {
    if (!domain) return;
    onUpdateSiteOverride(domain, null);
    showToast(t.sitePermissionsResetSuccess || "All site permissions reset to global defaults");
  };

  const handleClearSiteStorage = () => {
    if (!domain || !onClearSiteData) return;
    onClearSiteData(domain);
    showToast(t.siteDataCleared || "Site data cleared successfully");
  };

  const hasAnyCustomOverride = Boolean(
    siteOverride &&
      (siteOverride.camera !== undefined ||
        siteOverride.microphone !== undefined ||
        siteOverride.geolocation !== undefined ||
        siteOverride.notifications !== undefined ||
        siteOverride.protectedMedia !== undefined ||
        siteOverride.javascript !== undefined ||
        siteOverride.popups !== undefined ||
        siteOverride.allowTrackers !== undefined ||
        siteOverride.allowHeavyImages !== undefined)
  );

  return (
    <div
      id="site-settings-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="site-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-settings-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2
                  id="site-settings-title"
                  className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate"
                >
                  {domain || "Current Site"}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    isHttps
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {isHttps ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                  {isHttps ? "Secure" : "HTTP"}
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                {t.siteSettingsSubtitle || "Fine-grained privacy and hardware controls for this domain"}
              </p>
            </div>
          </div>
          <button
            id="btn-close-site-settings"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-750 transition-colors touch-manipulation cursor-pointer text-stone-500"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{toastMessage}</span>
            </div>
          )}

          {/* Section 1: Hardware & Sensitive Permissions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs uppercase tracking-wider text-[11px]">
                {t.permissionsHeading || "Permissions"}
              </h3>
              <span className="text-[10px] text-stone-400 font-mono">
                {hasAnyCustomOverride
                  ? lang === "bn"
                    ? "কাস্টম রুল সক্রিয়"
                    : "Custom Rules Active"
                  : lang === "bn"
                  ? "ডিফল্ট রুল সক্রিয়"
                  : "Global Defaults Active"}
              </span>
            </div>

            <div className="space-y-2">
              {/* Camera */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <Camera className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.cameraPermission || "Camera"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {t.cameraPermissionDesc || "Request to capture photo or video streams"}
                    </p>
                  </div>
                </div>
                <select
                  id="select-site-perm-camera"
                  value={currentCamera}
                  onChange={(e) => handleUpdate({ camera: e.target.value as SitePermissionState })}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="block">{t.permBlock || "Block (Safe)"}</option>
                  <option value="ask">{t.permAsk || "Ask"}</option>
                  <option value="allow">{t.permAllow || "Allow"}</option>
                </select>
              </div>

              {/* Microphone */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <Mic className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.microphonePermission || "Microphone"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {t.microphonePermissionDesc || "Request to record voice or audio inputs"}
                    </p>
                  </div>
                </div>
                <select
                  id="select-site-perm-mic"
                  value={currentMic}
                  onChange={(e) => handleUpdate({ microphone: e.target.value as SitePermissionState })}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="block">{t.permBlock || "Block (Safe)"}</option>
                  <option value="ask">{t.permAsk || "Ask"}</option>
                  <option value="allow">{t.permAllow || "Allow"}</option>
                </select>
              </div>

              {/* Geolocation */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <MapPin className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.locationPermission || "Location"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {t.locationPermissionDesc || "Request to access physical coordinates"}
                    </p>
                  </div>
                </div>
                <select
                  id="select-site-perm-location"
                  value={currentLocation}
                  onChange={(e) =>
                    handleUpdate({ geolocation: e.target.value as SitePermissionState })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="block">{t.permBlock || "Block (Safe)"}</option>
                  <option value="ask">{t.permAsk || "Ask"}</option>
                  <option value="allow">{t.permAllow || "Allow"}</option>
                </select>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <Bell className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.notificationsPermission || "Notifications"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {t.notificationsPermissionDesc || "Request to show push or alert notices"}
                    </p>
                  </div>
                </div>
                <select
                  id="select-site-perm-notifications"
                  value={currentNotifications}
                  onChange={(e) =>
                    handleUpdate({ notifications: e.target.value as SitePermissionState })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="block">{t.permBlock || "Block (Safe)"}</option>
                  <option value="ask">{t.permAsk || "Ask"}</option>
                  <option value="allow">{t.permAllow || "Allow"}</option>
                </select>
              </div>

              {/* Protected Media / DRM (NETFLOW-CHROME-LIKE-UX-01 Part E) */}
              <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 pr-2">
                    <Shield className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                        {t.permProtectedMediaLabel || "Protected Media (DRM)"}
                      </span>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        {t.permProtectedMediaDesc ||
                          "Allow site to use protected-content playback (DRM media ID)"}
                      </p>
                    </div>
                  </div>
                  <select
                    id="select-site-perm-protected-media"
                    value={currentProtectedMedia}
                    onChange={(e) =>
                      handleUpdate({ protectedMedia: e.target.value as SitePermissionState })
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="block">{t.permBlock || "Block (Safe)"}</option>
                    <option value="ask">{t.permAsk || "Ask"}</option>
                    <option value="allow">{t.permAllow || "Allow"}</option>
                  </select>
                </div>
                <p
                  id="site-perm-protected-media-note"
                  className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed pl-6"
                >
                  {t.protectedMediaDeviceNote ||
                    "Note: Actual protected-media playback depends on device hardware DRM provisioning and system WebView support (NOT VERIFIED)."}
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Content & Security Rules */}
          <div className="space-y-2 pt-1">
            <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs uppercase tracking-wider text-[11px]">
              {t.contentSettingsHeading || "Content & Privacy Rules"}
            </h3>

            <div className="space-y-2">
              {/* JavaScript */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <Code2 className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.javascriptPermission || "JavaScript"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {t.javascriptPermissionDesc || "Permission to execute dynamic page scripts"}
                    </p>
                  </div>
                </div>
                <select
                  id="select-site-perm-js"
                  value={currentJs}
                  onChange={(e) => handleUpdate({ javascript: e.target.value as "allow" | "block" })}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="allow">{t.permAllow || "Allow (Default)"}</option>
                  <option value="block">{t.permBlock || "Block"}</option>
                </select>
              </div>

              {/* Popups & Redirects */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <ExternalLink className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.popupsPermission || "Popups & Redirects"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {t.popupsPermissionDesc || "Block new unsolicited tabs or navigation redirects"}
                    </p>
                  </div>
                </div>
                <select
                  id="select-site-perm-popups"
                  value={currentPopups}
                  onChange={(e) => handleUpdate({ popups: e.target.value as "allow" | "block" })}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="block">{t.permBlock || "Block (Default)"}</option>
                  <option value="allow">{t.permAllow || "Allow"}</option>
                </select>
              </div>

              {/* Trackers on this site */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <EyeOff className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {t.siteAllowTrackers || "Ad & Tracker Blocker"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {allowTrackers
                        ? lang === "bn"
                          ? "ট্র্যাকার ফিল্টারিং শিথিল করা হয়েছে"
                          : "Tracker filtering relaxed for this site"
                        : lang === "bn"
                        ? "ট্র্যাকার ও অ্যানালিটিক্স সম্পূর্ণ ব্লক করা আছে"
                        : "Trackers & analytics actively filtered"}
                    </p>
                  </div>
                </div>
                <button
                  id="btn-toggle-site-trackers"
                  type="button"
                  onClick={() => handleUpdate({ allowTrackers: !allowTrackers })}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer border ${
                    allowTrackers
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                  }`}
                >
                  {allowTrackers ? t.permAllow || "Allowed" : t.permBlock || "Blocked"}
                </button>
              </div>

              {/* Heavy Images on this site */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2.5 pr-2">
                  <ImageIcon className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                      {lang === "bn" ? "ভারী ইমেজ কম্প্রেশন" : "Heavy Image Optimization"}
                    </span>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {allowHeavyImages
                        ? lang === "bn"
                          ? "আসল রেজোলিউশনে ছবি ডাউনলোড করুন"
                          : "Full resolution images loaded"
                        : lang === "bn"
                        ? "ডেটা সাশ্রয়ে অপ্টিমাইজড ওয়েবপি ছবি"
                        : "Optimized WebP for data saving"}
                    </p>
                  </div>
                </div>
                <button
                  id="btn-toggle-site-heavy-images"
                  type="button"
                  onClick={() => handleUpdate({ allowHeavyImages: !allowHeavyImages })}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer border ${
                    allowHeavyImages
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                  }`}
                >
                  {allowHeavyImages
                    ? lang === "bn"
                      ? "আসল"
                      : "Original"
                    : lang === "bn"
                    ? "অপ্টিমাইজড"
                    : "Optimized"}
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Storage & Quick Clear for this site */}
          <div className="space-y-2 pt-1">
            <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs uppercase tracking-wider text-[11px]">
              {t.siteDataTitle || "Site Data & Storage Control"}
            </h3>
            <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 flex items-center justify-between">
              <div className="pr-3">
                <span className="font-semibold text-rose-900 dark:text-rose-200 block text-xs">
                  {t.clearThisSiteData || "Clear Data for This Site"}
                </span>
                <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                  {lang === "bn"
                    ? "এই সাইটের কুকিজ ও স্থানীয় ক্যাশ সাফ করুন"
                    : "Purge cookies and cached storage for this domain"}
                </p>
              </div>
              <button
                id="btn-clear-site-storage-in-settings"
                type="button"
                onClick={handleClearSiteStorage}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{lang === "bn" ? "সাফ করুন" : "Clear"}</span>
              </button>
            </div>
          </div>

          {/* Reassurance Notice */}
          <div className="p-3 bg-stone-100 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 flex items-start gap-2 text-stone-600 dark:text-stone-400">
            <AlertCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-[11px] leading-relaxed">
              {t.noAutomaticGrantWarning ||
                "Zero-Surprise Guarantee: Sensitive hardware permissions are never silently or automatically granted."}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-stone-50 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
          {hasAnyCustomOverride ? (
            <button
              id="btn-reset-site-settings"
              type="button"
              onClick={handleResetToDefaults}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
              <span>{t.resetSitePermissionsBtn || "Reset to Defaults"}</span>
            </button>
          ) : (
            <div className="text-[11px] text-stone-400 italic">
              {lang === "bn" ? "গ্লোবাল ডিফল্ট প্রযোজ্য" : "Standard defaults applied"}
            </div>
          )}

          <button
            id="btn-done-site-settings"
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 font-semibold transition-colors cursor-pointer"
          >
            {t.done || "Done"}
          </button>
        </div>
      </div>
    </div>
  );
};
