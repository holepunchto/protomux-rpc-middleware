const test = require('brittle')
const b4a = require('b4a')
const pino = require('pino')
const { Writable } = require('stream')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const { simpleSetup } = require('./helper')
const LoggerMiddleware = require('../lib/logger')

// Use a real Pino logger to test its JSON output and capture each log in memory.
function createLogger() {
  const entries = []
  const stream = new Writable({
    write(chunk, encoding, callback) {
      entries.push(JSON.parse(chunk.toString()))
      callback(null)
    }
  })

  return {
    entries,
    logger: pino(stream),
    close: () => new Promise((resolve) => stream.end(resolve))
  }
}

test('logger logs info on success', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const { logger, entries, close } = createLogger()
  const loggerMw = new LoggerMiddleware(logger)
  router.use(loggerMw)

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('foo'))
  await close()

  t.is(entries.length, 1)
  const entry = entries[0]
  t.is(entry.level, 30)
  t.is(entry.method, 'echo')
  t.ok(entry.requestId, 'requestId in log')
  t.ok(entry.publicKey, 'publicKey in log')
  t.ok(entry.duration >= 0, 'duration in log')
  t.is(entry.msg, 'Request succeeded')
})

test('logger logs warn on error with message and code', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const { logger, entries, close } = createLogger()
  const loggerMw = new LoggerMiddleware(logger)
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
  await close()

  t.is(entries.length, 1)
  const entry = entries[0]
  t.is(entry.level, 40)
  t.is(entry.method, 'boom', 'method in log')
  t.ok(entry.requestId, 'requestId in log')
  t.ok(entry.publicKey, 'publicKey in log')
  t.ok(entry.duration >= 0, 'duration in log')
  t.is(entry.err.message, 'boom', 'error message in log')
  t.is(entry.err.code, 'E_BOOM', 'error code in log')
  t.ok(entry.err.stack.includes('Error: boom'), 'error stack in log')
  t.is(entry.msg, 'Request failed')
})

test('logger includes ip when logIp=true', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const { logger, entries, close } = createLogger()
  const loggerMw = new LoggerMiddleware(logger, { logIp: true })
  router.use(loggerMw)

  router.method('echo', (req) => req)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('hello'))
  await close()

  t.is(entries.length, 1)
  const entry = entries[0]
  t.is(entry.level, 30)
  t.ok(entry.ip, 'ip in log')
})

test('logger respects skip flag (no logs emitted)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const { logger, entries, close } = createLogger()
  const loggerMw = new LoggerMiddleware(logger)
  router.use(loggerMw)

  router.method('echo', (req) => req).use(LoggerMiddleware.skip)

  const makeRequest = await simpleSetup(t, router)
  await makeRequest('echo', b4a.from('ok'))
  await close()

  t.is(entries.length, 0, 'no logs emitted')
})
