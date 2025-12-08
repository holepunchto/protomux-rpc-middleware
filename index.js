const recommended = require('./lib/recommended')

recommended.Logger = require('./lib/logger')

recommended.RateLimit = require('./lib/rate-limit')

recommended.ConcurrentLimit = require('./lib/concurrent-limit')

recommended.encoding = require('./lib/encoding')

module.exports = recommended
