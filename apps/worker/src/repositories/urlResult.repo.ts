import { db } from '../db'
import type { UrlResult } from '@url-checker/shared'

export const UrlResultRepo = {

  async markRunning(id: string): Promise<void> {
    await db.query(
      `UPDATE url_results
       SET status = 'running', attempt = attempt + 1
       WHERE id = $1`,
      [id]
    )
  },

  async markCompleted(
    id: string,
    httpCode: number,
    responseMs: number,
    pageTitle: string | null
  ): Promise<void> {
    await db.query(
      `UPDATE url_results
       SET status = 'completed',
           http_code = $1,
           response_ms = $2,
           page_title = $3
       WHERE id = $4`,
      [httpCode, responseMs, pageTitle, id]
    )
  },

  async markFailed(id: string, error: string): Promise<void> {
    await db.query(
      `UPDATE url_results
       SET status = 'failed', error = $1
       WHERE id = $2`,
      [error, id]
    )
  },

  async markCancelled(id: string): Promise<void> {
    await db.query(
      `UPDATE url_results
       SET status = 'cancelled'
       WHERE id = $1`,
      [id]
    )
  },

  async findById(id: string): Promise<UrlResult> {
    const result = await db.query<UrlResult>(
      `SELECT * FROM url_results WHERE id = $1`,
      [id]
    )
    return result.rows[0]
  },

} as const
