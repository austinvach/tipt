import { Mppx, spark } from '../src/client/index.js'

const CLIENT_MNEMONIC = process.env.CLIENT_MNEMONIC ??
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const method = spark.session({ mnemonic: CLIENT_MNEMONIC, network: 'regtest' })
const mppx = Mppx.create({ polyfill: false, methods: [method] })

try {
  const response = await mppx.fetch('http://localhost:3001/generate')
  console.log(response.status)
  console.log(await response.text())
} finally {
  await method.cleanup()
}
