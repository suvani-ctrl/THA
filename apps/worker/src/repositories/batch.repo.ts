import { db } from '../db'
import type { Batch } from '@url-checker/shared'

export const BatchRepo = {

  async findById(id: string): Promise<Batch> {
    const result = await db.query<Batch>(
      `SELECT * FROM batches WHERE id = $1`,
      [id]
    )
    return result.rows[0]
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
