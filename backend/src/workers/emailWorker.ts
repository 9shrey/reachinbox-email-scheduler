import { Worker, DelayedError, type Job } from "bullmq";
import { redis } from "../db/redis.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { EMAIL_QUEUE_NAME } from "../queues/emailQueue.js";
import { tryConsumeSendSlot, releaseSendSlot } from "../services/rateLimiter.js";
import { sendViaSender } from "../services/smtp.js";
import { reconcileScheduledEmails } from "../services/reconcile.js";

async function processEmailJob(job: Job<{ emailId: string }>, token?: string) {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { batch: { include: { sender: true } } },
  });

  // Row is gone or already terminal (SENT/FAILED) — another run of this
  // exact jobId already handled it. Idempotency guard, not an error path.
  if (!email || email.status !== "SCHEDULED") {
    return { skipped: true };
  }

  const { batch } = email;
  const { sender } = batch;
  const limit = batch.hourlyLimit ?? sender.maxEmailsPerHour;

  const slot = await tryConsumeSendSlot(sender.id, limit);
  if (!slot.allowed) {
    // Hourly cap hit for this sender: push the job (and the row's displayed
    // scheduledAt) to the next hour window instead of failing/dropping it.
    // DelayedError tells BullMQ "I already moved this job myself, leave it be."
    await prisma.email.update({
      where: { id: email.id },
      data: { scheduledAt: slot.nextWindowStart },
    });
    await job.moveToDelayed(slot.nextWindowStart.getTime(), token);
    throw new DelayedError();
  }

  // Atomically claim the row so a concurrent/duplicate run of this job
  // can never send twice, even under worst-case timing.
  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: "SCHEDULED" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) {
    // Someone else claimed it between our read and our write; give back
    // the rate-limit slot we just consumed for a send that isn't happening.
    await releaseSendSlot(sender.id);
    return { skipped: true };
  }

  try {
    const html = batch.body.replace(/\n/g, "<br/>");
    const { previewUrl } = await sendViaSender(sender, {
      to: email.recipient,
      subject: batch.subject,
      html,
    });

    await prisma.email.update({
      where: { id: email.id },
      data: { status: "SENT", sentAt: new Date(), previewUrl },
    });
  } catch (err) {
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  return { sent: true };
}

async function main() {
  const reconciled = await reconcileScheduledEmails();
  // eslint-disable-next-line no-console
  console.log(`[worker] boot reconciliation: re-enqueued ${reconciled} scheduled email(s)`);

  const worker = new Worker(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: redis,
    concurrency: env.workerConcurrency,
    // Global floor on how fast this worker fires sends, regardless of how
    // many are due at once — mimics real SMTP-provider throttling.
    limiter: {
      max: 1,
      duration: env.emailSendMinDelayMs,
    },
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  console.log(
    `[worker] started — concurrency=${env.workerConcurrency}, min delay between sends=${env.emailSendMinDelayMs}ms`
  );
}

main().catch((err) => {
  console.error("[worker] fatal error during startup", err);
  process.exit(1);
});
