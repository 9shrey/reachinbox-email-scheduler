import { prisma } from "../db/prisma.js";
import { enqueueEmailJob } from "../queues/emailQueue.js";

export interface CreateBatchInput {
  subject: string;
  body: string;
  senderId: string;
  startTime: Date;
  delayMs: number;
  hourlyLimit?: number;
  recipients: string[]; // deduped, validated email addresses
  createdByEmail?: string;
  idempotencyKey?: string;
}

/**
 * Creates a Batch + one Email row per recipient (staggered scheduledAt,
 * `startTime + index * delayMs`), then enqueues one BullMQ delayed job per
 * Email row.
 *
 * Idempotency: if `idempotencyKey` is supplied and a Batch with that key
 * already exists, we return the existing batch untouched instead of
 * creating a duplicate — protects against double-submits (double-click,
 * network retry) creating a second full set of recipient rows + jobs.
 */
export async function createBatch(input: CreateBatchInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.batch.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { emails: true },
    });
    if (existing) return { batch: existing, deduped: true as const };
  }

  const batch = await prisma.batch.create({
    data: {
      subject: input.subject,
      body: input.body,
      senderId: input.senderId,
      startTime: input.startTime,
      delayMs: input.delayMs,
      hourlyLimit: input.hourlyLimit,
      createdByEmail: input.createdByEmail,
      idempotencyKey: input.idempotencyKey,
      emails: {
        create: input.recipients.map((recipient, i) => ({
          recipient,
          scheduledAt: new Date(input.startTime.getTime() + i * input.delayMs),
        })),
      },
    },
    include: { emails: true },
  });

  // Enqueue after the DB rows exist (and are committed) so jobId=email.id
  // always has a corresponding row for the worker to look up.
  await Promise.all(batch.emails.map((e) => enqueueEmailJob(e.id, e.scheduledAt)));

  return { batch, deduped: false as const };
}
