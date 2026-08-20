# ReachInbox — Email Job Scheduler

Repo: https://github.com/9shrey/reachinbox-email-scheduler

A production-shaped email scheduler: schedule cold-email sends via API/UI, persist them in Postgres, run them through BullMQ delayed jobs (no cron), send via Ethereal SMTP, and survive restarts without losing or duplicating jobs.

## Stack

- **Backend**: Express + TypeScript, BullMQ + Redis, PostgreSQL + Prisma, Nodemailer (Ethereal)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4, NextAuth v5 (Google OAuth)
- **Infra**: Docker Compose (Postgres + Redis)

## Monorepo layout

```
backend/     Express API + BullMQ worker (two separate entrypoints, one process each)
frontend/    Next.js dashboard
docker-compose.yml   Postgres + Redis (AOF persistence enabled)
updates.md   Running build log with the design decisions made along the way
```

---

## Getting started

### 1. Start infra

```bash
docker compose up -d
```

This starts Postgres (host port **5433** — 5432 was already taken locally, adjust back if yours is free) and Redis with `--appendonly yes` (AOF persistence — see [Persistence](#persistence--restart-behavior)).

### 2. Backend

```bash
cd backend
pnpm install
cp .env.example .env        # already filled with matching docker-compose values; adjust if needed
pnpm exec prisma migrate dev   # creates tables
pnpm run seed:senders          # creates 2 real Ethereal test accounts, stores as Sender rows

pnpm run dev          # API server, http://localhost:4000
pnpm run dev:worker   # BullMQ worker — separate process, run alongside the API
```

Both must be running: the API accepts requests and writes to Postgres/enqueues jobs; the worker is what actually sends. Killing/restarting either independently is safe (see restart test below).

### 3. Frontend

```bash
cd frontend
pnpm install
cp .env.local.example .env.local
# fill in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (see below)
pnpm run dev           # http://localhost:3000
```

### 4. Google OAuth setup

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth client ID → Web application.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Copy the client ID/secret into `frontend/.env.local`.
4. `AUTH_SECRET` is pre-filled (generated via `openssl rand -base64 32`) — replace it with your own for anything beyond local testing.

### 5. Ethereal Email setup

No manual signup needed — `pnpm run seed:senders` (in `backend/`) calls `nodemailer.createTestAccount()`, which creates real, working Ethereal SMTP credentials on the fly and stores them as `Sender` rows. Every "sent" email gets a real Ethereal preview link, shown in the Sent Emails table.

---

## Architecture overview

### How scheduling works

1. `POST /api/emails/schedule` (subject, body, sender, CSV-parsed recipient list, start time, delay-between-emails, hourly limit) creates one `Batch` row (shared subject/body/settings) and one `Email` row per recipient, with `scheduledAt = startTime + index * delayMs` (staggered).
2. Each `Email` row gets a **BullMQ delayed job**, added with `jobId = Email.id`. No cron, anywhere — the queue's own delay mechanism is the clock.
3. A `Worker` (configurable `concurrency`, see [Concurrency & rate limiting](#concurrency-throughput--rate-limiting)) picks up due jobs, checks the sender's rate limit, sends via nodemailer/Ethereal, and updates the row to `SENT`/`FAILED`.

### Persistence & restart behavior

Two independent layers make "survive a restart" true, tested by hand (see `updates.md` for the actual run log):

- **Redis AOF** (`redis-server --appendonly yes --appendfsync everysec`, `docker-compose.yml`): BullMQ's job data — including pending delayed jobs — lives in Redis, and Redis itself persists that to disk. Killing/restarting the Node processes never touches this; it was never in their memory. Worst-case data loss window is ~1s of writes (only relevant to a hard crash *of Redis itself*, not of the app).
- **Postgres as source of truth + boot reconciliation** (`backend/src/services/reconcile.ts`): on worker startup, every `Email` row still `SCHEDULED` gets re-enqueued. This is a no-op in the normal case (the job's already in Redis, and BullMQ's `jobId` dedup means re-adding it is a no-op), but it's what makes the system correct even if Redis's data were ever lost outright — Postgres alone is enough to fully rebuild the queue.

### Idempotency (never sending the same email twice)

Three independent guards, deliberately redundant:

1. **BullMQ `jobId = Email.id`** — adding a job with an id already in the queue is a no-op. Both the initial schedule call and the boot reconciliation pass can safely call the same "enqueue" function.
2. **Atomic claim before sending** — the worker does `UPDATE emails SET status='PROCESSING' WHERE id=$1 AND status='SCHEDULED'` and checks the affected row count. If a job somehow got processed twice (retry, race), the second run sees `count=0` and skips — it can never send twice.
3. **Idempotency-Key on the schedule endpoint** — the frontend generates a UUID per compose-form session and sends it as an `Idempotency-Key` header. The backend stores it on `Batch.idempotencyKey` (unique constraint); a retried POST (double-click, network retry) returns the *existing* batch instead of creating a second full set of recipient rows and jobs.

### Concurrency, throughput & rate limiting

- **Worker concurrency**: `WORKER_CONCURRENCY` env var (default 5) — `new Worker(name, processor, { concurrency })`.
- **Minimum delay between sends**: `EMAIL_SEND_MIN_DELAY_MS` env var, **default 2000ms**. Implemented via BullMQ's `limiter: { max: 1, duration }` option on the `Worker` — a queue-wide floor on how fast jobs get processed, mimicking real SMTP-provider throttling. (Verified by hand: 3 emails sent ~2.2s apart.)
- **Per-sender hourly limit**: `Sender.maxEmailsPerHour` (configurable per sender at seed time; also overridable per-batch via the compose form's "Hourly limit" field). Enforced with a **Redis `INCR`-based counter**, keyed `rate:<senderId>:<hourBucket>` (`services/rateLimiter.ts`):
  - `INCR` is atomic in Redis regardless of how many worker processes are incrementing concurrently — this is what makes the limit safe under concurrency/multiple instances, not an in-memory count.
  - We increment *first*, then check: if the increment pushed the count over the limit, we `DECR` it straight back and report "not allowed" — so the counter reflects sends actually let through, not raw attempts.
  - **On limit hit, the job is rescheduled, never dropped**: `job.moveToDelayed(nextHourStart, token)` + BullMQ's `DelayedError` — the standard BullMQ pattern for "I'm manually taking this job out of the running set." The `Email` row's `scheduledAt` is updated to match, so the dashboard reflects the push. (Verified by hand: a 2/hr-limited sender given 3 recipients sent 2 immediately, the 3rd's `scheduledAt` moved to the next hour boundary.)
- **Behavior under load (1000+ same-time emails)**: staggering already spreads `scheduledAt` across `delayMs`-wide slots; the two throttles above (`concurrency` × `limiter`) bound the actual processing rate regardless of how many jobs are simultaneously "due" — BullMQ just holds the rest in its delayed/wait set. Nothing is dropped; a burst beyond a sender's hourly cap spills into the next hour window via the same reschedule mechanism above, order preserved by `scheduledAt`.

### Frontend

- **Auth**: NextAuth v5, Google provider, JWT session strategy (no DB adapter — we only need name/email/avatar for the header, not persisted sessions). Route protection via `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`).
- **Dashboard**: header (avatar/name/email + logout) + Scheduled/Sent tabs + Compose button, polls the API every 8s so tables reflect worker progress without a manual refresh.
- **Compose modal**: subject/body, CSV/text file upload (client-side regex extraction of email addresses, count shown immediately), sender picker, start time, delay-between-emails, hourly-limit override. Generates the `Idempotency-Key` for the request.
- **Tables**: loading, empty, and error states built in (`components/ui/States.tsx`), reusable `Button`/`Input`/`TextArea`/`Select`/`Modal`/`StatusBadge` components.

---

## Features implemented

**Backend**
- [x] Schedule API (`POST /api/emails/schedule`), list API (`GET /api/emails?status=scheduled|sent`), senders API
- [x] BullMQ delayed-job scheduling (no cron)
- [x] Worker concurrency (env-configurable)
- [x] Minimum delay between sends (BullMQ limiter, env-configurable)
- [x] Per-sender hourly rate limit, Redis-backed, safe under concurrency; over-limit jobs rescheduled (not dropped/failed)
- [x] Restart persistence (Redis AOF + Postgres-backed boot reconciliation) — verified by hand
- [x] Idempotent scheduling (jobId dedup + atomic claim + Idempotency-Key)
- [x] Multi-sender support via Ethereal, real send + preview URLs

**Frontend**
- [x] Real Google OAuth login (NextAuth), protected `/dashboard` route
- [x] Header with name/email/avatar + logout
- [x] Scheduled / Sent tabs, Compose modal
- [x] CSV/text lead upload with detected-count display
- [x] Loading + empty states on both tables
- [x] Reusable, typed UI components

---

## Assumptions, shortcuts & trade-offs

- **No Figma access** — the link in the assignment brief was empty in what I received, so the UI is an original clean dashboard design rather than a pixel-match. Structurally it covers every listed requirement (header, tabs, compose modal, tables with the specified columns).
- **One sender per batch**, not round-robin across senders within a single compose request. The system supports many senders overall (each with an independent hourly cap); a given schedule request picks one.
- **Backend API is not itself authentication-gated** — the frontend gates the *dashboard* behind Google login, but the Express API has no auth middleware of its own. Fine for this assignment's scope (local, same-machine); a real deployment would forward the NextAuth session/JWT to the backend and verify it there.
- **SMTP send failures are terminal, not auto-retried** — a failed `sendMail` call is recorded as `FAILED` immediately rather than relying on BullMQ's retry/backoff (which is still configured on the queue for transient infra errors, e.g. a Redis hiccup, but application-level throws are caught and finalized). Simpler status model, at the cost of not auto-recovering from a transient Ethereal outage.
- **Prisma pinned to v6.19.3**, not v7 — Prisma 7 changed how the datasource URL is configured (moved out of `schema.prisma` into `prisma.config.ts` + driver adapters), which wasn't worth adopting under time pressure. Functionally equivalent for this project.
- **Rate limit counter counts accepted sends per hour bucket**, not a rolling window — a burst right at an hour boundary can send close to `2 × limit` across the boundary. Standard fixed-window trade-off; documented rather than solved with a sliding-window implementation given the time budget.
- **No automated test suite** — everything above was verified by hand (curl + log inspection, see `updates.md`) rather than with unit/integration tests, given the 48h window.

---

## Manual verification performed (see `updates.md` for the full run log)

1. Scheduled 3 staggered emails → all sent via real Ethereal SMTP, timing matched the configured min-delay.
2. Re-sent the identical request with the same `Idempotency-Key` → deduped, no duplicate rows/jobs.
3. Capped a sender at 2/hr, scheduled 3 recipients → 2 sent immediately, 3rd pushed to the next hour window (not dropped/failed).
4. Killed the API server + worker mid-run (simulated restart), restarted both → pending job re-enqueued via reconciliation, sent-count unchanged (no duplicate sends).
