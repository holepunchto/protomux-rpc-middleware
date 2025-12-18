const test = require('brittle')
const b4a = require('b4a')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const { simpleSetup } = require('./helper')
const LoggerMiddleware = require('../lib/logger')

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

test('logger logs info on success', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const mockLogger = createMockLogger()
  const loggerMw = new LoggerMiddleware(mockLogger)
  router.use(loggerMw)

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('foo'))

  t.is(mockLogger.calls.length, 1)
  const entry = mockLogger.calls[0]
  t.is(entry.level, 'info')
  t.ok(entry.msg.includes('[method=echo]'))
  t.ok(entry.msg.includes('[publicKey='))
  t.ok(entry.msg.includes('succeeded'))
  t.ok(entry.msg.includes('after'))
})

test('logger logs warn on error with message and code', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const mockLogger = createMockLogger()
  const loggerMw = new LoggerMiddleware(mockLogger)
  router.use(loggerMw)

  router.method('boom', () => {
    const err = new Error('boom')
    err.code = 'E_BOOM'
    throw err
  })

  const makeRequest = await simpleSetup(t, router)
  await t.exception(async () => {
    await makeRequest('boom', b4a.from('x'))
  })

  t.is(mockLogger.calls.length, 1)
  const entry = mockLogger.calls[0]
  t.is(entry.level, 'warn')
  t.ok(entry.msg.includes('[method=boom]'), 'method in log')
  t.ok(entry.msg.includes('[requestId='), 'requestId in log')
  t.ok(entry.msg.includes('[publicKey='), 'publicKey in log')
  t.ok(entry.msg.includes('failed'), 'failed in log')
  t.ok(entry.msg.includes('[message=boom]'), 'message in log')
  t.ok(entry.msg.includes('[code=E_BOOM]'), 'code in log')
  t.ok(entry.msg.includes('after'), 'after in log')
})

test('logger includes ip when logIp=true', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const mockLogger = createMockLogger()
  const loggerMw = new LoggerMiddleware(mockLogger, { logIp: true })
  router.use(loggerMw)

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('hello'))

  t.is(mockLogger.calls.length, 1)
  const entry = mockLogger.calls[0]
  t.is(entry.level, 'info')
  t.ok(entry.msg.includes('[ip='), 'ip in log')
})

test('logger respects skip flag (no logs emitted)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const mockLogger = createMockLogger()
  const loggerMw = new LoggerMiddleware(mockLogger)
  router.use(loggerMw)

  router.method('echo', (req) => req).use(LoggerMiddleware.skip)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('ok'))

  t.is(mockLogger.calls.length, 0, 'no logs emitted')
})
