const { Middleware } = require('protomux-rpc-router')
const Logger = require('./logger')
const RateLimit = require('./rate-limit')
const ConcurrentLimit = require('./concurrent-limit')

/**
 * Create a recommended middleware stack.
 *
 * @param {object} [options] - Options to configure the composed middleware stack.
 * @param {object|false} [options.logger] - Logger settings passed to `Logger`.
 * @param {import('./logger').Logger} [options.logger.instance] - Logger instance to use for `Logger`. Defaults to `console`.
 * @param {boolean} [options.logger.logIp=false] - Whether to log the IP address of the request.
 * @param {object} [options.rateLimit] - Rate limiter settings passed to `RateLimit.byIp`.
 * @param {number} [options.rateLimit.capacity=10] - Max tokens per IP bucket.
 * @param {number} [options.rateLimit.intervalMs=100] - Milliseconds to refill 1 token.
 * @param {object} [options.concurrentLimit] - Concurrent limiter settings passed to `ConcurrentLimit.byIp`.
 * @param {number} [options.concurrentLimit.capacity=16] - Max in-flight requests per IP.
 * @param {typeof import('prom-client')} [options.promClient] - Prometheus client to use for metrics. Defaults to `null`.
 * @returns {Middleware}
 */
module.exports = ({
  logger = {
    instance: console,
    logIp: false
  },
  rateLimit = {
    capacity: 10,
    intervalMs: 100
  },
  concurrentLimit = {
    capacity: 16
  }
} = {}) => {
  const middlewares = []
  if (logger !== false) {
    middlewares.push(new Logger(logger.instance, { logIp: logger.logIp }))
  }
  middlewares.push(RateLimit.byIp(rateLimit.capacity, rateLimit.intervalMs))
  middlewares.push(ConcurrentLimit.byIp(concurrentLimit.capacity))
  return Middleware.compose(...middlewares)
}
