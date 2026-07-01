import { describe, it, expect } from 'vitest';
import {
  MPP_EXTENSION_EVENT,
  MPP_CHALLENGE_EVENT,
  MPP_CREDENTIAL_EVENT,
  MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
  DEFAULT_REQUESTED_PAYMENT_METHODS,
  DEFAULT_REQUESTED_INTENTS,
  buildMppProbeRequestDetail,
  type MppResponseDetail,
  type MppExtChallengeDetail,
} from '../event-bridge';

describe('event-bridge constants', () => {
  it('exports stable event names', () => {
    expect(MPP_EXTENSION_EVENT).toBe('mpp:extension');
    expect(MPP_CHALLENGE_EVENT).toBe('mpp:challenge');
    expect(MPP_CREDENTIAL_EVENT).toBe('mpp:credential');
  });

  it('exports protocol version', () => {
    expect(MPP_EVENT_BRIDGE_PROTOCOL_VERSION).toBe('1.0.0');
  });

  it('exports default requested capabilities', () => {
    expect(DEFAULT_REQUESTED_PAYMENT_METHODS).toEqual(['lightning']);
    expect(DEFAULT_REQUESTED_INTENTS).toEqual(['charge']);
  });
});

describe('buildMppProbeRequestDetail', () => {
  it('builds request with defaults', () => {
    const detail = buildMppProbeRequestDetail();
    expect(detail).toEqual({
      type: 'request',
      paymentMethods: ['lightning'],
      intents: ['charge'],
    });
  });

  it('builds request with custom capabilities', () => {
    const detail = buildMppProbeRequestDetail(['spark'], ['transfer']);
    expect(detail).toEqual({
      type: 'request',
      paymentMethods: ['spark'],
      intents: ['transfer'],
    });
  });

  it('returns a new array each call', () => {
    const detail1 = buildMppProbeRequestDetail();
    const detail2 = buildMppProbeRequestDetail();
    expect(detail1.paymentMethods).not.toBe(detail2.paymentMethods);
    expect(detail1.intents).not.toBe(detail2.intents);
  });
});

describe('wire type contracts', () => {
  it('MppResponseDetail includes protocolVersion field', () => {
    const response: MppResponseDetail = {
      type: 'response',
      protocolVersion: '1.0.0',
      paymentMethods: ['lightning'],
      intents: ['charge'],
      supportsRequestedPaymentMethods: true,
      supportsRequestedIntents: true,
    };

    expect(response.protocolVersion).toBe('1.0.0');
  });

  it('MppExtChallengeDetail enforces scheme literal type', () => {
    const challenge: MppExtChallengeDetail = {
      requestId: 'test-id-123',
      invoice: 'lnbc100n1p...',
      scheme: 'Payment',
      challenge: {
        id: 'chal-id',
        realm: 'example.com',
        method: 'lightning',
        intent: 'charge',
        request: 'encoded-request',
      },
    };

    expect(challenge.scheme).toBe('Payment');
    expect(challenge.requestId).toBe('test-id-123');
  });

  it('MppExtChallengeDetail supports optional fields', () => {
    const challenge: MppExtChallengeDetail = {
      requestId: 'test-id',
      invoice: 'spark1...',
      amountSats: 1000,
      preferSpark: false,
      includeSparkInvoice: false,
      scheme: 'Payment',
      challenge: {
        id: 'chal-id',
        realm: 'example.com',
        method: 'spark-transfer',
        intent: 'transfer',
        request: 'req',
        expires: '2025-01-01T00:00:00Z',
        opaque: 'opaque-data',
      },
    };

    expect(challenge.amountSats).toBe(1000);
    expect(challenge.preferSpark).toBe(false);
    expect(challenge.includeSparkInvoice).toBe(false);
    expect(challenge.challenge.expires).toBe('2025-01-01T00:00:00Z');
  });
});
