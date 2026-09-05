import { Queue } from 'bullmq'
import { redis } from '../redis'
import type { UrlCheckJob } from '@url-checker/shared'

/**
 * The shared BullMQ queue instance.
 *
 * Named 'url-check' must match the worker's queue name exactly.
 * If names diverge, producer and worker operate on different queues
 * and jobs are never processed.
 * Default job options applied to every job unless overridden:
 * attempts: 3
 *   Each job is retried up to 3 times on transient failure.
 * backoff.type: 'exponential'
 *   Delay between retries doubles each time:
 *     Attempt 1 fails → wait 1000ms  → retry
 *     Attempt 2 fails → wait 2000ms  → retry
 *     Attempt 3 fails → wait 4000ms  → mark failed, stop
 *
 * removeOnComplete: 100
 *   Keep the last 100 completed jobs in Redis for debugging.
 *   Older ones are automatically deleted.
 * removeOnFail: 200
 *   Keep more failed jobs than completed — failed jobs need
 *   inspection. 200 is enough without bloating Redis.
 */


export const urlCheckQueue = new Queue<UrlCheckJob>('url-check', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

//Queue level error handler
urlCheckQueue.on('error', (err) => {
  console.error('[Queue] Infrastructure error:', err)
})

/**
 * Enqueue URL checks for a newly created batch.
 * Each job is assigned a deterministic jobId derived from the
 * url_result row's UUID:
 *  
 * BullMQ deduplicates by jobId: if a job with the same ID already
 * exists in the queue (waiting, active, or recently completed),
 * the duplicate is silently dropped.
 *
 * This protects against:
 *   - User double-clicking the submit button
 *   - Network retries sending the same POST /batches twice
 *   - Any scenario where createBatch succeeds but the client
 *     didn't receive the response and retries
 *
 * In all these cases, the URL is checked exactly once.
 *
 * Uses addBulk() instead of repeated add() calls:
 *   - addBulk = one Redis round trip for all jobs
 *   - add() in a loop = one round trip per job
 *   - For 500 URLs: 1 round trip vs 500 round trips
 *
 * @param batchId  
 * @param urlResults 
 */
export async function enqueueUrlChecks(
  batchId: string,
  urlResults: Array<{ id: string; url: string }>
): Promise<void> {
  const jobs = urlResults.map((urlResult) => ({
    name: 'check-url',
    data: {
      url_result_id: urlResult.id,
      batch_id: batchId,
      url: urlResult.url,
    } satisfies UrlCheckJob,
    opts: {
      jobId: `url-check:${urlResult.id}`,
    },
  }))

  await urlCheckQueue.addBulk(jobs)
}

export async function enqueueRetryChecks(
  batchId: string,
  urlResults: Array<{ id: string; url: string }>
): Promise<void> {
  const jobs = urlResults.map((urlResult) => ({
    name: 'check-url',
    data: {
      url_result_id: urlResult.id,
      batch_id: batchId,
      url: urlResult.url,
    } satisfies UrlCheckJob,
    // No jobId allows BullMQ to generate a unique ID
    // enables re-processing of the same url_result
  }))

  await urlCheckQueue.addBulk(jobs)
}