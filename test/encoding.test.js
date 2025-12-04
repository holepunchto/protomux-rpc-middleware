const test = require('brittle')
const b4a = require('b4a')
const { simpleSetup: setUpTestClient } = require('./helper')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const cenc = require('compact-encoding')
const encoding = require('../lib/encoding')

test('encoding middleware decodes request before handler (cenc.string)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router
    .method('echo', async (value) => {
      // handler should see a decoded string; return Buffer
      return b4a.from(value)
    })
    .use(encoding({ request: cenc.string }))

  const makeRequest = await setUpTestClient(t, router)
  const res = await makeRequest('echo', 'foo', {
    requestEncoding: cenc.string,
    responseEncoding: cenc.raw
  })
  t.alike(res, b4a.from('foo'))
})

test('encoding middleware encodes response after handler (cenc.string)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router
    .method('echo', async (req) => {
      return b4a.toString(req)
    })
    .use(encoding({ response: cenc.string }))

  const makeRequest = await setUpTestClient(t, router)
  const res = await makeRequest('echo', b4a.from('hello'), {
    requestEncoding: cenc.raw,
    responseEncoding: cenc.string
  })
  t.alike(res, 'hello')
})

test('encoding middleware applies both request and response encoders (string)', async (t) => {
  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  router
    .method(
      'echo',

      async (req) => {
        // echo back request; response encoder should run afterwards
        return req
      }
    )
    .use(
      encoding({
        request: cenc.string,
        response: cenc.string
      })
    )

  const makeRequest = await setUpTestClient(t, router)
  const res = await makeRequest('echo', 'hello', {
    requestEncoding: cenc.string,
    responseEncoding: cenc.string
  })
  t.is(res, 'hello')
})
