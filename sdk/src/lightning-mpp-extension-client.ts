import { charge as lightningCharge, Mppx, type WalletLike } from '@buildonspark/lightning-mpp-sdk/client';
import type { Mppx as MppxClient } from 'mppx/client';
import {
  DEFAULT_REQUESTED_INTENTS,
  DEFAULT_REQUESTED_PAYMENT_METHODS,
  MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
  MPP_EXTENSION_EVENT,
  MPP_WALLET_RPC_EVENT,
  MPP_WALLET_RPC_RESPONSE_EVENT,
  buildMppProbeRequestDetail,
  type MppResponseDetail,
  type MppWalletRpcMethod,
  type MppWalletRpcRequestDetail,
  type MppWalletRpcResponseDetail,
} from './event-bridge';

const DEFAULT_PAYMENT_TIMEOUT_MS = 90_000;
const DEFAULT_WALLET_READ_TIMEOUT_MS = 15_000;
const DEFAULT_EXTENSION_PROBE_TIMEOUT_MS = 1_500;

function requirePageEventBridge(): void {
  if (typeof window === 'undefined') {
    throw new Error('Lightning MPP Extension SDK requires a browser window context.');
  }
}

function randomRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mpp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface ProbeLightningMppExtensionOptions {
  timeoutMs?: number;
  paymentMethods?: string[];
  intents?: string[];
}

export function probeLightningMppExtension(
  options: ProbeLightningMppExtensionOptions = {},
): Promise<MppResponseDetail> {
  requirePageEventBridge();
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTENSION_PROBE_TIMEOUT_MS;
  const paymentMethods = options.paymentMethods ?? [...DEFAULT_REQUESTED_PAYMENT_METHODS];
  const intents = options.intents ?? [...DEFAULT_REQUESTED_INTENTS];

  return new Promise<MppResponseDetail>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('MPP extension was not detected on this page.'));
    }, timeoutMs);

    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<MppResponseDetail>).detail;
      if (detail?.type !== 'response') return;
      if (
        detail.protocolVersion !== undefined
        && detail.protocolVersion !== MPP_EVENT_BRIDGE_PROTOCOL_VERSION
      ) {
        cleanup();
        reject(new Error(
          `MPP extension protocol version ${detail.protocolVersion} is incompatible with SDK protocol version ${MPP_EVENT_BRIDGE_PROTOCOL_VERSION}.`,
        ));
        return;
      }
      if (detail.supportsRequestedPaymentMethods === false) {
        cleanup();
        reject(new Error('MPP extension does not support the requested payment method(s).'));
        return;
      }
      if (detail.supportsRequestedIntents === false) {
        cleanup();
        reject(new Error('MPP extension does not support the requested intent(s).'));
        return;
      }
      cleanup();
      resolve(detail);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(MPP_EXTENSION_EVENT, onResponse as EventListener);
    };

    window.addEventListener(MPP_EXTENSION_EVENT, onResponse as EventListener);
    window.dispatchEvent(new CustomEvent(MPP_EXTENSION_EVENT, {
      detail: buildMppProbeRequestDetail(paymentMethods, intents),
    }));
  });
}

/**
 * Dispatches a single wallet-RPC request over the page event bridge and
 * resolves with the extension's raw result. The extension gates the
 * `payLightningInvoice` call behind its own approval flow; read methods are
 * read-only follow-ups.
 */
function callWalletRpc(
  method: MppWalletRpcMethod,
  params: unknown,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const requestId = randomRequestId();

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for MPP extension wallet RPC "${method}".`));
    }, timeoutMs);

    const onResponse = (event: Event) => {
      const response = (event as CustomEvent<MppWalletRpcResponseDetail>).detail;
      if (!response || response.requestId !== requestId) return;
      cleanup();
      if (response.ok === false) {
        reject(new Error(response.error ?? `MPP extension wallet RPC "${method}" failed.`));
        return;
      }
      resolve(response.result);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(MPP_WALLET_RPC_RESPONSE_EVENT, onResponse as EventListener);
    };

    window.addEventListener(MPP_WALLET_RPC_RESPONSE_EVENT, onResponse as EventListener);
    const detail: MppWalletRpcRequestDetail = { requestId, method, params };
    window.dispatchEvent(new CustomEvent(MPP_WALLET_RPC_EVENT, { detail }));
  });
}

interface BridgeWalletOptions {
  paymentTimeoutMs: number;
  readTimeoutMs: number;
  probe?: () => Promise<void>;
}

/**
 * Builds a `WalletLike` proxy whose methods are forwarded to the extension
 * over the event bridge. The wallet (seed + SparkWallet SDK) never leaves the
 * extension; only individual RPC calls cross the boundary, and their raw
 * results flow back to `@buildonspark/lightning-mpp-sdk`'s `charge`, which
 * owns preimage resolution (Lightning and Spark routes) and credential
 * serialization.
 */
function createBridgeWallet(options: BridgeWalletOptions): WalletLike {
  return {
    async payLightningInvoice(params) {
      // Confirm the extension is present and compatible right before the only
      // fund-moving call. Read methods below never move funds, so they skip it.
      if (options.probe) await options.probe();
      return callWalletRpc('payLightningInvoice', params, options.paymentTimeoutMs) as ReturnType<
        WalletLike['payLightningInvoice']
      >;
    },
    async getLightningSendRequest(id) {
      return callWalletRpc('getLightningSendRequest', { id }, options.readTimeoutMs) as ReturnType<
        WalletLike['getLightningSendRequest']
      >;
    },
    // Not needed by `charge` (invoice creation lives in the extension's own
    // wallet UI), but required to satisfy the structural WalletLike type.
    async createLightningInvoice() {
      throw new Error('createLightningInvoice is not supported over the extension bridge.');
    },
    // No-op: the extension owns the SparkWallet lifecycle, so there are no
    // page-side connections to tear down.
    async cleanupConnections() {
      /* wallet lifecycle owned by the extension */
    },
  };
}

export interface CreateLightningMppExtensionClientOptions {
  fetch?: typeof globalThis.fetch;
  polyfill?: boolean;
  paymentTimeoutMs?: number;
  walletReadTimeoutMs?: number;
  probeExtension?: boolean;
  extensionProbeTimeoutMs?: number;
  paymentMethods?: string[];
  intents?: string[];
  maxFeeSats?: number;
  network?: 'mainnet' | 'regtest' | 'signet';
}

/**
 * Creates an MPP Lightning client that routes 402 payments through the MPP
 * browser extension. The extension is a thin wallet-RPC passthrough: it pays
 * (after user approval) and answers read-only follow-ups, while this SDK and
 * `@buildonspark/lightning-mpp-sdk` own invoice verification, preimage
 * resolution, and credential serialization.
 */
export function createLightningMppExtensionClient(
  options: CreateLightningMppExtensionClientOptions = {},
): MppxClient.Mppx {
  requirePageEventBridge();

  const paymentTimeoutMs = options.paymentTimeoutMs ?? DEFAULT_PAYMENT_TIMEOUT_MS;
  const walletReadTimeoutMs = options.walletReadTimeoutMs ?? DEFAULT_WALLET_READ_TIMEOUT_MS;
  const extensionProbeTimeoutMs =
    options.extensionProbeTimeoutMs ?? DEFAULT_EXTENSION_PROBE_TIMEOUT_MS;

  const probe =
    options.probeExtension === false
      ? undefined
      : async () => {
          await probeLightningMppExtension({
            timeoutMs: extensionProbeTimeoutMs,
            paymentMethods: options.paymentMethods,
            intents: options.intents,
          });
        };

  const wallet = createBridgeWallet({
    paymentTimeoutMs,
    readTimeoutMs: walletReadTimeoutMs,
    probe,
  });

  const chargeMethod = lightningCharge({
    wallet,
    ...(options.maxFeeSats !== undefined ? { maxFeeSats: options.maxFeeSats } : {}),
    ...(options.network ? { network: options.network } : {}),
  });

  return Mppx.create({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    polyfill: options.polyfill ?? true,
    methods: [chargeMethod],
  });
}

export function restoreLightningMppExtensionFetch(): void {
  Mppx.restore();
}
