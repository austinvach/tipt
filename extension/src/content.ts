/// <reference types="chrome" />

// IMPORTANT: Content scripts in MV3 are loaded as classic scripts, not ES
// modules. They cannot use `import` statements at runtime. Keep this file
// self-contained: do NOT import from any other module in this codebase.
//
// Message type strings duplicated from src/lib/messages.ts — the build
// inlines that module into the popup/offscreen/background bundles, but
// the content script must remain a single classic-script file.

const DEBUG = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
function log(...args: unknown[]): void { if (DEBUG) console.log(...args); }

const MPP_REQUEST_TRIGGERED_EVENT = 'TIPT_MPP_REQUEST_TRIGGERED';
const WALLET_RPC_402 = 'TIPT_402_WALLET_RPC';
const MPP_WALLET_RPC_EVENT = 'mpp:wallet-rpc';
const MPP_WALLET_RPC_RESPONSE_EVENT = 'mpp:wallet-rpc-response';
const WALLET_RPC_METHODS = ['payLightningInvoice', 'getLightningSendRequest', 'getTransfer'] as const;
type WalletRpcMethod = (typeof WALLET_RPC_METHODS)[number];

// Defensive caps. The MPP page-side surface is fully attacker-controlled —
// reject obviously hostile inputs at the boundary so the background never
// has to defend against megabyte-sized strings or wrong types.
const MAX_INVOICE_LEN = 8192;
const MAX_SHORT_FIELD_LEN = 512;
const MAX_REQUEST_ID_LEN = 256;

interface MppWalletRpcRequestDetail {
  requestId: string;
  method: WalletRpcMethod;
  params?: unknown;
}

interface MppRequestDetail {
  type?: string;
  paymentMethods?: string[];
  intents?: string[];
}

interface WalletRpcResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const SUPPORTED_PAYMENT_METHODS = ['lightning'] as const;
const SUPPORTED_INTENTS = ['charge'] as const;
const MPP_EXTENSION_EVENT = 'mpp:extension';
const MPP_EVENT_BRIDGE_PROTOCOL_VERSION = '1.0.0';

const announcement = {
  type: 'response',
  name: 'TIPT',
  version: '0.0.1',
  protocolVersion: MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
  // TIPT advertises Lightning charge-only support on the discovery surface.
  paymentMethods: SUPPORTED_PAYMENT_METHODS,
  intents: SUPPORTED_INTENTS,
};

// Cached result of the most recent background "is the wallet configured?"
// check. Pages that fire `mpp:extension` request events in rapid succession
// (or that the
// throttle below short-circuits) get this cached value immediately rather
// than waiting a second round-trip. `undefined` means "we haven't asked
// the background yet" — surfaced to the page as `undefined` so consumers
// can distinguish "unknown" from "definitely missing".
let cachedWalletConfigured: boolean | undefined;
let cachedRequestedPaymentMethods: string[] | undefined;
let cachedRequestedIntents: string[] | undefined;

function takePaymentMethods(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const methods = value
    .filter((m): m is string => typeof m === 'string' && m.length > 0 && m.length <= MAX_SHORT_FIELD_LEN)
    .map((m) => m.toLowerCase());
  if (methods.length === 0) return undefined;
  return Array.from(new Set(methods));
}

function takeIntents(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const intents = value
    .filter((i): i is string => typeof i === 'string' && i.length > 0 && i.length <= MAX_SHORT_FIELD_LEN)
    .map((i) => i.toLowerCase());
  if (intents.length === 0) return undefined;
  return Array.from(new Set(intents));
}

function supportsRequested(requested: string[] | undefined, supported: readonly string[]): boolean {
  if (!requested || requested.length === 0) return true;
  return requested.every((value) => supported.includes(value));
}

function dispatchAnnouncement(): void {
  window.dispatchEvent(new CustomEvent(MPP_EXTENSION_EVENT, {
    detail: {
      ...announcement,
      walletConfigured: cachedWalletConfigured,
      requestedPaymentMethods: cachedRequestedPaymentMethods,
      requestedIntents: cachedRequestedIntents,
      supportsRequestedPaymentMethods: supportsRequested(
        cachedRequestedPaymentMethods,
        SUPPORTED_PAYMENT_METHODS,
      ),
      supportsRequestedIntents: supportsRequested(
        cachedRequestedIntents,
        SUPPORTED_INTENTS,
      ),
    },
  }));
}

function sendRuntimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

function takeBoundedString(v: unknown, maxLen: number): string | undefined {
  return isBoundedString(v, maxLen) ? v : undefined;
}

function takeBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

// Sanitises the params for a single wallet-RPC method at the page boundary.
// Returns a trusted params object, or null if anything is malformed. The
// background re-validates (defence in depth), but rejecting obviously hostile
// input here keeps unbounded strings out of the runtime channel entirely.
function sanitizeWalletRpcParams(
  method: WalletRpcMethod,
  raw: unknown,
): Record<string, unknown> | null {
  const p = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  if (method === 'payLightningInvoice') {
    const invoice = takeBoundedString(p.invoice, MAX_INVOICE_LEN);
    if (!invoice) return null;
    const out: Record<string, unknown> = { invoice };
    if (typeof p.maxFeeSats === 'number'
      && Number.isFinite(p.maxFeeSats)
      && p.maxFeeSats >= 0
      && p.maxFeeSats <= Number.MAX_SAFE_INTEGER) {
      out.maxFeeSats = p.maxFeeSats;
    }
    const preferSpark = takeBoolean(p.preferSpark);
    if (preferSpark !== undefined) out.preferSpark = preferSpark;
    return out;
  }
  // getLightningSendRequest / getTransfer — a single bounded id string.
  const id = takeBoundedString(p.id, MAX_SHORT_FIELD_LEN);
  if (!id) return null;
  return { id };
}

// Announce presence and notify background (icon badge) when the page asks.
// Rate-limit so a hostile page cannot spam `mpp:extension` request events and
// keep the SW
// awake. 250ms is loose enough to feel instant on a real page load and
// tight enough to throttle a tight dispatch loop.
//
// Two announcements happen per "fresh" request:
//   1. An immediate `mpp:extension` response carrying the cached
//      `walletConfigured`
//      value (possibly `undefined` on the very first request) so pages
//      that listen with a `once: true` handler still receive a discovery
//      response without waiting on a runtime hop.
//   2. A second `mpp:extension` response after the background reports the
//      current
//      wallet-configured state. Pages that care about accuracy should
//      listen for `mpp:extension` continuously (not with `once: true`)
//      and use the most recent payload.
const MPP_REQUEST_THROTTLE_MS = 250;
let lastMppRequestAt = 0;
window.addEventListener(MPP_EXTENSION_EVENT, (event: Event) => {
  const detail = (event as CustomEvent<MppRequestDetail>).detail;
  if (!detail || detail.type !== 'request') return;
  cachedRequestedPaymentMethods = takePaymentMethods(detail?.paymentMethods);
  cachedRequestedIntents = takeIntents(detail?.intents);
  const now = Date.now();
  if (now - lastMppRequestAt >= MPP_REQUEST_THROTTLE_MS) {
    lastMppRequestAt = now;
    sendRuntimeMessage<{ ok?: boolean; walletConfigured?: boolean }>({ type: MPP_REQUEST_TRIGGERED_EVENT })
      .then((response) => {
        if (response && typeof response.walletConfigured === 'boolean') {
          const changed = cachedWalletConfigured !== response.walletConfigured;
          cachedWalletConfigured = response.walletConfigured;
          // Only re-announce when the state actually changed (or this is
          // the first time we've learned it). Avoids a duplicate event on
          // every page load once the cache is warm.
          if (changed) dispatchAnnouncement();
        }
      })
      .catch(() => { /* SW unreachable; the cached value (if any) stands. */ });
  }
  // The announcement is dispatched on the page (no runtime hop), so always
  // respond immediately — pages that just want to discover the wallet
  // shouldn't be collateral damage of the throttle or the runtime round-trip.
  dispatchAnnouncement();
});

// Relay wallet-RPC requests from the page-side SDK to the background, and
// dispatch the raw result back. The extension gates `payLightningInvoice`
// behind its approval flow; `getLightningSendRequest`/`getTransfer` are
// read-only follow-ups the SDK uses to resolve the preimage page-side.
window.addEventListener(MPP_WALLET_RPC_EVENT, (event: Event) => {
  const detail = (event as CustomEvent<MppWalletRpcRequestDetail>).detail;
  const requestId = takeBoundedString(detail?.requestId, MAX_REQUEST_ID_LEN);
  const method = detail?.method;
  if (!requestId || !method || !WALLET_RPC_METHODS.includes(method)) {
    log('[TIPT-CS] mpp:wallet-rpc rejected: missing/invalid requestId or method');
    return;
  }

  const params = sanitizeWalletRpcParams(method, detail.params);
  if (!params) {
    window.dispatchEvent(new CustomEvent(MPP_WALLET_RPC_RESPONSE_EVENT, {
      detail: { requestId, ok: false, error: 'Invalid wallet RPC parameters.' },
    }));
    return;
  }

  log('[TIPT-CS] mpp:wallet-rpc received, method:', method, 'requestId:', requestId);

  void sendRuntimeMessage<WalletRpcResponse>({
    type: WALLET_RPC_402,
    payload: { method, params },
  })
    .then((response) => {
      window.dispatchEvent(new CustomEvent(MPP_WALLET_RPC_RESPONSE_EVENT, {
        detail: {
          requestId,
          ok: !!response?.ok,
          result: response?.result,
          error: response?.error,
        },
      }));
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Wallet RPC failed.';
      log('[TIPT-CS] mpp:wallet-rpc error:', message);
      window.dispatchEvent(new CustomEvent(MPP_WALLET_RPC_RESPONSE_EVENT, {
        detail: { requestId, ok: false, error: message },
      }));
    });
});

