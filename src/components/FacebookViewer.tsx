import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Shield,
  RotateCw,
  ExternalLink,
  Lock,
  Smartphone,
  Globe,
  Share2,
  AlertCircle,
  Check,
} from "lucide-react";
import { BrowserTab } from "../types";
import { Language, translations } from "../locales";
import { toFacebookBasicUrl } from "../utils/facebookHelper";

interface FacebookViewerProps {
  tab: BrowserTab;
  lang: Language;
  onNavigate: (
    url: string,
    tabId?: string,
    isHistoryNav?: boolean,
    targetHistoryIndex?: number,
    overrideMode?: any,
    formOptions?: any
  ) => void;
  onRetry: (mode?: any) => void;
}

export const FacebookViewer: React.FC<FacebookViewerProps> = ({
  tab,
  lang,
  onNavigate,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const t = translations[lang] || translations.en;

  const currentDisplayUrl = tab.url || "https://mbasic.facebook.com";

  // Handle external browser launch
  const handleOpenExternal = () => {
    try {
      window.open(currentDisplayUrl, "_blank", "noopener,noreferrer");
    } catch {}
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(currentDisplayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Intercept anchor clicks and form submissions inside rendered Facebook HTML
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;

      const lower = rawHref.trim().toLowerCase();
      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("vbscript:")
      ) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      let dest = rawHref;
      try {
        dest = new URL(rawHref, "https://mbasic.facebook.com").href;
      } catch {
        if (!dest.startsWith("http://") && !dest.startsWith("https://")) {
          dest = `https://mbasic.facebook.com${dest.startsWith("/") ? "" : "/"}${dest}`;
        }
      }

      onNavigate(dest, tab.id);
    };

    const handleSubmit = (e: Event) => {
      if (tab.isLoading) {
        e.preventDefault();
        return;
      }

      const form = e.target as HTMLFormElement;
      if (!form) return;

      e.preventDefault();
      e.stopPropagation();

      let actionUrl = form.getAttribute("action") || tab.url || "https://mbasic.facebook.com";
      try {
        actionUrl = new URL(actionUrl, "https://mbasic.facebook.com").href;
      } catch {
        if (!actionUrl.startsWith("http://") && !actionUrl.startsWith("https://")) {
          actionUrl = `https://mbasic.facebook.com${actionUrl.startsWith("/") ? "" : "/"}${actionUrl}`;
        }
      }

      const method = (form.getAttribute("method") || "GET").toUpperCase() as "GET" | "POST";
      const formData = new FormData(form);
      const params = new URLSearchParams();

      formData.forEach((val, key) => {
        if (typeof val === "string") {
          params.append(key, val);
        } else if (val && typeof (val as any).name === "string") {
          params.append(key, (val as any).name);
        }
      });

      const paramsStr = params.toString();
      if (method === "POST") {
        onNavigate(actionUrl, tab.id, false, undefined, undefined, {
          method: "POST",
          postBody: paramsStr,
          contentType: "application/x-www-form-urlencoded",
        });
      } else {
        const fullUrl = paramsStr
          ? actionUrl.includes("?")
            ? `${actionUrl}&${paramsStr}`
            : `${actionUrl}?${paramsStr}`
          : actionUrl;
        onNavigate(fullUrl, tab.id);
      }
    };

    el.addEventListener("click", handleClick);
    el.addEventListener("submit", handleSubmit);

    return () => {
      el.removeEventListener("click", handleClick);
      el.removeEventListener("submit", handleSubmit);
    };
  }, [tab.contentHtml, tab.url, tab.id, tab.isLoading, onNavigate]);

  // Clean Facebook content for viewer
  const sanitizedContent = useMemo(() => {
    if (!tab.contentHtml) return "";
    let html = tab.contentHtml;
    // Remove conflicting header elements or scripts if any slipped through
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    return html;
  }, [tab.contentHtml]);

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-[500px] bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 select-text overflow-hidden">
      {/* Facebook Dedicated Header */}
      <header className="flex flex-wrap items-center justify-between px-3.5 py-2.5 bg-[#1877F2] text-white shadow-md z-10 gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#1877F2] font-black text-xl shadow-xs shrink-0 select-none">
            f
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight leading-none">Facebook</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-white/20 rounded-full uppercase tracking-wider">
                Lite
              </span>
            </div>
            <p className="text-[11px] text-blue-100 truncate max-w-[220px] sm:max-w-xs mt-0.5">
              {lang === "bn"
                ? "লাইট / বেসিক মোড • দ্রুত ও নিরাপদ ব্রাউজিং"
                : "Basic HTML Mode • Fast, zero-tracking sandbox"}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onRetry()}
            disabled={tab.isLoading}
            className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 text-white transition-colors cursor-pointer"
            title={lang === "bn" ? "রিফ্রেশ করুন" : "Refresh"}
            aria-label="Refresh Facebook"
          >
            <RotateCw className={`w-3.5 h-3.5 ${tab.isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 text-white transition-colors cursor-pointer"
            title="Copy URL"
            aria-label="Copy URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Share2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleOpenExternal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-[#1877F2] hover:bg-blue-50 font-semibold text-xs transition-colors cursor-pointer shadow-xs"
            title="Open in External Browser"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">{lang === "bn" ? "অ্যাপে খুলুন" : "Open App"}</span>
          </button>
        </div>
      </header>

      {/* Info Status Bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-1.5 bg-blue-50 dark:bg-stone-850 border-b border-blue-100 dark:border-stone-800 text-[11px] text-stone-600 dark:text-stone-300 shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
            <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            SSL Encrypted
          </span>
          <span className="hidden sm:inline text-stone-400">•</span>
          <span className="hidden sm:flex items-center gap-1 text-stone-500 dark:text-stone-400">
            <Shield className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            Trackers Blocked
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate("https://mbasic.facebook.com", tab.id)}
            className="hover:underline text-blue-600 dark:text-blue-400 font-medium"
          >
            mbasic.facebook.com
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto w-full relative">
        {tab.isLoading ? (
          /* Loading Skeleton */
          <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[400px] text-center">
            <div className="w-14 h-14 rounded-full bg-[#1877F2]/10 dark:bg-blue-950/40 text-[#1877F2] flex items-center justify-center mb-4">
              <div className="w-8 h-8 rounded-full bg-[#1877F2] text-white font-black text-xl flex items-center justify-center animate-pulse">
                f
              </div>
            </div>
            <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1">
              {lang === "bn" ? "ফেসবুক লোড হচ্ছে..." : "Loading Facebook Lite..."}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
              {lang === "bn"
                ? "ডেটা সাশ্রয়ী বেসিক এইচটিএমএল সংস্করণ প্রস্তুত করা হচ্ছে..."
                : "Fetching ultra-fast basic HTML layout with zero tracking..."}
            </p>
            <div className="w-48 h-1.5 bg-blue-100 dark:bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full bg-[#1877F2] rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        ) : tab.error ? (
          /* Error Recovery Card */
          <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[400px] text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
              {lang === "bn" ? "ফেসবুক সংযোগে সমস্যা হয়েছে" : "Facebook Connection Notice"}
            </h4>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
              {tab.error}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => onRetry()}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1877F2] hover:bg-blue-600 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{lang === "bn" ? "পুনরায় চেষ্টা করুন" : "Retry Basic HTML"}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{lang === "bn" ? "ব্রাউজার / অ্যাপে খুলুন" : "Open in External App"}</span>
              </button>
            </div>
          </div>
        ) : sanitizedContent ? (
          /* Rendered Facebook Lite Basic HTML */
          <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <div
              ref={containerRef}
              id="netflow-facebook-content"
              className="bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-6 shadow-sm border border-stone-200 dark:border-stone-800 font-sans text-stone-800 dark:text-stone-200 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
        ) : (
          /* Empty Content Fallback */
          <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[400px] text-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3 text-stone-400">
              <Globe className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
              {lang === "bn" ? "ফেসবুক পৃষ্ঠাটি লোড করুন" : "Load Facebook"}
            </h4>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4 leading-relaxed">
              {lang === "bn"
                ? "ফেসবুক লাইট মোডে ব্রাউজ করতে নিচের বাটনে ক্লিক করুন।"
                : "Click below to load the mobile basic edition of Facebook."}
            </p>
            <button
              type="button"
              onClick={() => onNavigate("https://mbasic.facebook.com", tab.id)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1877F2] hover:bg-blue-600 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{lang === "bn" ? "ফেসবুক লোড করুন" : "Load Facebook"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
