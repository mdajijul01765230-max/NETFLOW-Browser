import {
  NetworkMedium,
  NetworkState,
  NetworkTransitionEvent,
  PendingNetworkRequest,
  PreservedFormState,
  NetworkEnginePolicy,
} from "../types";

export const DEFAULT_NETWORK_POLICY: NetworkEnginePolicy = {
  autoAdaptToWeakNetwork: true,
  preserveFormsOnTransition: true,
  controlledRecoveryQueue: true,
  throttleBackgroundPollingOn2G: true,
  notifyOnNetworkHandover: true,
};

export const INITIAL_NETWORK_STATE: NetworkState = {
  type: "auto",
  medium: "wifi",
  effectiveType: "4g",
  downlinkMbps: 12.5,
  rttMs: 38,
  isOnline: true,
  isSimulated: false,
  isMetered: false,
  saveDataEnabled: false,
  internetAvailable: true,
  signalStrengthPercent: 92,
};

export const SAMPLE_TRANSITIONS: NetworkTransitionEvent[] = [
  {
    id: "trans-1",
    timestamp: Date.now() - 1000 * 60 * 18,
    fromMedium: "wifi",
    toMedium: "cellular_4g",
    reason: "Wi-Fi out of range handover -> Switched to 4G LTE Mobile Data",
    statePreserved: true,
    recoveryActionTaken: "Form drafts preserved • Preloading paused for metered billing",
  },
  {
    id: "trans-2",
    timestamp: Date.now() - 1000 * 60 * 7,
    fromMedium: "cellular_4g",
    toMedium: "cellular_2g",
    reason: "Signal dropped into rural Edge 2G zone",
    statePreserved: true,
    recoveryActionTaken: "Auto-tuned mode to Text-First • Blocked high-res media prefetch",
  },
  {
    id: "trans-3",
    timestamp: Date.now() - 1000 * 60 * 2,
    fromMedium: "cellular_2g",
    toMedium: "wifi",
    reason: "High-speed Wi-Fi reconnected",
    statePreserved: true,
    recoveryActionTaken: "Controlled queue drain (1 active tab revalidated, 0 modem storm)",
  },
];

// Android Platform Architecture Specifications
export interface AndroidNetworkCapabilitySpec {
  api: string;
  purpose: string;
  complianceLevel: "Compliant" | "Strict Android Rules Followed";
  notes: string;
}

export const ANDROID_CAPABILITIES_SPECS: AndroidNetworkCapabilitySpec[] = [
  {
    api: "ConnectivityManager.NetworkCallback",
    purpose: "Observes onAvailable, onLost, and onCapabilitiesChanged for Wi-Fi and Mobile Data",
    complianceLevel: "Compliant",
    notes: "Monitors platform transport transitions without requesting root or private capabilities.",
  },
  {
    api: "NetworkCapabilities.NET_CAPABILITY_NOT_METERED",
    purpose: "Detects metered cellular connections to pause heavy preloads & respect user mobile data",
    complianceLevel: "Compliant",
    notes: "Protects user's cellular balance by detecting metered data channels honestly.",
  },
  {
    api: "NetworkCapabilities.NET_CAPABILITY_VALIDATED",
    purpose: "Verifies true internet availability vs captive portal / local Wi-Fi without internet",
    complianceLevel: "Compliant",
    notes: "Prevents false-positive connection alerts when Wi-Fi is connected but upstream ISP is dead.",
  },
  {
    api: "TelephonyManager (READ_PHONE_STATE / NetworkType)",
    purpose: "Passive read-only query of mobile radio generation (LTE 4G, UMTS 3G, GSM/EDGE 2G)",
    complianceLevel: "Strict Android Rules Followed",
    notes: "Passive telemetry only. Strictly zero radio frequency, modem baseband, or antenna manipulation.",
  },
];

// Boundaries and Strict Restrictions
export const STRICT_NETWORK_BOUNDARIES = [
  {
    title: "No Modem or Baseband Override",
    titleBn: "কোনো মডেম বা বেইসব্যান্ড ওভাররাইড নয়",
    description:
      "NETFLOW never touches cellular baseband firmware, never alters RF frequencies, and never overrides hardware modem sleep states.",
    descriptionBn:
      "NETFLOW সেলুলার মডেম ফার্মওয়্যার পরিবর্তন করে না, রেডিও ফ্রিকোয়েন্সি বদলাতে পারে না এবং হার্ডওয়্যারের বাইরে কোনো জোরজবরদস্তি করে না।",
  },
  {
    title: "No Unauthorized Network Manipulation",
    titleBn: "কোনো অননুমোদিত নেটওয়ার্ক ম্যানিপুলেশন নয়",
    description:
      "No carrier APN tampering, no proxy bypassing, no spoofing packet headers to evade data charges or ISP traffic shaping.",
    descriptionBn:
      "কোনো ক্যারিয়ার APN পরিবর্তন, বাইপাসিং বা স্পুফিং করা হয় না। সমস্ত ডেটা বৈধ এইচটিটিপিএস ও ওয়েব স্ট্যান্ডার্ড মেনে প্রবাহিত হয়।",
  },
  {
    title: "Platform Permission & Rules Compliance",
    titleBn: "অ্যান্ড্রয়েড প্ল্যাটফর্ম পারমিশন ও বিধিমালার পূর্ণ অনুসরণ",
    description:
      "NETFLOW adheres strictly to official Android ConnectivityManager and W3C Network Information APIs.",
    descriptionBn:
      "যেখানে সিস্টেম-লেভেল পারমিশন দরকার, সেখানে অ্যান্ড্রয়েডের অফিসিয়াল এপিআই এবং নীতিমালার শতভাগ সম্মান করা হয়।",
  },
  {
    title: "The Guiding Principle",
    titleBn: "মূল নীতি",
    description: "“Network-aware browsing, not unauthorized network control.”",
    descriptionBn: "“Network-aware browsing, not unauthorized network control (নেটওয়ার্ক সচেতন ব্রাউজিং, অননুমোদিত নেটওয়ার্ক নিয়ন্ত্রণ নয়)।”",
  },
];

/**
 * Format medium name into user-friendly label
 */
export function getMediumDisplayName(medium: NetworkMedium, lang: "bn" | "en" = "bn"): string {
  switch (medium) {
    case "wifi":
      return lang === "bn" ? "ওয়াই-ফাই (Wi-Fi)" : "Wi-Fi Connection";
    case "cellular_5g":
      return lang === "bn" ? "মোবাইল ডেটা (5G Ultra)" : "Mobile Data (5G)";
    case "cellular_4g":
      return lang === "bn" ? "মোবাইল ডেটা (LTE/4G)" : "Mobile Data (LTE/4G)";
    case "cellular_3g":
      return lang === "bn" ? "মোবাইল ডেটা (3G HSPA)" : "Mobile Data (3G)";
    case "cellular_2g":
      return lang === "bn" ? "মোবাইল ডেটা (2G Edge)" : "Mobile Data (2G Edge)";
    case "offline":
      return lang === "bn" ? "অফলাইন (কোনো সংযোগ নেই)" : "Offline (Disconnected)";
  }
}

/**
 * NETFLOW — SMART 4G PREFERENCE
 * 
 * "AVAILABLE NETWORK-এর সর্বোত্তম ব্যবহার করার চেষ্টা করা।
 * UNAVAILABLE NETWORK-কে জোর করে তৈরি করা নয়।"
 */

export const SMART_4G_MANTRA = {
  primaryBn: "AVAILABLE NETWORK-এর সর্বোত্তম ব্যবহার করার চেষ্টা করা। UNAVAILABLE NETWORK-কে জোর করে তৈরি করা নয়।",
  primaryEn: "Make the best possible use of the AVAILABLE NETWORK. Never forcefully fabricate an UNAVAILABLE NETWORK.",
  subBn: "যেখানে Android device, modem, SIM, carrier এবং network বাস্তবে LTE/4G ব্যবহার করার সুযোগ দেয়, NETFLOW-এর architecture network degradation ও unnecessary reconnect behavior কমানোর চেষ্টা করবে।",
  subEn: "Where the Android device, modem, SIM, carrier, and network actually permit LTE/4G usage, NETFLOW's architecture works to mitigate degradation and prevent unnecessary reconnect loops.",
};

export interface Smart4GObjective {
  id: string;
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  descriptionEn: string;
  iconName: string;
}

export const SMART_4G_OBJECTIVES: Smart4GObjective[] = [
  {
    id: "obj-preference",
    titleBn: "উচ্চমানের সংযোগ প্রেফারেন্স",
    titleEn: "Maintain Available High-Quality Preference",
    descriptionBn: "Available high-quality mobile connection (LTE/4G)-এর প্রতি preference বজায় রাখতে সাহায্য করা এবং modem thrashing ও অপ্রয়োজনীয় সংযোগ ওঠানামা প্রতিরোধ করা।",
    descriptionEn: "Help maintain preference toward available high-quality mobile connections (LTE/4G) while preventing modem thrashing and connection flapping.",
    iconName: "SignalHigh",
  },
  {
    id: "obj-transition",
    titleBn: "নেটওয়ার্ক ট্রানজিশন শনাক্তকরণ",
    titleEn: "Network Transition Detection",
    descriptionBn: "Wi-Fi থেকে সেলুলার 4G বা 4G থেকে 3G/2G ট্রানজিশন তাত্ক্ষণিকভাবে শনাক্ত করে ব্রাউজিং ইঞ্জিনকে সজাগ রাখা।",
    descriptionEn: "Instantly detect network handovers (e.g. Wi-Fi to 4G, or 4G to 3G/2G) to prepare browser pipeline states.",
    iconName: "ArrowRightLeft",
  },
  {
    id: "obj-preservation",
    titleBn: "অস্থিরতায় সেশন ও ড্রাফট সংরক্ষণ",
    titleEn: "Browsing Session Preservation on Instability",
    descriptionBn: "Connection instability বা সিগন্যাল ডিগ্রেড হলে ফর্মের ড্রাফট, স্ক্রোল পজিশন ও সক্রিয় সেশন অক্ষত রাখা।",
    descriptionEn: "Preserve form drafts, input fields, and scroll positions whenever connection instability or degradation occurs.",
    iconName: "ShieldAlert",
  },
  {
    id: "obj-recovery",
    titleBn: "নিয়ন্ত্রিত ও শান্ত রিকভারি",
    titleEn: "Controlled Network Recovery",
    descriptionBn: "উচ্চমানের 4G কানেকশন ফিরে এলে মডেম স্টর্ম রোধ করে নিয়ন্ত্রিত পেসিংয়ে রিকোয়েস্ট রিকভার করা।",
    descriptionEn: "Execute paced, orderly request queue recovery when high-quality 4G returns, without overwhelming the device modem.",
    iconName: "RefreshCw",
  },
];

export interface Smart4GProhibition {
  id: string;
  titleBn: string;
  titleEn: string;
  detailBn: string;
  detailEn: string;
}

export const SMART_4G_PROHIBITIONS: Smart4GProhibition[] = [
  {
    id: "prohib-carrier",
    titleBn: "Carrier Restriction Bypass করবে না",
    titleEn: "Never Bypass Carrier Restrictions",
    detailBn: "ক্যারিয়ারের থ্রোটলিং, পলিসি বা ডেটা প্ল্যান লিমিটকে অবৈধ বা কৃত্রিম উপায়ে বাইপাস করার কোনো প্রচেষ্টা নেই।",
    detailEn: "Zero attempts to circumvent carrier data policies, traffic management rules, or plan-level restrictions.",
  },
  {
    id: "prohib-radio",
    titleBn: "অননুমোদিত Radio/Band Control করবে না",
    titleEn: "No Unauthorized Radio/Band Control",
    detailBn: "বেসব্যান্ড বা মডেম ফার্মওয়্যার হ্যাক করে ফ্রিকোয়েন্সি বা রেডিও জোরপূর্বক লক করার কোনো কোড নেই।",
    detailEn: "No baseband or modem hacking, unauthorized frequency locking, or unprivileged AT commands.",
  },
  {
    id: "prohib-system",
    titleBn: "System Restriction ভাঙবে না",
    titleEn: "No System Restriction Breaches",
    detailBn: "Android OS এবং প্ল্যাটফর্মের সিকিউরিটি স্যান্ডবক্স ও পারমিশন ফ্রেমওয়ার্কের ভেতরেই সব কাজ সম্পন্ন হয়।",
    detailEn: "Strictly operates within Android OS permissions and carrier compliance rules without root exploits.",
  },
  {
    id: "prohib-speedclaim",
    titleBn: "2G-কে 4G বানানোর ভুয়া দাবি নয়",
    titleEn: "No Fake 2G to 4G Speed Claims",
    detailBn: "সফটওয়্যার দিয়ে সত্যিকারের 2G সংযোগকে কোনো জাদুকরী 4G গতিতে রূপান্তরের মিথ্যা দাবি NETFLOW কখনো করবে না।",
    detailEn: "NETFLOW will never falsely claim that software can turn an actual 2G link into real 4G speeds.",
  },
  {
    id: "prohib-voicecall",
    titleBn: "ভয়েস কলের সময় ক্যারিয়ার নিয়ম মেনে চলা",
    titleEn: "Voice Call Behavior Adheres to Carrier Rules",
    detailBn: "ভয়েস কলের সময় (VoLTE বা CSFB 2G/3G ফলব্যাক) নেটওয়ার্কের আচরণ সম্পূর্ণভাবে Android ও ক্যারিয়ারের নিয়ম অনুযায়ী চলবে।",
    detailEn: "During active voice calls (VoLTE or CSFB fallback), network behavior strictly defers to Android and carrier rules.",
  },
];

/**
 * Check if the current network tier is weak
 */
export function isWeakNetwork(networkState: NetworkState): boolean {
  if (!networkState.isOnline) return true;
  if (networkState.medium === "cellular_2g" || networkState.type === "2g") return true;
  if (networkState.rttMs > 450) return true;
  if (networkState.downlinkMbps > 0 && networkState.downlinkMbps < 0.4) return true;
  return false;
}

/**
 * NETFLOW — CALL-SAFE ARCHITECTURE
 * 
 * "NETFLOW browsing-এর সময় phone-এর normal calling capability নষ্ট করবে না।"
 * 
 * Architecture:
 * BROWSING
 * ↓
 * INCOMING / OUTGOING CALL
 * ↓
 * ANDROID + CARRIER NORMAL CALL HANDLING
 * ↓
 * CALL ENDS
 * ↓
 * NETFLOW RECHECKS NETWORK
 * ↓
 * BROWSING RECOVERY
 * 
 * Goal: "Browse efficiently when possible, communicate normally when needed."
 */

export const CALL_SAFE_MANTRA = {
  quoteEn: "Browse efficiently when possible, communicate normally when needed.",
  quoteBn: "সুযোগে কার্যকর ব্রাউজিং, প্রয়োজনে স্বাভাবিক যোগাযোগ।",
  summaryEn: "NETFLOW will never impair the phone's normal calling capability during browsing.",
  summaryBn: "NETFLOW ব্রাউজিং চলাকালীন ফোনের স্বাভাবিক কল করার ও রিসিভ করার ক্ষমতা কোনোভাবেই নষ্ট করবে না।",
};

export interface CallSafeStep {
  id: string;
  stepNumber: number;
  nameBn: string;
  nameEn: string;
  descBn: string;
  descEn: string;
  badge: string;
}

export const CALL_SAFE_STEPS: CallSafeStep[] = [
  {
    id: "step-browsing",
    stepNumber: 1,
    nameBn: "BROWSING (ব্রাউজিং সেশন)",
    nameEn: "BROWSING (Active Session)",
    descBn: "ব্যবহারকারী সক্রিয়ভাবে ওয়েব ব্রাউজ করছেন, ডেটা স্ট্রীম সক্রিয় এবং ব্যাকগ্রাউন্ড কিউ স্বাভাবিক গতিতে চলছে।",
    descEn: "User is actively browsing, sockets are open, data savings and request caching are operating.",
    badge: "Active Link",
  },
  {
    id: "step-call-trigger",
    stepNumber: 2,
    nameBn: "INCOMING / OUTGOING CALL (ইনকামিং বা আউটগোয়িং কল)",
    nameEn: "INCOMING / OUTGOING CALL",
    descBn: "ফোনে ইনকামিং কল এলো বা ব্যবহারকারী নিজে ডায়াল করলেন; ব্রাউজার তাত্ক্ষণিকভাবে রেডিও রিসোর্সের শীর্ষ অগ্রাধিকার ভয়েস কলকে ছেড়ে দেয়।",
    descEn: "Call signal detected; browser pipeline immediately yields radio baseband priority to native voice telephony.",
    badge: "Telephony Priority",
  },
  {
    id: "step-android-handling",
    stepNumber: 3,
    nameBn: "ANDROID + CARRIER NORMAL CALL HANDLING",
    nameEn: "ANDROID + CARRIER NORMAL CALL HANDLING",
    descBn: "VoLTE অথবা 2G/3G CSFB (সার্কিট-সুইচড ফলব্যাক) যাই হোক না কেন, Android ও মোবাইল অপারেটর সম্পূর্ণ নিজস্ব স্বাভাবিক নিয়মে কল পরিচালনা করবে। কোনো বেসব্যান্ড লক থাকবে না।",
    descEn: "Whether VoLTE or CSFB fallback, Android telephony stack and the cellular carrier handle voice routing natively without interference.",
    badge: "Native Control",
  },
  {
    id: "step-call-ends",
    stepNumber: 4,
    nameBn: "CALL ENDS (কল শেষ)",
    nameEn: "CALL ENDS",
    descBn: "ভয়েস কল সমাপ্ত হলো এবং রেডিও রিসোর্স আবার ডেটা ট্র্যাফিকের জন্য উন্মুক্ত হলো।",
    descEn: "Call terminates; telephony stack releases voice frequency allocation back to packet data service.",
    badge: "Radio Released",
  },
  {
    id: "step-recheck",
    stepNumber: 5,
    nameBn: "NETFLOW RECHECKS NETWORK (নেটওয়ার্ক পুনঃপরীক্ষা)",
    nameEn: "NETFLOW RECHECKS NETWORK",
    descBn: "NETFLOW তাৎক্ষণিকভাবে বর্তমান নেটওয়ার্কের স্টেট, আরটিটি ল্যাটেন্সি ও মিডিয়াম (4G LTE / 3G / Wi-Fi) নতুন করে মেপে নেয়।",
    descEn: "NETFLOW re-evaluates carrier link condition, latency RTT, and current bearer medium without causing reconnect thrashing.",
    badge: "State Probing",
  },
  {
    id: "step-recovery",
    stepNumber: 6,
    nameBn: "BROWSING RECOVERY (ব্রাউজিং রিকভারি)",
    nameEn: "BROWSING RECOVERY",
    descBn: "ডেটা কানেকশন ফিরে আসার সাথে সাথে সংরক্ষিত ফর্মের ড্রাফট, স্ক্রোল পজিশন ও সক্রিয় সেশন স্বাচ্ছন্দ্যে স্বয়ংক্রিয়ভাবে রিকভার হয়।",
    descEn: "Preserved form drafts, scroll states, and pending web requests automatically and safely resume without page refreshes.",
    badge: "Smooth Resume",
  },
];

export interface CallSafeRule {
  id: string;
  ruleBn: string;
  ruleEn: string;
  detailBn: string;
  detailEn: string;
}

export const CALL_SAFE_RULES: CallSafeRule[] = [
  {
    id: "rule-respect-behavior",
    ruleBn: "Voice call-এর জন্য Android ও carrier-এর স্বাভাবিক behavior সম্মান করতে হবে",
    ruleEn: "Respect Android and carrier normal voice call behavior",
    detailBn: "টেলিফোনি স্ট্যাক এবং ক্যারিয়ারের কল হ্যান্ডলিংয়ে ব্রাউজার কোনো বাধা তৈরি করবে না।",
    detailEn: "Browser never intercepts or overrides Android telephony APIs or cellular baseband signaling.",
  },
  {
    id: "rule-no-forced-lte",
    ruleBn: "NETFLOW কোনো unauthorized forced LTE-only mode ব্যবহার করবে না",
    ruleEn: "Zero unauthorized forced LTE-only modes",
    detailBn: "অনেক এলাকায় 4G-তে ভয়েস কল (VoLTE) সাপোর্ট না থাকলে ফোনকে 2G/3G CSFB-তে ড্রপ করতে হয়। জোরপূর্বক LTE-only লক করলে ফোন কল আসা বা যাওয়া বন্ধ হয়ে যেতো—তাই NETFLOW এটি কঠোরভাবে বর্জন করে।",
    detailEn: "Forcing LTE-only drops voice calls on non-VoLTE carriers. NETFLOW strictly rejects dangerous forced LTE locking.",
  },
  {
    id: "rule-recheck-after-call",
    ruleBn: "Call শেষ হওয়ার পর network state পুনরায় পরীক্ষা করা হবে",
    ruleEn: "Recheck network state once call terminates",
    detailBn: "কল চলাকালীন ক্যারিয়ার ব্যান্ড পরিবর্তন হতে পারে; কল শেষ হলে নতুন করে অ্যাক্টিভ মিডিয়াম পরীক্ষা করা হবে।",
    detailEn: "Proactively evaluates link capabilities post-call to calibrate compression and queue dispatching.",
  },
  {
    id: "rule-auto-resume",
    ruleBn: "Data connection ফিরে এলে browsing session যতটা সম্ভব automatically resume করা হবে",
    ruleEn: "Automatically resume browsing session as data returns",
    detailBn: "ব্যবহারকারীকে আবার পুরো পেজ টাইপ বা লোড করতে হবে না, ফর্মের ড্রাফট ও কিউ স্মুথলি রি-ওপেন হবে।",
    detailEn: "Preserves form inputs, scroll offsets, and paused streams for seamless continuation.",
  },
  {
    id: "rule-zero-conflict",
    ruleBn: "User-এর call functionality-এর সঙ্গে browser feature-এর সংঘাত তৈরি করা যাবে না",
    ruleEn: "Zero conflict between browser features and call functionality",
    detailBn: "কখনোই ব্রাউজারের কোনো ফিচারের কারণে ব্যবহারকারীর জরুরি ফোন কল মিস হতে দেওয়া যাবে না।",
    detailEn: "Critical voice calls always hold absolute device priority over background web operations.",
  },
];
