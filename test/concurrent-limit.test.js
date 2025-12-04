const test = require('brittle')
const b4a = require('b4a')
const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')
const { simpleSetup, setUpNetwork, setUpServer, createKeyPair } = require('./helper')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const { byPublicKey } = require('../lib/concurrent-limit')

test('concurrentLimit.byPublicKey enforces limit for same client', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  // Capacity 2, slow handler to keep requests overlapping
  router
    .method('echo', async (req) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return req
    })
    .use(byPublicKey(2))

  const makeRequest = await simpleSetup(t, router)

  {
    let successCount = 0
    let errorCount = 0

    const requestPromises = new Array(4).fill(0).map(() => {
      return makeRequest('echo', b4a.from('foo'))
        .then(() => {
          successCount++
        })
        .catch((error) => {
          t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
          errorCount++
        })
    })
    await Promise.all(requestPromises)
    t.is(successCount, 2, 'success count when 4 concurrent requests (capacity 2)')
    t.is(errorCount, 2, 'error count when 4 concurrent requests (capacity 2)')
  }

  {
    let successCount = 0
    let errorCount = 0

    // second batch after first completes; capacity resets to 2 again
    const requestPromises = new Array(4).fill(0).map(() => {
      return makeRequest('echo', b4a.from('bar'))
        .then(() => {
          successCount++
        })
        .catch((error) => {
          t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
          errorCount++
        })
    })
    await Promise.all(requestPromises)
    t.is(successCount, 2, 'success count in second batch')
    t.is(errorCount, 2, 'error count in second batch')
  }
})

test('concurrentLimit.byPublicKey isolates different clients (different public keys)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router
    .method('echo', async (req) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return req
    })
    .use(byPublicKey(2))

  const makeRequest1 = await simpleSetup(t, router)
  const makeRequest2 = await simpleSetup(t, router)

  let client1FinishedCount = 0
  let client1ErrorCount = 0
  let client2FinishedCount = 0
  let client2ErrorCount = 0

  const client1RequestPromises = new Array(4).fill(0).map(() => {
    return makeRequest1('echo', b4a.from('x'))
      .then(() => {
        client1FinishedCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
        client1ErrorCount++
      })
  })
  const client2RequestPromises = new Array(4).fill(0).map(() => {
    return makeRequest2('echo', b4a.from('y'))
      .then(() => {
        client2FinishedCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
        client2ErrorCount++
      })
  })

  await Promise.all([...client1RequestPromises, ...client2RequestPromises])
  t.is(client1FinishedCount, 2, 'client1 finished count')
  t.is(client1ErrorCount, 2, 'client1 error count')
  t.is(client2FinishedCount, 2, 'client2 finished count')
  t.is(client2ErrorCount, 2, 'client2 error count')
})

test('concurrentLimit.byPublicKey shared dht client but different keypairs', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router
    .method('echo', async (req) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return req
    })
    .use(byPublicKey(2))

  const { bootstrap } = await setUpNetwork(t)
  const server = await setUpServer(t, bootstrap, router)
  const clientDht = new HyperDHT({ bootstrap })
  t.teardown(async () => {
    await clientDht.destroy()
  })
  const keyPair1 = createKeyPair()
  const client1 = new ProtomuxRpcClient(clientDht, { keyPair: keyPair1 })
  t.teardown(async () => {
    await client1.close()
  })
  const keyPair2 = createKeyPair()
  const client2 = new ProtomuxRpcClient(clientDht, { keyPair: keyPair2 })
  t.teardown(async () => {
    await client2.close()
  })

  let client1FinishedCount = 0
  let client1ErrorCount = 0
  let client2FinishedCount = 0
  let client2ErrorCount = 0

  const client1RequestPromises = new Array(4).fill(0).map(() => {
    return client1
      .makeRequest(server.address().publicKey, 'echo', b4a.from('e'))
      .then(() => {
        client1FinishedCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
        client1ErrorCount++
      })
  })
  const client2RequestPromises = new Array(4).fill(0).map(() => {
    return client2
      .makeRequest(server.address().publicKey, 'echo', b4a.from('e'))
      .then(() => {
        client2FinishedCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
        client2ErrorCount++
      })
  })

  await Promise.all([...client1RequestPromises, ...client2RequestPromises])

  t.is(client1FinishedCount, 2, 'client1 finished count')
  t.is(client1ErrorCount, 2, 'client1 error count')
  t.is(client2FinishedCount, 2, 'client2 finished count')
  t.is(client2ErrorCount, 2, 'client2 error count')
})

test('concurrentLimit.byPublicKey different dht clients but shared keypair', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router
    .method('echo', async (req) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return req
    })
    .use(byPublicKey(2))

  const { bootstrap } = await setUpNetwork(t)
  const server = await setUpServer(t, bootstrap, router)
  const keyPair = createKeyPair()
  const clientDht1 = new HyperDHT({ bootstrap })
  t.teardown(async () => {
    await clientDht1.destroy()
  })
  const clientDht2 = new HyperDHT({ bootstrap })
  t.teardown(async () => {
    await clientDht2.destroy()
  })
  const client1 = new ProtomuxRpcClient(clientDht1, { keyPair })
  t.teardown(async () => {
    await client1.close()
  })
  const client2 = new ProtomuxRpcClient(clientDht2, { keyPair })
  t.teardown(async () => {
    await client2.close()
  })

  // we dont really sure which client will succeed, so we count both
  let successCount = 0
  let errorCount = 0

  const client1RequestPromises = new Array(4).fill(0).map(() => {
    return client1
      .makeRequest(server.address().publicKey, 'echo', b4a.from('e'))
      .then(() => {
        successCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
        errorCount++
      })
  })
  const client2RequestPromises = new Array(4).fill(0).map(() => {
    return client2
      .makeRequest(server.address().publicKey, 'echo', b4a.from('e'))
      .then(() => {
        successCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'CONCURRENT_LIMIT_EXCEEDED')
        errorCount++
      })
  })

  await Promise.all([...client1RequestPromises, ...client2RequestPromises])

  t.is(successCount, 2, 'success count')
  t.is(errorCount, 6, 'error count')
})
