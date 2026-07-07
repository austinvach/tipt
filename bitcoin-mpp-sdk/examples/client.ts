import { Mppx, spark } from '../src/client/index.js'

const CLIENT_MNEMONIC = process.env.CLIENT_MNEMONIC ??
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const method = spark.charge({ mnemonic: CLIENT_MNEMONIC, network: 'regtest' })

const mppx = Mppx.create({
  polyfill: false,
  methods: [method],
})

try {
  const response = await mppx.fetch('http://localhost:3000/weather')
  console.log(response.status, await response.text())
} finally {
  await method.cleanup()
}
