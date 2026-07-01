import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeLightningMppExtension, MPP_EXTENSION_EVENT, MPP_EVENT_BRIDGE_PROTOCOL_VERSION } from '../index';

describe('probeLightningMppExtension', () => {
  let eventListeners: Record<string, Function[]> = {};

  beforeEach(() => {
    eventListeners = {};

    // Mock window.addEventListener/removeEventListener/dispatchEvent
    global.window = {
      addEventListener: (event: string, handler: Function) => {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: Function) => {
        if (eventListeners[event]) {
          eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
        }
      },
      dispatchEvent: (evt: CustomEvent) => {
        const eventType = evt.type;
        if (eventListeners[eventType]) {
          eventListeners[eventType].forEach((handler) => {
            try {
              handler(evt);
            } catch (e) {
              // Ignore handler errors
            }
          });
        }
        return true;
      },
      setTimeout: (cb: Function, ms: number) => setTimeout(cb, ms),
      clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when extension responds with matching protocol version', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 2000 });

    // Simulate extension response
    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: {
          type: 'response',
          protocolVersion: MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
          paymentMethods: ['lightning'],
          intents: ['charge'],
          supportsRequestedPaymentMethods: true,
          supportsRequestedIntents: true,
        },
      });
      window.dispatchEvent(evt);
    }, 100);

    const response = await promise;
    expect(response.type).toBe('response');
    expect(response.protocolVersion).toBe('1.0.0');
  });

  it('rejects on protocol version mismatch', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 2000 });

    // Simulate extension with incompatible protocol version
    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: {
          type: 'response',
          protocolVersion: '2.0.0', // Incompatible
          paymentMethods: ['lightning'],
          intents: ['charge'],
        },
      });
      window.dispatchEvent(evt);
    }, 100);

    await expect(promise).rejects.toThrow(/incompatible with SDK protocol version/);
  });

  it('rejects on unsupported payment methods', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 2000 });

    // Simulate extension that does not support requested methods
    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: {
          type: 'response',
          protocolVersion: MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
          supportsRequestedPaymentMethods: false,
          supportsRequestedIntents: true,
        },
      });
      window.dispatchEvent(evt);
    }, 100);

    await expect(promise).rejects.toThrow(/does not support the requested payment method/);
  });

  it('rejects on unsupported intents', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 2000 });

    // Simulate extension that does not support requested intents
    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: {
          type: 'response',
          protocolVersion: MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
          supportsRequestedPaymentMethods: true,
          supportsRequestedIntents: false,
        },
      });
      window.dispatchEvent(evt);
    }, 100);

    await expect(promise).rejects.toThrow(/does not support the requested intent/);
  });

  it('rejects on timeout', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 100 });

    // Do not dispatch response event
    await expect(promise).rejects.toThrow(/not detected on this page/);
  });

  it('accepts response without protocolVersion (backward compatible)', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 2000 });

    // Simulate older extension without protocolVersion field
    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: {
          type: 'response',
          paymentMethods: ['lightning'],
          intents: ['charge'],
          supportsRequestedPaymentMethods: true,
          supportsRequestedIntents: true,
        },
      });
      window.dispatchEvent(evt);
    }, 100);

    const response = await promise;
    expect(response.type).toBe('response');
    expect(response.protocolVersion).toBeUndefined();
  });

  it('ignores non-response events', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 100 });

    // Dispatch a request event (should be ignored)
    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: { type: 'request', paymentMethods: ['lightning'] },
      });
      window.dispatchEvent(evt);
    }, 50);

    // Should timeout since we never dispatched a proper response
    await expect(promise).rejects.toThrow(/not detected on this page/);
  });

  it('cleans up event listeners on success', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 2000 });

    setTimeout(() => {
      const evt = new CustomEvent(MPP_EXTENSION_EVENT, {
        detail: {
          type: 'response',
          protocolVersion: MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
          supportsRequestedPaymentMethods: true,
          supportsRequestedIntents: true,
        },
      });
      window.dispatchEvent(evt);
    }, 100);

    await promise;

    // Verify listener was cleaned up by checking no more handlers exist
    expect(eventListeners[MPP_EXTENSION_EVENT]?.length ?? 0).toBe(0);
  });

  it('cleans up event listeners on timeout', async () => {
    const promise = probeLightningMppExtension({ timeoutMs: 100 });

    try {
      await promise;
    } catch {
      // Expected to reject
    }

    // Verify listener was cleaned up
    expect(eventListeners[MPP_EXTENSION_EVENT]?.length ?? 0).toBe(0);
  });
});
