import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { batchRoutes } from './routes/batches'
import { sseRoutes } from './routes/sse'
import { csvRoutes } from './routes/csv'
import { db } from './db/client'
import { redis, redisSub } from './redis'
import { config } from './config'

const server = Fastify({
  logger: {
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down...`)
  try {
    await server.close()
    await db.end()
    await redis.quit()
    await redisSub.quit()
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  process.exit(1)
})

async function start() {
  await server.register(cors, {
    origin: config.server.webUrl,
  })

  await server.register(multipart, {
    limits: {
      fileSize: 1024 * 1024, // 1MB max
    }
  })

  await server.register(batchRoutes, { prefix: '/batches' })
  await server.register(sseRoutes,   { prefix: '/batches' })
  await server.register(csvRoutes,   { prefix: '/batches' })

  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  try {
    await server.listen({
      port: config.server.port,
      host: '0.0.0.0',
    })
    console.log(`API running on port ${config.server.port}`)
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
