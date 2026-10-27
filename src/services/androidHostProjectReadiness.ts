/**
 * NETFLOW Browser V2 — Android Host Project Readiness & Boundary Contracts
 *
 * Form: NETFLOW-V2-NATIVE-06
 *
 * This module defines the minimal, repository-native boundary contracts and readiness
 * specifications required to embed the NETFLOW Chromium WebView architecture inside
 * a real Android Host layer (e.g. Android Studio / Gradle project).
 *
 * Rules:
 * 1. Preserves NATIVE-01..05 and Forms 34-39 completely intact without modification or duplication.
 * 2. Truthfully inspects toolchain availability without generating fake APKs, fake Gradle wrappers, or fake Manifests.
 * 3. Formalizes the embedding interface (Host Activity -> WebView Container -> Lifecycle & Security Pipelines).
 */

import { DEFAULT_ANDROID_WEBVIEW_SETTINGS } from "./androidWebViewFoundation";
import { AndroidHostActivityState } from "./androidHostShell";
import { NETFLOW_ANDROID_MANIFEST_POLICY } from "./androidSecurityPolicy";

/**
 * Specification for the real Android Host Activity embedding contract
 */
export interface AndroidHostEmbedContract {
  packageName: string;
  activityName: string;
  webViewContainerId: string;
  webAppAssetPath: string;
  minSdkVersion: number;
  targetSdkVersion: number;
  initialActivityState: AndroidHostActivityState;
  enforceCleartextTrafficBlocked: boolean;
  enforceFileAccessBlocked: boolean;
  enforceContentAccessBlocked: boolean;
  enforceMixedContentBlocked: boolean;
  enforceFileAccessFromFileURLsBlocked: boolean;
}

/**
 * Specification for toolchain readiness assessment
 */
export interface AndroidToolchainReadiness {
  hasJdk: boolean;
  hasGradle: boolean;
  hasAndroidSdk: boolean;
  hasRealAndroidProject: boolean;
  toolchainStatus: "AVAILABLE" | "NOT_AVAILABLE";
  reason: string;
}

/**
 * Default production-grade Android Host embedding contract
 */
export const DEFAULT_ANDROID_HOST_EMBED_CONTRACT: AndroidHostEmbedContract = {
  packageName: NETFLOW_ANDROID_MANIFEST_POLICY.packageName,
  activityName: "MainActivity",
  webViewContainerId: "netflow_webview_container",
  webAppAssetPath: "file:///android_asset/dist/index.html",
  minSdkVersion: NETFLOW_ANDROID_MANIFEST_POLICY.minSdkVersion,
  targetSdkVersion: NETFLOW_ANDROID_MANIFEST_POLICY.targetSdkVersion,
  initialActivityState: AndroidHostActivityState.CREATED,
  enforceCleartextTrafficBlocked: !NETFLOW_ANDROID_MANIFEST_POLICY.usesCleartextTraffic,
  enforceFileAccessBlocked: !DEFAULT_ANDROID_WEBVIEW_SETTINGS.allowFileAccess,
  enforceContentAccessBlocked: !DEFAULT_ANDROID_WEBVIEW_SETTINGS.allowContentAccess,
  enforceMixedContentBlocked: DEFAULT_ANDROID_WEBVIEW_SETTINGS.mixedContentMode === "MIXED_CONTENT_NEVER_ALLOW",
  enforceFileAccessFromFileURLsBlocked: !DEFAULT_ANDROID_WEBVIEW_SETTINGS.allowFileAccessFromFileURLs,
};

/**
 * Evaluates the readiness of the Android Host Embedding Contract
 */
export function evaluateAndroidHostEmbedContract(
  contract: AndroidHostEmbedContract = DEFAULT_ANDROID_HOST_EMBED_CONTRACT
): {
  isContractValid: boolean;
  securityInvariantsPassed: boolean;
  status: "READY" | "INVALID";
} {
  const securityInvariantsPassed =
    contract.enforceCleartextTrafficBlocked &&
    contract.enforceFileAccessBlocked &&
    contract.enforceContentAccessBlocked &&
    contract.enforceMixedContentBlocked &&
    contract.enforceFileAccessFromFileURLsBlocked &&
    contract.minSdkVersion >= 26;

  const isContractValid =
    Boolean(contract.packageName) &&
    Boolean(contract.activityName) &&
    Boolean(contract.webViewContainerId) &&
    securityInvariantsPassed;

  return {
    isContractValid,
    securityInvariantsPassed,
    status: isContractValid ? "READY" : "INVALID",
  };
}

/**
 * Evaluates real Android toolchain availability in the current container environment
 */
export function evaluateAndroidToolchainReadiness(envCheck?: Partial<AndroidToolchainReadiness>): AndroidToolchainReadiness {
  const hasJdk = envCheck?.hasJdk ?? false;
  const hasGradle = envCheck?.hasGradle ?? false;
  const hasAndroidSdk = envCheck?.hasAndroidSdk ?? false;
  const hasRealAndroidProject = envCheck?.hasRealAndroidProject ?? false;

  const isAvailable = hasJdk && hasGradle && hasAndroidSdk && hasRealAndroidProject;

  return {
    hasJdk,
    hasGradle,
    hasAndroidSdk,
    hasRealAndroidProject,
    toolchainStatus: isAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
    reason: isAvailable
      ? "Real Android SDK, Gradle, and JDK toolchains are present."
      : "Android SDK/Gradle/JDK unavailable in web container environment.",
  };
}
