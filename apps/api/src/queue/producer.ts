import { Queue } from 'bullmq'
import { redis } from '../redis'
import type { UrlCheckJob } from '@url-checker/shared'

/**
 * Shared BullMQ queue for URL checks.
 * The queue name must match the worker configuration.
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

urlCheckQueue.on('error', (err) => {
  console.error('[Queue] Infrastructure error:', err)
})

/**
 * Enqueue URL checks for a new batch.
 *
 * A deterministic job ID prevents duplicate jobs when the same
 * request is submitted multiple times.
 *
 * addBulk() is used to enqueue all jobs in a single operation.
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

/**
 * Re-enqueue URL checks for explicit reprocessing.
 * No job ID is provided so BullMQ creates a new job.
 */
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