import type { FastifyInstance } from 'fastify'
import { BatchService } from '../services/batch.service'
import { config } from '../config'
import type {
  SubmitBatchRequest,
  SubmitBatchResponse,
  BatchListResponse,
  BatchDetailResponse,
} from '@url-checker/shared'

function isValidUrl(url: string): boolean {
  if (!url || url.length > config.batch.maxUrlLength) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    )
  } catch {
    return false
  }
}

export async function batchRoutes(server: FastifyInstance) {

  // POST /batches
  server.post<{ Body: SubmitBatchRequest }>(
    '/',
    async (request, reply) => {
      const body = request.body

      if (!body || !Array.isArray(body.urls)) {
        return reply.status(400).send({
          error: 'Request body must be { urls: string[] }',
        })
      }

      if (body.urls.length === 0) {
        return reply.status(400).send({
          error: 'urls array cannot be empty',
        })
      }

      if (body.urls.length > config.batch.maxUrls) {
        return reply.status(400).send({
          error: `Maximum ${config.batch.maxUrls} URLs per batch`,
        })
      }

      const invalidUrls = body.urls.filter(url => !isValidUrl(url))
      if (invalidUrls.length > 0) {
        return reply.status(400).send({
          error: 'Invalid URLs found',
          invalid: invalidUrls.slice(0, 10),
        })
      }

      const uniqueUrls = [...new Set(body.urls)]
      const { batch } = await BatchService.createBatch(uniqueUrls)

      const response: SubmitBatchResponse = { batch_id: batch.id }
      return reply.status(201).send(response)
    }
  )

  // GET /batches
  server.get<{
    Querystring: { limit?: string; offset?: string }
  }>(
    '/',
    async (request, reply) => {
      const limit = Math.min(
        Number(request.query.limit ?? 50), 100
      )
      const offset = Number(request.query.offset ?? 0)

      const batches = await BatchService.getAllBatches(limit, offset)
      const response: BatchListResponse = { batches }

      const cacheHit = request.query.limit === undefined &&
                       request.query.offset === undefined

      return reply
        .header('X-Cache', cacheHit ? 'HIT' : 'MISS')
        .send(response)
    }
  )

  // GET /batches/:id
  server.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const data = await BatchService.getBatchDetail(
        request.params.id
      )

      if (!data) {
        return reply.status(404).send({ error: 'Batch not found' })
      }

      const response: BatchDetailResponse = data
      return reply.send(response)
    }
  )

  // POST /batches/:id/cancel
  server.post<{ Params: { id: string } }>(
    '/:id/cancel',
    async (request, reply) => {
      const result = await BatchService.cancelBatch(
        request.params.id
      )

      if (!result.success) {
        const status = result.error === 'Batch not found' ? 404 : 400
        return reply.status(status).send({ error: result.error })
      }

      return reply.send({ success: true })
    }
  )

  // POST /batches/:id/retry
  server.post<{ Params: { id: string } }>(
    '/:id/retry',
    async (request, reply) => {
      const result = await BatchService.retryFailed(
        request.params.id
      )

      if (!result.success) {
        const status = result.error === 'Batch not found' ? 404 : 400
        return reply.status(status).send({ error: result.error })
      }

      return reply.send({
        success: true,
        retrying: result.retrying,
      })
    }
  )
}
