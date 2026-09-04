import { redisPub } from '../redis'
import { config } from '../config'
import { UrlResultRepo } from '../repositories/urlResult.repo'
import { BatchRepo } from '../repositories/batch.repo'
import type { SSEEvent } from '@url-checker/shared'

export const EventsPublisher = {

  async publishUrlUpdate(
    batchId: string,
    urlResultId: string
  ): Promise<void> {

    const [urlResult, batch] = await Promise.all([
      UrlResultRepo.findById(urlResultId),
      BatchRepo.findById(batchId),
    ])

    const urlEvent: SSEEvent = {
      type: 'url_update',
      batch_id: batchId,
      url_result: urlResult,
    }

    const batchEvent: SSEEvent = {
      type: 'batch_update',
      batch,
    }

    await Promise.all([
      redisPub.publish(
        config.pubsub.channel,
        JSON.stringify(urlEvent)
      ),
      redisPub.publish(
        config.pubsub.channel,
        JSON.stringify(batchEvent)
      ),
    ])
  },

} as const
