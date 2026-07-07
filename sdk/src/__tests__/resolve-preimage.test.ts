import { describe, expect, it, vi } from 'vitest'
import { resolvePreimage, type WalletLike } from '../client/utils'

function createWallet(overrides: Partial<WalletLike>): WalletLike {
  return {
    async payLightningInvoice() {
      return { id: 'unused' }
    },
    async getLightningSendRequest() {
      return null
    },
    async createLightningInvoice() {
      return { invoice: { encodedInvoice: 'lnbc1test' } }
    },
    async cleanupConnections() {
      // no-op in tests
    },
    ...overrides,
  }
}

describe('resolvePreimage', () => {
  it('returns immediate preimage from pay result (plain BOLT11 path)', async () => {
    const wallet = createWallet({})
    const result = await resolvePreimage(wallet, { paymentPreimage: 'abc123', id: 'send-1' }, 1, 1)
    expect(result).toBe('abc123')
  })

  it('resolves via getLightningSendRequest when pay result has only id', async () => {
    const getLightningSendRequest = vi.fn(async (id: string) => {
      if (id === 'send-1') {
        return { status: 'PREIMAGE_PROVIDED', paymentPreimage: 'deadbeef' }
      }
      return null
    })
    const wallet = createWallet({ getLightningSendRequest })

    const preimage = await resolvePreimage(wallet, { id: 'send-1' }, 2, 1)

    expect(preimage).toBe('deadbeef')
    expect(getLightningSendRequest).toHaveBeenCalledWith('send-1')
  })

  it('resolves spark-routed BOLT11 via transfer.userRequest.id', async () => {
    const getTransfer = vi.fn(async (id: string) => {
      if (id === 'transfer-1') {
        return {
          status: 'TRANSFER_COMPLETED',
          userRequest: { id: 'send-2' },
        }
      }
      return null
    })

    const getLightningSendRequest = vi.fn(async (id: string) => {
      if (id === 'send-2') {
        return { status: 'PREIMAGE_PROVIDED', paymentPreimage: 'spark-preimage' }
      }
      return null
    })

    const wallet = createWallet({
      getTransfer,
      getLightningSendRequest,
    })

    const preimage = await resolvePreimage(wallet, { id: 'transfer-1' }, 2, 1)

    expect(preimage).toBe('spark-preimage')
    expect(getTransfer).toHaveBeenCalledWith('transfer-1')
    expect(getLightningSendRequest).toHaveBeenCalledWith('send-2')
  })

  it('resolves spark-routed BOLT11 via transfer.userRequestId fallback', async () => {
    const getTransfer = vi.fn(async () => ({
      status: 'TRANSFER_COMPLETED',
      userRequestId: 'send-3',
    }))

    const getLightningSendRequest = vi.fn(async (id: string) => {
      if (id === 'send-3') {
        return { status: 'PREIMAGE_PROVIDED', paymentPreimage: 'spark-fallback' }
      }
      return null
    })

    const wallet = createWallet({
      getTransfer,
      getLightningSendRequest,
    })

    const preimage = await resolvePreimage(wallet, { id: 'transfer-2' }, 2, 1)
    expect(preimage).toBe('spark-fallback')
    expect(getLightningSendRequest).toHaveBeenCalledWith('send-3')
  })
})
