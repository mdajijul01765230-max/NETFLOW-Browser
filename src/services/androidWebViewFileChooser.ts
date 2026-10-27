/**
 * NETFLOW Browser V2 — Android WebView File Upload & File Chooser Boundary
 *
 * Form: NETFLOW-V2-NATIVE-10
 *
 * This module establishes the secure Android WebView File Chooser layer,
 * handling:
 * 1. WebChromeClient.onShowFileChooser contract
 * 2. Single & Multiple file selection modes (MODE_OPEN, MODE_OPEN_MULTIPLE)
 * 3. MIME type & extension filtering (e.g. "image/*", "application/pdf", ".png")
 * 4. User cancellation handling (resolving null callback safely)
 * 5. Requesting tab / WebView isolation (strict per-tab session tokens)
 * 6. File path sanitization & traversal prevention (blocking ../, root paths, private dirs)
 * 7. NATIVE-05 Permission compliance (gating camera capture behind explicit consent)
 * 8. Zero interference with navigation, history stacks, or Form-39 download logic.
 */

import { evaluateRuntimePermissionRequest } from "./androidSecurityPolicy";

export enum AndroidFileChooserMode {
  MODE_OPEN = "MODE_OPEN",
  MODE_OPEN_MULTIPLE = "MODE_OPEN_MULTIPLE",
  MODE_SAVE = "MODE_SAVE",
}

export interface AndroidFileChooserParams {
  mode: AndroidFileChooserMode;
  acceptTypes: string[];
  isCaptureEnabled: boolean;
  title?: string;
  filenameHint?: string;
}

export interface AndroidSelectedFile {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  virtualUri: string;
}

export interface AndroidFileChooserSession {
  tabId: string;
  requestId: string;
  params: AndroidFileChooserParams;
  createdAt: number;
  resolved: boolean;
}

export interface AndroidFileChooserResult {
  success: boolean;
  cancelled: boolean;
  files: AndroidSelectedFile[];
  error?: string;
}

/**
 * Sanitizes a file name to prevent path traversal, null-byte injection, and private folder leakage.
 */
export function sanitizeUploadedFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") {
    return "unnamed_upload";
  }

  // Strip path traversal sequences and separators
  let clean = fileName
    .replace(/[\/\\]/g, "_")
    .replace(/\.\.+/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();

  if (!clean || clean === "." || clean.startsWith(".")) {
    clean = "safe_file_" + Date.now();
  }

  return clean.slice(0, 255);
}

/**
 * Validates whether a file's MIME type or extension matches the accept parameter list.
 */
export function matchesMimeOrExtension(fileType: string, fileName: string, acceptTypes: string[]): boolean {
  if (!acceptTypes || acceptTypes.length === 0 || acceptTypes.includes("*/*") || acceptTypes.includes("*")) {
    return true;
  }

  const normalizedType = (fileType || "application/octet-stream").toLowerCase().trim();
  const lowerName = fileName.toLowerCase();

  return acceptTypes.some((pattern) => {
    const p = pattern.toLowerCase().trim();
    if (!p) return false;

    // Extension match (e.g. ".png", ".pdf")
    if (p.startsWith(".")) {
      return lowerName.endsWith(p);
    }

    // Wildcard MIME match (e.g. "image/*")
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1); // e.g. "image/"
      return normalizedType.startsWith(prefix);
    }

    // Exact MIME match
    return normalizedType === p;
  });
}

/**
 * Android WebView File Chooser Manager
 */
export interface AndroidWebViewFileChooserManager {
  tabId: string;
  activeSession: AndroidFileChooserSession | null;
  requestFileChooser: (params: AndroidFileChooserParams) => AndroidFileChooserSession;
  resolveFileChooser: (
    requestId: string,
    files: Array<{ name: string; size: number; type: string }>,
    hasCameraConsent?: boolean
  ) => AndroidFileChooserResult;
  cancelFileChooser: (requestId: string) => AndroidFileChooserResult;
  destroy: () => void;
}

/**
 * Creates a tab-scoped Android WebView File Chooser Manager
 */
export function createAndroidWebViewFileChooserManager(tabId: string): AndroidWebViewFileChooserManager {
  let activeSession: AndroidFileChooserSession | null = null;

  const requestFileChooser = (params: AndroidFileChooserParams): AndroidFileChooserSession => {
    const requestId = `fc_${tabId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeSession = {
      tabId,
      requestId,
      params,
      createdAt: Date.now(),
      resolved: false,
    };
    return activeSession;
  };

  const cancelFileChooser = (requestId: string): AndroidFileChooserResult => {
    if (!activeSession || activeSession.requestId !== requestId) {
      return { success: false, cancelled: true, files: [], error: "No matching active session" };
    }
    activeSession.resolved = true;
    activeSession = null;
    return { success: true, cancelled: true, files: [] };
  };

  const resolveFileChooser = (
    requestId: string,
    files: Array<{ name: string; size: number; type: string }>,
    hasCameraConsent = false
  ): AndroidFileChooserResult => {
    if (!activeSession || activeSession.requestId !== requestId) {
      return { success: false, cancelled: false, files: [], error: "No matching active session" };
    }

    const { params } = activeSession;

    // NATIVE-05 Permission check: if camera capture requested, verify explicit consent
    if (params.isCaptureEnabled) {
      const permEval = evaluateRuntimePermissionRequest("android.permission.CAMERA", hasCameraConsent);
      if (!permEval.granted) {
        return {
          success: false,
          cancelled: false,
          files: [],
          error: `Permission denied for camera capture: ${permEval.reason}`,
        };
      }
    }

    // Selection mode check
    if (params.mode === AndroidFileChooserMode.MODE_OPEN && files.length > 1) {
      return {
        success: false,
        cancelled: false,
        files: [],
        error: "Multiple files provided when single selection was requested",
      };
    }

    // Process & sanitize each file
    const sanitizedFiles: AndroidSelectedFile[] = [];
    for (const f of files) {
      const cleanName = sanitizeUploadedFileName(f.name);

      // Traversal / reserved file check
      if (cleanName.includes("..") || cleanName.startsWith("/") || cleanName.includes("\\")) {
        return {
          success: false,
          cancelled: false,
          files: [],
          error: `Unsafe file path detected: ${f.name}`,
        };
      }

      // MIME / Extension filtering check
      if (params.acceptTypes && params.acceptTypes.length > 0) {
        if (!matchesMimeOrExtension(f.type, cleanName, params.acceptTypes)) {
          return {
            success: false,
            cancelled: false,
            files: [],
            error: `File ${cleanName} does not match accepted types: ${params.acceptTypes.join(", ")}`,
          };
        }
      }

      sanitizedFiles.push({
        name: cleanName,
        size: Math.max(0, f.size || 0),
        type: f.type || "application/octet-stream",
        lastModified: Date.now(),
        // Virtual content URI scoped to this tab session
        virtualUri: `content://com.netflow.browser.fileprovider/tab_${tabId}/${encodeURIComponent(cleanName)}`,
      });
    }

    activeSession.resolved = true;
    activeSession = null;
    return {
      success: true,
      cancelled: false,
      files: sanitizedFiles,
    };
  };

  const destroy = (): void => {
    if (activeSession) {
      activeSession.resolved = true;
      activeSession = null;
    }
  };

  return {
    get tabId() { return tabId; },
    get activeSession() { return activeSession; },
    requestFileChooser,
    resolveFileChooser,
    cancelFileChooser,
    destroy,
  };
}
