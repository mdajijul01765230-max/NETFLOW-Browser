import React, { useState } from "react";
import {
  Wifi,
  WifiOff,
  Zap,
  X,
  Gauge,
  Activity,
  Check,
  ShieldCheck,
  RotateCw,
  Info,
  Scale,
  Radio,
  Signal,
  ArrowRightLeft,
  History,
  FileCheck,
  Cpu,
  AlertTriangle,
  Layers,
  Sparkles,
  Lock,
  Smartphone,
  ExternalLink,
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  RefreshCw,
  SignalHigh,
} from "lucide-react";
import {
  BrowsingMode,
  NetworkMedium,
  NetworkState,
  NetworkTransitionEvent,
  NetworkType,
  PendingNetworkRequest,
  NetworkEnginePolicy,
  Smart4GPreferenceState,
  CallSafeState,
} from "../types";
import { Language, translations } from "../locales";
import { formatBytes } from "../utils/formatters";
import {
  ANDROID_CAPABILITIES_SPECS,
  STRICT_NETWORK_BOUNDARIES,
  SMART_4G_MANTRA,
  SMART_4G_OBJECTIVES,
  SMART_4G_PROHIBITIONS,
  CALL_SAFE_MANTRA,
  CALL_SAFE_STEPS,
  CALL_SAFE_RULES,
  getMediumDisplayName,
  isWeakNetwork,
} from "../services/networkEngine";

interface NetworkManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  networkState: NetworkState;
  browsingMode: BrowsingMode;
  totalSavedBytes: number;
  lang: Language;
  onSetBrowsingMode: (mode: BrowsingMode) => void;
  onSetNetworkType: (type: NetworkType, medium?: NetworkMedium) => void;
  onRunSpeedTest: () => void;
  isTestingSpeed: boolean;
  transitions: NetworkTransitionEvent[];
  onSimulateTransition: (from: NetworkMedium, to: NetworkMedium, reason: string) => void;
  onControlledRecovery: () => void;
  pendingRequests: PendingNetworkRequest[];
  policy: NetworkEnginePolicy;
  onUpdatePolicy: (policy: Partial<NetworkEnginePolicy>) => void;
  onOpenPromiseModal?: () => void;
  initialTab?: "engine" | "smart4g" | "callsafe" | "transitions" | "modes" | "boundaries";
  smart4GState?: Smart4GPreferenceState;
  onSimulate4GDegradation?: () => void;
  onSimulateVoiceCall?: () => void;
  onTrigger4GRecovery?: () => void;
  onToggleAntiFlapping?: () => void;
  callSafeState?: CallSafeState;
  onSimulateCall?: (type: "incoming" | "outgoing") => void;
  onEndCall?: () => void;
}

export const NetworkManagerModal: React.FC<NetworkManagerModalProps> = ({
  isOpen,
  onClose,
  networkState,
  browsingMode,
  totalSavedBytes,
  lang,
  onSetBrowsingMode,
  onSetNetworkType,
  onRunSpeedTest,
  isTestingSpeed,
  transitions,
  onSimulateTransition,
  onControlledRecovery,
  pendingRequests,
  policy,
  onUpdatePolicy,
  onOpenPromiseModal,
  initialTab = "engine",
  smart4GState,
  onSimulate4GDegradation,
  onSimulateVoiceCall,
  onTrigger4GRecovery,
  onToggleAntiFlapping,
  callSafeState,
  onSimulateCall,
  onEndCall,
}) => {
  const [activeTab, setActiveTab] = useState<
    "engine" | "smart4g" | "callsafe" | "transitions" | "modes" | "boundaries"
  >(initialTab);

  if (!isOpen) return null;

  const t = translations[lang];
  const engine = t.networkEngine;
  const isWeak = isWeakNetwork(networkState);

  const modes: {
    id: BrowsingMode;
    title: string;
    description: string;
    savings: string;
    recommendedFor: string;
  }[] = [
    {
      id: "smart-compress",
      title: "Smart Compression (সুপারিশকৃত / Recommended)",
      description:
        "Filters intrusive trackers and ad frames while compressing HTML payloads. Balanced experience.",
      savings: "~60% Data Saved",
      recommendedFor: "General Daily Browsing & 3G/4G",
    },
    {
      id: "text-only",
      title: "Text-First (2G / দুর্বল ইন্টারনেট)",
      description:
        "Strips heavy images, video players, and JavaScript bundles. Delivers instant core information on weakest cellular edge networks.",
      savings: "~90% Data Saved",
      recommendedFor: "2G, Rural Areas & Weak Wi-Fi",
    },
    {
      id: "reader",
      title: "Distraction-Free Reader Mode",
      description:
        "Extracts clean article typography, strips banners, and presents high-contrast readable text.",
      savings: "~85% Data Saved",
      recommendedFor: "Articles, Books & Research",
    },
    {
      id: "full",
      title: "Full Web Fidelity",
      description:
        "Standard browsing without payload modifications. Consumes full original bandwidth.",
      savings: "0% Saved",
      recommendedFor: "Uncapped High-Speed Fiber",
    },
  ];

  return (
    <div
      id="network-manager-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div
        id="network-manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-manager-title"
        className="w-full max-w-3xl bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[92vh] text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="p-4 bg-stone-100 dark:bg-stone-850 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="network-manager-title"
                  className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100"
                >
                  {engine.title}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold uppercase tracking-wider">
                  Network-Aware
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {engine.subtitle}
              </p>
            </div>
          </div>
          <button
            id="btn-close-network-manager"
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 touch-manipulation cursor-pointer"
            aria-label={t.close || "Close"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          role="tablist"
          aria-label="Network Manager Tabs"
          className="flex items-center px-4 pt-2 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70 gap-1 overflow-x-auto scrollbar-none"
        >
          <button
            role="tab"
            aria-selected={activeTab === "engine"}
            type="button"
            onClick={() => setActiveTab("engine")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 shrink-0 border-b-2 ${
              activeTab === "engine"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-stone-900"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>লাইভ ইঞ্জিন ও পর্যবেক্ষণ</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "transitions"}
            type="button"
            onClick={() => setActiveTab("transitions")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 shrink-0 border-b-2 ${
              activeTab === "transitions"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-stone-900"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>স্টেট সংরক্ষণ ও ট্রানজিশন</span>
            {transitions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-full font-bold">
                {transitions.length}
              </span>
            )}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "smart4g"}
            type="button"
            onClick={() => setActiveTab("smart4g")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 shrink-0 border-b-2 ${
              activeTab === "smart4g"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-stone-900"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            <SignalHigh className="w-3.5 h-3.5" />
            <span>স্মার্ট ৪জি প্রেফারেন্স</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold uppercase">
              LTE
            </span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "callsafe"}
            type="button"
            onClick={() => setActiveTab("callsafe")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 shrink-0 border-b-2 ${
              activeTab === "callsafe"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-stone-900"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>কল-সেফ আর্কিটেকচার</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold uppercase">
              CALL-SAFE
            </span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "modes"}
            type="button"
            onClick={() => setActiveTab("modes")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 shrink-0 border-b-2 ${
              activeTab === "modes"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-stone-900"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>কম্প্রেশন ও ২জি মোড</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "boundaries"}
            type="button"
            onClick={() => setActiveTab("boundaries")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 shrink-0 border-b-2 ${
              activeTab === "boundaries"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-stone-900"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>সীমাবদ্ধতা ও অ্যান্ড্রয়েড রুলস</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {/* TAB 1: Engine Overview & Live Telemetry */}
          {activeTab === "engine" && (
            <div className="space-y-5">
              {/* Motto Banner */}
              <div className="p-3.5 rounded-xl bg-stone-900 text-emerald-300 border border-emerald-500/40 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-xs uppercase tracking-wider block text-white">
                      CORE ARCHITECTURAL DIRECTIVE
                    </span>
                    <p className="text-emerald-300 font-mono text-[11px] font-semibold">
                      {engine.motto}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded-lg font-bold uppercase shrink-0">
                  Android Validated
                </span>
              </div>

              {/* Live Connection Diagnostics Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Connection Medium */}
                <div className="p-3 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 text-center">
                  <div className="flex items-center justify-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 uppercase font-semibold mb-1">
                    {networkState.medium === "wifi" ? (
                      <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Signal className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>Active Medium</span>
                  </div>
                  <span className="text-sm font-bold text-stone-900 dark:text-stone-100 block truncate">
                    {getMediumDisplayName(networkState.medium, lang)}
                  </span>
                  <span className="text-[10px] text-stone-400 block pt-0.5">
                    {networkState.isMetered ? "Metered Mobile" : "Unmetered Link"}
                  </span>
                </div>

                {/* Availability & Health */}
                <div className="p-3 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 text-center">
                  <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-semibold block mb-1">
                    Internet Status
                  </span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        networkState.isOnline && networkState.internetAvailable
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-rose-500"
                      }`}
                    />
                    <span
                      className={`text-sm font-bold ${
                        networkState.isOnline && networkState.internetAvailable
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600"
                      }`}
                    >
                      {networkState.isOnline && networkState.internetAvailable
                        ? "Active & Validated"
                        : "Offline / Disconnected"}
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-400 block pt-0.5">
                    Verified HTTP Gateway
                  </span>
                </div>

                {/* Round Trip Time (RTT) */}
                <div className="p-3 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 text-center">
                  <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-semibold block mb-1">
                    Round-Trip Latency
                  </span>
                  <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {networkState.isOnline ? `${networkState.rttMs} ms` : "No Link"}
                  </span>
                  <span
                    className={`text-[10px] block pt-0.5 font-medium ${
                      networkState.rttMs > 400
                        ? "text-amber-600"
                        : networkState.rttMs > 100
                        ? "text-stone-500"
                        : "text-emerald-600"
                    }`}
                  >
                    {networkState.rttMs > 400
                      ? "High Latency (Weak)"
                      : networkState.rttMs > 100
                      ? "Moderate Latency"
                      : "Low Latency (Fast)"}
                  </span>
                </div>

                {/* Session Data Saved */}
                <div className="p-3 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-800 text-center">
                  <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-semibold block mb-1">
                    Total Data Saved
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatBytes(totalSavedBytes)}
                  </span>
                  <span className="text-[10px] text-stone-400 block pt-0.5">
                    Through Intelligent Compression
                  </span>
                </div>
              </div>

              {/* Weak Network Alert & Quick Action */}
              {isWeak && networkState.isOnline && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <strong className="text-amber-900 dark:text-amber-200 font-bold block">
                        দুর্বল নেটওয়ার্ক সনাক্ত হয়েছে ({getMediumDisplayName(networkState.medium, lang)})
                      </strong>
                      <span className="text-[11px] text-amber-800 dark:text-amber-300">
                        নেটওয়ার্ক ইঞ্জিন স্বয়ংক্রিয়ভাবে অপ্রয়োজনীয় মিডিয়া প্রিফেচ বন্ধ রেখেছে।
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetBrowsingMode("text-only")}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shrink-0 transition-colors"
                  >
                    টেক্সট-ফার্স্ট ২জি চালু করুন
                  </button>
                </div>
              )}

              {/* Measure Connection Latency Strip */}
              <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200 block text-xs">
                      সরাসরি লেটেন্সি ও পিং পরিমাপ করুন
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      ১ কিলোবাইটের হালকা প্যাকেটের মাধ্যমে প্রকৃত রাউন্ড-ট্রিপ (RTT) পরীক্ষা করে
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRunSpeedTest}
                  disabled={isTestingSpeed}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isTestingSpeed ? "animate-spin" : ""}`} />
                  <span>{isTestingSpeed ? "পরিমাপ হচ্ছে..." : "Test Latency (RTT)"}</span>
                </button>
              </div>

              {/* Network Medium Simulator & Profile Locker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-stone-900 dark:text-stone-100 block">
                    সচেতন নেটওয়ার্ক প্রোফাইল পর্যবেক্ষণ বা টেস্ট করুন:
                  </label>
                  <span className="text-[10px] text-stone-500">
                    {networkState.isSimulated ? "Simulated Test Mode" : "Live Device Telemetry"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  {[
                    { type: "auto", medium: "wifi", label: "Auto Detect", sub: "Android API" },
                    { type: "4g", medium: "wifi", label: "Wi-Fi", sub: "Unmetered" },
                    { type: "4g", medium: "cellular_4g", label: "Mobile 4G", sub: "LTE Metered" },
                    { type: "3g", medium: "cellular_3g", label: "Mobile 3G", sub: "HSPA Edge" },
                    { type: "2g", medium: "cellular_2g", label: "Mobile 2G", sub: "Weak Edge" },
                    { type: "offline", medium: "offline", label: "Offline", sub: "Disconnected" },
                  ].map((p) => {
                    const isSelected =
                      (p.type === "auto" && networkState.type === "auto") ||
                      (networkState.type === p.type && networkState.medium === p.medium);

                    return (
                      <button
                        key={`${p.type}-${p.medium}`}
                        type="button"
                        onClick={() => {
                          if (p.type === "auto") {
                            onSetNetworkType("auto");
                          } else {
                            onSetNetworkType(p.type as NetworkType, p.medium as NetworkMedium);
                          }
                        }}
                        className={`p-2 rounded-xl text-center transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300"
                        }`}
                      >
                        <span className="font-bold text-xs block">{p.label}</span>
                        <span
                          className={`text-[9px] block ${
                            isSelected ? "text-emerald-100" : "text-stone-400"
                          }`}
                        >
                          {p.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* The 5 Core Objectives of Network Engine */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                    {engine.fiveGoalsTitle}
                  </h3>
                  <span className="text-[10px] text-stone-400 font-mono">5 Core Objectives</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {engine.fiveGoals.map((goal) => (
                    <div
                      key={goal.num}
                      className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0">
                          {goal.num}
                        </span>
                        <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                          {goal.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400 pl-7 leading-relaxed">
                        {goal.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: State Preservation & Network Transitions */}
          {activeTab === "transitions" && (
            <div className="space-y-5">
              {/* Transition Explanation */}
              <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 space-y-1.5">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                    স্টেট প্রিজার্ভেশন ও নিরবচ্ছিন্ন হ্যান্ডওভার ইঞ্জিন
                  </h4>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  Wi-Fi থেকে Mobile Data-তে স্থানান্তর বা ক্ষণস্থায়ী সংযোগ বিচ্যুতির সময় NETFLOW
                  ব্যবহারকারীর ফর্মের ড্রাফট, টাইপ করা টেক্সট এবং স্ক্রোল অবস্থান সুরক্ষিত রাখে। সংযোগ
                  ফিরে এলে মডেমকে ট্র্যাফিক স্টর্ম না করে নিয়ন্ত্রিতভাবে রিকভারি করে।
                </p>
              </div>

              {/* Live Interactive Simulator Tools */}
              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-2.5">
                <span className="font-bold text-stone-900 dark:text-stone-100 text-xs block">
                  হ্যান্ডওভার ও রিকভারি টেস্ট টুলস (Test Live Transitions):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSimulateTransition(
                        "wifi",
                        "cellular_4g",
                        "Wi-Fi signal out of range -> Cellular 4G handover"
                      )
                    }
                    className="p-2.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-left hover:border-emerald-500 transition-all cursor-pointer space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-stone-900 dark:text-stone-100 text-xs">
                      <Wifi className="w-3.5 h-3.5 text-stone-500" />
                      <span>→</span>
                      <Signal className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Wi-Fi → 4G</span>
                    </div>
                    <p className="text-[10px] text-stone-500">
                      মিটারড ডেটা ডিটেকশন ও ড্রাফট সেভ
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onSimulateTransition(
                        "cellular_4g",
                        "offline",
                        "Sudden tunnel entry -> Connection Loss"
                      )
                    }
                    className="p-2.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-left hover:border-emerald-500 transition-all cursor-pointer space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-stone-900 dark:text-stone-100 text-xs">
                      <Signal className="w-3.5 h-3.5 text-stone-500" />
                      <span>→</span>
                      <WifiOff className="w-3.5 h-3.5 text-rose-600" />
                      <span>Loss of Connection</span>
                    </div>
                    <p className="text-[10px] text-stone-500">
                      স্টেট ফ্রিজ ও অফলাইন কিউ শিডিউল
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={onControlledRecovery}
                    className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-left transition-all cursor-pointer space-y-1 shadow-xs"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Controlled Recovery</span>
                    </div>
                    <p className="text-[10px] text-emerald-100">
                      নিয়ন্ত্রিত কিউ ড্রেইন ও সক্রিয় পেজ রিলোড
                    </p>
                  </button>
                </div>
              </div>

              {/* Policy Toggles */}
              <div className="space-y-2">
                <span className="font-bold text-stone-900 dark:text-stone-100 text-xs block">
                  নেটওয়ার্ক ইঞ্জিনের স্বশাসিত নীতিমালা (Adaptive Policies):
                </span>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-stone-900 dark:text-stone-100 block text-xs">
                        নেটওয়ার্ক রূপান্তরের সময় ফর্ম ও ইনপুট ড্রাফট স্বয়ংক্রিয় সংরক্ষণ
                      </span>
                      <span className="text-[11px] text-stone-500">
                        হ্যান্ডওভার বা কানেকশন ড্রপ হলেও কোনো টাইপ করা ডেটা হারাবে না
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={policy.preserveFormsOnTransition}
                      onChange={(e) =>
                        onUpdatePolicy({ preserveFormsOnTransition: e.target.checked })
                      }
                      className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500 accent-emerald-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-stone-900 dark:text-stone-100 block text-xs">
                        নিয়ন্ত্রিত রিকভারি কিউ (Controlled Recovery Queue)
                      </span>
                      <span className="text-[11px] text-stone-500">
                        কানেকশন ফিরে এলে মডেম ও সার্ভারকে স্টর্ম না করে অগ্রাধিকার অনুযায়ী রিকভারি
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={policy.controlledRecoveryQueue}
                      onChange={(e) =>
                        onUpdatePolicy({ controlledRecoveryQueue: e.target.checked })
                      }
                      className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500 accent-emerald-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 cursor-pointer">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-stone-900 dark:text-stone-100 block text-xs">
                        ২জি বা দুর্বল নেটওয়ার্কে ব্যাকগ্রাউন্ড অ্যাক্টিভিটি রোধ
                      </span>
                      <span className="text-[11px] text-stone-500">
                        অনর্থক ব্যাকগ্রাউন্ড পোলিং বা ভারী ডেটা সিঙ্ক তাৎক্ষণিক সাময়িক স্থগিত করা
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={policy.throttleBackgroundPollingOn2G}
                      onChange={(e) =>
                        onUpdatePolicy({ throttleBackgroundPollingOn2G: e.target.checked })
                      }
                      className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500 accent-emerald-600"
                    />
                  </label>
                </div>
              </div>

              {/* Transition History Log */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900 dark:text-stone-100 text-xs block">
                    সাম্প্রতিক নেটওয়ার্ক রূপান্তর লগ (Transition Audit Log):
                  </span>
                  <span className="text-[10px] text-stone-400">Real-time telemetry</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {transitions.map((tItem) => (
                    <div
                      key={tItem.id}
                      className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                          <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800">
                            {tItem.fromMedium}
                          </span>
                          <span>→</span>
                          <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
                            {tItem.toMedium}
                          </span>
                        </div>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {new Date(tItem.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400">{tItem.reason}</p>
                      {tItem.recoveryActionTaken && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <Check className="w-3 h-3" />
                          <span>{tItem.recoveryActionTaken}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Smart 4G Preference */}
          {activeTab === "smart4g" && (
            <div className="space-y-4">
              {/* Golden Mantra Banner */}
              <div
                id="smart-4g-mantra-banner"
                className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-stone-900 via-stone-900 to-emerald-950 text-white border border-emerald-500/40 shadow-sm space-y-2.5 relative overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    <SignalHigh className="w-4 h-4" />
                    <span>{t.smart4G.title}</span>
                  </div>
                  <span className="self-start sm:self-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    NETWORK-AWARE PREFERENCE
                  </span>
                </div>

                <div className="text-sm sm:text-base font-bold text-white leading-snug">
                  “{t.smart4G.mantra}”
                </div>

                <p className="text-[11px] text-stone-300 leading-relaxed">
                  {t.smart4G.description}
                </p>
              </div>

              {/* Live 4G Status & Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-medium">৪জি প্রিফারেন্স স্ট্যাটাস</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block mt-1">
                    {smart4GState?.voiceCallActive
                      ? t.smart4G.statusVoiceCall
                      : smart4GState?.degradationStatus === "degraded_signal"
                      ? t.smart4G.statusDegraded
                      : t.smart4G.statusOptimal}
                  </span>
                  <span className="text-[9px] text-stone-400">
                    {networkState.medium === "cellular_4g" ? "LTE High Link" : getMediumDisplayName(networkState.medium, lang)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-medium">অপ্রয়োজনীয় রিকানেক্ট রোধ</span>
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block mt-1">
                    {smart4GState?.unnecessaryReconnectsPrevented ?? 14} বার প্রতিহত
                  </span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400">Anti-Flapping সচল</span>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-medium">সংরক্ষিত সেশন ও ড্রাফট</span>
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block mt-1">
                    {smart4GState?.sessionsPreservedCount ?? 3} টি সেশন নিরাপদ
                  </span>
                  <span className="text-[9px] text-stone-400">০% ফর্ম ডেটা লস</span>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-medium">ভয়েস কল আচরণ</span>
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block mt-1">
                    {smart4GState?.voiceCallActive ? "In-Call Fallback" : "Standard Standby"}
                  </span>
                  <span className="text-[9px] text-stone-400">Carrier Compliant</span>
                </div>
              </div>

              {/* NETFLOW-এর ৪টি মূল লক্ষ্য */}
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-2.5">
                <div className="flex items-center gap-2 text-stone-900 dark:text-stone-100">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    {t.smart4G.objectivesTitle}
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {t.smart4G.objectives.map((obj, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-start gap-2 text-xs"
                    >
                      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-stone-700 dark:text-stone-300 leading-relaxed font-medium">
                        {obj}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* কিন্তু NETFLOW কখনো: (Strict Prohibitions) */}
              <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {t.smart4G.prohibitionsTitle}
                    </h4>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-semibold">
                    Strict Prohibitions
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {t.smart4G.prohibitions.map((prohib, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-rose-200/80 dark:border-rose-900/30 flex items-start gap-2 text-xs"
                    >
                      <span className="text-rose-600 font-bold shrink-0 mt-0.5">✕</span>
                      <span className="text-stone-800 dark:text-stone-200 font-medium">
                        {prohib}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voice Call Rule Note */}
              <div className="p-3.5 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 flex items-start gap-2.5 text-xs">
                <PhoneCall className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="text-stone-900 dark:text-stone-100 font-bold block">
                    {t.smart4G.voiceCallRuleTitle}
                  </strong>
                  <p className="text-stone-600 dark:text-stone-400 text-[11px] leading-relaxed">
                    {t.smart4G.voiceCallRule} VoLTE বা সার্কিট-সুইচড ফলব্যাক (CSFB)-এর সময় ক্যারিয়ার যে নেটওয়ার্ক নির্ধারণ করে, NETFLOW কোনো বাধা সৃষ্টি না করে ব্যাকগ্রাউন্ড ডেটা প্যাকেট স্বয়ংক্রিয়ভাবে নিয়ন্ত্রণ করে।
                  </p>
                </div>
              </div>

              {/* Interactive Simulation Workbench */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    ৪জি প্রিফারেন্স সিমুলেটর ও রিকভারি টুলস
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">Real Test Scenarios</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={onSimulate4GDegradation}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-amber-400 bg-white dark:bg-stone-900 text-left space-y-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        সিগন্যাল অস্থিরতা সিমুলেট
                      </span>
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      ৪জি ডিপ শনাক্তকরণ ও সেশন/ফর্ম ড্রাফট নিরাপদ ফ্রিজ
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={onSimulateVoiceCall}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-blue-400 bg-white dark:bg-stone-900 text-left space-y-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-700 dark:text-blue-400">
                        {smart4GState?.voiceCallActive ? "ভয়েস কল শেষ করুন" : "ভয়েস কল সিমুলেট"}
                      </span>
                      <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      ক্যারিয়ার ভয়েস কল ফলব্যাক ও অ্যান্ড্রয়েড রুলস মেনে চলা
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={onTrigger4GRecovery}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-emerald-400 bg-white dark:bg-stone-900 text-left space-y-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        নিয়ন্ত্রিত ৪জি রিকভারি
                      </span>
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      হাই-কোয়ালিটি ৪জি ফিরে এলে মসৃণ কিউ ড্রেইন ও পেজ ভ্যালিডেশন
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CALL-SAFE ARCHITECTURE */}
          {activeTab === "callsafe" && (
            <div id="callsafe-tab-content" className="space-y-4">
              {/* Golden Mantra Banner */}
              <div
                id="callsafe-mantra-banner"
                className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-stone-900 via-blue-950/80 to-slate-900 text-white border border-blue-500/40 shadow-sm space-y-2.5 relative overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                    <PhoneCall className="w-4 h-4" />
                    <span>{t.callSafe?.title || "NETFLOW — CALL-SAFE ARCHITECTURE"}</span>
                  </div>
                  <span className="self-start sm:self-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    CALL-SAFE VERIFIED
                  </span>
                </div>

                <div className="text-sm sm:text-base font-bold text-white leading-snug">
                  “{CALL_SAFE_MANTRA.quoteEn}”
                </div>

                <p className="text-[11px] text-stone-300 leading-relaxed">
                  {t.callSafe?.summary || CALL_SAFE_MANTRA.summaryBn}
                </p>
              </div>

              {/* Current Active Call State Banner */}
              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  {callSafeState?.currentPhase === "active_call" ||
                  callSafeState?.currentPhase === "incoming_call" ||
                  callSafeState?.currentPhase === "outgoing_call" ? (
                    <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
                  ) : callSafeState?.currentPhase === "rechecking_network" ? (
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shrink-0" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-stone-900 dark:text-stone-100 block">
                      {callSafeState?.currentPhase === "incoming_call"
                        ? "ইনকামিং কল ডিটেক্টেড (Incoming Call)"
                        : callSafeState?.currentPhase === "outgoing_call"
                        ? "আউটগোয়িং কল শুরু হয়েছে (Outgoing Call)"
                        : callSafeState?.currentPhase === "active_call"
                        ? "ভয়েস কল সক্রিয় (Voice Call Active • Telephony Priority)"
                        : callSafeState?.currentPhase === "rechecking_network"
                        ? "কল শেষ: নেটওয়ার্ক পুনঃপরীক্ষা চলছে (Rechecking Network...)"
                        : "ব্রাউজিং ও কল-সেফ গার্ড সক্রিয় (Standby)"}
                    </span>
                    <span className="text-[10px] text-stone-500 dark:text-stone-400">
                      {callSafeState?.currentPhase === "active_call"
                        ? "অ্যান্ড্রয়েড ও ক্যারিয়ার ভয়েস কল পরিচালনা করছে; ব্রাউজার বেসব্যান্ড হ্যান্ডওভার মেনে নিয়েছে"
                        : callSafeState?.currentPhase === "rechecking_network"
                        ? "কলের পরে লিংক কোয়ালিটি এবং অ্যাক্টিভ ডেটা বিয়ারার পরীক্ষা করা হচ্ছে"
                        : "কোনো কল বাধাগ্রস্ত হবে না • ফোর্সড LTE-only লক কঠোরভাবে নিষিদ্ধ"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                    Handled: {callSafeState?.callsHandledSuccessfully ?? 5} Calls
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                    Resumed: {callSafeState?.sessionsSafelyResumed ?? 5} Sessions
                  </span>
                </div>
              </div>

              {/* 6-Step Visual Lifecycle Diagram */}
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-3">
                <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-2">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    কল-সেফ লাইফসাইকেল আর্কিটেকচার (Lifecycle Sequence)
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                    6-Phase Pipeline
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {CALL_SAFE_STEPS.map((step) => {
                    const isStepActive =
                      (step.stepNumber === 1 && callSafeState?.currentPhase === "idle") ||
                      (step.stepNumber === 2 &&
                        (callSafeState?.currentPhase === "incoming_call" ||
                          callSafeState?.currentPhase === "outgoing_call")) ||
                      (step.stepNumber === 3 && callSafeState?.currentPhase === "active_call") ||
                      (step.stepNumber === 4 && callSafeState?.currentPhase === "rechecking_network") ||
                      (step.stepNumber === 5 && callSafeState?.currentPhase === "rechecking_network") ||
                      (step.stepNumber === 6 && callSafeState?.currentPhase === "resuming_browsing");

                    return (
                      <div
                        key={step.id}
                        className={`p-3 rounded-xl border transition-all text-left space-y-1.5 ${
                          isStepActive
                            ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 dark:border-blue-500 ring-1 ring-blue-400/30"
                            : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                            {step.stepNumber}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              isStepActive
                                ? "bg-blue-600 text-white"
                                : "bg-stone-100 dark:bg-stone-800 text-stone-500"
                            }`}
                          >
                            {step.badge}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-tight">
                          {lang === "bn" ? step.nameBn : step.nameEn}
                        </h4>
                        <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
                          {lang === "bn" ? step.descBn : step.descEn}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Core Rules (মূল নিয়ম) */}
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    {t.callSafe?.rulesTitle || "মূল নিয়ম ও সুরক্ষা নীতিমালা:"}
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  {CALL_SAFE_RULES.map((r) => (
                    <div
                      key={r.id}
                      className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 flex items-start gap-2"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100 block">
                          {lang === "bn" ? r.ruleBn : r.ruleEn}
                        </strong>
                        <span className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
                          {lang === "bn" ? r.detailBn : r.detailEn}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Call Simulation & Recovery Console */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    কল-সেফ সিমুলেশন ও রিকভারি টেস্টবেঞ্চ
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">Live Call Safety Verification</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onSimulateCall?.("incoming")}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-blue-400 bg-white dark:bg-stone-900 text-left space-y-1 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-700 dark:text-blue-400">
                        {t.callSafe?.simIncomingBtn || "ইনকামিং কল সিমুলেট"}
                      </span>
                      <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      ইনকামিং কল আসলে ব্রাউজার রেডিও অগ্রাধিকার ছেড়ে দেবে এবং সেশন ড্রাফট লক রাখবে
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSimulateCall?.("outgoing")}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-blue-400 bg-white dark:bg-stone-900 text-left space-y-1 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-700 dark:text-blue-400">
                        {t.callSafe?.simOutgoingBtn || "আউটগোয়িং কল সিমুলেট"}
                      </span>
                      <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      ব্যবহারকারী নম্বর ডায়াল করলেও ব্রাউজিং ব্যাকগ্রাউন্ডে নিরাপদে স্থগিত থাকবে
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={onEndCall}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-emerald-400 bg-white dark:bg-stone-900 text-left space-y-1 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {t.callSafe?.endCallBtn || "কল শেষ ও অটো-রিকভারি"}
                      </span>
                      <PhoneOff className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      কল সমাপ্ত হলে নেটওয়ার্ক রি-চেক এবং ব্রাউজিং সেশন স্বয়ংক্রিয় রিস্টোর
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Compression Modes & 2G Thrift */}
          {activeTab === "modes" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="font-semibold text-stone-900 dark:text-stone-100 block">
                  সক্রিয় ব্রাউজিং অপ্টিমাইজেশন মোড নির্বাচন করুন:
                </label>
                <div className="space-y-2">
                  {modes.map((m) => {
                    const isSelected = browsingMode === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => onSetBrowsingMode(m.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                          isSelected
                            ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-600 ring-1 ring-emerald-500/20"
                            : "bg-stone-50 dark:bg-stone-850 border-stone-200 dark:border-stone-800 hover:border-stone-300"
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-900 dark:text-stone-100">
                              {m.title}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                              {m.savings}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-600 dark:text-stone-400">
                            {m.description}
                          </p>
                          <span className="text-[10px] text-stone-400 block pt-0.5">
                            Ideal for: {m.recommendedFor}
                          </span>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? "bg-emerald-600 text-white"
                              : "border border-stone-300 dark:border-stone-600"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Architecture & Strict Boundaries */}
          {activeTab === "boundaries" && (
            <div className="space-y-5">
              {/* Highlight Motto Banner */}
              <div className="p-4 rounded-xl bg-stone-900 text-white border border-emerald-500/50 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    THE GUIDING PRINCIPLE & STRICT LIMITATIONS
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-emerald-300 font-mono">
                  “Network-aware browsing, not unauthorized network control.”
                </h3>
                <p className="text-[11px] text-stone-300 leading-relaxed">
                  NETFLOW ব্যবহারকারীর ডিভাইস ও অনুমোদিত সিস্টেম পলিসির সঙ্গে সংগতি রেখে কাজ করে।
                  ক্যারিয়ার এবং অ্যান্ড্রয়েডের হার্ডওয়্যার বা রেডিও সীমার বাইরে কোনো অননুমোদিত কাজ
                  করা সম্পূর্ণরূপে নিষিদ্ধ।
                </p>
              </div>

              {/* Strict Limitations List */}
              <div className="space-y-2">
                <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                  {engine.boundariesTitle}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {STRICT_NETWORK_BOUNDARIES.slice(0, 3).map((boundary, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                          {boundary.titleBn}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                        {boundary.descriptionBn}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Android Platform Rules & API Specifications Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                    Android Platform API Compliance Architecture
                  </h4>
                  <span className="text-[10px] text-stone-400">Standard Google Android APIs</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-100 dark:bg-stone-800/80 text-stone-600 dark:text-stone-400 font-semibold border-b border-stone-200 dark:border-stone-800">
                      <tr>
                        <th className="p-2.5">API / Platform Capability</th>
                        <th className="p-2.5">Network Purpose</th>
                        <th className="p-2.5">Compliance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                      {ANDROID_CAPABILITIES_SPECS.map((spec, i) => (
                        <tr key={i} className="hover:bg-stone-50/50 dark:hover:bg-stone-850/50">
                          <td className="p-2.5 font-mono text-[11px] font-bold text-stone-900 dark:text-stone-100">
                            {spec.api}
                          </td>
                          <td className="p-2.5 text-[11px] text-stone-600 dark:text-stone-400">
                            {spec.purpose}
                          </td>
                          <td className="p-2.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <Check className="w-3 h-3" />
                              {spec.complianceLevel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Link to The NETFLOW Promise */}
              {onOpenPromiseModal && (
                <div className="p-3.5 rounded-xl bg-stone-100 dark:bg-stone-850 border border-stone-200 dark:border-stone-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">
                      NETFLOW প্রমিজ ও ৪টি লাইভ পরিমাপ পরীক্ষা দেখুন
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPromiseModal();
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                  >
                    প্রমিজ ও মূল্যবোধ →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
