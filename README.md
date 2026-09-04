
# URL Health Checker

Submit a list of URLs. The system checks each one in the background and streams results to your browser live — no polling, no refresh needed.

---

## Running the System

```bash
docker compose up --build
```

Open http://localhost:3000

PostgreSQL schema applies automatically on first startup.

---

## Architecture Overview

The system runs as three separate processes:

```
Browser (Next.js) ──SSE──► Fastify API ──► PostgreSQL
                                │
                              Redis
                                │
                          BullMQ Worker ──► PostgreSQL
```

CONSIDERABLE DECISONS

**Why three processes?**

Node.js is single-threaded. If the API waited for 100 URLs to be checked before responding, nothing else could run  no other requests, no other users. So the API does one thing only: save the batch to PostgreSQL, push jobs into a Redis queue, and respond immediately with a batch ID. The worker process reads from that queue and does all the slow work separately.

**Three processes, here shares three responsibilities:**

| Process | Port | Does |
|---------|------|------|
| Fastify API | 4000 | Handles HTTP. Never checks URLs. |
| BullMQ Worker | — | Checks URLs. Never handles HTTP. |
| Next.js UI | 3000 | Renders pages. Receives live updates via SSE. |

---

## Tech stack descriptions

**PostgreSQL** is the source of truth. Everything is crucial here  since the  batches, URL results, statuses  lives here permanently. Redis and BullMQ are disposable. If they crash, PostgreSQL has everything needed to reconstruct correct state.

Schema decisions I made :
- Status columns use PostgreSQL enums — the database itself rejects invalid values, not just the application
- `TIMESTAMPTZ` not `TIMESTAMP` — timezone-aware, always stored as UTC
- `CHECK` constraints on counts — `completed >= 0`, `completed <= total` enforced at storage level
- Partial index on pending `url_results` rows only — as URLs get processed they fall out of the index automatically, keeping it small

**Redis** does three different things in this system:
1. Stores BullMQ jobs so they survive worker crashes
2. Pub/Sub — worker publishes updates, every API instance receives and forwards to browsers
3. Caches the batch list for 30 seconds, invalidated on every write

The API has two separate Redis connections because a connection in `SUBSCRIBE` mode cannot run any other commands. One connection for cache, one for pub/sub not optional.

**BullMQ** handles the three hardest worker requirements out of the box:
- Retries with exponential backoff (1s → 2s → 4s)
- Concurrency: sliding window of exactly 5 jobs always in flight
- Global rate limit of 10 req/sec stored in Redis — works correctly even with multiple worker processes running simultaneously

**SSE ** for live updates because communication is unidirectional (server to browser only). WebSockets add complexity for a bidirectional capability we never need. More importantly, SSE backed by Redis pub/sub means no sticky sessions are needed & any API instance can serve any browser.

---

## Key Decisions

**Idempotency**:

First submission uses a deterministic `jobId = 'url-check:{url_result_id}'`. If the same POST hits the API twice (network retry, double-click), BullMQ sees the same jobId and skips the duplicate. Retry uses no jobId — the same URL needs to be re-processed intentionally, so deduplication would break it.

**Two-phase cancel** — jobs exist in two states when cancel is called. Queued jobs (waiting in Redis) are cancelled via a DB status update. In-flight jobs (already being processed) are cancelled via a Redis flag that the worker checks at the start of every job. Single-phase cancel misses one of these cases every time.

**Recompute counts, never increment** — batch `completed` and `failed` counts are updated using SQL subqueries that recount from `url_results`, not by incrementing. Incrementing drifts if the worker crashes between writing the result and updating the count. Recomputing from source is always accurate.

**Next.js server/client boundary** — batch list and batch detail pages are server components. They fetch data on the server and send complete HTML to the browser. Cold-opening a batch URL in a new tab shows correct state immediately. `BatchClient.tsx` is a client component that receives initial state as props and subscribes to SSE for live updates.

---

## Trade-offs Made Under Time Pressure

These are things I did under a time constraint and what could have been done if time was not an issue..

**Schema migrations.** `schema.sql` runs once on first container startup. Works for fresh setups but if the schema ever needs to change you'd have to write `ALTER TABLE` statements manually. I'd use `node-pg-migrate` for versioned migrations in production.

**Cache stampede.** When the batch list cache expires and many users hit `GET /batches` simultaneously, all requests go to PostgreSQL at once. The fix is a Redis `SET NX` lock so only one request rebuilds the cache and others wait. Skipped under time pressure.

**Error classification.** Every failed URL check is retried up to 3 times — including 404s, which will never succeed no matter how many times you try. I'd classify errors as transient (network failures, timeouts — retry these) vs permanent (4xx responses — don't retry) and handle them differently.

**Connection pool sizing.** `max: 10` connections per process is hardcoded. In production this should be `floor((postgres_max_connections - reserved) / num_instances)` and configurable via environment variable.

**No observability.** No metrics, no tracing, no alerting. In production I'd add Prometheus metrics on queue depth, processing time, error rates, and SSE connection count.

**CSV parsing.** Current parser splits on newlines and commas. Doesn't handle the full RFC 4180 spec — quoted fields with embedded commas, multi-line values, etc. I'd use `papaparse` or `csv-parse` in production.

**Pagination on URL results.** A batch with 10,000 URLs returns all rows at once. Would need cursor-based pagination at scale.


## How It Behaves When the API Is Scaled Horizontally

```
Load Balancer
  ├── API Instance 1
  ├── API Instance 2  ──── Redis ──── Worker(s)
  └── API Instance 3       │
                           └── PostgreSQL
```

All API instances share the same PostgreSQL making it consistent state. All share the same Redis , consistent cache. Every instance subscribes to the same Redis pub/sub channel. When a worker finishes a URL and publishes an update, every API instance receives it and pushes it to its connected browsers. It doesn't matter which instance a browser's SSE connection landed on.

The rate limiter stays globally correct because its counter lives in Redis, not in any worker's process memory.

**What would need attention:**

Connection pool sizing — `max: 10` per instance × number of instances must stay below PostgreSQL's `max_connections` (default 100). 10 instances × 10 = 100 connections, which hits the limit. I'd put PgBouncer in front of PostgreSQL to handle connection pooling at scale.

Worker concurrency is per-process (5 each). Two workers = 10 simultaneous checks. This is intentional and adjustable via config depending on target server tolerance.
