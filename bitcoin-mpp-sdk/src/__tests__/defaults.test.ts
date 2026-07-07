import assert from 'node:assert/strict'
import test from 'node:test'
import { charge as methodCharge, session as methodSession } from '../Methods.js'
import { session as clientSession } from '../client/Session.js'
import { charge as serverCharge } from '../server/Charge.js'
import { session as serverSession } from '../server/Session.js'

test('shared method names are bitcoin', () => {
  assert.equal(methodCharge.name, 'bitcoin')
  assert.equal(methodSession.name, 'bitcoin')
})

test('client session defaults preferSpark=true for deposit payment', async () => {
  let observedPreferSpark: boolean | undefined

  const method = clientSession({
    wallet: {
      async payLightningInvoice(params) {
        observedPreferSpark = params.preferSpark
        return { paymentPreimage: '11'.repeat(32) }
      },
      async getLightningSendRequest() {
        return null
      },
      async createLightningInvoice() {
        return { invoice: { encodedInvoice: 'lnbcrt1p0dummy' } }
      },
      async cleanupConnections() {},
    },
  })

  const challenge = {
    id: 'sid-preferspark',
    method: 'bitcoin',
    intent: 'session',
    request: {
      amount: '1',
      currency: 'sat',
      paymentHash: '00'.repeat(32),
      depositAmount: '10',
      depositInvoice: 'lnbcrt1p0dummy',
    },
  }

  await method.createCredential({ challenge } as any)

  assert.equal(observedPreferSpark, true)
})

test('client session defaults includeSparkInvoice=true for return invoice', async () => {
  let observedIncludeSparkInvoice: boolean | undefined

  const method = clientSession({
    wallet: {
      async payLightningInvoice() {
        return { paymentPreimage: '11'.repeat(32) }
      },
      async getLightningSendRequest() {
        return null
      },
      async createLightningInvoice(params) {
        observedIncludeSparkInvoice = params.includeSparkInvoice
        return { invoice: { encodedInvoice: 'lnbcrt1p0dummy' } }
      },
      async cleanupConnections() {},
    },
  })

  const challenge = {
    id: 'sid',
    method: 'bitcoin',
    intent: 'session',
    request: {
      amount: '1',
      currency: 'sat',
      paymentHash: 'aa'.repeat(32),
      depositAmount: '10',
      depositInvoice: 'lnbcrt1p0dummy',
    },
  }

  await method.createCredential({ challenge } as any)

  assert.equal(observedIncludeSparkInvoice, true)
})

test('server constructors default includeSparkInvoice=true', () => {
  const s1 = serverCharge({ mnemonic: 'test test test test test test test test test test test junk' })
  const s2 = serverSession({ mnemonic: 'test test test test test test test test test test test junk' })

  assert.ok(s1)
  assert.ok(s2)
})
