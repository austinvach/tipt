import { SparkWallet } from '@buildonspark/spark-sdk'
import { Credential, Method } from 'mppx'
import * as Methods from '../Methods.js'
import { NETWORK_MAP, type WalletLike, resolvePreimage } from './utils.js'

type ActiveSession = {
  sessionId: string
  preimage: string
}

export function session(parameters: session.Parameters) {
  const {
    maxFeeSats = 100,
    preferSpark = true,
    includeSparkInvoice = true,
    onProgress,
  } = parameters

  let walletPromise: Promise<WalletLike> | null = null
  let activeSession: ActiveSession | null = null
  let pendingClose = false
  let pendingTopUp = false

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

  const method = Method.toClient(Methods.session, {
    async createCredential({ challenge }) {
      const wallet = await getWallet()
      const { amount, depositAmount, depositInvoice, paymentHash } = challenge.request
      if (!paymentHash) throw new Error('Missing challenge paymentHash')

      if (activeSession && pendingTopUp) {
        pendingTopUp = false
        const topUpSats = parseInt((depositAmount ?? '0') as string, 10)
        onProgress?.({ type: 'topping-up', topUpSats })

        const topUpResult = await wallet.payLightningInvoice({
          invoice: depositInvoice as string,
          maxFeeSats,
          preferSpark,
        })
        const topUpPreimage = await resolvePreimage(wallet, topUpResult)
        onProgress?.({ type: 'topped-up', topUpSats })

        return Credential.serialize({
          challenge,
          payload: {
            action: 'topUp',
            sessionId: activeSession.sessionId,
            topUpPreimage,
          },
        })
      }

      if (activeSession && pendingClose) {
        const { sessionId, preimage } = activeSession
        pendingClose = false
        activeSession = null
        return Credential.serialize({ challenge, payload: { action: 'close', sessionId, preimage } })
      }

      if (activeSession) {
        onProgress?.({ type: 'bearer', amount: parseInt(amount, 10) })
        return Credential.serialize({
          challenge,
          payload: {
            action: 'bearer',
            sessionId: activeSession.sessionId,
            preimage: activeSession.preimage,
          },
        })
      }

      const depositSats = parseInt((depositAmount ?? '0') as string, 10)
      onProgress?.({ type: 'opening', depositSats, amount: parseInt(amount, 10) })

      const [result, returnInvoiceResult] = await Promise.all([
        wallet.payLightningInvoice({
          invoice: depositInvoice as string,
          maxFeeSats,
          preferSpark,
        }),
        wallet.createLightningInvoice({
          amountSats: 0,
          memo: 'Session refund',
          expirySeconds: 60 * 60 * 24 * 30,
          includeSparkInvoice,
        }),
      ])

      const preimage = await resolvePreimage(wallet, result)
      const sessionId = paymentHash as string
      const returnInvoice = returnInvoiceResult.invoice.encodedInvoice
      activeSession = { sessionId, preimage }

      return Credential.serialize({
        challenge,
        payload: {
          action: 'open',
          preimage,
          returnInvoice,
        },
      })
    },
  })

  async function topUp(
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    url: string,
  ): Promise<Response> {
    if (!activeSession) throw new Error('No active session to top up')

    pendingTopUp = true
    try {
      return await fetch(url)
    } catch (error) {
      pendingTopUp = false
      throw error
    }
  }

  async function close(
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    url: string,
  ): Promise<Response> {
    if (!activeSession) throw new Error('No active session to close')

    pendingClose = true
    try {
      return await fetch(url)
    } catch (error) {
      pendingClose = false
      throw error
    }
  }

  async function cleanup() {
    if (parameters.wallet === undefined && walletPromise) {
      const wallet = await walletPromise
      await wallet.cleanupConnections()
    }
  }

  function getSession(): Pick<ActiveSession, 'sessionId'> | null {
    return activeSession ? { sessionId: activeSession.sessionId } : null
  }

  function resetSession(): void {
    activeSession = null
    pendingClose = false
    pendingTopUp = false
  }

  return Object.assign(method, { topUp, close, cleanup, getSession, resetSession })
}

export declare namespace session {
  type Parameters = {
    network?: 'mainnet' | 'regtest' | 'signet'
    maxFeeSats?: number
    preferSpark?: boolean
    includeSparkInvoice?: boolean
    onProgress?: (event: ProgressEvent) => void
  } & (
    | { mnemonic: string; wallet?: undefined }
    | { wallet: WalletLike; mnemonic?: undefined }
  )

  type ProgressEvent =
    | { type: 'opening'; depositSats: number; amount: number }
    | { type: 'bearer'; amount: number }
    | { type: 'topping-up'; topUpSats: number }
    | { type: 'topped-up'; topUpSats: number }
}
