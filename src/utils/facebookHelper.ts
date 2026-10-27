/**
 * NETFLOW Browser V2 — Facebook Lite & URL Helper
 * Provides URL detection and normalization for Facebook to route
 * to the clean server-rendered mbasic / mobile lite engine.
 */

export function isFacebookUrl(urlStr: string | undefined | null): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    trimmed.includes("facebook.com") ||
    trimmed.includes("fb.com") ||
    trimmed.includes("fb.watch") ||
    trimmed.includes("mbasic.facebook.com") ||
    trimmed.includes("m.facebook.com")
  );
}

export function toFacebookBasicUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "https://mbasic.facebook.com";
  let target = urlStr.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) {
    target = `https://${target}`;
  }
  try {
    const parsed = new URL(target);
    if (parsed.hostname.includes("facebook.com")) {
      parsed.hostname = "mbasic.facebook.com";
      return parsed.toString();
    }
  } catch {}
  return "https://mbasic.facebook.com";
}
