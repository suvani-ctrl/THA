import { db } from '../db/client'
import type { Batch } from '@url-checker/shared'

export const BatchRepo = {

  async create(total: number): Promise<Batch> {
    const result = await db.query<Batch>(
      `INSERT INTO batches (total, status)
       VALUES ($1, 'pending')
       RETURNING *`,
      [total]
    )
    return result.rows[0]
  },

  async findAll(limit = 50, offset = 0): Promise<Batch[]> {
    const result = await db.query<Batch>(
      `SELECT * FROM batches
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    return result.rows
  },

  async findById(id: string): Promise<Batch | null> {
    const result = await db.query<Batch>(
      `SELECT * FROM batches WHERE id = $1`,
      [id]
    )
    return result.rows[0] ?? null
  },

  async updateStatus(
    id: string,
    status: Batch['status']
  ): Promise<void> {
    await db.query(
      `UPDATE batches SET status = $1 WHERE id = $2`,
      [status, id]
    )
  },


  async recomputeCounts(id: string): Promise<void> {
    await db.query(
      `UPDATE batches SET
        completed = (
          SELECT COUNT(*) FROM url_results
          WHERE batch_id = $1 AND status = 'completed'
        ),
        failed = (
          SELECT COUNT(*) FROM url_results
          WHERE batch_id = $1 AND status = 'failed'
        ),
        status = CASE
          WHEN (
            SELECT COUNT(*) FROM url_results
            WHERE batch_id = $1
            AND status IN ('pending', 'running')
          ) = 0 THEN 'completed'::batch_status
          ELSE 'running'::batch_status
        END
       WHERE id = $1`,
      [id]
    )
  },

} as const
