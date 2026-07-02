/// <reference types="chrome" />

import { log } from './lib/logger';
import { ensureOffscreen } from './lib/offscreen';
import { clearUnlockKey } from './lib/key-store';
import { isInternalSender } from './lib/runtime';
import { getSynced } from './lib/storage';
import { nonEmptyString } from './lib/object-helpers';
import {
  pendingConfirmStorageKey,
  type PersistedConfirmDetails,
} from './lib/confirm-protocol';
import { WALLET_KEY } from './constants';
import { decodeBolt11AmountSats } from './lib/bolt11';
import { MSG } from './lib/messages';
import { scrubLegacyState } from './lib/migrate-legacy';
import { classifyPaymentTarget, type PaymentKind } from './lib/payment-target';
import {
  tryAutoApprove,
  rememberHost,
  loadAllowlist,
  removeHost,
  listAllowlist,
} from './lib/allowlist';
import {
  type ChallengePayload,
} from './lib/auth-credentials';

// Background service worker.

const GREEN_ICON = 'greenasterisk.png';
// "Wallet not configured" attention badge — drawn on top of the green icon
// as an orange dot/exclamation when the page asks for a wallet but the user
// hasn't created/restored one yet. The badge text is a single character
// because Chrome truncates anything longer to fit the small badge area.
const ATTENTION_BADGE_TEXT = '!';
const ATTENTION_BADGE_COLOR = '#f59e0b';
const ALARM_PREFIX = 'tipt-confirm-';
const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;

// Initial confirm popup geometry. Anchored to the top-right of the user's
// currently focused browser window so the prompt appears in the same place
// that extensions like Honey and Rakuten use for their in-page toasts,
// rather than wherever Chrome decides to place an unpositioned popup
// window. Width and height are only the *initial* size — `ConfirmApp`
// resizes the window to fit its rendered content as soon as it mounts
// (see `useAutoResizeWindow` in src/ConfirmApp.tsx) so there is never
// a vertical or horizontal scrollbar.
const CONFIRM_POPUP_WIDTH = 380;
const CONFIRM_POPUP_HEIGHT = 320;
const CONFIRM_POPUP_MARGIN = 16;

// Wallet-setup popup geometry. When a 402 arrives but the user has no wallet
// yet, we open the main extension UI (index.html) so they can create/restore
// one before the payment approval continues. index.css locks the body to
// 324px, so 360px gives a little window chrome without a horizontal
// scrollbar; the height is generous enough for the onboarding screens.
const WALLET_SETUP_POPUP_WIDTH = 360;
const WALLET_SETUP_POPUP_HEIGHT = 600;

async function getConfirmPopupTopRight(): Promise<{ left: number; top: number } | null> {
  // chrome.windows.getLastFocused returns the most recently focused window
  // — which is the user's normal browser window where the 402 request just
  // fired. Filtering to type 'normal' avoids anchoring to a previously-open
  // TIPT confirm popup (which is itself a 'popup'-type window).
  try {
    const focused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (
      !focused ||
      typeof focused.left !== 'number' ||
      typeof focused.top !== 'number' ||
      typeof focused.width !== 'number'
    ) {
      return null;
    }
    const rightEdge = focused.left + focused.width;
    // Don't push the popup off the left edge of the host window on very
    // narrow browser windows — fall back to the window's left margin.
    const left = Math.max(
      Math.round(focused.left + CONFIRM_POPUP_MARGIN),
      Math.round(rightEdge - CONFIRM_POPUP_WIDTH - CONFIRM_POPUP_MARGIN),
    );
    const top = Math.round(focused.top + CONFIRM_POPUP_MARGIN);
    return { left, top };
  } catch {
    // Best-effort positioning. If the API call fails for any reason we let
    // Chrome place the popup wherever it likes rather than blocking the
    // approval flow.
    return null;
  }
}

// Defensive cap duplicated from content.ts. The content-script boundary
// applies this on the way in, but a future regression there (or a direct
// internal sender invoking a wallet RPC) must not be able to bypass it.
// Keep in sync with src/content.ts.
const MAX_INVOICE_LEN = 8192;

interface PayRequestPayload {
  source: 'fetch' | 'xhr' | 'mpp';
  url: string;
  method: string;
  challenge: ChallengePayload;
}

interface PromptResponse {
  approved: boolean;
  remember?: boolean;
  caps?: { maxSatsPerPayment: number; maxSatsPerDay: number };
}

interface OffscreenResultResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

function getHostFromUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host;
  } catch {
    return null;
  }
}

// The confirm popup is the only context allowed to drive the per-request
// approval handshake. Restrict acceptance to messages whose sender URL is
// our own confirm.html.
function isConfirmPopup(sender: chrome.runtime.MessageSender): boolean {
  if (!isInternalSender(sender)) return false;
  const expected = chrome.runtime.getURL('confirm.html');
  return typeof sender.url === 'string' && sender.url.startsWith(expected);
}

// Mimic chrome.storage.session lifetime for the IndexedDB-cached unlock key:
// wipe it on browser startup so a stolen-laptop attacker can't reuse a
// previously-unlocked key after power-cycling. Also clear the legacy
// spark_session_pin entry from old installs.
chrome.runtime.onStartup.addListener(() => {
  void clearUnlockKey();
  scrubLegacyState();
});

// Open onboarding immediately after first install so users can configure a
// wallet before they ever hit a paywalled request.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  void (async () => {
    try {
      const existing = await getSynced(WALLET_KEY);
      if (typeof existing === 'string' && existing.length > 0) return;
      await chrome.tabs.create({
        url: chrome.runtime.getURL('index.html'),
        active: true,
      });
    } catch (err) {
      log('[TIPT-BG] Failed to open onboarding tab on install:', err);
    }
  })();
});

// ---------------------------------------------------------------------------
// 402 error sanitisation
// ---------------------------------------------------------------------------
// The raw error strings inside handle402PaymentRequest leak wallet-state
// fingerprints to the calling page ("Wallet is locked", "Wallet data not
// found", SDK internals, etc.). Map them to one of four opaque codes at the
// background→content boundary so the page only learns success/failure plus
// a coarse category. Internal logs still get full detail.
export type Mpp402ErrorCode = 'declined' | 'unavailable' | 'locked' | 'failed';

function sanitise402Error(raw: string | undefined): Mpp402ErrorCode {
  if (!raw) return 'failed';
  const s = raw.toLowerCase();
  if (s.includes('wallet is locked')) return 'locked';
  if (s.includes('was not approved') || s.includes('previous payment approval')) return 'declined';
  if (
    s.includes('wallet data not found')
    || s.includes('wallet not initialized')
    || s.includes('wallet setup was not completed')
    || s.includes('cannot prompt')
    || s.includes('failed to resolve request host')
    || s.includes('no invoice found')
    || s.includes('payment target is not a recognised lightning invoice')
    || s.includes('missing payment challenge fields')
  ) return 'unavailable';
  return 'failed';
}

// ---------------------------------------------------------------------------
// Pending confirm state
// ---------------------------------------------------------------------------
// The Promise resolver lives in-memory (it cannot be serialised). MV3 keeps
// the service worker alive while the awaited `sendResponse` is pending — up
// to a 5-minute hard cap — which matches CONFIRM_TIMEOUT_MS. If the worker
// is recycled before the user responds, the in-memory resolver is lost and
// the awaiting content-script message channel will close. The alarm and the
// chrome.storage.session entry ensure we still clean up persisted state in
// that case, and that the confirm popup can rehydrate display details
// without an extra round-trip to the worker.

interface PendingConfirm {
  resolve: (response: PromptResponse) => void;
  host: string;
  windowId?: number;
}
const pendingConfirms = new Map<string, PendingConfirm>();
// Track in-flight confirm hosts so a single hostile page cannot spam
// chrome.windows.create and pile up dozens of focus-stealing prompts.
// Once a host has a pending confirm, any new TIPT_402_PAY_REQUEST from
// that host is rejected until the existing one resolves or expires.
const hostsWithPendingConfirm = new Set<string>();

async function persistConfirmDetails(id: string, details: PersistedConfirmDetails): Promise<void> {
  await chrome.storage.session.set({ [pendingConfirmStorageKey(id)]: details });
}

async function clearConfirmDetails(id: string): Promise<void> {
  await chrome.storage.session.remove(pendingConfirmStorageKey(id)).catch(() => { /* best-effort */ });
  await chrome.alarms.clear(`${ALARM_PREFIX}${id}`).catch(() => { /* best-effort */ });
}

function resolvePendingConfirm(id: string, response: PromptResponse): void {
  const pending = pendingConfirms.get(id);
  if (!pending) return;
  pendingConfirms.delete(id);
  hostsWithPendingConfirm.delete(pending.host);
  const windowId = pending.windowId;
  pending.resolve(response);
  // Drop the X-close watcher now that we own the resolution. Calling
  // chrome.windows.remove on an already-closed window is fine.
  if (windowId !== undefined) confirmWindowToId.delete(windowId);
}

// Maps the confirm-popup chrome window id to its pending request id so the
// onRemoved listener can mark a user-X-closed window as a decline without
// waiting up to 5 minutes for the alarm.
const confirmWindowToId = new Map<number, string>();

function promptForPaymentApproval(
  payload: PayRequestPayload,
  host: string,
  amountSats: number | null,
  paymentKind: PaymentKind,
): Promise<PromptResponse> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + CONFIRM_TIMEOUT_MS;
    const details: PersistedConfirmDetails = {
      host,
      url: payload.url,
      method: payload.method,
      invoice: payload.challenge.invoice,
      amountSats,
      expiresAt,
      paymentKind: paymentKind === 'unknown' ? 'lightning' : paymentKind,
    };
    pendingConfirms.set(id, { resolve, host });
    hostsWithPendingConfirm.add(host);

    void (async () => {
      try {
        await persistConfirmDetails(id, details);
        await chrome.alarms.create(`${ALARM_PREFIX}${id}`, { when: expiresAt });
        const coords = await getConfirmPopupTopRight();
        const win = await chrome.windows.create({
          url: chrome.runtime.getURL(`confirm.html?id=${encodeURIComponent(id)}`),
          type: 'popup',
          width: CONFIRM_POPUP_WIDTH,
          height: CONFIRM_POPUP_HEIGHT,
          focused: true,
          ...(coords ?? {}),
        });
        if (typeof win?.id === 'number') {
          confirmWindowToId.set(win.id, id);
          const pending = pendingConfirms.get(id);
          if (pending) pending.windowId = win.id;
        }
      } catch (err) {
        log('[TIPT-BG] Failed to open confirm popup:', err);
        await clearConfirmDetails(id);
        resolvePendingConfirm(id, { approved: false });
      }
    })();
  });
}

// Treat a user closing the confirm popup with [X] as an immediate decline.
// Without this, hostsWithPendingConfirm keeps the host locked out of new
// 402 requests until the 5-min alarm expires.
chrome.windows.onRemoved.addListener((windowId) => {
  const id = confirmWindowToId.get(windowId);
  if (!id) return;
  confirmWindowToId.delete(windowId);
  if (!pendingConfirms.has(id)) return;
  resolvePendingConfirm(id, { approved: false });
  void clearConfirmDetails(id);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  resolvePendingConfirm(id, { approved: false });
  void chrome.storage.session.remove(pendingConfirmStorageKey(id)).catch(() => { /* best-effort */ });
});

// Sends a wallet-RPC message to the offscreen document and resolves with its
// raw `result`. Rejects with the offscreen error string on failure.
function sendOffscreenWalletRpc(
  type: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response: OffscreenResultResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? 'Offscreen wallet RPC failed.'));
        return;
      }
      resolve(response.result);
    });
  });
}

// ---------------------------------------------------------------------------
// Wallet-setup gate
// ---------------------------------------------------------------------------
// When a 402 payment arrives but the user hasn't created or restored a wallet
// yet, open the main extension UI (index.html) as a popup so they can set one
// up, then continue the payment approval flow once the encrypted wallet blob
// lands in chrome.storage. Reuses the confirm popup's 5-minute budget and
// top-right anchoring.

// Collapses concurrent no-wallet 402 requests onto a single setup window and
// a shared completion promise, so a page firing several challenge requests doesn't
// spawn a stack of onboarding windows.
let walletSetupWait: Promise<boolean> | null = null;

async function ensureWalletConfigured(): Promise<boolean> {
  const existing = await getSynced(WALLET_KEY);
  if (typeof existing === 'string' && existing.length > 0) return true;
  if (!walletSetupWait) {
    walletSetupWait = openWalletSetupAndWait().finally(() => { walletSetupWait = null; });
  }
  return walletSetupWait;
}

function openWalletSetupAndWait(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let setupWindowId: number | undefined;

    const finish = (configured: boolean, closeWindow: boolean) => {
      if (settled) return;
      settled = true;
      chrome.storage.onChanged.removeListener(onStorageChanged);
      chrome.windows.onRemoved.removeListener(onWindowRemoved);
      clearTimeout(timer);
      if (closeWindow && typeof setupWindowId === 'number') {
        chrome.windows.remove(setupWindowId).catch(() => { /* already gone */ });
      }
      resolve(configured);
    };

    // The wallet blob is written via setItemDual → chrome.storage.local (and
    // best-effort sync). Either area landing the key means setup completed.
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' && areaName !== 'sync') return;
      const change = changes[WALLET_KEY];
      if (change && typeof change.newValue === 'string' && change.newValue.length > 0) {
        finish(true, true);
      }
    };

    const onWindowRemoved = (windowId: number) => {
      if (windowId !== setupWindowId) return;
      // User closed the setup window. Re-read storage in case the write raced
      // the close; otherwise treat it as "setup not completed".
      void getSynced(WALLET_KEY).then((w) => {
        finish(typeof w === 'string' && w.length > 0, false);
      });
    };

    const timer = setTimeout(() => finish(false, true), CONFIRM_TIMEOUT_MS);

    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.windows.onRemoved.addListener(onWindowRemoved);

    void (async () => {
      try {
        const coords = await getConfirmPopupTopRight();
        const win = await chrome.windows.create({
          url: chrome.runtime.getURL('index.html'),
          type: 'popup',
          width: WALLET_SETUP_POPUP_WIDTH,
          height: WALLET_SETUP_POPUP_HEIGHT,
          focused: true,
          ...(coords ?? {}),
        });
        setupWindowId = win?.id;
        // The wallet may have been created between our initial check and the
        // window opening (e.g. the user already had the popup open). Re-check
        // so we don't strand them on a redundant setup window.
        const w = await getSynced(WALLET_KEY);
        if (typeof w === 'string' && w.length > 0) finish(true, true);
      } catch (err) {
        log('[TIPT-BG] Failed to open wallet setup popup:', err);
        finish(false, false);
      }
    })();
  });
}

type WalletRpcResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

// Maximum length for a wallet request id (Spark transfer / Lightning send
// request id) accepted from the page on read-only follow-up RPCs.
const MPP_ID_MAX_LEN = 512;

// Runs the full approval flow for a Lightning payment: ensure a wallet exists,
// then auto-approve (allowlist) or prompt the user (with caps). On success
// returns the encrypted wallet blob so the caller can settle the payment.
async function approveLightningPayment(
  invoice: string,
  amountSats: number | null,
  host: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: true; walletRaw: string } | { ok: false; error: string }> {
  // Wallet-existence gate. Precedes tryAutoApprove: a host the user
  // previously allowlisted must not silently auto-approve into a payment we
  // cannot fulfil — we'd only discover the missing wallet at pay time.
  const walletReady = await ensureWalletConfigured();
  if (!walletReady) {
    return { ok: false, error: 'Wallet setup was not completed.' };
  }
  prewarmWallet();

  const auto = await tryAutoApprove(host, amountSats);
  let approved = auto.approved;
  let remember = false;
  let caps: { maxSatsPerPayment: number; maxSatsPerDay: number } | undefined;

  if (!approved) {
    if (sender.tab?.id === undefined) {
      return { ok: false, error: 'Cannot prompt for 402 payment approval in this context.' };
    }
    // Reject piling up multiple confirm popups for the same host so a hostile
    // page cannot spam a focus-stealing DoS.
    if (hostsWithPendingConfirm.has(host)) {
      return { ok: false, error: 'A previous payment approval is still pending for this site.' };
    }
    const payload: PayRequestPayload = {
      source: 'mpp',
      url: sender.url ?? '',
      method: 'GET',
      challenge: {
        scheme: 'Payment',
        invoice,
        amountSats: amountSats ?? undefined,
      },
    };
    const prompt = await promptForPaymentApproval(payload, host, amountSats, 'lightning');
    approved = !!prompt.approved;
    remember = !!prompt.remember;
    caps = prompt.caps;
  }

  if (!approved) {
    return { ok: false, error: 'Payment was not approved.' };
  }

  if (remember && caps && amountSats !== null && amountSats > 0) {
    try {
      await rememberHost(host, {
        maxSatsPerPayment: caps.maxSatsPerPayment,
        maxSatsPerDay: caps.maxSatsPerDay,
        initialSpentSats: amountSats,
      });
    } catch (err) {
      log('[TIPT-BG] Failed to remember host:', err);
    }
  }

  // Background can read chrome.storage; the offscreen cannot. Pass the
  // encrypted wallet blob along so the offscreen can re-initialise its SDK
  // instance if Chrome reclaimed the offscreen document. The PIN never
  // crosses this boundary — the offscreen decrypts using the non-extractable
  // CryptoKey cached in shared IndexedDB.
  const walletRaw = await getSynced(WALLET_KEY);
  if (!walletRaw) {
    return { ok: false, error: 'Wallet data not found.' };
  }
  return { ok: true, walletRaw };
}

// Wallet-RPC pay handler. Gates `payLightningInvoice` behind the approval
// flow, then forwards it to the offscreen document and returns the RAW
// (projected) SparkWallet result. Preimage resolution and credential building
// happen page-side in @buildonspark/lightning-mpp-sdk.
async function handleWalletPayRpc(
  params: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<WalletRpcResult> {
  const invoice = nonEmptyString(params.invoice);
  if (!invoice || invoice.length > MAX_INVOICE_LEN) {
    return { ok: false, error: 'No invoice found in payment request.' };
  }
  // The charge flow only pays BOLT11 invoices; fail closed on anything else.
  if (classifyPaymentTarget(invoice) !== 'lightning') {
    return { ok: false, error: 'Payment target is not a recognised Lightning invoice.' };
  }

  // SECURITY: derive the host from `sender.url` (browser-set), NEVER from any
  // page-supplied field, so a malicious page cannot spoof an allowlisted host.
  const authoritativeUrl = sender.url ?? sender.tab?.url;
  const host = authoritativeUrl ? getHostFromUrl(authoritativeUrl) : null;
  if (!host) {
    return { ok: false, error: 'Failed to resolve request host for 402 payment.' };
  }

  const maxFeeSats =
    typeof params.maxFeeSats === 'number'
      && Number.isFinite(params.maxFeeSats)
      && params.maxFeeSats >= 0
      ? Math.floor(params.maxFeeSats)
      : undefined;

  prewarmWallet();
  const amountSats = decodeBolt11AmountSats(invoice);

  const approval = await approveLightningPayment(invoice, amountSats, host, sender);
  if (!approval.ok) return approval;

  await ensureOffscreen();
  const result = await sendOffscreenWalletRpc(MSG.OFFSCREEN_PAY_LIGHTNING_RAW, {
    invoice,
    walletRaw: approval.walletRaw,
    maxFeeSats,
  });
  return { ok: true, result };
}

// Wallet-RPC read handler for the SDK's preimage-resolution follow-ups
// (getLightningSendRequest). These take an id that can only be
// obtained from an approved payLightningInvoice result and only ever expose
// the user's own wallet data, so they run without a fresh approval prompt.
async function handleWalletReadRpc(
  msgType: string,
  params: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<WalletRpcResult> {
  const authoritativeUrl = sender.url ?? sender.tab?.url;
  if (!authoritativeUrl) {
    return { ok: false, error: 'Failed to resolve request host.' };
  }
  const id = nonEmptyString(params.id);
  if (!id || id.length > MPP_ID_MAX_LEN) {
    return { ok: false, error: 'Invalid wallet request id.' };
  }
  const walletRaw = await getSynced(WALLET_KEY);
  if (!walletRaw) {
    return { ok: false, error: 'Wallet data not found.' };
  }
  await ensureOffscreen();
  const result = await sendOffscreenWalletRpc(msgType, { id, walletRaw });
  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// Wallet prewarm (mpp:challenge → spin up offscreen + SparkWallet SDK)
// ---------------------------------------------------------------------------
// When a page actually requests a payment, kick off the offscreen document
// and SparkWallet SDK initialisation in the background so the cold-start
// cost is paid in parallel with the user reading the confirm popup, rather
// than serialised onto the critical path between clicking "Approve & Pay"
// and the page receiving its mpp:credential.
//
// Discovery now uses mpp:extension with detail.type='request'.
// That was rejected because:
//   * Every MPP-aware page visit would cause wallet network activity even
//     when the user never paid.
//   * Spark's servers would learn the user's IP on mere page visits rather
//     than only when a payment is actually requested.
// Firing on mpp:challenge keeps Spark's view of the user identical to
// today (they only see traffic when there's a real payment in flight),
// while still getting the parallelism win.
//
// Risks remaining:
//   * If the user *declines* the confirm popup, the SDK init was wasted
//     work. Acceptable — the SDK stays cached for subsequent payments and
//     declined-after-prompt is the minority case anyway.
//   * If the wallet is locked when the challenge arrives, prewarm fails
//     silently (we cannot unlock for them) — the confirm popup is shown
//     anyway and the actual pay step will surface the locked error.
let prewarmInflight = false;

function prewarmWallet(): void {
  if (prewarmInflight) return;
  prewarmInflight = true;
  const startedAt = Date.now();
  void (async () => {
    try {
      const walletRaw = await getSynced(WALLET_KEY);
      if (!walletRaw) {
        log('[TIPT-BG] prewarm skipped: no wallet stored');
        return;
      }
      await ensureOffscreen();
      // Errors here are routine (most commonly "Wallet is locked") and
      // must NOT surface to the user — they merely mean prewarm couldn't
      // run. The user will see a confirm popup either way, and the actual
      // pay step that follows will produce a proper user-facing error if
      // the underlying state is still bad.
      const response = await chrome.runtime.sendMessage({
        type: MSG.PREWARM_WALLET,
        payload: { walletRaw },
      }) as { ok?: boolean; error?: string } | undefined;
      if (response?.ok) {
        log(`[TIPT-BG] prewarm completed in ${Date.now() - startedAt} ms`);
      } else {
        log('[TIPT-BG] prewarm declined by offscreen:', response?.error);
      }
    } catch (err) {
      log('[TIPT-BG] prewarm failed (non-fatal):', err);
    } finally {
      prewarmInflight = false;
    }
  })();
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

type MessageHandler = (
  message: { type: string; payload?: Record<string, unknown> },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | void;

const handlers: Record<string, MessageHandler> = {
  [MSG.MPP_REQUEST_TRIGGERED](_message, sender, sendResponse) {
    log('[TIPT-BG] mpp:extension request listener trigger received');
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: true, walletConfigured: false });
      return;
    }
    // Returning `true` keeps the SW alive (and the message channel open)
    // until both the storage read and the icon/badge writes resolve. Without
    // this, Chrome may unload the SW mid-await and silently drop the swap,
    // especially when the worker had just spun up to handle this one
    // message.
    void (async () => {
      let walletConfigured = false;
      try {
        const walletRaw = await getSynced(WALLET_KEY);
        walletConfigured = typeof walletRaw === 'string' && walletRaw.length > 0;
      } catch {
        // Treat storage failure as "no wallet" rather than failing the
        // discovery handshake — pages can still call mpp:challenge and
        // surface the eventual failure to the user.
      }

      const iconPromise = chrome.action
        .setIcon({ tabId, path: GREEN_ICON })
        .catch(() => { /* best-effort */ });

      let badgePromise: Promise<void> | Promise<unknown> = Promise.resolve();
      if (walletConfigured) {
        // Clear any prior attention badge — the user may have just finished
        // creating/restoring their wallet since the last mpp:extension request on
        // this tab and we want to drop the orange dot immediately.
        badgePromise = chrome.action
          .setBadgeText({ tabId, text: '' })
          .catch(() => { /* best-effort */ });
      } else {
        badgePromise = Promise.all([
          chrome.action.setBadgeBackgroundColor({ tabId, color: ATTENTION_BADGE_COLOR })
            .catch(() => { /* best-effort */ }),
          chrome.action.setBadgeText({ tabId, text: ATTENTION_BADGE_TEXT })
            .catch(() => { /* best-effort */ }),
        ]);
      }

      try {
        await Promise.all([iconPromise, badgePromise]);
      } finally {
        sendResponse({ ok: true, walletConfigured });
      }
    })();
    return true;
  },

  [MSG.CONFIRM_RESPONSE_402](message, sender, sendResponse) {
    if (!isConfirmPopup(sender)) {
      sendResponse({ ok: false, error: 'Unauthorized sender.' });
      return;
    }
    const payload = message.payload ?? {};
    const id = typeof payload.id === 'string' ? payload.id : '';
    const approved = !!payload.approved;
    const remember = !!payload.remember;
    const rawCaps = payload.caps;
    let caps: { maxSatsPerPayment: number; maxSatsPerDay: number } | undefined;
    if (remember && rawCaps && typeof rawCaps === 'object') {
      const c = rawCaps as { maxSatsPerPayment?: unknown; maxSatsPerDay?: unknown };
      const perPayment = typeof c.maxSatsPerPayment === 'number' && Number.isFinite(c.maxSatsPerPayment)
        ? Math.max(0, Math.floor(c.maxSatsPerPayment)) : 0;
      const perDay = typeof c.maxSatsPerDay === 'number' && Number.isFinite(c.maxSatsPerDay)
        ? Math.max(0, Math.floor(c.maxSatsPerDay)) : 0;
      if (perPayment > 0) caps = { maxSatsPerPayment: perPayment, maxSatsPerDay: perDay };
    }
    if (id) resolvePendingConfirm(id, { approved, remember, caps });
    void clearConfirmDetails(id);
    sendResponse({ ok: true });
  },

  [MSG.ALLOWLIST_LIST_402](_message, sender, sendResponse) {
    if (!isInternalSender(sender)) {
      sendResponse({ ok: false, error: 'Unauthorized sender.' });
      return true;
    }
    void (async () => {
      try {
        const entries = await listAllowlist();
        sendResponse({ ok: true, entries });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  },

  [MSG.ALLOWLIST_REMOVE_402](message, sender, sendResponse) {
    if (!isInternalSender(sender)) {
      sendResponse({ ok: false, error: 'Unauthorized sender.' });
      return true;
    }
    const host = typeof message.payload?.host === 'string' ? message.payload.host : '';
    if (!host) {
      sendResponse({ ok: false, error: 'Missing host.' });
      return true;
    }
    void (async () => {
      try {
        await removeHost(host);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  },

  [MSG.WALLET_RPC_402](message, sender, sendResponse) {
    // Wallet RPCs must originate from a content script in a real tab.
    if (!sender.tab || !sender.url) {
      log('[TIPT-BG] wallet RPC missing sender.tab/sender.url; dropping');
      return;
    }
    const payload = message.payload ?? {};
    const method = typeof payload.method === 'string' ? payload.method : '';
    const params = payload.params && typeof payload.params === 'object'
      ? payload.params as Record<string, unknown>
      : {};

    log('[TIPT-BG] Wallet RPC received:', method);
    void (async () => {
      let response: WalletRpcResult;
      try {
        if (method === 'payLightningInvoice') {
          response = await handleWalletPayRpc(params, sender);
        } else if (method === 'getLightningSendRequest') {
          response = await handleWalletReadRpc(MSG.OFFSCREEN_GET_SEND_REQUEST, params, sender);
        } else {
          response = { ok: false, error: 'Unsupported wallet RPC method.' };
        }
      } catch (error) {
        response = {
          ok: false,
          error: error instanceof Error ? error.message : 'Wallet RPC failed.',
        };
      }
      // Sanitise any error string before it crosses back to the page so the
      // site only learns one of four coarse codes — never wallet internals.
      const sanitised = response.ok
        ? response
        : { ok: false as const, error: sanitise402Error(response.error) };
      sendResponse(sanitised);
    })();
    return true;
  },
};

// Same defensive pattern as the offscreen listener: ignore messages without
// a matching handler BEFORE doing any sender-validation work. Both contexts
// share the chrome.runtime.onMessage channel; staying out of the dispatch
// race for messages we don't own keeps the sender's promise wired to the
// listener that actually responds.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msg = message as { type?: string; payload?: Record<string, unknown> } | undefined;
  if (!msg || typeof msg.type !== 'string') return;
  const handler = handlers[msg.type];
  if (!handler) return;
  if (!isInternalSender(sender)) return;
  return handler(msg as { type: string; payload?: Record<string, unknown> }, sender, sendResponse);
});

// Warm the allowlist cache on SW boot so the first 402 request doesn't pay
// an extra storage round-trip. Best-effort; tryAutoApprove will load lazily
// if this fails.
void loadAllowlist().catch(() => { /* best-effort */ });
