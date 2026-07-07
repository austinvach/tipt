import { Mppx, spark } from '../src/server/index.js'

const SERVER_MNEMONIC = process.env.SERVER_MNEMONIC ?? 'fence neck outer stuff system visa eagle gather conduct exact zero awkward'

const mppx = Mppx.create({
  methods: [spark.charge({ mnemonic: SERVER_MNEMONIC, network: 'regtest' })],
  secretKey: process.env.MPP_SECRET_KEY ?? 'dev-secret-key-change-me',
  realm: 'weather-api',
})

export async function handler(request: Request): Promise<Response> {
  const result = await mppx.charge({
    amount: '100',
    currency: 'sat',
    description: 'Weather report',
  })(request)

  if (result.status === 402) return result.challenge

  return result.withReceipt(
    Response.json({
      location: 'Los Angeles, CA',
      temperature: 78,
      unit: 'F',
      conditions: 'Sunny',
    }),
  )
}
