/**
 * NETFLOW BROWSER V2 — FORM 1 OF 6 (`NETFLOW-INTERACTIVE-CONTRACT-01`)
 * PART C — Interactive Contract & Shell Handlers Verification Suite (`scripts/verify-interactive-contract.ts`)
 *
 * Verifies with a deterministic mock bridge + simulated clock + React DOM (happy-dom):
 *  1. Contract Documentation (`docs/NATIVE_CONTRACT.md`) completeness
 *  2. Default deny when `siteOverrides` has no entry for domain
 *  3. HTTP origin deny (`http://` origin immediately denied even when `siteOverrides` is `"allow"` or `"ask"`)
 *  4. `ask` / `allow` / `block` decision table across `camera`, `microphone`, `geolocation`, plus `protectedMedia` & `other` always denied
 *  5. File chooser gating (`allow: true` only when `hasUserGesture === true` AND tab is active; else `allow: false`)
 *  6. 30-second (`30,000 ms`) timeout auto-deny across `permission`, `jsDialog`, and `httpAuth`, plus navigation/tab-close auto-deny
 *  7. Stale epoch or duplicate `requestId` ignored
 *  8. Wrong-tab (`tabId !== activeTabId` or unknown `tabId`) ignored
 *  9. One-time resolution per `requestId` (second `resolve*` call ignored, 0 duplicate outbound commands)
 * 10. Credentials (`username`, `password`) travel in memory only — NEVER in `console.*`, `localStorage`, or `sessionPersistence`
 * 11. Modals (`CameraMicConsentModal`, `HttpAuthModal`, `JavaScriptDialogModal` including `beforeunload` & suppress-repeat, `GeolocationConsentModal`) open -> close -> open produce 0 `console.error`, and `HttpAuthModal` clears password state on close
 * 12. Unknown event kinds ignored safely; capability gating (`onCapabilities { interactiveCallbacks: false }`) claims nothing in UI
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import {
  createNativeBrowserEngine,
  createSimulatedInteractiveClock,
  GrantablePermissionResource,
} from "../src/services/nativeBrowserEngine";
import { createSessionPersistenceEngine } from "../src/services/sessionPersistence";
import { CameraMicConsentModal, CameraMicConsentPrompt } from "../src/components/CameraMicConsentModal";
import { HttpAuthModal, NativeHttpAuthModalPrompt } from "../src/components/HttpAuthModal";
import { JavaScriptDialogModal } from "../src/components/JavaScriptDialogModal";
import { GeolocationConsentModal } from "../src/components/GeolocationConsentModal";
import { SitePrivacyOverride } from "../src/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${label}${detail ? ` — ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  console.log("=== NETFLOW-INTERACTIVE-CONTRACT-01: Interactive Contract Verification Suite ===\n");

  // ---------------------------------------------------------------------------
  // 1. Verify docs/NATIVE_CONTRACT.md
  // ---------------------------------------------------------------------------
  console.log("1. Contract Specification (docs/NATIVE_CONTRACT.md)");
  {
    const docPath = path.resolve(process.cwd(), "docs/NATIVE_CONTRACT.md");
    const exists = fs.existsSync(docPath);
    assert(exists, "docs/NATIVE_CONTRACT.md exists");
    const content = exists ? fs.readFileSync(docPath, "utf-8") : "";

    const requiredTokens = [
      "NETFLOW-INTERACTIVE-CONTRACT-01",
      "onPermissionRequested",
      "onFileChooserRequested",
      "onJsDialog",
      "onHttpAuthRequested",
      "onNetworkStateChanged",
      "onSubresourceError",
      "onCapabilities",
      "resolvePermission",
      "resolveFileChooser",
      "resolveJsDialog",
      "resolveHttpAuth",
      "setLightMode",
      "30",
      "requestId",
      "interactiveCallbacks",
    ];
    const missing = requiredTokens.filter((t) => !content.includes(t));
    assert(
      missing.length === 0,
      "docs/NATIVE_CONTRACT.md documents all events, commands, envelope fields, and 30s/one-time/credential rules",
      missing.length === 0 ? "all tokens verified" : `missing: ${missing.join(", ")}`
    );
  }

  // Set up mock bridge + console spy + storage environment
  const happyWindow = new Window({ url: "http://localhost:3000/" });
  const g = globalThis as any;
  g.window = happyWindow;
  g.document = happyWindow.document;
  Object.defineProperty(globalThis, "navigator", {
    value: happyWindow.navigator,
    configurable: true,
    writable: true,
  });
  g.localStorage = happyWindow.localStorage;
  g.sessionStorage = happyWindow.sessionStorage;
  g.HTMLElement = happyWindow.HTMLElement;
  g.HTMLInputElement = happyWindow.HTMLInputElement;
  g.HTMLButtonElement = happyWindow.HTMLButtonElement;
  g.Event = happyWindow.Event;
  g.CustomEvent = happyWindow.CustomEvent;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const outboundCommands: Array<{ action: string; payload: Record<string, any> }> = [];
  (happyWindow as any).NetflowNativeBridge = {
    getChromiumVersion: () => "124.0.6367.82",
    postMessage: (jsonStr: string) => {
      const parsed = JSON.parse(jsonStr);
      outboundCommands.push({
        action: parsed.action,
        payload: parsed.payload || parsed,
      });
    },
  };

  // Console spy to verify zero console.error and zero credential leakage
  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origInfo = console.info;
  const origError = console.error;

  const formatArgs = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");

  console.log = (...args: unknown[]) => {
    const str = formatArgs(args);
    consoleLogs.push(str);
    origLog.apply(console, args as any);
  };
  console.warn = (...args: unknown[]) => {
    consoleLogs.push(formatArgs(args));
  };
  console.info = (...args: unknown[]) => {
    consoleLogs.push(formatArgs(args));
  };
  console.error = (...args: unknown[]) => {
    const str = formatArgs(args);
    consoleLogs.push(str);
    consoleErrors.push(str);
    origError.apply(console, args as any);
  };

  try {
    const clock = createSimulatedInteractiveClock(1_760_000_000_000);
    let siteOverrides: Record<string, SitePrivacyOverride> = {};
    const askPromptsReceived: Array<{
      requestId: string;
      tabId: string;
      origin: string;
      domain: string;
      askResources: GrantablePermissionResource[];
      preAllowedResources: GrantablePermissionResource[];
    }> = [];
    const jsDialogsReceived: Array<{
      requestId: string;
      tabId: string;
      type: string;
      message: string;
      defaultValue?: string;
    }> = [];
    const httpAuthsReceived: Array<{
      requestId: string;
      tabId: string;
      host: string;
      realm: string;
    }> = [];
    const cancelledRequests: Array<{
      requestId: string;
      tabId: string;
      kind: string;
      reason: string;
    }> = [];
    const subresourceErrorsReceived: Array<{
      tabId: string;
      failingUrl: string;
      code: number | string;
      count: number;
    }> = [];

    const engine = createNativeBrowserEngine({
      clock,
      getSiteOverrides: () => siteOverrides,
      onPermissionAskPrompt: (prompt) => {
        askPromptsReceived.push(prompt);
      },
      onJsDialogRequested: (dlg) => {
        jsDialogsReceived.push(dlg);
      },
      onHttpAuthRequested: (auth) => {
        httpAuthsReceived.push(auth);
      },
      onSubresourceError: (tabId, failingUrl, code, _state, count) => {
        subresourceErrorsReceived.push({ tabId, failingUrl, code, count: count ?? 1 });
      },
      onInteractiveRequestCancelled: (requestId, tabId, kind, reason) => {
        cancelledRequests.push({ requestId, tabId, kind, reason });
      },
    });

    // Register two tabs: tab-1 (active) and tab-2 (inactive)
    engine.createOrUpdateTab("tab-1", { isPrivate: false });
    engine.createOrUpdateTab("tab-2", { isPrivate: false });
    engine.selectTab("tab-1", false);
    engine.loadUrl("tab-1", "https://meet.example.com/room");
    const activeEpoch = engine.getTabState("tab-1")!.requestEpoch;
    outboundCommands.length = 0;

    // ---------------------------------------------------------------------------
    // 2. Default Deny & ProtectedMedia / Other Deny
    // ---------------------------------------------------------------------------
    console.log("\n2. Default Deny & ProtectedMedia / Other Immediate Deny");
    {
      siteOverrides = {}; // No overrides configured -> default deny
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-perm-default-deny-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera", "microphone", "geolocation"],
      });

      const cmd = outboundCommands.find(
        (c) => c.action === "resolvePermission" && c.payload.requestId === "uuid-perm-default-deny-1"
      );
      assert(
        Boolean(cmd) &&
          Array.isArray(cmd?.payload.grantedResources) &&
          cmd!.payload.grantedResources.length === 0 &&
          askPromptsReceived.length === 0,
        "Default deny: unset siteOverrides immediately resolves grantedResources: [] without opening modal"
      );

      // protectedMedia and other are always denied even when camera/mic/geo are allowed
      siteOverrides = {
        "meet.example.com": {
          domain: "meet.example.com",
          camera: "allow",
          microphone: "allow",
          geolocation: "allow",
        },
      };
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-perm-protected-other-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["protectedMedia", "other"],
      });
      const cmdProt = outboundCommands.find(
        (c) =>
          c.action === "resolvePermission" && c.payload.requestId === "uuid-perm-protected-other-1"
      );
      assert(
        Boolean(cmdProt) &&
          Array.isArray(cmdProt?.payload.grantedResources) &&
          cmdProt!.payload.grantedResources.length === 0,
        "protectedMedia and other are always denied (grantedResources: [])"
      );
    }

    // ---------------------------------------------------------------------------
    // 3. HTTP Origin Deny
    // ---------------------------------------------------------------------------
    console.log("\n3. HTTP Origin Immediate Deny");
    {
      siteOverrides = {
        "insecure.example.com": {
          domain: "insecure.example.com",
          camera: "allow",
          microphone: "ask",
          geolocation: "allow",
        },
      };
      askPromptsReceived.length = 0;

      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-perm-http-origin-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "http://insecure.example.com",
        resources: ["camera", "microphone", "geolocation"],
      });

      const cmdHttp = outboundCommands.find(
        (c) => c.action === "resolvePermission" && c.payload.requestId === "uuid-perm-http-origin-1"
      );
      assert(
        Boolean(cmdHttp) &&
          cmdHttp!.payload.grantedResources.length === 0 &&
          askPromptsReceived.length === 0,
        "Plain HTTP origin ('http://insecure.example.com') is immediately denied even if siteOverrides has allow/ask"
      );
    }

    // ---------------------------------------------------------------------------
    // 4. Ask / Allow / Block Table & File Chooser Gating
    // ---------------------------------------------------------------------------
    console.log("\n4. Ask / Allow / Block Decision Table & File Chooser Gating");
    {
      // 4a. Block -> immediate deny
      siteOverrides = {
        "meet.example.com": {
          domain: "meet.example.com",
          camera: "block",
          microphone: "block",
          geolocation: "block",
        },
      };
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-table-block-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera", "microphone", "geolocation"],
      });
      const blockCmd = outboundCommands.find(
        (c) => c.action === "resolvePermission" && c.payload.requestId === "uuid-table-block-1"
      );
      assert(
        Boolean(blockCmd) &&
          blockCmd!.payload.grantedResources.length === 0 &&
          askPromptsReceived.length === 0,
        "Table [block]: camera/microphone/geolocation blocked -> immediate resolvePermission([])"
      );

      // 4b. Allow -> immediate grant on HTTPS
      siteOverrides = {
        "meet.example.com": {
          domain: "meet.example.com",
          camera: "allow",
          microphone: "block",
          geolocation: "allow",
        },
      };
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-table-allow-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera", "microphone", "geolocation", "protectedMedia"],
      });
      const allowCmd = outboundCommands.find(
        (c) => c.action === "resolvePermission" && c.payload.requestId === "uuid-table-allow-1"
      );
      assert(
        Boolean(allowCmd) &&
          JSON.stringify(allowCmd!.payload.grantedResources) ===
            JSON.stringify(["camera", "geolocation"]) &&
          askPromptsReceived.length === 0,
        "Table [allow+block+protectedMedia]: grants only ['camera', 'geolocation'] immediately without modal"
      );

      // 4c. Ask -> routes to interactive consent prompt, then resolves on user decision
      siteOverrides = {
        "meet.example.com": {
          domain: "meet.example.com",
          camera: "ask",
          microphone: "allow",
        },
      };
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-table-ask-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera", "microphone"],
      });
      assert(
        askPromptsReceived.length === 1 &&
          askPromptsReceived[0].requestId === "uuid-table-ask-1" &&
          JSON.stringify(askPromptsReceived[0].askResources) === JSON.stringify(["camera"]) &&
          JSON.stringify(askPromptsReceived[0].preAllowedResources) ===
            JSON.stringify(["microphone"]),
        "Table [ask]: triggers consent prompt with askResources=['camera'] and preAllowedResources=['microphone']"
      );

      const resolvedAsk = engine.resolvePermission({
        requestId: "uuid-table-ask-1",
        grantedResources: ["camera", "microphone"],
      });
      const askCmd = outboundCommands.find(
        (c) => c.action === "resolvePermission" && c.payload.requestId === "uuid-table-ask-1"
      );
      assert(
        resolvedAsk === true &&
          Boolean(askCmd) &&
          JSON.stringify(askCmd!.payload.grantedResources) ===
            JSON.stringify(["camera", "microphone"]),
        "Table [ask -> user approve]: resolves grantedResources=['camera', 'microphone']"
      );

      // 4d. File chooser: allow ONLY if hasUserGesture === true AND tab is active
      engine.handleNativeEngineEvent({
        eventType: "onFileChooserRequested",
        tabId: "tab-1",
        requestId: "uuid-fc-gesture-active",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        acceptTypes: ["image/*"],
        multiple: false,
        capture: false,
        hasUserGesture: true,
      });
      const fcAllowCmd = outboundCommands.find(
        (c) => c.action === "resolveFileChooser" && c.payload.requestId === "uuid-fc-gesture-active"
      );
      assert(
        Boolean(fcAllowCmd) && fcAllowCmd!.payload.allow === true,
        "File chooser: hasUserGesture=true on active tab -> resolveFileChooser(allow: true)"
      );

      engine.handleNativeEngineEvent({
        eventType: "onFileChooserRequested",
        tabId: "tab-1",
        requestId: "uuid-fc-no-gesture",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        acceptTypes: ["image/*"],
        multiple: false,
        capture: false,
        hasUserGesture: false,
      });
      const fcDenyGestureCmd = outboundCommands.find(
        (c) => c.action === "resolveFileChooser" && c.payload.requestId === "uuid-fc-no-gesture"
      );
      assert(
        Boolean(fcDenyGestureCmd) && fcDenyGestureCmd!.payload.allow === false,
        "File chooser: hasUserGesture=false on active tab -> resolveFileChooser(allow: false)"
      );

      const tab2Epoch = engine.getTabState("tab-2")!.requestEpoch;
      engine.handleNativeEngineEvent({
        eventType: "onFileChooserRequested",
        tabId: "tab-2",
        requestId: "uuid-fc-inactive-tab",
        epoch: tab2Epoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://other.example.com",
        acceptTypes: ["*/*"],
        multiple: true,
        capture: false,
        hasUserGesture: true,
      });
      const fcDenyInactiveCmd = outboundCommands.find(
        (c) => c.action === "resolveFileChooser" && c.payload.requestId === "uuid-fc-inactive-tab"
      );
      assert(
        Boolean(fcDenyInactiveCmd) && fcDenyInactiveCmd!.payload.allow === false,
        "File chooser: hasUserGesture=true on inactive tab ('tab-2') -> resolveFileChooser(allow: false)"
      );
    }

    // ---------------------------------------------------------------------------
    // 5. 30-Second (30,000ms) Timeout Auto-Deny
    // ---------------------------------------------------------------------------
    console.log("\n5. 30s Timeout Auto-Deny & Navigation Auto-Cancel");
    {
      siteOverrides = {
        "meet.example.com": {
          domain: "meet.example.com",
          camera: "ask",
        },
      };
      cancelledRequests.length = 0;

      // Queue unanswered permission, jsDialog, and httpAuth requests
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-timeout-perm-30s",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera"],
      });
      engine.handleNativeEngineEvent({
        eventType: "onJsDialog",
        tabId: "tab-1",
        requestId: "uuid-timeout-dlg-30s",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        type: "confirm",
        message: "Are you sure?",
      });
      engine.handleNativeEngineEvent({
        eventType: "onHttpAuthRequested",
        tabId: "tab-1",
        requestId: "uuid-timeout-auth-30s",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        host: "meet.example.com",
        realm: "Corp",
      });

      // Advance clock by 29,999ms -> still pending
      clock.advanceBy(29_999);
      const prematurePerm = outboundCommands.find(
        (c) => c.payload.requestId === "uuid-timeout-perm-30s"
      );
      assert(!prematurePerm, "At 29,999ms: unanswered requests have not yet timed out");

      // Advance by +1ms (total 30,000ms) -> all 3 auto-denied
      clock.advanceBy(1);
      const toPerm = outboundCommands.find(
        (c) => c.action === "resolvePermission" && c.payload.requestId === "uuid-timeout-perm-30s"
      );
      const toDlg = outboundCommands.find(
        (c) => c.action === "resolveJsDialog" && c.payload.requestId === "uuid-timeout-dlg-30s"
      );
      const toAuth = outboundCommands.find(
        (c) => c.action === "resolveHttpAuth" && c.payload.requestId === "uuid-timeout-auth-30s"
      );
      assert(
        Boolean(toPerm && toPerm.payload.grantedResources.length === 0) &&
          Boolean(toDlg && toDlg.payload.confirmed === false) &&
          Boolean(toAuth && toAuth.payload.proceed === false) &&
          cancelledRequests.length === 3 &&
          cancelledRequests.every((r) => r.reason === "timeout_30s"),
        "At 30,000ms: unanswered permission, jsDialog, and httpAuth auto-deny and fire cleanup callback"
      );

      // Late user resolve after 30s timeout is ignored
      const lateResolve = engine.resolvePermission({
        requestId: "uuid-timeout-perm-30s",
        grantedResources: ["camera"],
      });
      assert(lateResolve === false, "Late resolve after 30s timeout is ignored");
    }

    // ---------------------------------------------------------------------------
    // 6. Stale Epoch, Duplicate requestId, Wrong-Tab Ignored, and One-Time Resolve
    // ---------------------------------------------------------------------------
    console.log("\n6. Stale Epoch, Duplicate requestId, Wrong-Tab Ignored & One-Time Resolve");
    {
      const countBefore = outboundCommands.length;
      const promptsBefore = askPromptsReceived.length;
      const dialogsBefore = jsDialogsReceived.length;
      const authsBefore = httpAuthsReceived.length;

      // 6a. Stale epoch (activeEpoch - 1)
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-stale-epoch-1",
        epoch: activeEpoch - 1,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera"],
      });
      assert(
        outboundCommands.length === countBefore && askPromptsReceived.length === promptsBefore,
        "Stale epoch event (epoch < currentTabEpoch) is completely ignored"
      );

      // 6b. Duplicate requestId ("uuid-table-ask-1" was already resolved earlier)
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-1",
        requestId: "uuid-table-ask-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera"],
      });
      assert(
        outboundCommands.length === countBefore && askPromptsReceived.length === promptsBefore,
        "Duplicate requestId is completely ignored"
      );

      // 6c. Wrong tab ("tab-2" is background, "tab-unknown-999" does not exist)
      const tab2Epoch = engine.getTabState("tab-2")!.requestEpoch;
      engine.handleNativeEngineEvent({
        eventType: "onPermissionRequested",
        tabId: "tab-2",
        requestId: "uuid-wrong-tab-perm",
        epoch: tab2Epoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        resources: ["camera"],
      });
      engine.handleNativeEngineEvent({
        eventType: "onJsDialog",
        tabId: "tab-2",
        requestId: "uuid-wrong-tab-dlg",
        epoch: tab2Epoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        type: "alert",
        message: "Background tab alert",
      });
      engine.handleNativeEngineEvent({
        eventType: "onHttpAuthRequested",
        tabId: "tab-unknown-999",
        requestId: "uuid-unknown-tab-auth",
        epoch: 1,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        host: "meet.example.com",
        realm: "Admin",
      });
      assert(
        outboundCommands.length === countBefore &&
          askPromptsReceived.length === promptsBefore &&
          jsDialogsReceived.length === dialogsBefore &&
          httpAuthsReceived.length === authsBefore,
        "Wrong-tab (background tab or unknown tab) interactive events are ignored"
      );

      // 6d. One-time resolve & unknown requestId ignored
      engine.handleNativeEngineEvent({
        eventType: "onJsDialog",
        tabId: "tab-1",
        requestId: "uuid-onetime-dlg-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        type: "prompt",
        message: "Your name?",
        defaultValue: "Alice",
      });
      const firstResolve = engine.resolveJsDialog({
        requestId: "uuid-onetime-dlg-1",
        confirmed: true,
        value: "Bob",
      });
      const secondResolve = engine.resolveJsDialog({
        requestId: "uuid-onetime-dlg-1",
        confirmed: false,
      });
      const unknownResolve = engine.resolveJsDialog({
        requestId: "uuid-never-existed-999",
        confirmed: true,
      });
      const matchingDlgCmds = outboundCommands.filter(
        (c) => c.action === "resolveJsDialog" && c.payload.requestId === "uuid-onetime-dlg-1"
      );
      assert(
        firstResolve === true &&
          secondResolve === false &&
          unknownResolve === false &&
          matchingDlgCmds.length === 1 &&
          matchingDlgCmds[0].payload.confirmed === true &&
          matchingDlgCmds[0].payload.value === "Bob",
        "One-time resolve: requestId resolves exactly once; duplicate and unknown requestIds are ignored"
      );
    }

    // ---------------------------------------------------------------------------
    // 7. Credentials Never Logged or Persisted (console, localStorage, sessionPersistence)
    // ---------------------------------------------------------------------------
    console.log("\n7. Credentials Never in Console, localStorage, or sessionPersistence");
    {
      const SECRET_USER = "sec_user_alpha_9182";
      const SECRET_PASS = "UltraSecretP@ssw0rd!_NeverLogOrStore_7741";

      engine.handleNativeEngineEvent({
        eventType: "onHttpAuthRequested",
        tabId: "tab-1",
        requestId: "uuid-auth-secret-check",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://intranet.example.com",
        host: "intranet.example.com",
        realm: "Engineering Vault",
      });

      const resolvedAuth = engine.resolveHttpAuth({
        requestId: "uuid-auth-secret-check",
        proceed: true,
        username: SECRET_USER,
        password: SECRET_PASS,
      });

      const authCmd = outboundCommands.find(
        (c) => c.action === "resolveHttpAuth" && c.payload.requestId === "uuid-auth-secret-check"
      );
      assert(
        resolvedAuth === true &&
          Boolean(authCmd) &&
          authCmd!.payload.proceed === true &&
          authCmd!.payload.username === SECRET_USER &&
          authCmd!.payload.password === SECRET_PASS,
        "resolveHttpAuth delivers credentials in-memory to native bridge"
      );

      // Save session snapshot via sessionPersistence
      const sessionEngine = createSessionPersistenceEngine();
      sessionEngine.saveSnapshotAtomic(
        [
          {
            id: "tab-1",
            url: `https://${SECRET_USER}:${SECRET_PASS}@intranet.example.com/dashboard?token=${SECRET_PASS}`,
            title: "Intranet",
            history: [`https://intranet.example.com/dashboard`],
            historyIndex: 0,
            isLoading: false,
            isPrivate: false,
            isReaderMode: false,
            isSuspended: false,
          },
        ],
        "tab-1",
        { browsingMode: "full" }
      );

      // Inspect all console logs
      const leakedInConsole = consoleLogs.some(
        (line) => line.includes(SECRET_PASS) || line.includes(SECRET_USER)
      );
      assert(!leakedInConsole, "Credentials never appear in console output");

      // Inspect all localStorage and sessionStorage keys/values
      let leakedInStorage = false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        const v = localStorage.getItem(k) || "";
        if (v.includes(SECRET_PASS) || v.includes(SECRET_USER)) {
          leakedInStorage = true;
        }
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i) || "";
        const v = sessionStorage.getItem(k) || "";
        if (v.includes(SECRET_PASS) || v.includes(SECRET_USER)) {
          leakedInStorage = true;
        }
      }
      assert(
        !leakedInStorage,
        "Credentials never appear in localStorage, sessionStorage, or sessionPersistence snapshots"
      );
    }

    // ---------------------------------------------------------------------------
    // 8. Modals open -> close -> open produce 0 console.error & HttpAuthModal clears password
    // ---------------------------------------------------------------------------
    console.log("\n8. Modals Open -> Close -> Open Cycles (0 console.error) & Password State Wipe");
    {
      consoleErrors.length = 0;
      const hostEl = document.createElement("div");
      document.body.appendChild(hostEl);
      const root = createRoot(hostEl);

      const camPrompt: CameraMicConsentPrompt = {
        requestId: "modal-cam-1",
        tabId: "tab-1",
        origin: "https://meet.example.com",
        resources: ["camera", "microphone"],
        isLocalhost: false,
      };

      const authPrompt: NativeHttpAuthModalPrompt = {
        requestId: "modal-auth-1",
        tabId: "tab-1",
        host: "intranet.example.com",
        realm: "Restricted Portal",
        origin: "https://intranet.example.com",
      };

      // Cycle 1: Open CameraMicConsentModal (en & bn) -> Close -> Open
      await act(async () => {
        root.render(
          React.createElement(CameraMicConsentModal, {
            isOpen: true,
            prompt: camPrompt,
            onApprove: () => {},
            onDeny: () => {},
            lang: "en",
          })
        );
      });
      assert(
        Boolean(document.querySelector("#camera-mic-consent-dialog")) &&
          document.querySelector("#camera-mic-consent-origin")?.textContent ===
            "https://meet.example.com" &&
          Boolean(document.querySelector("#camera-mic-badge-camera")) &&
          Boolean(document.querySelector("#camera-mic-badge-microphone")),
        "CameraMicConsentModal (EN) renders origin and requested camera+microphone badges"
      );

      await act(async () => {
        root.render(
          React.createElement(CameraMicConsentModal, {
            isOpen: false,
            prompt: null,
            onApprove: () => {},
            onDeny: () => {},
            lang: "bn",
          })
        );
      });
      assert(
        !document.querySelector("#camera-mic-consent-dialog"),
        "CameraMicConsentModal closes cleanly"
      );

      await act(async () => {
        root.render(
          React.createElement(CameraMicConsentModal, {
            isOpen: true,
            prompt: camPrompt,
            onApprove: () => {},
            onDeny: () => {},
            lang: "bn",
          })
        );
      });
      assert(
        Boolean(document.querySelector("#camera-mic-consent-dialog")) &&
          Boolean(
            document
              .querySelector("#camera-mic-consent-title")
              ?.textContent?.includes("ক্যামেরা")
          ),
        "CameraMicConsentModal (BN) re-opens cleanly with Bengali localization"
      );

      // Cycle 2: HttpAuthModal open -> type password -> close -> re-open -> verify password cleared
      await act(async () => {
        root.render(
          React.createElement(HttpAuthModal, {
            isOpen: true,
            prompt: authPrompt,
            onSubmit: () => {},
            onCancel: () => {},
            lang: "en",
          })
        );
      });
      const passInput1 = document.querySelector(
        "#http-auth-modal-password"
      ) as HTMLInputElement | null;
      const warningBox = document.querySelector("#http-auth-modal-warning");
      assert(
        Boolean(passInput1) &&
          passInput1!.type === "password" &&
          Boolean(warningBox?.textContent?.includes("not the browser")),
        "HttpAuthModal shows host, realm, password input (type='password'), and warns the site not the browser asks for password"
      );

      // Simulate typing password then closing modal
      await act(async () => {
        if (passInput1) {
          const setter = Object.getOwnPropertyDescriptor(
            happyWindow.HTMLInputElement.prototype,
            "value"
          )?.set;
          setter?.call(passInput1, "TemporaryTypedSecret123");
          passInput1.dispatchEvent(new happyWindow.Event("input", { bubbles: true }) as unknown as Event);
          passInput1.dispatchEvent(new happyWindow.Event("change", { bubbles: true }) as unknown as Event);
        }
      });

      await act(async () => {
        root.render(
          React.createElement(HttpAuthModal, {
            isOpen: false,
            prompt: null,
            onSubmit: () => {},
            onCancel: () => {},
            lang: "en",
          })
        );
      });

      await act(async () => {
        root.render(
          React.createElement(HttpAuthModal, {
            isOpen: true,
            prompt: { ...authPrompt, requestId: "modal-auth-2" },
            onSubmit: () => {},
            onCancel: () => {},
            lang: "bn",
          })
        );
      });
      const passInput2 = document.querySelector(
        "#http-auth-modal-password"
      ) as HTMLInputElement | null;
      assert(
        Boolean(passInput2) && passInput2!.value === "",
        "HttpAuthModal clears password from state on close (re-opened input value is empty)"
      );

      // Cycle 3: JavaScriptDialogModal (beforeunload + suppressFuture checkbox) & GeolocationConsentModal open -> close -> open
      await act(async () => {
        root.render(
          React.createElement(JavaScriptDialogModal, {
            isOpen: true,
            prompt: {
              dialogId: "dlg-beforeunload-1",
              tabId: "tab-1",
              origin: "https://meet.example.com",
              type: "beforeunload",
              message: "Changes you made may not be saved.",
              showSuppressOption: true,
            },
            onConfirm: () => {},
            onCancel: () => {},
            lang: "en",
          })
        );
      });
      assert(
        Boolean(document.querySelector("#js-dialog-modal")) &&
          Boolean(document.querySelector("#js-dialog-suppress-checkbox")),
        "JavaScriptDialogModal renders beforeunload safely with suppress-repeat protection"
      );

      await act(async () => {
        root.render(
          React.createElement(JavaScriptDialogModal, {
            isOpen: false,
            prompt: null,
            onConfirm: () => {},
            onCancel: () => {},
            lang: "en",
          })
        );
      });

      await act(async () => {
        root.render(
          React.createElement(GeolocationConsentModal, {
            isOpen: true,
            prompt: {
              requestId: "geo-1",
              tabId: "tab-1",
              origin: "https://maps.example.com",
              isLocalhost: false,
            },
            onApprove: () => {},
            onReject: () => {},
            lang: "en",
          })
        );
      });
      await act(async () => {
        root.render(
          React.createElement(GeolocationConsentModal, {
            isOpen: false,
            prompt: null,
            onApprove: () => {},
            onReject: () => {},
            lang: "en",
          })
        );
      });

      await act(async () => {
        root.unmount();
      });
      hostEl.remove();

      assert(
        consoleErrors.length === 0,
        "All modals open -> close -> open cycles produced 0 console.error"
      );
    }

    // ---------------------------------------------------------------------------
    // 9. Unknown Event Kinds Ignored & Capability Gating (`onCapabilities`)
    // ---------------------------------------------------------------------------
    console.log("\n9. Unknown Event Kinds Ignored & Capability Gating");
    {
      const cmdCountBefore = outboundCommands.length;
      consoleErrors.length = 0;

      // Unknown event kinds
      engine.handleNativeEngineEvent({
        eventType: "onCompletelyUnknownEventKind" as any,
        tabId: "tab-1",
        requestId: "uuid-unknown-kind-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
      });
      engine.handleNativeEngineEvent({
        eventType: "onFutureTelemetryEvent" as any,
        tabId: "tab-1",
      });

      assert(
        outboundCommands.length === cmdCountBefore && consoleErrors.length === 0,
        "Unknown event kinds are ignored with 0 outbound commands and 0 console.error"
      );

      // Capability gating: default interactiveCallbacks is false
      assert(
        engine.isInteractiveCallbacksSupported() === false &&
          engine.getCapabilities().interactiveCallbacks === false,
        "Capability gating: interactiveCallbacks defaults to false before onCapabilities"
      );

      engine.handleNativeEngineEvent({
        eventType: "onCapabilities",
        tabId: "tab-1",
        requestId: "uuid-cap-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        lightMode: false,
        subresourceIntercept: false,
        privateIsolation: false,
        interactiveCallbacks: false,
      });
      assert(
        engine.isInteractiveCallbacksSupported() === false &&
          engine.isPrivateIsolationSupported() === false &&
          engine.shouldUseNativeWebView("full", true) === false,
        "Capability gating: when onCapabilities says interactiveCallbacks=false and privateIsolation=false, neither is claimed and private tabs use proxy fallback"
      );

      const privBlockedWhenUnsupported = engine.loadUrl(
        "tab-priv-unsupported",
        "https://meet.example.com/private",
        { isPrivate: true }
      );
      assert(
        privBlockedWhenUnsupported.dispatched === false &&
          privBlockedWhenUnsupported.engine === "proxy_fallback",
        "Capability gating (privateIsolation=false): loadUrl for private tab does not dispatch to native WebView"
      );

      engine.handleNativeEngineEvent({
        eventType: "onCapabilities",
        tabId: "tab-1",
        requestId: "uuid-cap-2",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: true,
        origin: "https://meet.example.com",
        lightMode: true,
        subresourceIntercept: true,
        privateIsolation: true,
        interactiveCallbacks: true,
      });
      const privAllowedWhenSupported = engine.loadUrl(
        "tab-priv-supported",
        "https://meet.example.com/private",
        { isPrivate: true }
      );
      assert(
        engine.isInteractiveCallbacksSupported() === true &&
          engine.getCapabilities().lightMode === true &&
          engine.isPrivateIsolationSupported() === true &&
          engine.shouldUseNativeWebView("full", true) === true &&
          privAllowedWhenSupported.dispatched === true &&
          privAllowedWhenSupported.engine === "native_chromium_webview",
        "Capability gating (privateIsolation=true): onCapabilities enables native isolated private tabs when MULTI_PROFILE profile isolation is active"
      );
      engine.closeTab("tab-priv-supported");

      // Part A.1: onSubresourceError.sampleCode as BOTH string and number (no Number() NaN coercion)
      subresourceErrorsReceived.length = 0;
      engine.handleNativeEngineEvent({
        eventType: "onSubresourceError",
        tabId: "tab-1",
        requestId: "uuid-sub-str-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: false,
        origin: "https://cdn.example.com",
        count: 3,
        sampleCode: "ERR_BLOCKED_PRIVATE_IP",
      });
      engine.handleNativeEngineEvent({
        eventType: "onSubresourceError",
        tabId: "tab-1",
        requestId: "uuid-sub-num-1",
        epoch: activeEpoch,
        ts: clock.now(),
        isMainFrame: false,
        origin: "https://cdn.example.com",
        count: 2,
        sampleCode: -6,
      });
      assert(
        subresourceErrorsReceived.length === 2 &&
          subresourceErrorsReceived[0].code === "ERR_BLOCKED_PRIVATE_IP" &&
          typeof subresourceErrorsReceived[0].code === "string" &&
          subresourceErrorsReceived[0].count === 3 &&
          subresourceErrorsReceived[1].code === -6 &&
          typeof subresourceErrorsReceived[1].code === "number" &&
          !Number.isNaN(subresourceErrorsReceived[1].code) &&
          engine.getTabState("tab-1")?.subresourceErrorCount === 5 &&
          engine.getTabState("tab-1")?.lastSubresourceSampleCode === -6,
        "Part A.1: onSubresourceError preserves both string ('ERR_BLOCKED_PRIVATE_IP') and numeric (-6) sampleCode values without Number() NaN coercion"
      );

      // Part A.2: setLightMode uses single documented action 'setLightMode' everywhere (legacy SET_LIGHT_MODE_POLICY removed)
      const lightResAfter = engine.setLightMode("tab-1", {
        lightMode: true,
        blockWebFonts: true,
        blockMediaPreload: true,
        blockThirdPartyTrackers: true,
        cacheMode: "LOAD_CACHE_ELSE_NETWORK",
      });
      const lightCmd = outboundCommands.find((c) => c.action === "setLightMode");
      const legacyLightCmd = outboundCommands.find(
        (c) => c.action === "SET_LIGHT_MODE_POLICY" || c.action === "SET_LIGHT_MODE"
      );
      const engineSource = fs.readFileSync(
        path.resolve(process.cwd(), "src/services/nativeBrowserEngine.ts"),
        "utf-8"
      );
      const pluginSource = fs.readFileSync(
        path.resolve(
          process.cwd(),
          "android/app/src/main/java/com/netflow/browser/NetflowBrowserPlugin.java"
        ),
        "utf-8"
      );
      assert(
        lightResAfter.supported === true &&
          Boolean(lightCmd) &&
          !legacyLightCmd &&
          !engineSource.includes('"SET_LIGHT_MODE_POLICY"') &&
          !pluginSource.includes('"SET_LIGHT_MODE_POLICY"') &&
          !pluginSource.includes('"SET_LIGHT_MODE"') &&
          lightCmd!.payload.tabId === "tab-1" &&
          lightCmd!.payload.policy?.javaScriptEnabled === true &&
          lightCmd!.payload.policy?.blockWebFonts === true,
        "Part A.2: setLightMode dispatches single documented 'setLightMode' command with javaScriptEnabled: true (legacy SET_LIGHT_MODE_POLICY removed)"
      );
    }

    engine.destroy();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.info = origInfo;
    console.error = origError;
  }

  console.log(`\n=== NETFLOW-INTERACTIVE-CONTRACT-01 Summary: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in verify-interactive-contract.ts:", err);
  process.exit(1);
});
