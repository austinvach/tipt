import { SparkWallet } from '@buildonspark/spark-sdk'
import { decode as decodeBolt11 } from 'light-bolt11-decoder'
import { Method, Receipt, Store } from 'mppx'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import * as Methods from '../Methods.js'
import { NETWORK_MAP } from '../constants.js'
import { ProblemDetailsError, ProblemType } from './problem.js'

export function charge(parameters: charge.Parameters) {
  const {
    mnemonic,
    network = 'mainnet',
    store = Store.memory(),
    includeSparkInvoice = true,
    wallet,
  } = parameters

  let walletPromise: Promise<InstanceType<typeof SparkWallet>> | null = null

  function getWallet() {
    if (wallet) return Promise.resolve(wallet)

    if (!walletPromise) {
      walletPromise = SparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK_MAP[network] },
      }).then(({ wallet: instance }) => instance)
        .catch((error) => {
          walletPromise = null
          throw error
        })
    }

    return walletPromise
  }

  return Method.toServer(Methods.charge, {
    defaults: {
      currency: 'sat',
      methodDetails: {
        invoice: '',
        paymentHash: '',
      },
    },

    async request({ credential, request }) {
      if (credential) return credential.challenge.request as typeof request

      const sparkWallet = await getWallet()
      const amountSats = parseInt(request.amount, 10)

      const { invoice } = await sparkWallet.createLightningInvoice({
        amountSats,
        memo: request.description ?? '',
        includeSparkInvoice,
      })

      return {
        ...request,
        methodDetails: {
          invoice: invoice.encodedInvoice,
          paymentHash: invoice.paymentHash,
          network,
        },
      }
    },

    async verify({ credential }) {
      const preimage = credential.payload.preimage
      const methodDetails = credential.challenge.request.methodDetails
      if (!methodDetails?.invoice || !methodDetails.paymentHash) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Invalid Challenge',
          status: 400,
          detail: 'Missing invoice or paymentHash in challenge method details',
        })
      }

      const invoice = methodDetails.invoice
      const decoded = decodeBolt11(invoice)

      const timestampSection = decoded.sections.find((section) => section.name === 'timestamp') as
        | { name: 'timestamp'; value: number }
        | undefined

      const invoiceExpiresAt = ((timestampSection?.value ?? 0) + decoded.expiry) * 1000
      if (Date.now() > invoiceExpiresAt) {
        throw new ProblemDetailsError({
          type: ProblemType.InvoiceExpired,
          title: 'Invoice Expired',
          status: 422,
          detail: 'Lightning invoice has expired',
        })
      }

      const expectedHash = methodDetails.paymentHash
      const actualHash = bytesToHex(sha256(hexToBytes(preimage)))

      if (!expectedHash || actualHash !== expectedHash) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Invalid Preimage',
          status: 400,
          detail: 'Invalid preimage for challenge payment hash',
        })
      }

      const consumedKey = `bitcoin-charge:consumed:${actualHash}`
      if (await store.get(consumedKey)) {
        throw new ProblemDetailsError({
          type: ProblemType.PreimageConsumed,
          title: 'Preimage Already Consumed',
          status: 409,
          detail: `Preimage already consumed for payment: ${actualHash}`,
        })
      }
      await store.put(consumedKey, true)

      return Receipt.from({
        method: 'bitcoin',
        reference: actualHash,
        status: 'success',
        timestamp: new Date().toISOString(),
      })
    },
  })
}

export declare namespace charge {
  type Parameters = {
    mnemonic: string
    network?: 'mainnet' | 'regtest' | 'signet'
    store?: Store.Store
    includeSparkInvoice?: boolean
    wallet?: InstanceType<typeof SparkWallet>
  }
}
