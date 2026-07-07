import { Mppx, spark, type WalletLike } from './client/index.js';
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
} from './event-bridge.js';

const DEFAULT_PAYMENT_TIMEOUT_MS = 90_000;
const DEFAULT_WALLET_READ_TIMEOUT_MS = 15_000;
const DEFAULT_EXTENSION_PROBE_TIMEOUT_MS = 1_500;

function requirePageEventBridge(): void {
  if (typeof window === 'undefined') {
    throw new Error('TIPT SDK extension bridge requires a browser window context.');
  }
}

function randomRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mpp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface ProbeExtensionOptions {
  timeoutMs?: number;
  paymentMethods?: string[];
  intents?: string[];
}

export function probeExtension(options: ProbeExtensionOptions = {}): Promise<MppResponseDetail> {
  requirePageEventBridge();
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTENSION_PROBE_TIMEOUT_MS;
  const paymentMethods = options.paymentMethods ?? [...DEFAULT_REQUESTED_PAYMENT_METHODS];
  const intents = options.intents ?? [...DEFAULT_REQUESTED_INTENTS];

  return new Promise<MppResponseDetail>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('TIPT extension was not detected on this page.'));
    }, timeoutMs);

    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<MppResponseDetail>).detail;
      if (detail?.type !== 'response') return;
      if (
        detail.protocolVersion !== undefined
        && detail.protocolVersion !== MPP_EVENT_BRIDGE_PROTOCOL_VERSION
      ) {
        cleanup();
        reject(
          new Error(
            `Extension protocol version ${detail.protocolVersion} is incompatible with SDK protocol version ${MPP_EVENT_BRIDGE_PROTOCOL_VERSION}.`,
          ),
        );
        return;
      }
      if (detail.supportsRequestedPaymentMethods === false) {
        cleanup();
        reject(new Error('Extension does not support the requested payment method(s).'));
        return;
      }
      if (detail.supportsRequestedIntents === false) {
        cleanup();
        reject(new Error('Extension does not support the requested intent(s).'));
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

function callWalletRpc(
  method: MppWalletRpcMethod,
  params: unknown,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const requestId = randomRequestId();

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for extension wallet RPC "${method}".`));
    }, timeoutMs);

    const onResponse = (event: Event) => {
      const response = (event as CustomEvent<MppWalletRpcResponseDetail>).detail;
      if (!response || response.requestId !== requestId) return;
      cleanup();
      if (response.ok === false) {
        reject(new Error(response.error ?? `Extension wallet RPC "${method}" failed.`));
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

function isContextInvalidatedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes('extension context invalidated');
}

async function callWalletRpcWithRecovery(
  method: MppWalletRpcMethod,
  params: unknown,
  timeoutMs: number,
  maybeProbe: () => Promise<void>,
): Promise<unknown> {
  try {
    return await callWalletRpc(method, params, timeoutMs);
  } catch (error) {
    if (!isContextInvalidatedError(error)) {
      throw error;
    }

    // Best-effort recovery for transient extension reloads/service-worker churn.
    await maybeProbe();
    try {
      return await callWalletRpc(method, params, timeoutMs);
    } catch (retryError) {
      if (isContextInvalidatedError(retryError)) {
        throw new Error(
          'Extension context invalidated. Reload this tab and retry after the extension finishes reloading.',
        );
      }
      throw retryError;
    }
  }
}

export interface CreateExtensionWalletOptions {
  paymentTimeoutMs?: number;
  walletReadTimeoutMs?: number;
  probeBeforeRpc?: boolean;
  extensionProbeTimeoutMs?: number;
  paymentMethods?: string[];
  intents?: string[];
}

export function createExtensionWallet(options: CreateExtensionWalletOptions = {}): WalletLike {
  requirePageEventBridge();

  const paymentTimeoutMs = options.paymentTimeoutMs ?? DEFAULT_PAYMENT_TIMEOUT_MS;
  const readTimeoutMs = options.walletReadTimeoutMs ?? DEFAULT_WALLET_READ_TIMEOUT_MS;
  const extensionProbeTimeoutMs =
    options.extensionProbeTimeoutMs ?? DEFAULT_EXTENSION_PROBE_TIMEOUT_MS;

  const maybeProbe = options.probeBeforeRpc === false
    ? async () => undefined
    : async () => {
        await probeExtension({
          timeoutMs: extensionProbeTimeoutMs,
          paymentMethods: options.paymentMethods,
          intents: options.intents,
        });
      };

  return {
    async payLightningInvoice(params) {
      await maybeProbe();
      return callWalletRpcWithRecovery(
        'payLightningInvoice',
        params,
        paymentTimeoutMs,
        maybeProbe,
      ) as ReturnType<
        WalletLike['payLightningInvoice']
      >;
    },
    async getLightningSendRequest(id) {
      return callWalletRpcWithRecovery(
        'getLightningSendRequest',
        { id },
        readTimeoutMs,
        maybeProbe,
      ) as ReturnType<
        WalletLike['getLightningSendRequest']
      >;
    },
    async getTransfer(id) {
      return callWalletRpcWithRecovery(
        'getTransfer',
        { id },
        readTimeoutMs,
        maybeProbe,
      ) as ReturnType<
        NonNullable<WalletLike['getTransfer']>
      >;
    },
    async createLightningInvoice(params) {
      return callWalletRpcWithRecovery(
        'createLightningInvoice',
        params,
        readTimeoutMs,
        maybeProbe,
      ) as ReturnType<
        WalletLike['createLightningInvoice']
      >;
    },
    async cleanupConnections() {
      // The extension owns wallet lifecycle and teardown.
    },
  };
}

export interface CreateExtensionClientOptions extends CreateExtensionWalletOptions {
  fetch?: typeof globalThis.fetch;
  polyfill?: boolean;
  network?: 'mainnet' | 'regtest' | 'signet';
  maxFeeSats?: number;
  preferSpark?: boolean;
  includeSparkInvoice?: boolean;
  enableSession?: boolean;
}

export function createExtensionClient(options: CreateExtensionClientOptions = {}): Mppx.Mppx {
  const wallet = createExtensionWallet(options);

  const methods = [
    spark.charge({
      wallet,
      ...(options.network ? { network: options.network } : {}),
      ...(options.maxFeeSats !== undefined ? { maxFeeSats: options.maxFeeSats } : {}),
      ...(options.preferSpark !== undefined ? { preferSpark: options.preferSpark } : {}),
    }),
  ];

  if (options.enableSession) {
    methods.push(
      spark.session({
        wallet,
        ...(options.network ? { network: options.network } : {}),
        ...(options.maxFeeSats !== undefined ? { maxFeeSats: options.maxFeeSats } : {}),
        ...(options.preferSpark !== undefined ? { preferSpark: options.preferSpark } : {}),
        ...(options.includeSparkInvoice !== undefined
          ? { includeSparkInvoice: options.includeSparkInvoice }
          : {}),
      }),
    );
  }

  return Mppx.create({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    polyfill: options.polyfill ?? true,
    methods,
  });
}

export function restoreFetch(): void {
  Mppx.restore();
}
