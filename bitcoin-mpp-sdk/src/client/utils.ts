import { SparkWallet } from '@buildonspark/spark-sdk'
import { NETWORK_MAP } from '../constants.js'

export { NETWORK_MAP }

export interface WalletLike {
  payLightningInvoice(params: {
    invoice: string
    maxFeeSats: number
    preferSpark?: boolean
    amountSatsToSend?: number
  }): Promise<{ paymentPreimage?: string; id?: string }>
  getLightningSendRequest(id: string): Promise<{ paymentPreimage?: string; status?: string } | null>
  createLightningInvoice(params: {
    amountSats: number
    memo: string
    expirySeconds?: number
    includeSparkInvoice?: boolean
  }): Promise<{ invoice: { encodedInvoice: string } }>
  cleanupConnections(): Promise<void>
}

export type SparkWalletLike = InstanceType<typeof SparkWallet>

export async function resolvePreimage(
  wallet: WalletLike,
  result: Awaited<ReturnType<WalletLike['payLightningInvoice']>>,
  maxAttempts = 30,
  intervalMs = 2000,
): Promise<string> {
  if ('paymentPreimage' in result && result.paymentPreimage) return result.paymentPreimage

  if (!result.id) throw new Error('Unexpected payLightningInvoice result format')

  const failureStatuses = new Set(['LIGHTNING_PAYMENT_FAILED', 'TRANSFER_FAILED', 'FAILED'])

  for (let i = 0; i < maxAttempts; i++) {
    const req = await wallet.getLightningSendRequest(result.id)
    if (req?.paymentPreimage) return req.paymentPreimage
    if (req?.status && failureStatuses.has(req.status)) {
      throw new Error(`Lightning payment failed: ${req.status}`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Timed out waiting for payment preimage')
}
