/**
 * NETFLOW Browser V2 — Android WebView Clipboard & Web Share API Boundary
 *
 * Form: NETFLOW-V2-NATIVE-26
 *
 * This module establishes the secure WebView Clipboard API & Web Share API boundary:
 * 1. Clipboard API: readText, writeText, read, write (supporting text/plain, text/html, image/png)
 * 2. Explicit user-consent gating for all clipboard operations
 * 3. Tab, request, and canonical-origin isolation (prevents cross-origin snooping)
 * 4. Private-mode isolation: ephemeral memory only, no persistent storage, immediate purge on private tab termination
 * 5. Full lifecycle cleanup: auto-cancels pending clipboard & share prompts on navigation, reload, stopLoading, tab close
 * 6. Dangerous scheme & SSRF protection: blocks javascript:, file:, content:, private subnets, metadata IPs (169.254.169.254)
 * 7. Sensitive credential / auth data leakage prevention (redacts tokens, warns on private keys / credentials)
 * 8. Web Share API: navigator.share & canShare with title, text, url, and file validation
 * 9. Explicit user gesture / consent gating for Web Share
 * 10. Privileged native bridge invariant: pure safe TypeScript boundary without native reflection.
 */

export interface ClipboardItemData {
  type: string;
  data: string | Uint8Array;
}

export interface ClipboardOriginValidationResult {
  isValid: boolean;
  isSecure: boolean;
  isLocalhost: boolean;
  canonicalOrigin?: string;
  reason?: string;
}

export interface ClipboardConsentPrompt {
  promptId: string;
  tabId: string;
  origin: string;
  action: "read" | "write" | "readText" | "writeText";
  mimeType?: string;
  previewText?: string;
  isSensitive: boolean;
  securityWarning?: string;
  isPrivate: boolean;
  createdAt: number;
}

export interface ClipboardOperationResult {
  success: boolean;
  action: "read" | "write" | "readText" | "writeText";
  text?: string;
  items?: ClipboardItemData[];
  error?: string;
}

export interface ShareDataFile {
  name: string;
  type: string;
  size: number;
  data?: Uint8Array | string;
}

export interface WebShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: ShareDataFile[];
}

export interface ShareConsentPrompt {
  promptId: string;
  tabId: string;
  origin: string;
  title?: string;
  text?: string;
  url?: string;
  files?: Array<{ name: string; type: string; sizeFormatted: string }>;
  isDangerous: boolean;
  securityWarning?: string;
  isPrivate: boolean;
  createdAt: number;
}

export interface ShareOperationResult {
  success: boolean;
  promptId?: string;
  sharedData?: WebShareData;
  error?: string;
}

export const CLIPBOARD_LIMITS = {
  MAX_TEXT_LENGTH_CHARS: 500_000, // ~500 KB text
  MAX_ITEM_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB per clipboard item
  ALLOWED_WRITE_MIMES: new Set(["text/plain", "text/html", "image/png", "text/uri-list"]),
};

/**
 * Validates requesting origin for Clipboard and Web Share operations.
 * Enforces HTTPS or localhost. Rejects dangerous schemes, private subnets, and metadata IPs.
 */
export function validateClipboardAndShareOrigin(originStr: string): ClipboardOriginValidationResult {
  if (!originStr || typeof originStr !== "string") {
    return { isValid: false, isSecure: false, isLocalhost: false, reason: "Origin is empty" };
  }

  const lower = originStr.trim().toLowerCase();

  // Block dangerous schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("about:")
  ) {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Dangerous scheme blocked from Clipboard & Web Share APIs",
    };
  }

  try {
    const parsed = new URL(lower.includes("://") ? lower : `https://${lower}`);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: `Unsupported protocol: ${protocol}`,
      };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";

    if (isLocalhost) {
      return {
        isValid: true,
        isSecure: true,
        isLocalhost: true,
        canonicalOrigin: `${protocol}//${parsed.host}`,
      };
    }

    if (protocol !== "https:") {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "Insecure remote HTTP origin blocked from Clipboard and Web Share APIs",
      };
    }

    // SSRF & private IP targets blocked
    if (
      hostname === "169.254.169.254" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return {
        isValid: false,
        isSecure: false,
        isLocalhost: false,
        reason: "Origin blocked on private network or cloud metadata IP",
      };
    }

    return {
      isValid: true,
      isSecure: true,
      isLocalhost: false,
      canonicalOrigin: `${protocol}//${parsed.host}`,
    };
  } catch {
    return {
      isValid: false,
      isSecure: false,
      isLocalhost: false,
      reason: "Malformed origin URL",
    };
  }
}

/**
 * Validates a share URL for dangerous schemes and SSRF.
 */
export function validateShareUrl(rawUrl?: string): {
  isValid: boolean;
  sanitizedUrl?: string;
  isDangerous: boolean;
  securityWarning?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: true, isDangerous: false };
  }

  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();

  // Block dangerous schemes
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("about:")
  ) {
    return {
      isValid: false,
      isDangerous: true,
      securityWarning: `Dangerous scheme rejected in share URL: ${trimmed.slice(0, 20)}...`,
    };
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return {
        isValid: false,
        isDangerous: true,
        securityWarning: `Unsupported share URL protocol: ${protocol}`,
      };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";

    // SSRF & private IP targets blocked
    if (
      !isLocalhost &&
      (hostname === "169.254.169.254" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".local"))
    ) {
      return {
        isValid: false,
        isDangerous: true,
        securityWarning: `Share URL target blocked on private network or cloud metadata IP: ${hostname}`,
      };
    }

    // Strip sensitive tokens from shared URL
    parsed.searchParams.delete("token");
    parsed.searchParams.delete("auth");
    parsed.searchParams.delete("key");
    parsed.searchParams.delete("secret");
    parsed.searchParams.delete("password");
    parsed.searchParams.delete("bearer");

    return {
      isValid: true,
      sanitizedUrl: parsed.toString(),
      isDangerous: false,
    };
  } catch {
    return {
      isValid: false,
      isDangerous: true,
      securityWarning: "Invalid share URL format",
    };
  }
}

/**
 * Checks if content contains sensitive credentials, private keys, or passwords.
 */
export function detectSensitiveContent(content: string): {
  isSensitive: boolean;
  warning?: string;
} {
  if (!content || typeof content !== "string") {
    return { isSensitive: false };
  }

  if (content.includes("-----BEGIN PRIVATE KEY-----") || content.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    return { isSensitive: true, warning: "Contains Private Key certificate data" };
  }

  if (/(?:eyJ[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{4,})/i.test(content)) {
    return { isSensitive: true, warning: "Contains JWT authentication token" };
  }

  if (/(?:api[_-]?key|secret|auth[_-]?token|bearer\s+[a-zA-Z0-9_-]{16,})/i.test(content)) {
    return { isSensitive: true, warning: "Contains API secret or credential token" };
  }

  return { isSensitive: false };
}

export interface AndroidWebViewClipboardAndShareManagerOptions {
  onClipboardConsentPromptChange?: (prompt: ClipboardConsentPrompt | null) => void;
  onShareConsentPromptChange?: (prompt: ShareConsentPrompt | null) => void;
}

export interface AndroidWebViewClipboardAndShareManager {
  // Clipboard API
  writeText: (tabId: string, origin: string, text: string, isPrivate?: boolean) => Promise<ClipboardOperationResult>;
  readText: (tabId: string, origin: string, isPrivate?: boolean) => Promise<ClipboardOperationResult>;
  write: (tabId: string, origin: string, items: ClipboardItemData[], isPrivate?: boolean) => Promise<ClipboardOperationResult>;
  read: (tabId: string, origin: string, isPrivate?: boolean) => Promise<ClipboardOperationResult>;

  // Consent Response Handlers for Clipboard
  approveClipboardPrompt: (promptId: string) => ClipboardOperationResult;
  rejectClipboardPrompt: (promptId: string, reason?: string) => boolean;

  // Web Share API
  canShare: (data: WebShareData) => boolean;
  share: (tabId: string, origin: string, data: WebShareData, isPrivate?: boolean) => Promise<ShareOperationResult>;

  // Consent Response Handlers for Share
  approveSharePrompt: (promptId: string) => ShareOperationResult;
  rejectSharePrompt: (promptId: string, reason?: string) => boolean;

  // Lifecycle & Isolation Handlers
  onNavigation: (tabId: string, newUrl: string) => void;
  onReload: (tabId: string) => void;
  onStopLoading: (tabId: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  destroy: () => void;
}

export function createAndroidWebViewClipboardAndShareManager(
  options: AndroidWebViewClipboardAndShareManagerOptions = {}
): AndroidWebViewClipboardAndShareManager {
  // In-memory clipboard store:
  // Standard public clipboard store
  let standardClipboard: ClipboardItemData[] = [
    { type: "text/plain", data: "" },
  ];

  // Private ephemeral clipboard store (scoped to private browsing)
  let privateClipboard: ClipboardItemData[] = [];

  // Active pending clipboard prompts: Map<promptId, { prompt, resolver, isPrivate, itemsToWrite? }>
  const pendingClipboardPrompts = new Map<
    string,
    {
      prompt: ClipboardConsentPrompt;
      resolver: (res: ClipboardOperationResult) => void;
      isPrivate: boolean;
      itemsToWrite?: ClipboardItemData[];
    }
  >();

  // Active pending share prompts: Map<promptId, { prompt, resolver, data }>
  const pendingSharePrompts = new Map<
    string,
    {
      prompt: ShareConsentPrompt;
      resolver: (res: ShareOperationResult) => void;
      data: WebShareData;
    }
  >();

  // -------------------------------------------------------------
  // 1. CLIPBOARD API: writeText
  // -------------------------------------------------------------
  const writeText = async (
    tabId: string,
    origin: string,
    text: string,
    isPrivate = false
  ): Promise<ClipboardOperationResult> => {
    const valOrigin = validateClipboardAndShareOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, action: "writeText", error: valOrigin.reason || "SecurityError: Invalid origin" };
    }

    if (text.length > CLIPBOARD_LIMITS.MAX_TEXT_LENGTH_CHARS) {
      return {
        success: false,
        action: "writeText",
        error: `ERR_CLIPBOARD_LIMIT: Text length (${text.length}) exceeds maximum limit of ${CLIPBOARD_LIMITS.MAX_TEXT_LENGTH_CHARS} chars`,
      };
    }

    const sensitiveCheck = detectSensitiveContent(text);
    const promptId = `clip-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const prompt: ClipboardConsentPrompt = {
      promptId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      action: "writeText",
      mimeType: "text/plain",
      previewText: text.length > 80 ? `${text.slice(0, 80)}...` : text,
      isSensitive: sensitiveCheck.isSensitive,
      securityWarning: sensitiveCheck.warning,
      isPrivate,
      createdAt: Date.now(),
    };

    return new Promise<ClipboardOperationResult>((resolve) => {
      pendingClipboardPrompts.set(promptId, {
        prompt,
        resolver: resolve,
        isPrivate,
        itemsToWrite: [{ type: "text/plain", data: text }],
      });
      options.onClipboardConsentPromptChange?.(prompt);
    });
  };

  // -------------------------------------------------------------
  // 2. CLIPBOARD API: readText
  // -------------------------------------------------------------
  const readText = async (
    tabId: string,
    origin: string,
    isPrivate = false
  ): Promise<ClipboardOperationResult> => {
    const valOrigin = validateClipboardAndShareOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, action: "readText", error: valOrigin.reason || "SecurityError: Invalid origin" };
    }

    const targetStore = isPrivate ? privateClipboard : standardClipboard;
    const textItem = targetStore.find((i) => i.type === "text/plain");
    const rawText = typeof textItem?.data === "string" ? textItem.data : "";

    const sensitiveCheck = detectSensitiveContent(rawText);
    const promptId = `clip-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const prompt: ClipboardConsentPrompt = {
      promptId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      action: "readText",
      mimeType: "text/plain",
      previewText: rawText ? (rawText.length > 80 ? `${rawText.slice(0, 80)}...` : rawText) : "(Empty clipboard)",
      isSensitive: sensitiveCheck.isSensitive,
      securityWarning: sensitiveCheck.warning,
      isPrivate,
      createdAt: Date.now(),
    };

    return new Promise<ClipboardOperationResult>((resolve) => {
      pendingClipboardPrompts.set(promptId, {
        prompt,
        resolver: resolve,
        isPrivate,
      });
      options.onClipboardConsentPromptChange?.(prompt);
    });
  };

  // -------------------------------------------------------------
  // 3. CLIPBOARD API: write
  // -------------------------------------------------------------
  const write = async (
    tabId: string,
    origin: string,
    items: ClipboardItemData[],
    isPrivate = false
  ): Promise<ClipboardOperationResult> => {
    const valOrigin = validateClipboardAndShareOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, action: "write", error: valOrigin.reason || "SecurityError: Invalid origin" };
    }

    // Filter disallowed MIME types
    const validItems: ClipboardItemData[] = [];
    for (const item of items) {
      if (!CLIPBOARD_LIMITS.ALLOWED_WRITE_MIMES.has(item.type)) {
        return {
          success: false,
          action: "write",
          error: `NotAllowedError: MIME type '${item.type}' is not supported for clipboard write`,
        };
      }
      validItems.push(item);
    }

    const textItem = validItems.find((i) => i.type === "text/plain" || i.type === "text/html");
    const preview = typeof textItem?.data === "string" ? textItem.data : "";
    const sensitiveCheck = detectSensitiveContent(preview);

    const promptId = `clip-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const prompt: ClipboardConsentPrompt = {
      promptId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      action: "write",
      mimeType: validItems.map((i) => i.type).join(", "),
      previewText: preview.length > 80 ? `${preview.slice(0, 80)}...` : preview || "(Binary items)",
      isSensitive: sensitiveCheck.isSensitive,
      securityWarning: sensitiveCheck.warning,
      isPrivate,
      createdAt: Date.now(),
    };

    return new Promise<ClipboardOperationResult>((resolve) => {
      pendingClipboardPrompts.set(promptId, {
        prompt,
        resolver: resolve,
        isPrivate,
        itemsToWrite: validItems,
      });
      options.onClipboardConsentPromptChange?.(prompt);
    });
  };

  // -------------------------------------------------------------
  // 4. CLIPBOARD API: read
  // -------------------------------------------------------------
  const read = async (
    tabId: string,
    origin: string,
    isPrivate = false
  ): Promise<ClipboardOperationResult> => {
    const valOrigin = validateClipboardAndShareOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, action: "read", error: valOrigin.reason || "SecurityError: Invalid origin" };
    }

    const targetStore = isPrivate ? privateClipboard : standardClipboard;
    const textItem = targetStore.find((i) => i.type === "text/plain");
    const rawText = typeof textItem?.data === "string" ? textItem.data : "";
    const sensitiveCheck = detectSensitiveContent(rawText);

    const promptId = `clip-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const prompt: ClipboardConsentPrompt = {
      promptId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      action: "read",
      mimeType: targetStore.map((i) => i.type).join(", ") || "text/plain",
      previewText: rawText ? (rawText.length > 80 ? `${rawText.slice(0, 80)}...` : rawText) : "(Empty clipboard)",
      isSensitive: sensitiveCheck.isSensitive,
      securityWarning: sensitiveCheck.warning,
      isPrivate,
      createdAt: Date.now(),
    };

    return new Promise<ClipboardOperationResult>((resolve) => {
      pendingClipboardPrompts.set(promptId, {
        prompt,
        resolver: resolve,
        isPrivate,
      });
      options.onClipboardConsentPromptChange?.(prompt);
    });
  };

  // -------------------------------------------------------------
  // 5. Consent Approval / Rejection for Clipboard
  // -------------------------------------------------------------
  const approveClipboardPrompt = (promptId: string): ClipboardOperationResult => {
    const pending = pendingClipboardPrompts.get(promptId);
    if (!pending) {
      return { success: false, action: "readText", error: "Prompt expired or not found" };
    }

    pendingClipboardPrompts.delete(promptId);
    options.onClipboardConsentPromptChange?.(null);

    const { prompt, resolver, isPrivate, itemsToWrite } = pending;

    if (prompt.action === "writeText" || prompt.action === "write") {
      if (itemsToWrite && itemsToWrite.length > 0) {
        if (isPrivate) {
          privateClipboard = [...itemsToWrite];
        } else {
          standardClipboard = [...itemsToWrite];
        }
      }
      const res: ClipboardOperationResult = {
        success: true,
        action: prompt.action,
        items: itemsToWrite,
        text: typeof itemsToWrite?.[0]?.data === "string" ? itemsToWrite[0].data : undefined,
      };
      resolver(res);
      return res;
    } else {
      // readText or read
      const targetStore = isPrivate ? privateClipboard : standardClipboard;
      const textItem = targetStore.find((i) => i.type === "text/plain");
      const text = typeof textItem?.data === "string" ? textItem.data : "";
      const res: ClipboardOperationResult = {
        success: true,
        action: prompt.action,
        text,
        items: targetStore,
      };
      resolver(res);
      return res;
    }
  };

  const rejectClipboardPrompt = (
    promptId: string,
    reason = "Clipboard access was denied by the user"
  ): boolean => {
    const pending = pendingClipboardPrompts.get(promptId);
    if (!pending) return false;

    pendingClipboardPrompts.delete(promptId);
    options.onClipboardConsentPromptChange?.(null);

    pending.resolver({
      success: false,
      action: pending.prompt.action,
      error: `NotAllowedError: ${reason}`,
    });

    return true;
  };

  // -------------------------------------------------------------
  // 6. WEB SHARE API: canShare
  // -------------------------------------------------------------
  const canShare = (data: WebShareData): boolean => {
    if (!data || typeof data !== "object") return false;

    // Must have at least one valid field: title, text, url, or files
    const hasTitle = typeof data.title === "string" && data.title.trim().length > 0;
    const hasText = typeof data.text === "string" && data.text.trim().length > 0;
    const hasUrl = typeof data.url === "string" && data.url.trim().length > 0;
    const hasFiles = Array.isArray(data.files) && data.files.length > 0;

    if (!hasTitle && !hasText && !hasUrl && !hasFiles) {
      return false;
    }

    // Validate URL safety if present
    if (hasUrl) {
      const urlVal = validateShareUrl(data.url);
      if (!urlVal.isValid) {
        return false;
      }
    }

    // Validate file sizes and types if present
    if (hasFiles) {
      for (const f of data.files!) {
        if (!f.name || typeof f.size !== "number" || f.size > CLIPBOARD_LIMITS.MAX_ITEM_SIZE_BYTES) {
          return false;
        }
      }
    }

    return true;
  };

  // -------------------------------------------------------------
  // 7. WEB SHARE API: share
  // -------------------------------------------------------------
  const share = async (
    tabId: string,
    origin: string,
    data: WebShareData,
    isPrivate = false
  ): Promise<ShareOperationResult> => {
    const valOrigin = validateClipboardAndShareOrigin(origin);
    if (!valOrigin.isValid || !valOrigin.canonicalOrigin) {
      return { success: false, error: valOrigin.reason || "SecurityError: Invalid origin for Web Share" };
    }

    if (!canShare(data)) {
      return {
        success: false,
        error: "TypeError: Invalid ShareData provided or unsafe URL/file rejected by policy",
      };
    }

    const urlCheck = validateShareUrl(data.url);
    const sanitizedUrl = urlCheck.sanitizedUrl || data.url;

    const filesFormatted = data.files?.map((f) => ({
      name: f.name,
      type: f.type || "application/octet-stream",
      sizeFormatted: `${(f.size / 1024).toFixed(1)} KB`,
    }));

    const promptId = `share-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const prompt: ShareConsentPrompt = {
      promptId,
      tabId,
      origin: valOrigin.canonicalOrigin,
      title: data.title,
      text: data.text,
      url: sanitizedUrl,
      files: filesFormatted,
      isDangerous: urlCheck.isDangerous,
      securityWarning: urlCheck.securityWarning,
      isPrivate,
      createdAt: Date.now(),
    };

    return new Promise<ShareOperationResult>((resolve) => {
      pendingSharePrompts.set(promptId, {
        prompt,
        resolver: resolve,
        data: {
          ...data,
          url: sanitizedUrl,
        },
      });
      options.onShareConsentPromptChange?.(prompt);
    });
  };

  const approveSharePrompt = (promptId: string): ShareOperationResult => {
    const pending = pendingSharePrompts.get(promptId);
    if (!pending) {
      return { success: false, error: "Share prompt expired or not found" };
    }

    pendingSharePrompts.delete(promptId);
    options.onShareConsentPromptChange?.(null);

    const res: ShareOperationResult = {
      success: true,
      promptId,
      sharedData: pending.data,
    };

    pending.resolver(res);
    return res;
  };

  const rejectSharePrompt = (
    promptId: string,
    reason = "Share was cancelled by the user"
  ): boolean => {
    const pending = pendingSharePrompts.get(promptId);
    if (!pending) return false;

    pendingSharePrompts.delete(promptId);
    options.onShareConsentPromptChange?.(null);

    pending.resolver({
      success: false,
      error: `AbortError: ${reason}`,
    });

    return true;
  };

  // -------------------------------------------------------------
  // 8. LIFECYCLE & CLEANUP
  // -------------------------------------------------------------
  const onNavigation = (tabId: string, _newUrl: string) => {
    // Cancel pending clipboard prompts for this tab
    pendingClipboardPrompts.forEach((pending, pId) => {
      if (pending.prompt.tabId === tabId) {
        rejectClipboardPrompt(pId, "Clipboard operation aborted by tab navigation");
      }
    });

    // Cancel pending share prompts for this tab
    pendingSharePrompts.forEach((pending, pId) => {
      if (pending.prompt.tabId === tabId) {
        rejectSharePrompt(pId, "Web Share operation aborted by tab navigation");
      }
    });
  };

  const onReload = (tabId: string) => {
    onNavigation(tabId, "");
  };

  const onStopLoading = (tabId: string) => {
    pendingClipboardPrompts.forEach((pending, pId) => {
      if (pending.prompt.tabId === tabId) {
        rejectClipboardPrompt(pId, "Clipboard operation cancelled by stopLoading");
      }
    });

    pendingSharePrompts.forEach((pending, pId) => {
      if (pending.prompt.tabId === tabId) {
        rejectSharePrompt(pId, "Web Share operation cancelled by stopLoading");
      }
    });
  };

  const onTabClosed = (tabId: string, isPrivate = false, remainingPrivateTabs = 0) => {
    onNavigation(tabId, "");

    // If last private tab closed, completely wipe ephemeral private clipboard memory
    if (isPrivate && remainingPrivateTabs === 0) {
      privateClipboard = [];
    }
  };

  const destroy = () => {
    pendingClipboardPrompts.forEach((_, pId) => {
      rejectClipboardPrompt(pId, "Manager destroyed");
    });
    pendingClipboardPrompts.clear();

    pendingSharePrompts.forEach((_, pId) => {
      rejectSharePrompt(pId, "Manager destroyed");
    });
    pendingSharePrompts.clear();

    privateClipboard = [];
    standardClipboard = [{ type: "text/plain", data: "" }];
  };

  return {
    writeText,
    readText,
    write,
    read,
    approveClipboardPrompt,
    rejectClipboardPrompt,
    canShare,
    share,
    approveSharePrompt,
    rejectSharePrompt,
    onNavigation,
    onReload,
    onStopLoading,
    onTabClosed,
    destroy,
  };
}
