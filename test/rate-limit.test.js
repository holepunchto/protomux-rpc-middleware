const test = require('brittle')
const b4a = require('b4a')
const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')
const {
  simpleSetup,
  setUpNetwork,
  setUpServer,
  createKeyPair,
  execFileOnNetns
} = require('./helper')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const promClient = require('prom-client')
const IdEnc = require('hypercore-id-encoding')
const path = require('path')
const { byPublicKey } = require('../lib/rate-limit')
const RateLimit = require('../lib/rate-limit')

test('rateLimit.byPublicKey serializes requests for same client', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router.method('echo', (req) => req).use(byPublicKey(2, 500))

  const makeRequest = await simpleSetup(t, router)

  {
    let successCount = 0
    let errorCount = 0

    // requests first batch of 4
    const requestPromises = new Array(4).fill(0).map(() => {
      return makeRequest('echo', b4a.from('foo'))
        .then(() => {
          successCount++
        })
        .catch((error) => {
          t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
          errorCount++
        })
    })
    await Promise.all(requestPromises)
    t.is(successCount, 2, 'success count when requests first batch')
    t.is(errorCount, 2, 'error count when requests first batch')
  }

  {
    let successCount = 0
    let errorCount = 0

    // requests second batch of 4 instantly, do not wait for refill
    const requestPromises = new Array(4).fill(0).map(() => {
      return makeRequest('echo', b4a.from('foo'))
        .then(() => {
          successCount++
        })
        .catch((error) => {
          t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
          errorCount++
        })
    })
    await Promise.all(requestPromises)
    t.is(successCount, 0, 'success count when requests instantly')
    t.is(errorCount, 4, 'error count when requests instantly')
  }

  {
    let successCount = 0
    let errorCount = 0

    // wait for 500ms (1 token refill)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const requestPromises = new Array(4).fill(0).map(() => {
      return makeRequest('echo', b4a.from('foo'))
        .then(() => {
          successCount++
        })
        .catch((error) => {
          t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
          errorCount++
        })
    })
    await Promise.all(requestPromises)
    t.is(successCount, 1, 'success count when requests after 500ms (1 refill)')
    t.is(errorCount, 3, 'error count when requests after 500ms (1 refill)')
  }
})

test('rateLimit.byPublicKey isolates different clients (different public keys)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router.method('echo', (req) => req).use(byPublicKey(2, 500))

  const makeRequest1 = await simpleSetup(t, router)
  const makeRequest2 = await simpleSetup(t, router)

  let client1SuccessCount = 0
  let client1ErrorCount = 0
  let client2SuccessCount = 0
  let client2ErrorCount = 0

  const client1RequestPromises = new Array(4).fill(0).map(() => {
    return makeRequest1('echo', b4a.from('x'))
      .then(() => {
        client1SuccessCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
        client1ErrorCount++
      })
  })
  const client2RequestPromises = new Array(4).fill(0).map(() => {
    return makeRequest2('echo', b4a.from('y'))
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

test('rateLimit.byPublicKey shared dht client but different keypairs', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  // same client, two different methods each with their own limiter instance
  router.method('echo', (req) => req).use(byPublicKey(2, 500))

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

  let client1SuccessCount = 0
  let client1ErrorCount = 0
  let client2SuccessCount = 0
  let client2ErrorCount = 0

  const client1RequestPromises = new Array(4).fill(0).map(() => {
    return client1
      .makeRequest(server.address().publicKey, 'echo', b4a.from('e'))
      .then(() => {
        client1SuccessCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
        client1ErrorCount++
      })
  })
  const client2RequestPromises = new Array(4).fill(0).map(() => {
    return client2
      .makeRequest(server.address().publicKey, 'echo', b4a.from('e'))
      .then(() => {
        client2SuccessCount++
      })
      .catch((error) => {
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
        client2ErrorCount++
      })
  })

  await Promise.all([...client1RequestPromises, ...client2RequestPromises])

  t.is(client1SuccessCount, 2, 'client1 success count')
  t.is(client1ErrorCount, 2, 'client1 error count')
  t.is(client2SuccessCount, 2, 'client2 success count')
  t.is(client2ErrorCount, 2, 'client2 error count')
})

test('rateLimit.byPublicKey different dht clients but shared keypair', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  // same client, two different methods each with their own limiter instance
  router.method('echo', (req) => req).use(byPublicKey(2, 500))

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
  const client1 = new ProtomuxRpcClient(clientDht1, { keyPair: keyPair })
  t.teardown(async () => {
    await client1.close()
  })
  const client2 = new ProtomuxRpcClient(clientDht2, { keyPair: keyPair })
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
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
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
        t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
        errorCount++
      })
  })

  await Promise.all([...client1RequestPromises, ...client2RequestPromises])

  t.is(successCount, 2, 'success count')
  t.is(errorCount, 6, 'error count')
})

test('rateLimit.registerMetrics reports active buckets size', async (t) => {
  // construct directly with custom toKey
  const rateLimit = new RateLimit(2, 500, (ctx) => ctx.value)
  rateLimit.onopen()
  t.teardown(() => rateLimit.onclose())

  rateLimit.registerMetrics(promClient)

  rateLimit.onrequest({ value: 'a' }, () => {})
  rateLimit.onrequest({ value: 'a' }, () => {})
  rateLimit.onrequest({ value: 'b' }, () => {})

  for (const metric of promClient.register.getMetricsAsArray()) {
    await metric.collect()
  }

  const metrics1 = await promClient.register.metrics()
  t.ok(metrics1.includes('rate_limit_number_rate_limits 2'), 'number of active buckets is 2')

  await new Promise((resolve) => setTimeout(resolve, 600))

  for (const metric of promClient.register.getMetricsAsArray()) {
    await metric.collect()
  }

  const metrics2 = await promClient.register.metrics()
  t.ok(
    metrics2.includes('rate_limit_number_rate_limits 1'),
    'number of active buckets is 1 after 1 refill'
  )

  await new Promise((resolve) => setTimeout(resolve, 600))

  const metrics3 = await promClient.register.metrics()
  t.ok(
    metrics3.includes('rate_limit_number_rate_limits 0'),
    'number of active buckets is 0 after 2 refills'
  )
})
