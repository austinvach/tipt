# lightning-mpp-extension-sdk

Automatically routes `402 Payment Required` approvals through a compatible browser extension via a `window` event bridge.

The extension is a **thin wallet-RPC passthrough**: it pays (after user approval)
and answers read-only follow-ups, while this SDK and
[`@buildonspark/lightning-mpp-sdk`](https://www.npmjs.com/package/@buildonspark/lightning-mpp-sdk)
own invoice verification, preimage resolution, and credential serialization.

When a server responds with a `402` Lightning payment challenge, the SDK:

1. Probes the page for a compatible extension using the `mpp:extension` event (`type: 'request'`, `paymentMethods: ['lightning']`, `intents: ['charge']`).
2. Builds a wallet proxy whose calls (`payLightningInvoice`, `getLightningSendRequest`, `getTransfer`) are forwarded to the extension over the `mpp:wallet-rpc` event and answered on `mpp:wallet-rpc-response`. The wallet seed never leaves the extension.
3. Runs `@buildonspark/lightning-mpp-sdk`'s `charge` against that proxy: it pays the invoice (the extension prompts the user), resolves the preimage across both the Lightning and Spark routes, serializes the credential, and transparently retries the original request.

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
  /** Timeout for the extension `payLightningInvoice` call (includes the user
   *  approval prompt), in ms. Defaults to 90000. */
  paymentTimeoutMs?: number;
  /** Timeout for each read-only wallet RPC (getLightningSendRequest /
   *  getTransfer) used during preimage resolution, in ms. Defaults to 15000. */
  walletReadTimeoutMs?: number;
  /** Probe for the extension before paying. Defaults to true. */
  probeExtension?: boolean;
  /** Timeout for the extension probe, in ms. Defaults to 1500. */
  extensionProbeTimeoutMs?: number;
  /** Requested payment methods advertised during extension probe. */
  paymentMethods?: string[];
  /** Requested intents advertised during extension probe. */
  intents?: string[];
  /** Prefer the Spark route when paying Lightning invoices. Defaults to true. */
  preferSpark?: boolean;
  /** Maximum routing fee, in sats, passed to the wallet. */
  maxFeeSats?: number;
  /** Network to validate the invoice against ('mainnet' | 'regtest' | 'signet'). */
  network?: 'mainnet' | 'regtest' | 'signet';
  /**
   * Retained for API compatibility. The Spark route is now detected from the
   * wallet's `payLightningInvoice` result during preimage resolution, so this
   * flag no longer affects the payment flow.
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
- A compatible extension installed on the page that responds to the `mpp:extension` probe and the `mpp:wallet-rpc` / `mpp:wallet-rpc-response` wallet-RPC bridge.

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
