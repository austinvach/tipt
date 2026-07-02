import { describe, it, expect } from 'vitest';
import {
  MPP_EXTENSION_EVENT,
  MPP_WALLET_RPC_EVENT,
  MPP_WALLET_RPC_RESPONSE_EVENT,
  MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
  DEFAULT_REQUESTED_PAYMENT_METHODS,
  DEFAULT_REQUESTED_INTENTS,
  buildMppProbeRequestDetail,
  type MppResponseDetail,
  type MppWalletRpcRequestDetail,
  type MppWalletRpcResponseDetail,
} from '../event-bridge';

describe('event-bridge constants', () => {
  it('exports stable event names', () => {
    expect(MPP_EXTENSION_EVENT).toBe('mpp:extension');
    expect(MPP_WALLET_RPC_EVENT).toBe('mpp:wallet-rpc');
    expect(MPP_WALLET_RPC_RESPONSE_EVENT).toBe('mpp:wallet-rpc-response');
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

  it('MppWalletRpcRequestDetail carries method and params', () => {
    const request: MppWalletRpcRequestDetail = {
      requestId: 'test-id-123',
      method: 'payLightningInvoice',
      params: { invoice: 'lnbc100n1p...', maxFeeSats: 100 },
    };

    expect(request.method).toBe('payLightningInvoice');
    expect(request.requestId).toBe('test-id-123');
  });

  it('MppWalletRpcRequestDetail supports read methods', () => {
    const request: MppWalletRpcRequestDetail = {
      requestId: 'read-id',
      method: 'getLightningSendRequest',
      params: { id: 'send-req-abc' },
    };

    expect(request.method).toBe('getLightningSendRequest');
  });

  it('MppWalletRpcResponseDetail carries a raw result on success', () => {
    const response: MppWalletRpcResponseDetail = {
      requestId: 'test-id-123',
      ok: true,
      result: { id: 'send-req-1', paymentPreimage: 'deadbeef' },
    };

    expect(response.ok).toBe(true);
    expect(response.result).toEqual({ id: 'send-req-1', paymentPreimage: 'deadbeef' });
  });

  it('MppWalletRpcResponseDetail carries an error on failure', () => {
    const response: MppWalletRpcResponseDetail = {
      requestId: 'test-id-123',
      ok: false,
      error: 'declined',
    };

    expect(response.ok).toBe(false);
    expect(response.error).toBe('declined');
  });
});
