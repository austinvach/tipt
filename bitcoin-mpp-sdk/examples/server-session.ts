import { Credential } from 'mppx'
import { Mppx, Store, spark } from '../src/server/index.js'

const SERVER_MNEMONIC = process.env.SERVER_MNEMONIC ?? 'fence neck outer stuff system visa eagle gather conduct exact zero awkward'
const SATS_PER_CHUNK = 2
const DEPOSIT_SATS = 300

const sessionMethod = spark.session({
  mnemonic: SERVER_MNEMONIC,
  network: 'regtest',
  depositAmount: DEPOSIT_SATS,
  store: Store.memory(),
})

const mppx = Mppx.create({
  methods: [sessionMethod],
  secretKey: process.env.MPP_SECRET_KEY ?? 'dev-secret-key-change-me',
  realm: 'text-gen-api',
})

export async function handler(request: Request): Promise<Response> {
  const result = await mppx.session!({
    amount: String(SATS_PER_CHUNK),
    currency: 'sat',
    description: 'LLM stream',
  })(request)

  if (result.status === 402) return result.challenge

  const cred = Credential.fromRequest<{ action: string }>(request)
  if (cred.payload.action === 'topUp' || cred.payload.action === 'close') {
    return result.withReceipt()
  }

  async function* generate() {
    const words = ['hello', 'from', 'bitcoin', 'session', 'stream']
    for (let i = 0; i < 25; i++) {
      yield JSON.stringify({ chunk: words[i % words.length], index: i })
    }
  }

  return result.withReceipt(sessionMethod.serve({ request, generate: generate() }))
}
