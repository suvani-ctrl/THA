import { Worker } from 'bullmq'
import { processUrl } from './processor'
import { redisConnection, redisPub } from './redis'
import { db } from './db'
import { config } from './config'
import type { UrlCheckJob } from '@url-checker/shared'

const worker = new Worker<UrlCheckJob>(
  config.worker.queueName,
  processUrl,
  {
    connection: redisConnection,
    concurrency: config.worker.concurrency,
    limiter: config.worker.rateLimit,
  }
)

worker.on('completed', (job) => {
  console.log(`[Worker] ✓ ${job.data.url}`)
})

worker.on('failed', (job, err) => {
  console.error(`[Worker] ✗ ${job?.data.url} — ${err.message}`)
})

worker.on('error', (err) => {
  console.error('[Worker] Error:', err)
})

console.log('[Worker] Started')
console.log(`[Worker] Concurrency: ${config.worker.concurrency}`)
console.log(`[Worker] Rate limit: ${config.worker.rateLimit.max} req/sec`)

async function shutdown(signal: string) {
  console.log(`[Worker] ${signal} received. Shutting down...`)
  try {
    await worker.close()
    await db.end()
    await redisPub.quit()
    process.exit(0)
  } catch (err) {
    console.error('[Worker] Shutdown error:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Unhandled rejection:', reason)
  process.exit(1)
})
