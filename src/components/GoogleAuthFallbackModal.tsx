import React from "react";
import { ExternalLink, ShieldCheck, Lock, AlertTriangle, X, ArrowUpRight } from "lucide-react";
import {
  GoogleAuthFallbackPrompt,
  classifyGoogleAuthFlow,
} from "../services/googleAuthFallbackPolicy";

interface GoogleAuthFallbackModalProps {
  isOpen: boolean;
  prompt: GoogleAuthFallbackPrompt | null;
  onApprove: (targetUrl: string, promptId: string) => void;
  onCancel: (promptId: string) => void;
  lang: "bn" | "en";
}

export const GoogleAuthFallbackModal: React.FC<GoogleAuthFallbackModalProps> = ({
  isOpen,
  prompt,
  onApprove,
  onCancel,
  lang,
}) => {
  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";
  const flowInfo = classifyGoogleAuthFlow(prompt.targetUrl);

  // Redact potentially sensitive query params for clean UI display
  let displayUrl = prompt.targetUrl;
  try {
    const u = new URL(prompt.targetUrl);
    displayUrl = `${u.origin}${u.pathname}`;
    if (u.searchParams.has("client_id")) {
      displayUrl += `?client_id=${u.searchParams.get("client_id")?.slice(0, 16)}...`;
    }
  } catch {}

  return (
    <div
      id="google-auth-fallback-backdrop"
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="google-auth-fallback-dialog"
        className="bg-stone-900 border border-amber-600/30 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-auth-fallback-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <h3 id="google-auth-fallback-title" className="text-base font-semibold text-stone-100">
                {isBn ? "নিরাপদ Google সাইন-ইন ফলব্যাক" : "Safe Google Sign-In Fallback"}
              </h3>
              <p className="text-xs text-amber-400/90 font-medium">
                {isBn
                  ? "এই Sign-In flow নিরাপদভাবে external browser-এ চালানো হবে"
                  : "This Sign-In flow will be safely handled in an external browser"}
              </p>
            </div>
          </div>
          <button
            id="google-auth-fallback-close-btn"
            type="button"
            onClick={() => onCancel(prompt.id)}
            className="text-stone-400 hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Target Service Box */}
          <div className="p-3.5 bg-stone-950/70 rounded-xl border border-stone-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-stone-800 text-stone-300 shrink-0 mt-0.5">
              <Lock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  {prompt.serviceName}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-stone-800 text-stone-400 border border-stone-700">
                  accounts.google.com
                </span>
              </div>
              <p className="text-xs text-stone-300 mt-1">
                {isBn ? flowInfo.descriptionBn : flowInfo.descriptionEn}
              </p>
              <p className="text-[11px] font-mono text-stone-400 truncate mt-1 bg-stone-900/80 px-2 py-1 rounded border border-stone-800">
                {displayUrl}
              </p>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs space-y-2 text-stone-300 leading-relaxed">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {isBn
                  ? "কেন এটি External Browser-এ খোলা আবশ্যক?"
                  : "Why is an External Browser Required?"}
              </span>
            </div>
            <p className="text-stone-300 text-xs">
              {isBn
                ? "Google সাইন-ইন ও OAuth সিস্টেমে আধুনিক ক্লায়েন্ট-সাইড জাভাস্ক্রিপ্ট, FIDO2/Passkey এবং সরাসরি সেশন হ্যান্ডশেক প্রয়োজন। NETFLOW-এর স্যানিটাইজড প্রক্সি পরিবেশ ব্যবহারকারীর নিরাপত্তা ও গোপনীয়তা রক্ষায় স্ক্রিপ্ট ফিল্টার করে, যার ফলে Google সাইন-ইন এখানে সম্পূর্ণ কাজ করতে পারে না।"
                : "Google Sign-In and OAuth workflows require dynamic client-side JavaScript execution, FIDO2/Passkeys, and direct session verification. NETFLOW's sanitized proxy environment filters scripts for security and privacy, preventing Google's authentication challenges from executing safely inside proxy rendering."}
            </p>
          </div>

          {/* Security Assurances Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-stone-950/50 border border-stone-800/80 flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <p className="font-medium text-stone-200 text-[11px]">
                  {isBn ? "জিরো প্রক্সি লিকেজ" : "Zero Proxy Leakage"}
                </p>
                <p className="text-[10px] text-stone-400">
                  {isBn ? "পাসওয়ার্ড বা কুকি প্রক্সিতে যাবে না" : "Credentials never touch NETFLOW proxy"}
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-stone-950/50 border border-stone-800/80 flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <p className="font-medium text-stone-200 text-[11px]">
                  {isBn ? "অরিজিন আইসোলেশন" : "Isolated Origin"}
                </p>
                <p className="text-[10px] text-stone-400">
                  {isBn ? "সুরক্ষিত noopener কনটেক্সট" : "Protected noopener, noreferrer launch"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-4 border-t border-stone-800 bg-stone-950/60 flex items-center justify-end gap-2.5">
          <button
            id="google-auth-fallback-cancel-btn"
            type="button"
            onClick={() => onCancel(prompt.id)}
            className="px-4 py-2 text-xs font-medium text-stone-300 hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-colors"
          >
            {isBn ? "বাতিল করুন" : "Cancel"}
          </button>

          <button
            id="google-auth-fallback-approve-btn"
            type="button"
            onClick={() => onApprove(prompt.targetUrl, prompt.id)}
            className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/20"
          >
            <span>
              {isBn ? "বাহ্যিক ব্রাউজারে খুলুন" : "Open in External Browser"}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
