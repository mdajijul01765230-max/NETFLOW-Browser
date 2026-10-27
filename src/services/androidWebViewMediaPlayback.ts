/**
 * NETFLOW Browser V2 — Android WebView Media Playback & Fullscreen Boundary
 *
 * Form: NETFLOW-V2-NATIVE-12
 *
 * This module establishes the secure Media Playback & Fullscreen management layer:
 * 1. WebChromeClient onShowCustomView / onHideCustomView fullscreen contracts
 * 2. HTML5 Audio / Video playback state management
 * 3. Media lifecycle pause / resume hooks (syncing with Android Activity lifecycle)
 * 4. Safe URL & scheme validation (blocking unsafe schemes, SSRF targets, local file leaks)
 * 5. Tab-isolated media playback registries (preventing cross-tab audio/video leaks)
 * 6. Navigation / Stop / Reload consistency (auto-exiting fullscreen & stopping playback)
 */

export interface AndroidMediaPlaybackItem {
  mediaId: string;
  type: "audio" | "video";
  sourceUrl: string;
  state: "playing" | "paused" | "stopped";
  isFullscreen: boolean;
  startedAt: number;
}

export interface AndroidCustomViewSession {
  mediaId: string;
  tabId: string;
  enteredAt: number;
  isActive: boolean;
}

/**
 * Validates a media source URL against dangerous schemes and internal networks.
 */
export function validateMediaSourceUrl(url: string): { isSafe: boolean; reason?: string } {
  if (!url || typeof url !== "string") {
    return { isSafe: false, reason: "Media source URL is empty" };
  }

  const trimmed = url.trim().toLowerCase();

  // Block dangerous schemes
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:") ||
    trimmed.startsWith("data:text/html")
  ) {
    return { isSafe: false, reason: "Insecure or dangerous media scheme" };
  }

  // Allow safe data URIs for media
  if (trimmed.startsWith("data:audio/") || trimmed.startsWith("data:video/")) {
    return { isSafe: true };
  }

  // Allow blob URLs
  if (trimmed.startsWith("blob:")) {
    return { isSafe: true };
  }

  // URL parsing & SSRF check
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { isSafe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "169.254.169.254" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return { isSafe: false, reason: "Blocked internal network or metadata target" };
    }

    return { isSafe: true };
  } catch {
    return { isSafe: false, reason: "Malformed media URL" };
  }
}

export interface AndroidWebViewMediaPlaybackManager {
  tabId: string;
  isFullscreen: boolean;
  activeCustomView: AndroidCustomViewSession | null;
  activeMedia: Map<string, AndroidMediaPlaybackItem>;
  playMedia: (mediaId: string, type: "audio" | "video", sourceUrl: string) => { success: boolean; reason?: string };
  pauseMedia: (mediaId: string) => boolean;
  stopMedia: (mediaId: string) => boolean;
  onShowCustomView: (mediaId: string) => { success: boolean; reason?: string };
  onHideCustomView: () => void;
  pauseAllMedia: () => void;
  resumeAllMedia: () => void;
  onNavigationOrStop: () => void;
  destroy: () => void;
}

/**
 * Creates an Android WebView Media Playback & Fullscreen Manager for a specific tab
 */
export function createAndroidWebViewMediaPlaybackManager(tabId: string): AndroidWebViewMediaPlaybackManager {
  let isFullscreen = false;
  let activeCustomView: AndroidCustomViewSession | null = null;
  const activeMedia = new Map<string, AndroidMediaPlaybackItem>();

  const playMedia = (
    mediaId: string,
    type: "audio" | "video",
    sourceUrl: string
  ): { success: boolean; reason?: string } => {
    const urlCheck = validateMediaSourceUrl(sourceUrl);
    if (!urlCheck.isSafe) {
      return { success: false, reason: urlCheck.reason };
    }

    activeMedia.set(mediaId, {
      mediaId,
      type,
      sourceUrl,
      state: "playing",
      isFullscreen: false,
      startedAt: Date.now(),
    });

    return { success: true };
  };

  const pauseMedia = (mediaId: string): boolean => {
    const item = activeMedia.get(mediaId);
    if (item) {
      item.state = "paused";
      return true;
    }
    return false;
  };

  const stopMedia = (mediaId: string): boolean => {
    const item = activeMedia.get(mediaId);
    if (item) {
      item.state = "stopped";
      if (item.isFullscreen) {
        onHideCustomView();
      }
      activeMedia.delete(mediaId);
      return true;
    }
    return false;
  };

  const onShowCustomView = (mediaId: string): { success: boolean; reason?: string } => {
    const item = activeMedia.get(mediaId);
    if (!item) {
      return { success: false, reason: "Target media element not found" };
    }
    if (item.type !== "video") {
      return { success: false, reason: "Only video elements support fullscreen custom view" };
    }

    isFullscreen = true;
    item.isFullscreen = true;
    activeCustomView = {
      mediaId,
      tabId,
      enteredAt: Date.now(),
      isActive: true,
    };

    return { success: true };
  };

  const onHideCustomView = (): void => {
    if (activeCustomView) {
      const item = activeMedia.get(activeCustomView.mediaId);
      if (item) {
        item.isFullscreen = false;
      }
      activeCustomView = null;
    }
    isFullscreen = false;
  };

  const pauseAllMedia = (): void => {
    activeMedia.forEach((item) => {
      if (item.state === "playing") {
        item.state = "paused";
      }
    });
  };

  const resumeAllMedia = (): void => {
    activeMedia.forEach((item) => {
      if (item.state === "paused") {
        item.state = "playing";
      }
    });
  };

  const onNavigationOrStop = (): void => {
    if (isFullscreen) {
      onHideCustomView();
    }
    pauseAllMedia();
    activeMedia.clear();
  };

  const destroy = (): void => {
    onNavigationOrStop();
  };

  return {
    get tabId() { return tabId; },
    get isFullscreen() { return isFullscreen; },
    get activeCustomView() { return activeCustomView; },
    activeMedia,
    playMedia,
    pauseMedia,
    stopMedia,
    onShowCustomView,
    onHideCustomView,
    pauseAllMedia,
    resumeAllMedia,
    onNavigationOrStop,
    destroy,
  };
}
