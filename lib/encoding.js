const cenc = require('compact-encoding')
const { Middleware } = require('protomux-rpc-router')

/**
 * @typedef {import('..').Middleware} Middleware
 */

/**
 * Create a middleware that encodes request/response payloads using the provided encoders.
 *
 * The encoders follow the `compact-encoding` interface: `{ encode: (value:any) => any }`.
 *
 * @param {{ request?: any, response?: any }} [options]
 * @returns {Middleware}
 */
module.exports = function ({ request: requestEncoding, response: responseEncoding } = {}) {
  return {
    ...Middleware.NOOP,
    onrequest: async (ctx, next) => {
      if (requestEncoding) {
        ctx.value = cenc.decode(requestEncoding, ctx.value)
      }
      const res = await next()
      if (responseEncoding) {
        return cenc.encode(responseEncoding, res)
      }
      return res
    }
  }
}
