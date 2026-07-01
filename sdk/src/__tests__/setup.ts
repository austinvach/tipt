import { expect, afterEach, vi } from 'vitest';

// Mock window.crypto.randomUUID if needed
if (!globalThis.crypto) {
  (globalThis as any).crypto = {
    randomUUID: () => `test-uuid-${Math.random().toString(16).slice(2)}`,
  };
}

// Clean up custom events after each test
afterEach(() => {
  vi.clearAllMocks();
});
