import React from "react";
import { FileDown, ShieldAlert, X, Check, FileText, AlertTriangle } from "lucide-react";
import { GeneratedFileDownloadPrompt } from "../services/androidWebViewFileSystemBoundary";

interface GeneratedFileDownloadModalProps {
  isOpen: boolean;
  prompt: GeneratedFileDownloadPrompt | null;
  onApprove: (downloadId: string) => void;
  onReject: (downloadId: string) => void;
  lang: "bn" | "en";
}

export const GeneratedFileDownloadModal: React.FC<GeneratedFileDownloadModalProps> = ({
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
      id="generated-file-download-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="generated-file-download-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generated-file-download-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <FileDown className="w-4 h-4" />
            </div>
            <div>
              <h3 id="generated-file-download-title" className="text-sm font-semibold text-stone-100">
                {isBn ? "ওয়েব ফাইল ডাউনলোডের অনুমতি" : "File API Download Request"}
              </h3>
              <p className="text-[11px] text-stone-400">
                {isBn ? "জাভাস্ক্রিপ্ট ফাইল সিস্টেম বাউন্ডারি" : "JavaScript File System Boundary"}
              </p>
            </div>
          </div>
          <button
            id="generated-file-download-close-btn"
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
              <span className="font-semibold text-teal-400 font-mono">{prompt.origin}</span>{" "}
              {isBn
                ? "একটি জেনারেটেড ফাইল ডিভাইসে সংরক্ষণ করতে চায়:"
                : "requests to save a generated file to your device:"}
            </p>

            <div className="mt-2.5 flex items-start gap-2.5 bg-stone-900/90 p-2.5 rounded-md border border-stone-800">
              <FileText className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
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
                  ? "প্রাইভেট মোড: মেমোরি থেকে সরাসরি সেভ হচ্ছে, কোনো ক্যাশ স্টোরেজ নেই।"
                  : "Private Mode: Saving from ephemeral memory without persistent cache."}
              </p>
            )}
          </div>

          {/* Security / Dangerous Warning */}
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
                ? "ফাইলের সাইজ মেমোরি গার্ড লিমিটের মধ্যে রয়েছে।"
                : "File size is validated within memory guard boundaries."}
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-800 bg-stone-950/60">
          <button
            type="button"
            id="generated-file-download-cancel-btn"
            onClick={() => onReject(prompt.downloadId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            {isBn ? "বাতিল" : "Cancel"}
          </button>
          <button
            type="button"
            id="generated-file-download-save-btn"
            onClick={() => onApprove(prompt.downloadId)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white shadow-xs transition-colors flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            {isBn ? "ডাউনলোড অনুমোদন" : "Approve Download"}
          </button>
        </div>
      </div>
    </div>
  );
};
