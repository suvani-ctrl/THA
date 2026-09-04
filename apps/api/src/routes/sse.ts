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

      // Verify batch exists before opening SSE connection
      const batch = await BatchRepo.findById(id)
      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' })
      }

      // ─── SSE Headers ────────────────────────────────────
      // These headers tell the browser:
      // "this is a server-sent events stream"
      // "keep this connection open"
      // "do not buffer — send immediately"
      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        // Allow browser to receive SSE from different origin
        'Access-Control-Allow-Origin': '*',
      })

      // ─── Send Initial State ──────────────────────────────
      // Critical for cold open requirement:
      // "opening a batch URL cold must produce correct state"
      //
      // When browser first connects:
      // Send complete current state immediately
      // Browser renders correct state from the start
      // Then receives live updates as they arrive
      const [currentBatch, currentResults] = await Promise.all([
        BatchRepo.findById(id),
        UrlResultRepo.findByBatchId(id),
      ])

      // Send current batch state
      sendEvent(reply.raw, {
        type: 'batch_update',
        batch: currentBatch!,
      })

      // Send all current url results
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

      // Subscribe to Redis channel
      await redisSub.subscribe(PUBSUB_CHANNEL)
      redisSub.on('message', onMessage)

      // ─── Heartbeat ───────────────────────────────────────
      // Send a comment every 30 seconds
      // Keeps connection alive through proxies and load balancers
      // Without this: connection may be dropped after 60s of silence
      const heartbeat = setInterval(() => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(': heartbeat\n\n')
        }
      }, 30_000)

      // ─── Cleanup on Disconnect ───────────────────────────
      // Browser closed tab, network dropped, page refreshed
      // Clean up to prevent memory leaks
      request.raw.on('close', () => {
        clearInterval(heartbeat)
        redisSub.removeListener('message', onMessage)
      })

      // Keep connection open
      // Fastify won't send response until we call reply.raw.end()
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve)
      })
    }
  )
}

// ─── SSE Event Formatter ──────────────────────────────────
// SSE protocol format:
// data: {json}\n\n
// The double newline signals end of event to browser
function sendEvent(res: any, event: SSEEvent): void {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}
