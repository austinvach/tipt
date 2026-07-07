# @tipt/sdk

Unified TIPT SDK for Spark-aware MPP flows.

This package provides:
- Client methods (`charge`, `session`) for browser apps.
- Server methods (`charge`, `session`) for issuing/verifying MPP challenges.
- Extension wallet bridge helpers so browser clients can route wallet calls through TIPT extension approval.

## Install

```bash
pnpm add @tipt/sdk mppx @buildonspark/spark-sdk
```

## Client Usage

```ts
import { Mppx, spark } from '@tipt/sdk/client'

const method = spark.charge({ mnemonic: process.env.MNEMONIC!, network: 'mainnet' })
const mppx = Mppx.create({ methods: [method], polyfill: false })

const res = await mppx.fetch('https://api.example.com/paid')
```

## Extension-Bridge Client Usage

```ts
import { createExtensionClient } from '@tipt/sdk/extension'

const mppx = createExtensionClient({
  polyfill: false,
  extensionProbeTimeoutMs: 1500,
  enableSession: true,
})

const res = await mppx.fetch('https://api.example.com/paid')
```

## Server Usage

```ts
import { Mppx, spark } from '@tipt/sdk/server'

const mppx = Mppx.create({
  methods: [spark.charge({ mnemonic: process.env.MNEMONIC! })],
  secretKey: process.env.MPP_SECRET_KEY!,
})
```

## Defaults

- Method name: `bitcoin`
- `includeSparkInvoice`: `true` by default when creating invoices
- `preferSpark`: `true` by default when paying invoices

## Build

```bash
pnpm run build
pnpm run test
```
