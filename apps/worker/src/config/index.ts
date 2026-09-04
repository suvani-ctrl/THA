function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
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
  worker: {
    queueName: 'url-check',
    concurrency: 5,
    rateLimit: {
      max: 10,
      duration: 1_000,
    },
    requestTimeoutMs: 10_000,
  },
  pubsub: {
    channel: 'url-check-updates',
  },
} as const
