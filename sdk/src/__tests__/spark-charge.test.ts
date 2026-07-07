import { describe, expect, it, vi } from 'vitest'
import { spark } from '../server/index.js'
import { ProblemDetailsError, ProblemType } from '../server/problem.js'

type FakeTransfer = {
  id: string
  status?: string
  totalValue: number
  receiverIdentityPublicKey: string
}

function createFakeStore() {
  const data = new Map<string, unknown>()
  return {
    async get(key: string) {
      return data.get(key)
    },
    async put(key: string, value: unknown) {
      data.set(key, value)
    },
    async del(key: string) {
      data.delete(key)
    },
  }
}

function createFakeWallet(options?: {
  transfer?: FakeTransfer | undefined
  receiverSparkAddress?: string
  receiverIdentityPublicKey?: string
}) {
  const transfer = options?.transfer
  const receiverSparkAddress = options?.receiverSparkAddress ?? 'sp1qreceiver'
  const receiverIdentityPublicKey = options?.receiverIdentityPublicKey ?? 'receiver-pubkey-1'

  return {
    getSparkAddress: vi.fn(async () => receiverSparkAddress),
    getIdentityPublicKey: vi.fn(async () => receiverIdentityPublicKey),
    getTransfer: vi.fn(async (id: string) => {
      if (!transfer) return undefined
      if (id !== transfer.id) return undefined
      return transfer
    }),
  }
}

function makeMethod(options?: {
  transfer?: FakeTransfer | undefined
  receiverSparkAddress?: string
  receiverIdentityPublicKey?: string
}) {
  const store = createFakeStore()
  const wallet = createFakeWallet({
    transfer: options?.transfer,
    receiverSparkAddress: options?.receiverSparkAddress,
    receiverIdentityPublicKey: options?.receiverIdentityPublicKey,
  })

  const method = spark.spark({
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    wallet: wallet as never,
    store: store as never,
  })

  return { method, store, wallet }
}

function makeCredential(parameters: {
  transferId: string
  amount: string
  receiverIdentityPublicKey: string
  receiverSparkAddress?: string
}) {
  return {
    payload: { transferId: parameters.transferId },
    challenge: {
      request: {
        amount: parameters.amount,
        currency: 'sat',
        methodDetails: {
          receiverSparkAddress: parameters.receiverSparkAddress ?? 'sp1qreceiver',
          receiverIdentityPublicKey: parameters.receiverIdentityPublicKey,
        },
      },
    },
  }
}

describe('spark charge (server)', () => {
  it('issues spark challenge details and verifies a settled transfer', async () => {
    const transfer: FakeTransfer = {
      id: 'transfer-1',
      status: 'TRANSFER_COMPLETED',
      totalValue: 1234,
      receiverIdentityPublicKey: 'receiver-pubkey-1',
    }
    const { method } = makeMethod({ transfer })

    const requestOut = await method.request?.({
      request: {
        amount: '1234',
        currency: 'sat',
        methodDetails: { receiverSparkAddress: '' },
      },
      credential: null,
    } as never)

    expect(requestOut?.methodDetails?.receiverSparkAddress).toBe('sp1qreceiver')
    expect(requestOut?.methodDetails?.receiverIdentityPublicKey).toBe('receiver-pubkey-1')

    const receipt = await method.verify({
      request: { amount: '1234', currency: 'sat', methodDetails: { receiverSparkAddress: '' } },
      credential: makeCredential({
        transferId: 'transfer-1',
        amount: '1234',
        receiverIdentityPublicKey: 'receiver-pubkey-1',
      }),
    } as never) as { method: string; reference: string; status: string }

    expect(receipt.method).toBe('spark')
    expect(receipt.reference).toBe('transfer-1')
    expect(receipt.status).toBe('success')
  })

  it('rejects replayed transfer ids', async () => {
    const transfer: FakeTransfer = {
      id: 'transfer-2',
      status: 'TRANSFER_COMPLETED',
      totalValue: 999,
      receiverIdentityPublicKey: 'receiver-pubkey-1',
    }
    const { method } = makeMethod({ transfer })

    await method.verify({
      request: { amount: '999', currency: 'sat', methodDetails: { receiverSparkAddress: '' } },
      credential: makeCredential({
        transferId: 'transfer-2',
        amount: '999',
        receiverIdentityPublicKey: 'receiver-pubkey-1',
      }),
    } as never)

    await expect(method.verify({
      request: { amount: '999', currency: 'sat', methodDetails: { receiverSparkAddress: '' } },
      credential: makeCredential({
        transferId: 'transfer-2',
        amount: '999',
        receiverIdentityPublicKey: 'receiver-pubkey-1',
      }),
    } as never)).rejects.toMatchObject({
      type: ProblemType.PreimageConsumed,
    } as Partial<ProblemDetailsError>)
  })

  it('rejects failed transfer status', async () => {
    const transfer: FakeTransfer = {
      id: 'transfer-3',
      status: 'FAILED',
      totalValue: 500,
      receiverIdentityPublicKey: 'receiver-pubkey-1',
    }
    const { method } = makeMethod({ transfer })

    await expect(method.verify({
      request: { amount: '500', currency: 'sat', methodDetails: { receiverSparkAddress: '' } },
      credential: makeCredential({
        transferId: 'transfer-3',
        amount: '500',
        receiverIdentityPublicKey: 'receiver-pubkey-1',
      }),
    } as never)).rejects.toMatchObject({
      type: ProblemType.InvalidPreimage,
      status: 422,
    } as Partial<ProblemDetailsError>)
  })

  it('rejects receiver mismatch', async () => {
    const transfer: FakeTransfer = {
      id: 'transfer-4',
      status: 'TRANSFER_COMPLETED',
      totalValue: 700,
      receiverIdentityPublicKey: 'receiver-pubkey-other',
    }
    const { method } = makeMethod({ transfer, receiverIdentityPublicKey: 'receiver-pubkey-1' })

    await expect(method.verify({
      request: { amount: '700', currency: 'sat', methodDetails: { receiverSparkAddress: '' } },
      credential: makeCredential({
        transferId: 'transfer-4',
        amount: '700',
        receiverIdentityPublicKey: 'receiver-pubkey-1',
      }),
    } as never)).rejects.toMatchObject({
      type: ProblemType.InvalidPreimage,
      status: 400,
    } as Partial<ProblemDetailsError>)
  })

  it('rejects amount mismatch', async () => {
    const transfer: FakeTransfer = {
      id: 'transfer-5',
      status: 'TRANSFER_COMPLETED',
      totalValue: 888,
      receiverIdentityPublicKey: 'receiver-pubkey-1',
    }
    const { method } = makeMethod({ transfer })

    await expect(method.verify({
      request: { amount: '999', currency: 'sat', methodDetails: { receiverSparkAddress: '' } },
      credential: makeCredential({
        transferId: 'transfer-5',
        amount: '999',
        receiverIdentityPublicKey: 'receiver-pubkey-1',
      }),
    } as never)).rejects.toMatchObject({
      type: ProblemType.InvalidPreimage,
      status: 400,
    } as Partial<ProblemDetailsError>)
  })
})
