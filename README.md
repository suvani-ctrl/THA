
# URL Health Checker

A system where you paste a list of URLs, it checks each one in the background, and streams the results to  browser live as they finish.

---

## Run

```bash
docker compose up --build
```

Open http://localhost:3000

The database schema sets itself up automatically on first run.

---

## Working

- Paste up to 500 URLs or upload a CSV file
- For each URL it captures: HTTP status code, response time, and page title
- Results appear in the browser live as each URL finishes
- Cancel a running batch at any point
- Retry only the URLs that failed, without re-running the ones that already worked

---

## Architecture

Three separate processes talk to each other through Redis and PostgreSQL:

Browser (Next.js :3000)
│ SSE
▼
Fastify API (:4000) ──── PostgreSQL (db)
│
Redis
│
BullMQ Worker ────────── PostgreSQL


The reason for three processes is: Node.js runs on a single thread. If the API tried to check 100 URLs itself while also handling other requests, everything would block. So the API does one thing: receive the request, save it to the database, drop the work into a queue, and respond immediately. The worker runs separately and does all the actual checking.

| Process | Port | Job |
|---------|------|-----|
| Fastify API | 4000 | Handles HTTP only. Never checks URLs. |
| BullMQ Worker | — | Checks URLs only. Never touches HTTP. |
| Next.js UI | 3000 | Shows pages and receives live updates. |

---

## Reasonings behind the technologies

System Architecture

PostgreSQL is the primary source of truth for the system. All batches, URL results, and processing statuses are stored permanently in PostgreSQL. Redis and BullMQ are used only for temporary processing and coordination, so they can be cleared and rebuilt without losing the actual system state.

The database also enforces data integrity. PostgreSQL enums restrict status fields to valid values, while CHECK constraints ensure that completed counts cannot be negative or exceed the total count. A partial index is used only for pending URLs, keeping the index small as URLs are processed.

Redis has three main responsibilities. It stores BullMQ jobs so they can survive worker failures, provides pub/sub for distributing URL-processing updates between API instances, and caches the batch list for 30 seconds. The cache is also cleared whenever related data is modified.

Two Redis connections are used by the API because a connection in SUBSCRIBE mode cannot perform normal Redis operations. One connection therefore handles caching, while the other handles pub/sub.

BullMQ manages background URL checks. It provides exponential retry delays of 1, 2, and 4 seconds, limits concurrent processing to five jobs, and enforces a global rate limit of 10 requests per second. Because the rate-limit state is stored in Redis, the limit remains consistent when multiple workers are running.

Finally, Server-Sent Events (SSE) are used to send live updates to browsers. Since communication is mainly server-to-client, SSE is simpler than WebSockets for this use case. Redis pub/sub allows updates to reach clients connected to different API instances without requiring sticky sessions.
---

## Key Design Decisions

**Idempotency on job submission.** The first time URLs are enqueued, each job gets a deterministic ID based on its database row UUID. If the same POST request hits the API twice (double-click, network retry), BullMQ sees the same job ID already exists and skips the duplicate. When the user clicks Retry Failed, a separate function is used with no job ID — because the same URL genuinely needs to be re-processed, and deduplication would silently break it.

**Two-phase cancel.** When cancel is called, jobs are in two possible states. Queued jobs (sitting in Redis waiting to be picked up) get their database status set to cancelled — the worker checks this before starting any job. In-flight jobs (already being processed by the worker) can't be stopped by a database update alone, so a Redis flag is set that the worker checks at the very start of each job. One phase alone always misses one of these cases.

**Recompute counts from source, never increment.** The batch table stores completed and failed counts. These are updated by counting directly from the url_results table using a SQL subquery, not by running `completed = completed + 1`. Incrementing would drift if a worker crashed between writing the URL result and updating the batch count. Recomputing from the actual data is always accurate regardless of what crashed.

**Next.js server and client boundary.** The batch list page and batch detail page are server components — they fetch data on the server before the browser receives anything, so opening a batch URL in a new tab always shows the correct state immediately with no loading spinner. The live update part is a client component that receives the initial data as props and then subscribes to SSE for updates.

---

## Trade-offs Under Time Pressure

**No versioned migrations.** The schema runs once from a SQL file on first startup. If the schema ever needs to change on a running system, you'd need to write ALTER TABLE statements manually. With more time I'd use node-pg-migrate.

**Cache stampede not handled.** If the cache expires and many users hit the batch list simultaneously, all of them hit PostgreSQL at once. The fix is a Redis SET NX lock so only one request rebuilds the cache. I skipped this under time pressure.

**No error classification on retries.** Right now every failed URL check is retried up to 3 times — including 404s which will never succeed. With more time I'd separate transient failures (timeouts, connection errors — retry these) from permanent ones (4xx responses — don't retry).

**Hardcoded connection pool size.** The pool is set to max 10 connections per process. In production this should be calculated from the PostgreSQL max_connections setting divided by the number of running instances and set via environment variable.

**No observability.** No metrics, no distributed tracing, no alerting. In production I'd add Prometheus metrics on queue depth, job processing time, and SSE connection count.

---

## Horizontal Scaling

Load Balancer
├── API Instance 1 ──┐
├── API Instance 2 ──┼──── Redis ──── Worker(s) ──── PostgreSQL
└── API Instance 3 ──┘


Running multiple API instances works without any code changes. All instances share the same PostgreSQL so state is consistent. All subscribe to the same Redis pub/sub channel, so when a worker publishes a URL update, every API instance gets it and pushes it to their connected browsers. It doesn't matter which instance a user's browser connected to.

The rate limit stays globally correct because the counter lives in Redis, not in any process's memory.

Considerationf or connection pool sizing. At `max: 10` per instance, 10 API instances would hit PostgreSQL's default limit of 100 connections. At that scale I'd put PgBouncer in front of PostgreSQL as a better connection pooler.

Worker concurrency is per process (5 each). Running two workers gives 10 simultaneous checks. The global rate limit of 10 req/sec still holds because it's enforced in Redis.

---

## Considerations

- Only http:// and https:// URLs are accepted
- Max URL length is 2048 characters
- Page titles are only extracted from text/html responses with 2xx status codes
- Cancel is immediate for queued jobs. Inflight jobs may finish within a few milliseconds of cancel being called & this is acceptable
- Auth, notifications, and UI polish are out of scope per the brief