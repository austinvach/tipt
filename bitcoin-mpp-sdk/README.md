# bitcoin-mpp-sdk

Thin Bitcoin payment method support for MPP using Spark wallets.

## Required defaults
- Payment method name: `bitcoin`
- Spark invoice generation: `includeSparkInvoice` defaults to `true`
- Invoice payment: `preferSpark` defaults to `true`

## Install

```bash
npm install bitcoin-mpp-sdk mppx @buildonspark/spark-sdk
```

## Publishing

```bash
npm run prepublishOnly
npm publish --access public
```

## Server

```ts
import { Mppx, spark } from 'bitcoin-mpp-sdk/server'

const mppx = Mppx.create({
  methods: [spark.charge({ mnemonic: process.env.MNEMONIC! })],
  secretKey: process.env.MPP_SECRET_KEY!,
})

export async function handler(request: Request): Promise<Response> {
  const result = await mppx.charge({ amount: '100', currency: 'sat' })(request)
  if (result.status === 402) return result.challenge
  return result.withReceipt(Response.json({ ok: true }))
}
```

## Client

```ts
import { Mppx, spark } from 'bitcoin-mpp-sdk/client'

const method = spark.charge({ mnemonic: process.env.MNEMONIC! })
const mppx = Mppx.create({ methods: [method] })

try {
  const response = await mppx.fetch('https://api.example.com/paid')
  console.log(await response.json())
} finally {
  await method.cleanup()
}
```
