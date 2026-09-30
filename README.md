# URL Health Checker

Paste a list of URLs (or upload a CSV), and each one gets checked in the background. Results stream to the browser as they come in: status code, response time and page title.

## Running it

```bash
docker compose up --build -d
```

UI is at http://localhost:3000, API at http://localhost:4000. The schema gets created on first startup.

## What it does

- Up to 500 URLs per batch, pasted or from CSV
- Live results over SSE
- Cancel a batch mid-run
- Retry only the failed URLs

## How it's put together

```
Next.js (3000) --SSE--> Fastify API (4000) ---- Postgres
                              |
                            Redis
                              |
                        BullMQ worker ---------- Postgres
```

The API never checks URLs itself. It saves the batch, queues a job per URL and returns right away. A separate worker does the checking, so a big batch doesn't block the API.

Postgres is the source of truth. Redis only holds the queue, pub/sub for live updates and a 30s cache of the batch list, so it can be wiped without losing anything. The API keeps two Redis connections because a subscribed connection can't run normal commands.

Worker settings: concurrency 5, retries with 1s/2s/4s backoff, and a 10 req/s rate limit. The limit is stored in Redis, so it stays global when you run more than one worker.

## Some decisions worth knowing

**Duplicate submits.** Initial jobs use the URL row's UUID as the job ID, so a double-submitted request doesn't queue anything twice. Retry-failed deliberately skips the job ID, since those URLs do need to run again.

**Cancel.** Queued jobs are marked cancelled in the DB and the worker checks that before starting. Jobs already running are stopped with a Redis flag the worker checks at the start of each job. You need both. A job that's already in-flight can still finish a few ms after you cancel.

**Counts.** Batch completed/failed counts are recalculated from `url_results` rather than incremented, so a worker crash can't leave them out of sync.

**Pages.** The batch list and detail pages are server components, so a fresh tab shows the right state straight away. Only the live results part is a client component.

## Scaling

You can run multiple API instances behind a load balancer without code changes. They all subscribe to the same Redis channel, so any instance can push updates to its own clients and sticky sessions aren't needed. Add workers for more throughput. The rate limit still holds globally.

The pool is 10 connections per process, so around 10 API instances will hit Postgres' default limit of 100. Past that I'd put PgBouncer in front.

## Limits

- Only http/https, max 2048 chars
- Titles are only pulled from 2xx `text/html` responses
- No auth, per the brief

## Known gaps

- No migrations, just a SQL file run once. I'd move to node-pg-migrate.
- 404s get retried like timeouts do. Permanent 4xx errors shouldn't be retried.
- Nothing prevents a cache stampede when the batch list expires. A `SET NX` lock would fix it.
- Pool size is hardcoded and should come from env.
- No metrics or tracing yet.
