import { SparkWallet } from '@buildonspark/spark-sdk'
import { decode as decodeBolt11 } from 'light-bolt11-decoder'
import { Credential, Method, Receipt, Store } from 'mppx'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import * as Methods from '../Methods.js'
import { NETWORK_MAP } from '../constants.js'
import { ProblemDetailsError, ProblemType } from './problem.js'

function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
}

type SessionState = {
  paymentHash: string
  depositSats: number
  spent: number
  returnInvoice: string
  status: 'open' | 'closed'
  refundSats?: number
  refundStatus?: 'succeeded' | 'failed' | 'skipped'
}

async function getSessionState(store: Store.Store, sessionId: string): Promise<SessionState | null> {
  return (await store.get(storeKey(sessionId))) as SessionState | null
}

async function putSessionState(store: Store.Store, sessionId: string, state: SessionState): Promise<void> {
  await store.put(storeKey(sessionId), state)
}

export function session(parameters: session.Parameters): Method.AnyServer & {
  deduct: (sessionId: string, sats: number) => Promise<boolean>
  waitForTopUp: (sessionId: string, timeoutMs?: number) => Promise<boolean>
  serve: (options: session.serve.Options) => Response
} {
  const {
    mnemonic,
    network = 'mainnet',
    store = Store.memory(),
    unitType,
    depositAmount: configuredDepositAmount,
    idleTimeout: idleTimeoutSecs = 300,
    includeSparkInvoice = true,
    preferSpark = true,
    wallet,
  } = parameters

  const idleTimeoutMs = idleTimeoutSecs > 0 ? idleTimeoutSecs * 1000 : 0
  let walletPromise: Promise<InstanceType<typeof SparkWallet>> | null = null

  const waiters = new Map<string, Set<() => void>>()
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function notify(sessionId: string): void {
    const set = waiters.get(sessionId)
    if (!set) return
    for (const resolve of set) resolve()
    waiters.delete(sessionId)
  }

  function clearIdleTimer(sessionId: string): void {
    const timer = idleTimers.get(sessionId)
    if (!timer) return
    clearTimeout(timer)
    idleTimers.delete(sessionId)
  }

  function resetIdleTimer(sessionId: string): void {
    if (!idleTimeoutMs) return

    clearIdleTimer(sessionId)
    const timer = setTimeout(async () => {
      idleTimers.delete(sessionId)
      await closeSession(sessionId)
    }, idleTimeoutMs)
    idleTimers.set(sessionId, timer)
  }

  async function closeSession(sessionId: string): Promise<void> {
    const state = await getSessionState(store, sessionId)
    if (!state || state.status !== 'open') return

    const refundSats = Math.max(state.depositSats - state.spent, 0)
    const closedState: SessionState = { ...state, status: 'closed' }
    await putSessionState(store, sessionId, closedState)

    let refundStatus: 'succeeded' | 'failed' | 'skipped'
    if (refundSats > 0) {
      try {
        const sparkWallet = await getWallet()
        await sparkWallet.payLightningInvoice({
          invoice: state.returnInvoice,
          maxFeeSats: 100,
          amountSatsToSend: refundSats,
          preferSpark,
        })
        refundStatus = 'succeeded'
      } catch {
        refundStatus = 'failed'
      }
    } else {
      refundStatus = 'skipped'
    }

    await putSessionState(store, sessionId, { ...closedState, refundSats, refundStatus })
  }

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

  async function deduct(sessionId: string, sats: number): Promise<boolean> {
    const state = await getSessionState(store, sessionId)
    if (!state) {
      throw new ProblemDetailsError({
        type: ProblemType.SessionNotFound,
        title: 'Session Not Found',
        status: 404,
        detail: `Session not found: ${sessionId}`,
      })
    }

    if (state.status !== 'open') {
      throw new ProblemDetailsError({
        type: ProblemType.SessionClosed,
        title: 'Session Closed',
        status: 409,
        detail: 'Session is already closed',
      })
    }

    const available = state.depositSats - state.spent
    if (available < sats) return false

    await putSessionState(store, sessionId, { ...state, spent: state.spent + sats })
    resetIdleTimer(sessionId)
    return true
  }

  function waitForTopUp(sessionId: string, timeoutMs = 60_000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const onUpdate = () => {
        clearTimeout(timer)
        resolve(true)
      }

      const timer = setTimeout(() => {
        const set = waiters.get(sessionId)
        if (set) {
          set.delete(onUpdate)
          if (set.size === 0) waiters.delete(sessionId)
        }
        resolve(false)
      }, timeoutMs)

      let set = waiters.get(sessionId)
      if (!set) {
        set = new Set()
        waiters.set(sessionId, set)
      }
      set.add(onUpdate)
    })
  }

  const method = Method.toServer(Methods.session, {
    defaults: {
      currency: 'sat',
      paymentHash: '',
    },

    async request({ credential, request }) {
      if (credential) return credential.challenge.request as typeof request

      const sparkWallet = await getWallet()
      const pricePerUnit = parseInt(request.amount, 10)
      const depositSats = configuredDepositAmount ?? pricePerUnit * 20

      const { invoice } = await sparkWallet.createLightningInvoice({
        amountSats: depositSats,
        memo: request.description ?? 'Session deposit',
        includeSparkInvoice,
      })

      return {
        ...request,
        depositInvoice: invoice.encodedInvoice,
        paymentHash: invoice.paymentHash,
        depositAmount: String(depositSats),
        ...(unitType !== undefined && { unitType }),
        ...(idleTimeoutMs > 0 && { idleTimeout: String(idleTimeoutSecs) }),
      }
    },

    async verify({ credential, request }) {
      const { payload } = credential

      if (payload.action === 'open') {
        if (!request.paymentHash) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Missing Payment Hash',
            status: 422,
            detail: 'Missing paymentHash in challenge request for open action',
          })
        }

        const actualHash = bytesToHex(sha256(hexToBytes(normalizeHex(payload.preimage))))
        if (actualHash !== normalizeHex(request.paymentHash)) {
          throw new ProblemDetailsError({
            type: ProblemType.InvalidPreimage,
            title: 'Invalid Preimage',
            status: 400,
            detail: 'Invalid preimage for open action',
          })
        }

        if (!request.depositInvoice) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Missing Deposit Invoice',
            status: 422,
            detail: 'Missing depositInvoice in challenge request for open action',
          })
        }

        const depositSats = resolveInvoiceAmount(request.depositInvoice)
        const sessionId = request.paymentHash
        const pricePerUnit = parseInt(request.amount, 10)

        const openConsumedKey = `bitcoin-session:consumed:${sessionId}`
        if (await store.get(openConsumedKey)) {
          throw new ProblemDetailsError({
            type: ProblemType.DepositConsumed,
            title: 'Deposit Already Consumed',
            status: 409,
            detail: `Deposit invoice already consumed for session: ${sessionId}`,
          })
        }
        await store.put(openConsumedKey, true)

        if (depositSats < pricePerUnit) {
          throw new ProblemDetailsError({
            type: ProblemType.InsufficientDeposit,
            title: 'Insufficient Deposit',
            status: 402,
            detail: `Deposit (${depositSats} sat) is less than cost per request (${pricePerUnit} sat)`,
          })
        }

        const returnAmount = resolveInvoiceAmount(payload.returnInvoice)
        if (returnAmount !== 0) {
          throw new ProblemDetailsError({
            type: ProblemType.InvalidReturnInvoice,
            title: 'Invalid Return Invoice',
            status: 422,
            detail: `returnInvoice must not encode an amount (found ${returnAmount} sat)`,
          })
        }

        const state: SessionState = {
          paymentHash: sessionId,
          depositSats,
          spent: 0,
          returnInvoice: payload.returnInvoice,
          status: 'open',
        }

        await store.put(storeKey(sessionId), state)
        resetIdleTimer(sessionId)

        return Receipt.from({
          method: 'bitcoin',
          reference: sessionId,
          status: 'success',
          timestamp: new Date().toISOString(),
        })
      }

      if (payload.action === 'bearer') {
        const state = await getSessionState(store, payload.sessionId)
        if (!state) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Session Not Found',
            status: 404,
            detail: `Session not found: ${payload.sessionId}`,
          })
        }

        if (state.status !== 'open') {
          throw new ProblemDetailsError({
            type: ProblemType.SessionClosed,
            title: 'Session Closed',
            status: 409,
            detail: 'Session is already closed',
          })
        }

        assertPreimage(payload.preimage, state.paymentHash)
        resetIdleTimer(payload.sessionId)

        return Receipt.from({
          method: 'bitcoin',
          reference: payload.sessionId,
          status: 'success',
          timestamp: new Date().toISOString(),
        })
      }

      if (payload.action === 'topUp') {
        const state = await getSessionState(store, payload.sessionId)
        if (!state) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Session Not Found',
            status: 404,
            detail: `Session not found: ${payload.sessionId}`,
          })
        }

        if (state.status !== 'open') {
          throw new ProblemDetailsError({
            type: ProblemType.SessionClosed,
            title: 'Session Closed',
            status: 409,
            detail: 'Session is already closed',
          })
        }

        if (!request.paymentHash) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Missing Payment Hash',
            status: 422,
            detail: 'Missing paymentHash in challenge request for topUp action',
          })
        }

        const actualHash = bytesToHex(sha256(hexToBytes(normalizeHex(payload.topUpPreimage))))
        if (actualHash !== normalizeHex(request.paymentHash)) {
          throw new ProblemDetailsError({
            type: ProblemType.InvalidPreimage,
            title: 'Invalid Top-Up Preimage',
            status: 400,
            detail: 'Invalid top-up preimage for challenge payment hash',
          })
        }

        if (!request.depositInvoice) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Missing Deposit Invoice',
            status: 422,
            detail: 'Missing depositInvoice in challenge request for topUp action',
          })
        }

        const topUpSats = resolveInvoiceAmount(request.depositInvoice)

        const topUpConsumedKey = `bitcoin-session:consumed:${request.paymentHash}`
        if (await store.get(topUpConsumedKey)) {
          throw new ProblemDetailsError({
            type: ProblemType.DepositConsumed,
            title: 'Top-Up Invoice Already Consumed',
            status: 409,
            detail: 'Top-up invoice already consumed',
          })
        }
        await store.put(topUpConsumedKey, true)

        await putSessionState(store, payload.sessionId, {
          ...state,
          depositSats: state.depositSats + topUpSats,
        })

        notify(payload.sessionId)
        resetIdleTimer(payload.sessionId)

        return Receipt.from({
          method: 'bitcoin',
          reference: payload.sessionId,
          status: 'success',
          timestamp: new Date().toISOString(),
        })
      }

      if (payload.action === 'close') {
        const state = await getSessionState(store, payload.sessionId)
        if (!state) {
          throw new ProblemDetailsError({
            type: ProblemType.SessionNotFound,
            title: 'Session Not Found',
            status: 404,
            detail: `Session not found: ${payload.sessionId}`,
          })
        }

        if (state.status !== 'open') {
          throw new ProblemDetailsError({
            type: ProblemType.SessionClosed,
            title: 'Session Closed',
            status: 409,
            detail: 'Session is already closed',
          })
        }

        assertPreimage(payload.preimage, state.paymentHash)
        clearIdleTimer(payload.sessionId)
        await closeSession(payload.sessionId)

        return Receipt.from({
          method: 'bitcoin',
          reference: payload.sessionId,
          status: 'success',
          timestamp: new Date().toISOString(),
        })
      }

      throw new ProblemDetailsError({
        type: ProblemType.UnknownAction,
        title: 'Unknown Action',
        status: 400,
        detail: 'Unknown session action',
      })
    },

    async respond({ credential }) {
      if (credential.payload.action === 'topUp') {
        return Response.json({ status: 'ok' })
      }

      if (credential.payload.action === 'close') {
        const state = await getSessionState(store, credential.payload.sessionId)
        const refundSats = state?.refundSats ?? Math.max((state?.depositSats ?? 0) - (state?.spent ?? 0), 0)
        const refundStatus = state?.refundStatus ?? 'skipped'
        return Response.json({ status: 'closed', refundSats, refundStatus })
      }
    },
  })

  function serve(options: session.serve.Options): Response {
    const { request, generate, timeoutMs = 60_000 } = options

    const credential = Credential.fromRequest<{ action: string; sessionId?: string }>(request)
    const challengeRequest = credential.challenge.request as Record<string, unknown>
    const satsPerChunk = parseInt(challengeRequest.amount as string, 10)

    const sessionId = 'sessionId' in credential.payload
      ? (credential.payload.sessionId as string)
      : (challengeRequest.paymentHash as string)

    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const initialState = await getSessionState(store, sessionId)
        const sessionSpentBefore = initialState?.spent ?? 0

        let spent = 0
        let units = 0

        try {
          for await (const value of generate) {
            while (!(await deduct(sessionId, satsPerChunk))) {
              controller.enqueue(
                encoder.encode(
                  `event: payment-need-topup\ndata: ${JSON.stringify({ sessionId, balanceRequired: satsPerChunk, balanceSpent: sessionSpentBefore + spent })}\n\n`,
                ),
              )

              const resumed = await waitForTopUp(sessionId, timeoutMs)
              if (!resumed) {
                controller.enqueue(
                  encoder.encode(
                    `event: session-timeout\ndata: ${JSON.stringify({ sessionId, balanceSpent: sessionSpentBefore + spent, balanceRequired: satsPerChunk })}\n\n`,
                  ),
                )
                return
              }
            }

            spent += satsPerChunk
            units++
            controller.enqueue(encoder.encode(`data: ${value}\n\n`))
          }

          controller.enqueue(
            encoder.encode(
              `event: payment-receipt\ndata: ${JSON.stringify({ method: 'bitcoin', reference: sessionId, status: 'success', timestamp: new Date().toISOString(), spent, units })}\n\n`,
            ),
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (error) {
          controller.error(error)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  return Object.assign(method, { deduct, waitForTopUp, serve })
}

export declare namespace session {
  namespace serve {
    type Options = {
      request: Request
      generate: AsyncIterable<string>
      timeoutMs?: number
    }
  }

  type Parameters = {
    mnemonic: string
    network?: 'mainnet' | 'regtest' | 'signet'
    depositAmount?: number
    unitType?: string
    store?: Store.Store
    idleTimeout?: number
    includeSparkInvoice?: boolean
    preferSpark?: boolean
    wallet?: InstanceType<typeof SparkWallet>
  }
}

function storeKey(sessionId: string): string {
  return `bitcoin-session:${sessionId}`
}

function assertPreimage(preimage: string, expectedHash: string): void {
  const actualHash = bytesToHex(sha256(hexToBytes(normalizeHex(preimage))))
  if (actualHash !== normalizeHex(expectedHash)) {
    throw new ProblemDetailsError({
      type: ProblemType.InvalidPreimage,
      title: 'Invalid Session Credential',
      status: 400,
      detail: 'Invalid session credential: preimage does not match session',
    })
  }
}

function resolveInvoiceAmount(invoice: string): number {
  const decoded = decodeBolt11(invoice)
  const section = decoded.sections.find((value) => value.name === 'amount') as
    | { name: 'amount'; value: string }
    | undefined
  if (!section?.value) return 0
  return Number(BigInt(section.value) / 1000n)
}
