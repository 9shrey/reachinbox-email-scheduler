import { Queue } from "bullmq";
import { redis } from "../db/redis.js";

export const EMAIL_QUEUE_NAME = "email-send";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // Keep a bounded history in Redis for debugging, but don't let it grow forever.
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

/**
 * Schedule (or re-schedule, idempotently) a single email's send job.
 *
 * jobId is the Email row's own primary key. BullMQ treats jobId as a
 * dedup key — adding a job with an id that already exists in the queue
 * is a no-op that returns the existing job instead of creating a
 * duplicate. This is the whole idempotency mechanism for "don't send
 * the same email twice": both the initial schedule call AND the boot-time
 * reconciliation pass (see reconcile.ts) call this same function safely.
 */
export async function enqueueEmailJob(emailId: string, scheduledAt: Date) {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  await emailQueue.add(
    "send",
    { emailId },
    {
      jobId: emailId,
      delay,
    }
  );
}
