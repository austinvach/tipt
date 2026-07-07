import { SparkWallet } from '@buildonspark/spark-sdk'
import { decode as decodeBolt11 } from 'light-bolt11-decoder'
import { Credential, Method } from 'mppx'
import * as Methods from '../Methods.js'
import { NETWORK_MAP, type WalletLike, resolvePreimage } from './utils.js'

export function charge(parameters: charge.Parameters): Method.AnyClient & {
  cleanup: () => Promise<void>
} {
  const { maxFeeSats = 100, onProgress, preferSpark = true } = parameters

  let walletPromise: Promise<WalletLike> | null = null

  function getWallet(): Promise<WalletLike> {
    if (parameters.wallet !== undefined) return Promise.resolve(parameters.wallet)

    if (!walletPromise) {
      const { mnemonic, network = 'mainnet' } = parameters as { mnemonic: string; network?: keyof typeof NETWORK_MAP }
      walletPromise = SparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK_MAP[network] },
      }).then(({ wallet }) => wallet as WalletLike)
        .catch((error) => {
          walletPromise = null
          throw error
        })
    }

    return walletPromise
  }

  const method = Method.toClient(Methods.charge, {
    async createCredential({ challenge }) {
      const wallet = await getWallet()
      const { amount, methodDetails } = challenge.request
      if (!methodDetails) throw new Error('Missing challenge methodDetails')
      const invoice = methodDetails.invoice

      const decoded = decodeBolt11(invoice)

      if (methodDetails.paymentHash) {
        const hashSection = decoded.sections.find((section) => section.name === 'payment_hash') as
          | { name: 'payment_hash'; value: string }
          | undefined

        if (hashSection && hashSection.value.toLowerCase() !== methodDetails.paymentHash.toLowerCase()) {
          throw new Error('Challenge paymentHash does not match invoice payment hash')
        }
      }

      if (parameters.network) {
        const coinSection = decoded.sections.find((section) => section.name === 'coin_network') as
          | { name: 'coin_network'; value?: { bech32: string } }
          | undefined

        const bech32ToNetwork: Record<string, string> = { bc: 'mainnet', bcrt: 'regtest', tbs: 'signet' }
        const invoiceNetwork = coinSection?.value ? bech32ToNetwork[coinSection.value.bech32] : undefined

        if (invoiceNetwork && invoiceNetwork !== parameters.network) {
          throw new Error(`Invoice network "${invoiceNetwork}" does not match configured network "${parameters.network}"`)
        }
      }

      onProgress?.({ type: 'challenge', invoice, amountSats: parseInt(amount, 10) })
      onProgress?.({ type: 'paying' })

      const result = await wallet.payLightningInvoice({
        invoice,
        maxFeeSats,
        preferSpark,
      })

      const preimage = await resolvePreimage(wallet, result)

      onProgress?.({ type: 'paid', preimage })

      return Credential.serialize({ challenge, payload: { preimage } })
    },
  })

  async function cleanup() {
    if (parameters.wallet === undefined && walletPromise) {
      const wallet = await walletPromise
      await wallet.cleanupConnections()
    }
  }

  return Object.assign(method, { cleanup })
}

export declare namespace charge {
  type Parameters = {
    network?: 'mainnet' | 'regtest' | 'signet'
    maxFeeSats?: number
    preferSpark?: boolean
    onProgress?: (event: ProgressEvent) => void
  } & (
    | { mnemonic: string; wallet?: undefined }
    | { wallet: WalletLike; mnemonic?: undefined }
  )

  type ProgressEvent =
    | { type: 'challenge'; invoice: string; amountSats: number }
    | { type: 'paying' }
    | { type: 'paid'; preimage: string }
}
