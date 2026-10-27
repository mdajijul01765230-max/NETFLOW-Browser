const CLIENT_ID_STORAGE_KEY = "netflow_client_id";
const VALID_CLIENT_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

let inMemoryClientId: string | null = null;

function hasWebCrypto(): boolean {
  try {
    return (
      typeof crypto !== "undefined" &&
      crypto !== null &&
      (typeof crypto.randomUUID === "function" || typeof crypto.getRandomValues === "function")
    );
  } catch {
    return false;
  }
}

export function generateSafeUuid(): string | null {
  try {
    if (typeof crypto !== "undefined" && crypto !== null && typeof crypto.randomUUID === "function") {
      const id = crypto.randomUUID();
      if (typeof id === "string" && VALID_CLIENT_ID_PATTERN.test(id)) {
        return id;
      }
    }
  } catch {
    // Fallback to getRandomValues below
  }

  try {
    if (typeof crypto !== "undefined" && crypto !== null && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant 10
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
  } catch {
    // No secure Web Crypto available
  }

  return null;
}

export function getNetflowClientId(): string | null {
  if (!hasWebCrypto()) {
    return null;
  }

  try {
    if (typeof localStorage !== "undefined") {
      const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (existing && typeof existing === "string" && VALID_CLIENT_ID_PATTERN.test(existing.trim())) {
        inMemoryClientId = existing.trim();
        return inMemoryClientId;
      }
      const created =
        inMemoryClientId && VALID_CLIENT_ID_PATTERN.test(inMemoryClientId)
          ? inMemoryClientId
          : generateSafeUuid();
      if (!created) {
        return null;
      }
      inMemoryClientId = created;
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
      return created;
    }
  } catch {
    // Storage unavailable or blocked; fall back to in-memory id
  }

  if (!inMemoryClientId || !VALID_CLIENT_ID_PATTERN.test(inMemoryClientId)) {
    inMemoryClientId = generateSafeUuid();
  }
  return inMemoryClientId;
}

function readRawApiBaseUrl(): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env;
    if (metaEnv && typeof metaEnv.VITE_API_BASE_URL === "string") {
      return metaEnv.VITE_API_BASE_URL;
    }
  } catch {
    // Ignore
  }

  try {
    if (typeof process !== "undefined" && process.env && typeof process.env.VITE_API_BASE_URL === "string") {
      return process.env.VITE_API_BASE_URL;
    }
  } catch {
    // Ignore
  }

  return "";
}

function readRawApiAccessToken(): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env;
    if (metaEnv && typeof metaEnv.VITE_API_ACCESS_TOKEN === "string") {
      const trimmed = metaEnv.VITE_API_ACCESS_TOKEN.trim();
      if (trimmed) return trimmed;
    }
  } catch {
    // Ignore
  }

  try {
    if (
      typeof process !== "undefined" &&
      process.env &&
      typeof process.env.VITE_API_ACCESS_TOKEN === "string"
    ) {
      const trimmed = process.env.VITE_API_ACCESS_TOKEN.trim();
      if (trimmed) return trimmed;
    }
  } catch {
    // Ignore
  }

  return "";
}

export function apiUrl(path: string): string {
  const rawBase = readRawApiBaseUrl();
  if (!rawBase || typeof rawBase !== "string") {
    return path;
  }

  const trimmedBase = rawBase.trim().replace(/\/+$/, "");
  if (!trimmedBase) {
    return path;
  }

  if (!/^https:\/\//i.test(trimmedBase)) {
    console.info(
      "[NETFLOW apiClient] Ignoring non-HTTPS VITE_API_BASE_URL; falling back to same-origin path."
    );
    return path;
  }

  try {
    const parsed = new URL(trimmedBase);
    if (parsed.protocol !== "https:" || !parsed.hostname) {
      console.info(
        "[NETFLOW apiClient] Ignoring invalid VITE_API_BASE_URL; falling back to same-origin path."
      );
      return path;
    }
  } catch {
    console.info(
      "[NETFLOW apiClient] Ignoring malformed VITE_API_BASE_URL; falling back to same-origin path."
    );
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const mergedHeaders: Record<string, string> = {};

  if (init?.headers) {
    if (typeof Headers !== "undefined" && init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        mergedHeaders[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        if (key) mergedHeaders[String(key)] = String(value);
      }
    } else if (typeof init.headers === "object") {
      for (const [key, value] of Object.entries(init.headers)) {
        if (value !== undefined) {
          mergedHeaders[key] = String(value);
        }
      }
    }
  }

  const clientId = getNetflowClientId();
  if (clientId && !("X-Netflow-Client-Id" in mergedHeaders) && !("x-netflow-client-id" in mergedHeaders)) {
    mergedHeaders["X-Netflow-Client-Id"] = clientId;
  }

  const accessToken = readRawApiAccessToken();
  if (
    accessToken &&
    !("X-Netflow-Access-Token" in mergedHeaders) &&
    !("x-netflow-access-token" in mergedHeaders)
  ) {
    mergedHeaders["X-Netflow-Access-Token"] = accessToken;
  }

  return fetch(apiUrl(path), {
    ...init,
    headers: mergedHeaders,
  });
}
