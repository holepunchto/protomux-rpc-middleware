# Protomux RPC Router Middlewares

Collection of recommended middlewares for protomux-rpc-router to add logging, metrics, rate limiting, concurrent limiting, and request/response encoding.

## Exports

- `Logger`: Pino-based request logger middleware.
- `RateLimit`: Token-bucket rate limiter middleware with `byIp`/`byPublicKey` factories.
- `ConcurrentLimit`: Concurrency limiter for in-flight requests per key (`byIp`/`byPublicKey`).
- `encoding(options)`: Per-method codec to decode request and encode response via `compact-encoding`.
- `recommended(options)`: Precomposed stack: `Logger(console)` → `RateLimit.byIp(10, 100)` → `ConcurrentLimit.byIp(16)`. Accepts overrides via `options`.

## API

### `const stack = recommended(options)`

Create a composed middleware stack with sensible defaults, in order (outermost first):

Options (all optional):

- `logger`: (object) logger configuration
  - `logger.instance` (pino): `pino` or `console` compatible logger. default: `console`
  - `logger.logIp` (boolean): whenever or not to log IP of client
- `rateLimit` (object): configuration for `RateLimit.byIp`.
  - `rateLimit.capacity` (number): max tokens per IP bucket. Default `10`.
  - `rateLimit.intervalMs` (number): milliseconds to refill 1 token. Default `100`.
- `concurrentLimit` (object): configuration for `ConcurrentLimit.byIp`.
  - `concurrentLimit.capacity` (number): max in-flight requests per IP. Default `16`.
- `promClient`: prometheus client to use for metrics. Defaults to `null`

Example:

```js
const pino = require('pino')
const recommended = require('protomux-rpc-router-middlewares')

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

Static:

- `Logger.skip`: a middleware that sets `ctx.skipLog = true` to suppress logging for the request.

### `const rateLimit = new RateLimit(capacity, intervalMs, toKey, [options])`

Low-level constructor to customize keying.

- `capacity` (number): maximum tokens per bucket.
- `intervalMs` (number): milliseconds to refill 1 token.
- `toKey(ctx)` (function): maps a `ctx` to a limiter key.
- `options` (optional): metrics options:
  - `options.promClient`: a `prom-client` module to expose metrics.
  - `options.nrRateLimitsMetricName` (string, default `'rate_limit_number_rate_limits'`): gauge name tracking number of active buckets. Use when there is multiple rate limit active.

`rateLimit.on('rate-limit-refilled', (key, tokens) => {})`

Emitted every refill interval for each tracked key after its bucket is incremented. `tokens` is the number of tokens after refill. When the bucket reaches capacity, the `key` is limiter key.

`rateLimit.on('rate-limit-acquired', (key, tokens) => {})`

Emitted when a request successfully consumes a token. `tokens` is the remaining tokens after the acquisition.

`rateLimit.on('rate-limit-exceeded', (key) => {})`

Emitted when a request is denied because no tokens are available for the limiter key.

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

## License

Apache-2.0
