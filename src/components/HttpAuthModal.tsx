import React, { useState, useEffect } from "react";
import { KeyRound, ShieldAlert, X } from "lucide-react";

export interface NativeHttpAuthModalPrompt {
  requestId: string;
  tabId: string;
  host: string;
  realm: string;
  origin?: string;
}

interface HttpAuthModalProps {
  isOpen: boolean;
  prompt: NativeHttpAuthModalPrompt | null;
  onSubmit: (requestId: string, username: string, password: string) => void;
  onCancel: (requestId: string) => void;
  lang: "bn" | "en";
}

/**
 * Dedicated HTTP Authentication Modal (`NETFLOW-INTERACTIVE-CONTRACT-01`).
 * - Shows `host` and `realm`.
 * - Explicitly warns that the remote site (NOT the browser) is asking for the password.
 * - Username (`type="text"`) and Password (`type="password"`) inputs + Cancel.
 * - Clears `username` and `password` from React state immediately on close, cancel, or submit.
 * - Never logs or persists credentials to storage.
 */
export const HttpAuthModal: React.FC<HttpAuthModalProps> = ({
  isOpen,
  prompt,
  onSubmit,
  onCancel,
  lang,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Clear credentials whenever modal closes or prompt changes
  useEffect(() => {
    setUsername("");
    setPassword("");
    return () => {
      setUsername("");
      setPassword("");
    };
  }, [isOpen, prompt?.requestId]);

  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";

  const handleCloseOrCancel = () => {
    const reqId = prompt.requestId;
    setUsername("");
    setPassword("");
    onCancel(reqId);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const reqId = prompt.requestId;
    const u = username;
    const p = password;
    // Immediately wipe password and username from component state before/upon dispatch
    setUsername("");
    setPassword("");
    onSubmit(reqId, u, p);
  };

  return (
    <div
      id="http-auth-modal-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="http-auth-modal-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="http-auth-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 id="http-auth-modal-title" className="text-sm font-semibold text-stone-100">
                {isBn ? "ওয়েবসাইট সাইন-ইন অনুরোধ (HTTP Auth)" : "Website Authentication Required"}
              </h3>
              <p
                id="http-auth-modal-host"
                className="text-[11px] text-stone-400 font-mono truncate max-w-[260px]"
              >
                {prompt.host}
              </p>
            </div>
          </div>
          <button
            id="http-auth-modal-close-btn"
            type="button"
            onClick={handleCloseOrCancel}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleFormSubmit} className="p-4 space-y-3.5" autoComplete="off">
          {/* Explicit Warning: The remote site (NOT the browser) asks for the password */}
          <div
            id="http-auth-modal-warning"
            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-950/50 border border-amber-800/70 text-amber-200 text-xs"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              {isBn ? (
                <>
                  <strong>সতর্কতা:</strong> এই পাসওয়ার্ডটি <strong>ব্রাউজার নয়</strong>, বরং{" "}
                  <span className="font-mono font-semibold text-amber-100">{prompt.host}</span>{" "}
                  ওয়েবসাইটটি চাইছে। এই পাসওয়ার্ড কখনোই সংরক্ষণ বা লগ করা হয় না।
                </>
              ) : (
                <>
                  <strong>Warning:</strong> The website{" "}
                  <span className="font-mono font-semibold text-amber-100">{prompt.host}</span>{" "}
                  (<strong>not the browser</strong>) is asking for your username and password. Credentials are kept in memory only and never stored or logged.
                </>
              )}
            </div>
          </div>

          <div className="text-xs text-stone-300 space-y-1">
            <div>
              <span className="text-stone-400">{isBn ? "হোস্ট (Host): " : "Host: "}</span>
              <span className="font-mono text-stone-100 font-semibold">{prompt.host}</span>
            </div>
            <div>
              <span className="text-stone-400">{isBn ? "রিম (Realm): " : "Realm: "}</span>
              <span id="http-auth-modal-realm" className="italic text-stone-200">
                {prompt.realm || "Restricted"}
              </span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <div>
              <label
                htmlFor="http-auth-modal-username"
                className="block text-[11px] font-medium text-stone-300 mb-1"
              >
                {isBn ? "ব্যবহারকারী নাম (Username)" : "Username"}
              </label>
              <input
                id="http-auth-modal-username"
                type="text"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="http-auth-modal-password"
                className="block text-[11px] font-medium text-stone-300 mb-1"
              >
                {isBn ? "পাসওয়ার্ড (Password)" : "Password"}
              </label>
              <input
                id="http-auth-modal-password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
            <button
              id="http-auth-modal-cancel-btn"
              type="button"
              onClick={handleCloseOrCancel}
              className="px-3 py-1.5 rounded-lg border border-stone-700 text-xs font-medium text-stone-300 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              {isBn ? "বাতিল (Cancel)" : "Cancel"}
            </button>
            <button
              id="http-auth-modal-submit-btn"
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {isBn ? "সাইন ইন (Sign In)" : "Sign In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
