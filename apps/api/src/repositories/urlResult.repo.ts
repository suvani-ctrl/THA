import { db } from '../db/client'
import type { UrlResult } from '@url-checker/shared'

// Whitelist of fields allowed in dynamic updates
// Runtime protection — TypeScript disappears at runtime
const ALLOWED_UPDATE_FIELDS = new Set([
  'status', 'http_code', 'response_ms',
  'page_title', 'error', 'attempt',
])

export const UrlResultRepo = {

  async createBulk(
    urls: string[],
    batchId: string
  ): Promise<UrlResult[]> {
    if (urls.length === 0) return []

    const placeholders = urls
      .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
      .join(', ')

    const params = urls.flatMap(url => [url, batchId])

    const result = await db.query<UrlResult>(
      `INSERT INTO url_results (url, batch_id)
       VALUES ${placeholders}
       RETURNING *`,
      params
    )
    return result.rows
  },

  async findByBatchId(batchId: string): Promise<UrlResult[]> {
    const result = await db.query<UrlResult>(
      `SELECT * FROM url_results
       WHERE batch_id = $1
       ORDER BY created_at ASC`,
      [batchId]
    )
    return result.rows
  },

  async findFailedByBatchId(batchId: string): Promise<UrlResult[]> {
    const result = await db.query<UrlResult>(
      `SELECT * FROM url_results
       WHERE batch_id = $1 AND status = 'failed'`,
      [batchId]
    )
    return result.rows
  },

  async update(
    id: string,
    updates: Partial<Pick<
      UrlResult,
      'status' | 'http_code' | 'response_ms' |
      'page_title' | 'error' | 'attempt'
    >>
  ): Promise<UrlResult> {
    const fields = Object.keys(updates)
      .filter(key => ALLOWED_UPDATE_FIELDS.has(key))

    if (fields.length === 0) {
      throw new Error('No valid fields to update')
    }

    const values = fields.map(
      f => (updates as Record<string, unknown>)[f]
    )

    const setClause = fields
      .map((field, i) => `${field} = $${i + 2}`)
      .join(', ')

    const result = await db.query<UrlResult>(
      `UPDATE url_results
       SET ${setClause}
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    )
    return result.rows[0]
  },

  async cancelPending(batchId: string): Promise<void> {
    await db.query(
      `UPDATE url_results
       SET status = 'cancelled'
       WHERE batch_id = $1 AND status = 'pending'`,
      [batchId]
    )
  },

  async resetFailed(batchId: string): Promise<UrlResult[]> {
    const result = await db.query<UrlResult>(
      `UPDATE url_results
       SET status = 'pending',
           http_code = NULL,
           response_ms = NULL,
           page_title = NULL,
           error = NULL,
           attempt = 0
       WHERE batch_id = $1 AND status = 'failed'
       RETURNING *`,
      [batchId]
    )
    return result.rows
  },

} as const
