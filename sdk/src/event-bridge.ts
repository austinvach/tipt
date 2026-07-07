export const MPP_EXTENSION_EVENT = 'mpp:extension';
// Wallet-RPC bridge: the page-side SDK forwards individual wallet method
// calls (payLightningInvoice / getLightningSendRequest / getTransfer) to the
// extension, which executes them against the SparkWallet it owns and returns
// the RAW result. All interpretation (preimage resolution, credential
// serialization) happens page-side inside @tipt/sdk methods.
export const MPP_WALLET_RPC_EVENT = 'mpp:wallet-rpc';
export const MPP_WALLET_RPC_RESPONSE_EVENT = 'mpp:wallet-rpc-response';

export const MPP_EVENT_BRIDGE_PROTOCOL_VERSION = '1.0.0';

export const DEFAULT_REQUESTED_PAYMENT_METHODS = ['lightning'] as const;
export const DEFAULT_REQUESTED_INTENTS = ['charge'] as const;

export interface MppResponseDetail {
  type?: string;
  name?: string;
  version?: string;
  protocolVersion?: string;
  paymentMethods?: string[];
  intents?: string[];
  requestedPaymentMethods?: string[];
  requestedIntents?: string[];
  supportsRequestedPaymentMethods?: boolean;
  supportsRequestedIntents?: boolean;
  walletConfigured?: boolean;
}

/**
 * Wallet methods the extension exposes over the bridge. These mirror the
 * subset of the SparkWallet surface that page-side charge flow needs.
 */
export type MppWalletRpcMethod =
  | 'payLightningInvoice'
  | 'getLightningSendRequest'
  | 'getTransfer'
  | 'createLightningInvoice';

export interface MppWalletRpcRequestDetail {
  requestId: string;
  method: MppWalletRpcMethod;
  /** Method arguments. Shape depends on `method` (validated extension-side). */
  params: unknown;
}

export interface MppWalletRpcResponseDetail {
  requestId?: string;
  ok?: boolean;
  /** Raw wallet result on success — passed through verbatim from the SDK. */
  result?: unknown;
  error?: string;
}

export interface MppProbeRequestDetail {
  type: 'request';
  paymentMethods: string[];
  intents: string[];
}

export function buildMppProbeRequestDetail(
  paymentMethods: readonly string[] = DEFAULT_REQUESTED_PAYMENT_METHODS,
  intents: readonly string[] = DEFAULT_REQUESTED_INTENTS,
): MppProbeRequestDetail {
  return {
    type: 'request',
    paymentMethods: [...paymentMethods],
    intents: [...intents],
  };
}