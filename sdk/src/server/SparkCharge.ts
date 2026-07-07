import { SparkWallet } from '@buildonspark/spark-sdk'
import { Method, Receipt, Store } from 'mppx'
import * as Methods from '../Methods.js'
import { NETWORK_MAP } from '../constants.js'
import { ProblemDetailsError, ProblemType } from './problem.js'

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').trim().toUpperCase()
}

export function sparkCharge(parameters: sparkCharge.Parameters): Method.AnyServer {
  const { mnemonic, network = 'mainnet', store = Store.memory(), wallet } = parameters

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

  return Method.toServer(Methods.sparkCharge, {
    defaults: {
      currency: 'sat',
      methodDetails: {
        receiverSparkAddress: '',
        receiverIdentityPublicKey: '',
      },
    },

    async request({ credential, request }) {
      if (credential) return credential.challenge.request as typeof request

      const sparkWallet = await getWallet()
      const receiverSparkAddress = await sparkWallet.getSparkAddress()
      const receiverIdentityPublicKey = await sparkWallet.getIdentityPublicKey()

      return {
        ...request,
        methodDetails: {
          receiverSparkAddress,
          receiverIdentityPublicKey,
        },
      }
    },

    async verify({ credential }) {
      const transferId = credential.payload.transferId
      const methodDetails = credential.challenge.request.methodDetails
      if (!transferId || !methodDetails?.receiverIdentityPublicKey) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Invalid Challenge',
          status: 400,
          detail: 'Missing transfer id or receiver identity in challenge method details',
        })
      }

      const consumedKey = `spark-charge:consumed:${transferId}`
      if (await store.get(consumedKey)) {
        throw new ProblemDetailsError({
          type: ProblemType.PreimageConsumed,
          title: 'Transfer Already Consumed',
          status: 409,
          detail: `Spark transfer already consumed: ${transferId}`,
        })
      }

      const sparkWallet = await getWallet()
      const transfer = await sparkWallet.getTransfer(transferId)
      if (!transfer) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Invalid Spark Transfer',
          status: 400,
          detail: 'Spark transfer could not be found',
        })
      }

      const status = normalizeStatus(transfer.status)
      const failureStatuses = new Set(['FAILED', 'TRANSFER_FAILED', 'EXPIRED', 'CANCELLED'])
      const pendingStatuses = new Set(['PENDING', 'IN_FLIGHT', 'TRANSFER_PENDING'])
      if (failureStatuses.has(status)) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Spark Transfer Failed',
          status: 422,
          detail: `Spark transfer status: ${transfer.status}`,
        })
      }
      if (pendingStatuses.has(status)) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Spark Transfer Not Settled',
          status: 409,
          detail: `Spark transfer status: ${transfer.status}`,
        })
      }

      const expectedAmount = parseInt(credential.challenge.request.amount, 10)
      if (transfer.totalValue !== expectedAmount) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Spark Transfer Amount Mismatch',
          status: 400,
          detail: `Expected ${expectedAmount} sats, got ${transfer.totalValue} sats`,
        })
      }

      if (transfer.receiverIdentityPublicKey !== methodDetails.receiverIdentityPublicKey) {
        throw new ProblemDetailsError({
          type: ProblemType.InvalidPreimage,
          title: 'Spark Transfer Receiver Mismatch',
          status: 400,
          detail: 'Spark transfer receiver does not match challenge receiver',
        })
      }

      await store.put(consumedKey, true)

      return Receipt.from({
        method: 'spark',
        reference: transferId,
        status: 'success',
        timestamp: new Date().toISOString(),
      })
    },
  })
}

export declare namespace sparkCharge {
  type Parameters = {
    mnemonic: string
    network?: 'mainnet' | 'regtest' | 'signet'
    store?: Store.Store
    wallet?: InstanceType<typeof SparkWallet>
  }
}
