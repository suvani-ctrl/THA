import { Pool } from 'pg'
import { config } from '../config'

export const db = new Pool({
  connectionString: config.database.url,
  ...config.database.pool,
})

db.on('error', (err) => {
  console.error('[API DB] Unexpected error:', err)
  process.exit(1)
})
