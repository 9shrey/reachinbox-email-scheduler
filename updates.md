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

## Frontend — DONE
- Scaffolded with `create-next-app` (Next.js **16.3.1**, App Router, Tailwind v4, Turbopack). **Note**: Next 16 has real breaking changes vs older docs — biggest one: `middleware.ts`/`middleware()` is renamed to **`proxy.ts`/`proxy()`**. Used the new convention throughout (`src/proxy.ts`).
- **DECISION**: NextAuth v5 (beta, but the stable App-Router-native line), Google provider, **JWT session strategy** — no Prisma adapter/DB session tables, since we only need name/email/avatar for the header, not persisted multi-device sessions.
- `src/auth.ts` — NextAuth config. `src/proxy.ts` — redirects `/dashboard` → `/login` when unauthenticated and vice versa (verified: unauthenticated `curl` to `/` and `/dashboard` both 307 to `/login`).
- `src/app/login/page.tsx` — "Sign in with Google" button.
- `src/app/dashboard/page.tsx` (server) + `DashboardClient.tsx` (client) — header, Scheduled/Sent tabs, Compose button, polls the API every 8s.
- `src/components/Header.tsx` — avatar/name/email + Logout (`signOut`).
- `src/components/ComposeModal.tsx` — subject/body, CSV/text upload (client-side regex extraction, shows detected count live), sender dropdown (fetched from `/api/senders`), start time, delay-between-emails, hourly-limit override, generates and sends the `Idempotency-Key` header.
- `src/components/EmailTable.tsx` + `components/ui/*` (Button, Input/TextArea/Select, Modal, StatusBadge, loading/empty/error states) — reusable, typed.
- `pnpm exec tsc --noEmit` clean, `next build` clean, dev server smoke-tested (redirects verified via curl).
- **DECISION**: removed `papaparse` — plain regex extraction over the uploaded file's text was simpler and sufficient for "detect email addresses in a CSV/text file," avoided an unused/half-used dependency.

## Type-check fixes (backend)
While tightening: `tsc --noEmit` caught 2 real issues `tsx`'s runtime transpile had silently let through — fixed both:
- `ioredis` v6 default import had no construct signature under `NodeNext` resolution → switched to the named `Redis` export.
- The `status: { in: [...] as const }` Prisma filter was inferred as a readonly tuple, which Prisma's generated types reject (want a mutable array) → cast to `EmailStatus[]` instead.
Backend now type-checks clean (`pnpm exec tsc -p tsconfig.json --noEmit`), and both processes were restarted afterward and re-verified against the live API.

## Repo / git
- `git init`, initial commit made (branch `main`) — 61 files, all source, no `node_modules`/`.env`/build output (root `.gitignore` covers it).
- Root `README.md` written: setup (backend/frontend/Docker/Ethereal/Google OAuth), full architecture writeup (scheduling, persistence, idempotency, rate limiting — all mapped to actual file/line-level implementation), features-implemented checklist, assumptions/trade-offs section, manual-verification log.
- `backend/.env.example` added (mirrors the working `.env`, safe to commit — just local docker-compose creds).
- `frontend/.env.local.example` added — **you need to fill in real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`** from a Google Cloud OAuth client for login to actually work (redirect URI: `http://localhost:3000/api/auth/callback/google`). `AUTH_SECRET` is pre-generated.

## Currently running (background, on this machine)
- Postgres: `localhost:5433` (docker)
- Redis: `localhost:6379` (docker, AOF on)
- Backend API: `localhost:4000`
- Backend worker: attached, concurrency=5
- To stop everything: `pkill -f "tsx src/server.ts"; pkill -f "tsx src/workers/emailWorker.ts"; docker compose down` (add `-v` to also wipe the docker volumes/data).
- Frontend dev server was also started on `localhost:3000` for the smoke test — same idea to stop it (`pkill -f "next dev"`), or just leave it running to try it in a browser now.

## What's left — needs YOU (can't do these on your behalf without asking)
1. **Fill in Google OAuth creds** in `frontend/.env.local` (see above) so login actually works end-to-end in a browser.
2. **Create the private GitHub repo**, add remote, push (`git remote add origin <url> && git push -u origin main`).
3. **Grant access** to `Mitrajit` and `Yadav036` on that repo.
4. **Record the ≤5 min demo video**: schedule via the UI, show Scheduled/Sent tabs, do the restart demo (kill+restart both backend processes, show the pending job still fires), briefly show rate-limit behavior (e.g. reuse the throwaway low-limit-sender trick from the verification run above).
5. **Fill out the ClickUp submission form** with repo link + video link.

Everything else (backend logic, persistence, rate limiting, idempotency, frontend UI/auth/tables) is implemented and hand-verified. Not written: an automated test suite (documented as a time-boxed trade-off in the README).
