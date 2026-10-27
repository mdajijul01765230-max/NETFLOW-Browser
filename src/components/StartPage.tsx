import React, { useState } from "react";
import {
  ShieldCheck,
  Zap,
  BookOpen,
  Wifi,
  Search,
  ArrowUpRight,
  DownloadCloud,
  FileText,
  Cpu,
  Sparkles,
  BookMarked,
  Library,
  Newspaper,
  Terminal,
  HeartPulse,
  Code,
  CloudSun,
  Scale,
  BadgeCheck,
  CheckCircle2,
  XCircle,
  HeartHandshake,
  Radio,
  Signal,
  WifiOff,
  ArrowRightLeft,
  Lock,
  PhoneCall,
  FileCode2,
} from "lucide-react";
import { Bookmark, BrowsingMode, NetworkState, OfflineCapsule } from "../types";
import { Language, translations } from "../locales";
import { formatBytes, formatDate } from "../utils/formatters";
import { getMediumDisplayName, isWeakNetwork } from "../services/networkEngine";
import { detectAndroidWebViewEnvironment } from "../services/androidWebViewFoundation";

interface StartPageProps {
  bookmarks: Bookmark[];
  offlineCapsules: OfflineCapsule[];
  networkState: NetworkState;
  browsingMode: BrowsingMode;
  totalSavedBytes: number;
  lang: Language;
  onNavigate: (url: string) => void;
  onSetBrowsingMode: (mode: BrowsingMode) => void;
  onOpenCapsule: (capsule: OfflineCapsule) => void;
  onOpenNetworkModal: (tab?: "engine" | "smart4g" | "callsafe" | "transitions" | "modes" | "boundaries") => void;
  onOpenAiModal: () => void;
  onOpenPromiseModal: (tab?: "covenant" | "values" | "workbench" | "boundaries") => void;
  onOpenBookmarksModal?: () => void;
  onOpenReleaseNotes?: () => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  BookOpen: <BookOpen className="w-4 h-4 text-emerald-600" />,
  Library: <Library className="w-4 h-4 text-blue-600" />,
  Newspaper: <Newspaper className="w-4 h-4 text-amber-600" />,
  Terminal: <Terminal className="w-4 h-4 text-orange-600" />,
  HeartPulse: <HeartPulse className="w-4 h-4 text-rose-600" />,
  BookMarked: <BookMarked className="w-4 h-4 text-teal-600" />,
  Code: <Code className="w-4 h-4 text-indigo-600" />,
  CloudSun: <CloudSun className="w-4 h-4 text-cyan-600" />,
};

export const StartPage: React.FC<StartPageProps> = ({
  bookmarks,
  offlineCapsules,
  networkState,
  browsingMode,
  totalSavedBytes,
  lang,
  onNavigate,
  onSetBrowsingMode,
  onOpenCapsule,
  onOpenNetworkModal,
  onOpenAiModal,
  onOpenPromiseModal,
  onOpenBookmarksModal,
  onOpenReleaseNotes,
}) => {
  const t = translations[lang];
  const p = t.promise;
  const [searchInput, setSearchInput] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    onNavigate(searchInput.trim());
  };

  return (
    <div
      id="netflow-start-page"
      className="flex-1 min-h-full bg-stone-50 text-stone-800 dark:bg-stone-950 dark:text-stone-100 pt-8 pb-16 sm:py-10 px-4 sm:px-6 overflow-y-auto"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Brand identity header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 text-xs font-medium border border-emerald-300/40">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>GLOBAL TRUST &amp; HUMAN-FIRST SMART BROWSER</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-50 font-serif">
            NETFLOW
          </h1>

          <p className="text-base text-stone-600 dark:text-stone-300 max-w-xl mx-auto font-medium leading-relaxed">
            {t.tagline}
          </p>

          <p className="text-xs text-stone-500 dark:text-stone-400 font-mono tracking-wide">
            {t.corePillars}
          </p>
        </div>

        {/* Omnibox search on start page */}
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              id="start-page-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.searchOrUrlPlaceholder}
              aria-label={t.searchOrUrlPlaceholder}
              className="w-full pl-12 pr-28 py-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50 text-base"
            />
            <Search className="w-5 h-5 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium shadow-xs transition-colors"
            >
              Go / Search
            </button>
          </form>

          {/* Mode switch pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs">
            <span className="text-stone-500 text-[11px]">Mode:</span>
            {(
              [
                { id: "smart-compress", label: t.modeSmartCompress },
                { id: "text-only", label: t.modeTextOnly },
                { id: "reader", label: t.modeReader },
                { id: "full", label: t.modeFull },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => onSetBrowsingMode(m.id)}
                className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                  browsingMode === m.id
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-stone-200/80 text-stone-700 hover:bg-stone-300 dark:bg-stone-850 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* THE NETFLOW PROMISE Interactive Showcase Card */}
        <div
          id="netflow-promise-card"
          className="rounded-2xl bg-gradient-to-br from-stone-900 via-stone-900 to-emerald-950 text-white p-5 sm:p-6 border border-emerald-500/30 shadow-lg relative overflow-hidden"
        >
          {/* Subtle watermark background seal */}
          <div className="absolute -right-6 -bottom-6 text-emerald-500/10 pointer-events-none">
            <Scale className="w-48 h-48" />
          </div>

          <div className="relative z-10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      THE NETFLOW PROMISE
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      HONEST CODE
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                    REAL CAPABILITY OVER MARKETING CLAIMS
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenPromiseModal}
                className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Proof Workbench &amp; Full Promise</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Core statement */}
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-medium text-emerald-100/90 leading-relaxed">
                “{p.realPromiseStatement.replace(/^“|”$/g, "")}”
              </p>
              <p className="text-[11px] text-stone-300">
                {p.noUnrealisticClaims} {p.proofRuleStatement}
              </p>
            </div>

            {/* What we never claim vs what we do */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Forbidden Claims */}
              <div className="p-3 rounded-xl bg-black/30 border border-rose-500/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] uppercase tracking-wider">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>NETFLOW কখনো বলবে না:</span>
                </div>
                <div className="grid grid-cols-1 gap-1 text-[11px] text-stone-300">
                  <span className="flex items-center gap-1.5 text-stone-300">
                    <span className="text-rose-400 font-bold">✕</span> 2G-কে 4G বানানোর মিথ্যা দাবি
                  </span>
                  <span className="flex items-center gap-1.5 text-stone-300">
                    <span className="text-rose-400 font-bold">✕</span> 100% নিরাপদ বলে অবাস্তব প্রতিশ্রুতি
                  </span>
                  <span className="flex items-center gap-1.5 text-stone-300">
                    <span className="text-rose-400 font-bold">✕</span> সব ওয়েবসাইট নিমেষে খোলার অবাস্তব কথা
                  </span>
                </div>
              </div>

              {/* The "Can We Prove It?" Golden Rule */}
              <div className="p-3 rounded-xl bg-black/30 border border-emerald-500/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px] uppercase tracking-wider">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  <span>মূল নীতি: “Can we prove it?”</span>
                </div>
                <p className="text-[11px] text-stone-300 leading-relaxed">
                  যদি প্রমাণ করা না যায়: <strong>CLAIM বাদ দিতে হবে</strong> অথবা নির্ভরযোগ্যভাবে
                  পরিমাপযোগ্য করার পরে প্রকাশ করতে হবে।
                </p>
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => onOpenPromiseModal("workbench")}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                  >
                    লাইভ পরিমাপ ও ৪টি টেস্ট ওয়ার্কবেঞ্চ চালান →
                  </button>
                </div>
              </div>
            </div>

            {/* NETFLOW — FIVE HUMAN VALUES Showcase Banner */}
            <div
              id="netflow-five-human-values-preview"
              className="p-4 rounded-xl bg-black/40 border border-emerald-500/40 space-y-3 pt-3.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <HeartHandshake className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      NETFLOW — FIVE HUMAN VALUES
                    </h4>
                    <p className="text-[11px] text-stone-300">
                      প্রতিটি feature নিচের পাঁচটি পরীক্ষার মধ্য দিয়ে যেতে হবে
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenPromiseModal("values")}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>ফিচার গেটকিপার ও অডিট দেখুন</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              {/* The 5 Values Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center text-[10px]">
                <div className="p-2 rounded-lg bg-stone-900/90 border border-emerald-500/20 space-y-0.5">
                  <span className="font-bold text-emerald-400 block text-[11px]">১. উপকার</span>
                  <span className="text-stone-300 block">Human Benefit</span>
                  <span className="text-[9px] text-stone-400">বাস্তব কাজে লাগবে?</span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/90 border border-emerald-500/20 space-y-0.5">
                  <span className="font-bold text-emerald-400 block text-[11px]">২. বিশ্বাস</span>
                  <span className="text-stone-300 block">Trust</span>
                  <span className="text-[9px] text-stone-400">কী ও কেন করছে স্পষ্ট?</span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/90 border border-emerald-500/20 space-y-0.5">
                  <span className="font-bold text-emerald-400 block text-[11px]">৩. গতি</span>
                  <span className="text-stone-300 block">Performance</span>
                  <span className="text-[9px] text-stone-400">RAM/CPU/Net অপচয়মুক্ত?</span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/90 border border-emerald-500/20 space-y-0.5">
                  <span className="font-bold text-emerald-400 block text-[11px]">৪. নিরাপত্তা</span>
                  <span className="text-stone-300 block">Security & Privacy</span>
                  <span className="text-[9px] text-stone-400">গোপনীয়তা অক্ষুণ্ণ?</span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/90 border border-emerald-500/20 space-y-0.5">
                  <span className="font-bold text-emerald-400 block text-[11px]">৫. শান্তি</span>
                  <span className="text-stone-300 block">Peaceful UX</span>
                  <span className="text-[9px] text-stone-400">Popup ও জটিলতামুক্ত?</span>
                </div>
              </div>

              {/* Golden Rule Footer inside card */}
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                <div className="space-y-0.5">
                  <strong className="text-white block font-bold">
                    Golden Rule: “More features” নয়। “More useful features”।
                  </strong>
                  <span className="text-stone-300 text-[10px]">
                    যে feature মানুষের বাস্তব উপকারের তুলনায় performance, privacy, security বা simplicity-এর ক্ষতি বেশি করে, সেটি NETFLOW-এ যুক্ত করা হবে না।
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    PASS → Build
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    PARTIAL → Redesign
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    FAIL → Reject
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* NETFLOW — SMART NETWORK ENGINE Interactive Card */}
        <div
          id="network-banner"
          onClick={onOpenNetworkModal}
          className="cursor-pointer bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-xs hover:border-emerald-500/50 transition-all space-y-3.5"
        >
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    NETFLOW — SMART NETWORK ENGINE
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Network-Aware
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                  “Network-aware browsing, not unauthorized network control.”
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <span>ইঞ্জিন কনসোল খুলুন</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
          </div>

          {/* Live Telemetry Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <span className="text-[10px] text-stone-400 block font-medium">সক্রিয় সংযোগ মাধ্যম</span>
              <div className="flex items-center justify-center gap-1.5 mt-0.5 font-bold text-stone-900 dark:text-stone-100">
                {networkState.medium === "wifi" ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                ) : !networkState.isOnline ? (
                  <WifiOff className="w-3.5 h-3.5 text-rose-600" />
                ) : (
                  <Signal className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span>{getMediumDisplayName(networkState.medium, lang)}</span>
              </div>
              <span className="text-[9px] text-stone-400">
                {networkState.isMetered ? "Metered Mobile" : "Unmetered Link"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <span className="text-[10px] text-stone-400 block font-medium">ইন্টারনেট যাচাই স্থিতি</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                {networkState.isOnline ? "Validated Active" : "Disconnected"}
              </span>
              <span className="text-[9px] text-stone-400">
                {(() => {
                  const hasRealAndroidBridge = detectAndroidWebViewEnvironment().isNativeAvailable;
                  return hasRealAndroidBridge
                    ? "Android Native WebView"
                    : lang === "bn"
                    ? "ওয়েব প্রিভিউ • প্রক্সি মোড"
                    : "Web Preview • Proxy Mode";
                })()}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <span className="text-[10px] text-stone-400 block font-medium">লেটেন্সি (RTT)</span>
              <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block mt-0.5">
                {networkState.isOnline ? `${networkState.rttMs} ms` : "Offline"}
              </span>
              <span className="text-[9px] text-stone-400">
                {networkState.rttMs > 400 ? "Weak / High Delay" : "Optimal Latency"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <span className="text-[10px] text-stone-400 block font-medium">মোট ডেটা সাশ্রয়</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                {formatBytes(totalSavedBytes)}
              </span>
              <span className="text-[9px] text-stone-400">Smart Compression</span>
            </div>
          </div>

          {/* 5 Objectives Quick Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-center font-medium">
              ১. সচেতন পর্যবেক্ষণ
            </div>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-center font-medium">
              ২. স্টেট সংরক্ষণ
            </div>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-center font-medium">
              ৩. ২জি অপচয় রোধ
            </div>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-center font-medium">
              ৪. নিয়ন্ত্রিত রিকভারি
            </div>
            <div className="col-span-2 sm:col-span-1 p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-center font-medium">
              ৫. শান্ত অভিজ্ঞতা
            </div>
          </div>

          {/* NETFLOW — SMART 4G PREFERENCE Spotlight */}
          <div
            id="smart-4g-spotlight"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNetworkModal("smart4g");
            }}
            className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-stone-900 via-stone-850 to-emerald-950 text-white border border-emerald-500/40 shadow-xs space-y-2 hover:border-emerald-400 transition-all cursor-pointer"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Signal className="w-4 h-4" />
                <span>{t.smart4G.title}</span>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  SMART 4G PREFERENCE
                </span>
                <span className="text-[11px] text-emerald-300 font-semibold underline underline-offset-2 flex items-center gap-1">
                  কনসোল খুলুন →
                </span>
              </div>
            </div>

            <div className="text-xs sm:text-sm font-bold text-white leading-snug">
              “{t.smart4G.mantra}”
            </div>

            <p className="text-[11px] text-stone-300 leading-relaxed">
              {t.smart4G.description}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[10px]">
              <div className="p-1.5 rounded bg-black/40 border border-emerald-500/30 text-stone-200 text-center">
                ✓ Available 4G Preference
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-emerald-500/30 text-stone-200 text-center">
                ✓ Transition & Drop Detection
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-emerald-500/30 text-stone-200 text-center">
                ✓ Session & Form Preservation
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-emerald-500/30 text-stone-200 text-center">
                ✓ Controlled 4G Recovery
              </div>
            </div>
          </div>

          {/* NETFLOW — CALL-SAFE ARCHITECTURE Spotlight */}
          <div
            id="call-safe-spotlight"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNetworkModal("callsafe");
            }}
            className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-stone-900 via-blue-950/80 to-slate-900 text-white border border-blue-500/40 shadow-xs space-y-2 hover:border-blue-400 transition-all cursor-pointer"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                <PhoneCall className="w-4 h-4" />
                <span>{t.callSafe?.title || "NETFLOW — CALL-SAFE ARCHITECTURE"}</span>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  CALL-SAFE ARCHITECTURE
                </span>
                <span className="text-[11px] text-blue-300 font-semibold underline underline-offset-2 flex items-center gap-1">
                  কনসোল খুলুন →
                </span>
              </div>
            </div>

            <div className="text-xs sm:text-sm font-bold text-white leading-snug">
              “Browse efficiently when possible, communicate normally when needed.”
            </div>

            <p className="text-[11px] text-stone-300 leading-relaxed">
              {t.callSafe?.summary || "NETFLOW browsing-এর সময় phone-এর normal calling capability নষ্ট করবে না।"}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 text-[10px]">
              <div className="p-1.5 rounded bg-black/40 border border-blue-500/30 text-stone-200 text-center">
                ✓ Normal Voice Calling Intact
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-blue-500/30 text-stone-200 text-center">
                ✓ Zero Forced LTE-Only Mode
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-blue-500/30 text-stone-200 text-center">
                ✓ Auto Post-Call Recovery
              </div>
            </div>
          </div>

          {/* Strict Platform Boundaries reassurance */}
          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                <strong>সীমাবদ্ধতা ও বিশ্বাস:</strong> Android ও ক্যারিয়ারের অনুমোদন বহির্ভূত কোনো রেডিও নিয়ন্ত্রণ বা অননুমোদিত কারসাজি NETFLOW করবে না।
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold shrink-0">
              Platform Compliant
            </span>
          </div>
        </div>

        {/* Curated Trust Destinations */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 tracking-wide uppercase">
              {t.quickStart}
            </h2>
            <div className="flex items-center gap-3">
              {onOpenBookmarksModal && (
                <button
                  id="btn-startpage-open-bookmarks"
                  type="button"
                  onClick={onOpenBookmarksModal}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <span>{t.bookmarks} ({bookmarks.length})</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
              <span className="text-xs text-stone-500 dark:text-stone-400 hidden sm:inline">
                Zero trackers • Verified secure
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {bookmarks.map((bm) => (
              <button
                key={bm.id}
                id={`bookmark-${bm.id}`}
                type="button"
                onClick={() => onNavigate(bm.url)}
                aria-label={bm.title}
                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-2xs hover:shadow-sm text-left transition-all group"
              >
                <div className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/50 transition-colors shrink-0">
                  {ICON_MAP[bm.iconName] || <BookOpen className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 block truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {bm.title}
                  </span>
                  <span className="text-[11px] text-stone-400 block truncate">
                    {bm.url.replace(/^https?:\/\//, "")}
                  </span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>

        {/* Offline Capsules Section */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-200 dark:border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DownloadCloud className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {t.recentCapsules}
              </h2>
            </div>
            <span className="text-xs text-stone-500">
              {offlineCapsules.length} Saved Snapshots
            </span>
          </div>

          {offlineCapsules.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 py-2">
              {t.noCapsulesYet}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {offlineCapsules.slice(0, 4).map((cap) => (
                <button
                  key={cap.id}
                  onClick={() => onOpenCapsule(cap)}
                  className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-stone-200/80 dark:border-stone-800 text-left transition-all"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-xs font-medium text-stone-900 dark:text-stone-100 block truncate">
                      {cap.title}
                    </span>
                    <span className="text-[10px] text-stone-400 block">
                      {formatDate(cap.savedAt, lang)} • {formatBytes(cap.byteSize)}
                    </span>
                  </div>
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Honest NETFLOW Manifesto */}
        <div className="p-5 rounded-2xl bg-stone-100/90 dark:bg-stone-900/60 border border-stone-200/90 dark:border-stone-800/90 space-y-3 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-stone-900 dark:text-stone-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.philosophyQuote}</span>
            </div>
            <div className="flex items-center gap-3">
              {onOpenReleaseNotes && (
                <button
                  id="btn-startpage-release-notes"
                  type="button"
                  onClick={onOpenReleaseNotes}
                  className="text-xs text-stone-500 hover:text-emerald-600 dark:text-stone-400 dark:hover:text-emerald-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>v2.0.0 {t.releaseNotes}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenPromiseModal}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>THE NETFLOW PROMISE</span>
              </button>
            </div>
          </div>
          <p>{t.honestStatement}</p>
          <div className="flex flex-wrap gap-4 pt-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
            <span>• বাস্তব মানুষের উপকার</span>
            <span>• ব্যবহারকারীর আস্থা অর্জন</span>
            <span>• Privacy ও Security রক্ষা</span>
            <span>• Low-end device performance</span>
            <span>• দুর্বল network-এ নির্ভরযোগ্যতা</span>
          </div>
        </div>
      </div>
    </div>
  );
};
