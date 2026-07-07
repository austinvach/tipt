/// <reference lib="dom" />

import { SparkWallet } from '@buildonspark/spark-sdk';
import { decryptText } from './crypto';
import { loadUnlockKey } from './lib/key-store';
import { getStringField } from './lib/object-helpers';

interface WalletPayload {
  iv: string;
  ct: string;
}

const PREIMAGE_KEYS = ['paymentPreimage', 'preimage', 'payment_preimage'] as const;

// Raw wallet-result projections forwarded to the page-side SDK over the
// bridge. We deliberately return only the string fields that
// @tipt/sdk's `resolvePreimage` reads — not the whole
// SparkWallet object — so the payload is JSON/structured-clone safe (no
// BigInt or class instances) and leaks no extra wallet state to the page.
// The extension does NOT interpret these: preimage resolution and credential
// building happen page-side.
export interface WalletPayProjection {
  id: string;
  paymentPreimage?: string;
  status?: string;
}
export interface WalletSendRequestProjection {
  paymentPreimage?: string;
  status?: string;
}
export interface WalletTransferProjection {
  status?: string;
  paymentPreimage?: string;
  userRequestId?: string;
  userRequest?: {
    id?: string;
    paymentPreimage?: string;
  };
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

function projectPayResult(result: unknown): WalletPayProjection {
  const r = (result ?? {}) as Record<string, unknown>;
  const out: WalletPayProjection = {
    id: getStringField(r, ['id', 'transferSparkId']) ?? '',
  };
  const preimage = getStringField(r, PREIMAGE_KEYS);
  if (preimage) out.paymentPreimage = preimage;
  if (typeof r.status === 'string') out.status = r.status;
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
  // Defensive: the SDK may probe an id that isn't a Lightning send request
  // (e.g. a Spark transfer id). Treat a not-found/throwing lookup as null
  // rather than surfacing an error that would abort preimage resolution.
  let req: Record<string, unknown> | null;
  try {
    req = await w.getLightningSendRequest(id);
  } catch {
    return null;
  }
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
  // Defensive: the SDK probes `getTransfer(id)` every poll to detect the Spark
  // route, so it will pass Lightning send-request ids too. A not-found/throwing
  // lookup means "not a transfer" — return null so the SDK falls back to the
  // Lightning path instead of aborting.
  let transfer: Record<string, unknown> | null | undefined;
  try {
    transfer = await w.getTransfer(id);
  } catch {
    return null;
  }
  if (!transfer || typeof transfer !== 'object') return null;
  const out: WalletTransferProjection = {};
  const transferRecord = transfer as Record<string, unknown>;
  if (typeof (transfer as { status?: unknown }).status === 'string') {
    out.status = (transfer as { status: string }).status;
  }

  const transferPreimage = getStringField(transferRecord, PREIMAGE_KEYS);
  if (transferPreimage) out.paymentPreimage = transferPreimage;

  const userRequestId = getStringField(transferRecord, ['userRequestId']);
  if (userRequestId) out.userRequestId = userRequestId;

  const userRequest = (transfer as { userRequest?: unknown }).userRequest;
  if (userRequest && typeof userRequest === 'object') {
    const userRequestRecord = userRequest as Record<string, unknown>;
    const nestedUserRequestId = getStringField(userRequestRecord, ['id']);
    const userRequestPreimage = getStringField(userRequestRecord, PREIMAGE_KEYS);
    if (nestedUserRequestId || userRequestPreimage) {
      out.userRequest = {
        ...(nestedUserRequestId ? { id: nestedUserRequestId } : {}),
        ...(userRequestPreimage ? { paymentPreimage: userRequestPreimage } : {}),
      };
    }
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
  // When omitted, defaults to true to allow Spark route preference.
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

export async function transferRaw(
  receiverSparkAddress: string,
  amountSats: number,
  options: PayOptions = {},
): Promise<WalletPayProjection> {
  const wallet = await ensureWalletReady(options.walletRaw);
  const w = wallet as unknown as {
    transfer: (params: { receiverSparkAddress: string; amountSats: number }) => Promise<Record<string, unknown>>;
  };
  const result = await w.transfer({ receiverSparkAddress, amountSats });
  return projectPayResult(result);
}

export async function createLightningInvoiceRaw(options: {
  walletRaw: string;
  amountSats: number;
  memo?: string;
  expirySeconds?: number;
  includeSparkInvoice?: boolean;
}): Promise<{ invoice: { encodedInvoice: string; paymentHash?: string } }> {
  if (!cachedWallet) {
    await ensureWalletFromBlob(options.walletRaw);
  }
  const wallet = cachedWallet;
  if (!wallet) throw new Error('Wallet not initialized.');

  const result = await wallet.createLightningInvoice({
    amountSats: options.amountSats,
    memo: options.memo ?? '',
    ...(options.expirySeconds !== undefined ? { expirySeconds: options.expirySeconds } : {}),
    ...(options.includeSparkInvoice !== undefined
      ? { includeSparkInvoice: options.includeSparkInvoice }
      : {}),
  });

  const invoice = (result as unknown as {
    invoice?: { encodedInvoice?: string; paymentHash?: string };
  }).invoice;

  if (!invoice?.encodedInvoice) {
    throw new Error('Failed to create Lightning invoice.');
  }

  return {
    invoice: {
      encodedInvoice: invoice.encodedInvoice,
      ...(typeof invoice.paymentHash === 'string' ? { paymentHash: invoice.paymentHash } : {}),
    },
  };
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
