import { db } from '../db/client'
import { BatchRepo } from '../repositories/batch.repo'
import { UrlResultRepo } from '../repositories/urlResult.repo'
import { CacheService } from './cache.service'
import { redis } from '../redis'
import { 
  enqueueUrlChecks, 
  enqueueRetryChecks 
} from '../queue/producer'
import { config } from '../config'
import type { Batch, UrlResult } from '@url-checker/shared'


export const BatchService = {

  async createBatch(urls: string[]): Promise<{
    batch: Batch
    urlResults: UrlResult[]
  }> {
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const batch = await BatchRepo.create(urls.length)

      const urlResults = await UrlResultRepo.createBulk(urls, batch.id)

      await client.query('COMMIT')

      await enqueueUrlChecks(batch.id, urlResults)
      await BatchRepo.updateStatus(batch.id, 'running')

      await CacheService.invalidateBatchList()

      return { batch, urlResults }

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  async getAllBatches(
    limit: number,
    offset: number
  ): Promise<Batch[]> {
    const cacheKey = config.cache.batchListKey
    const cached = await CacheService.get<Batch[]>(cacheKey)

    if (cached) return cached

    const batches = await BatchRepo.findAll(limit, offset)

    await CacheService.set(
      cacheKey,
      batches,
      config.cache.batchListTtl
    )

    return batches
  },

  async getBatchById(id: string): Promise<Batch | null> {
    return BatchRepo.findById(id)
  },

  async getBatchDetail(id: string): Promise<{
    batch: Batch
    results: UrlResult[]
  } | null> {
    const [batch, results] = await Promise.all([
      BatchRepo.findById(id),
      UrlResultRepo.findByBatchId(id),
    ])

    if (!batch) return null
    return { batch, results }
  },

  async cancelBatch(id: string): Promise<{
    success: boolean
    error?: string
  }> {
    const batch = await BatchRepo.findById(id)

    if (!batch) return { success: false, error: 'Batch not found' }

    if (
      batch.status === 'completed' ||
      batch.status === 'cancelled'
    ) {
      return {
        success: false,
        error: `Cannot cancel a ${batch.status} batch`,
      }
    }

    await redis.set(
      `batch:${id}:cancelled`,
      '1',
      'EX',
      3600
    )

    await UrlResultRepo.cancelPending(id)
    await BatchRepo.updateStatus(id, 'cancelled')
    await BatchRepo.recomputeCounts(id)
    await CacheService.invalidateBatchList()

    return { success: true }
  },

  async retryFailed(id: string): Promise<{
    success: boolean
    retrying?: number
    error?: string
  }> {
    const batch = await BatchRepo.findById(id)

    if (!batch) return { success: false, error: 'Batch not found' }

    if (
      batch.status === 'running' ||
      batch.status === 'pending'
    ) {
      return {
        success: false,
        error: `Cannot retry a ${batch.status} batch`,
      }
    }

    const resetResults = await UrlResultRepo.resetFailed(id)

    if (resetResults.length === 0) {
      return { success: false, error: 'No failed URLs to retry' }
    }

    await enqueueRetryChecks(id, resetResults)
    await BatchRepo.updateStatus(id, 'running')
    await redis.del(`batch:${id}:cancelled`)
    await CacheService.invalidateBatchList()

    return { success: true, retrying: resetResults.length }
  },

} as const
