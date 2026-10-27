import React, { useState, useEffect } from "react";
import { KeyRound, ShieldAlert, Lock, X, Award } from "lucide-react";
import {
  HttpAuthPrompt,
  ClientCertPrompt,
} from "../services/androidWebViewHttpAuthBoundary";

interface HttpAuthConsentModalProps {
  isOpen: boolean;
  httpAuthPrompt: HttpAuthPrompt | null;
  clientCertPrompt: ClientCertPrompt | null;
  onSubmitHttpAuth: (challengeId: string, username: string, pass: string, save: boolean) => void;
  onCancelHttpAuth: (challengeId: string) => void;
  onSubmitClientCert: (challengeId: string, certAlias: string) => void;
  onCancelClientCert: (challengeId: string) => void;
  onIgnoreClientCert: (challengeId: string) => void;
  lang: "bn" | "en";
}

export const HttpAuthConsentModal: React.FC<HttpAuthConsentModalProps> = ({
  isOpen,
  httpAuthPrompt,
  clientCertPrompt,
  onSubmitHttpAuth,
  onCancelHttpAuth,
  onSubmitClientCert,
  onCancelClientCert,
  onIgnoreClientCert,
  lang,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saveCredential, setSaveCredential] = useState(false);
  const [selectedCert, setSelectedCert] = useState("");

  const isBn = lang === "bn";

  useEffect(() => {
    if (httpAuthPrompt) {
      setUsername("");
      setPassword("");
      setSaveCredential(false);
    }
  }, [httpAuthPrompt]);

  useEffect(() => {
    if (clientCertPrompt && clientCertPrompt.availableCerts.length > 0) {
      setSelectedCert(clientCertPrompt.availableCerts[0].alias);
    }
  }, [clientCertPrompt]);

  if (!isOpen || (!httpAuthPrompt && !clientCertPrompt)) return null;

  // Render HTTP 401 Auth Prompt (Basic / Digest)
  if (httpAuthPrompt) {
    return (
      <div
        id="http-auth-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
      >
        <div
          id="http-auth-dialog"
          className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="http-auth-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 id="http-auth-title" className="text-sm font-semibold text-stone-100">
                  {isBn ? "প্রমাণীকরণ প্রয়োজন (Sign In)" : "Authentication Required"}
                </h3>
                <p className="text-[11px] text-stone-400 font-mono truncate max-w-[260px]">
                  {httpAuthPrompt.host}
                </p>
              </div>
            </div>
            <button
              id="http-auth-close-btn"
              type="button"
              onClick={() => onCancelHttpAuth(httpAuthPrompt.challengeId)}
              className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Content */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitHttpAuth(httpAuthPrompt.challengeId, username, password, saveCredential);
            }}
            className="p-4 space-y-3.5"
          >
            <div className="text-xs text-stone-300">
              {isBn ? (
                <>
                  সার্ভার <span className="font-mono text-stone-100 font-semibold">{httpAuthPrompt.host}</span> ব্যবহারকারী নাম ও পাসওয়ার্ড চাইছে। রিম: <span className="italic text-stone-200">{httpAuthPrompt.realm || "Default"}</span>
                </>
              ) : (
                <>
                  The site <span className="font-mono text-stone-100 font-semibold">{httpAuthPrompt.host}</span> requires a username and password. Realm: <span className="italic text-stone-200">{httpAuthPrompt.realm || "Default"}</span>
                </>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-stone-300 mb-1">
                  {isBn ? "ব্যবহারকারী নাম (Username)" : "Username"}
                </label>
                <input
                  id="http-auth-username-input"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-300 mb-1">
                  {isBn ? "পাসওয়ার্ড (Password)" : "Password"}
                </label>
                <input
                  id="http-auth-password-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Remember credentials */}
            {!httpAuthPrompt.isPrivate && (
              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  id="http-auth-save-checkbox"
                  type="checkbox"
                  checked={saveCredential}
                  onChange={(e) => setSaveCredential(e.target.checked)}
                  className="rounded bg-stone-950 border-stone-700 text-blue-500 focus:ring-0"
                />
                <span className="text-[11px] text-stone-300">
                  {isBn ? "এই সেশনের জন্য তথ্য মনে রাখুন" : "Remember credentials for this session"}
                </span>
              </label>
            )}

            {httpAuthPrompt.isPrivate && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-300 bg-amber-950/40 p-2 rounded-md border border-amber-800/60">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isBn
                    ? "প্রাইভেট ব্রাউজিং: কোনো ক্রেডেনশিয়াল ডিস্কে সংরক্ষণ করা হবে না।"
                    : "Private Mode: Credentials are strictly ephemeral and never written to disk."}
                </span>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
              <button
                id="http-auth-cancel-btn"
                type="button"
                onClick={() => onCancelHttpAuth(httpAuthPrompt.challengeId)}
                className="px-3 py-1.5 rounded-lg border border-stone-700 text-xs font-medium text-stone-300 hover:bg-stone-800 transition-colors"
              >
                {isBn ? "বাতিল (Cancel)" : "Cancel"}
              </button>
              <button
                id="http-auth-submit-btn"
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                {isBn ? "সাইন ইন (Sign In)" : "Sign In"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Render Client Certificate Selection Modal (mTLS)
  if (clientCertPrompt) {
    return (
      <div
        id="client-cert-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
      >
        <div
          id="client-cert-dialog"
          className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-cert-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 id="client-cert-title" className="text-sm font-semibold text-stone-100">
                  {isBn ? "ক্লায়েন্ট সার্টিফিকেট নির্বাচন" : "Select a Client Certificate"}
                </h3>
                <p className="text-[11px] text-stone-400 font-mono truncate max-w-[260px]">
                  {clientCertPrompt.host}:{clientCertPrompt.port}
                </p>
              </div>
            </div>
            <button
              id="client-cert-close-btn"
              type="button"
              onClick={() => onCancelClientCert(clientCertPrompt.challengeId)}
              className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Certificate Selection Body */}
          <div className="p-4 space-y-3.5">
            <div className="text-xs text-stone-300">
              {isBn ? (
                <>
                  সার্ভারটি সংযোগ অনুমোদনের জন্য আপনার পরিচয় যাচাইকারী একটি ক্লায়েন্ট সার্টিফিকেট অনুরোধ করছে।
                </>
              ) : (
                <>
                  The server requires a client certificate to verify your identity during mutual TLS handshake.
                </>
              )}
            </div>

            <div className="space-y-2">
              {clientCertPrompt.availableCerts.map((cert) => (
                <label
                  key={cert.alias}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedCert === cert.alias
                      ? "bg-stone-800/80 border-emerald-500/60 text-stone-100"
                      : "bg-stone-950/50 border-stone-800 text-stone-300 hover:border-stone-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="clientCertRadio"
                    value={cert.alias}
                    checked={selectedCert === cert.alias}
                    onChange={(e) => setSelectedCert(e.target.value)}
                    className="mt-0.5 text-emerald-500 focus:ring-0"
                  />
                  <div className="text-[11px] leading-tight">
                    <div className="font-semibold text-stone-200">{cert.subject}</div>
                    <div className="text-stone-400 text-[10px] mt-0.5">Issuer: {cert.issuer}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-800">
              <button
                id="client-cert-ignore-btn"
                type="button"
                onClick={() => onIgnoreClientCert(clientCertPrompt.challengeId)}
                className="text-[11px] text-stone-400 hover:text-stone-200 transition-colors"
              >
                {isBn ? "সার্টিফিকেট ছাড়া চালান" : "Continue without certificate"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  id="client-cert-cancel-btn"
                  type="button"
                  onClick={() => onCancelClientCert(clientCertPrompt.challengeId)}
                  className="px-3 py-1.5 rounded-lg border border-stone-700 text-xs font-medium text-stone-300 hover:bg-stone-800 transition-colors"
                >
                  {isBn ? "বাতিল" : "Cancel"}
                </button>
                <button
                  id="client-cert-submit-btn"
                  type="button"
                  disabled={!selectedCert}
                  onClick={() => onSubmitClientCert(clientCertPrompt.challengeId, selectedCert)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  {isBn ? "নির্বাচন করুন" : "Select & Connect"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
