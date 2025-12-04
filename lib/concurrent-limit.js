const idEnc = require('hypercore-id-encoding')
const { Middleware } = require('protomux-rpc-router')

/** @typedef {import('..').RpcContext} RpcContext */
/** @typedef {import('..').NextFunction} NextFunction */

module.exports = class ConcurrentLimitMiddleware extends Middleware {
  /**
   * Create a per-IP concurrent limit middleware.
   *
   * @param {number} capacity The concurrent limit capacity.
   * @returns {ConcurrentLimitMiddleware}
   */
  static byIp = (capacity) => {
    return new ConcurrentLimitMiddleware(capacity, (ctx) => {
      return ctx.connection.rawStream.remoteHost
    })
  }

  /**
   * Create a per-remote-public-key concurrent limit middleware.
   *
   * @param {number} capacity The concurrent limit capacity.
   * @returns {ConcurrentLimitMiddleware}
   */
  static byPublicKey = (capacity) => {
    return new ConcurrentLimitMiddleware(capacity, (ctx) => {
      return idEnc.encode(ctx.connection.remotePublicKey)
    })
  }

  /**
   * @param {number} capacity The concurrent limit capacity.
   * @param {(ctx: RpcContext) => any} toKey Function that maps a request context to a concurrent limit key.
   */
  constructor(capacity, toKey) {
    super()
    /** @type {Map<any, number>} */
    this._activeMap = new Map()
    this._capacity = capacity
    this._toKey = toKey
    this.destroyed = false
  }

  _release(key) {
    let active = this._activeMap.get(key)
    // should not happen, but just in case
    if (active === undefined) {
      return
    }
    active--
    if (active === 0) {
      this._activeMap.delete(key)
    } else {
      this._activeMap.set(key, active)
    }
  }

  _tryAcquire(key) {
    let active = this._activeMap.get(key)
    if (active === undefined) {
      active = 0
    }
    if (active < this._capacity) {
      active++
      this._activeMap.set(key, active)
      return true
    } else {
      return false
    }
  }

  /**
   * Router middleware entrypoint that waits until a token is available
   * for the computed key, then calls the next middleware/handler.
   *
   * @param {RpcContext} ctx
   * @param {NextFunction} next
   * @returns {Promise<unknown>}
   */
  async onrequest(ctx, next) {
    if (this.destroyed) {
      throw ConcurrentLimitMiddlewareError.DESTROYED()
    }
    const key = this._toKey(ctx)
    if (!this._tryAcquire(key)) {
      throw ConcurrentLimitMiddlewareError.CONCURRENT_LIMIT_EXCEEDED()
    }
    try {
      return await next()
    } finally {
      this._release(key)
    }
  }

  onopen() {
    // no-op
  }

  /**
   * Destroy all underlying per-key rate limiters and clear memory.
   */
  onclose() {
    if (this.destroyed) {
      throw ConcurrentLimitMiddlewareError.DESTROYED()
    }
    this.destroyed = true
    this._activeMap.clear()
  }
}

class ConcurrentLimitMiddlewareError extends Error {
  constructor(msg, code, fn = ConcurrentLimitMiddlewareError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'ConcurrentLimitMiddlewareError'
  }

  static DESTROYED() {
    return new ConcurrentLimitMiddlewareError(
      'The concurrent limit middleware is destroyed',
      'CONCURRENT_LIMIT_MIDDLEWARE_DESTROYED',
      ConcurrentLimitMiddlewareError.DESTROYED
    )
  }

  static CONCURRENT_LIMIT_EXCEEDED() {
    return new ConcurrentLimitMiddlewareError(
      'The concurrent limit is exceeded',
      'CONCURRENT_LIMIT_EXCEEDED',
      ConcurrentLimitMiddlewareError.CONCURRENT_LIMIT_EXCEEDED
    )
  }
}
