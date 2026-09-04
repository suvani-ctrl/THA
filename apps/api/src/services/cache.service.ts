import { redis } from '../redis'
import { config } from '../config'

export const CacheService = {

  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  },

  async invalidate(key: string): Promise<void> {
    await redis.del(key)
  },

  async invalidateBatchList(): Promise<void> {
    await redis.del(config.cache.batchListKey)
  },

} as const
