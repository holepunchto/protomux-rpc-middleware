const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')
const IdEnc = require('hypercore-id-encoding')
const b4a = require('b4a')

async function main() {
  const bootstrap = JSON.parse(process.argv[2])
  const serverPublicKey = IdEnc.decode(process.argv[3])

  const clientDht = new HyperDHT({ bootstrap })
  const client = new ProtomuxRpcClient(clientDht)
  await client.ready()

  try {
    await client.makeRequest(serverPublicKey, 'echo', b4a.from('x'))
  } catch (error) {
    console.error(
      JSON.stringify({
        message: error.message,
        code: error.code,
        cause: error.cause ? { error: error.cause.message, code: error.cause.code } : undefined
      })
    )
    process.exit(1)
  } finally {
    await client.close()
    await clientDht.destroy()
  }
}

main()
