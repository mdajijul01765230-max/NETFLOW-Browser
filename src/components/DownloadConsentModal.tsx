import React, { useState, useEffect } from "react";
import { Download, AlertTriangle, ShieldCheck, X, FileCheck } from "lucide-react";
import { DownloadConsentPrompt } from "../services/androidWebViewDownloadBoundary";
import { sanitizeDownloadFileName } from "../services/nativeBrowserEngine";

interface DownloadConsentModalProps {
  isOpen: boolean;
  prompt: DownloadConsentPrompt | null;
  onApprove: (downloadId: string, fileName?: string) => void;
  onReject: (downloadId: string) => void;
  lang: "bn" | "en";
}

export const DownloadConsentModal: React.FC<DownloadConsentModalProps> = ({
  isOpen,
  prompt,
  onApprove,
  onReject,
  lang,
}) => {
  const [editableFileName, setEditableFileName] = useState("");

  useEffect(() => {
    if (prompt?.filename) {
      setEditableFileName(prompt.filename);
    }
  }, [prompt?.downloadId, prompt?.filename]);

  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";
  const finalFileName = sanitizeDownloadFileName(
    editableFileName.trim() || prompt.filename,
    prompt.mimeType
  );

  return (
    <div
      id="download-consent-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="download-consent-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-consent-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 id="download-consent-title" className="text-sm font-semibold text-stone-100">
                {isBn ? "ফাইল ডাউনলোড ও সেভ অনুমোদন" : "Confirm File Download & Save"}
              </h3>
              <p className="text-[11px] text-stone-400">
                {isBn ? "অ্যান্ড্রয়েড সিকিউর ফাইল সেভ বাউন্ডারি" : "Android Secure File Save Boundary"}
              </p>
            </div>
          </div>
          <button
            id="download-consent-close-btn"
            type="button"
            onClick={() => onReject(prompt.downloadId)}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3">
          {/* File Card */}
          <div className="p-3 bg-stone-950/80 rounded-lg border border-stone-800 flex items-start gap-3">
            <div className="p-2 rounded-md bg-stone-800 text-stone-300 shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xs font-semibold text-stone-200 truncate" title={finalFileName}>
                {finalFileName}
              </div>
              <input
                id="download-consent-filename-input"
                type="text"
                value={editableFileName}
                maxLength={120}
                onChange={(e) => setEditableFileName(e.target.value)}
                aria-label={isBn ? "ফাইলের নাম" : "File name"}
                className="w-full px-2 py-1 text-xs rounded-md bg-stone-900 border border-stone-700 text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <div className="text-[11px] text-stone-400 flex items-center gap-2 mt-1">
                <span>{prompt.contentLengthFormatted}</span>
                <span>•</span>
                <span className="truncate">{prompt.mimeType}</span>
              </div>
              <div className="text-[10px] text-stone-500 truncate mt-0.5">
                {isBn ? "উৎস ডোমেন: " : "Origin: "}
                <span className="text-stone-400 font-mono">{prompt.displayUrl || prompt.domain}</span>
              </div>
            </div>
          </div>

          {/* Dangerous / Warning Notice */}
          {prompt.isExecutableOrDangerous ? (
            <div
              id="download-dangerous-warning"
              className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg flex items-start gap-2 text-amber-200 text-xs"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">
                  {isBn ? "সতর্কতা: এক্সিকিউটেবল/প্যাকেজ ফাইল" : "Security Notice: Executable/Package File"}
                </span>
                <span className="text-[11px] text-amber-300/90 leading-tight">
                  {prompt.securityWarning ||
                    (isBn
                      ? "এই ফাইলটিতে এক্সিকিউটেবল কোড থাকতে পারে। আপনি নিশ্চিত হলে তবেই সেভ করুন।"
                      : "This file format could potentially execute code. Only proceed if you trust this source.")}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isBn
                  ? "পাথ ট্রাভার্সাল ও ক্রেডেনশিয়াল ব্লকিং দ্বারা সুরক্ষিত"
                  : "Protected by path traversal & credential stripping safeguards"}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-stone-950/60 border-t border-stone-800 flex items-center justify-end gap-2">
          <button
            id="download-consent-cancel-btn"
            type="button"
            onClick={() => onReject(prompt.downloadId)}
            className="px-3 py-1.5 rounded-lg border border-stone-700 bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-300 transition-colors cursor-pointer"
          >
            {isBn ? "বাতিল" : "Cancel"}
          </button>
          <button
            id="download-consent-confirm-btn"
            type="button"
            onClick={() => onApprove(prompt.downloadId, finalFileName)}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isBn ? "সেভ করুন" : "Save File"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
