import React, { useState, useEffect } from "react";
import { MessageSquare, AlertCircle, HelpCircle, AlertTriangle, ShieldCheck, X } from "lucide-react";
import { JavaScriptDialogPrompt } from "../services/androidWebViewDialogBoundary";

interface JavaScriptDialogModalProps {
  isOpen: boolean;
  prompt: JavaScriptDialogPrompt | null;
  onConfirm: (dialogId: string, promptValue?: string, suppressFuture?: boolean) => void;
  onCancel: (dialogId: string, suppressFuture?: boolean) => void;
  lang: "bn" | "en";
}

export const JavaScriptDialogModal: React.FC<JavaScriptDialogModalProps> = ({
  isOpen,
  prompt,
  onConfirm,
  onCancel,
  lang,
}) => {
  const [promptValue, setPromptValue] = useState("");
  const [suppressFuture, setSuppressFuture] = useState(false);

  useEffect(() => {
    if (prompt) {
      setPromptValue(prompt.defaultValue || "");
      setSuppressFuture(false);
    }
  }, [prompt]);

  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";

  const getTitle = () => {
    switch (prompt.type) {
      case "alert":
        return isBn ? "পৃষ্ঠা থেকে বার্তা (Alert)" : "Message from page";
      case "confirm":
        return isBn ? "নিশ্চিতকরণ অনুরোধ (Confirm)" : "Confirmation Request";
      case "prompt":
        return isBn ? "তথ্য ইনপুট অনুরোধ (Prompt)" : "User Input Request";
      case "beforeunload":
        return isBn ? "পৃষ্ঠা ত্যাগ নিশ্চিতকরণ" : "Leave Site Confirmation";
    }
  };

  const getIcon = () => {
    switch (prompt.type) {
      case "alert":
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case "confirm":
        return <HelpCircle className="w-4 h-4 text-blue-400" />;
      case "prompt":
        return <MessageSquare className="w-4 h-4 text-emerald-400" />;
      case "beforeunload":
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div
      id="js-dialog-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="js-dialog-modal"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="js-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-stone-800/80 flex items-center justify-center border border-stone-700">
              {getIcon()}
            </div>
            <div>
              <h3 id="js-dialog-title" className="text-sm font-semibold text-stone-100">
                {getTitle()}
              </h3>
              <p className="text-[11px] text-stone-400 font-mono truncate max-w-[260px]">
                {prompt.origin}
              </p>
            </div>
          </div>
          <button
            id="js-dialog-close-btn"
            type="button"
            onClick={() => onCancel(prompt.dialogId, suppressFuture)}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3.5">
          <div className="text-xs sm:text-sm text-stone-200 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
            {prompt.message}
          </div>

          {/* Prompt input field */}
          {prompt.type === "prompt" && (
            <div className="pt-1">
              <input
                id="js-dialog-prompt-input"
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={isBn ? "এখানে লিখুন..." : "Enter response..."}
                className="w-full px-3 py-2 text-xs rounded-lg bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                autoFocus
              />
            </div>
          )}

          {/* Dialog Flood / Repetitive Loop Suppression Checkbox */}
          {prompt.showSuppressOption && (
            <label className="flex items-center gap-2 pt-2 border-t border-stone-800/80 cursor-pointer select-none">
              <input
                id="js-dialog-suppress-checkbox"
                type="checkbox"
                checked={suppressFuture}
                onChange={(e) => setSuppressFuture(e.target.checked)}
                className="rounded bg-stone-950 border-stone-700 text-amber-500 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-[11px] text-amber-300">
                {isBn
                  ? "এই পৃষ্ঠা থেকে অতিরিক্ত ডায়ালগ তৈরি করা বন্ধ করুন"
                  : "Prevent this page from creating additional dialogs"}
              </span>
            </label>
          )}

          {/* Isolation & Origin security banner */}
          <div className="flex items-center gap-1.5 text-[10px] text-stone-400 bg-stone-950/40 p-2 rounded-md border border-stone-800">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>
              {isBn
                ? "ওয়েবভিউ ডায়ালগ বাউন্ডারি সুরক্ষিত এবং অন্য ট্যাবের সাথে আলাদা।"
                : "WebView dialog boundary verified and isolated to this active tab."}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-800 bg-stone-950/40">
          {prompt.type !== "alert" && (
            <button
              id="js-dialog-cancel-btn"
              type="button"
              onClick={() => onCancel(prompt.dialogId, suppressFuture)}
              className="px-3 py-1.5 rounded-lg border border-stone-700 text-xs font-medium text-stone-300 hover:bg-stone-800 transition-colors"
            >
              {prompt.type === "beforeunload"
                ? isBn ? "থেকে যান (Stay)" : "Stay"
                : isBn ? "বাতিল (Cancel)" : "Cancel"}
            </button>
          )}

          <button
            id="js-dialog-confirm-btn"
            type="button"
            onClick={() => onConfirm(prompt.dialogId, promptValue, suppressFuture)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            {prompt.type === "alert"
              ? isBn ? "ঠিক আছে (OK)" : "OK"
              : prompt.type === "beforeunload"
              ? isBn ? "ত্যাগ করুন (Leave)" : "Leave"
              : isBn ? "অনুমোদন (OK)" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};
