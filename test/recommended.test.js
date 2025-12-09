const test = require('brittle')
const b4a = require('b4a')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const { simpleSetup } = require('./helper')
const recommended = require('../lib/recommended')

test('recommended with default options', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router.use(recommended())

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('foo'))
})

test('recommended works with logger disabled', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router.use(
    recommended({
      logger: false
    })
  )

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('no-logger'))
})

function createMockLogger() {
  const calls = []
  return {
    calls,
    info(msg) {
      calls.push({ level: 'info', msg })
    },
    warn(msg) {
      calls.push({ level: 'warn', msg })
    }
  }
}

test('recommended uses provided logger and logs ip when enabled', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const mockLogger = createMockLogger()
  router.use(
    recommended({
      logger: { instance: mockLogger, logIp: true }
    })
  )

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('ok'))

  t.is(mockLogger.calls.length, 1)
  const entry = mockLogger.calls[0]
  t.is(entry.level, 'info')
  t.ok(entry.msg.includes('[method=echo]'))
  t.ok(entry.msg.includes('[publicKey='))
  t.ok(entry.msg.includes('succeeded'))
  t.ok(entry.msg.includes('after'))
  t.ok(entry.msg.includes('[ip='), 'ip in log')
})

test('recommended applies rateLimit override (capacity=1)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  // Disable logger for this test to focus on rate limit behavior
  router.use(
    recommended({
      logger: false,
      rateLimit: { capacity: 1, intervalMs: 1000 },
      concurrentLimit: { capacity: 16 }
    })
  )

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)

  // First request should pass
  await makeRequest('echo', b4a.from('one'))

  // Second immediate request should be rate-limited
  try {
    await makeRequest('echo', b4a.from('two'))
    t.fail('second request should have been rate-limited')
  } catch (error) {
    t.is(error.cause.code, 'RATE_LIMIT_EXCEEDED')
  }
})
