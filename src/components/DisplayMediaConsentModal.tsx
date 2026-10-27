import React, { useState } from "react";
import { Monitor, AppWindow, Chrome, ShieldAlert, X, Check, Volume2 } from "lucide-react";
import {
  DisplayMediaPrompt,
  DisplayCaptureSurface,
} from "../services/androidWebViewDisplayMediaBoundary";

interface DisplayMediaConsentModalProps {
  isOpen: boolean;
  prompt: DisplayMediaPrompt | null;
  onApprove: (promptId: string, surface: DisplayCaptureSurface, includeAudio: boolean) => void;
  onReject: (promptId: string) => void;
  lang: "bn" | "en";
}

export const DisplayMediaConsentModal: React.FC<DisplayMediaConsentModalProps> = ({
  isOpen,
  prompt,
  onApprove,
  onReject,
  lang,
}) => {
  const [selectedSurface, setSelectedSurface] = useState<DisplayCaptureSurface>("browser");
  const [includeAudio, setIncludeAudio] = useState(false);

  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";

  return (
    <div
      id="display-media-consent-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="display-media-consent-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="display-media-consent-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 id="display-media-consent-title" className="text-sm font-semibold text-stone-100">
                {isBn ? "স্ক্রিন শেয়ারিংয়ের অনুমতি" : "Screen Sharing Request"}
              </h3>
              <p className="text-[11px] text-stone-400">
                {isBn ? "অ্যান্ড্রয়েড মিডিয়া প্রজেকশন বাউন্ডারি" : "Android MediaProjection Boundary"}
              </p>
            </div>
          </div>
          <button
            id="display-media-consent-close-btn"
            type="button"
            onClick={() => onReject(prompt.promptId)}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="bg-stone-950/40 p-3 rounded-lg border border-stone-800/80">
            <p className="text-xs text-stone-300">
              <span className="font-semibold text-sky-400 font-mono">{prompt.origin}</span>{" "}
              {isBn
                ? "আপনার স্ক্রিনের কনটেন্ট দেখার অনুমতি চাচ্ছে।"
                : "wants to record or share the contents of your screen."}
            </p>
            {prompt.isPrivate && (
              <p className="mt-2 text-[11px] text-amber-400/90 font-medium">
                {isBn
                  ? "সতর্কতা: আপনি প্রাইভেট ব্রাউজিং মোডে আছেন।"
                  : "Notice: You are sharing from a Private Browsing tab."}
              </p>
            )}
          </div>

          {/* Surface Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-stone-300">
              {isBn ? "কোনটি শেয়ার করতে চান নির্বাচন করুন:" : "Choose what to share:"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="surface-browser-btn"
                onClick={() => setSelectedSurface("browser")}
                className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-colors text-center ${
                  selectedSurface === "browser"
                    ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                    : "bg-stone-950/40 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-800/40"
                }`}
              >
                <Chrome className="w-4 h-4" />
                <span className="text-[11px] font-medium leading-tight">
                  {isBn ? "বর্তমান ট্যাব" : "Current Tab"}
                </span>
              </button>

              <button
                type="button"
                id="surface-window-btn"
                onClick={() => setSelectedSurface("window")}
                className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-colors text-center ${
                  selectedSurface === "window"
                    ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                    : "bg-stone-950/40 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-800/40"
                }`}
              >
                <AppWindow className="w-4 h-4" />
                <span className="text-[11px] font-medium leading-tight">
                  {isBn ? "অ্যাপ উইন্ডো" : "App Window"}
                </span>
              </button>

              <button
                type="button"
                id="surface-monitor-btn"
                onClick={() => setSelectedSurface("monitor")}
                className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-colors text-center ${
                  selectedSurface === "monitor"
                    ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                    : "bg-stone-950/40 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-800/40"
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span className="text-[11px] font-medium leading-tight">
                  {isBn ? "পুরো স্ক্রিন" : "Entire Screen"}
                </span>
              </button>
            </div>
          </div>

          {/* Audio toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="include-audio-toggle"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              className="w-4 h-4 rounded-xs border-stone-700 bg-stone-950 text-sky-500 focus:ring-sky-500/30"
            />
            <label htmlFor="include-audio-toggle" className="text-xs text-stone-300 flex items-center gap-1.5 cursor-pointer">
              <Volume2 className="w-3.5 h-3.5 text-stone-400" />
              {isBn ? "অডিও অন্তর্ভুক্ত করুন" : "Include audio in stream"}
            </label>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-[11px]">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {isBn
                ? "স্ক্রিন শেয়ারিংয়ের মাধ্যমে ওয়েবসাইটে পাসওয়ার্ড বা সংবেদনশীল তথ্য প্রদর্শিত হতে পারে।"
                : "Sensitive info (passwords, payment details, private notifications) visible on screen will be shared."}
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-800 bg-stone-950/60">
          <button
            type="button"
            id="display-media-cancel-btn"
            onClick={() => onReject(prompt.promptId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            {isBn ? "বাতিল" : "Cancel"}
          </button>
          <button
            type="button"
            id="display-media-share-btn"
            onClick={() => onApprove(prompt.promptId, selectedSurface, includeAudio)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            {isBn ? "শেয়ার করুন" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
};
