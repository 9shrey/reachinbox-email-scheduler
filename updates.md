# Build Log — ReachInbox Email Scheduler

Working solo from here on, no more interrupts. This file is the running log — newest entries at the bottom. Deadline: ~4h from 2026-08-20 (check current time).

Stack locked earlier: **Postgres + Prisma**, **Next.js (App Router)**, **NextAuth.js (Google)**, **pnpm workspaces**.

Decisions I'm making unilaterally from here (no time to quiz) — flagged with **DECISION** so you can override anything after the fact:

---

## Setup
- [x] pnpm workspace root (`pnpm-workspace.yaml`, root `package.json`, `.gitignore`)
- [x] `docker-compose.yml` — Postgres 16 (host port **5433**, 5432 was taken by another project's container) + Redis 7 with `--appendonly yes --appendfsync everysec` (AOF persistence, ~1s max data loss on crash, chosen so BullMQ delayed jobs survive a Redis restart)
- [x] Both containers up and healthy
- [x] `backend/` package.json + deps installed: express, cors, dotenv, bullmq, ioredis, nodemailer, @prisma/client, zod, prisma, tsx, typescript
- **DECISION**: Prisma 7 changed its config model (no more `url` in `schema.prisma`, requires `prisma.config.ts` + driver adapters) — pinned to **Prisma 6.19.3** instead to keep the classic, well-documented workflow. Not worth the migration under time pressure; note this if you ever `pnpm add prisma@latest`.

## Data model (`backend/prisma/schema.prisma`)
- **DECISION**: normalized `Batch` (subject/body/sender/timing, one row per "Compose" submission) + `Email` (one row per recipient, FK to batch). Dashboard queries join in the subject instead of duplicating it across thousands of rows.
- **DECISION**: one sender per batch (not round-robin across senders within a batch). System still supports many senders overall, each with its own hourly cap.
- **DECISION**: dedup via client-supplied `Idempotency-Key` header → stored as a unique `Batch.idempotencyKey`. A retried POST with the same key returns the existing batch instead of creating a second one. (Frontend still needs to actually generate/send this header — TODO when compose form is built.)
- `Email.status`: `SCHEDULED → PROCESSING → SENT | FAILED`. `Email.previewUrl` stores Ethereal's "view this email" link for the Sent Emails table.
- Migrations applied: `init`, `add_preview_url`. DB is live and reachable.

## Backend core — DONE, smoke-tested end-to-end
- `src/config/env.ts` — all tunables from env, no hardcoding (`WORKER_CONCURRENCY`, `EMAIL_SEND_MIN_DELAY_MS`, `DEFAULT_MAX_EMAILS_PER_HOUR_PER_SENDER`, ports, URLs).
- `src/queues/emailQueue.ts` — `enqueueEmailJob(emailId, scheduledAt)`: BullMQ delayed job with **`jobId = Email.id`**. This is the whole idempotency mechanism — adding a job with an id already in the queue is a no-op, so both the initial schedule call and the boot-reconciliation pass can call this safely without ever double-scheduling.
- `src/services/rateLimiter.ts` — Redis `INCR`-based counter keyed `rate:<senderId>:<hourBucket>` (TTL 2h). Increments first, decrements back if over limit (so the counter reflects "accepted sends" not "attempts"). Atomic via Redis's single-threaded INCR — safe across concurrent workers, not in-memory.
- `src/workers/emailWorker.ts` — the BullMQ `Worker`:
  - `concurrency` from env.
  - Global min-delay between sends via BullMQ's `limiter: { max: 1, duration: EMAIL_SEND_MIN_DELAY_MS }` (default **2000ms** — documented choice).
  - Per-send: checks the rate limiter; if the sender's hourly cap is hit, calls `job.moveToDelayed(nextHourStart, token)` + throws BullMQ's `DelayedError` — **job is rescheduled into the next hour window, never dropped or failed**. Row's `scheduledAt` is updated to match so the dashboard reflects the push.
  - Before actually sending: atomic `updateMany(... WHERE status='SCHEDULED')` claim — guards against any double-send even under retries/race conditions, on top of the jobId dedup.
  - On boot: `reconcileScheduledEmails()` re-enqueues every DB row still `SCHEDULED` (idempotent no-op if Redis/AOF already has the job — defensive if Redis data was ever lost).
- `src/services/smtp.ts` — nodemailer transport per Sender (cached), sends via Ethereal, captures `previewUrl`.
- `src/routes/emails.ts` — `POST /api/emails/schedule` (zod-validated, idempotency-key aware), `GET /api/emails?status=scheduled|sent`.
- `src/routes/senders.ts` — `GET /api/senders` for the compose dropdown.
- `src/scripts/createEtherealSenders.ts` (`pnpm seed:senders`) — creates 2 real Ethereal test accounts via `nodemailer.createTestAccount()` and stores them as Senders (50/hr and 20/hr caps, to make per-sender limiting demonstrable). **Already run** — 2 senders live in the DB.

### Verified by hand (curl), all passed:
1. Scheduled 3 emails, staggered 1s apart → all 3 sent via real Ethereal SMTP, ~2.2s apart (matches the 2000ms global throttle). Preview URLs captured.
2. Same request replayed with the same `Idempotency-Key` → returned the *same* batch id, `deduped: true`, no duplicate rows/jobs created.
3. **Rate-limit overflow**: sender capped at 2/hr, scheduled 3 recipients → 2 sent immediately, 3rd's status stayed `SCHEDULED` with `scheduledAt` pushed to the next hour boundary (`10:30:00Z`). Not dropped, not failed.
4. **Restart survival**: killed both the API server and worker processes (simulating a crash/redeploy) while a job was still pending in the next-hour window. Restarted both — boot log shows `re-enqueued 1 scheduled email(s)`, sent count unchanged at 5 (no duplicates). Redis AOF + DB-backed reconciliation both hold up.

Backend is functionally complete for the assignment's hard requirements. Both processes currently running in background (ports 4000 API, worker attached to same queue).

## Next up (in progress)
- [ ] Next.js frontend scaffold (App Router + Tailwind)
- [ ] NextAuth Google OAuth login
- [ ] Dashboard shell (header, tabs)
- [ ] Compose modal (subject/body/CSV upload/start time/delay/hourly limit → calls schedule API with a generated Idempotency-Key)
- [ ] Scheduled/Sent tables with loading + empty states
- [ ] README (setup, architecture, trade-offs)
