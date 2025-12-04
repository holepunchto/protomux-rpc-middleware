const getTestnet = require('hyperdht/testnet')
const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')
const cenc = require('compact-encoding')
const b4a = require('b4a')
const sodium = require('sodium-universal')

exports.setUpNetwork = async (t) => {
  const testnet = await getTestnet()
  t.teardown(async () => {
    await testnet.destroy()
  })
  return { bootstrap: testnet.bootstrap }
}

exports.setUpServer = async (t, bootstrap, router) => {
  const serverDht = new HyperDHT({ bootstrap })
  t.teardown(async () => {
    await serverDht.destroy()
  })
  const server = serverDht.createServer()
  server.on('connection', async (connection) => {
    await router.handleConnection(connection)
  })
  await router.ready()
  await server.listen()
  t.teardown(async () => {
    await server.close()
  })
  return server
}

exports.simpleSetup = async (t, router) => {
  const { bootstrap } = await exports.setUpNetwork(t)
  const server = await exports.setUpServer(t, bootstrap, router)
  await router.ready()

  const clientDht = new HyperDHT({ bootstrap })
  t.teardown(async () => {
    await clientDht.destroy()
  })
  const client = new ProtomuxRpcClient(clientDht)
  t.teardown(async () => {
    await client.close()
  })
  return (
    method,
    params,
    requestOpts = { requestEncoding: cenc.raw, responseEncoding: cenc.raw }
  ) => {
    return client.makeRequest(server.address().publicKey, method, params, requestOpts)
  }
}

// borrow from hyperdht/lib/crypto.js
exports.createKeyPair = (seed) => {
  const publicKey = b4a.alloc(32)
  const secretKey = b4a.alloc(64)
  if (seed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
  else sodium.crypto_sign_keypair(publicKey, secretKey)
  return { publicKey, secretKey }
}
