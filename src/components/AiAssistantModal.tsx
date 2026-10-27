import React, { useState } from "react";
import {
  Sparkles,
  X,
  BookOpen,
  HelpCircle,
  Wifi,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Languages,
} from "lucide-react";
import { BrowserTab, NetworkState } from "../types";
import { Language, translations } from "../locales";
import { apiFetch } from "../utils/apiClient";

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: BrowserTab;
  networkState: NetworkState;
  lang: Language;
  onTranslatePage?: (targetLang?: "bn" | "en") => void;
  onToggleTranslation?: () => void;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  networkState,
  lang,
  onTranslatePage,
  onToggleTranslation,
}) => {
  const t = translations[lang];
  const [activeTabType, setActiveTabType] = useState<"summary" | "explain" | "network" | "translate">("summary");
  const [isLoading, setIsLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    summary?: string;
    keyPoints?: string[];
    readTimeSavedMin?: number;
    humanVerdict?: string;
  } | null>(null);

  const [explainPhrase, setExplainPhrase] = useState("");
  const [explainResult, setExplainResult] = useState<string | null>(null);

  const [networkAdvice, setNetworkAdvice] = useState<{
    headline?: string;
    suggestedMode?: string;
    recommendations?: string[];
    honestExplanation?: string;
  } | null>(null);

  if (!isOpen) return null;

  // Request page summary
  const handleGenerateSummary = async () => {
    if (!activeTab?.rawText && !activeTab?.title) return;
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeTab.title || activeTab.url,
          url: activeTab.url,
          text: activeTab.rawText || activeTab.title,
          language: lang,
        }),
      });
      const data = await res.json();
      setSummaryData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Request term simplification
  const handleExplain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!explainPhrase.trim()) return;
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/ai/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phrase: explainPhrase.trim(),
          context: activeTab?.title || "",
          language: lang,
        }),
      });
      const data = await res.json();
      setExplainResult(data.explanation);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Request network advice
  const handleGetNetworkAdvice = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/ai/network-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkType: networkState.type,
          rtt: networkState.rttMs,
          downlink: networkState.downlinkMbps,
          language: lang,
        }),
      });
      const data = await res.json();
      setNetworkAdvice(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="ai-assistant-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="ai-assistant-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[85vh] text-stone-800 dark:text-stone-200 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <div>
              <h2 id="ai-assistant-title" className="text-sm font-bold">NETFLOW AI Intelligence</h2>
              <p className="text-[11px] text-emerald-100">
                Powered by Gemini 3.8 Flash • Human-First &amp; Network-Aware
              </p>
            </div>
          </div>
          <button
            id="btn-close-ai-assistant"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors touch-manipulation cursor-pointer"
            aria-label={t.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="AI Assistant Modes"
          className="flex border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/60 p-1 text-xs"
        >
          <button
            role="tab"
            aria-selected={activeTabType === "summary"}
            onClick={() => setActiveTabType("summary")}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTabType === "summary"
                ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Smart Summary</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTabType === "explain"}
            onClick={() => setActiveTabType("explain")}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTabType === "explain"
                ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Simplify Concept</span>
          </button>

          <button
            onClick={() => {
              setActiveTabType("network");
              if (!networkAdvice) handleGetNetworkAdvice();
            }}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTabType === "network"
                ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Network Advisor</span>
          </button>

          <button
            id="ai-tab-translate"
            onClick={() => setActiveTabType("translate")}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTabType === "translate"
                ? "bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === "bn" ? "অনুবাদ" : "Translate"}</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* TAB 1: Smart Summary */}
          {activeTabType === "summary" && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800">
                <span className="text-[11px] text-stone-400 block">Current Page:</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100 line-clamp-1">
                  {activeTab?.title || activeTab?.url || "Start Page"}
                </span>
              </div>

              {!summaryData ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-stone-600 dark:text-stone-400 text-xs max-w-xs mx-auto">
                    Save reading time and mobile data. Netflow AI extracts key facts in 3 bullet points.
                  </p>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={isLoading || !activeTab?.url}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                  >
                    {isLoading ? "Generating Summary..." : "Generate 1-Click Summary"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {summaryData.readTimeSavedMin && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <span>Saved ~{summaryData.readTimeSavedMin} minutes of reading time</span>
                    </div>
                  )}

                  {summaryData.summary && (
                    <p className="text-stone-800 dark:text-stone-200 text-xs font-medium leading-relaxed">
                      {summaryData.summary}
                    </p>
                  )}

                  {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {t.aiKeyPoints}
                      </span>
                      <ul className="space-y-1.5 pl-1">
                        {summaryData.keyPoints.map((pt, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-stone-700 dark:text-stone-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summaryData.humanVerdict && (
                    <div className="p-2.5 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-600 dark:text-stone-300 italic text-[11px]">
                      Verdict: {summaryData.humanVerdict}
                    </div>
                  )}

                  <button
                    onClick={handleGenerateSummary}
                    disabled={isLoading}
                    className="text-emerald-600 hover:underline text-[11px] pt-2"
                  >
                    Refresh Summary
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Explain / Simplify */}
          {activeTabType === "explain" && (
            <div className="space-y-4">
              <form onSubmit={handleExplain} className="space-y-2">
                <label
                  htmlFor="input-explain-phrase"
                  className="block text-stone-700 dark:text-stone-300 font-medium"
                >
                  Enter any complex word, technical jargon, or phrase:
                </label>
                <div className="flex gap-2">
                  <input
                    id="input-explain-phrase"
                    type="text"
                    value={explainPhrase}
                    onChange={(e) => setExplainPhrase(e.target.value)}
                    placeholder="e.g. quantum entanglement, inflation, API..."
                    className="flex-1 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !explainPhrase.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold"
                  >
                    {isLoading ? "Thinking..." : "Explain"}
                  </button>
                </div>
              </form>

              {explainResult && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-stone-800 dark:text-stone-200 text-xs leading-relaxed space-y-1">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                    Plain-Language Explanation:
                  </span>
                  <p>{explainResult}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Network Advisor */}
          {activeTabType === "network" && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-stone-400 block">Detected Connection</span>
                  <span className="font-bold uppercase text-stone-900 dark:text-stone-100">
                    {networkState.type}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-stone-400 block">Estimated Latency</span>
                  <span className="font-bold text-stone-900 dark:text-stone-100">
                    {networkState.rttMs > 0 ? `${networkState.rttMs} ms` : "Instant"}
                  </span>
                </div>
              </div>

              {networkAdvice ? (
                <div className="space-y-3 pt-1">
                  <h4 className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                    {networkAdvice.headline}
                  </h4>

                  {networkAdvice.recommendations && (
                    <ul className="space-y-1.5">
                      {networkAdvice.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-stone-700 dark:text-stone-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {networkAdvice.honestExplanation && (
                    <p className="p-2.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-[11px] text-stone-600 dark:text-stone-400 italic">
                      {networkAdvice.honestExplanation}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleGetNetworkAdvice}
                  disabled={isLoading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold"
                >
                  {isLoading ? "Analyzing Network..." : "Analyze Current Network"}
                </button>
              )}
            </div>
          )}

          {/* TAB 4: One-Tap Web Translation */}
          {activeTabType === "translate" && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Languages className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                      {lang === "bn"
                        ? "এক-ট্যাপ পূর্ণ পৃষ্ঠা ওয়েব অনুবাদ"
                        : "One-Tap Full-Page Web Translation"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold uppercase">
                    BN ↔ EN
                  </span>
                </div>

                <p className="text-xs text-stone-600 dark:text-stone-400">
                  {lang === "bn"
                    ? "চলতি ওয়েব পৃষ্ঠার সকল দৃশ্যমান লেখা ও শিরোনাম সরাসরি বাংলা বা ইংরেজিতে রূপান্তর করুন। পৃষ্ঠার লেআউট, লিংক ও গঠন অক্ষুণ্ণ থাকবে।"
                    : "Translate all readable text and headings of the active webpage between Bengali and English while fully preserving layout and links."}
                </p>

                {activeTab?.translation?.isTranslated ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-emerald-900 dark:text-emerald-200">
                        {activeTab.translation.targetLang === "bn"
                          ? "✓ বাংলায় অনুদিত প্রদর্শিত হচ্ছে"
                          : "✓ Translated to English"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleTranslation?.();
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-white dark:bg-stone-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-[11px] font-medium"
                      >
                        {t.viewOriginal}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-stone-500">
                    {activeTab?.url
                      ? lang === "bn"
                        ? `বর্তমান পৃষ্ঠা: ${activeTab.title || activeTab.url}`
                        : `Current page: ${activeTab.title || activeTab.url}`
                      : lang === "bn"
                      ? "কোনো ওয়েব পৃষ্ঠা খোলা নেই।"
                      : "No active web page loaded."}
                  </div>
                )}

                {activeTab?.url && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onTranslatePage?.("bn");
                        onClose();
                      }}
                      disabled={activeTab?.translation?.isTranslating}
                      className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>{t.translateToBn}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onTranslatePage?.("en");
                        onClose();
                      }}
                      disabled={activeTab?.translation?.isTranslating}
                      className="py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 dark:bg-stone-700 dark:hover:bg-stone-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>{t.translateToEn}</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-stone-100 dark:bg-stone-850 text-[11px] text-stone-500 space-y-1">
                <div className="font-semibold text-stone-700 dark:text-stone-300">
                  {lang === "bn" ? "নিরাপত্তা ও গোপনীয়তা নিশ্চয়তা:" : "Privacy & Safety Guarantees:"}
                </div>
                <div>• {lang === "bn" ? "ব্রাউজিং হিস্ট্রি বা পাসওয়ার্ড কখনো অনুবাদে পাঠানো হয় না।" : "No credentials, cookies, or history are ever transmitted."}</div>
                <div>• {lang === "bn" ? "মূল পৃষ্ঠা সম্পূর্ণ নিরাপদ থাকে এবং যেকোনো সময় ফিরিয়ে আনা যায়।" : "Original page state is preserved and revertible at any time."}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Disclaimer */}
        <div className="p-3 bg-stone-50 dark:bg-stone-950 border-t border-stone-200 dark:border-stone-800 text-[10px] text-stone-500 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{t.aiDisclaimer}</span>
        </div>
      </div>
    </div>
  );
};
