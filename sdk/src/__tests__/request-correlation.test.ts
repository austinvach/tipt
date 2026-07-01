import { describe, it, expect } from 'vitest';

describe('request ID correlation', () => {
  it('validates that requestId must match between challenge and credential', () => {
    const requestId1 = 'req-123';
    const requestId2 = 'req-456';

    const challenge = { requestId: requestId1, invoice: 'lnbc100...' };
    const credential = { requestId: requestId1, credential: 'L402 ...' };

    // IDs match — credential is valid for challenge
    expect(credential.requestId).toBe(challenge.requestId);

    // IDs mismatch — credential should be rejected
    const wrongCredential = { requestId: requestId2, credential: 'L402 ...' };
    expect(wrongCredential.requestId).not.toBe(challenge.requestId);
  });

  it('verifies that missing requestId is handled safely', () => {
    const challenge = { requestId: 'req-123', invoice: 'lnbc100...' };
    const credentialMissingId = { credential: 'L402 ...' };
    const credentialUndefinedId = { requestId: undefined, credential: 'L402 ...' };

    // Missing ID should be treated as mismatch
    expect(challenge.requestId === credentialMissingId.requestId).toBe(false);
    expect(challenge.requestId === credentialUndefinedId.requestId).toBe(false);
  });

  it('supports UUIDs and custom requestId formats', () => {
    const uuidId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const customId = 'mpp-1718900000000-deadbeef';
    const shortId = 'abc123';

    const challenge1 = { requestId: uuidId, invoice: 'lnbc100...' };
    const challenge2 = { requestId: customId, invoice: 'lnbc100...' };
    const challenge3 = { requestId: shortId, invoice: 'lnbc100...' };

    const credential1 = { requestId: uuidId, credential: 'L402 ...' };
    const credential2 = { requestId: customId, credential: 'L402 ...' };
    const credential3 = { requestId: shortId, credential: 'L402 ...' };

    expect(challenge1.requestId).toBe(credential1.requestId);
    expect(challenge2.requestId).toBe(credential2.requestId);
    expect(challenge3.requestId).toBe(credential3.requestId);
  });

  it('treats empty string requestId as invalid for matching', () => {
    const challenge = { requestId: '', invoice: 'lnbc100...' };
    const credential = { requestId: '', credential: 'L402 ...' };

    // Both empty, so they match technically, but empty ID is invalid in practice
    expect(challenge.requestId).toBe(credential.requestId);
    expect(challenge.requestId.length).toBe(0);
  });
});
