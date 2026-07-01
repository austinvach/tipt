# lightning-mpp-extension-sdk

Automatically routes `402 Payment Required` approvals through a compatible browser extension via a `window` event bridge.

When a server responds with a `402` Lightning payment challenge, the SDK:

1. Probes the page for a compatible extension using the `mpp:extension` event (`type: 'request'`, `paymentMethods: ['lightning']`, `intents: ['charge']`).
2. Forwards the Lightning `Payment` challenge to the extension via `mpp:challenge`.
3. Waits for the extension's `mpp:credential` response and transparently retries the original request with the returned credential.

## Installation

```bash
pnpm install lightning-mpp-extension-sdk
```

## Usage

```ts
import { createLightningMppExtensionClient } from 'lightning-mpp-extension-sdk';

const client = createLightningMppExtensionClient({
  polyfill: false,
});

const response = await client.fetch('https://api.example.com/paid-endpoint');
const data = await response.json();
```

### Options

```ts
interface CreateLightningMppExtensionClientOptions {
  /** Custom fetch implementation. Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Patch the global fetch (Mppx.create polyfill). Defaults to true. */
  polyfill?: boolean;
  /** Timeout for the extension payment approval, in ms. Defaults to 90000. */
  paymentTimeoutMs?: number;
  /** Probe for the extension before requesting credentials. Defaults to true. */
  probeExtension?: boolean;
  /** Timeout for the extension probe, in ms. Defaults to 1500. */
  extensionProbeTimeoutMs?: number;
  /** Requested payment methods advertised during extension probe. */
  paymentMethods?: string[];
  /** Requested intents advertised during extension probe. */
  intents?: string[];
  /**
   * Optional payment-routing hint forwarded to the extension challenge payload.
   * Mirrors lightning-mpp-sdk client option naming.
   */
  preferSpark?: boolean;
  /**
   * Optional invoice-generation hint forwarded to the extension challenge payload.
   * Mirrors lightning-mpp-sdk option naming.
   */
  includeSparkInvoice?: boolean;
}
```

### Extension probe utility

You can probe for extension availability and capability support without
creating an MPP client:

```ts
import { probeLightningMppExtension } from 'lightning-mpp-extension-sdk';

const response = await probeLightningMppExtension({ timeoutMs: 1500 });
console.log(response.type); // 'response'
```

If the extension includes a `protocolVersion` field in its `mpp:extension`
response, the SDK enforces compatibility with its own event-bridge protocol
version and throws on mismatch.

### Restoring global fetch

If you used the global `fetch` polyfill, restore the original implementation with:

```ts
import { restoreLightningMppExtensionFetch } from 'lightning-mpp-extension-sdk';

restoreLightningMppExtensionFetch();
```

## Requirements

- A browser `window` context (the SDK throws if `window` is unavailable).
- A compatible extension installed on the page that responds to the `mpp:extension`, `mpp:challenge`, and `mpp:credential` events.

## Build Process

Run from `sdk/`:

```bash
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run build
```

- `dev`: runs `tsup` in watch mode.
- `typecheck`: runs `tsc --noEmit`.
- `build`: creates ESM, CJS, and declaration outputs in `dist/`.

## Development

```bash
pnpm install
pnpm run build
```

## License

[MIT](./LICENSE)
