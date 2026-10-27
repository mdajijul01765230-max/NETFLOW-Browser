/**
 * NETFLOW Browser V2 — YouTube Embed & URL Helper
 * Provides safe URL parsing and embed conversion for YouTube media playback
 * within sandboxed environments without compromising parent security.
 */

export function extractYouTubeVideoId(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== "string") return null;
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();

    // youtu.be/<id>
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0 && pathParts[0].length >= 5) {
        return pathParts[0];
      }
    }

    // youtube.com / m.youtube.com
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      // /watch?v=<id>
      if (parsed.pathname === "/watch" || parsed.pathname.startsWith("/watch/")) {
        const v = parsed.searchParams.get("v");
        if (v && v.length >= 5) return v;
      }

      // /embed/<id>
      if (parsed.pathname.startsWith("/embed/")) {
        const parts = parsed.pathname.slice(7).split("/").filter(Boolean);
        if (parts.length > 0 && parts[0].length >= 5) return parts[0];
      }

      // /shorts/<id>
      if (parsed.pathname.startsWith("/shorts/")) {
        const parts = parsed.pathname.slice(8).split("/").filter(Boolean);
        if (parts.length > 0 && parts[0].length >= 5) return parts[0];
      }

      // /v/<id>
      if (parsed.pathname.startsWith("/v/")) {
        const parts = parsed.pathname.slice(3).split("/").filter(Boolean);
        if (parts.length > 0 && parts[0].length >= 5) return parts[0];
      }
    }
  } catch {
    // URL parsing failed; attempt regex extraction fallback
  }

  // Regex fallback matching standard 11-char YouTube IDs
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i
  );
  return match ? match[1] : null;
}

export function isYouTubeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();
  try {
    const host = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
    return (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host.endsWith(".youtu.be")
    );
  } catch {
    return trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
  }
}

export function toYouTubeEmbedUrl(urlStr: string): string | null {
  const videoId = extractYouTubeVideoId(urlStr);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}`;
}

export function toYouTubeDisplayUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return urlStr;
  const videoId = extractYouTubeVideoId(urlStr);
  if (videoId && (urlStr.includes("/embed/") || urlStr.includes("youtu.be/"))) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return urlStr;
}
