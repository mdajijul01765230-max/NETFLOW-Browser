import React from "react";
import {
  Clipboard,
  Share2,
  ShieldAlert,
  X,
  Check,
  AlertTriangle,
  FileText,
  Lock,
} from "lucide-react";
import {
  ClipboardConsentPrompt,
  ShareConsentPrompt,
} from "../services/androidWebViewClipboardAndShareBoundary";

interface ClipboardAndShareConsentModalProps {
  clipboardPrompt: ClipboardConsentPrompt | null;
  sharePrompt: ShareConsentPrompt | null;
  onApproveClipboard: (promptId: string) => void;
  onRejectClipboard: (promptId: string) => void;
  onApproveShare: (promptId: string) => void;
  onRejectShare: (promptId: string) => void;
  lang: "bn" | "en";
}

export const ClipboardAndShareConsentModal: React.FC<ClipboardAndShareConsentModalProps> = ({
  clipboardPrompt,
  sharePrompt,
  onApproveClipboard,
  onRejectClipboard,
  onApproveShare,
  onRejectShare,
  lang,
}) => {
  const isBn = lang === "bn";

  if (clipboardPrompt) {
    const isRead = clipboardPrompt.action === "read" || clipboardPrompt.action === "readText";

    return (
      <div
        id="clipboard-consent-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
      >
        <div
          id="clipboard-consent-dialog"
          className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clipboard-consent-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <Clipboard className="w-4 h-4" />
              </div>
              <div>
                <h3 id="clipboard-consent-title" className="text-sm font-semibold text-stone-100">
                  {isRead
                    ? isBn
                      ? "ক্লিপবোর্ড পড়ার অনুমতি"
                      : "Clipboard Read Permission"
                    : isBn
                    ? "ক্লিপবোর্ডে লেখার অনুমতি"
                    : "Clipboard Write Permission"}
                </h3>
                <p className="text-[11px] text-stone-400">
                  {isBn ? "ক্লিপবোর্ড সিকিউরিটি বাউন্ডারি" : "Clipboard Security Boundary"}
                </p>
              </div>
            </div>
            <button
              id="clipboard-consent-close-btn"
              type="button"
              onClick={() => onRejectClipboard(clipboardPrompt.promptId)}
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
                <span className="font-semibold text-indigo-400 font-mono">
                  {clipboardPrompt.origin}
                </span>{" "}
                {isRead
                  ? isBn
                    ? "আপনার ক্লিপবোর্ডের ডেটা পড়তে অনুরোধ করছে:"
                    : "requests permission to read from your clipboard:"
                  : isBn
                    ? "আপনার ক্লিপবোর্ডে ডেটা লিখতে অনুরোধ করছে:"
                    : "requests permission to copy data to your clipboard:"}
              </p>

              {clipboardPrompt.previewText && (
                <div className="mt-2.5 bg-stone-900/90 p-2.5 rounded-md border border-stone-800 text-xs font-mono text-stone-300 max-h-24 overflow-y-auto break-all">
                  {clipboardPrompt.previewText}
                </div>
              )}

              {clipboardPrompt.isPrivate && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400/90 font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    {isBn
                      ? "প্রাইভেট মোড: ক্ষণস্থায়ী মেমোরি, ট্যাব বন্ধ হলে স্বয়ংক্রিয় মুছে যাবে।"
                      : "Private Mode: Ephemeral clipboard, automatically wiped upon closing tab."}
                  </span>
                </div>
              )}
            </div>

            {/* Sensitive Content Warning */}
            {clipboardPrompt.isSensitive && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300/90 text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <p className="font-semibold text-rose-300">
                    {isBn ? "সংবেদনশীল ডেটা সতর্কতা" : "Sensitive Data Notice"}
                  </p>
                  <p className="mt-0.5">{clipboardPrompt.securityWarning}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-800 bg-stone-950/60">
            <button
              type="button"
              id="clipboard-consent-cancel-btn"
              onClick={() => onRejectClipboard(clipboardPrompt.promptId)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            >
              {isBn ? "প্রত্যাখ্যান" : "Deny"}
            </button>
            <button
              type="button"
              id="clipboard-consent-allow-btn"
              onClick={() => onApproveClipboard(clipboardPrompt.promptId)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              {isBn ? "অনুমতি দিন" : "Allow"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sharePrompt) {
    return (
      <div
        id="share-consent-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
      >
        <div
          id="share-consent-dialog"
          className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-consent-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h3 id="share-consent-title" className="text-sm font-semibold text-stone-100">
                  {isBn ? "ওয়েব শেয়ারের অনুমতি" : "Web Share Request"}
                </h3>
                <p className="text-[11px] text-stone-400">
                  {isBn ? "ওয়েব শেয়ার API বাউন্ডারি" : "Web Share API Boundary"}
                </p>
              </div>
            </div>
            <button
              id="share-consent-close-btn"
              type="button"
              onClick={() => onRejectShare(sharePrompt.promptId)}
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
                <span className="font-semibold text-sky-400 font-mono">{sharePrompt.origin}</span>{" "}
                {isBn
                  ? "নিচের তথ্য শেয়ার করতে অনুমতি চাইছে:"
                  : "requests permission to share the following content:"}
              </p>

              <div className="mt-2.5 space-y-1.5 text-xs text-stone-200">
                {sharePrompt.title && (
                  <p className="font-semibold text-stone-100">{sharePrompt.title}</p>
                )}
                {sharePrompt.text && <p className="text-stone-300 text-[11px]">{sharePrompt.text}</p>}
                {sharePrompt.url && (
                  <p className="font-mono text-[11px] text-sky-300 bg-stone-900/90 p-1.5 rounded border border-stone-800 break-all">
                    {sharePrompt.url}
                  </p>
                )}

                {sharePrompt.files && sharePrompt.files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] text-stone-400">
                      {isBn ? "সংযুক্ত ফাইল:" : "Attached files:"}
                    </p>
                    {sharePrompt.files.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-stone-900/80 p-1.5 rounded text-[11px]"
                      >
                        <FileText className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-mono text-stone-200 truncate">{file.name}</span>
                        <span className="text-stone-400 ml-auto">{file.sizeFormatted}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dangerous URL warning */}
            {sharePrompt.isDangerous && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300/90 text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <p className="font-semibold text-rose-300">
                    {isBn ? "নিরাপত্তা সতর্কতা" : "Security Notice"}
                  </p>
                  <p className="mt-0.5">{sharePrompt.securityWarning}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-800 bg-stone-950/60">
            <button
              type="button"
              id="share-consent-cancel-btn"
              onClick={() => onRejectShare(sharePrompt.promptId)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            >
              {isBn ? "বাতিল" : "Cancel"}
            </button>
            <button
              type="button"
              id="share-consent-allow-btn"
              onClick={() => onApproveShare(sharePrompt.promptId)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              {isBn ? "শেয়ার অনুমোদন" : "Share"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
