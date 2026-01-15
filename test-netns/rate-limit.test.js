const test = require('brittle')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const RateLimit = require('../lib/rate-limit')
const { setUpNetwork, setUpServer, execFileOnNetns } = require('../test/helper')
const path = require('path')
const IdEnc = require('hypercore-id-encoding')

test('rateLimit.byIp isolates different namespaces (different IP addresses)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router.method('echo', (req) => req).use(RateLimit.byIp(2, 500))

  const { bootstrap } = await setUpNetwork(t, 10, {
    // listen on bridge ip, setup in .github/scripts/setup.sh
    host: '10.200.1.1'
  })
  const server = await setUpServer(t, bootstrap, router)

  const makeRequest1 = async () =>
    await execFileOnNetns('test-net-1', path.join(__dirname, 'make-request.js'), [
      JSON.stringify(bootstrap),
      IdEnc.encode(server.address().publicKey)
    ])
  const makeRequest2 = async () =>
    await execFileOnNetns('test-net-2', path.join(__dirname, 'make-request.js'), [
      JSON.stringify(bootstrap),
      IdEnc.encode(server.address().publicKey)
    ])

  let client1SuccessCount = 0
  let client1ErrorCount = 0
  let client2SuccessCount = 0
  let client2ErrorCount = 0

  const client1RequestPromises = new Array(4).fill(0).map(() => {
    return makeRequest1()
      .then(() => {
        client1SuccessCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
        client1ErrorCount++
      })
  })
  const client2RequestPromises = new Array(4).fill(0).map(() => {
    return makeRequest2()
      .then(() => {
        client2SuccessCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
        client2ErrorCount++
      })
  })

  await Promise.all([...client1RequestPromises, ...client2RequestPromises])
  t.is(client1SuccessCount, 2, 'client1 Success count')
  t.is(client1ErrorCount, 2, 'client1 error count')
  t.is(client2SuccessCount, 2, 'client2 Success count')
  t.is(client2ErrorCount, 2, 'client2 error count')
})
