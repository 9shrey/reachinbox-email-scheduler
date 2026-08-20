import { prisma } from "../db/prisma.js";
import { enqueueEmailJob } from "../queues/emailQueue.js";

/**
 * Boot-time safety net: re-enqueue a BullMQ job for every Email row still
 * in SCHEDULED status. In the normal case Redis AOF already persisted
 * these jobs, and enqueueEmailJob's jobId-dedup makes this a no-op re-add
 * — but this also covers the harder case (Redis volume wiped, moved to a
 * fresh Redis instance, etc.) where Postgres is the only surviving record
 * of what still needs to send. Either way, nothing gets sent twice or
 * restarted from scratch: PROCESSING/SENT/FAILED rows are left alone.
 */
export async function reconcileScheduledEmails() {
  const pending = await prisma.email.findMany({
    where: { status: "SCHEDULED" },
    select: { id: true, scheduledAt: true },
  });

  for (const e of pending) {
    await enqueueEmailJob(e.id, e.scheduledAt);
  }

  return pending.length;
}
