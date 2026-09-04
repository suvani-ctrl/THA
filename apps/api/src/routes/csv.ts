import type { FastifyInstance } from 'fastify'
import { BatchService } from '../services/batch.service'
import type { SubmitBatchResponse } from '@url-checker/shared'

function isValidUrl(url: string): boolean {
  if (!url || url.length > 2048) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function csvRoutes(server: FastifyInstance) {

  // POST /batches/upload
  // Accepts CSV file with one URL per line
  server.post('/upload', async (request, reply) => {
    const data = await request.file()

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    // Read file content
    const buffer = await data.toBuffer()
    const content = buffer.toString('utf-8')

    // Parse URLs from CSV
    // Support: one URL per line, or comma separated
    const urls = content
      .split(/[\n,]/)
      .map(u => u.trim().replace(/^["']|["']$/g, ''))
      .filter(u => u.length > 0)
      .filter(isValidUrl)

    if (urls.length === 0) {
      return reply.status(400).send({
        error: 'No valid URLs found in CSV'
      })
    }

    if (urls.length > 500) {
      return reply.status(400).send({
        error: 'Maximum 500 URLs per batch'
      })
    }

    const uniqueUrls = [...new Set(urls)]
    const { batch } = await BatchService.createBatch(uniqueUrls)

    const response: SubmitBatchResponse = { batch_id: batch.id }
    return reply.status(201).send(response)
  })
}
