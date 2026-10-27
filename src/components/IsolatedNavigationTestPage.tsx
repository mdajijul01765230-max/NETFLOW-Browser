import React, { useState, useRef, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Lock,
  Globe,
  Shield,
  ShieldAlert,
  ServerCrash,
  WifiOff,
  Clock,
  Radio,
  CheckCircle,
  ExternalLink,
  Languages,
  Search,
  Sparkles,
  AlertTriangle,
  FileText,
  CornerDownLeft,
} from "lucide-react";
import { resolveRecoveryCenterPresentation } from "./WebRenderer";
import { resolveNativeOmniboxInput } from "../services/nativeBrowserEngine";
import { apiFetch } from "../utils/apiClient";
import { Language, translations } from "../locales";
import { getCleanDomain } from "../utils/formatters";
import { WebPageErrorInfo } from "../types";

export interface NavState {
  url: string;
  displayUrl: string;
  isLoading: boolean;
  progress: number;
  statusCode?: number;
  contentHtml?: string;
  pageTitle?: string;
  error?: string;
  errorInfo?: WebPageErrorInfo;
  loadDurationMs?: number;
  contentLengthBytes?: number;
}

export function IsolatedNavigationTestPage() {
  const [lang, setLang] = useState<Language>("en");
  const t = translations[lang];

  // Address input and navigation history
  const [inputVal, setInputVal] = useState<string>("https://example.com");
  const [navState, setNavState] = useState<NavState>({
    url: "",
    displayUrl: "",
    isLoading: false,
    progress: 0,
  });

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const inFlightAbortRef = useRef<AbortController | null>(null);

  // Toggle Language
  const toggleLanguage = () => {
    setLang((prev) => (prev === "en" ? "bn" : "en"));
  };

  // Perform navigation (either real via /api/browse or simulated for isolated test)
  const executeNavigation = useCallback(
    async (rawInput: string, isHistory = false) => {
      const trimmed = rawInput.trim();
      if (!trimmed) return;

      // Abort any ongoing request
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current.abort();
      }
      const controller = new AbortController();
      inFlightAbortRef.current = controller;

      // URL normalization through NETFLOW omnibox resolver
      const omnibox = resolveNativeOmniboxInput(trimmed);
      let targetUrl = trimmed;

      if (omnibox.kind === "blocked") {
        setNavState({
          url: trimmed,
          displayUrl: trimmed,
          isLoading: false,
          progress: 100,
          statusCode: 403,
          error: "Request blocked by SSRF/Security boundary.",
          errorInfo: {
            errorCode: omnibox.errorCode || "NETFLOW_SSRF_BLOCKED",
            kind: "security_ssrf",
            title: "Security Boundary Blocked",
            detail: "Direct connection to localhost, private or loopback IPs is prohibited.",
            actionable: "Enter a public, fully qualified domain name.",
          },
        });
        return;
      } else if (omnibox.kind === "url") {
        targetUrl = omnibox.resolvedUrl;
      } else if (omnibox.kind === "search") {
        targetUrl = omnibox.searchQuery || trimmed;
      }

      setInputVal(targetUrl);
      setNavState((prev) => ({
        ...prev,
        url: targetUrl,
        displayUrl: targetUrl,
        isLoading: true,
        progress: 25,
        error: undefined,
        errorInfo: undefined,
        contentHtml: undefined,
      }));

      // Update history if not navigating backwards/forwards
      if (!isHistory) {
        const newHist = history.slice(0, historyIndex + 1);
        newHist.push(targetUrl);
        setHistory(newHist);
        setHistoryIndex(newHist.length - 1);
      }

      const startTime = performance.now();

      // Progress animation ticker
      const progressTimer = setInterval(() => {
        setNavState((prev) => {
          if (!prev.isLoading) return prev;
          const next = Math.min(prev.progress + 15, 85);
          return { ...prev, progress: next };
        });
      }, 150);

      try {
        const response = await apiFetch("/api/browse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            url: targetUrl,
            mode: "fast",
            blockTrackers: true,
            blockImages: false,
            httpMethod: "GET",
          }),
        });

        clearInterval(progressTimer);
        const elapsed = Math.round(performance.now() - startTime);

        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (controller.signal.aborted) return;

        if (!response.ok || !data?.success) {
          const status = data?.statusCode || response.status || 500;
          const errCode = data?.errorCode || (status === 503 ? "HTTP_503_SERVICE_UNAVAILABLE" : "UNKNOWN_ERROR");
          const errMsg = data?.error || (status === 503 ? "Service Unavailable (HTTP 503)" : `HTTP ${status} Navigation Failure`);

          setNavState({
            url: targetUrl,
            displayUrl: targetUrl,
            isLoading: false,
            progress: 100,
            statusCode: status,
            error: errMsg,
            errorInfo: {
              statusCode: status,
              errorCode: errCode,
              kind: status === 503 ? "server" : "generic",
              title: errMsg,
              detail: data?.details || `Backend returned status ${status}`,
              actionable: "Try reloading or verify upstream host availability.",
            },
            loadDurationMs: elapsed,
          });
          return;
        }

        // Success
        setNavState({
          url: targetUrl,
          displayUrl: targetUrl,
          isLoading: false,
          progress: 100,
          statusCode: 200,
          contentHtml: data?.html || "<p>Page rendered successfully.</p>",
          pageTitle: data?.title || getCleanDomain(targetUrl),
          contentLengthBytes: typeof data?.html === "string" ? data.html.length : 0,
          loadDurationMs: elapsed,
          error: undefined,
          errorInfo: undefined,
        });
      } catch (err: any) {
        clearInterval(progressTimer);
        if (controller.signal.aborted) return;

        const elapsed = Math.round(performance.now() - startTime);
        const errMessage = err?.message || "Navigation failed";
        const is503 = err?.statusCode === 503 || errMessage.includes("503");

        setNavState({
          url: targetUrl,
          displayUrl: targetUrl,
          isLoading: false,
          progress: 100,
          statusCode: is503 ? 503 : 500,
          error: errMessage,
          errorInfo: {
            statusCode: is503 ? 503 : 500,
            errorCode: is503 ? "HTTP_503_SERVICE_UNAVAILABLE" : (err?.errorCode || "ERR_CONNECTION_FAILED"),
            kind: is503 ? "server" : "connection",
            title: is503 ? "Service Unavailable" : "Connection Failure",
            detail: err?.stack || errMessage,
            actionable: "Check connection and retry.",
          },
          loadDurationMs: elapsed,
        });
      }
    },
    [history, historyIndex]
  );

  // Trigger simulated HTTP 503 error state for non-network UI verification
  const triggerSimulated503 = () => {
    if (inFlightAbortRef.current) inFlightAbortRef.current.abort();
    const mockUrl = "https://example.com/maintenance";
    setInputVal(mockUrl);
    setNavState({
      url: mockUrl,
      displayUrl: mockUrl,
      isLoading: false,
      progress: 100,
      statusCode: 503,
      error: "The destination website is temporarily unavailable or undergoing maintenance (HTTP 503).",
      errorInfo: {
        statusCode: 503,
        errorCode: "HTTP_503_SERVICE_UNAVAILABLE",
        kind: "server",
        title: "Service Unavailable",
        detail: "HTTP 503 status code received from upstream web server during maintenance window.",
        actionable: "Wait a few moments and click Retry.",
        retryAttempts: 1,
      },
      loadDurationMs: 42,
    });
  };

  // Trigger simulated SSRF block
  const triggerSimulatedSsrf = () => {
    if (inFlightAbortRef.current) inFlightAbortRef.current.abort();
    const mockUrl = "http://127.0.0.1:3000/internal";
    setInputVal(mockUrl);
    setNavState({
      url: mockUrl,
      displayUrl: mockUrl,
      isLoading: false,
      progress: 100,
      statusCode: 403,
      error: "Access blocked: navigation to private loopback/internal IP is prohibited by NETFLOW SSRF boundary.",
      errorInfo: {
        statusCode: 403,
        errorCode: "NETFLOW_SSRF_BLOCKED",
        kind: "security_ssrf",
        title: "Security Boundary Block",
        detail: "127.0.0.1 resolves to loopback IP address prohibited by security policy.",
        actionable: "Specify a public domain name instead.",
      },
      loadDurationMs: 8,
    });
  };

  // Reset to initial state
  const resetToHome = () => {
    if (inFlightAbortRef.current) inFlightAbortRef.current.abort();
    setInputVal("");
    setNavState({
      url: "",
      displayUrl: "",
      isLoading: false,
      progress: 0,
      contentHtml: undefined,
      error: undefined,
      errorInfo: undefined,
    });
  };

  // History navigation
  const goBack = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      executeNavigation(history[prevIdx], true);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      executeNavigation(history[nextIdx], true);
    }
  };

  const reload = () => {
    if (navState.url) {
      executeNavigation(navState.url, true);
    }
  };

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      executeNavigation(inputVal);
    }
  };

  // Calculate recovery center presentation if in error state
  const recoveryPresentation =
    navState.error
      ? resolveRecoveryCenterPresentation({
          error: navState.error,
          errorInfo: navState.errorInfo,
          url: navState.url,
          lang,
          isNavigatorOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
        })
      : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 font-sans select-none overflow-hidden">
      {/* Top Notice Banner: Isolated Copy Indicator */}
      <div className="bg-amber-600 dark:bg-amber-700 text-white text-xs px-3 py-1.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 font-medium">
          <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Test Copy
          </span>
          <span>NETFLOW Form 01G-R15: Isolated Navigation &amp; Page Loading Verification</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1 bg-white/15 hover:bg-white/25 px-2 py-0.5 rounded text-xs transition cursor-pointer"
            title="Toggle Language"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === "en" ? "বাংলা" : "English"}</span>
          </button>
          <span className="text-white/80 text-[11px] hidden sm:inline">
            Production Core Intact
          </span>
        </div>
      </div>

      {/* Browser Navigation Header Bar */}
      <header className="bg-white dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 px-3 py-2 flex flex-col gap-1.5 shadow-xs shrink-0">
        <div className="flex items-center gap-2">
          {/* Back Button */}
          <button
            type="button"
            onClick={goBack}
            disabled={historyIndex <= 0}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-not-allowed"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Forward Button */}
          <button
            type="button"
            onClick={goForward}
            disabled={historyIndex >= history.length - 1}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-not-allowed"
            title="Go Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Reload Button */}
          <button
            type="button"
            onClick={reload}
            disabled={navState.isLoading || !navState.url}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-not-allowed"
            title="Reload"
          >
            <RotateCw className={`w-4 h-4 ${navState.isLoading ? "animate-spin text-blue-600" : ""}`} />
          </button>

          {/* Home Button */}
          <button
            type="button"
            onClick={resetToHome}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            title="Home"
          >
            <Home className="w-4 h-4" />
          </button>

          {/* Omnibox Address Form */}
          <form onSubmit={handleSubmit} className="flex-1 flex items-center min-w-0">
            <div className="relative flex-1 flex items-center">
              <div className="absolute left-3 flex items-center pointer-events-none text-stone-400">
                {navState.url.startsWith("https://") ? (
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
              </div>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Enter URL (e.g., example.com) or search query..."
                className="w-full pl-9 pr-20 py-2 text-sm bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-stone-900 dark:text-stone-100 transition shadow-inner"
              />
              <button
                type="submit"
                disabled={navState.isLoading || !inputVal.trim()}
                className="absolute right-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Go</span>
                <CornerDownLeft className="w-3 h-3" />
              </button>
            </div>
          </form>
        </div>

        {/* Loading Progress Bar */}
        {navState.isLoading && (
          <div className="w-full bg-stone-100 dark:bg-stone-800 h-1 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${navState.progress}%` }}
            />
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-auto relative flex flex-col bg-stone-50 dark:bg-stone-950">
        {/* State 1: Active Loading State */}
        {navState.isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-stone-800 dark:text-stone-200">
                {lang === "bn" ? "পৃষ্ঠা লোড হচ্ছে..." : "Loading page..."}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">
                {navState.url ? getCleanDomain(navState.url) : "Connecting..."}
              </p>
            </div>
            <p className="text-xs text-stone-400 max-w-sm">
              Resolving destination via backend DNS socket boundary with SSRF filter.
            </p>
          </div>
        )}

        {/* State 2: Error State / HTTP 503 Web Page Recovery Center */}
        {!navState.isLoading && navState.error && recoveryPresentation && (
          <div
            id="netflow-web-error-recovery-center"
            className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto"
          >
            <div className="max-w-lg w-full p-6 sm:p-7 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-lg text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
              {/* Error Badge Icon */}
              <div
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center shadow-xs ${
                  recoveryPresentation.isServerError
                    ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                    : recoveryPresentation.isSecurityBlock
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                }`}
              >
                {recoveryPresentation.isServerError ? (
                  <ServerCrash className="w-7 h-7" />
                ) : recoveryPresentation.isSecurityBlock ? (
                  <Shield className="w-7 h-7" />
                ) : (
                  <AlertTriangle className="w-7 h-7" />
                )}
              </div>

              {/* Title & Description */}
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  {recoveryPresentation.errorTitle}
                </h2>
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                  {recoveryPresentation.errorDescription}
                </p>
              </div>

              {/* Status Code / Error Tag */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-[11px] font-mono text-stone-600 dark:text-stone-400">
                <span>Code:</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {recoveryPresentation.errorCode}
                </span>
                {navState.statusCode && (
                  <span className="bg-stone-200 dark:bg-stone-700 px-1 rounded text-[10px]">
                    HTTP {navState.statusCode}
                  </span>
                )}
              </div>

              {/* Troubleshooting Checklist */}
              {recoveryPresentation.checklistItems.length > 0 && (
                <div className="text-left bg-stone-50 dark:bg-stone-950/50 p-3.5 rounded-2xl border border-stone-100 dark:border-stone-800 space-y-2">
                  <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    {lang === "bn" ? "প্রস্তাবিত পদক্ষেপ:" : "Suggested steps:"}
                  </h4>
                  <ul className="text-xs space-y-1 text-stone-600 dark:text-stone-300">
                    {recoveryPresentation.checklistItems.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons: Retry & Home */}
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={reload}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{t.errorState.retry || "Retry"}</span>
                </button>
                <button
                  type="button"
                  onClick={resetToHome}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium text-xs transition cursor-pointer"
                >
                  {t.errorState.goHome || "Back to Safety"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State 3: Successful Page Load */}
        {!navState.isLoading && !navState.error && navState.contentHtml && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Metadata Bar */}
            <div className="bg-stone-200/80 dark:bg-stone-800/80 px-4 py-1.5 border-b border-stone-300 dark:border-stone-700 flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium truncate">{navState.pageTitle || navState.url}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
                <span>Status: HTTP {navState.statusCode || 200}</span>
                {navState.loadDurationMs !== undefined && (
                  <span>{navState.loadDurationMs}ms</span>
                )}
                {navState.contentLengthBytes !== undefined && (
                  <span>{(navState.contentLengthBytes / 1024).toFixed(1)} KB</span>
                )}
              </div>
            </div>

            {/* Sandboxed Content Frame */}
            <iframe
              title="Rendered Page View"
              srcDoc={navState.contentHtml}
              sandbox="allow-same-origin"
              className="flex-1 w-full h-full border-none bg-white"
            />
          </div>
        )}

        {/* State 4: Default Test Hub / Start View */}
        {!navState.isLoading && !navState.error && !navState.contentHtml && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-md">
              <Globe className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                NETFLOW Browser V2 — Isolated Navigation Deck
              </h1>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                This is a quarantined, preview-testable copy of the core navigation and page-loading engine. Use the controls below to verify UI responsiveness, loading states, and recovery centers.
              </p>
            </div>

            {/* Quick Testing Tools */}
            <div className="w-full bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-3">
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider text-left">
                Non-Network UI Verification Actions:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={triggerSimulated503}
                  className="px-3.5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2 transition cursor-pointer text-left"
                >
                  <ServerCrash className="w-4 h-4 shrink-0 text-rose-600" />
                  <div>
                    <div className="font-semibold">Simulate HTTP 503</div>
                    <div className="text-[10px] opacity-80">Test Recovery Center &amp; Retry UI</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={triggerSimulatedSsrf}
                  className="px-3.5 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 transition cursor-pointer text-left"
                >
                  <Shield className="w-4 h-4 shrink-0 text-emerald-600" />
                  <div>
                    <div className="font-semibold">Simulate SSRF Block</div>
                    <div className="text-[10px] opacity-80">Test 127.0.0.1 Protection UI</div>
                  </div>
                </button>
              </div>

              <div className="pt-2 border-t border-stone-100 dark:border-stone-800 text-left">
                <p className="text-[11px] text-stone-500">
                  <span className="font-semibold text-stone-700 dark:text-stone-300">Live Browsing:</span> To test real backend navigation, type any public URL in the address bar above and click <span className="font-mono font-semibold text-blue-600">Go</span>.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default IsolatedNavigationTestPage;
