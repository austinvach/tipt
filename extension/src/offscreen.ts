/// <reference types="chrome" />
import {
  initWalletFromMnemonic,
  getWalletBalance,
  getWalletTransfers,
  createWalletInvoice,
  getWalletFeeEstimate,
  payInvoice,
  payLightningInvoiceRaw,
  transferRaw,
  getLightningSendRequestRaw,
  getTransferRaw,
  createLightningInvoiceRaw,
  hasCachedWallet,
  disposeWallet,
  registerWalletEventListener,
  ensureWalletFromBlob,
} from './wallet-service';
import { clearUnlockKey } from './lib/key-store';
import { isInternalSender } from './lib/runtime';
import { MSG, type Envelope } from './lib/messages';

const handlers: Record<string, (payload: Record<string, unknown>) => Promise<Envelope>> = {
  async [MSG.OFFSCREEN_PAY_LIGHTNING_RAW](p) {
    const invoice = p.invoice as string | undefined;
    const walletRaw = p.walletRaw as string | undefined;
    const maxFeeSats = typeof p.maxFeeSats === 'number' ? p.maxFeeSats : undefined;
    const preferSpark = typeof p.preferSpark === 'boolean' ? p.preferSpark : undefined;
    if (!invoice) return { ok: false, error: 'Missing invoice for offscreen payment.' };
    if (!walletRaw) return { ok: false, error: 'Missing wallet ciphertext for offscreen payment.' };
    const result = await payLightningInvoiceRaw(invoice, { walletRaw, maxFeeSats, preferSpark });
    return { ok: true, result };
  },
  async [MSG.OFFSCREEN_TRANSFER_RAW](p) {
    const receiverSparkAddress = p.receiverSparkAddress as string | undefined;
    const walletRaw = p.walletRaw as string | undefined;
    const amountSats = typeof p.amountSats === 'number' ? p.amountSats : 0;
    if (!receiverSparkAddress) return { ok: false, error: 'Missing receiverSparkAddress for transfer.' };
    if (!walletRaw) return { ok: false, error: 'Missing wallet ciphertext for transfer.' };
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      return { ok: false, error: 'Invalid amountSats for transfer.' };
    }
    const result = await transferRaw(receiverSparkAddress, amountSats, { walletRaw });
    return { ok: true, result };
  },
  async [MSG.OFFSCREEN_GET_SEND_REQUEST](p) {
    const id = p.id as string | undefined;
    const walletRaw = p.walletRaw as string | undefined;
    if (!id) return { ok: false, error: 'Missing id for getLightningSendRequest.' };
    const result = await getLightningSendRequestRaw(id, walletRaw);
    return { ok: true, result };
  },
  async [MSG.OFFSCREEN_GET_TRANSFER](p) {
    const id = p.id as string | undefined;
    const walletRaw = p.walletRaw as string | undefined;
    if (!id) return { ok: false, error: 'Missing id for getTransfer.' };
    const result = await getTransferRaw(id, walletRaw);
    return { ok: true, result };
  },
  async [MSG.OFFSCREEN_CREATE_LIGHTNING_INVOICE](p) {
    const walletRaw = p.walletRaw as string | undefined;
    const amountSats = typeof p.amountSats === 'number' ? p.amountSats : 0;
    const memo = typeof p.memo === 'string' ? p.memo : '';
    const expirySeconds = typeof p.expirySeconds === 'number' ? p.expirySeconds : undefined;
    const includeSparkInvoice =
      typeof p.includeSparkInvoice === 'boolean' ? p.includeSparkInvoice : undefined;
    if (!walletRaw) return { ok: false, error: 'Missing wallet ciphertext for invoice creation.' };
    const result = await createLightningInvoiceRaw({
      walletRaw,
      amountSats,
      memo,
      expirySeconds,
      includeSparkInvoice,
    });
    return { ok: true, result };
  },
  async [MSG.PREWARM_WALLET](p) {
    const walletRaw = p.walletRaw as string | undefined;
    if (!walletRaw) return { ok: false, error: 'Missing wallet ciphertext for prewarm.' };
    // Idempotent in wallet-service. Throws if the wallet is locked (no
    // unlock key in IndexedDB) — caller treats every failure as silent.
    await ensureWalletFromBlob(walletRaw);
    return { ok: true };
  },
  async [MSG.WALLET_CREATE](p) {
    const mnemonic = p.mnemonic as string | undefined;
    const r = await initWalletFromMnemonic(mnemonic);
    return { ok: true, mnemonic: r.mnemonic, balanceSats: r.balanceSats.toString() };
  },
  async [MSG.GET_BALANCE]() {
    const b = await getWalletBalance();
    return { ok: true, balance: b.toString() };
  },
  async [MSG.GET_TRANSFERS](p) {
    const limit = typeof p.limit === 'number' ? p.limit : 10;
    const offset = typeof p.offset === 'number' ? p.offset : 0;
    const t = await getWalletTransfers(limit, offset);
    return { ok: true, transfers: t };
  },
  async [MSG.CREATE_INVOICE](p) {
    const amountSats = typeof p.amountSats === 'number' ? p.amountSats : 0;
    const inv = await createWalletInvoice(amountSats);
    return { ok: true, invoice: inv };
  },
  async [MSG.GET_FEE_ESTIMATE](p) {
    const encodedInvoice = p.encodedInvoice as string | undefined;
    if (!encodedInvoice) return { ok: false, error: 'Missing encodedInvoice.' };
    const feeSats = await getWalletFeeEstimate(encodedInvoice);
    return { ok: true, feeSats };
  },
  async [MSG.PAY_INVOICE](p) {
    const invoice = p.invoice as string | undefined;
    if (!invoice) return { ok: false, error: 'Missing invoice.' };
    const maxFeeSats = typeof p.maxFeeSats === 'number' ? p.maxFeeSats : undefined;
    const walletRaw = p.walletRaw as string | undefined;
    const r = await payInvoice(invoice, { maxFeeSats, walletRaw });
    return { ok: true, txId: r.txId };
  },
  async [MSG.HAS_WALLET]() {
    return { ok: true, hasWallet: hasCachedWallet() };
  },
  async [MSG.DISPOSE_WALLET]() {
    await disposeWallet();
    await clearUnlockKey();
    return { ok: true };
  },
};

// Bail BEFORE any other work for messages that don't target the offscreen.
// Both background and offscreen attach onMessage listeners to the same
// chrome.runtime channel; cross-handler types (TIPT_402_*, TIPT_MPP_*) are
// routed exclusively to background. Returning undefined here keeps the
// listener out of the dispatch race so the popup's await resolves to the
// background's response and never to our "Unauthorized sender." short-circuit.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as { type?: string; payload?: Record<string, unknown> };
  const type = msg?.type;
  if (!type || !(type in handlers)) return;

  if (!isInternalSender(sender)) {
    sendResponse({ ok: false, error: 'Unauthorized sender.' } satisfies Envelope);
    return;
  }
  const handler = handlers[type];
  (async () => {
    try {
      const result = await handler(msg.payload ?? {});
      sendResponse(result);
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies Envelope);
    }
  })();
  return true;
});

// Long-lived port for wallet events. Popup connects with name 'tipt-wallet'.
chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id) return;
  if (port.name !== 'tipt-wallet') return;
  const unsubscribe = registerWalletEventListener((event, balance) => {
    try {
      port.postMessage({ type: 'TIPT_WALLET_EVENT', payload: { event, balance: balance.toString() } });
    } catch {
      unsubscribe();
    }
  });
  port.onDisconnect.addListener(() => unsubscribe());
});
