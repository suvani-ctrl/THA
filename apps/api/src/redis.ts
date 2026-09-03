import Redis from 'ioredis'
import { config } from './config'

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null
    return Math.min(times * 200, 2_000)
  },
})

export const redisSub = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 200, 2_000)
  },
})

redis.on('error', (err) => {
  console.error('[API Redis] Error:', err)
})

redisSub.on('error', (err) => {
  console.error('[API Redis Sub] Error:', err)
})
