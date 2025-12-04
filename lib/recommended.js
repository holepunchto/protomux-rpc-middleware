const { Middleware } = require('protomux-rpc-router')
const PromClient = require('prom-client')
const pino = require('pino')
const Logger = require('./logger')
const RateLimit = require('./rate-limit')
const ConcurrentLimit = require('./concurrent-limit')
const Stats = require('./stats')

/**
 * Create a recommended middleware stack.
 *
 * @param {Object} [options] - Options to configure the composed middleware stack.
 * @param {typeof import('prom-client')} [options.promClient] - Prometheus client to use for `Stats`. Defaults to `require('prom-client')`.
 * @param {object} [options.logger] - Logger settings passed to `Logger`.
 * @param {import('./logger').Logger} [options.logger.instance] - Logger instance to use for `Logger`. Defaults to `pino({ level: 'info', name: 'protomux-rpc-router' })`.
 * @param {boolean} [options.logger.logIp=false] - Whether to log the IP address of the request.
 * @param {object} [options.rateLimit] - Rate limiter settings passed to `RateLimit.byIp`.
 * @param {number} [options.rateLimit.capacity=10] - Max tokens per IP bucket.
 * @param {number} [options.rateLimit.intervalMs=100] - Milliseconds to refill 1 token.
 * @param {object} [options.concurrentLimit] - Concurrent limiter settings passed to `ConcurrentLimit.byIp`.
 * @param {number} [options.concurrentLimit.capacity=16] - Max in-flight requests per IP.
 * @returns {Middleware}
 */
module.exports = ({
  logger = {
    instance: pino({ level: 'info', name: 'protomux-rpc-router' }),
    logIp: false
  },
  rateLimit = {
    capacity: 10,
    intervalMs: 100
  },
  concurrentLimit = {
    capacity: 16
  },
  promClient = PromClient
} = {}) => {
  return Middleware.compose([
    new Stats(promClient),
    new Logger(logger),
    RateLimit.byIp(rateLimit.capacity, rateLimit.intervalMs),
    ConcurrentLimit.byIp(concurrentLimit.capacity)
  ])
}
