import React, { useState } from "react";
import { MapPin, ShieldCheck, X, Lock } from "lucide-react";
import { GeolocationConsentPrompt } from "../services/androidWebViewGeolocationPermission";

interface GeolocationConsentModalProps {
  isOpen: boolean;
  prompt: GeolocationConsentPrompt | null;
  onApprove: (requestId: string, retain: boolean) => void;
  onReject: (requestId: string) => void;
  lang: "bn" | "en";
}

export const GeolocationConsentModal: React.FC<GeolocationConsentModalProps> = ({
  isOpen,
  prompt,
  onApprove,
  onReject,
  lang,
}) => {
  const [retainDecision, setRetainDecision] = useState(false);

  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";

  return (
    <div
      id="geolocation-consent-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="geolocation-consent-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="geolocation-consent-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 id="geolocation-consent-title" className="text-sm font-semibold text-stone-100">
                {isBn ? "অবস্থান অ্যাক্সেসের অনুমতি" : "Location Access Request"}
              </h3>
              <p className="text-[11px] text-stone-400">
                {isBn ? "অ্যান্ড্রয়েড ওয়েবভিউ জিওলোকেশন বাউন্ডারি" : "Android WebView Geolocation Boundary"}
              </p>
            </div>
          </div>
          <button
            id="geolocation-consent-close-btn"
            type="button"
            onClick={() => onReject(prompt.requestId)}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3">
          {/* Origin Card */}
          <div className="p-3 bg-stone-950/80 rounded-lg border border-stone-800 flex items-start gap-3">
            <div className="p-2 rounded-md bg-stone-800 text-emerald-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-stone-200 truncate font-mono">
                {prompt.origin}
              </div>
              <div className="text-[11px] text-stone-400 mt-1">
                {isBn
                  ? "এই ওয়েবসাইটটি আপনার সুনির্দিষ্ট ডিভাইস অবস্থান জানতে চাইছে।"
                  : "This website wants to access your device's precise location."}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {prompt.isLocalhost
                    ? (isBn ? "লোকালহোস্ট ডেভেলপমেন্ট এক্সেপশন" : "Localhost Development Exception")
                    : (isBn ? "ভেরিফাইড সুরক্ষিত HTTPS অরিজিন" : "Verified Secure HTTPS Origin")}
                </span>
              </div>
            </div>
          </div>

          {/* Retain checkbox */}
          <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer pt-1 select-none">
            <input
              id="geolocation-remember-checkbox"
              type="checkbox"
              checked={retainDecision}
              onChange={(e) => setRetainDecision(e.target.checked)}
              className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-emerald-500 focus:ring-emerald-500/20"
            />
            <span>
              {isBn
                ? "এই সাইটের জন্য আমার সিদ্ধান্ত মনে রাখুন (রিটেইন)"
                : "Remember my decision for this site (retain)"}
            </span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-stone-950/60 border-t border-stone-800 flex items-center justify-end gap-2">
          <button
            id="geolocation-consent-deny-btn"
            type="button"
            onClick={() => onReject(prompt.requestId)}
            className="px-3 py-1.5 rounded-lg border border-stone-700 bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-300 transition-colors cursor-pointer"
          >
            {isBn ? "প্রত্যাখ্যান" : "Block / Deny"}
          </button>
          <button
            id="geolocation-consent-allow-btn"
            type="button"
            onClick={() => onApprove(prompt.requestId, retainDecision)}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isBn ? "অনুমতি দিন" : "Allow Location"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
