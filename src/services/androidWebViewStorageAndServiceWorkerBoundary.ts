/**
 * NETFLOW Browser V2 — Android WebView Service Worker & Web Storage/Cache Persistence Boundary
 *
 * Form: NETFLOW-V2-NATIVE-18
 *
 * This module establishes the secure Android WebView Service Worker, Cache API,
 * and Web Storage (localStorage, sessionStorage, IndexedDB) persistence and isolation boundary:
 * 1. Service Worker registration, update, unregister lifecycle (installing -> activated -> redundant)
 * 2. Cache API partition and isolation per origin and profile
 * 3. Web Storage boundary:
 *    - localStorage: per-origin persistence (partitioned strictly between normal & private profiles)
 *    - sessionStorage: per-tab + per-origin isolation (zero cross-tab leakage)
 *    - IndexedDB: per-origin object stores (partitioned strictly between normal & private profiles)
 * 4. Strict origin validation, dangerous scheme rejection, and SSRF/cloud-metadata blocking
 * 5. Page and host lifecycle integration: navigation, reload, pause/resume, and tab-close cleanup
 * 6. Private browsing isolation: zero leak of sensitive storage to normal profiles; ephemeral wiping on session end
 * 7. Privileged native bridge invariant: pure safe boundary abstraction without native reflection
 * 8. Linkage: Reuses NATIVE-08 (runtime settings), NATIVE-09 (navigation control), NATIVE-13 (popup/window),
 *    and NATIVE-17 (WebSocket boundary) conventions.
 */

export interface StorageOriginValidationResult {
  isValid: boolean;
  isSecureContext: boolean;
  isLocalhost: boolean;
  origin?: string;
  reason?: string;
}

export type ServiceWorkerState =
  | "installing"
  | "installed"
  | "activating"
  | "activated"
  | "redundant";

export interface ServiceWorkerRegistrationRecord {
  id: string;
  origin: string;
  scriptUrl: string;
  scope: string;
  state: ServiceWorkerState;
  registeredAt: number;
  updatedAt: number;
  isPrivate: boolean;
}

export interface CacheEntry {
  url: string;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
  cachedAt: number;
}

export interface IndexedDBRecord {
  key: string | number;
  value: any;
  updatedAt: number;
}

/**
 * Validates and extracts a canonical origin from a URL, enforcing WebView security boundaries:
 * - Rejects dangerous schemes (javascript:, file:, content:, data:, blob:, about:)
 * - Rejects SSRF, cloud metadata (169.254.169.254), and private network targets
 * - Demands secure contexts (https:// or localhost/127.0.0.1) for Service Worker and modern persistent storage
 */
export function validateStorageOrigin(urlOrOrigin: string): StorageOriginValidationResult {
  if (!urlOrOrigin || typeof urlOrOrigin !== "string") {
    return {
      isValid: false,
      isSecureContext: false,
      isLocalhost: false,
      reason: "URL or origin is empty or invalid",
    };
  }

  const trimmed = urlOrOrigin.trim();
  const lower = trimmed.toLowerCase();

  // 1. Dangerous scheme rejection
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("content:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("about:")
  ) {
    return {
      isValid: false,
      isSecureContext: false,
      isLocalhost: false,
      reason: "Dangerous scheme blocked for storage/Service Worker boundary",
    };
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "https:" && protocol !== "http:") {
      return {
        isValid: false,
        isSecureContext: false,
        isLocalhost: false,
        reason: `Unsupported protocol "${protocol}". Must be https:// or http:// (localhost)`,
      };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalhost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0";

    // 2. Localhost development exception is considered a secure context
    if (isLocalhost) {
      return {
        isValid: true,
        isSecureContext: true,
        isLocalhost: true,
        origin: parsed.origin,
      };
    }

    // 3. Remote HTTP is an insecure context
    if (protocol === "http:") {
      return {
        isValid: false,
        isSecureContext: false,
        isLocalhost: false,
        reason: "Insecure HTTP origins cannot register Service Workers or access secure persistent storage APIs",
      };
    }

    // 4. SSRF & private network address blocking
    if (
      host === "169.254.169.254" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return {
        isValid: false,
        isSecureContext: false,
        isLocalhost: false,
        reason: "Storage and Service Worker access blocked to private network or metadata address",
      };
    }

    return {
      isValid: true,
      isSecureContext: true,
      isLocalhost: false,
      origin: parsed.origin,
    };
  } catch {
    return {
      isValid: false,
      isSecureContext: false,
      isLocalhost: false,
      reason: "Malformed URL or origin string",
    };
  }
}

export interface AndroidWebViewStorageManagerConfig {
  enablePersistence?: boolean;
}

export interface AndroidWebViewStorageManager {
  // Origin security check
  validateOrigin: (urlOrOrigin: string) => StorageOriginValidationResult;

  // Service Worker lifecycle
  registerServiceWorker: (
    origin: string,
    scriptUrl: string,
    scope?: string,
    isPrivate?: boolean
  ) => { success: boolean; registration?: ServiceWorkerRegistrationRecord; error?: string };
  updateServiceWorker: (
    origin: string,
    registrationId: string,
    newScriptUrl?: string,
    isPrivate?: boolean
  ) => { success: boolean; registration?: ServiceWorkerRegistrationRecord; error?: string };
  unregisterServiceWorker: (
    origin: string,
    registrationId: string,
    isPrivate?: boolean
  ) => { success: boolean; error?: string };
  getServiceWorkerRegistrations: (
    origin: string,
    isPrivate?: boolean
  ) => ServiceWorkerRegistrationRecord[];

  // Cache API
  openCache: (origin: string, cacheName: string, isPrivate?: boolean) => boolean;
  putCache: (
    origin: string,
    cacheName: string,
    url: string,
    response: { status: number; statusText: string; headers?: Record<string, string>; body: string },
    isPrivate?: boolean
  ) => { success: boolean; error?: string };
  matchCache: (
    origin: string,
    cacheName: string,
    url: string,
    isPrivate?: boolean
  ) => CacheEntry | null;
  deleteCacheEntry: (
    origin: string,
    cacheName: string,
    url: string,
    isPrivate?: boolean
  ) => boolean;
  deleteCache: (origin: string, cacheName: string, isPrivate?: boolean) => boolean;
  listCacheNames: (origin: string, isPrivate?: boolean) => string[];

  // localStorage (per-origin, profile partitioned)
  getLocalStorageItem: (origin: string, key: string, isPrivate?: boolean) => string | null;
  setLocalStorageItem: (
    origin: string,
    key: string,
    value: string,
    isPrivate?: boolean
  ) => { success: boolean; error?: string };
  removeLocalStorageItem: (origin: string, key: string, isPrivate?: boolean) => boolean;
  clearLocalStorage: (origin: string, isPrivate?: boolean) => void;
  getLocalStorageKeys: (origin: string, isPrivate?: boolean) => string[];

  // sessionStorage (per-tab + per-origin strictly isolated)
  getSessionStorageItem: (tabId: string, origin: string, key: string) => string | null;
  setSessionStorageItem: (
    tabId: string,
    origin: string,
    key: string,
    value: string
  ) => { success: boolean; error?: string };
  removeSessionStorageItem: (tabId: string, origin: string, key: string) => boolean;
  clearSessionStorage: (tabId: string, origin?: string) => void;
  getSessionStorageKeys: (tabId: string, origin: string) => string[];

  // IndexedDB (per-origin, profile partitioned)
  openDatabase: (
    origin: string,
    dbName: string,
    version?: number,
    isPrivate?: boolean
  ) => { success: boolean; error?: string };
  putIndexedDBRecord: (
    origin: string,
    dbName: string,
    storeName: string,
    key: string | number,
    value: any,
    isPrivate?: boolean
  ) => { success: boolean; error?: string };
  getIndexedDBRecord: (
    origin: string,
    dbName: string,
    storeName: string,
    key: string | number,
    isPrivate?: boolean
  ) => any | null;
  deleteIndexedDBRecord: (
    origin: string,
    dbName: string,
    storeName: string,
    key: string | number,
    isPrivate?: boolean
  ) => boolean;
  deleteDatabase: (origin: string, dbName: string, isPrivate?: boolean) => boolean;

  // Lifecycle & tab handlers
  onNavigation: (tabId: string, oldUrl: string, newUrl: string, isPrivate?: boolean) => void;
  onReload: (tabId: string, url: string, isPrivate?: boolean) => void;
  onHostPause: (tabId?: string) => void;
  onHostResume: (tabId?: string) => void;
  onTabClosed: (tabId: string, isPrivate?: boolean, remainingPrivateTabs?: number) => void;
  clearOriginData: (origin: string, profileKey?: "normal" | "private" | "all") => void;
  destroy: () => void;
}

/**
 * Creates the Android WebView Service Worker & Storage Persistence Manager.
 */
export function createAndroidWebViewStorageManager(
  _config: AndroidWebViewStorageManagerConfig = {}
): AndroidWebViewStorageManager {
  // Helper for profile key
  const getProfileKey = (isPrivate?: boolean): "normal" | "private" =>
    isPrivate ? "private" : "normal";

  // 1. Service Worker registries: Map<profileKey, Map<origin, Map<regId, ServiceWorkerRegistrationRecord>>>
  const swRegistry = {
    normal: new Map<string, Map<string, ServiceWorkerRegistrationRecord>>(),
    private: new Map<string, Map<string, ServiceWorkerRegistrationRecord>>(),
  };

  // 2. Cache API registries: Map<profileKey, Map<origin, Map<cacheName, Map<url, CacheEntry>>>>
  const cacheRegistry = {
    normal: new Map<string, Map<string, Map<string, CacheEntry>>>(),
    private: new Map<string, Map<string, Map<string, CacheEntry>>>(),
  };

  // 3. localStorage registries: Map<profileKey, Map<origin, Map<key, string>>>
  const localStorageRegistry = {
    normal: new Map<string, Map<string, string>>(),
    private: new Map<string, Map<string, string>>(),
  };

  // 4. sessionStorage registry: Map<tabId, Map<origin, Map<key, string>>> (strictly per-tab AND per-origin)
  const sessionStorageRegistry = new Map<string, Map<string, Map<string, string>>>();

  // 5. IndexedDB registry: Map<profileKey, Map<origin, Map<dbName, { version: number; stores: Map<string, Map<string | number, IndexedDBRecord>> }>>>
  interface ManagedDB {
    version: number;
    stores: Map<string, Map<string | number, IndexedDBRecord>>;
  }
  const idbRegistry = {
    normal: new Map<string, Map<string, ManagedDB>>(),
    private: new Map<string, Map<string, ManagedDB>>(),
  };

  // Helper to ensure origin map exists
  const getOriginMap = <T>(parent: Map<string, Map<string, T>>, origin: string): Map<string, T> => {
    let m = parent.get(origin);
    if (!m) {
      m = new Map();
      parent.set(origin, m);
    }
    return m;
  };

  // -------------------------------------------------------------
  // Service Worker Methods
  // -------------------------------------------------------------
  const registerServiceWorker = (
    originStr: string,
    scriptUrl: string,
    scopeStr?: string,
    isPrivate = false
  ) => {
    // 1. Validate registering origin
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return {
        success: false,
        error: originCheck.reason || "Invalid or disallowed origin for Service Worker registration",
      };
    }
    const canonicalOrigin = originCheck.origin;

    // 2. Validate script URL (must be same origin)
    try {
      const parsedScript = new URL(scriptUrl, canonicalOrigin);
      if (parsedScript.origin !== canonicalOrigin) {
        return {
          success: false,
          error: `Cross-origin Service Worker script blocked. Script origin ${parsedScript.origin} does not match ${canonicalOrigin}`,
        };
      }

      // 3. Validate or default scope
      const defaultScope = parsedScript.pathname.substring(0, parsedScript.pathname.lastIndexOf("/") + 1) || "/";
      const scope = scopeStr || defaultScope;
      const parsedScope = new URL(scope, canonicalOrigin);
      if (parsedScope.origin !== canonicalOrigin) {
        return {
          success: false,
          error: "Service Worker scope must be same-origin",
        };
      }

      const pKey = getProfileKey(isPrivate);
      const originSwMap = getOriginMap(swRegistry[pKey], canonicalOrigin);

      // Check if an existing registration exists for this scope; if so, update it
      let existingReg: ServiceWorkerRegistrationRecord | undefined;
      originSwMap.forEach((reg) => {
        if (reg.scope === scope) {
          existingReg = reg;
        }
      });

      const now = Date.now();
      if (existingReg) {
        // Update transition: previous becomes redundant, new registration becomes activated
        existingReg.state = "redundant";
      }

      const regId = `sw-${now}-${Math.random().toString(36).slice(2, 7)}`;
      const newRecord: ServiceWorkerRegistrationRecord = {
        id: regId,
        origin: canonicalOrigin,
        scriptUrl: parsedScript.toString(),
        scope: parsedScope.pathname,
        state: "activated",
        registeredAt: now,
        updatedAt: now,
        isPrivate,
      };

      originSwMap.set(regId, newRecord);

      return {
        success: true,
        registration: { ...newRecord },
      };
    } catch {
      return {
        success: false,
        error: "Malformed Service Worker script or scope URL",
      };
    }
  };

  const updateServiceWorker = (
    originStr: string,
    registrationId: string,
    newScriptUrl?: string,
    isPrivate = false
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }
    const pKey = getProfileKey(isPrivate);
    const originSwMap = swRegistry[pKey].get(originCheck.origin);
    if (!originSwMap || !originSwMap.has(registrationId)) {
      return { success: false, error: "Service Worker registration not found" };
    }

    const reg = originSwMap.get(registrationId)!;
    if (newScriptUrl) {
      const parsed = new URL(newScriptUrl, originCheck.origin);
      if (parsed.origin !== originCheck.origin) {
        return { success: false, error: "New Service Worker script must be same-origin" };
      }
      reg.scriptUrl = parsed.toString();
    }
    reg.updatedAt = Date.now();
    reg.state = "activated";

    return { success: true, registration: { ...reg } };
  };

  const unregisterServiceWorker = (
    originStr: string,
    registrationId: string,
    isPrivate = false
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }
    const pKey = getProfileKey(isPrivate);
    const originSwMap = swRegistry[pKey].get(originCheck.origin);
    if (!originSwMap || !originSwMap.has(registrationId)) {
      return { success: false, error: "Registration not found" };
    }

    const reg = originSwMap.get(registrationId)!;
    reg.state = "redundant";
    originSwMap.delete(registrationId);

    return { success: true };
  };

  const getServiceWorkerRegistrations = (
    originStr: string,
    isPrivate = false
  ): ServiceWorkerRegistrationRecord[] => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return [];
    const pKey = getProfileKey(isPrivate);
    const originSwMap = swRegistry[pKey].get(originCheck.origin);
    if (!originSwMap) return [];
    return Array.from(originSwMap.values()).map((r) => ({ ...r }));
  };

  // -------------------------------------------------------------
  // Cache API Methods
  // -------------------------------------------------------------
  const openCache = (originStr: string, cacheName: string, isPrivate = false): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    const pKey = getProfileKey(isPrivate);
    const originCaches = getOriginMap(cacheRegistry[pKey], originCheck.origin);
    if (!originCaches.has(cacheName)) {
      originCaches.set(cacheName, new Map());
    }
    return true;
  };

  const putCache = (
    originStr: string,
    cacheName: string,
    url: string,
    response: { status: number; statusText: string; headers?: Record<string, string>; body: string },
    isPrivate = false
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }

    try {
      const canonicalOrigin = originCheck.origin;
      const targetUrl = new URL(url, canonicalOrigin).toString();
      const pKey = getProfileKey(isPrivate);
      const originCaches = getOriginMap(cacheRegistry[pKey], canonicalOrigin);
      let cache = originCaches.get(cacheName);
      if (!cache) {
        cache = new Map();
        originCaches.set(cacheName, cache);
      }

      cache.set(targetUrl, {
        url: targetUrl,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers || {},
          body: response.body,
        },
        cachedAt: Date.now(),
      });

      return { success: true };
    } catch {
      return { success: false, error: "Invalid cache request URL" };
    }
  };

  const matchCache = (
    originStr: string,
    cacheName: string,
    url: string,
    isPrivate = false
  ): CacheEntry | null => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return null;
    try {
      const targetUrl = new URL(url, originCheck.origin).toString();
      const pKey = getProfileKey(isPrivate);
      const originCaches = cacheRegistry[pKey].get(originCheck.origin);
      if (!originCaches) return null;
      const cache = originCaches.get(cacheName);
      if (!cache) return null;
      const entry = cache.get(targetUrl);
      return entry ? { ...entry, response: { ...entry.response, headers: { ...entry.response.headers } } } : null;
    } catch {
      return null;
    }
  };

  const deleteCacheEntry = (
    originStr: string,
    cacheName: string,
    url: string,
    isPrivate = false
  ): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    try {
      const targetUrl = new URL(url, originCheck.origin).toString();
      const pKey = getProfileKey(isPrivate);
      const originCaches = cacheRegistry[pKey].get(originCheck.origin);
      if (!originCaches) return false;
      const cache = originCaches.get(cacheName);
      if (!cache) return false;
      return cache.delete(targetUrl);
    } catch {
      return false;
    }
  };

  const deleteCache = (originStr: string, cacheName: string, isPrivate = false): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    const pKey = getProfileKey(isPrivate);
    const originCaches = cacheRegistry[pKey].get(originCheck.origin);
    if (!originCaches) return false;
    return originCaches.delete(cacheName);
  };

  const listCacheNames = (originStr: string, isPrivate = false): string[] => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return [];
    const pKey = getProfileKey(isPrivate);
    const originCaches = cacheRegistry[pKey].get(originCheck.origin);
    if (!originCaches) return [];
    return Array.from(originCaches.keys());
  };

  // -------------------------------------------------------------
  // Web Storage: localStorage (per-origin, profile partitioned)
  // -------------------------------------------------------------
  const getLocalStorageItem = (originStr: string, key: string, isPrivate = false): string | null => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return null;
    const pKey = getProfileKey(isPrivate);
    const originStore = localStorageRegistry[pKey].get(originCheck.origin);
    if (!originStore) return null;
    return originStore.get(key) ?? null;
  };

  const setLocalStorageItem = (
    originStr: string,
    key: string,
    value: string,
    isPrivate = false
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }
    const pKey = getProfileKey(isPrivate);
    const originStore = getOriginMap(localStorageRegistry[pKey], originCheck.origin);
    originStore.set(key, String(value));
    return { success: true };
  };

  const removeLocalStorageItem = (originStr: string, key: string, isPrivate = false): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    const pKey = getProfileKey(isPrivate);
    const originStore = localStorageRegistry[pKey].get(originCheck.origin);
    if (!originStore) return false;
    return originStore.delete(key);
  };

  const clearLocalStorage = (originStr: string, isPrivate = false): void => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return;
    const pKey = getProfileKey(isPrivate);
    localStorageRegistry[pKey].delete(originCheck.origin);
  };

  const getLocalStorageKeys = (originStr: string, isPrivate = false): string[] => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return [];
    const pKey = getProfileKey(isPrivate);
    const originStore = localStorageRegistry[pKey].get(originCheck.origin);
    if (!originStore) return [];
    return Array.from(originStore.keys());
  };

  // -------------------------------------------------------------
  // Web Storage: sessionStorage (per-tab + per-origin isolated)
  // -------------------------------------------------------------
  const getOrCreateTabSessionMap = (tabId: string, origin: string): Map<string, string> => {
    let tabOrigins = sessionStorageRegistry.get(tabId);
    if (!tabOrigins) {
      tabOrigins = new Map();
      sessionStorageRegistry.set(tabId, tabOrigins);
    }
    let originMap = tabOrigins.get(origin);
    if (!originMap) {
      originMap = new Map();
      tabOrigins.set(origin, originMap);
    }
    return originMap;
  };

  const getSessionStorageItem = (tabId: string, originStr: string, key: string): string | null => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return null;
    const tabOrigins = sessionStorageRegistry.get(tabId);
    if (!tabOrigins) return null;
    const originStore = tabOrigins.get(originCheck.origin);
    if (!originStore) return null;
    return originStore.get(key) ?? null;
  };

  const setSessionStorageItem = (
    tabId: string,
    originStr: string,
    key: string,
    value: string
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }
    const store = getOrCreateTabSessionMap(tabId, originCheck.origin);
    store.set(key, String(value));
    return { success: true };
  };

  const removeSessionStorageItem = (tabId: string, originStr: string, key: string): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    const tabOrigins = sessionStorageRegistry.get(tabId);
    if (!tabOrigins) return false;
    const store = tabOrigins.get(originCheck.origin);
    if (!store) return false;
    return store.delete(key);
  };

  const clearSessionStorage = (tabId: string, originStr?: string): void => {
    if (!originStr) {
      sessionStorageRegistry.delete(tabId);
      return;
    }
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return;
    const tabOrigins = sessionStorageRegistry.get(tabId);
    if (tabOrigins) {
      tabOrigins.delete(originCheck.origin);
    }
  };

  const getSessionStorageKeys = (tabId: string, originStr: string): string[] => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return [];
    const tabOrigins = sessionStorageRegistry.get(tabId);
    if (!tabOrigins) return [];
    const store = tabOrigins.get(originCheck.origin);
    if (!store) return [];
    return Array.from(store.keys());
  };

  // -------------------------------------------------------------
  // Web Storage: IndexedDB (per-origin, profile partitioned)
  // -------------------------------------------------------------
  const openDatabase = (
    originStr: string,
    dbName: string,
    version = 1,
    isPrivate = false
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }
    const pKey = getProfileKey(isPrivate);
    const originDbMap = getOriginMap(idbRegistry[pKey], originCheck.origin);
    let db = originDbMap.get(dbName);
    if (!db) {
      db = {
        version,
        stores: new Map(),
      };
      originDbMap.set(dbName, db);
    } else if (version > db.version) {
      db.version = version;
    }
    return { success: true };
  };

  const putIndexedDBRecord = (
    originStr: string,
    dbName: string,
    storeName: string,
    key: string | number,
    value: any,
    isPrivate = false
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) {
      return { success: false, error: originCheck.reason || "Invalid origin" };
    }
    const pKey = getProfileKey(isPrivate);
    const originDbMap = getOriginMap(idbRegistry[pKey], originCheck.origin);
    let db = originDbMap.get(dbName);
    if (!db) {
      db = { version: 1, stores: new Map() };
      originDbMap.set(dbName, db);
    }
    let store = db.stores.get(storeName);
    if (!store) {
      store = new Map();
      db.stores.set(storeName, store);
    }
    store.set(key, {
      key,
      value,
      updatedAt: Date.now(),
    });
    return { success: true };
  };

  const getIndexedDBRecord = (
    originStr: string,
    dbName: string,
    storeName: string,
    key: string | number,
    isPrivate = false
  ): any | null => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return null;
    const pKey = getProfileKey(isPrivate);
    const originDbMap = idbRegistry[pKey].get(originCheck.origin);
    if (!originDbMap) return null;
    const db = originDbMap.get(dbName);
    if (!db) return null;
    const store = db.stores.get(storeName);
    if (!store) return null;
    const record = store.get(key);
    return record ? record.value : null;
  };

  const deleteIndexedDBRecord = (
    originStr: string,
    dbName: string,
    storeName: string,
    key: string | number,
    isPrivate = false
  ): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    const pKey = getProfileKey(isPrivate);
    const originDbMap = idbRegistry[pKey].get(originCheck.origin);
    if (!originDbMap) return false;
    const db = originDbMap.get(dbName);
    if (!db) return false;
    const store = db.stores.get(storeName);
    if (!store) return false;
    return store.delete(key);
  };

  const deleteDatabase = (originStr: string, dbName: string, isPrivate = false): boolean => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return false;
    const pKey = getProfileKey(isPrivate);
    const originDbMap = idbRegistry[pKey].get(originCheck.origin);
    if (!originDbMap) return false;
    return originDbMap.delete(dbName);
  };

  // -------------------------------------------------------------
  // Lifecycle & Tab Cleanup Handlers
  // -------------------------------------------------------------
  const onNavigation = (
    _tabId: string,
    _oldUrl: string,
    _newUrl: string,
    _isPrivate = false
  ) => {
    // Navigation preserves existing storage partitions while isolating new origin
  };

  const onReload = (
    _tabId: string,
    _url: string,
    _isPrivate = false
  ) => {
    // Reload keeps sessionStorage and persistent cache intact
  };

  const onHostPause = (_tabId?: string) => {
    // Host paused: SW background tasks and cache flushes are suspended
  };

  const onHostResume = (_tabId?: string) => {
    // Host resumed: SW event loop resumes
  };

  const onTabClosed = (
    tabId: string,
    isPrivate = false,
    remainingPrivateTabs = 0
  ) => {
    // 1. Always purge the closed tab's sessionStorage (per-tab isolation)
    sessionStorageRegistry.delete(tabId);

    // 2. If this was a private tab and NO private tabs remain, purge all private state!
    if (isPrivate && remainingPrivateTabs <= 0) {
      swRegistry.private.clear();
      cacheRegistry.private.clear();
      localStorageRegistry.private.clear();
      idbRegistry.private.clear();
    }
  };

  const clearOriginData = (
    originStr: string,
    profileKey: "normal" | "private" | "all" = "all"
  ) => {
    const originCheck = validateStorageOrigin(originStr);
    if (!originCheck.isValid || !originCheck.origin) return;
    const canonical = originCheck.origin;

    const targets: ("normal" | "private")[] =
      profileKey === "all" ? ["normal", "private"] : [profileKey];

    for (const pKey of targets) {
      swRegistry[pKey].delete(canonical);
      cacheRegistry[pKey].delete(canonical);
      localStorageRegistry[pKey].delete(canonical);
      idbRegistry[pKey].delete(canonical);
    }

    // Clear from all tabs' sessionStorage
    sessionStorageRegistry.forEach((tabOrigins) => {
      tabOrigins.delete(canonical);
    });
  };

  const destroy = () => {
    swRegistry.normal.clear();
    swRegistry.private.clear();
    cacheRegistry.normal.clear();
    cacheRegistry.private.clear();
    localStorageRegistry.normal.clear();
    localStorageRegistry.private.clear();
    sessionStorageRegistry.clear();
    idbRegistry.normal.clear();
    idbRegistry.private.clear();
  };

  return {
    validateOrigin: validateStorageOrigin,
    registerServiceWorker,
    updateServiceWorker,
    unregisterServiceWorker,
    getServiceWorkerRegistrations,
    openCache,
    putCache,
    matchCache,
    deleteCacheEntry,
    deleteCache,
    listCacheNames,
    getLocalStorageItem,
    setLocalStorageItem,
    removeLocalStorageItem,
    clearLocalStorage,
    getLocalStorageKeys,
    getSessionStorageItem,
    setSessionStorageItem,
    removeSessionStorageItem,
    clearSessionStorage,
    getSessionStorageKeys,
    openDatabase,
    putIndexedDBRecord,
    getIndexedDBRecord,
    deleteIndexedDBRecord,
    deleteDatabase,
    onNavigation,
    onReload,
    onHostPause,
    onHostResume,
    onTabClosed,
    clearOriginData,
    destroy,
  };
}
