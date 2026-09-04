import { redisPub } from './redis'
import { UrlCheckerService } from './services/urlChecker.service'
import { EventsPublisher } from './publishers/events.publisher'
import { UrlResultRepo } from './repositories/urlResult.repo'
import { BatchRepo } from './repositories/batch.repo'
import type { UrlCheckJob } from '@url-checker/shared'

// Processor orchestrates the job lifecycle
// It does not contain business logic itself
// It delegates to:
//   UrlCheckerService  → check the URL
//   UrlResultRepo      → update database
//   BatchRepo          → update batch counts
//   EventsPublisher    → notify API instances

export async function processUrl(
  job: { data: UrlCheckJob }
): Promise<void> {
  const { url_result_id, batch_id, url } = job.data

  // Step 1: Check cancellation before doing any work
  // API sets this Redis flag when cancel is called
  // Handles in-flight cancellation
  const cancelled = await redisPub.get(
    `batch:${batch_id}:cancelled`
  )

  if (cancelled) {
    await UrlResultRepo.markCancelled(url_result_id)
    await BatchRepo.recomputeCounts(batch_id)
    await EventsPublisher.publishUrlUpdate(batch_id, url_result_id)
    return
  }

  // Step 2: Mark as running before attempting
  // Increments attempt count — tracks retries
  await UrlResultRepo.markRunning(url_result_id)

  try {
    // Step 3: Check the URL
    // Throws on network error or timeout → BullMQ retries
    const result = await UrlCheckerService.check(url)

    // Step 4: Persist result
    await UrlResultRepo.markCompleted(
      url_result_id,
      result.statusCode,
      result.responseMs,
      result.pageTitle
    )

    // Step 5: Update batch progress
    await BatchRepo.recomputeCounts(batch_id)

    // Step 6: Notify API instances via Redis pub/sub
    await EventsPublisher.publishUrlUpdate(batch_id, url_result_id)

  } catch (err) {
    // Failure path: persist error, update counts, notify
    const message = err instanceof Error
      ? err.message
      : 'Unknown error'

    await UrlResultRepo.markFailed(url_result_id, message)
    await BatchRepo.recomputeCounts(batch_id)
    await EventsPublisher.publishUrlUpdate(batch_id, url_result_id)

    // Re-throw: tells BullMQ this job failed
    // BullMQ applies exponential backoff and retries
    // Without re-throw: BullMQ thinks job succeeded
    // No retry happens
    throw err
  }
}
