import React, { useState, useEffect } from "react";
import { Camera, Mic, ShieldCheck, Lock, X, Shield } from "lucide-react";
import { translations } from "../locales";

export type MediaConsentResource = "camera" | "microphone" | "protectedMedia";

export interface CameraMicConsentPrompt {
  requestId: string;
  tabId: string;
  origin: string;
  resources: Array<MediaConsentResource>;
  isLocalhost?: boolean;
}

interface CameraMicConsentModalProps {
  isOpen: boolean;
  prompt: CameraMicConsentPrompt | null;
  onApprove: (requestId: string, grantedResources: Array<MediaConsentResource>) => void;
  onDeny: (requestId: string) => void;
  lang: "bn" | "en";
}

export const CameraMicConsentModal: React.FC<CameraMicConsentModalProps> = ({
  isOpen,
  prompt,
  onApprove,
  onDeny,
  lang,
}) => {
  const [allowCamera, setAllowCamera] = useState(true);
  const [allowMic, setAllowMic] = useState(true);
  const [allowProtectedMedia, setAllowProtectedMedia] = useState(true);

  useEffect(() => {
    if (prompt) {
      setAllowCamera(prompt.resources.includes("camera"));
      setAllowMic(prompt.resources.includes("microphone"));
      setAllowProtectedMedia(prompt.resources.includes("protectedMedia"));
    }
  }, [prompt]);

  if (!isOpen || !prompt) return null;

  const isBn = lang === "bn";
  const t = translations[lang];
  const asksCamera = prompt.resources.includes("camera");
  const asksMic = prompt.resources.includes("microphone");
  const asksProtectedMedia = prompt.resources.includes("protectedMedia");
  const requestedCount =
    (asksCamera ? 1 : 0) + (asksMic ? 1 : 0) + (asksProtectedMedia ? 1 : 0);

  const getHeaderTitle = () => {
    if (asksProtectedMedia && !asksCamera && !asksMic) {
      return (
        t.protectedMediaConsentTitle ||
        (isBn
          ? "সুরক্ষিত মিডিয়া (DRM) প্লেব্যাকের অনুমতি দিন?"
          : "Allow Protected Media (DRM) Playback?")
      );
    }
    if (asksCamera && asksMic) {
      return isBn ? "ক্যামেরা ও মাইক্রোফোনের অনুমতি" : "Camera & Microphone Access Request";
    }
    if (asksCamera) {
      return isBn ? "ক্যামেরা ব্যবহারের অনুমতি" : "Camera Access Request";
    }
    return isBn ? "মাইক্রোফোন ব্যবহারের অনুমতি" : "Microphone Access Request";
  };

  const getRequestedDescription = () => {
    if (asksProtectedMedia && !asksCamera && !asksMic) {
      return (
        t.protectedMediaConsentExplanation ||
        (isBn
          ? "এই ওয়েবসাইটটি এনক্রিপ্টেড বা কপিরাইট-সুরক্ষিত মিডিয়া (DRM protected content) চালানোর জন্য ডিভাইসের সুরক্ষিত মিডিয়া আইডি ব্যবহারের অনুমতি চাচ্ছে।"
          : "This site is requesting permission to use protected-content playback (DRM) to play encrypted audio or video streams.")
      );
    }
    if (asksCamera && asksMic) {
      return isBn
        ? "এই ওয়েবসাইটটি আপনার ক্যামেরা এবং মাইক্রোফোন উভয়ই ব্যবহার করতে চাইছে।"
        : "This website is requesting access to both your camera and microphone.";
    }
    if (asksCamera) {
      return isBn
        ? "এই ওয়েবসাইটটি আপনার ক্যামেরা ব্যবহার করতে চাইছে।"
        : "This website is requesting access to your camera.";
    }
    return isBn
      ? "এই ওয়েবসাইটটি আপনার মাইক্রোফোন ব্যবহার করতে চাইছে।"
      : "This website is requesting access to your microphone.";
  };

  const handleConfirmApprove = () => {
    const granted: Array<MediaConsentResource> = [];
    if (asksCamera && allowCamera) granted.push("camera");
    if (asksMic && allowMic) granted.push("microphone");
    if (asksProtectedMedia && allowProtectedMedia) granted.push("protectedMedia");
    if (granted.length === 0) {
      onDeny(prompt.requestId);
      return;
    }
    onApprove(prompt.requestId, granted);
  };

  return (
    <div
      id="camera-mic-consent-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="camera-mic-consent-dialog"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-stone-100 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-mic-consent-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              {asksCamera ? (
                <Camera className="w-4 h-4" />
              ) : asksMic ? (
                <Mic className="w-4 h-4" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 id="camera-mic-consent-title" className="text-sm font-semibold text-stone-100">
                {getHeaderTitle()}
              </h3>
              <p className="text-[11px] text-stone-400">
                {isBn ? "মিডিয়া অ্যাক্সেস সুরক্ষা বাউন্ডারি" : "Secure Media Permission Boundary"}
              </p>
            </div>
          </div>
          <button
            id="camera-mic-consent-close-btn"
            type="button"
            onClick={() => onDeny(prompt.requestId)}
            className="text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Origin Card */}
          <div className="p-3 bg-stone-950/80 rounded-lg border border-stone-800 flex items-start gap-3">
            <div className="p-2 rounded-md bg-stone-800 text-sky-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                id="camera-mic-consent-origin"
                className="text-xs font-semibold text-stone-200 truncate font-mono"
              >
                {prompt.origin}
              </div>
              <div id="camera-mic-consent-requested" className="text-[11px] text-stone-300 mt-1">
                {getRequestedDescription()}
              </div>
              {asksProtectedMedia && (
                <div
                  id="protected-media-device-note"
                  className="text-[10px] text-amber-300/90 bg-amber-950/40 border border-amber-800/50 rounded-md px-2.5 py-1.5 mt-2 leading-relaxed"
                >
                  {t.protectedMediaDeviceNote ||
                    "Note: Actual protected-media playback depends on device hardware DRM provisioning and system WebView support (NOT VERIFIED)."}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {asksCamera && (
                  <span
                    id="camera-mic-badge-camera"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/80 border border-sky-700/60 text-[10px] text-sky-300 font-medium"
                  >
                    <Camera className="w-3 h-3" />
                    {isBn ? "ক্যামেরা (Camera)" : "Camera"}
                  </span>
                )}
                {asksMic && (
                  <span
                    id="camera-mic-badge-microphone"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-[10px] text-indigo-300 font-medium"
                  >
                    <Mic className="w-3 h-3" />
                    {isBn ? "মাইক্রোফোন (Microphone)" : "Microphone"}
                  </span>
                )}
                {asksProtectedMedia && (
                  <span
                    id="camera-mic-badge-protected-media"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-[10px] text-emerald-300 font-medium"
                  >
                    <Shield className="w-3 h-3" />
                    {t.permProtectedMediaLabel || "Protected Media (DRM)"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {prompt.isLocalhost
                    ? isBn
                      ? "লোকালহোস্ট ডেভেলপমেন্ট এক্সেপশন"
                      : "Localhost Development Exception"
                    : isBn
                    ? "ভেরিফাইড সুরক্ষিত HTTPS অরিজিন"
                    : "Verified Secure HTTPS Origin"}
                </span>
              </div>
            </div>
          </div>

          {/* Granular toggles when multiple resources are requested */}
          {requestedCount > 1 && (
            <div className="space-y-1.5 pt-1">
              {asksCamera && (
                <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer select-none">
                  <input
                    id="camera-mic-toggle-camera"
                    type="checkbox"
                    checked={allowCamera}
                    onChange={(e) => setAllowCamera(e.target.checked)}
                    className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-sky-500"
                  />
                  <span>{isBn ? "ক্যামেরা অনুমোদন করুন (Camera)" : "Allow Camera"}</span>
                </label>
              )}
              {asksMic && (
                <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer select-none">
                  <input
                    id="camera-mic-toggle-microphone"
                    type="checkbox"
                    checked={allowMic}
                    onChange={(e) => setAllowMic(e.target.checked)}
                    className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-sky-500"
                  />
                  <span>{isBn ? "মাইক্রোফোন অনুমোদন করুন (Microphone)" : "Allow Microphone"}</span>
                </label>
              )}
              {asksProtectedMedia && (
                <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer select-none">
                  <input
                    id="camera-mic-toggle-protected-media"
                    type="checkbox"
                    checked={allowProtectedMedia}
                    onChange={(e) => setAllowProtectedMedia(e.target.checked)}
                    className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-sky-500"
                  />
                  <span>
                    {t.permProtectedMediaLabel ||
                      (isBn ? "সুরক্ষিত মিডিয়া (DRM)" : "Allow Protected Media (DRM)")}
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-stone-950/60 border-t border-stone-800 flex items-center justify-end gap-2">
          <button
            id="camera-mic-consent-deny-btn"
            type="button"
            onClick={() => onDeny(prompt.requestId)}
            className="px-3 py-1.5 rounded-lg border border-stone-700 bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-300 transition-colors cursor-pointer"
          >
            {asksProtectedMedia && !asksCamera && !asksMic
              ? t.protectedMediaBlockBtn || (isBn ? "ব্লক করুন (Block)" : "Block")
              : isBn
              ? "প্রত্যাখ্যান (Deny)"
              : "Deny"}
          </button>
          <button
            id="camera-mic-consent-allow-btn"
            type="button"
            onClick={handleConfirmApprove}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {asksCamera ? (
              <Camera className="w-3.5 h-3.5" />
            ) : asksMic ? (
              <Mic className="w-3.5 h-3.5" />
            ) : (
              <Shield className="w-3.5 h-3.5" />
            )}
            <span>
              {asksProtectedMedia && !asksCamera && !asksMic
                ? t.protectedMediaAllowBtn || (isBn ? "অনুমতি দিন (Allow)" : "Allow")
                : isBn
                ? "অনুমতি দিন (Allow)"
                : "Allow"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
