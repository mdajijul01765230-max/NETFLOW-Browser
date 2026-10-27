import React from "react";
import { FileDown, ShieldAlert, X, Check, FileCode, AlertTriangle } from "lucide-react";
import { BlobDownloadConsentPrompt } from "../services/androidWebViewBlobDownloadBoundary";

interface BlobDownloadConsentModalProps {
  isOpen: boolean;
  prompt: BlobDownloadConsentPrompt | null;
  onApprove: (downloadId: string) => void;
  onReject: (downloadId: string) => void;
  lang: "bn" | "en";
}

export const BlobDownloadConsentModal: React.FC<BlobDownloadConsentModalProps> = ({
  isOpen,
  prompt,
  onApprove,
  onReject,
  lang,
}) => {
  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";

  return (
    <div
      id="blob-download-consent-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="blob-download-consent-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blob-download-consent-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileDown className="w-4 h-4" />
            </div>
            <div>
              <h3 id="blob-download-consent-title" className="text-sm font-semibold text-stone-100">
                {isBn ? "ফাইল ডাউনলোডের অনুমতি" : "Blob / File Download Request"}
              </h3>
              <p className="text-[11px] text-stone-400">
                {isBn ? "অবজেক্ট URL ফাইল বাউন্ডারি" : "Object-URL File Boundary"}
              </p>
            </div>
          </div>
          <button
            id="blob-download-consent-close-btn"
            type="button"
            onClick={() => onReject(prompt.downloadId)}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          <div className="bg-stone-950/40 p-3 rounded-lg border border-stone-800/80">
            <p className="text-xs text-stone-300">
              <span className="font-semibold text-emerald-400 font-mono">{prompt.origin}</span>{" "}
              {isBn
                ? "একটি ব্রাউজার-জেনারেটেড ফাইল ডাউনলোড করতে চায়:"
                : "wants to download a generated file:"}
            </p>

            <div className="mt-2.5 flex items-start gap-2.5 bg-stone-900/90 p-2.5 rounded-md border border-stone-800">
              <FileCode className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono font-medium text-stone-200 truncate" title={prompt.filename}>
                  {prompt.filename}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                  <span className="bg-stone-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-stone-300">
                    {prompt.mimeType}
                  </span>
                  <span>{prompt.sizeFormatted}</span>
                </div>
              </div>
            </div>

            {prompt.isPrivate && (
              <p className="mt-2 text-[11px] text-amber-400/90 font-medium">
                {isBn
                  ? "প্রাইভেট ব্রাউজিং মোড: মেমোরি থেকে সরাসরি সেভ হচ্ছে।"
                  : "Private mode: Downloading from isolated ephemeral memory."}
              </p>
            )}
          </div>

          {/* Security / Dangerous Warning if applicable */}
          {prompt.isDangerous && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300/90 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="font-semibold text-rose-300">
                  {isBn ? "নিরাপত্তা সতর্কতা" : "Security Notice"}
                </p>
                <p className="mt-0.5">{prompt.securityWarning}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-2 rounded-lg bg-stone-950/30 text-stone-400 text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-stone-500" />
            <p>
              {isBn
                ? "ফাইলটি কেবল আপনার অনুমোদনের পরেই ডিভাইসে সংরক্ষিত হবে।"
                : "The file will only be saved to your device upon your explicit consent."}
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-800 bg-stone-950/60">
          <button
            type="button"
            id="blob-download-cancel-btn"
            onClick={() => onReject(prompt.downloadId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            {isBn ? "বাতিল" : "Cancel"}
          </button>
          <button
            type="button"
            id="blob-download-save-btn"
            onClick={() => onApprove(prompt.downloadId)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            {isBn ? "ডাউনলোড করুন" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
};
