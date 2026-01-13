const idEnc = require('hypercore-id-encoding')
const { Middleware } = require('protomux-rpc-router')

/**
 * A simple logger interface, compatible with both pino & console
 *
 * @typedef {Object} Logger
 * @property {(message: string) => void} info
 * @property {(message: string) => void} warn
 * @property {(message: string) => void} error
 */

module.exports = class LoggerMiddleware extends Middleware {
  static skip = {
    ...Middleware.NOOP,
    onrequest: (ctx, next) => {
      ctx.skipLog = true
      return next()
    }
  }

  /**
   * @param {Logger} logger - Logger to use for logging.
   * @param {object} [options] - Options for the logger middleware.
   * @param {boolean} [options.logIp=false] - Whether to log the IP address of the request.
   */
  constructor(logger, { logIp = false } = {}) {
    super()
    this._logger = logger
    this._logIp = logIp
  }

  async onrequest(ctx, next) {
    let caughtError = null
    const startTime = Date.now()
    try {
      return await next()
    } catch (error) {
      caughtError = error
      throw error
    } finally {
      if (!ctx.skipLog) {
        const durationMs = Date.now() - startTime
        const publicKey = idEnc.encode(ctx.connection.remotePublicKey)
        const ipPrefix = this._logIp
          ? `[ip=${ctx.connection?.rawStream?.remoteHost ?? 'unknown'}] `
          : ''
        if (caughtError) {
          this._logger.warn(
            `${ipPrefix}[requestId=${ctx.requestId}] [method=${ctx.method}] [publicKey=${publicKey}] failed with [message=${caughtError.message}] [code=${caughtError.code}] after ${durationMs}ms`
          )
        } else {
          this._logger.info(
            `${ipPrefix}[requestId=${ctx.requestId}] [method=${ctx.method}] [publicKey=${publicKey}] succeeded after ${durationMs}ms`
          )
        }
      }
    }
  }
}
