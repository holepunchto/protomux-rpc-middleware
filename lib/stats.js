const { Middleware } = require('protomux-rpc-router')

module.exports = class Stats extends Middleware {
  /**
   * @param {typeof import('prom-client')} [promClient] - Prometheus client to use for metrics.
   */
  constructor(promClient) {
    super()

    this.totalRpcRequestsCounter = new promClient.Counter({
      name: 'protomux_rpc_total_requests',
      help: 'Total number of RPC requests',
      labelNames: ['method']
    })
    this.totalErrorsCounter = new promClient.Counter({
      name: 'protomux_rpc_total_errors',
      help: 'Total number of RPC errors',
      labelNames: ['method']
    })
  }

  async onrequest(ctx, next) {
    this.totalRpcRequestsCounter.labels(ctx.method).inc()
    try {
      return await next()
    } catch (error) {
      this.totalErrorsCounter.labels(ctx.method).inc()
      throw error
    }
  }
}
