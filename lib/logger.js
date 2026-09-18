const idEnc = require('hypercore-id-encoding')
const { Middleware } = require('protomux-rpc-router')

/**
 * A simple logger interface, compatible with both pino & console
 *
 * @typedef {Object} Logger
 * @property {(bindings: object, message: string) => void} info
 * @property {(bindings: object, message: string) => void} warn
 * @property {(bindings: object, message: string) => void} error
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
        const bindings = {
          requestId: ctx.requestId,
          method: ctx.method,
          publicKey: idEnc.encode(ctx.connection.remotePublicKey),
          duration: Date.now() - startTime
        }

        if (this._logIp) {
          bindings.ip = ctx.connection?.rawStream?.remoteHost ?? 'unknown'
        }

        if (caughtError) {
          this._logger.warn({ ...bindings, err: caughtError }, 'Request failed')
        } else {
          this._logger.info(bindings, 'Request succeeded')
        }
      }
    }
  }
}
