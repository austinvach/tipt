/// <reference lib="dom" />

import { SparkWallet } from '@buildonspark/spark-sdk';
import { decryptText } from './crypto';
import { loadUnlockKey } from './lib/key-store';
import { log } from './lib/logger';
import { getStringField } from './lib/object-helpers';

interface WalletPayload {
  iv: string;
  ct: string;
}

const PREIMAGE_KEYS = ['paymentPreimage', 'preimage', 'payment_preimage'] as const;

// Raw wallet-result projections forwarded to the page-side SDK over the
// bridge. We deliberately return only the string fields that
// @buildonspark/lightning-mpp-sdk's `resolvePreimage` reads — not the whole
// SparkWallet object — so the payload is JSON/structured-clone safe (no
// BigInt or class instances) and leaks no extra wallet state to the page.
// The extension does NOT interpret these: preimage resolution and credential
// building happen page-side.
export interface WalletUserRequestProjection {
  id?: string;
  paymentPreimage?: string;
  status?: string;
}
export interface WalletPayProjection {
  id: string;
  paymentPreimage?: string;
  status?: string;
  // Present iff the SDK result carried a `userRequest` — the SDK uses this
  // presence to detect the Spark route, so we preserve it faithfully.
  userRequest?: WalletUserRequestProjection;
}
export interface WalletSendRequestProjection {
  paymentPreimage?: string;
  status?: string;
}
export interface WalletTransferProjection {
  status?: string;
  userRequest?: WalletUserRequestProjection;
}

// Extracts a preimage already present on a payment/transfer/request object
// without polling. Covers the Lightning route (top-level `paymentPreimage`)
// and the Spark route (nested `userRequest.paymentPreimage`).
function extractPreimage(source: Record<string, unknown>): string | null {
  const direct = getStringField(source, PREIMAGE_KEYS);
  if (direct) return direct;
  const userRequest = source.userRequest;
  if (userRequest && typeof userRequest === 'object') {
    return getStringField(userRequest as Record<string, unknown>, PREIMAGE_KEYS);
  }
  return null;
}

function projectUserRequest(value: unknown): WalletUserRequestProjection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const u = value as Record<string, unknown>;
  const out: WalletUserRequestProjection = {};
  const id = getStringField(u, ['id']);
  if (id) out.id = id;
  const preimage = getStringField(u, PREIMAGE_KEYS);
  if (preimage) out.paymentPreimage = preimage;
  if (typeof u.status === 'string') out.status = u.status;
  return out;
}

function projectPayResult(result: unknown): WalletPayProjection {
  const r = (result ?? {}) as Record<string, unknown>;
  const out: WalletPayProjection = {
    id: getStringField(r, ['id', 'transferSparkId']) ?? '',
  };
  const preimage = getStringField(r, PREIMAGE_KEYS);
  if (preimage) out.paymentPreimage = preimage;
  if (typeof r.status === 'string') out.status = r.status;
  // Preserve `userRequest` presence (even if empty) — the SDK keys its
  // Spark-vs-Lightning poll mode on whether this field exists.
  if (r.userRequest !== undefined && r.userRequest !== null && typeof r.userRequest === 'object') {
    out.userRequest = projectUserRequest(r.userRequest) ?? {};
  }
  return out;
}

let cachedWallet: SparkWallet | null = null;
let walletInitPromise: Promise<SparkWallet> | null = null;

// Unified teardown for the SparkWallet SDK instance. Best-effort: we never
// want a dispose failure to surface to the user.
async function teardownWallet(wallet: SparkWallet | null): Promise<void> {
  if (!wallet) return;
  const w = wallet as unknown as { cleanupConnections?: () => Promise<void> | void };
  try {
    if (typeof w.cleanupConnections === 'function') {
      await Promise.resolve(w.cleanupConnections());
    }
  } catch { /* best-effort */ }
  try { wallet.removeAllListeners?.(); } catch { /* best-effort */ }
}

// Decrypt the wallet mnemonic using the AES-GCM key cached in IndexedDB
// (see lib/key-store.ts). Throws if the user has not unlocked since
// browser startup, since that's when we wipe the IDB key.
async function decryptMnemonicWithCachedKey(walletRaw: string): Promise<string> {
  const key = await loadUnlockKey();
  if (!key) {
    throw new Error('Wallet is locked. Open TIPT and unlock first.');
  }
  const walletPayload = JSON.parse(walletRaw) as WalletPayload;
  return decryptText(key, walletPayload.iv, walletPayload.ct);
}

async function initFromMnemonicInternal(mnemonic?: string): Promise<SparkWallet> {
  // Caller is expected to have torn down any previous instance.
  const result = await SparkWallet.initialize({
    ...(mnemonic ? { mnemonicOrSeed: mnemonic } : {}),
    options: { network: 'MAINNET' },
  });
  cachedWallet = result.wallet;
  subscribeWalletEvents(result.wallet);
  return result.wallet;
}

// Ensure the SDK is initialised from the encrypted blob, decrypting with the
// IndexedDB-cached unlock key. Idempotent: returns the cached wallet if it
// already exists. Used by the unified payment path when the offscreen
// document has been torn down between the popup unlock and the pay call.
export async function ensureWalletFromBlob(walletRaw: string): Promise<SparkWallet> {
  if (cachedWallet) return cachedWallet;

  if (!walletInitPromise) {
    walletInitPromise = (async () => {
      const mnemonic = await decryptMnemonicWithCachedKey(walletRaw);
      return initFromMnemonicInternal(mnemonic);
    })();
  }

  try {
    return await walletInitPromise;
  } finally {
    walletInitPromise = null;
  }
}

// Raw wallet-read passthroughs for the MPP charge bridge. The page-side SDK
// drives the polling loop (resolvePreimage) and calls these to follow a
// settling payment: `getLightningSendRequest` for the Lightning route, and
// `getTransfer` (whose nested `userRequest.id` the SDK follows back into
// `getLightningSendRequest`) for the Spark route. We return only the
// projected string fields the SDK reads.
async function ensureWalletReady(walletRaw?: string): Promise<SparkWallet> {
  if (cachedWallet) return cachedWallet;
  if (!walletRaw) {
    throw new Error('Wallet not initialized and no encrypted blob provided to re-initialize.');
  }
  return ensureWalletFromBlob(walletRaw);
}

export async function getLightningSendRequestRaw(
  id: string,
  walletRaw?: string,
): Promise<WalletSendRequestProjection | null> {
  const wallet = await ensureWalletReady(walletRaw);
  const w = wallet as unknown as {
    getLightningSendRequest: (id: string) => Promise<Record<string, unknown> | null>;
  };
  const req = await w.getLightningSendRequest(id);
  if (!req || typeof req !== 'object') return null;
  const out: WalletSendRequestProjection = {};
  const preimage = getStringField(req, PREIMAGE_KEYS);
  if (preimage) out.paymentPreimage = preimage;
  if (typeof req.status === 'string') out.status = req.status;
  return out;
}

export async function getTransferRaw(
  id: string,
  walletRaw?: string,
): Promise<WalletTransferProjection | null> {
  const wallet = await ensureWalletReady(walletRaw);
  const w = wallet as unknown as {
    getTransfer?: (id: string) => Promise<Record<string, unknown> | null | undefined>;
  };
  if (typeof w.getTransfer !== 'function') return null;
  const transfer = await w.getTransfer(id);
  if (!transfer || typeof transfer !== 'object') return null;
  const out: WalletTransferProjection = {};
  if (typeof (transfer as { status?: unknown }).status === 'string') {
    out.status = (transfer as { status: string }).status;
  }
  const userRequest = (transfer as { userRequest?: unknown }).userRequest;
  if (userRequest !== undefined && userRequest !== null && typeof userRequest === 'object') {
    out.userRequest = projectUserRequest(userRequest) ?? {};
  }
  return out;
}

async function getWalletFeeEstimateRaw(invoice: string): Promise<number | null> {
  if (!cachedWallet) return null;
  const wallet = cachedWallet as unknown as {
    getLightningSendFeeEstimate: (p: { encodedInvoice: string }) => Promise<number>;
  };
  try {
    const fee = await wallet.getLightningSendFeeEstimate({ encodedInvoice: invoice });
    return typeof fee === 'number' && Number.isFinite(fee) ? fee : null;
  } catch {
    return null;
  }
}

export interface PayOptions {
  // Encrypted wallet blob — supplied so the offscreen can recover its SDK
  // instance if Chrome reclaimed the document since the last call.
  walletRaw?: string;
  // Pre-computed maximum fee from the caller. When omitted, we ask the SDK
  // for a fee estimate and apply the standard headroom multiplier.
  maxFeeSats?: number;
  // Optional route preference for BOLT11 invoices. Defaults to true to keep
  // existing behavior unless the caller explicitly disables it.
  preferSpark?: boolean;
}

export interface PayResult {
  txId?: string;
  preimage?: string;
}

// Shared core: ensure the wallet, resolve a max fee, and call
// `payLightningInvoice`. Returns the RAW SDK result untouched.
async function payLightningInvoiceCore(
  invoice: string,
  options: PayOptions,
): Promise<Record<string, unknown>> {
  if (!cachedWallet) {
    if (!options.walletRaw) {
      throw new Error('Wallet not initialized and no encrypted blob provided to re-initialize.');
    }
    await ensureWalletFromBlob(options.walletRaw);
  }
  const wallet = cachedWallet;
  if (!wallet) throw new Error('Wallet not initialized.');

  let maxFeeSats = options.maxFeeSats;
  if (maxFeeSats === undefined) {
    const estimated = await getWalletFeeEstimateRaw(invoice);
    maxFeeSats = estimated !== null ? Math.max(25, Math.ceil(estimated * 2)) : 50;
  }

  const preferSpark = options.preferSpark ?? true;
  const result = await wallet.payLightningInvoice({ invoice, maxFeeSats, preferSpark });
  return result as unknown as Record<string, unknown>;
}

// Thin raw pay for the MPP charge bridge: pays and returns the projected
// wallet result (JSON/clone-safe subset). Does NOT poll for a preimage — the
// page-side SDK's `resolvePreimage` drives that via the read passthroughs.
export async function payLightningInvoiceRaw(
  invoice: string,
  options: PayOptions = {},
): Promise<WalletPayProjection> {
  const result = await payLightningInvoiceCore(invoice, options);
  return projectPayResult(result);
}

// Popup send path (TIPT_PAY_INVOICE). Returns the transfer id and any
// synchronously-available preimage; the popup only consumes the id.
export async function payInvoice(invoice: string, options: PayOptions = {}): Promise<PayResult> {
  const result = await payLightningInvoiceCore(invoice, options);
  const txId = getStringField(result, ['id', 'transferSparkId']) ?? undefined;
  const preimage = extractPreimage(result) ?? undefined;
  return { txId, preimage };
}

// Initial wallet creation / recovery path. The popup decrypts the mnemonic
// locally (using the freshly-derived unlock key) and hands the plaintext
// mnemonic over so the SDK can initialise. The encrypted blob never crosses
// the IPC boundary on this path.
export async function initWalletFromMnemonic(
  mnemonic?: string,
): Promise<{ mnemonic: string; balanceSats: bigint }> {
  await teardownWallet(cachedWallet);
  cachedWallet = null;
  walletInitPromise = null;

  const wallet = await initFromMnemonicInternal(mnemonic);
  const returnedMnemonic = ((wallet as unknown) as { mnemonic?: string }).mnemonic ?? mnemonic ?? '';
  const bal = await wallet.getBalance();
  return { mnemonic: returnedMnemonic, balanceSats: bal.balance };
}

export async function disposeWallet(): Promise<void> {
  const walletToDispose = cachedWallet;
  cachedWallet = null;
  walletInitPromise = null;
  await teardownWallet(walletToDispose);
}

export type WalletEventName = 'transfer:claimed' | 'deposit:confirmed' | 'balance:update';
type WalletEventListener = (event: WalletEventName, balance: bigint) => void;
const walletEventListeners = new Set<WalletEventListener>();

export function registerWalletEventListener(fn: WalletEventListener): () => void {
  walletEventListeners.add(fn);
  return () => {
    walletEventListeners.delete(fn);
  };
}

function emitWalletEvent(event: WalletEventName, balance: bigint) {
  for (const listener of walletEventListeners) {
    try { listener(event, balance); } catch { /* ignore listener errors */ }
  }
}

function subscribeWalletEvents(wallet: SparkWallet) {
  wallet.on('transfer:claimed', (_id: string, balance: bigint) => emitWalletEvent('transfer:claimed', balance));
  wallet.on('deposit:confirmed', (_id: string, balance: bigint) => emitWalletEvent('deposit:confirmed', balance));
  // BalanceUpdate is the SDK's catch-all balance-changed event — it fires for
  // claims, swaps, deposits and outgoing transfers alike. Critically for the
  // restore flow, it fires for transfers the SDK's background claim loop
  // settles *during* SparkWallet.initialize(), which is exactly the window
  // where the popup hasn't yet rendered its first balance and the
  // transfer:claimed events were being missed. Subscribing to it here means
  // a restored wallet's balance now self-corrects within the same popup
  // session, instead of only after a popup close/reopen cycle.
  wallet.on('balance:update', (b: { available: bigint }) => {
    if (typeof b?.available === 'bigint') emitWalletEvent('balance:update', b.available);
  });
}

export async function getWalletBalance(): Promise<bigint> {
  if (!cachedWallet) throw new Error('Wallet not initialized.');
  const result = await cachedWallet.getBalance();
  return result.balance;
}

// Spark address (bech32m-encoded identity, e.g. sp1qq…). Stable for the
// lifetime of the wallet so callers may freely cache it. The SDK call is
// resolved entirely from the cached identity material — no Spark cluster
// round trip — so this is cheap to invoke from the popup settings menu.
export async function getSparkAddress(): Promise<string> {
  if (!cachedWallet) throw new Error('Wallet not initialized.');
  return cachedWallet.getSparkAddress();
}

export interface SparkTransferOptions {
  // Same cold-restart semantics as `PayOptions.walletRaw` — the background
  // hands the encrypted blob across the IPC boundary so the offscreen can
  // re-initialise the SDK if Chrome reclaimed the document since the last
  // call. The PIN never crosses the boundary; decryption happens locally
  // via the IndexedDB-cached AES-GCM key (see decryptMnemonicWithCachedKey).
  walletRaw?: string;
}

export interface SparkTransferResult {
  // Spark transfer id (WalletTransfer.id) — opaque to TIPT, useful only as
  // a receipt the page can quote back to the merchant. There is no
  // Lightning preimage on this path.
  txId: string;
}

// Spark-native transfer to a receiver Spark address. Mirrors `payInvoice`'s
// cold-restart pattern (ensureWalletFromBlob + timing logs) so the prewarm
// fastpath benefits both settlement types identically. We *do not* attempt
// to validate the address here — the SDK rejects malformed addresses with
// a structured error which we surface to the caller as-is.
export async function payToSparkAddress(
  receiverSparkAddress: string,
  amountSats: number,
  options: SparkTransferOptions = {},
): Promise<SparkTransferResult> {
  const tStart = Date.now();
  if (!Number.isFinite(amountSats) || amountSats <= 0 || !Number.isInteger(amountSats)) {
    throw new Error('Spark transfer requires a positive integer amountSats.');
  }
  if (!cachedWallet) {
    if (!options.walletRaw) {
      throw new Error('Wallet not initialized and no encrypted blob provided to re-initialize.');
    }
    await ensureWalletFromBlob(options.walletRaw);
  }
  const tWalletReady = Date.now();

  const wallet = cachedWallet;
  if (!wallet) throw new Error('Wallet not initialized.');

  const result = await wallet.transfer({ amountSats, receiverSparkAddress });
  const tTransferReturned = Date.now();

  const r = result as unknown as Record<string, unknown>;
  const txId = typeof r.id === 'string' ? r.id : '';
  if (!txId) {
    throw new Error('Spark transfer completed but no transfer id was returned.');
  }

  log(
    `[TIPT-OFFSCREEN] payToSparkAddress timing (ms): walletReady=${tWalletReady - tStart}`,
    `transfer=${tTransferReturned - tWalletReady}`,
    `total=${tTransferReturned - tStart}`,
  );

  return { txId };
}

// Recursive in-place walk that converts every `bigint` to its decimal
// string and clones objects/arrays. The Spark SDK occasionally surfaces
// bigint values (uint64 proto fields) that silently break
// `chrome.runtime.sendMessage` serialisation if forwarded as-is. The
// previous implementation used `JSON.parse(JSON.stringify(...,replacer))`
// which doubled the work and allocated twice the memory.
//
// Special cases that the generic `Object.entries` recursion would silently
// destroy:
//   - Date: enumerable own keys are empty, so we'd serialise to `{}` and
//     the renderer would render "Unknown date" for every transfer.
//   - Map / Set: same problem (no enumerable own keys).
//   - Uint8Array / ArrayBuffer: not JSON-serialisable; not currently emitted
//     by SDK transfer payloads, but we pass them through untouched so callers
//     that intentionally use them aren't corrupted.
function normaliseBigints(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) out[String(k)] = normaliseBigints(v);
    return out;
  }
  if (value instanceof Set) return Array.from(value, normaliseBigints);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) return value.map(normaliseBigints);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normaliseBigints(v);
    }
    return out;
  }
  return value;
}

export async function getWalletTransfers(limit: number, offset: number): Promise<unknown[]> {
  if (!cachedWallet) throw new Error('Wallet not initialized.');
  const walletWithTransfers = cachedWallet as unknown as {
    getTransfers?: (limit: number, offset: number) => Promise<unknown>;
  };
  if (typeof walletWithTransfers.getTransfers !== 'function') return [];
  const response = await walletWithTransfers.getTransfers(limit, offset);
  const transfers =
    typeof response === 'object' && response !== null && 'transfers' in response
      ? (response as { transfers?: unknown }).transfers
      : response;
  if (!Array.isArray(transfers)) return [];
  const safe = normaliseBigints(transfers) as unknown[];
  return safe.filter((item) => typeof item === 'object' && item !== null);
}

export async function createWalletInvoice(amountSats: number): Promise<string> {
  if (!cachedWallet) throw new Error('Wallet not initialized.');
  const r = await cachedWallet.createLightningInvoice({ amountSats });
  return (r as unknown as { invoice: { encodedInvoice: string } }).invoice.encodedInvoice;
}

export async function getWalletFeeEstimate(encodedInvoice: string): Promise<number> {
  if (!cachedWallet) throw new Error('Wallet not initialized.');
  const wallet = cachedWallet as unknown as {
    getLightningSendFeeEstimate: (p: { encodedInvoice: string }) => Promise<number>;
  };
  const fee = await wallet.getLightningSendFeeEstimate({ encodedInvoice });
  if (typeof fee === 'number' && Number.isFinite(fee)) return fee;
  throw new Error('Could not determine fee estimate.');
}

// Synchronous-style introspection used by the popup to decide whether to
// show a loading spinner before requesting the first balance. Deliberately
// does NOT round-trip to the Spark cluster — the previous implementation
// called getBalance() and made every popup open slow.
export function hasCachedWallet(): boolean {
  return cachedWallet !== null;
}
