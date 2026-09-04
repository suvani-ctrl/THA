import { Queue } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import { config } from '../config'
import type { UrlCheckJob } from '@url-checker/shared'

const connection: ConnectionOptions = {
  host: new URL(config.redis.url).hostname,
  port: Number(new URL(config.redis.url).port) || 6379,
}

export const urlCheckQueue = new Queue<UrlCheckJob, void, string>(
  config.queue.name,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  }
)

urlCheckQueue.on('error', (err) => {
  console.error('[Queue] Error:', err)
})

export async function enqueueUrlChecks(
  batchId: string,
  urlResults: Array<{ id: string; url: string }>
): Promise<void> {
  const jobs = urlResults.map((urlResult) => ({
    name: 'check-url' as const,
    data: {
      url_result_id: urlResult.id,
      batch_id: batchId,
      url: urlResult.url,
    },
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
    name: 'check-url' as const,
    data: {
      url_result_id: urlResult.id,
      batch_id: batchId,
      url: urlResult.url,
    },
  }))

  await urlCheckQueue.addBulk(jobs)
}
