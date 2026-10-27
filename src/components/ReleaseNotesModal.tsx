import React from "react";
import {
  FileCode2,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Zap,
  PhoneCall,
  Smartphone,
  HardDrive,
  Languages,
  Layers,
} from "lucide-react";
import { Language, translations } from "../locales";

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  if (!isOpen) return null;

  const t = translations[lang];

  return (
    <div
      id="release-notes-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="release-notes-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-modal-title"
        className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200"
      >
        {/* Modal Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="release-notes-modal-title"
                  className="text-sm font-bold text-stone-900 dark:text-stone-100"
                >
                  {t.releaseNotesModalTitle}
                </h2>
                <span
                  id="release-notes-badge-version"
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-500/30"
                >
                  v2.0.0
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {t.releaseNotesSubtitle}
              </p>
            </div>
          </div>
          <button
            id="btn-close-release-notes"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors touch-manipulation cursor-pointer text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs">
          {/* VERSION 2.0.0 (CURRENT) */}
          <section
            id="changelog-version-2-0-0"
            className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 dark:border-stone-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    NETFLOW Browser v2.0.0
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-600 text-white">
                    {lang === "bn" ? "ডেভেলপমেন্ট বিল্ড (প্রাক-রিলিজ)" : "Development Build (Pre-Release)"}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  {lang === "bn"
                    ? "অবস্থা: শেল ও ব্যাকএন্ড Node-এ যাচাইকৃত • অ্যান্ড্রয়েড APK কম্পাইল ও হ্যান্ডসেট গেট এখনো অপরীক্ষিত"
                    : "Status: Shell & Backend Verified in Node • Android APK Compile & Handset Gates Not Yet Verified"}
                </p>
              </div>
            </div>

            {/* VERIFIED SECTION */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-[11px] uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t.verifiedCapabilities}</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Browser Core */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      {lang === "bn"
                        ? "ব্রাউজার কোর ও সিকিউর প্রোক্সি (Browser Core Foundation)"
                        : "Browser Core & SSRF Defense Architecture"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed pl-5">
                    {lang === "bn"
                      ? "স্বয়ংক্রিয় প্রোটোকল রূপান্তর, প্রাইভেট আইপি ব্লক (SSRF ডিফেন্স), ট্যাব আইসোলেশন ও লাইটওয়েট রেন্ডারিং।"
                      : "Direct navigation with protocol inference, zero-trust private CIDR protection (SSRF guard), and tab isolation."}
                  </p>
                </div>

                {/* 2. Session & Lifecycle State Preservation */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    <PhoneCall className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>
                      {lang === "bn"
                        ? "সেশন ও লাইফসাইকেল স্টেট সংরক্ষণ (Session & Lifecycle Preservation)"
                        : "Session & Lifecycle State Preservation (VERIFIED in TS)"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed pl-5">
                    {lang === "bn"
                      ? "ডেবাউন্সড localStorage সেশন সংরক্ষণ এবং onPause/onResume হ্যান্ডলিং (সিমুলেটেড কল স্টেট; সরাসরি OS টেলিফোনি পারমিশন ব্যবহৃত হয় না)।"
                      : "Debounced localStorage session persistence and onPause/onResume WebView pause/resume handling (simulated UI call state; no OS READ_PHONE_STATE interception)."}
                  </p>
                </div>

                {/* 3. Offline Capsules */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>
                      {lang === "bn"
                        ? "অফলাইন ক্যাপসুল স্টোরেজ মিটার ও বাল্ক ক্লিনার (Storage Meter & Bulk Cleaner)"
                        : "Offline Capsules Storage Meter & Safe Bulk Cleaner"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed pl-5">
                    {lang === "bn"
                      ? "রিয়েল-টাইম সংরক্ষিত মেমরি হিসাব, টাইটেল ও ইউআরএল ফিল্টারিং এবং নিরাপদ নিশ্চিতকরণ সহ পরিষ্কার করার ব্যবস্থা।"
                      : "Real-time byte footprint calculation, instant search filtering, single deletion, and two-step bulk wipe."}
                  </p>
                </div>

                {/* 4. Local Privacy & Data Summary Export */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>
                      {lang === "bn"
                        ? "লোকাল প্রাইভেসি ও ডাটা সারাংশ এক্সপোর্ট (Local Privacy Summary Export)"
                        : "Local Privacy & Data Summary Export"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed pl-5">
                    {lang === "bn"
                      ? "স্থানীয় সেশন কাউন্টার এবং নির্ধারিত ডাইজেস্ট স্ট্রিংয়ের ডাউনলোডযোগ্য JSON সারাংশ (কোনো ক্রিপ্টোগ্রাফিক পাবলিক-কি সিগনেচার নয়)।"
                      : "Client-side exportable JSON summary of local session counters and a deterministic digest string (not a public-key cryptographic signature)."}
                  </p>
                </div>

                {/* 5. Mobile Ergonomics */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    <Smartphone className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span>
                      {lang === "bn"
                        ? "মোবাইল থাম্ব-জোন নেভিগেশন (Thumb-Zone Navigation)"
                        : "Mobile Thumb-Zone Bottom Navigation"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed pl-5">
                    {lang === "bn"
                      ? "স্মার্টফোনে এক হাতে স্বাচ্ছন্দ্যে ব্রাউজিংয়ের জন্য অপ্টিমাইজড বটম বার ও স্পর্শ-বান্ধব অ্যাকশন বাটন।"
                      : "Bottom-anchored primary controls designed for effortless one-handed use on mobile touchscreens."}
                  </p>
                </div>

                {/* 6. Translation */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    <Languages className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>
                      {lang === "bn"
                        ? "পূর্ণ পৃষ্ঠা বাংলা ↔ ইংরেজি অনুবাদ (Bilingual Full-Page Translation)"
                        : "One-Tap Full-Page Bengali ↔ English Translation"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed pl-5">
                    {lang === "bn"
                      ? "পুরো ওয়েব পেজ এক ক্লিকে মূল লেআউট অক্ষুণ্ণ রেখে বাংলা ও ইংরেজিতে পড়ার বিশেষ সুবিধা।"
                      : "Bilingual web reading engine translating full DOM content while preserving structural visual layout."}
                  </p>
                </div>
              </div>
            </div>

            {/* TRANSPARENT STATUS OF IN-PROGRESS CAPABILITIES */}
            <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{t.inProgressCapabilities}</span>
              </div>

              <div className="space-y-1.5 text-[11px] text-stone-600 dark:text-stone-400 pl-1">
                <div className="flex items-center justify-between p-2 rounded-lg bg-stone-100 dark:bg-stone-800">
                  <span>
                    {lang === "bn"
                      ? "ফাইন্ড ইন পেজ (Find in Page)"
                      : "Find in Page (Shell & Native WebView)"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {lang === "bn" ? "শেল যাচাইকৃত • ডিভাইসে অপরীক্ষিত" : "Shell VERIFIED • Device NOT VERIFIED"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-stone-100 dark:bg-stone-800">
                  <span>
                    {lang === "bn"
                      ? "প্রতি-সাইট পারমিশন (Protected Media ডিফল্ট BLOCK সহ)"
                      : "Per-Site Permissions (incl. Protected Media default BLOCK)"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {lang === "bn" ? "শেল যাচাইকৃত • DRM অপরীক্ষিত" : "Shell VERIFIED • DRM NOT VERIFIED"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-stone-100 dark:bg-stone-800">
                  <span>
                    {lang === "bn"
                      ? "অ্যান্ড্রয়েড APK কম্পাইল ও হ্যান্ডসেট গেট (GATE-01..08)"
                      : "Android APK Compile & Physical Handset Gates (GATE-01..08)"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {lang === "bn" ? "অপরীক্ষিত / অসম্পন্ন" : "NOT VERIFIED / NOT DONE"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* VERSION 1.0.0 (BASELINE ARCHIVE) */}
          <section
            id="changelog-version-1-0-0"
            className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-2 opacity-80"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  NETFLOW Browser v1.0.0
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                  {lang === "bn" ? "ভিত্তি সংস্করণ" : "Baseline MVP"}
                </span>
              </div>
              <span className="text-[10px] text-stone-400">
                {lang === "bn" ? "আগস্ট ২০২৬" : "August 2026"}
              </span>
            </div>
            <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
              {lang === "bn"
                ? "প্রাথমিক আল্ট্রা-লো ব্যান্ডউইথ টেক্সট-ফার্স্ট ইঞ্জিন, ট্র্যাকার ব্লকার এবং অফলাইন ক্যাপসুল স্টোরেজের সূচনা।"
                : "Initial ultra-low bandwidth text-first compression engine, zero-telemetry tracker blocking, and basic offline storage."}
            </p>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-stone-100 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
          <span>
            {lang === "bn"
              ? "নেটফ্লো ব্রাউজার: কোনো মিথ্যা প্রতিশ্রুতি নয়, প্রমাণিত গতি।"
              : "NETFLOW Browser: Real capability over marketing claims."}
          </span>
          <button
            id="btn-dismiss-release-notes"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-stone-200 hover:bg-stone-300 dark:bg-stone-750 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-medium transition-colors touch-manipulation cursor-pointer"
          >
            {lang === "bn" ? "বন্ধ করুন" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
};
