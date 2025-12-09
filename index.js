const recommended = require('./lib/recommended')

recommended.Logger = require('./lib/logger')

recommended.RateLimit = require('./lib/rate-limit')

recommended.ConcurrentLimit = require('./lib/concurrent-limit')

module.exports = recommended
