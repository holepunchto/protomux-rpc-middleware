# Protomux RPC Router Middlewares

Collection of recommended middlewares for protomux-rpc-router to add logging, metrics, rate limiting, concurrent limiting, and request/response encoding.

## Exports

- `Logger`: Pino-based request logger middleware.
- `RateLimit`: Token-bucket rate limiter middleware with `byIp`/`byPublicKey` factories.
- `ConcurrentLimit`: Concurrency limiter for in-flight requests per key (`byIp`/`byPublicKey`).
- `encoding(options)`: Per-method codec to decode request and encode response via `compact-encoding`.
- `Stats`: Prometheus counters middleware for total requests and errors per method.
- `recommended(options)`: Precomposed stack: Stats → `Logger.DEFAULT` → `RateLimit.byIp(10, 100)` → `ConcurrentLimit.byIp(16)`. Accepts overrides via `options`.

## API

### `recommended(options)`

Create a composed middleware stack with sensible defaults, in order (outermost first):

Options (all optional):

- `logger`: pino logger instance used by `Logger`.
  - default: `pino({ level: 'info', name: 'protomux-rpc-router' })`
- `rateLimit` (object): configuration for `RateLimit.byIp`.
  - `rateLimit.capacity` (number): max tokens per IP bucket. Default `10`.
  - `rateLimit.intervalMs` (number): milliseconds to refill 1 token. Default `100`.
- `concurrentLimit` (object): configuration for `ConcurrentLimit.byIp`.
  - `concurrentLimit.capacity` (number): max in-flight requests per IP. Default `16`.

Example:

```js
const pino = require('pino')
const { recommended } = require('protomux-rpc-router-middlewares')

const stack = recommended({
  logger: pino({ level: 'debug', name: 'rpc' }),
  rateLimit: { capacity: 20, intervalMs: 50 },
  concurrentLimit: { capacity: 32 }
})
```

### `new Logger(logger, [options])`

Create a logging middleware using a `pino` logger.

- `logger`: a `pino` logger instance to write logs.
- `options` (optional): object configuring the middleware:
  - `options.logIp` (boolean, default `false`): include the connection IP in logs.

Statics:

- `Logger.DEFAULT`: a ready-to-use instance with `{ level: 'info', name: 'protomux-rpc-router' }`.
- `Logger.skip`: a middleware that sets `ctx.skipLog = true` to suppress logging for the request.

### `new RateLimit(capacity, intervalMs, toKey, [options])`

Low-level constructor to customize keying.

- `capacity` (number): maximum tokens per bucket.
- `intervalMs` (number): milliseconds to refill 1 token.
- `toKey(ctx)` (function): maps a `ctx` to a limiter key.
- `options` (optional): metrics options:
  - `options.promClient`: a `prom-client` module to expose metrics.
  - `options.nrRateLimitsMetricName` (string, default `'rate_limit_number_rate_limits'`): gauge name tracking number of active buckets. Use when there is multiple rate limit active.

Emits:

- `rate-limit-refilled` `(key, tokens)`: after each refill tick per key.
- `rate-limit-acquired` `(key, tokens)`: when a token is consumed.
- `rate-limit-exceeded` `(key)`: when no tokens are available.

### `RateLimit.byIp(capacity, intervalMs, [options])`

Create a token-bucket rate limiter per request IP. See constructor for parameters.

### `RateLimit.byPublicKey(capacity, intervalMs, [options])`

Create a token-bucket rate limiter per remote public key. See constructor for parameters.

### `new ConcurrentLimit(capacity, toKey)`

Low-level constructor to customize keying.

- `capacity` (number): maximum concurrent requests per key.
- `toKey(ctx)` (function): maps a `ctx` to a concurrency key.

### `ConcurrentLimit.byIp(capacity)`

Create a concurrent limiter per request IP. See constructor for parameters.

### `ConcurrentLimit.byPublicKey(capacity)`

Create a concurrent limiter per remote public key. See constructor for parameters.

### `encoding({ request, response })`

Per-method middleware to decode request and encode response using `compact-encoding` encoders.

- `request` (optional): a `compact-encoding` encoder used to decode `ctx.value` before invoking the handler.
- `response` (optional): a `compact-encoding` encoder used to encode the handler result.

### `new Stats(promClient)`

Prometheus counters middleware.

- `promClient`: the `prom-client` module to create counters.

Creates and increments:

- `protomux_rpc_total_requests{method}`
- `protomux_rpc_total_errors{method}`

## License

Apache-2.0
