import { charge as lightningChargeMethod } from '@buildonspark/lightning-mpp-sdk';
import { Mppx } from '@buildonspark/lightning-mpp-sdk/client';
import { Method, PaymentRequest } from 'mppx';
import type { Mppx as MppxClient } from 'mppx/client';
import {
  DEFAULT_REQUESTED_INTENTS,
  DEFAULT_REQUESTED_PAYMENT_METHODS,
  MPP_CHALLENGE_EVENT,
  MPP_CREDENTIAL_EVENT,
  MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
  MPP_EXTENSION_EVENT,
  buildMppProbeRequestDetail,
  type MppExtChallengeDetail,
  type MppExtCredentialDetail,
  type MppResponseDetail,
} from './event-bridge';

const DEFAULT_PAYMENT_TIMEOUT_MS = 90_000;
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

function parseAmountSats(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
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

function requestCredentialFromExtension(
  detail: MppExtChallengeDetail,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for MPP extension payment approval.'));
    }, timeoutMs);

    const onPayResponse = (event: Event) => {
      const response = (event as CustomEvent<MppExtCredentialDetail>).detail;
      if (!response || response.requestId !== detail.requestId) return;

      cleanup();

      if (!response.approved) {
        reject(new Error(response.error ?? 'MPP extension declined payment.'));
        return;
      }
      if (!response.credential) {
        reject(new Error('MPP extension approved payment but returned no credential.'));
        return;
      }
      resolve(response.credential);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(MPP_CREDENTIAL_EVENT, onPayResponse as EventListener);
    };

    window.addEventListener(MPP_CREDENTIAL_EVENT, onPayResponse as EventListener);
    window.dispatchEvent(new CustomEvent(MPP_CHALLENGE_EVENT, { detail }));
  });
}

export interface CreateLightningMppExtensionClientOptions {
  fetch?: typeof globalThis.fetch;
  polyfill?: boolean;
  paymentTimeoutMs?: number;
  probeExtension?: boolean;
  extensionProbeTimeoutMs?: number;
  paymentMethods?: string[];
  intents?: string[];
  preferSpark?: boolean;
  includeSparkInvoice?: boolean;
}

/**
 * Creates an MPP Lightning client that routes 402 payment approvals through
 * the MPP browser extension event bridge.
 */
export function createLightningMppExtensionClient(
  options: CreateLightningMppExtensionClientOptions = {},
): MppxClient.Mppx {
  requirePageEventBridge();

  const paymentTimeoutMs = options.paymentTimeoutMs ?? DEFAULT_PAYMENT_TIMEOUT_MS;
  const extensionProbeTimeoutMs =
    options.extensionProbeTimeoutMs ?? DEFAULT_EXTENSION_PROBE_TIMEOUT_MS;

  const extensionBackedCharge = Method.toClient(lightningChargeMethod, {
    async createCredential({ challenge }) {
      if (options.probeExtension !== false) {
        await probeLightningMppExtension({
          timeoutMs: extensionProbeTimeoutMs,
          paymentMethods: options.paymentMethods,
          intents: options.intents,
        });
      }

      const invoice = challenge.request.methodDetails.invoice;
      const requestId = randomRequestId();
      const request = PaymentRequest.serialize(challenge.request);
      const opaque = challenge.opaque ? PaymentRequest.serialize(challenge.opaque) : undefined;

      return requestCredentialFromExtension(
        {
          requestId,
          invoice,
          amountSats: parseAmountSats(challenge.request.amount),
          ...(options.preferSpark !== undefined ? { preferSpark: options.preferSpark } : {}),
          ...(options.includeSparkInvoice !== undefined
            ? { includeSparkInvoice: options.includeSparkInvoice }
            : {}),
          scheme: 'Payment',
          challenge: {
            id: challenge.id,
            realm: challenge.realm,
            method: challenge.method,
            intent: challenge.intent,
            request,
            expires: challenge.expires,
            opaque,
          },
        },
        paymentTimeoutMs,
      );
    },
  });

  return Mppx.create({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    polyfill: options.polyfill ?? true,
    methods: [extensionBackedCharge],
  });
}

export function restoreLightningMppExtensionFetch(): void {
  Mppx.restore();
}
