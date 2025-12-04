const test = require('brittle')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const safetyCatch = require('safety-catch')
const b4a = require('b4a')
const { simpleSetup } = require('./helper')
const promClient = require('prom-client')
const Stats = require('../lib/stats')

function getSumMetricValue(metrics, metricName) {
  const metric = metrics.find((m) => m.name === metricName)
  if (!metric) return 0
  return metric.values.reduce((sum, v) => sum + v.value, 0)
}

function getMetricWithLabels(metrics, metricName, matchLabels) {
  const metric = metrics.find((m) => m.name === metricName)
  if (!metric) return 0
  return (
    metric.values.find((v) => {
      for (const [k, val] of Object.entries(matchLabels)) {
        if (!v.labels || v.labels[k] !== val) return false
      }
      return true
    })?.value ?? 0
  )
}

test('stats counts total requests and errors with labels', async (t) => {
  promClient.register.clear()

  const router = new ProtomuxRpcRouter()
  t.teardown(async () => {
    await router.close()
  })

  const stats = new Stats(promClient)
  router.use(stats)

  router.method('echo-1', (value) => {
    if (b4a.toString(value) === 'boom') {
      throw new Error('boom')
    }
    return value
  })

  router.method('echo-2', async (value) => {
    if (b4a.toString(value) === 'boom') {
      throw new Error('boom')
    }
    return value
  })

  const makeRequest = await simpleSetup(t, router)

  // 4 successful, 2 failing
  await makeRequest('echo-1', b4a.from('hello')).catch(safetyCatch)
  await makeRequest('echo-1', b4a.from('hello again')).catch(safetyCatch)
  await makeRequest('echo-1', b4a.from('boom')).catch(safetyCatch)
  await makeRequest('echo-2', b4a.from('hello')).catch(safetyCatch)
  await makeRequest('echo-2', b4a.from('hello again')).catch(safetyCatch)
  await makeRequest('echo-2', b4a.from('boom')).catch(safetyCatch)

  const metrics = await promClient.register.getMetricsAsJSON()
  const totalRequests = getSumMetricValue(metrics, 'protomux_rpc_total_requests')
  t.is(totalRequests, 6, 'total requests counter')
  const totalRequestsEcho1 = getMetricWithLabels(metrics, 'protomux_rpc_total_requests', {
    method: 'echo-1'
  })
  t.is(totalRequestsEcho1, 3, 'total requests of method echo-1')
  const totalRequestsEcho2 = getMetricWithLabels(metrics, 'protomux_rpc_total_requests', {
    method: 'echo-2'
  })
  t.is(totalRequestsEcho2, 3, 'total requests of method echo-2')
  const totalErrors = getSumMetricValue(metrics, 'protomux_rpc_total_errors')
  t.is(totalErrors, 2, 'total errors counter')
  const totalErrorsEcho1 = getMetricWithLabels(metrics, 'protomux_rpc_total_errors', {
    method: 'echo-1'
  })
  t.is(totalErrorsEcho1, 1, 'total errors of method echo-1')
  const totalErrorsEcho2 = getMetricWithLabels(metrics, 'protomux_rpc_total_errors', {
    method: 'echo-2'
  })
  t.is(totalErrorsEcho2, 1, 'total errors of method echo-2')
})
