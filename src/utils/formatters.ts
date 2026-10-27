export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDate(timestamp: number, lang: "bn" | "en" = "en"): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCleanDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function sanitizeUrlForErrorDisplay(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const sensitiveKeys = [
      "token",
      "access_token",
      "key",
      "apikey",
      "secret",
      "password",
      "pwd",
      "auth",
      "code",
    ];
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    parsed.username = "";
    parsed.password = "";
    return parsed.href;
  } catch {
    return url.replace(/([?&](?:token|key|secret|password|auth)=)[^&]+/gi, "$1[REDACTED]");
  }
}

export function redactTechnicalDetailsForDiagnostics(details: string): string {
  if (!details) return "";
  return details.replace(/https?:\/\/[^\s"'<>()]+/gi, (matchedUrl) =>
    sanitizeUrlForErrorDisplay(matchedUrl).replace(/%5BREDACTED%5D/gi, "[REDACTED]")
  );
}

