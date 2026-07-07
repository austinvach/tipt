import { SparkWallet } from '@buildonspark/spark-sdk'
import { Credential, Method } from 'mppx'
import * as Methods from '../Methods.js'
import { NETWORK_MAP, type WalletLike } from './utils.js'

export function sparkCharge(parameters: sparkCharge.Parameters): Method.AnyClient & {
  cleanup: () => Promise<void>
} {
  const { onProgress } = parameters

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

  const method = Method.toClient(Methods.sparkCharge, {
    async createCredential({ challenge }) {
      const wallet = await getWallet()
      if (typeof wallet.transfer !== 'function') {
        throw new Error('Configured wallet does not support Spark transfer()')
      }

      const { amount, methodDetails } = challenge.request
      if (!methodDetails?.receiverSparkAddress) {
        throw new Error('Missing challenge methodDetails.receiverSparkAddress')
      }

      const amountSats = parseInt(amount, 10)
      onProgress?.({
        type: 'challenge',
        receiverSparkAddress: methodDetails.receiverSparkAddress,
        amountSats,
      })
      onProgress?.({ type: 'paying' })

      const transfer = await wallet.transfer({
        amountSats,
        receiverSparkAddress: methodDetails.receiverSparkAddress,
      })

      if (!transfer?.id) {
        throw new Error('Spark transfer did not return a transfer id')
      }

      onProgress?.({ type: 'paid', transferId: transfer.id })

      return Credential.serialize({
        challenge,
        payload: { transferId: transfer.id },
      })
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

export declare namespace sparkCharge {
  type Parameters = {
    network?: 'mainnet' | 'regtest' | 'signet'
    onProgress?: (event: ProgressEvent) => void
  } & (
    | { mnemonic: string; wallet?: undefined }
    | { wallet: WalletLike; mnemonic?: undefined }
  )

  type ProgressEvent =
    | { type: 'challenge'; receiverSparkAddress: string; amountSats: number }
    | { type: 'paying' }
    | { type: 'paid'; transferId: string }
}
