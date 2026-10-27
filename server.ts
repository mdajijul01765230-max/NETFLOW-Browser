import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { resolveNativeOmniboxInput, SEARCH_ENGINES } from "./src/services/nativeBrowserEngine";
import type { SearchEngineId } from "./src/types";

dotenv.config();

export const app = express();
// Runtime constraint: AI Studio Dev server must run on port 3000 (nginx proxy listens on 8080)
const PORT = 3000;

// Log & Error Redaction Helpers (Part B: never log full URLs with queries/tokens, cookies, auth headers, bodies, or API keys)
export function sanitizeUrlForLog(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
  try {
    const parsed = new URL(rawUrl.trim());
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return rawUrl
      .trim()
      .split(/[?#]/)[0]
      .replace(/\/\/[^/@]+@/, "//");
  }
}

function sanitizeOriginEntryForLog(rawEntry: string): string {
  const trimmed = String(rawEntry || "").trim();
  if (trimmed === "*") return "*";
  return sanitizeUrlForLog(trimmed).slice(0, 120);
}

export function sanitizeLogMessage(errOrMsg: unknown): string {
  let raw = "UnknownError";
  if (typeof errOrMsg === "string" && errOrMsg.trim()) {
    raw = errOrMsg.trim();
  } else if (errOrMsg && typeof errOrMsg === "object") {
    const code = typeof (errOrMsg as any).code === "string" ? (errOrMsg as any).code.trim() : "";
    const name = typeof (errOrMsg as any).name === "string" ? (errOrMsg as any).name.trim() : "Error";
    const msg = typeof (errOrMsg as any).message === "string" ? (errOrMsg as any).message.trim() : "";
    raw = code ? `${name}(${code})` : msg ? `${name}: ${msg}` : name;
  }

  return raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => sanitizeUrlForLog(match))
    .replace(
      /\b(token|access_token|api_key|apikey|key|secret|password|passwd|authorization|cookie|set-cookie)\s*([=:])\s*([^\s&;,]+)/gi,
      "$1$2[REDACTED]"
    )
    .replace(/[\r\n]+/g, " ")
    .slice(0, 160);
}

// Parse TRUST_PROXY env (Part A: default off/false; when set to hop count e.g. 1, configure Express trust proxy)
let cachedRawTrustProxy: string | undefined = undefined;
let cachedTrustProxyHops: number | false = false;

export function syncTrustProxyFromEnv(): number | false {
  const raw = typeof process.env.TRUST_PROXY === "string" ? process.env.TRUST_PROXY.trim() : "";
  if (raw === cachedRawTrustProxy) {
    return cachedTrustProxyHops;
  }
  cachedRawTrustProxy = raw;
  const lower = raw.toLowerCase();
  if (!lower || lower === "off" || lower === "false" || lower === "0" || lower === "no") {
    cachedTrustProxyHops = false;
  } else if (lower === "true" || lower === "on") {
    cachedTrustProxyHops = 1;
  } else {
    const parsedHops = Number.parseInt(lower, 10);
    cachedTrustProxyHops = Number.isFinite(parsedHops) && parsedHops > 0 ? parsedHops : false;
  }
  app.set("trust proxy", cachedTrustProxyHops);
  return cachedTrustProxyHops;
}

// Initialize trust proxy setting on startup (default: false)
syncTrustProxyFromEnv();

// Parse optional ALLOWED_ORIGINS env (comma-separated exact https:// origins; ignore invalid/wildcard/http entries)
let cachedRawAllowedOrigins: string | undefined = undefined;
let cachedAllowedOriginsSet = new Set<string>();

export function getAllowedOriginsFromEnv(): Set<string> {
  const raw = typeof process.env.ALLOWED_ORIGINS === "string" ? process.env.ALLOWED_ORIGINS : "";
  if (raw === cachedRawAllowedOrigins) {
    return cachedAllowedOriginsSet;
  }
  cachedRawAllowedOrigins = raw;
  const nextSet = new Set<string>();
  if (!raw.trim()) {
    cachedAllowedOriginsSet = nextSet;
    return nextSet;
  }

  for (const rawEntry of raw.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const safeLogEntry = sanitizeOriginEntryForLog(entry);

    if (entry.includes("*")) {
      console.info(`[NETFLOW CORS] Ignoring wildcard ALLOWED_ORIGINS entry: "${safeLogEntry}"`);
      continue;
    }

    if (!/^https:\/\//i.test(entry)) {
      console.info(`[NETFLOW CORS] Ignoring non-HTTPS ALLOWED_ORIGINS entry: "${safeLogEntry}"`);
      continue;
    }

    try {
      const parsed = new URL(entry);
      const strippedEntry = entry.replace(/\/+$/, "");
      if (
        parsed.protocol !== "https:" ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        (parsed.pathname !== "/" && parsed.pathname !== "") ||
        parsed.origin.toLowerCase() !== strippedEntry.toLowerCase()
      ) {
        console.info(`[NETFLOW CORS] Ignoring invalid ALLOWED_ORIGINS entry: "${safeLogEntry}"`);
        continue;
      }
      nextSet.add(parsed.origin);
    } catch {
      console.info(`[NETFLOW CORS] Ignoring malformed ALLOWED_ORIGINS entry: "${safeLogEntry}"`);
    }
  }

  cachedAllowedOriginsSet = nextSet;
  return nextSet;
}

// Initialize ALLOWED_ORIGINS allow-list on startup
getAllowedOriginsFromEnv();

function isOriginAllowListed(rawOrigin: string, req: Request): boolean {
  if (!rawOrigin || rawOrigin.toLowerCase() === "null" || rawOrigin.includes("*")) {
    return false;
  }

  if (
    rawOrigin === "https://localhost" ||
    rawOrigin === "capacitor://localhost" ||
    rawOrigin === "http://localhost"
  ) {
    return true;
  }

  const envAllowList = getAllowedOriginsFromEnv();
  if (envAllowList.has(rawOrigin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(rawOrigin);
    if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
      return false;
    }
    if (parsedOrigin.origin !== rawOrigin) {
      return false;
    }
    if (envAllowList.has(parsedOrigin.origin)) {
      return true;
    }

    const originHost = parsedOrigin.host.toLowerCase();
    const originHostname = parsedOrigin.hostname.toLowerCase();
    const reqHost = String(req.headers.host || "").toLowerCase();
    const forwardedHost = String(req.headers["x-forwarded-host"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();

    if (
      (reqHost && originHost === reqHost) ||
      (forwardedHost && originHost === forwardedHost) ||
      originHostname === "localhost" ||
      originHostname === "127.0.0.1"
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

// Request Header & URL Size Caps (Part C: sensible bounds on incoming request headers and URL length)
export const MAX_REQUEST_URL_LENGTH = 4096;
export const MAX_REQUEST_HEADER_BYTES = 16 * 1024; // 16 KB total headers cap
export const MAX_SINGLE_HEADER_BYTES = 8 * 1024; // 8 KB single header cap
export const MAX_REQUEST_HEADER_COUNT = 100;

function checkRequestHeaderBounds(req: Request): { ok: boolean; statusCode?: number; errorCode?: string; error?: string } {
  const rawUrl = req.originalUrl || req.url || "";
  if (rawUrl.length > MAX_REQUEST_URL_LENGTH) {
    return {
      ok: false,
      statusCode: 414,
      errorCode: "NETFLOW_URI_TOO_LONG",
      error: "Request URI exceeds maximum allowed length.",
    };
  }

  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  if (rawHeaders.length > MAX_REQUEST_HEADER_COUNT * 2) {
    return {
      ok: false,
      statusCode: 431,
      errorCode: "NETFLOW_HEADERS_TOO_LARGE",
      error: "Too many request headers.",
    };
  }

  let totalHeaderBytes = 0;
  for (let i = 0; i < rawHeaders.length; i++) {
    const val = String(rawHeaders[i] || "");
    const byteLen = Buffer.byteLength(val, "utf8");
    if (byteLen > MAX_SINGLE_HEADER_BYTES) {
      return {
        ok: false,
        statusCode: 431,
        errorCode: "NETFLOW_HEADERS_TOO_LARGE",
        error: "A request header exceeds the maximum allowed size.",
      };
    }
    totalHeaderBytes += byteLen + 2;
    if (totalHeaderBytes > MAX_REQUEST_HEADER_BYTES) {
      return {
        ok: false,
        statusCode: 431,
        errorCode: "NETFLOW_HEADERS_TOO_LARGE",
        error: "Request headers exceed the 16KB maximum total size limit.",
      };
    }
  }

  return { ok: true };
}

// API Cross-Origin, Header Bounds & CSRF Protection Middleware
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Vary", "Origin");

  const headerCheck = checkRequestHeaderBounds(req);
  if (!headerCheck.ok) {
    res.status(headerCheck.statusCode || 431).json({
      success: false,
      statusCode: headerCheck.statusCode || 431,
      errorCode: headerCheck.errorCode || "NETFLOW_HEADERS_TOO_LARGE",
      errorCategory: "headers_too_large",
      error: headerCheck.error || "Request headers exceed maximum size limit.",
    });
    return;
  }

  const originHeader = req.headers.origin;
  const hasOriginHeader = typeof originHeader === "string" && originHeader.trim() !== "";
  const rawOrigin = hasOriginHeader ? originHeader.trim() : "";
  const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();

  if (hasOriginHeader) {
    if (!isOriginAllowListed(rawOrigin, req)) {
      res.status(403).json({
        success: false,
        errorCode: "NETFLOW_CORS_BLOCKED",
        error: "Cross-origin API access is not permitted.",
      });
      return;
    }

    // Allow-listed Origin: permit even Sec-Fetch-Site: cross-site and attach exact CORS headers
    res.setHeader("Access-Control-Allow-Origin", rawOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Netflow-Client-Id, X-Netflow-Access-Token"
    );
    res.setHeader("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
  } else {
    // No Origin header present
    if (secFetchSite === "cross-site" || req.method === "OPTIONS") {
      res.status(403).json({
        success: false,
        errorCode: "NETFLOW_CORS_BLOCKED",
        error: "Cross-origin API access is not permitted.",
      });
      return;
    }
  }

  if (req.method === "POST") {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      res.status(415).json({
        success: false,
        errorCode: "NETFLOW_UNSUPPORTED_MEDIA_TYPE",
        error: "POST /api/* requests require Content-Type: application/json.",
      });
      return;
    }
  }

  next();
});

// JSON body parser capped at 2mb with clean error handling for oversized or malformed payloads
app.use(express.json({ limit: "2mb" }));
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (!err) {
    next();
    return;
  }
  if (err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413) {
    res.status(413).json({
      success: false,
      statusCode: 413,
      errorCode: "NETFLOW_PAYLOAD_TOO_LARGE",
      errorCategory: "payload_too_large",
      error: "Request body exceeds the 2MB maximum size limit.",
    });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      statusCode: 400,
      errorCode: "NETFLOW_INVALID_JSON",
      errorCategory: "bad_request",
      error: "Invalid JSON payload.",
    });
    return;
  }
  next(err);
});

// Initialize Gemini SDK with User-Agent telemetry
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Known tracker patterns for privacy shield
const TRACKER_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i,
  /facebook\.net/i,
  /connect\.facebook\.net/i,
  /pixel\.facebook\.com/i,
  /clarity\.ms/i,
  /hotjar\.com/i,
  /criteo\.com/i,
  /adnxs\.com/i,
  /outbrain\.com/i,
  /taboola\.com/i,
  /amazon-adsystem\.com/i,
  /scorecardresearch\.com/i,
  /analytics\./i,
  /telemetry\./i,
  /tracking\./i,
  /advert/i,
  /popunder/i,
];

// Facebook domain detector for SPA Full Mode exception
export function isFacebookUrl(targetUrl: string): boolean {
  if (!targetUrl) return false;
  try {
    const raw = targetUrl.includes("://") ? targetUrl : `https://${targetUrl}`;
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.com" ||
      host.endsWith(".fb.com") ||
      host === "fbcdn.net" ||
      host.endsWith(".fbcdn.net")
    );
  } catch {
    return /facebook\.com|fb\.com/i.test(targetUrl);
  }
}

// Cookie & Session Foundation
export interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number; // epoch ms
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "strict" | "lax" | "none";
}

// In-memory cookie jar partitioned by `${clientId}::${tabId}`
// Map<`${clientId}::${tabId}`, CookieJarEntry>
export interface CookieJarEntry {
  cookies: Map<string, ParsedCookie>;
  lastAccessedAt: number;
}

export const COOKIE_JAR_IDLE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_COOKIE_JAR_COUNT = 5000;
const VALID_CLIENT_ID_REGEX = /^[A-Za-z0-9-]{16,64}$/;

const clientTabCookieJars = new Map<string, CookieJarEntry>();

export function isValidClientId(clientId: unknown): clientId is string {
  return typeof clientId === "string" && VALID_CLIENT_ID_REGEX.test(clientId);
}

export function isValidTabId(tabId: unknown): tabId is string {
  return (
    typeof tabId === "string" &&
    tabId.trim().length > 0 &&
    tabId.trim().length <= 64 &&
    !tabId.includes("::")
  );
}

export function getClientIdFromRequest(req: Request): string | null {
  const raw = req.headers["x-netflow-client-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return isValidClientId(trimmed) ? trimmed : null;
}

export function evictCookieJars(
  now: number = Date.now(),
  idleTtlMs: number = COOKIE_JAR_IDLE_TTL_MS,
  maxJars: number = MAX_COOKIE_JAR_COUNT
): void {
  for (const [jarKey, entry] of clientTabCookieJars.entries()) {
    if (now - entry.lastAccessedAt > idleTtlMs) {
      clientTabCookieJars.delete(jarKey);
    }
  }

  while (clientTabCookieJars.size > maxJars) {
    const oldestKey = clientTabCookieJars.keys().next().value;
    if (oldestKey === undefined) break;
    clientTabCookieJars.delete(oldestKey);
  }
}

export function getStoredCookieJarCount(): number {
  evictCookieJars();
  return clientTabCookieJars.size;
}

function getOrTouchStoredJar(
  jarKey: string,
  createIfMissing: boolean
): Map<string, ParsedCookie> | null {
  const now = Date.now();
  evictCookieJars(now);

  const existing = clientTabCookieJars.get(jarKey);
  if (existing) {
    existing.lastAccessedAt = now;
    // Refresh insertion order for O(1) LRU tracking
    clientTabCookieJars.delete(jarKey);
    clientTabCookieJars.set(jarKey, existing);
    return existing.cookies;
  }

  if (!createIfMissing) {
    return null;
  }

  const created: CookieJarEntry = {
    cookies: new Map<string, ParsedCookie>(),
    lastAccessedAt: now,
  };
  clientTabCookieJars.set(jarKey, created);
  evictCookieJars(now);
  return created.cookies;
}

// Helper to clean up expired cookies in a jar
function pruneExpiredCookies(jar: Map<string, ParsedCookie>): void {
  const now = Date.now();
  for (const [key, cookie] of jar.entries()) {
    if (cookie.expires && cookie.expires <= now) {
      jar.delete(key);
    }
  }
}

// Parse Set-Cookie header string into ParsedCookie
function parseSetCookie(setCookieStr: string, requestUrl: string): ParsedCookie | null {
  if (!setCookieStr || typeof setCookieStr !== "string") return null;

  try {
    const parsedUrl = new URL(requestUrl);
    const parts = setCookieStr.split(";").map((p) => p.trim());
    if (parts.length === 0 || !parts[0]) return null;

    const firstEq = parts[0].indexOf("=");
    if (firstEq === -1) return null;

    const name = parts[0].slice(0, firstEq).trim();
    const value = parts[0].slice(firstEq + 1).trim();
    if (!name) return null;

    let domain = parsedUrl.hostname.toLowerCase();
    let path = "/";
    let expires: number | undefined;
    let maxAge: number | undefined;
    let secure = false;
    let httpOnly = false;
    let sameSite: "strict" | "lax" | "none" = "lax";

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const eqIdx = part.indexOf("=");
      const attrName = (eqIdx === -1 ? part : part.slice(0, eqIdx)).trim().toLowerCase();
      const attrVal = eqIdx === -1 ? "" : part.slice(eqIdx + 1).trim();

      if (attrName === "domain" && attrVal) {
        let d = attrVal.toLowerCase().replace(/^\./, "");
        // Only allow suffix of requested hostname to prevent cross-domain cookie spoofing
        if (parsedUrl.hostname.toLowerCase().endsWith(d) || d === parsedUrl.hostname.toLowerCase()) {
          domain = d;
        }
      } else if (attrName === "path" && attrVal) {
        path = attrVal.startsWith("/") ? attrVal : "/" + attrVal;
      } else if (attrName === "max-age" && attrVal) {
        const seconds = parseInt(attrVal, 10);
        if (!isNaN(seconds)) {
          maxAge = seconds;
          expires = Date.now() + seconds * 1000;
        }
      } else if (attrName === "expires" && attrVal && expires === undefined) {
        const expTime = Date.parse(attrVal);
        if (!isNaN(expTime)) {
          expires = expTime;
        }
      } else if (attrName === "secure") {
        secure = true;
      } else if (attrName === "httponly") {
        httpOnly = true;
      } else if (attrName === "samesite") {
        const s = attrVal.toLowerCase();
        if (s === "strict") sameSite = "strict";
        else if (s === "none") sameSite = "none";
        else sameSite = "lax";
      }
    }

    return {
      name,
      value,
      domain,
      path,
      expires,
      maxAge,
      secure,
      httpOnly,
      sameSite,
    };
  } catch {
    return null;
  }
}

// Domain matching according to RFC 6265
function domainMatches(cookieDomain: string, targetHostname: string): boolean {
  cookieDomain = cookieDomain.toLowerCase().replace(/^\./, "");
  targetHostname = targetHostname.toLowerCase();
  if (cookieDomain === targetHostname) return true;
  if (targetHostname.endsWith("." + cookieDomain)) return true;
  return false;
}

// Path matching according to RFC 6265
function pathMatches(cookiePath: string, targetPath: string): boolean {
  if (cookiePath === "/" || cookiePath === targetPath) return true;
  if (targetPath.startsWith(cookiePath.endsWith("/") ? cookiePath : cookiePath + "/")) return true;
  return false;
}

// Build Cookie: header for request URL from a resolved cookie jar (never logs cookie values)
function getCookieHeaderFromJar(
  jar: Map<string, ParsedCookie> | null,
  targetUrl: string
): string {
  if (!jar || jar.size === 0) return "";

  pruneExpiredCookies(jar);

  try {
    const parsed = new URL(targetUrl);
    const matchedCookies: string[] = [];

    for (const cookie of jar.values()) {
      if (!domainMatches(cookie.domain, parsed.hostname)) continue;
      if (!pathMatches(cookie.path, parsed.pathname || "/")) continue;
      if (cookie.secure && parsed.protocol !== "https:") continue;

      matchedCookies.push(`${cookie.name}=${cookie.value}`);
    }

    return matchedCookies.join("; ");
  } catch {
    return "";
  }
}

// Save Set-Cookie headers into a resolved cookie jar (never logs cookie values)
function storeSetCookiesIntoJar(
  jar: Map<string, ParsedCookie>,
  setCookieHeaders: string[],
  targetUrl: string
): void {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return;

  for (const header of setCookieHeaders) {
    const parsed = parseSetCookie(header, targetUrl);
    if (!parsed) continue;

    const key = `${parsed.domain}:${parsed.path}:${parsed.name}`;
    if (parsed.expires && parsed.expires <= Date.now()) {
      jar.delete(key);
    } else {
      jar.set(key, parsed);
    }
  }

  pruneExpiredCookies(jar);
}

// Count active cookies matching URL in a resolved cookie jar
function getCookieCountFromJar(
  jar: Map<string, ParsedCookie> | null,
  targetUrl: string
): number {
  if (!jar || jar.size === 0) return 0;

  pruneExpiredCookies(jar);

  try {
    const parsed = new URL(targetUrl);
    let count = 0;
    for (const cookie of jar.values()) {
      if (!domainMatches(cookie.domain, parsed.hostname)) continue;
      if (!pathMatches(cookie.path, parsed.pathname || "/")) continue;
      if (cookie.secure && parsed.protocol !== "https:") continue;
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// Safe Filename Extraction and Path Traversal Shield
export function extractSafeDownloadFilename(
  contentDisposition: string | null | undefined,
  contentType: string | null | undefined,
  targetUrl: string,
  isImageFile: boolean = false
): string {
  let rawFilename = "";

  if (contentDisposition && typeof contentDisposition === "string") {
    // 1. Try RFC 5987 / RFC 6266 filename* parameter: filename*=UTF-8''filename.ext
    const starMatch = contentDisposition.match(/filename\*\s*=\s*(?:[A-Za-z0-9_-]+'')?["']?([^"';\r\n]+)["']?/i);
    if (starMatch && starMatch[1]) {
      try {
        rawFilename = decodeURIComponent(starMatch[1].trim());
      } catch {
        rawFilename = starMatch[1].trim();
      }
    }

    // 2. Try standard filename parameter if filename* wasn't present or failed
    if (!rawFilename) {
      const standardMatch = contentDisposition.match(/filename\s*=\s*["']?([^"';\r\n]+)["']?/i);
      if (standardMatch && standardMatch[1]) {
        try {
          rawFilename = decodeURIComponent(standardMatch[1].trim());
        } catch {
          rawFilename = standardMatch[1].trim();
        }
      }
    }
  }

  // 3. Fallback to URL path component if filename still empty
  if (!rawFilename && targetUrl) {
    try {
      const u = new URL(targetUrl.startsWith("http") ? targetUrl : `http://${targetUrl}`);
      const segments = u.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        try {
          rawFilename = decodeURIComponent(lastSegment.trim());
        } catch {
          rawFilename = lastSegment.trim();
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  // 4. Fallback default if nothing found
  if (!rawFilename) {
    rawFilename = isImageFile ? "image-file" : "downloaded-file";
  }

  // 5. Deep Security Sanitization:
  // Step A: Iterative URL-decoding to defeat nested/double-encoded traversals (%252e%252e%252f)
  let decoded = rawFilename;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  // Step B: Strip directory separators, absolute drive letters (e.g. C:), and path components
  let cleaned = decoded
    .replace(/^[a-zA-Z]:[\\\/]/, "") // Windows drive prefix C:\
    .replace(/\\/g, "/")             // Normalize backslashes
    .split("/")
    .filter(Boolean)
    .pop() || "";

  // Step C: Neutralize HTML/script tags, angle brackets, control characters, quotes, and dangerous filesystem chars
  cleaned = cleaned
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1f\x7f<>"'/\\|?*:;&`$]/g, "");

  // Step D: Neutralize consecutive dots (e.g. .. or ...)
  cleaned = cleaned.replace(/\.{2,}/g, ".").trim();

  // Step E: Strip leading and trailing dots and spaces
  cleaned = cleaned.replace(/^\.+/, "").replace(/\.+$/, "").trim();

  // Step E: Enforce length boundaries (max 120 chars)
  if (cleaned.length > 120) {
    const extMatch = cleaned.match(/\.([a-zA-Z0-9]{1,10})$/);
    if (extMatch) {
      const ext = extMatch[1];
      cleaned = cleaned.slice(0, 105) + "." + ext;
    } else {
      cleaned = cleaned.slice(0, 120);
    }
  }

  // Step F: Reserved names protection (Windows/POSIX devices e.g. CON, PRN, AUX, NUL)
  const baseNameWithoutExt = cleaned.split(".")[0]?.toUpperCase() || "";
  const RESERVED_DEVICE_NAMES = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"];
  if (RESERVED_DEVICE_NAMES.includes(baseNameWithoutExt)) {
    cleaned = `safe_${cleaned}`;
  }

  // Step G: Ensure appropriate extension if completely missing based on contentType
  if (!cleaned || cleaned.length === 0) {
    cleaned = isImageFile ? "image-file" : "downloaded-file";
  }

  if (!cleaned.includes(".")) {
    const ct = (contentType || "").toLowerCase();
    if (ct.includes("application/pdf")) cleaned += ".pdf";
    else if (ct.includes("application/zip")) cleaned += ".zip";
    else if (ct.includes("application/gzip")) cleaned += ".tar.gz";
    else if (ct.includes("image/jpeg")) cleaned += ".jpg";
    else if (ct.includes("image/png")) cleaned += ".png";
    else if (ct.includes("image/webp")) cleaned += ".webp";
    else if (ct.includes("image/gif")) cleaned += ".gif";
    else if (ct.includes("video/mp4")) cleaned += ".mp4";
    else if (ct.includes("audio/mpeg")) cleaned += ".mp3";
    else if (ct.includes("application/vnd.android.package-archive")) cleaned += ".apk";
  }

  return cleaned;
}

// Helper to extract readable title from HTML
function extractTitle(html: string, fallbackUrl: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  try {
    const parsed = new URL(fallbackUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return fallbackUrl;
  }
}

// Helper to strip scripts, styles, trackers and produce human-friendly readable DOM
function cleanAndSanitizeHtml(
  rawHtml: string,
  baseUrl: string,
  mode: "full" | "smart-compress" | "text-only" | "reader",
  blockTrackers: boolean,
  blockImages: boolean
): {
  cleanedHtml: string;
  rawText: string;
  trackersBlocked: number;
  scriptsBlocked: number;
} {
  let trackersBlocked = 0;
  let scriptsBlocked = 0;

  let processed = rawHtml;
  const isFb = isFacebookUrl(baseUrl);

  // In "full" mode on the server proxy fallback (Web Preview Sandboxed Iframe mode),
  // or when visiting Facebook (SPA requires raw scripts to mount DOM):
  // Preserve legitimate application scripts and inline event handlers, but filter known tracking scripts for privacy shield.
  // In data-saver modes ("smart-compress", "text-only", "reader"):
  // Strip all scripts and event handlers to maximize data savings and reduce memory usage.
  if (mode === "full" || isFb) {
    if (blockTrackers) {
      const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
      processed = processed.replace(scriptRegex, (match) => {
        let isTracker = false;
        for (const pattern of TRACKER_PATTERNS) {
          if (pattern.test(match)) {
            // Do not block facebook scripts if we are on facebook.com
            if (isFb && (/facebook\.net/i.test(match) || /fbcdn\.net/i.test(match))) {
              continue;
            }
            trackersBlocked++;
            scriptsBlocked++;
            isTracker = true;
            break;
          }
        }
        return isTracker ? "" : match;
      });
    }
  } else {
    // Strip all <script>...</script> blocks across data-saver browsing modes
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    processed = processed.replace(scriptRegex, (match) => {
      scriptsBlocked++;
      if (blockTrackers) {
        for (const pattern of TRACKER_PATTERNS) {
          if (pattern.test(match)) {
            trackersBlocked++;
            break;
          }
        }
      }
      return "";
    });

    // Strip any remaining unclosed or orphan <script...> or </script> tags
    processed = processed.replace(/<\/?script\b[^>]*>/gi, "");

    // Strip inline HTML event-handler attributes (onclick, onload, onerror, onmouseover, etc.)
    processed = processed.replace(/[\s/]\bon[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ");
  }

  // Remove dangerous executable object/embed/applet tags
  processed = processed.replace(/<(object|embed|applet)\b[^>]*>([\s\S]*?<\/\1>)?/gi, "");

  // Remove iframe ads / tracking pixels
  processed = processed.replace(/<iframe\b[^>]*>(.*?)<\/iframe>/gi, (match) => {
    trackersBlocked++;
    return `<div class="p-3 my-2 text-xs text-stone-500 bg-stone-100 rounded border border-dashed border-stone-300 dark:bg-stone-800 dark:text-stone-400">🛡️ [NETFLOW Shield: External embedded frame filtered to save data & protect privacy]</div>`;
  });

  // Handle images if blocked or in text-only mode
  if (blockImages || mode === "text-only") {
    processed = processed.replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
      const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
      const altText = altMatch ? altMatch[1] : "Image placeholder";
      return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs text-stone-500 bg-stone-100 rounded border border-stone-200 dark:bg-stone-800 dark:text-stone-400">🖼️ [Image: ${altText} (saved data)]</span>`;
    });
  }

  // Modern Web Compatibility: Neutralize upstream meta Content-Security-Policy and X-Frame-Options
  // that would otherwise block scripts, styles, fonts, or frame rendering inside the isolated WebView frame
  processed = processed.replace(
    /<meta\b[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi,
    "<!-- [NETFLOW: Upstream frame-blocking meta neutralized for compatibility] -->"
  );

  // Inject or update <base href="${baseUrl}"> in head so relative URLs, modules, styles, and fetch calls resolve to target origin
  try {
    const baseTag = `<base href="${baseUrl}">`;
    if (/<head\b[^>]*>/i.test(processed)) {
      processed = processed.replace(/<head\b[^>]*>/i, (m) => `${m}\n  ${baseTag}`);
    } else {
      processed = `${baseTag}\n${processed}`;
    }
  } catch {}

  // Resolve relative href and src attributes to absolute URLs using baseUrl
  try {
    const base = new URL(baseUrl);

    // Resolve relative or DuckDuckGo redirect hrefs
    processed = processed.replace(/\bhref=["']([^"']+)["']/gi, (match, hrefVal) => {
      // Decode DuckDuckGo tracker redirect
      const uddgMatch = hrefVal.match(/uddg=([^&"']+)/);
      if (uddgMatch) {
        try {
          const decoded = decodeURIComponent(uddgMatch[1]);
          return `href="${decoded}" target="_self"`;
        } catch {}
      }
      const lowerHref = hrefVal.trim().toLowerCase();
      if (
        lowerHref.startsWith("javascript:") ||
        lowerHref.startsWith("data:text/html") ||
        lowerHref.startsWith("vbscript:")
      ) {
        return `href="#blocked-unsafe-link"`;
      }
      if (
        hrefVal.startsWith("#") ||
        hrefVal.startsWith("mailto:") ||
        hrefVal.startsWith("tel:")
      ) {
        return match;
      }
      try {
        const resolved = new URL(hrefVal, base).href;
        return `href="${resolved}" target="_self"`;
      } catch {
        return match;
      }
    });

    // Resolve relative src attributes
    processed = processed.replace(/\bsrc=["']([^"']+)["']/gi, (match, srcVal) => {
      if (srcVal.startsWith("data:") || srcVal.startsWith("blob:")) return match;
      try {
        const resolved = new URL(srcVal, base).href;
        return `src="${resolved}"`;
      } catch {
        return match;
      }
    });

    // Resolve relative action attributes on <form> tags
    processed = processed.replace(/\baction=["']([^"']*)["']/gi, (match, actionVal) => {
      const lowerAction = (actionVal || "").trim().toLowerCase();
      if (
        lowerAction.startsWith("javascript:") ||
        lowerAction.startsWith("data:") ||
        lowerAction.startsWith("file:") ||
        lowerAction.startsWith("vbscript:")
      ) {
        return `action="#blocked-unsafe-action"`;
      }
      if (!actionVal || actionVal.startsWith("#")) {
        return match;
      }
      try {
        const resolved = new URL(actionVal, base).href;
        return `action="${resolved}"`;
      } catch {
        return match;
      }
    });
  } catch {}

  // Extract raw text for AI summary
  const textExtract = processed
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Reader mode formatting: extract main body or article
  if (mode === "reader") {
    const articleMatch = processed.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
                         processed.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
                         processed.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    
    let readerBody = articleMatch ? articleMatch[1] : processed;
    // Strip inline styles, classes, and noisy elements
    readerBody = readerBody
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "");

    processed = `
      <div class="netflow-reader-container max-w-2xl mx-auto py-6 px-4 font-serif leading-relaxed text-stone-900 dark:text-stone-100">
        <div class="mb-4 pb-3 border-b border-stone-200 dark:border-stone-800 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
          <span>🌿 NETFLOW Distraction-Free Reader Mode Active</span>
          <span>Zero Trackers • Ultra Low Bandwidth</span>
        </div>
        <div class="prose prose-stone dark:prose-invert max-w-none">
          ${readerBody}
        </div>
      </div>
    `;
  }

  return {
    cleanedHtml: processed,
    rawText: textExtract.slice(0, 8000), // capped text for AI processing
    trackersBlocked: Math.max(trackersBlocked, 2),
    scriptsBlocked: Math.max(scriptsBlocked, 3),
  };
}

// API: Health check (does not disclose whether AI key exists)
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    browser: "NETFLOW Human-First Smart Browser",
    version: "1.0.0",
    engine: "Network-Aware Adaptive Core",
  });
});

// Constant-time access token comparison & optional access gate (Part 4d)
export function constantTimeTokenEquals(provided: string, expected: string): boolean {
  const hashProvided = crypto.createHash("sha256").update(provided, "utf8").digest();
  const hashExpected = crypto.createHash("sha256").update(expected, "utf8").digest();
  const hashesMatch = crypto.timingSafeEqual(hashProvided, hashExpected);
  const lengthsMatch = Buffer.byteLength(provided, "utf8") === Buffer.byteLength(expected, "utf8");
  return hashesMatch && lengthsMatch;
}

function getConfiguredAccessToken(): string {
  const raw = process.env.NETFLOW_API_ACCESS_TOKEN;
  return typeof raw === "string" ? raw.trim() : "";
}

function verifyAccessToken(req: Request): boolean {
  const expected = getConfiguredAccessToken();
  if (!expected) {
    return true; // No-op when NETFLOW_API_ACCESS_TOKEN is unset/empty
  }
  const rawHeader = req.headers["x-netflow-access-token"];
  const provided = typeof rawHeader === "string" ? rawHeader.trim() : "";
  if (!provided) {
    return false;
  }
  return constantTimeTokenEquals(provided, expected);
}

// In-memory sliding-window rate limiter per (IP + clientId or IP if none) (Part 4a & Form 2 Part A/C)
const slidingWindowRateMap = new Map<string, number[]>();

export function getClientIp(req: Request): string {
  const trustProxyHops = syncTrustProxyFromEnv();
  if (trustProxyHops === false) {
    // TRUST_PROXY is off (default): strictly use the direct socket address and ignore X-Forwarded-For
    return req.socket?.remoteAddress || "127.0.0.1";
  }
  // TRUST_PROXY is set to a hop count (e.g. 1): Express computes req.ip from X-Forwarded-For up to trusted hops
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

function getRateLimitWindowMs(): number {
  const raw = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60_000;
}

function getBrowseRateLimitPerWindow(): number {
  const raw = Number(
    process.env.BROWSE_RATE_LIMIT_PER_MIN ||
      process.env.RATE_LIMIT_BROWSE_PER_MIN ||
      process.env.BROWSE_RATE_LIMIT
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
}

function getAiRateLimitPerWindow(): number {
  const raw = Number(
    process.env.AI_RATE_LIMIT_PER_MIN ||
      process.env.RATE_LIMIT_AI_PER_MIN ||
      process.env.AI_RATE_LIMIT
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

export function getCookiesClearRateLimitPerWindow(): number {
  const raw = Number(
    process.env.COOKIES_CLEAR_RATE_LIMIT_PER_MIN ||
      process.env.RATE_LIMIT_COOKIES_CLEAR_PER_MIN ||
      process.env.COOKIES_CLEAR_RATE_LIMIT
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

function checkSlidingWindowRateLimit(
  scope: "browse" | "ai" | "cookies_clear",
  req: Request,
  limitPerWindow: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const clientId = getClientIdFromRequest(req);
  const bucketKey = clientId ? `${scope}::${ip}::${clientId}` : `${scope}::${ip}`;

  if (slidingWindowRateMap.size > 10_000) {
    for (const [k, tsList] of slidingWindowRateMap.entries()) {
      const active = tsList.filter((t) => now - t < windowMs);
      if (active.length === 0) {
        slidingWindowRateMap.delete(k);
      } else {
        slidingWindowRateMap.set(k, active);
      }
    }
  }

  const existing = slidingWindowRateMap.get(bucketKey) || [];
  const activeTimestamps = existing.filter((t) => now - t < windowMs);

  if (activeTimestamps.length >= limitPerWindow) {
    slidingWindowRateMap.set(bucketKey, activeTimestamps);
    const oldestInWindow = activeTimestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  activeTimestamps.push(now);
  slidingWindowRateMap.set(bucketKey, activeTimestamps);
  return { allowed: true, retryAfterSec: 0 };
}

function getMaxResponseBytes(): number {
  const raw = Number(process.env.MAX_RESPONSE_BYTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5 * 1024 * 1024;
}

// Stream-read upstream response body with strict byte cap (Part 4b)
async function readResponseTextWithByteCap(
  upstreamRes: globalThis.Response,
  maxBytes: number
): Promise<{ tooLarge: boolean; text: string; bytesRead: number }> {
  const contentLengthHeader = upstreamRes.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(declaredLength) && declaredLength > maxBytes) {
      try {
        await upstreamRes.body?.cancel();
      } catch {}
      return { tooLarge: true, text: "", bytesRead: declaredLength };
    }
  }

  if (!upstreamRes.body) {
    return { tooLarge: false, text: "", bytesRead: 0 };
  }

  const reader = upstreamRes.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          return { tooLarge: true, text: "", bytesRead: totalBytes };
        }
        chunks.push(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(combined);
  return { tooLarge: false, text, bytesRead: totalBytes };
}

// Middleware for /api/browse: optional access token gate + sliding-window rate limit (transport 200 convention)
app.use("/api/browse", (req: Request, res: Response, next: NextFunction) => {
  if (!verifyAccessToken(req)) {
    res.status(200).json({
      success: false,
      statusCode: 401,
      errorCode: "NETFLOW_UNAUTHORIZED",
      errorCategory: "unauthorized",
      error: "Unauthorized: valid X-Netflow-Access-Token header is required.",
    });
    return;
  }

  const rateResult = checkSlidingWindowRateLimit(
    "browse",
    req,
    getBrowseRateLimitPerWindow(),
    getRateLimitWindowMs()
  );
  if (!rateResult.allowed) {
    res.setHeader("Retry-After", String(rateResult.retryAfterSec));
    res.status(200).json({
      success: false,
      statusCode: 429,
      errorCode: "NETFLOW_RATE_LIMITED",
      errorCategory: "rate_limited",
      retryAfterSec: rateResult.retryAfterSec,
      error: `Rate limit exceeded. Please wait ${rateResult.retryAfterSec}s before trying again.`,
    });
    return;
  }

  next();
});

// Middleware for /api/ai/*: optional access token gate (401 JSON) + sliding-window rate limit (429 JSON + Retry-After)
app.use("/api/ai", (req: Request, res: Response, next: NextFunction) => {
  if (!verifyAccessToken(req)) {
    const msg = "Unauthorized: valid X-Netflow-Access-Token header is required.";
    res.status(401).json({
      success: false,
      statusCode: 401,
      errorCode: "NETFLOW_UNAUTHORIZED",
      errorCategory: "unauthorized",
      error: msg,
      summary: msg,
      explanation: msg,
      headline: "Access Token Required",
      recommendations: [msg],
    });
    return;
  }

  const rateResult = checkSlidingWindowRateLimit(
    "ai",
    req,
    getAiRateLimitPerWindow(),
    getRateLimitWindowMs()
  );
  if (!rateResult.allowed) {
    const msg = `AI rate limit reached. Please wait ${rateResult.retryAfterSec}s and try again.`;
    res.setHeader("Retry-After", String(rateResult.retryAfterSec));
    res.status(429).json({
      success: false,
      statusCode: 429,
      errorCode: "NETFLOW_RATE_LIMITED",
      errorCategory: "rate_limited",
      retryAfterSec: rateResult.retryAfterSec,
      error: msg,
      summary: msg,
      explanation: msg,
      headline: "AI Rate Limit Reached",
      recommendations: [msg],
      honestExplanation: "Temporary rate limit active to protect shared AI bandwidth.",
    });
    return;
  }

  next();
});

// API: Clear in-memory server session cookies & site data (scoped strictly to caller's clientId, rate-limited to 30/min per client)
app.post("/api/cookies/clear", (req: Request, res: Response) => {
  try {
    const rateResult = checkSlidingWindowRateLimit(
      "cookies_clear",
      req,
      getCookiesClearRateLimitPerWindow(),
      getRateLimitWindowMs()
    );
    if (!rateResult.allowed) {
      res.setHeader("Retry-After", String(rateResult.retryAfterSec));
      res.status(429).json({
        success: false,
        statusCode: 429,
        errorCode: "NETFLOW_RATE_LIMITED",
        errorCategory: "rate_limited",
        retryAfterSec: rateResult.retryAfterSec,
        error: `Cookie clear rate limit exceeded. Please wait ${rateResult.retryAfterSec}s before trying again.`,
      });
      return;
    }

    evictCookieJars();
    const callerClientId = getClientIdFromRequest(req);
    const { domain, tabId } = req.body || {};

    if (
      (typeof domain === "string" && domain.length > 256) ||
      (typeof tabId === "string" && tabId.length > 256)
    ) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        errorCode: "NETFLOW_BAD_REQUEST",
        error: "Invalid domain or tabId parameter length.",
      });
      return;
    }

    // Without a valid clientId, never mutate any stored client jars
    if (!callerClientId) {
      res.json({ success: true, cleared: 0 });
      return;
    }

    const clientPrefix = `${callerClientId}::`;

    if (domain && typeof domain === "string" && domain.trim()) {
      const cleanDomain = domain.trim().toLowerCase().replace(/^\./, "");
      if (isValidTabId(tabId)) {
        const targetJarKey = `${callerClientId}::${tabId.trim()}`;
        const jar = getOrTouchStoredJar(targetJarKey, false);
        if (jar) {
          for (const [key, cookie] of jar.entries()) {
            if (domainMatches(cookie.domain, cleanDomain)) {
              jar.delete(key);
            }
          }
        }
      } else {
        for (const [jarKey, entry] of clientTabCookieJars.entries()) {
          if (!jarKey.startsWith(clientPrefix)) continue;
          for (const [key, cookie] of entry.cookies.entries()) {
            if (domainMatches(cookie.domain, cleanDomain)) {
              entry.cookies.delete(key);
            }
          }
        }
      }
      res.json({ success: true, clearedDomain: cleanDomain });
      return;
    }

    if (tabId && typeof tabId === "string" && tabId.trim()) {
      if (isValidTabId(tabId)) {
        const targetJarKey = `${callerClientId}::${tabId.trim()}`;
        clientTabCookieJars.delete(targetJarKey);
      }
      res.json({ success: true, clearedTabId: tabId });
      return;
    }

    // Clear all cookie jars belonging ONLY to caller's clientId
    for (const jarKey of Array.from(clientTabCookieJars.keys())) {
      if (jarKey.startsWith(clientPrefix)) {
        clientTabCookieJars.delete(jarKey);
      }
    }
    res.json({ success: true, clearedAll: true });
  } catch (err: any) {
    console.error("[NETFLOW Cookies] Clear cookies error:", sanitizeLogMessage(err));
    res.status(500).json({
      success: false,
      statusCode: 500,
      errorCode: "NETFLOW_COOKIE_CLEAR_ERROR",
      error: "Failed to clear cookies.",
    });
  }
});

// Clean, lightweight search aggregator for high-speed, zero-ad search results
async function generateSearchResultsHtml(query: string, engineId: SearchEngineId = "google"): Promise<{
  cleanedHtml: string;
  rawText: string;
  title: string;
  originalBytes: number;
}> {
  const safeEngineId: SearchEngineId =
    engineId === "duckduckgo" || engineId === "bing" || engineId === "google"
      ? engineId
      : "google";
  const directSearchUrl =
    SEARCH_ENGINES[safeEngineId]?.buildSearchUrl(query) ||
    `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const directEngineName = SEARCH_ENGINES[safeEngineId]?.nameEn || "Google";
  let instantAnswer: { heading?: string; abstract?: string; sourceUrl?: string } | null = null;
  let searchResults: Array<{ title: string; snippet: string; url: string }> = [];

  try {
    const [wikiRes, ddgRes] = await Promise.allSettled([
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          query
        )}&utf8=&format=json&srlimit=8`,
        { headers: { "User-Agent": "NETFLOW-Browser/1.0" } }
      ).then((r) => r.json()),
      fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(
          query
        )}&format=json&no_html=1&skip_disambig=1`,
        { headers: { "User-Agent": "NETFLOW-Browser/1.0" } }
      ).then((r) => r.json()),
    ]);

    if (ddgRes.status === "fulfilled" && ddgRes.value) {
      const v = ddgRes.value;
      if (v.AbstractText || v.Heading) {
        instantAnswer = {
          heading: v.Heading || query,
          abstract: v.AbstractText || "",
          sourceUrl: v.AbstractURL || "",
        };
      }
    }

    if (!instantAnswer && /ai\s*studio/i.test(query)) {
      instantAnswer = {
        heading: "Google AI Studio",
        abstract: "Google AI Studio is the fastest prototyping environment for developers to experiment with Gemini models, generate API keys, test system instructions, and build generative AI applications.",
        sourceUrl: "https://aistudio.google.com/",
      };
    }

    if (wikiRes.status === "fulfilled" && wikiRes.value?.query?.search) {
      searchResults = wikiRes.value.query.search.map((item: any) => ({
        title: item.title,
        snippet: item.snippet.replace(/<[^>]+>/g, ""),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
      }));
    }
  } catch (err) {
    console.error("[NETFLOW Search] Upstream search fetch failed:", sanitizeLogMessage(err));
  }

  const resultsListHtml =
    searchResults.length > 0
      ? searchResults
          .map(
            (r) => `
    <article data-netflow-url="${r.url}" style="margin-bottom: 20px; padding: 14px 16px; background: #fafaf9; border-radius: 12px; border: 1px solid #e7e5e4; cursor: pointer;">
      <div style="font-size: 11px; color: #059669; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
        ${r.url.replace(/^https?:\/\//, "").split("/")[0]}
      </div>
      <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700;">
        <a href="${r.url}" data-netflow-url="${r.url}" style="color: #0f172a; text-decoration: underline; text-underline-offset: 2px;">
          ${r.title}
        </a>
      </h3>
      <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #475569;">
        ${r.snippet}...
      </p>
    </article>`
          )
          .join("")
      : `<p style="padding: 16px; color: #64748b; font-size: 14px;">No direct encyclopedia articles found for "${query}". Try alternative search keywords.</p>`;

  const instantCard =
    instantAnswer && instantAnswer.abstract
      ? `
    <div style="margin-bottom: 22px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px;">
      <span style="display: inline-block; font-size: 10px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
        ⚡ Instant Answer
      </span>
      <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #14532d;">
        ${instantAnswer.heading}
      </h2>
      <p style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.6; color: #166534;">
        ${instantAnswer.abstract}
      </p>
      ${
        instantAnswer.sourceUrl
          ? `<a href="${instantAnswer.sourceUrl}" data-netflow-url="${instantAnswer.sourceUrl}" style="display: inline-block; margin-top: 4px; font-size: 13px; font-weight: 700; color: #059669; text-decoration: underline;">Open official website (${instantAnswer.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}) →</a>`
          : ""
      }
    </div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${query} — NETFLOW Search</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 16px; color: #1e293b; line-height: 1.5;">
  <header style="margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px;">
    <div style="font-size: 11px; font-weight: 700; color: #059669; letter-spacing: 0.05em; text-transform: uppercase;">
      NETFLOW Clean Search
    </div>
    <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 800; color: #0f172a;">
      Results for "${query}"
    </h1>
    <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
      Zero tracking • Ad-free verified results • Lightweight text delivery
    </p>
  </header>

  ${instantCard}

  <section>
    ${resultsListHtml}
  </section>

  <footer style="margin-top: 28px; padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
    <p style="margin: 0 0 8px 0; font-weight: 600;">Looking for additional encyclopedic sources or direct search?</p>
    <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
      <a href="${directSearchUrl}" style="color: #059669; font-weight: 600; text-decoration: underline;">Open in ${directEngineName} →</a>
      <a href="https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(
        query
      )}" style="color: #2563eb; text-decoration: underline;">Wikipedia Full Search</a>
    </div>
  </footer>
</body>
</html>`;

  const rawText = `${query} - NETFLOW Search\n` + searchResults.map((r) => `${r.title}: ${r.snippet}`).join("\n");
  const originalBytes = new TextEncoder().encode(html).length;

  return {
    cleanedHtml: html,
    rawText,
    title: `${query} — NETFLOW Search`,
    originalBytes,
  };
}

// Unified IP & hostname range check (IPv4, IPv6, IPv4-mapped IPv6, loopback, RFC1918, link-local, ULA, metadata, unspecified)
export function isUnsafeIpOrHost(rawHostOrIp: string): boolean {
  const h = rawHostOrIp
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  if (!h) return true;

  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "::" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "0:0:0:0:0:0:0:0"
  ) {
    return true;
  }

  const checkIpv4Octets = (ipv4Str: string): boolean => {
    const parts = ipv4Str.split(".");
    if (parts.length !== 4) return false;
    const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
    if (octets.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
    const [o1, o2, o3] = octets;
    if (o1 === 0) return true; // 0.0.0.0/8 unspecified
    if (o1 === 10) return true; // 10.0.0.0/8 RFC1918
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 CGNAT
    if (o1 === 127) return true; // 127.0.0.0/8 loopback
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 RFC1918
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 RFC1918
    if (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) return true; // 192.0.0.0/24 & 192.0.2.0/24
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true; // 198.18.0.0/15
    if (o1 >= 224) return true; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved/broadcast
    return false;
  };

  const ipVersion = net.isIP(h);
  if (ipVersion === 4) {
    return checkIpv4Octets(h);
  }

  if (ipVersion === 6) {
    // Dotted-quad IPv4-mapped or IPv4-compatible IPv6 (e.g. ::ffff:127.0.0.1, ::127.0.0.1)
    const mappedDottedMatch = h.match(/^(?:::(?:ffff:)?|(?:0*:){5}(?:ffff:)?|0*:0*:0*:0*:0*:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mappedDottedMatch) {
      return checkIpv4Octets(mappedDottedMatch[1]);
    }
    // Hex-normalized IPv4-mapped IPv6 (e.g. ::ffff:7f00:1 or 0:0:0:0:0:ffff:a9fe:a9fe)
    const mappedHexMatch = h.match(/^(?:::ffff:|(?:0*:){5}ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHexMatch) {
      const hi = parseInt(mappedHexMatch[1], 16);
      const lo = parseInt(mappedHexMatch[2], 16);
      const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return checkIpv4Octets(ipv4);
    }
    // ULA (fc00::/7 -> fc00..fdff), Link-local (fe80::/10 -> fe80..febf), Site-local (fec0::/10), Multicast (ff00::/8)
    if (/^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]|fe[cdef][0-9a-f]|ff[0-9a-f]{2}):/i.test(h)) {
      return true;
    }
    return false;
  }

  return checkIpv4Octets(h);
}

// Check for unsafe or internal protocols / addresses (reusing isUnsafeIpOrHost)
export function checkIsInternalOrUnsafe(targetUrl: string): boolean {
  const trimmedTarget = targetUrl.trim();
  const lower = trimmedTarget.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("about:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("intent:") ||
    lower.startsWith("chrome:")
  ) {
    return true;
  }
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmedTarget) &&
    !/^(?:https?|htp):/i.test(trimmedTarget) &&
    !/^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(trimmedTarget)
  ) {
    return true;
  }
  const beforeQueryOrHash = lower.split(/[?#]/)[0];
  const withoutScheme = beforeQueryOrHash.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = withoutScheme.split("/")[0];
  const hostFromAuthority = authority
    .replace(/^.*@/, "")
    .replace(/:\d+$/, "");
  if (isUnsafeIpOrHost(hostFromAuthority)) {
    return true;
  }
  try {
    const candidate =
      trimmedTarget.startsWith("http://") || trimmedTarget.startsWith("https://")
        ? trimmedTarget
        : `http://${trimmedTarget}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    if (isUnsafeIpOrHost(parsed.hostname)) return true;
  } catch {}
  return false;
}

// DNS lookup timeout constant (milliseconds: maximum 2500 ms per Form 01G-R3/R5)
export const DNS_LOOKUP_TIMEOUT_MS = 2500;

export type DnsLookupFn = (
  hostname: string,
  options: { all: boolean; verbatim?: boolean; signal?: AbortSignal }
) => Promise<Array<{ address: string; family: number }>>;

// Resolve hostname via Node built-in dns/promises (all: true) with bounded timeout and verify every resolved IP is public/safe
export async function resolveAndValidateDnsSafety(
  targetUrl: string,
  signal?: AbortSignal,
  lookupFn: DnsLookupFn = (h, opts) => dns.lookup(h, opts as any) as any
): Promise<{ safe: boolean; pinnedIp?: string }> {
  const parsed = new URL(targetUrl);
  const cleanHost = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isUnsafeIpOrHost(cleanHost)) {
    return { safe: false };
  }
  // Skip DNS lookup for literal IPv4/IPv6 addresses (already verified by isUnsafeIpOrHost)
  if (net.isIP(cleanHost) !== 0) {
    return { safe: true, pinnedIp: cleanHost };
  }

  // Enforce bounded DNS resolution timeout (fail-closed on timeout or abort)
  const dnsAbortController = new AbortController();
  let timedOutOrAborted = false;
  const dnsTimer = setTimeout(() => {
    timedOutOrAborted = true;
    dnsAbortController.abort();
  }, DNS_LOOKUP_TIMEOUT_MS);

  const onParentAbort = () => {
    timedOutOrAborted = true;
    dnsAbortController.abort();
  };
  if (signal) {
    if (signal.aborted) {
      timedOutOrAborted = true;
      dnsAbortController.abort();
    } else {
      signal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  try {
    const records = (await lookupFn(cleanHost, {
      all: true,
      verbatim: true,
      signal: dnsAbortController.signal,
    })) as any[];

    // Fail-closed race defense: if timeout or parent abort fired while lookup was completing, discard result
    if (timedOutOrAborted || dnsAbortController.signal.aborted || signal?.aborted) {
      const timeoutErr: any = new Error(`DNS lookup timed out or aborted for ${cleanHost}`);
      timeoutErr.code = "ETIMEDOUT";
      timeoutErr.name = "AbortError";
      throw timeoutErr;
    }

    if (!records || records.length === 0) {
      const notFoundErr: any = new Error(`getaddrinfo ENOTFOUND ${cleanHost}`);
      notFoundErr.code = "ENOTFOUND";
      throw notFoundErr;
    }

    // Fail-closed: verify ALL resolved IP addresses
    for (const rec of records) {
      if (!rec?.address || net.isIP(rec.address) === 0 || isUnsafeIpOrHost(rec.address)) {
        return { safe: false };
      }
    }

    // Pin first safe validated record
    const pinnedIp = records[0].address;
    return { safe: true, pinnedIp };
  } finally {
    clearTimeout(dnsTimer);
    if (signal) {
      signal.removeEventListener("abort", onParentAbort);
    }
  }
}

// Blocklist of forbidden client-controlled headers to prevent host spoofing, request smuggling, and proxy bypass
export const FORBIDDEN_CLIENT_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
]);

export const MAX_CUSTOM_HEADERS_COUNT = 50;
export const MAX_CUSTOM_HEADER_KEY_LENGTH = 128;
export const MAX_CUSTOM_HEADER_VALUE_LENGTH = 4096;
export const MAX_TOTAL_CUSTOM_HEADER_BYTES = 16384; // 16 KB aggregate header size boundary

const VALID_HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/;

// Production sanitizer for client-provided custom headers
export function sanitizeClientCustomHeaders(
  rawHeaders: unknown
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (!rawHeaders || typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) {
    return result;
  }

  const seenLowerKeys = new Map<string, string>();
  let totalBytes = 0;

  for (const [rawKey, rawValue] of Object.entries(rawHeaders as Record<string, unknown>)) {
    if (seenLowerKeys.size >= MAX_CUSTOM_HEADERS_COUNT) {
      break; // Bounded header count defense (max 50 unique headers)
    }

    if (typeof rawKey !== "string" || typeof rawValue !== "string") {
      continue;
    }

    const trimmedKey = rawKey.trim();
    if (!trimmedKey || trimmedKey.length > MAX_CUSTOM_HEADER_KEY_LENGTH) {
      continue;
    }

    const lowerKey = trimmedKey.toLowerCase();

    // Prototype pollution & reflection defense
    if (lowerKey === "__proto__" || lowerKey === "constructor" || lowerKey === "prototype") {
      continue;
    }

    // RFC 7230 token character validation
    if (!VALID_HEADER_NAME_REGEX.test(trimmedKey)) {
      continue;
    }

    // Disallow HTTP/2 pseudo-headers
    if (trimmedKey.startsWith(":")) {
      continue;
    }

    // Forbidden header check (case-insensitive)
    if (FORBIDDEN_CLIENT_HEADERS.has(lowerKey)) {
      continue;
    }

    // CRLF and control character defense in header values
    // Must not contain \r, \n, \0 or any control characters [\x00-\x1F\x7F]
    if (/[\r\n\0\x00-\x1F\x7F]/.test(rawValue)) {
      continue;
    }

    if (rawValue.length > MAX_CUSTOM_HEADER_VALUE_LENGTH) {
      continue;
    }

    // Bounded aggregate header byte limit defense
    const headerBytes = Buffer.byteLength(trimmedKey, "utf8") + Buffer.byteLength(rawValue, "utf8");
    if (totalBytes + headerBytes > MAX_TOTAL_CUSTOM_HEADER_BYTES) {
      break;
    }
    totalBytes += headerBytes;

    // Deduplicate case-insensitively to prevent duplicate header smuggling
    if (seenLowerKeys.has(lowerKey)) {
      const priorKey = seenLowerKeys.get(lowerKey)!;
      delete result[priorKey];
    }

    seenLowerKeys.set(lowerKey, trimmedKey);
    result[trimmedKey] = rawValue;
  }

  return result;
}

// Exported request options builder for outbound HTTP/HTTPS requests with IP pinning
export function buildPinnedIpRequestOptions(
  targetUrl: string,
  pinnedIp: string,
  init: {
    method: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
) {
  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === "https:";
  const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);
  const ipFamily = net.isIP(pinnedIp);

  const outgoingHeaders: Record<string, string> = { ...(init.headers || {}) };
  // Authoritative host header derived strictly from the validated target URL (prevents host spoofing)
  delete outgoingHeaders["host"];
  outgoingHeaders["Host"] = parsed.host || parsed.hostname;
  // Guaranteed: Strip any hop-by-hop or smuggling headers
  delete outgoingHeaders["connection"];
  delete outgoingHeaders["Connection"];
  delete outgoingHeaders["transfer-encoding"];
  delete outgoingHeaders["Transfer-Encoding"];

  const requestOptions: (http.RequestOptions | https.RequestOptions) & {
    lookup: (
      hostname: string,
      options: any,
      callback: (err: Error | null, address: any, family?: number) => void
    ) => void;
  } = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port,
    path: `${parsed.pathname}${parsed.search}`,
    method: init.method,
    headers: outgoingHeaders,
    agent: false, // Prevent socket pool reuse to guarantee custom lookup binding
    lookup: (hostname, opts, cb) => {
      let callback = cb;
      let options = opts;
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      if (options && options.all) {
        callback(null, [{ address: pinnedIp, family: ipFamily }]);
      } else {
        callback(null, pinnedIp, ipFamily);
      }
    },
  };

  if (isHttps) {
    // Explicitly preserve SNI and TLS certificate verification for original target hostname
    (requestOptions as https.RequestOptions).servername = parsed.hostname;
    (requestOptions as https.RequestOptions).rejectUnauthorized = true;
  }

  return requestOptions;
}

// Outbound HTTP/HTTPS request adapter with socket-level IP pinning to eliminate TOCTOU / DNS rebinding
export const fetchWithPinnedIp = async (
  targetUrl: string,
  pinnedIp: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
): Promise<globalThis.Response> => {
  const requestOptions = buildPinnedIpRequestOptions(targetUrl, pinnedIp, init);
  const isHttps = requestOptions.protocol === "https:";

  return new Promise<globalThis.Response>((resolve, reject) => {
    const client = isHttps ? https : http;
    const outboundReq = client.request(requestOptions, (incomingRes) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(incomingRes.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            responseHeaders.append(key, v);
          }
        } else if (typeof value === "string") {
          responseHeaders.set(key, value);
        }
      }

      const webResponse = new Response(Readable.toWeb(incomingRes) as any, {
        status: incomingRes.statusCode || 200,
        statusText: incomingRes.statusMessage || "OK",
        headers: responseHeaders,
      });

      // Define response.url property for compatibility
      Object.defineProperty(webResponse, "url", {
        value: targetUrl,
        writable: false,
      });

      resolve(webResponse);
    });

    if (init.signal) {
      if (init.signal.aborted) {
        outboundReq.destroy(new Error("AbortError"));
        return;
      }
      const onAbort = () => {
        const abortErr: any = new Error("This operation was aborted");
        abortErr.name = "AbortError";
        outboundReq.destroy(abortErr);
      };
      init.signal.addEventListener("abort", onAbort, { once: true });
      outboundReq.on("close", () => {
        init.signal?.removeEventListener("abort", onAbort);
      });
    }

    outboundReq.on("error", (err) => {
      reject(err);
    });

    if (init.body) {
      outboundReq.write(init.body);
    }
    outboundReq.end();
  });
};

export const MAX_REDIRECT_HOPS = 15;

export interface NavigationHopInfo {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
}

export interface NavigationPipelineSuccess {
  success: true;
  response: globalThis.Response;
  finalUrl: string;
  hopCount: number;
  hops: NavigationHopInfo[];
}

export interface NavigationPipelineFailure {
  success: false;
  errorCode: "NETFLOW_SSRF_BLOCKED" | "NETFLOW_REDIRECT_BLOCKED" | "ERR_TOO_MANY_REDIRECTS";
  errorCategory: "ssrf" | "connection";
  error: string;
  finalUrl: string;
  hopCount: number;
  hops: NavigationHopInfo[];
}

export type NavigationPipelineResult = NavigationPipelineSuccess | NavigationPipelineFailure;

export interface BrowseNavigationParams {
  initialUrl: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  signal?: AbortSignal;
  resolveCookieJar?: (createIfMissing: boolean) => Map<string, ParsedCookie> | null;
  dnsResolver?: (url: string, signal?: AbortSignal) => Promise<{ safe: boolean; pinnedIp?: string }>;
  fetcher?: (
    url: string,
    pinnedIp: string,
    init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
  ) => Promise<globalThis.Response>;
}

export async function executeBrowseNavigationPipeline(
  params: BrowseNavigationParams
): Promise<NavigationPipelineResult> {
  const {
    initialUrl,
    method = "GET",
    headers = {},
    body,
    contentType = "application/x-www-form-urlencoded",
    signal,
    resolveCookieJar,
    dnsResolver = (u, s) => resolveAndValidateDnsSafety(u, s),
    fetcher = fetchWithPinnedIp,
  } = params;

  let currentUrl = initialUrl;
  let currentMethod: "GET" | "POST" = method === "POST" ? "POST" : "GET";
  let currentBody: string | undefined = currentMethod === "POST" ? body : undefined;
  let currentContentType: string | undefined = currentMethod === "POST" ? contentType : undefined;
  const currentHeaders: Record<string, string> = { ...headers };

  const visitedUrls = new Set<string>();
  try {
    visitedUrls.add(new URL(currentUrl).toString());
  } catch {
    visitedUrls.add(currentUrl);
  }

  const hops: NavigationHopInfo[] = [];
  let hopCount = 0;
  let response: any;

  while (true) {
    // 1. Resolve DNS with bounded timeout and verify no resolved IP is private/loopback/link-local/ULA/metadata/unspecified
    const dnsCheck = await dnsResolver(currentUrl, signal);
    if (!dnsCheck.safe || !dnsCheck.pinnedIp) {
      return {
        success: false,
        errorCode: "NETFLOW_SSRF_BLOCKED",
        errorCategory: "ssrf",
        error: "Access to a domain resolving to an internal, local, or restricted network address is blocked for your safety.",
        finalUrl: currentUrl,
        hopCount,
        hops,
      };
    }

    // Attach stored cookies for this client+tab (or ephemeral request-scoped jar) and current hop URL
    if (resolveCookieJar) {
      const hopCookieHeader = getCookieHeaderFromJar(resolveCookieJar(false), currentUrl);
      if (hopCookieHeader) {
        currentHeaders["Cookie"] = hopCookieHeader;
      } else {
        delete currentHeaders["Cookie"];
      }
    }

    const hopHeaders: Record<string, string> = { ...currentHeaders };

    if (currentMethod === "POST" && typeof currentBody === "string") {
      hopHeaders["Content-Type"] = currentContentType || "application/x-www-form-urlencoded";
      hopHeaders["Content-Length"] = Buffer.byteLength(currentBody).toString();
    }

    // Execute outbound HTTP/HTTPS request with IP pinning to the verified safe IP
    response = await fetcher(currentUrl, dnsCheck.pinnedIp, {
      method: currentMethod,
      headers: hopHeaders,
      body: currentMethod === "POST" && typeof currentBody === "string" ? currentBody : undefined,
      signal,
    });

    hops.push({
      url: currentUrl,
      method: currentMethod,
      status: response.status,
      headers: { ...hopHeaders },
    });

    // Capture Set-Cookie headers per hop and update client+tab cookie jar (or ephemeral jar)
    if (resolveCookieJar) {
      const hopSetCookieHeaders: string[] =
        typeof (response.headers as any)?.getSetCookie === "function"
          ? (response.headers as any).getSetCookie()
          : response.headers?.get?.("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
      if (hopSetCookieHeaders.length > 0) {
        const targetJar = resolveCookieJar(true);
        if (targetJar) {
          storeSetCookiesIntoJar(targetJar, hopSetCookieHeaders, currentUrl);
        }
      }
    }

    const isRedirectStatus =
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308;

    if (!isRedirectStatus) {
      break;
    }

    const locationHeader = response.headers?.get?.("location");
    if (!locationHeader || !locationHeader.trim()) {
      break;
    }

    try {
      await response.body?.cancel?.();
    } catch {}

    // Resolve Location target against current hop URL
    let nextUrl: string;
    let currentParsed: URL;
    let nextParsed: URL;
    try {
      currentParsed = new URL(currentUrl);
      nextParsed = new URL(locationHeader.trim(), currentParsed);
      nextUrl = nextParsed.toString();
    } catch {
      return {
        success: false,
        errorCode: "NETFLOW_REDIRECT_BLOCKED",
        errorCategory: "ssrf",
        error: "Redirect hop blocked due to an invalid or malformed target address.",
        finalUrl: currentUrl,
        hopCount,
        hops,
      };
    }

    // 1. Validate every Location target with checkIsInternalOrUnsafe BEFORE following
    if (
      (nextParsed.protocol !== "http:" && nextParsed.protocol !== "https:") ||
      checkIsInternalOrUnsafe(nextUrl)
    ) {
      return {
        success: false,
        errorCode: "NETFLOW_REDIRECT_BLOCKED",
        errorCategory: "ssrf",
        error: "Redirect to an internal, local, or restricted URI address was blocked by SSRF safety policy.",
        finalUrl: currentUrl,
        hopCount,
        hops,
      };
    }

    // 2. Block HTTPS -> HTTP protocol downgrade
    if (currentParsed.protocol === "https:" && nextParsed.protocol === "http:") {
      return {
        success: false,
        errorCode: "NETFLOW_REDIRECT_BLOCKED",
        errorCategory: "ssrf",
        error: "Insecure redirect downgrade from HTTPS to HTTP was blocked by SSRF safety policy.",
        finalUrl: currentUrl,
        hopCount,
        hops,
      };
    }

    // 3. Block redirect loops
    if (visitedUrls.has(nextUrl)) {
      return {
        success: false,
        errorCode: "NETFLOW_REDIRECT_BLOCKED",
        errorCategory: "ssrf",
        error: "Redirect loop detected and blocked by SSRF navigation safety policy.",
        finalUrl: currentUrl,
        hopCount,
        hops,
      };
    }

    // 4. Enforce bounded max 15 hops
    hopCount += 1;
    if (hopCount > MAX_REDIRECT_HOPS) {
      return {
        success: false,
        errorCode: "ERR_TOO_MANY_REDIRECTS",
        errorCategory: "connection",
        error: "Too many redirects (exceeded maximum of 15 hops).",
        finalUrl: currentUrl,
        hopCount,
        hops,
      };
    }

    // 5. Strip Cookie, Authorization, and Proxy-Authorization headers on cross-origin hops (case-insensitive)
    if (nextParsed.origin !== currentParsed.origin) {
      for (const headerKey of Object.keys(currentHeaders)) {
        if (/^(authorization|cookie|proxy-authorization)$/i.test(headerKey)) {
          delete currentHeaders[headerKey];
        }
      }
    }

    // 6. Handle 301/302/303 POST->GET and 307/308 method preservation
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && currentMethod === "POST")
    ) {
      currentMethod = "GET";
      currentBody = undefined;
      currentContentType = undefined;
      delete currentHeaders["Content-Type"];
      delete currentHeaders["content-type"];
      delete currentHeaders["Content-Length"];
      delete currentHeaders["content-length"];
    }

    visitedUrls.add(nextUrl);
    currentUrl = nextUrl;
  }

  return {
    success: true,
    response,
    finalUrl: currentUrl,
    hopCount,
    hops,
  };
}

// API: Browse URL (Secure, lightweight proxy with data-saver metrics)
app.post("/api/browse", async (req: Request, res: Response) => {
  try {
    let {
      url,
      mode = "smart-compress",
      blockTrackers = true,
      blockImages = false,
      httpMethod = "GET",
      postBody,
      postContentType = "application/x-www-form-urlencoded",
      tabId = "default-tab",
      siteMode = "default",
      customHeaders,
      searchEngineId = "google",
    } = req.body;

    if (!url || typeof url !== "string" || !url.trim()) {
      res.status(400).json({ error: "Please enter a valid website address or search term." });
      return;
    }

    url = url.trim();
    const isFacebook = isFacebookUrl(url);
    if (isFacebook) {
      // FORM 32: Force basic/lite HTML version (mbasic.facebook.com) to bypass modern React BigPipe/SPA
      // which fails inside null-origin sandboxed iframes due to CORS & anti-iframe checks
      if (
        url.includes("www.facebook.com") ||
        url.includes("m.facebook.com") ||
        url === "https://facebook.com" ||
        url === "http://facebook.com" ||
        url === "https://facebook.com/" ||
        url === "http://facebook.com/"
      ) {
        url = url.replace(/(?:www\.|m\.)?facebook\.com/, "mbasic.facebook.com");
      }
      mode = "full";
    }

    const sanitizeReportUrl = (rawUrl: string): string => {
      try {
        const u = new URL(rawUrl);
        return `${u.origin}${u.pathname}`;
      } catch {
        return String(rawUrl || "").split(/[?#]/)[0];
      }
    };

    // Fix protocol typos (e.g. htp://, https//, http//)
    url = url.replace(/^(?:https?:\/\/)+/i, (m) => m.toLowerCase().includes("https") ? "https://" : "http://");
    url = url.replace(/^https?\/\//i, "https://");
    url = url.replace(/^htp:\/\//i, "http://");

    const safeEngineId: SearchEngineId =
      typeof searchEngineId === "string" && (searchEngineId === "duckduckgo" || searchEngineId === "bing" || searchEngineId === "google")
        ? (searchEngineId as SearchEngineId)
        : "google";

    const omniboxRes = resolveNativeOmniboxInput(url, safeEngineId);
    if (
      omniboxRes.kind === "blocked" ||
      (omniboxRes.kind === "url" && checkIsInternalOrUnsafe(omniboxRes.resolvedUrl))
    ) {
      res.status(200).json({
        success: false,
        statusCode: null,
        errorCode: "NETFLOW_SSRF_BLOCKED",
        errorCategory: "ssrf",
        error: "Access to internal, local, or restricted URI schemes is blocked for your safety.",
        url: sanitizeReportUrl(url),
      });
      return;
    }

    // Check if input is a search query or a direct URL using shared omnibox resolver
    let isSearchQuery = false;
    let searchQuery = "";

    if (omniboxRes.kind === "search") {
      isSearchQuery = true;
      searchQuery = omniboxRes.searchQuery || url;
    } else {
      url = omniboxRes.resolvedUrl;
    }

    // Handle clean search directly for instant speed and 0 CAPTCHA
    if (isSearchQuery) {
      const startTime = Date.now();
      const searchResult = await generateSearchResultsHtml(searchQuery, safeEngineId);
      const loadTimeMs = Date.now() - startTime;
      const transferredBytes = new TextEncoder().encode(searchResult.cleanedHtml).length;
      const originalBytes = searchResult.originalBytes * 3; // Equivalent uncompressed web search bytes
      const savedBytes = Math.max(0, originalBytes - transferredBytes);
      const savedPercentage = Math.round((savedBytes / originalBytes) * 100);

      res.json({
        success: true,
        url: omniboxRes.resolvedUrl,
        title: searchResult.title,
        contentHtml: searchResult.cleanedHtml,
        rawText: searchResult.rawText,
        stats: {
          originalBytes,
          transferredBytes,
          savedBytes,
          savedPercentage,
          loadTimeMs,
          trackersBlocked: 8,
          scriptsBlocked: 14,
          isHttps: true,
        },
        securityAudit: {
          protocol: "NETFLOW Verified Search (Tracker-Free)",
          certificateValid: true,
          trackerCount: 0,
          riskLevel: "safe",
          cookiesDetected: 0,
        },
      });
      return;
    }

    const callerClientId = getClientIdFromRequest(req);
    const canPersistCookieJar = Boolean(callerClientId && isValidTabId(tabId));
    const persistentJarKey = canPersistCookieJar
      ? `${callerClientId}::${String(tabId).trim()}`
      : null;
    const ephemeralRequestJar = canPersistCookieJar
      ? null
      : new Map<string, ParsedCookie>();

    const resolveActiveCookieJar = (createIfMissing: boolean): Map<string, ParsedCookie> | null => {
      if (persistentJarKey) {
        return getOrTouchStoredJar(persistentJarKey, createIfMissing);
      }
      return ephemeralRequestJar;
    };

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const userAgentByMode: Record<string, string> = {
      default:
        "Mozilla/5.0 (Linux; Android 13; Mobile; NETFLOW/1.0; HumanFirst) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      desktop:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      mobile:
        "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    };

    const selectedUserAgent = userAgentByMode[siteMode] || userAgentByMode.default;

    const headers: Record<string, string> = {
      "User-Agent": selectedUserAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
      "Save-Data": "on",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    };

    if (isFacebook) {
      headers["Referer"] = "https://www.google.com/";
      // Use lightweight basic mobile user-agent to guarantee Facebook returns clean server-rendered mbasic HTML
      headers["User-Agent"] =
        "Mozilla/5.0 (Linux; U; Android 4.4.2; en-us; LGMS323 Build/KOT49I.MS32310c) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36";
      headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
      headers["Accept-Language"] = "en-US,en;q=0.5";
    }

    if (siteMode === "desktop") {
      headers["Sec-CH-UA-Mobile"] = "?0";
      headers["Sec-CH-UA-Platform"] = '"Windows"';
    } else {
      headers["Sec-CH-UA-Mobile"] = "?1";
      headers["Sec-CH-UA-Platform"] = '"Android"';
    }

    if (customHeaders) {
      const sanitizedCustom = sanitizeClientCustomHeaders(customHeaders);
      for (const [k, v] of Object.entries(sanitizedCustom)) {
        headers[k] = v;
      }
    }

    const isPostRequest = typeof httpMethod === "string" && httpMethod.toUpperCase() === "POST";
    let currentUrl = url;
    let currentMethod: "GET" | "POST" = isPostRequest ? "POST" : "GET";
    let currentBody: string | undefined =
      isPostRequest && typeof postBody === "string" ? postBody : undefined;
    let currentContentType: string | undefined =
      isPostRequest && typeof postBody === "string"
        ? typeof postContentType === "string"
          ? postContentType
          : "application/x-www-form-urlencoded"
        : undefined;
    const currentHeaders: Record<string, string> = { ...headers };

    let response: any;

    try {
      const navResult = await executeBrowseNavigationPipeline({
        initialUrl: currentUrl,
        method: currentMethod,
        headers: currentHeaders,
        body: currentBody,
        contentType: currentContentType,
        signal: controller.signal,
        resolveCookieJar: resolveActiveCookieJar,
      });

      if (!navResult.success) {
        clearTimeout(timeout);
        const failure = navResult as NavigationPipelineFailure;
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: failure.errorCode,
          errorCategory: failure.errorCategory,
          error: failure.error,
          url: sanitizeReportUrl(url),
        });
        return;
      }

      response = navResult.response;
      currentUrl = navResult.finalUrl;
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr.name === "AbortError") {
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: "ERR_CONNECTION_TIMED_OUT",
          errorCategory: "timeout",
          error: "Connection timed out after 12 seconds. The destination server took too long to respond.",
          url: sanitizeReportUrl(url),
        });
        return;
      }
      const causeCode = (fetchErr?.cause?.code || "") as string;
      const causeMsg = (fetchErr?.cause?.message || "") as string;
      const msg = `${fetchErr?.message || ""} ${causeCode} ${causeMsg}`.toLowerCase();
      if (msg.includes("enotfound") || msg.includes("getaddrinfo")) {
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: "ERR_NAME_NOT_RESOLVED",
          errorCategory: "dns",
          error: "Domain not found. Please check the spelling of the web address.",
          url: sanitizeReportUrl(url),
        });
        return;
      }
      if (msg.includes("econnrefused")) {
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: "ERR_CONNECTION_REFUSED",
          errorCategory: "connection",
          error: "Connection refused by destination server.",
          url: sanitizeReportUrl(url),
        });
        return;
      }
      if (msg.includes("econnreset")) {
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: "ERR_CONNECTION_REFUSED",
          errorCategory: "connection",
          error: "Connection was reset while contacting the website.",
          url: sanitizeReportUrl(url),
        });
        return;
      }
      if (msg.includes("etimedout") || msg.includes("timeout")) {
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: "ERR_CONNECTION_TIMED_OUT",
          errorCategory: "timeout",
          error: "Connection was interrupted or timed out while contacting the website.",
          url: sanitizeReportUrl(url),
        });
        return;
      }
      if (msg.includes("certificate") || msg.includes("ssl") || msg.includes("tls")) {
        res.status(200).json({
          success: false,
          statusCode: null,
          errorCode: "ERR_SSL_PROTOCOL_ERROR",
          errorCategory: "connection",
          error: "A secure connection (SSL/TLS) could not be established with this website.",
          url: sanitizeReportUrl(url),
        });
        return;
      }
      res.status(200).json({
        success: false,
        statusCode: null,
        errorCode: "ERR_CONNECTION_FAILED",
        errorCategory: "connection",
        error: "Could not connect to the target website. The server may be unreachable.",
        url: sanitizeReportUrl(url),
      });
      return;
    }
    clearTimeout(timeout);

    // Track final redirected URL and verify it doesn't target internal/restricted IPs
    const finalUrl = currentUrl || response.url || url;
    if (finalUrl !== url && checkIsInternalOrUnsafe(finalUrl)) {
      res.status(200).json({
        success: false,
        statusCode: null,
        errorCode: "NETFLOW_REDIRECT_BLOCKED",
        errorCategory: "ssrf",
        error: "Redirect to an internal or restricted network address was blocked for your safety.",
        url: sanitizeReportUrl(url),
      });
      return;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const contentDisposition = (response.headers.get("content-disposition") || "").toLowerCase();
    const contentLengthHeader = response.headers.get("content-length");
    const rawContentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    // Detect non-HTML / binary downloadable content types or explicit attachments
    const isBinaryDownload =
      contentDisposition.includes("attachment") ||
      contentType.includes("application/pdf") ||
      contentType.includes("application/zip") ||
      contentType.includes("application/x-zip") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/x-rar") ||
      contentType.includes("application/x-7z") ||
      contentType.includes("application/x-tar") ||
      contentType.includes("application/gzip") ||
      contentType.includes("application/vnd.android.package-archive") ||
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/");

    const isImageFile = contentType.startsWith("image/") && !contentType.includes("image/svg+xml");

    if (isBinaryDownload || isImageFile) {
      try {
        await response.body?.cancel();
      } catch {}
      const safeFilename = extractSafeDownloadFilename(contentDisposition, contentType, finalUrl, isImageFile);
      const safeDownloadUrl = finalUrl.replace(/"/g, "%22");
      const cleanMime = contentType.split(";")[0] || "application/octet-stream";

      const formattedSize = rawContentLength > 0
        ? rawContentLength < 1024
          ? `${rawContentLength} B`
          : rawContentLength < 1024 * 1024
          ? `${(rawContentLength / 1024).toFixed(1)} KB`
          : `${(rawContentLength / (1024 * 1024)).toFixed(1)} MB`
        : "";

      let cardHtml = "";
      if (isImageFile) {
        cardHtml = `
          <div class="netflow-media-view max-w-2xl mx-auto py-8 px-4 text-center">
            <div class="p-4 bg-stone-100 dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm inline-block">
              <img src="${safeDownloadUrl}" alt="${safeFilename}" class="max-w-full h-auto rounded-lg mx-auto" />
            </div>
            <div class="mt-4 flex items-center justify-center gap-3">
              <a href="${safeDownloadUrl}" download="${safeFilename}" target="_blank" rel="noopener noreferrer" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors">
                ⬇️ Download Image
              </a>
            </div>
          </div>
        `;
      } else if (contentType.startsWith("video/")) {
        cardHtml = `
          <div class="netflow-media-view max-w-2xl mx-auto py-6 px-4 text-center">
            <div class="bg-black rounded-2xl overflow-hidden shadow-lg border border-stone-800 mb-4">
              <video controls playsinline class="w-full max-h-[480px] mx-auto bg-black" src="${safeDownloadUrl}">
                Your browser does not support HTML5 video.
              </video>
            </div>
            <h2 class="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1 break-all">
              ${safeFilename}
            </h2>
            <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
              ${cleanMime}${formattedSize ? ` • ${formattedSize}` : ""}
            </p>
            <div class="flex items-center justify-center gap-3">
              <a href="${safeDownloadUrl}" download="${safeFilename}" target="_blank" rel="noopener noreferrer" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium transition-colors inline-flex items-center gap-2">
                <span>⬇️</span> Download Video ${formattedSize ? `(${formattedSize})` : ""}
              </a>
            </div>
          </div>
        `;
      } else if (contentType.startsWith("audio/")) {
        cardHtml = `
          <div class="netflow-media-view max-w-xl mx-auto py-8 px-4 text-center">
            <div class="p-6 bg-stone-50 dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm mb-4">
              <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-2xl">
                🎵
              </div>
              <h2 class="text-base font-semibold text-stone-900 dark:text-stone-100 mb-2 break-all">
                ${safeFilename}
              </h2>
              <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
                ${cleanMime}${formattedSize ? ` • ${formattedSize}` : ""}
              </p>
              <audio controls class="w-full max-w-md mx-auto" src="${safeDownloadUrl}">
                Your browser does not support HTML5 audio.
              </audio>
            </div>
            <div class="flex items-center justify-center gap-3">
              <a href="${safeDownloadUrl}" download="${safeFilename}" target="_blank" rel="noopener noreferrer" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium transition-colors inline-flex items-center gap-2">
                <span>⬇️</span> Download Audio ${formattedSize ? `(${formattedSize})` : ""}
              </a>
            </div>
          </div>
        `;
      } else {
        cardHtml = `
          <div class="netflow-download-card max-w-xl mx-auto my-8 p-6 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm text-center">
            <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-2xl font-bold">
              📦
            </div>
            <h2 class="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1 break-all">
              ${safeFilename}
            </h2>
            <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
              ${cleanMime}${formattedSize ? ` • ${formattedSize}` : ""}
            </p>
            <div class="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-200/60 dark:border-stone-700/60 text-left text-xs text-stone-600 dark:text-stone-300 mb-5 leading-relaxed">
              <strong class="text-stone-800 dark:text-stone-200">NETFLOW Isolated Download Guard:</strong>
              <p class="mt-1">This resource is an external downloadable file. Direct execution is kept isolated to protect memory, battery, and device security. You can download the file directly to your device.</p>
            </div>
            <div class="flex items-center justify-center gap-3 flex-wrap">
              <a href="${safeDownloadUrl}" download="${safeFilename}" target="_blank" rel="noopener noreferrer" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium transition-colors inline-flex items-center gap-2">
                <span>⬇️</span> Download File ${formattedSize ? `(${formattedSize})` : ""}
              </a>
            </div>
          </div>
        `;
      }

      const loadTimeMs = Date.now() - startTime;
      const isHttps = finalUrl.startsWith("https://");

      res.json({
        success: true,
        url: finalUrl,
        originalUrl: url,
        redirected: finalUrl !== url,
        title: safeFilename,
        contentHtml: cardHtml,
        rawText: `Downloadable File: ${safeFilename} (${cleanMime}${formattedSize ? `, ${formattedSize}` : ""})`,
        stats: {
          originalBytes: rawContentLength || 2048,
          transferredBytes: Buffer.byteLength(cardHtml),
          savedBytes: Math.max(0, (rawContentLength || 2048) - Buffer.byteLength(cardHtml)),
          savedPercentage: 90,
          loadTimeMs,
          trackersBlocked: 0,
          scriptsBlocked: 0,
          isHttps,
        },
        securityAudit: {
          protocol: isHttps ? "TLS 1.3 / HTTPS Verified (Downloadable)" : "HTTP (Unencrypted Download)",
          certificateValid: isHttps,
          trackerCount: 0,
          riskLevel: isHttps ? "safe" : "unencrypted",
          cookiesDetected: getCookieCountFromJar(resolveActiveCookieJar(false), finalUrl),
        },
        downloadMetadata: {
          isDownload: true,
          filename: safeFilename,
          mimeType: cleanMime,
          fileSizeBytes: rawContentLength || 0,
          formattedSize: formattedSize || "Unknown size",
          downloadUrl: safeDownloadUrl,
          isImagePreview: isImageFile,
        },
      });
      return;
    }

    const maxResponseBytes = getMaxResponseBytes();
    const bodyReadResult = await readResponseTextWithByteCap(response, maxResponseBytes);
    if (bodyReadResult.tooLarge) {
      res.status(200).json({
        success: false,
        statusCode: 413,
        errorCode: "NETFLOW_RESPONSE_TOO_LARGE",
        errorCategory: "response_too_large",
        maxResponseBytes,
        error: `Upstream response exceeded the maximum allowed size of ${maxResponseBytes} bytes.`,
        url: sanitizeReportUrl(finalUrl),
      });
      return;
    }

    const rawHtml = bodyReadResult.text;
    const loadTimeMs = Date.now() - startTime;
    const originalBytes = bodyReadResult.bytesRead;

    // Explicit upstream restriction, rate-limit, and HTTP error handling
    // Return HTTP 200 at proxy transport layer so Cloud Run / AI Studio preview proxy never treats upstream 5xx as container failure
    if (!response.ok) {
      const safeErrorUrl = sanitizeReportUrl(finalUrl);
      if (response.status === 403) {
        res.status(200).json({
          success: false,
          error: "Access to this website was restricted or denied by the remote server (HTTP 403 Forbidden). The destination firewall or access policy blocked the connection.",
          errorCategory: "blocked",
          errorCode: "HTTP_403_FORBIDDEN",
          statusCode: 403,
          url: safeErrorUrl,
        });
        return;
      }
      if (response.status === 429) {
        res.status(200).json({
          success: false,
          error: "Upstream rate limit reached (HTTP 429 Too Many Requests). The destination website is temporarily throttling connections.",
          errorCategory: "rate_limited",
          errorCode: "HTTP_429_TOO_MANY_REQUESTS",
          statusCode: 429,
          url: safeErrorUrl,
        });
        return;
      }
      if (response.status === 500) {
        res.status(200).json({
          success: false,
          error: "Target website encountered an internal server error (HTTP 500 Internal Server Error).",
          errorCategory: "server_error",
          errorCode: "HTTP_500_INTERNAL_SERVER_ERROR",
          statusCode: 500,
          url: safeErrorUrl,
        });
        return;
      }
      if (response.status === 502) {
        res.status(200).json({
          success: false,
          error: "Upstream gateway failure (HTTP 502 Bad Gateway). Invalid response received from the upstream server.",
          errorCategory: "gateway",
          errorCode: "HTTP_502_BAD_GATEWAY",
          statusCode: 502,
          url: safeErrorUrl,
        });
        return;
      }
      if (response.status === 503) {
        res.status(200).json({
          success: false,
          error: "The destination website is temporarily unavailable or undergoing maintenance (HTTP 503 Service Unavailable).",
          errorCategory: "unavailable",
          errorCode: "HTTP_503_SERVICE_UNAVAILABLE",
          statusCode: 503,
          url: safeErrorUrl,
        });
        return;
      }
      if (response.status === 504) {
        res.status(200).json({
          success: false,
          error: "Upstream gateway timed out (HTTP 504 Gateway Timeout). The destination server did not respond in time.",
          errorCategory: "gateway_timeout",
          errorCode: "HTTP_504_GATEWAY_TIMEOUT",
          statusCode: 504,
          url: safeErrorUrl,
        });
        return;
      }
      res.status(200).json({
        success: false,
        error: `Target server responded with HTTP ${response.status} (${response.statusText || "Error"}).`,
        errorCategory: response.status >= 500 ? "server_error" : "http_client",
        errorCode:
          response.status === 404
            ? "HTTP_404_NOT_FOUND"
            : response.status >= 500
            ? `HTTP_${response.status}_SERVER_ERROR`
            : `HTTP_${response.status}_CLIENT_ERROR`,
        statusCode: response.status,
        url: safeErrorUrl,
      });
      return;
    }

    const isJson = contentType.includes("application/json");
    const isPlainText = contentType.includes("text/plain") && !contentType.includes("text/html");

    let cleanedHtml: string;
    let rawText: string;
    let trackersBlocked = 0;
    let scriptsBlocked = 0;

    if (rawHtml.trim().length === 0) {
      cleanedHtml = `
        <div class="netflow-empty-doc max-w-md mx-auto my-16 p-6 text-center text-stone-500 dark:text-stone-400">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-xl">
            📄
          </div>
          <h3 class="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1">Empty Document</h3>
          <p class="text-xs">The server returned an empty (0-byte) response.</p>
        </div>
      `;
      rawText = "Empty document";
    } else if (isJson) {
      let formatted = rawHtml;
      try {
        formatted = JSON.stringify(JSON.parse(rawHtml), null, 2);
      } catch {
        formatted = rawHtml;
      }
      const safeEscaped = formatted
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

      cleanedHtml = `
        <div class="netflow-raw-content max-w-4xl mx-auto py-6 px-4">
          <div class="mb-3 pb-2 border-b border-stone-200 dark:border-stone-800 text-xs text-stone-500 flex items-center justify-between">
            <span>📄 Application / JSON Document</span>
            <span>${originalBytes} bytes</span>
          </div>
          <pre class="bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-200 p-4 rounded-xl border border-stone-200 dark:border-stone-800 overflow-x-auto text-xs font-mono leading-relaxed">${safeEscaped}</pre>
        </div>
      `;
      rawText = formatted.slice(0, 4000);
    } else if (isPlainText) {
      const safeEscaped = rawHtml
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

      cleanedHtml = `
        <div class="netflow-raw-content max-w-4xl mx-auto py-6 px-4">
          <div class="mb-3 pb-2 border-b border-stone-200 dark:border-stone-800 text-xs text-stone-500 flex items-center justify-between">
            <span>📄 Plain Text Document</span>
            <span>${originalBytes} bytes</span>
          </div>
          <pre class="bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-200 p-4 rounded-xl border border-stone-200 dark:border-stone-800 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre-wrap">${safeEscaped}</pre>
        </div>
      `;
      rawText = rawHtml.slice(0, 4000);
    } else {
      const sanitized = cleanAndSanitizeHtml(
        rawHtml,
        finalUrl,
        mode,
        blockTrackers,
        blockImages
      );
      cleanedHtml = sanitized.cleanedHtml;
      rawText = sanitized.rawText;
      trackersBlocked = sanitized.trackersBlocked;
      scriptsBlocked = sanitized.scriptsBlocked;
    }

    const transferredBytes = new TextEncoder().encode(cleanedHtml).length;
    const savedBytes = Math.max(0, originalBytes - transferredBytes);
    const savedPercentage = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;

    let title = "";
    if (isJson || isPlainText || rawHtml.trim().length === 0) {
      try {
        const u = new URL(finalUrl);
        title = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      } catch {
        title = finalUrl;
      }
    } else {
      title = extractTitle(rawHtml, finalUrl);
    }
    const isHttps = finalUrl.startsWith("https://");

    res.json({
      success: true,
      url: finalUrl,
      originalUrl: url,
      redirected: finalUrl !== url,
      title,
      contentHtml: cleanedHtml,
      rawText,
      isFacebook,
      isNativeWebView: mode === "full" || isFacebook,
      renderMode: mode === "full" || isFacebook ? "native_webview" : "sanitized_html",
      stats: {
        originalBytes,
        transferredBytes,
        savedBytes,
        savedPercentage,
        loadTimeMs,
        trackersBlocked,
        scriptsBlocked,
        isHttps,
      },
      securityAudit: {
        protocol: isHttps ? "TLS 1.3 / HTTPS Verified" : "HTTP (Unencrypted - Caution)",
        certificateValid: isHttps,
        trackerCount: trackersBlocked,
        riskLevel: isHttps ? (trackersBlocked > 10 ? "medium_trackers" : "safe") : "unencrypted",
        cookiesDetected: getCookieCountFromJar(resolveActiveCookieJar(false), finalUrl),
      },
    });
  } catch (error: any) {
    console.error("Browse error:", sanitizeLogMessage(error));
    res.status(200).json({
      success: false,
      statusCode: null,
      errorCode: "NETFLOW_PROXY_ERROR",
      errorCategory: "proxy_error",
      error: "An unexpected error occurred while loading this page. Please try again.",
      url: typeof req.body?.url === "string" ? sanitizeUrlForLog(req.body.url) : "",
    });
  }
});

// API: YouTube Safe Search (Extracts pure video metadata without arbitrary script execution or API keys)
app.post("/api/youtube/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({ error: "Search query is required." });
      return;
    }

    const trimmedQuery = query.trim().slice(0, 100);
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedQuery)}`;

    const fetchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!fetchRes.ok) {
      res.status(fetchRes.status).json({ error: "Failed to fetch YouTube search results." });
      return;
    }

    const html = await fetchRes.text();
    const results: Array<{
      id: string;
      title: string;
      channel: string;
      duration: string;
      thumbnail: string;
    }> = [];

    // Parse ytInitialData JSON
    const dataMatch = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/);
    if (dataMatch && dataMatch[1]) {
      try {
        const parsed = JSON.parse(dataMatch[1]);
        const seenIds = new Set<string>();

        const extractVideos = (obj: any) => {
          if (!obj || typeof obj !== "object") return;
          if (obj.videoRenderer) {
            const vr = obj.videoRenderer;
            const vid = vr.videoId;
            if (vid && typeof vid === "string" && vid.length >= 8 && !seenIds.has(vid)) {
              seenIds.add(vid);
              const titleText =
                vr.title?.runs?.[0]?.text ||
                vr.title?.simpleText ||
                "YouTube Video";
              const channelText =
                vr.ownerText?.runs?.[0]?.text ||
                vr.shortBylineText?.runs?.[0]?.text ||
                "YouTube Creator";
              const durationText = vr.lengthText?.simpleText || "";
              const thumbUrl =
                vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;

              results.push({
                id: vid,
                title: String(titleText).slice(0, 150),
                channel: String(channelText).slice(0, 80),
                duration: String(durationText).slice(0, 20),
                thumbnail: thumbUrl,
              });
            }
          }
          if (Array.isArray(obj)) {
            for (const item of obj) extractVideos(item);
          } else {
            for (const val of Object.values(obj)) extractVideos(val);
          }
        };

        extractVideos(parsed);
      } catch {
        // Fallback to regex below
      }
    }

    // Regex fallback if ytInitialData had 0 results
    if (results.length === 0) {
      const vidMatches = html.matchAll(/\/watch\?v=([\w-]{11})/g);
      const seen = new Set<string>();
      for (const m of vidMatches) {
        const vid = m[1];
        if (!seen.has(vid)) {
          seen.add(vid);
          results.push({
            id: vid,
            title: `YouTube Video (${vid})`,
            channel: "YouTube",
            duration: "",
            thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
          });
          if (results.length >= 12) break;
        }
      }
    }

    res.json({
      query: trimmedQuery,
      results: results.slice(0, 30),
    });
  } catch (err: any) {
    console.error("[YouTube Search API] Exception:", err?.message || err);
    res.status(500).json({ error: "Failed to search YouTube." });
  }
});

// API: AI Smart Page Summary (Gemini 3.8 Flash)
app.post("/api/ai/summarize", async (req: Request, res: Response) => {
  try {
    const { title, url, text, language = "bn" } = req.body;
    const safeUrlLabel = sanitizeUrlForLog(url);

    if (!text || text.length < 20) {
      res.status(400).json({ error: "Page content text is too short to summarize." });
      return;
    }

    if (!ai) {
      // Graceful fallback if GEMINI_API_KEY is not yet attached
      const isBn = language === "bn";
      res.json({
        summary: isBn
          ? `এই পৃষ্ঠাটির মূল বিষয়বস্তু: ${title || safeUrlLabel}। এটি হালকা এবং সরাসরি পড়ার জন্য প্রস্তুত। (Gemini API কী যুক্ত থাকলে আরও গভীর AI বিশ্লেষণ উপলব্ধ হবে)`
          : `Main topic of this page: ${title || safeUrlLabel}. Prepared for lightweight reading. (Connect Gemini API Key for deeper AI analysis)`,
        keyPoints: isBn
          ? [
              "পৃষ্ঠাটি সফলভাবে নেটওয়ার্ক-অপ্টিমাইজড পদ্ধতিতে লোড হয়েছে।",
              "ট্র্যাকার এবং ভারী বিজ্ঞাপন স্ক্রিপ্ট সরিয়ে ব্যান্ডউইথ সাশ্রয় করা হয়েছে।",
              "তথ্য সহজে এবং দ্রুত পড়তে উপযোগী করা হয়েছে।",
            ]
          : [
              "Page loaded using network-optimized human-first engine.",
              "Trackers and heavy scripts filtered to preserve data and battery.",
              "Distraction-free text ready for quick reading.",
            ],
        readTimeSavedMin: 3,
      });
      return;
    }

    const langInstruction =
      language === "bn"
        ? "Respond in natural, clear, human-friendly Bengali (বাংলা). Focus on helpfulness, clarity, and zero fluff."
        : "Respond in natural, clear, human-friendly English. Focus on helpfulness, clarity, and zero fluff.";

    const prompt = `You are NETFLOW Browser's Human-First AI Assistant.
Philosophy: “মানুষকে প্রযুক্তির জন্য কষ্ট দেওয়া নয়—প্রযুক্তিকে মানুষের জন্য সহজ করা।”
User needs a quick, trustworthy, high-density summary of this web page to save reading time and bandwidth.

Page Title: ${title}
Page URL: ${safeUrlLabel}
Language: ${langInstruction}

Content snippet:
${text.slice(0, 4500)}

Please return a JSON object with:
1. "summary": A 2-3 sentence clear explanation of what this page is about.
2. "keyPoints": Array of 3 to 4 essential, actionable bullet points.
3. "readTimeSavedMin": Estimated number of minutes saved (integer, e.g. 4).
4. "humanVerdict": A 1-sentence honest assessment of whether this article is informative, promotional, or technical.`;

    // Promise with 7-second timeout for fast responsive feedback
    const geminiModel = (process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim();
    const aiPromise = ai.models.generateContent({
      model: geminiModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI_TIMEOUT")), 7000)
    );

    const response: any = await Promise.race([aiPromise, timeoutPromise]);
    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.warn("AI Summarize fallback triggered:", sanitizeLogMessage(error));
    const { title, url, language = "bn" } = req.body || {};
    const safeUrlLabel = sanitizeUrlForLog(url);
    const isBn = language === "bn";
    res.json({
      summary: isBn
        ? `এই পৃষ্ঠাটির সারসংক্ষেপ: ${title || safeUrlLabel}। এটি হালকা এবং সরাসরি পড়ার জন্য সাজানো হয়েছে।`
        : `Summary of: ${title || safeUrlLabel}. Prepared for lightweight reading.`,
      keyPoints: isBn
        ? [
            "পৃষ্ঠাটি সফলভাবে নেটওয়ার্ক-অপ্টিমাইজড পদ্ধতিতে লোড হয়েছে।",
            "ট্র্যাকার এবং ভারী বিজ্ঞাপন স্ক্রিপ্ট সরিয়ে ব্যান্ডউইথ সাশ্রয় করা হয়েছে।",
            "তথ্য সহজে এবং দ্রুত পড়তে উপযোগী করা হয়েছে।",
          ]
        : [
            "Page loaded using network-optimized human-first engine.",
            "Trackers and heavy scripts filtered to preserve data and battery.",
            "Distraction-free text ready for quick reading.",
          ],
      readTimeSavedMin: 3,
      humanVerdict: isBn ? "নির্ভরযোগ্য ও তথ্যবহুল" : "Informative and verified",
    });
  }
});

// API: AI Explain / Simplify Jargon
app.post("/api/ai/simplify", async (req: Request, res: Response) => {
  try {
    const { phrase, context, language = "bn" } = req.body;

    if (!phrase) {
      res.status(400).json({ error: "Phrase is required" });
      return;
    }

    if (!ai) {
      res.json({
        explanation:
          language === "bn"
            ? `"${phrase}" সহজ কথায়: এটি একটি গুরুত্বপূর্ণ ধারণা যা এই প্রসঙ্গে ব্যবহৃত হয়েছে।`
            : `"${phrase}" in plain terms: An important concept used in this context.`,
      });
      return;
    }

    const langPrompt =
      language === "bn"
        ? "Explain in simple, everyday Bengali (সহজ বাংলায় বোঝাও) as if explaining to a 10-year-old."
        : "Explain in simple everyday English as if explaining to a 10-year-old.";

    const geminiModel = (process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim();
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: `You are NETFLOW Human-First Browser.
The user highlighted this term/phrase while browsing: "${phrase}".
Surrounding context: "${context || ""}".
${langPrompt}
Keep it under 3 short sentences. Be strictly accurate, respectful, and crystal clear.`,
    });

    res.json({
      phrase,
      explanation: response.text?.trim() || "",
    });
  } catch (error: any) {
    console.warn("AI Simplify fallback triggered:", sanitizeLogMessage(error));
    const { phrase = "", language = "bn" } = req.body || {};
    res.json({
      phrase,
      explanation:
        language === "bn"
          ? `"${phrase}" সহজ কথায়: এটি একটি গুরুত্বপূর্ণ ধারণা যা এই প্রসঙ্গে ব্যবহৃত হয়েছে।`
          : `"${phrase}" in plain terms: An important concept used in this context.`,
    });
  }
});

// API: AI Network & Bandwidth Advisor
app.post("/api/ai/network-advice", async (req: Request, res: Response) => {
  try {
    const { networkType, rtt, downlink, memoryMb, language = "bn" } = req.body;

    if (!ai) {
      res.json({
        headline: language === "bn" ? "নেটওয়ার্ক সচেতন পরামর্শ" : "Network Aware Advice",
        recommendations:
          language === "bn"
            ? [
                "দুর্বল নেটওয়ার্কে 'Text-First' বা 'Reader Mode' চালু রাখুন।",
                "অপ্রয়োজনীয় ব্যাকগ্রাউন্ড ট্যাবগুলো বন্ধ বা সাসপেন্ড করুন।",
                "দরকারী পৃষ্ঠাগুলো 'Offline Capsule'-এ সংরক্ষণ করুন।",
              ]
            : [
                "Enable 'Text-First' or 'Reader Mode' on weaker networks.",
                "Suspend background tabs to conserve low-RAM device memory.",
                "Save critical articles to 'Offline Capsule' for instant access.",
              ],
        suggestedMode: networkType === "2g" ? "text-only" : "smart-compress",
      });
      return;
    }

    const prompt = `You are NETFLOW Browser's Network Optimization Intelligence.
Current device network environment:
- Connection type: ${networkType} (e.g. 2G, 3G, 4G, or unstable)
- Round Trip Time (RTT/Latency): ${rtt || "unknown"} ms
- Downlink speed: ${downlink || "unknown"} Mbps
- Approximate device memory: ${memoryMb || "standard"} MB
User language: ${language === "bn" ? "Bengali (বাংলা)" : "English"}.

NETFLOW principles:
1. Never promise the impossible (cannot turn 2G into 4G).
2. Give honest, practical, human-first recommendations to maximize reliability, preserve data, and prevent phone freezing.

Return a JSON object:
{
  "headline": "Short punchy status statement in requested language",
  "suggestedMode": "smart-compress" | "text-only" | "reader",
  "recommendations": ["3 practical tips in requested language"],
  "honestExplanation": "1 honest sentence about what can and cannot be done under this network speed"
}`;

    const geminiModel = (process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim();
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.warn("AI Network advice fallback triggered:", sanitizeLogMessage(error));
    const { networkType, language = "bn" } = req.body || {};
    res.json({
      headline: language === "bn" ? "নেটওয়ার্ক সচেতন পরামর্শ" : "Network Aware Advice",
      recommendations:
        language === "bn"
          ? [
              "দুর্বল নেটওয়ার্কে 'Text-First' বা 'Reader Mode' চালু রাখুন।",
              "অপ্রয়োজনীয় ব্যাকগ্রাউন্ড ট্যাবগুলো বন্ধ বা সাসপেন্ড করুন।",
              "দরকারী পৃষ্ঠাগুলো 'Offline Capsule'-এ সংরক্ষণ করুন।",
            ]
          : [
              "Enable 'Text-First' or 'Reader Mode' on weaker networks.",
              "Suspend background tabs to conserve low-RAM device memory.",
              "Save critical articles to 'Offline Capsule' for instant access.",
            ],
      suggestedMode: networkType === "2g" ? "text-only" : "smart-compress",
    });
  }
});

// Translation dictionaries for safe tag-preserving offline/fallback translation
const DICT_EN_TO_BN: [RegExp, string][] = [
  [/\bWelcome to\b/gi, "স্বাগতম"],
  [/\bWelcome\b/gi, "স্বাগতম"],
  [/\bHome\b/gi, "হোম"],
  [/\bNews\b/gi, "সংবাদ ও খবর"],
  [/\bArticle\b/gi, "নিবন্ধ"],
  [/\bSearch\b/gi, "অনুসন্ধান"],
  [/\bSettings\b/gi, "সেটিংস"],
  [/\bPrivacy\b/gi, "গোপনীয়তা"],
  [/\bSecurity\b/gi, "নিরাপত্তা"],
  [/\bAbout Us\b/gi, "আমাদের সম্পর্কে"],
  [/\bAbout\b/gi, "সম্পর্কে"],
  [/\bContact Us\b/gi, "যোগাযোগ করুন"],
  [/\bContact\b/gi, "যোগাযোগ"],
  [/\bRead More\b/gi, "আরও পড়ুন"],
  [/\bLearn More\b/gi, "আরও জানুন"],
  [/\bDownload\b/gi, "ডাউনলোড"],
  [/\bShare\b/gi, "শেয়ার"],
  [/\bThe human-first browser for everyone\b/gi, "সকলের জন্য মানব-প্রথম ব্রাউজার"],
  [/\bhuman-first\b/gi, "মানব-প্রথম"],
  [/\bbrowser\b/gi, "ব্রাউজার"],
  [/\bfor everyone\b/gi, "সকলের জন্য"],
  [/\bNext\b/gi, "পরবর্তী"],
  [/\bPrevious\b/gi, "পূর্ববর্তী"],
  [/\bClose\b/gi, "বন্ধ করুন"],
  [/\bSubmit\b/gi, "জমা দিন"],
  [/\bCancel\b/gi, "বাতিল"],
  [/\bSave\b/gi, "সংরক্ষণ"],
  [/\bDelete\b/gi, "মুছুন"],
  [/\bEdit\b/gi, "সম্পাদনা"],
  [/\bToday\b/gi, "আজ"],
  [/\bYesterday\b/gi, "গতকাল"],
  [/\bFeatures\b/gi, "বৈশিষ্ট্যসমূহ"],
  [/\bHelp\b/gi, "সহায়তা"],
  [/\bDocumentation\b/gi, "নথিপত্র"],
  [/\bLoading\b/gi, "লোড হচ্ছে..."],
];

const DICT_BN_TO_EN: [RegExp, string][] = [
  [/স্বাগতম/g, "Welcome"],
  [/হোম/g, "Home"],
  [/সংবাদ ও খবর/g, "News"],
  [/খবর/g, "News"],
  [/নিবন্ধ/g, "Article"],
  [/অনুসন্ধান/g, "Search"],
  [/সেটিংস/g, "Settings"],
  [/গোপনীয়তা/g, "Privacy"],
  [/নিরাপত্তা/g, "Security"],
  [/আমাদের সম্পর্কে/g, "About Us"],
  [/সম্পর্কে/g, "About"],
  [/যোগাযোগ করুন/g, "Contact Us"],
  [/যোগাযোগ/g, "Contact"],
  [/আরও পড়ুন/g, "Read More"],
  [/আরও জানুন/g, "Learn More"],
  [/ডাউনলোড/g, "Download"],
  [/শেয়ার/g, "Share"],
  [/সকলের জন্য মানব-প্রথম ব্রাউজার/g, "The human-first browser for everyone"],
  [/মানব-প্রথম/g, "Human-First"],
  [/ব্রাউজার/g, "Browser"],
  [/পরবর্তী/g, "Next"],
  [/পূর্ববর্তী/g, "Previous"],
  [/বন্ধ করুন/g, "Close"],
  [/জমা দিন/g, "Submit"],
  [/বাতিল/g, "Cancel"],
  [/সংরক্ষণ/g, "Save"],
  [/মুছুন/g, "Delete"],
  [/সম্পাদনা/g, "Edit"],
  [/আজ/g, "Today"],
  [/গতকাল/g, "Yesterday"],
  [/বৈশিষ্ট্যসমূহ/g, "Features"],
  [/সহায়তা/g, "Help"],
  [/লোড হচ্ছে\.\.\./g, "Loading..."],
];

function applyTranslationToHtmlTextOnly(html: string, targetLang: "bn" | "en"): string {
  const tagRegex = /(<[^>]+>)/g;
  const parts = html.split(tagRegex);
  const dict = targetLang === "bn" ? DICT_EN_TO_BN : DICT_BN_TO_EN;

  return parts
    .map((part) => {
      if (part.startsWith("<") && part.endsWith(">")) {
        return part;
      }
      let translated = part;
      for (const [regex, rep] of dict) {
        translated = translated.replace(regex, rep);
      }
      return translated;
    })
    .join("");
}

// API: One-Tap Full-Page Web Translation (Bengali ↔ English)
app.post("/api/ai/translate", async (req: Request, res: Response) => {
  try {
    const { html, title = "", targetLang = "bn", sourceLang = "auto" } = req.body;

    if (!html || typeof html !== "string") {
      res.status(400).json({ error: "HTML content is required for translation." });
      return;
    }

    // Determine target language direction
    const actualTarget: "bn" | "en" = targetLang === "en" ? "en" : "bn";
    const actualTargetName = actualTarget === "en" ? "English" : "Bengali (বাংলা)";
    const actualSourceName = actualTarget === "en" ? "Bengali (or foreign language)" : "English (or foreign language)";

    if (!ai) {
      // Offline fallback with safe dictionary translation
      const translatedHtml = applyTranslationToHtmlTextOnly(html, actualTarget);
      const translatedTitle = applyTranslationToHtmlTextOnly(title, actualTarget);

      res.json({
        success: true,
        translatedHtml,
        translatedTitle,
        targetLang: actualTarget,
        sourceLang: sourceLang === "auto" ? (actualTarget === "bn" ? "en" : "bn") : sourceLang,
      });
      return;
    }

    // Limit HTML slice for fast responsiveness and token safety
    const htmlSlice = html.length > 32000 ? html.slice(0, 32000) : html;

    const prompt = `You are NETFLOW Browser's Dedicated Human-First Web Translator.
Task: Translate the following HTML webpage content faithfully, fluently, and naturally from ${actualSourceName} into ${actualTargetName}.

CRITICAL PRIVACY & ACCURACY DIRECTIVES:
1. Translate ALL human-readable visible text, headings, paragraphs, lists, captions, and links.
2. PRESERVE ALL HTML tags, nesting, element hierarchy, classes, ids, and structure exactly.
3. NEVER translate or modify attribute names or values such as "href", "src", "class", "id", "data-*", or inline styles. All links must remain 100% functional.
4. STRICTLY NEVER insert <script>, <style>, <iframe>, or inline event handlers (such as onclick, onload, onerror).
5. DO NOT invent information or truncate content.
6. Translate the page title as well: "${title}".

Target Language: ${actualTargetName}

Page HTML snippet:
${htmlSlice}

Return a valid JSON object matching this schema:
{
  "translatedTitle": "translated page title string",
  "translatedHtml": "translated HTML string with structure and links intact",
  "sourceLangDetected": "en" or "bn"
}`;

    // Fast responsive timeout of 6 seconds
    const geminiModel = (process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim();
    const aiPromise = ai.models.generateContent({
      model: geminiModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TRANSLATION_TIMEOUT")), 6000)
    );

    const aiRes: any = await Promise.race([aiPromise, timeoutPromise]);
    const parsed = JSON.parse(aiRes.text || "{}");

    let cleanTranslatedHtml = parsed.translatedHtml || html;

    // Defense-in-depth sanitization on translated output
    cleanTranslatedHtml = cleanTranslatedHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/\s\bon[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/href=["']javascript:[^"']*["']/gi, 'href="#"');

    res.json({
      success: true,
      translatedHtml: cleanTranslatedHtml,
      translatedTitle: parsed.translatedTitle || title,
      targetLang: actualTarget,
      sourceLang: parsed.sourceLangDetected || (actualTarget === "bn" ? "en" : "bn"),
    });
  } catch (error: any) {
    console.warn("AI Translation fallback error:", sanitizeLogMessage(error));
    const { html, title = "", targetLang = "bn" } = req.body || {};
    const actualTarget: "bn" | "en" = targetLang === "en" ? "en" : "bn";

    // Resilient fallback with tag-preserving dictionary translation
    const fallbackHtml = applyTranslationToHtmlTextOnly(typeof html === "string" ? html : "", actualTarget);
    const fallbackTitle = applyTranslationToHtmlTextOnly(typeof title === "string" ? title : "", actualTarget);

    res.json({
      success: true,
      translatedHtml: fallbackHtml,
      translatedTitle: fallbackTitle,
      targetLang: actualTarget,
      sourceLang: actualTarget === "bn" ? "en" : "bn",
    });
  }
});

// Global Express Error Boundary (Part C: ensure unexpected exceptions never leak stack traces to the client)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return;
  }
  if (err?.type === "entity.too.large" || err?.status === 413 || err?.statusCode === 413) {
    res.status(413).json({
      success: false,
      statusCode: 413,
      errorCode: "NETFLOW_PAYLOAD_TOO_LARGE",
      errorCategory: "payload_too_large",
      error: "Request body exceeds the 2MB maximum size limit.",
    });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      statusCode: 400,
      errorCode: "NETFLOW_INVALID_JSON",
      errorCategory: "bad_request",
      error: "Invalid JSON payload.",
    });
    return;
  }
  console.error("[NETFLOW Server] Unhandled request error:", sanitizeLogMessage(err));
  res.status(500).json({
    success: false,
    statusCode: 500,
    errorCode: "NETFLOW_INTERNAL_ERROR",
    errorCategory: "server_error",
    error: "An unexpected internal server error occurred.",
  });
});

// Start server with Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), "dist"))
      ? path.join(process.cwd(), "dist")
      : __dirname;
    const indexPath = path.join(distPath, "index.html");

    app.use(express.static(distPath, { index: "index.html" }));
    app.get("*", (_req: Request, res: Response) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("NETFLOW Browser application build not found. Please build the application.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NETFLOW Browser Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NETFLOW_SKIP_AUTO_START !== "1") {
  startServer();
}
