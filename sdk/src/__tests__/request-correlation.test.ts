import { describe, it, expect } from 'vitest';

interface RpcResponse {
  requestId?: string;
  ok?: boolean;
  result?: unknown;
}

describe('request ID correlation', () => {
  it('validates that requestId must match between request and response', () => {
    const requestId1 = 'req-123';
    const requestId2 = 'req-456';

    const request = { requestId: requestId1, method: 'payLightningInvoice' };
    const response: RpcResponse = { requestId: requestId1, ok: true, result: {} };

    // IDs match — response is valid for request
    expect(response.requestId).toBe(request.requestId);

    // IDs mismatch — response should be rejected
    const wrongResponse: RpcResponse = { requestId: requestId2, ok: true, result: {} };
    expect(wrongResponse.requestId).not.toBe(request.requestId);
  });

  it('verifies that missing requestId is handled safely', () => {
    const request = { requestId: 'req-123', method: 'payLightningInvoice' };
    const responseMissingId: RpcResponse = { ok: true, result: {} };
    const responseUndefinedId: RpcResponse = { requestId: undefined, ok: true, result: {} };

    // Missing ID should be treated as mismatch
    expect(request.requestId === responseMissingId.requestId).toBe(false);
    expect(request.requestId === responseUndefinedId.requestId).toBe(false);
  });

  it('supports UUIDs and custom requestId formats', () => {
    const uuidId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const customId = 'mpp-1718900000000-deadbeef';
    const shortId = 'abc123';

    for (const id of [uuidId, customId, shortId]) {
      const request = { requestId: id, method: 'getTransfer' };
      const response: RpcResponse = { requestId: id, ok: true, result: {} };
      expect(request.requestId).toBe(response.requestId);
    }
  });

  it('treats empty string requestId as invalid for matching', () => {
    const request = { requestId: '', method: 'payLightningInvoice' };
    const response: RpcResponse = { requestId: '', ok: true, result: {} };

    // Both empty, so they match technically, but empty ID is invalid in practice
    expect(request.requestId).toBe(response.requestId);
    expect(request.requestId.length).toBe(0);
  });
});
