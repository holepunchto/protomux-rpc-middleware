const idEnc = require('hypercore-id-encoding')
const EventEmitter = require('events')

/** @typedef {import('protomux-rpc-router').RpcContext} RpcContext */
/** @typedef {import('protomux-rpc-router').NextFunction} NextFunction */

/**
 * @typedef {Object} RateLimitOptions
 * @property {typeof import('prom-client')} [promClient] - Prometheus client to use for metrics.
 * @property {string} [nrRateLimitsMetricName] - Name of the metric to use for the number of rate limits, use when multiple rate limits are used. Default is 'rate_limit_number_rate_limits'.
 */

module.exports = class RateLimit extends EventEmitter {
  /**
   * Create a per-IP rate limit middleware.
   *
   * @param {number} capacity The bucket capacity (max tokens).
   * @param {number} intervalMs Interval in milliseconds to refill 1 token.
   * @param {RateLimitOptions} [options]
   * @returns {RateLimit}
   */
  static byIp = (capacity, intervalMs, options = {}) => {
    return new RateLimit(
      capacity,
      intervalMs,
      (ctx) => {
        return ctx.connection.rawStream.remoteHost
      },
      options
    )
  }

  /**
   * Create a per-remote-public-key rate limit middleware.
   *
   * @param {number} capacity The bucket capacity (max tokens).
   * @param {number} intervalMs Interval in milliseconds to refill 1 token.
   * @returns {RateLimit}
   */
  static byPublicKey = (capacity, intervalMs, options = {}) => {
    return new RateLimit(
      capacity,
      intervalMs,
      (ctx) => {
        return idEnc.encode(ctx.connection.remotePublicKey)
      },
      options
    )
  }

  /**
   * @param {number} capacity The bucket capacity (max tokens).
   * @param {number} intervalMs Interval in milliseconds to refill 1 token.
   * @param {(ctx: RpcContext) => string} toKey Function that maps a request context to a rate-limit key.
   * @param {RateLimitOptions} [options]
   */
  constructor(
    capacity,
    intervalMs,
    toKey,
    { nrRateLimitsMetricName = 'rate_limit_number_rate_limits' } = {}
  ) {
    super()
    /** @type {Map<any, number>} */
    this._tokenMap = new Map()
    this.capacity = capacity
    this.intervalMs = intervalMs
    this._toKey = toKey
    this._timer = null
    this.destroyed = false
    this.nrRateLimitsMetricName = nrRateLimitsMetricName
  }

  registerMetrics(promClient) {
    const self = this

    new promClient.Gauge({
      name: this.nrRateLimitsMetricName,
      help: 'Current number of tokens in the rate limit bucket',
      collect() {
        this.set(self._tokenMap.size)
      }
    })
  }

  _refill() {
    this._tokenMap.forEach((tokens, key) => {
      tokens++
      if (tokens >= this.capacity) {
        // tokens is full, delete the key, this help to avoid memory leak
        this._tokenMap.delete(key)
      } else {
        this._tokenMap.set(key, tokens)
      }
      this.emit('rate-limit-refilled', key, tokens)
    })
  }

  _tryAcquire(key) {
    let tokens = this._tokenMap.get(key)
    if (tokens === undefined) {
      tokens = this.capacity
    }
    if (tokens > 0) {
      tokens--
      this._tokenMap.set(key, tokens)
      this.emit('rate-limit-acquired', key, tokens)
      return true
    } else {
      return false
    }
  }

  /**
   *
   * @param {RpcContext} ctx
   * @param {NextFunction} next
   * @returns {Promise<unknown>}
   */
  async onrequest(ctx, next) {
    if (this.destroyed) {
      throw RateLimitMiddlewareError.DESTROYED()
    }
    const key = this._toKey(ctx)
    if (!this._tryAcquire(key)) {
      this.emit('rate-limit-exceeded', key)
      throw RateLimitMiddlewareError.RATE_LIMIT_EXCEEDED()
    }
    return next()
  }

  onopen() {
    this._timer = setInterval(() => {
      this._refill()
    }, this.intervalMs)
  }

  /**
   * Destroy all underlying per-key rate limiters and clear memory.
   */
  onclose() {
    if (this.destroyed) {
      throw RateLimitMiddlewareError.DESTROYED()
    }
    this.destroyed = true
    this._tokenMap.clear()
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }
}

class RateLimitMiddlewareError extends Error {
  constructor(msg, code, fn = RateLimitMiddlewareError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'RateLimitMiddlewareError'
  }

  static DESTROYED() {
    return new RateLimitMiddlewareError(
      'The rate limit middleware is destroyed',
      'RATE_LIMIT_MIDDLEWARE_DESTROYED',
      RateLimitMiddlewareError.DESTROYED
    )
  }

  static RATE_LIMIT_EXCEEDED() {
    return new RateLimitMiddlewareError(
      'The rate limit is exceeded',
      'RATE_LIMIT_EXCEEDED',
      RateLimitMiddlewareError.RATE_LIMIT_EXCEEDED
    )
  }
}
