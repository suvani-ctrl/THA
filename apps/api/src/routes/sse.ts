import type { FastifyInstance } from 'fastify'
import { redisSub } from '../redis'
import { BatchRepo } from '../repositories/batch.repo'
import { UrlResultRepo } from '../repositories/urlResult.repo'
import type { SSEEvent } from '@url-checker/shared'

const PUBSUB_CHANNEL = 'url-check-updates'

export async function sseRoutes(server: FastifyInstance) {

  // GET /batches/:id/stream
  // Browser connects here to receive live updates
  // Keeps connection open
  // Pushes events as worker publishes them
  server.get<{ Params: { id: string } }>(
    '/:id/stream',
    async (request, reply) => {
      const { id } = request.params

      const batch = await BatchRepo.findById(id)
      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' })
      }

      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      // ─── Send Initial State ──────────────────────────────
      // opening a batch URL cold must produce correct state
      // When browser first connects:
      // Send complete current state immediately
      // Browser renders correct state from the start
      // Then receives live updates as they arrive
      const [currentBatch, currentResults] = await Promise.all([
        BatchRepo.findById(id),
        UrlResultRepo.findByBatchId(id),
      ])

      sendEvent(reply.raw, {
        type: 'batch_update',
        batch: currentBatch!,
      })

      for (const result of currentResults) {
        sendEvent(reply.raw, {
          type: 'url_update',
          batch_id: id,
          url_result: result,
        })
      }

      // ─── Subscribe to Redis Updates ──────────────────────
      // Listen for worker publishing new results
      // Forward to this browser connection
      const onMessage = (channel: string, message: string) => {
        if (channel !== PUBSUB_CHANNEL) return

        try {
          const event = JSON.parse(message) as SSEEvent

          // Only forward events for THIS batch
          // Multiple batches may be running simultaneously
          // Each SSE connection only cares about its own batch
          const eventBatchId = event.type === 'batch_update'
            ? event.batch.id
            : event.batch_id

          if (eventBatchId !== id) return

          sendEvent(reply.raw, event)

          // If batch completed or cancelled → close connection
          // No more updates will come for this batch
          if (
            event.type === 'batch_update' &&
            (event.batch.status === 'completed' ||
             event.batch.status === 'cancelled')
          ) {
            reply.raw.end()
          }

        } catch {
          // Malformed message from Redis — ignore
        }
      }

      await redisSub.subscribe(PUBSUB_CHANNEL)
      redisSub.on('message', onMessage)

      const heartbeat = setInterval(() => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(': heartbeat\n\n')
        }
      }, 30_000)

      request.raw.on('close', () => {
        clearInterval(heartbeat)
        redisSub.removeListener('message', onMessage)
      })

      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve)
      })
    }
  )
}

function sendEvent(res: any, event: SSEEvent): void {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}
