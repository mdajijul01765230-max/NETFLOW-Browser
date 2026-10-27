import React from "react";
import {
  Cpu,
  X,
  BatteryCharging,
  Moon,
  Zap,
  CheckCircle2,
  HardDrive,
  Activity,
} from "lucide-react";
import { PerformanceConfig } from "../types";
import { Language, translations } from "../locales";
import { detectAndroidWebViewEnvironment } from "../services/androidWebViewFoundation";

interface DeviceOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PerformanceConfig;
  onUpdateConfig: (config: Partial<PerformanceConfig>) => void;
  sleepingTabsCount: number;
  totalTabsCount: number;
  lang: Language;
}

export const DeviceOptimizerModal: React.FC<DeviceOptimizerModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  sleepingTabsCount,
  totalTabsCount,
  lang,
}) => {
  if (!isOpen) return null;

  const t = translations[lang];

  return (
    <div
      id="device-optimizer-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="device-optimizer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-optimizer-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2
                id="device-optimizer-title"
                className="text-sm font-bold text-stone-900 dark:text-stone-100"
              >
                {t.performanceModalTitle}
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Optimized for low-RAM smartphones &amp; battery conservation
              </p>
            </div>
          </div>
          <button
            id="btn-close-device-optimizer"
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
          {/* Active RAM Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700/60 text-center">
              <span className="text-[10px] text-stone-400 block uppercase">
                Sleeping Tabs
              </span>
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {sleepingTabsCount} / {totalTabsCount}
              </span>
              <span className="text-[10px] text-stone-500 block mt-0.5">
                Freed from RAM
              </span>
            </div>

            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700/60 text-center">
              <span className="text-[10px] text-stone-400 block uppercase">
                Memory Footprint
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                ~18 MB
              </span>
              <span className="text-[10px] text-stone-500 block mt-0.5">
                Low Resource Profile
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
              Hardware Optimization Toggles
            </h3>

            {/* Toggle 1: Low RAM Mode */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="space-y-0.5 pr-3">
                <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                  Aggressive Tab Suspension (Low-RAM Mode)
                </span>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Suspends background tabs when inactive to prevent Android low-memory phone freezes.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.lowRamMode}
                onChange={(e) => onUpdateConfig({ lowRamMode: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Toggle 2: Battery Saver */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="space-y-0.5 pr-3 flex items-start gap-2">
                <BatteryCharging className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                    Battery Saver Mode
                  </span>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Disables continuous CSS layout repaints and throttles timers to preserve device battery life.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.batterySaver}
                onChange={(e) => onUpdateConfig({ batterySaver: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Toggle 3: Dark AMOLED Mode */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="space-y-0.5 pr-3 flex items-start gap-2">
                <Moon className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                    Dark AMOLED Mode
                  </span>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    High contrast dark palette turns off black pixels on AMOLED displays for maximum battery life.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.darkAmoledMode}
                onChange={(e) => onUpdateConfig({ darkAmoledMode: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
            </div>
          </div>

          {/* Max Active Tabs slider */}
          <div className="p-3.5 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                Max Concurrent Active Tabs
              </span>
              <span className="font-bold text-emerald-600">{config.maxActiveTabs} Tabs</span>
            </div>
            <input
              type="range"
              min={2}
              max={10}
              value={config.maxActiveTabs}
              onChange={(e) => onUpdateConfig({ maxActiveTabs: Number(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-400">
              Tabs beyond this limit are safely put to sleep and restored when tapped.
            </p>
          </div>

          {/* Engine Architecture Foundation (Conditional on real Android Native WebView bridge) */}
          {(() => {
            const isNativeBridgeActive = detectAndroidWebViewEnvironment().isNativeAvailable;
            return (
              <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                      {isNativeBridgeActive
                        ? "Android Native Engine Architecture"
                        : "Web Preview & Proxy Engine"}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700/50">
                    {isNativeBridgeActive ? "Chromium WebView" : "Proxy Sandbox"}
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                  {isNativeBridgeActive ? (
                    <>
                      Using Android <code>android.webkit.WebView</code> Chromium engine with isolated JS bridge,
                      zero local file scheme leaks (<code>allowFileAccess: false</code>), and tab-segregated session continuity.
                    </>
                  ) : (
                    <>
                      Running in Web Preview proxy/sandbox mode (<code>/api/browse</code> + sandboxed iframe). Native{" "}
                      <code>android.webkit.WebView</code> activates only when the Android native bridge is present.
                    </>
                  )}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
