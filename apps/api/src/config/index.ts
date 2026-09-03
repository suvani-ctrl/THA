
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  database: {
    url: requireEnv('DATABASE_URL'),
    pool: {
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    },
  },
  redis: {
    url: requireEnv('REDIS_URL'),
  },
  server: {
    port: Number(optionalEnv('PORT', '4000')),
    webUrl: optionalEnv('WEB_URL', 'http://localhost:3000'),
  },
  cache: {
    batchListTtl: 30,
    batchListKey: 'cache:batches',
  },
  queue: {
    name: 'url-check',
    concurrency: 5,
    rateLimit: {
      max: 10,
      duration: 1_000,
    },
  },
  batch: {
    maxUrls: 500,
    maxUrlLength: 2_048,
  },
} as const
