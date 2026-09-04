import Redis from 'ioredis'
import { config } from './config'

export const redisPub = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null
    return Math.min(times * 200, 2_000)
  },
})

// BullMQ needs connection config not an ioredis instance
export const redisConnection = {
  host: new URL(config.redis.url).hostname,
  port: Number(new URL(config.redis.url).port) || 6379,
}

redisPub.on('error', (err) => {
  console.error('[Worker Redis] Error:', err)
})
