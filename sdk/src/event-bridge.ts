export const MPP_EXTENSION_EVENT = 'mpp:extension';
export const MPP_CHALLENGE_EVENT = 'mpp:challenge';
export const MPP_CREDENTIAL_EVENT = 'mpp:credential';

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

export interface MppExtChallengeDetail {
  requestId: string;
  invoice: string;
  amountSats?: number;
  preferSpark?: boolean;
  includeSparkInvoice?: boolean;
  scheme: 'Payment';
  challenge: {
    id: string;
    realm: string;
    method: string;
    intent: string;
    request: string;
    expires?: string;
    opaque?: string;
  };
}

export interface MppExtCredentialDetail {
  requestId?: string;
  approved?: boolean;
  credential?: string;
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