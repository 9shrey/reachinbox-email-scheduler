import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { createBatch } from "../services/scheduler.js";

export const emailsRouter = Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createBatchSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  senderId: z.string().uuid(),
  startTime: z.coerce.date(),
  delayMs: z.number().int().min(0),
  hourlyLimit: z.number().int().positive().optional(),
  recipients: z
    .array(z.string())
    .min(1, "At least one recipient is required")
    .transform((list) => Array.from(new Set(list.map((e) => e.trim().toLowerCase()))))
    .refine((list) => list.every((e) => emailRegex.test(e)), {
      message: "One or more recipients are not valid email addresses",
    }),
  createdByEmail: z.string().email().optional(),
});

// POST /api/emails/schedule
emailsRouter.post("/schedule", async (req, res) => {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const idempotencyKey = req.header("Idempotency-Key") || undefined;

  const sender = await prisma.sender.findUnique({ where: { id: parsed.data.senderId } });
  if (!sender) {
    return res.status(404).json({ error: "Unknown senderId" });
  }

  const { batch, deduped } = await createBatch({ ...parsed.data, idempotencyKey });

  res.status(deduped ? 200 : 201).json({
    batch: {
      id: batch.id,
      subject: batch.subject,
      recipientCount: batch.emails.length,
      startTime: batch.startTime,
      delayMs: batch.delayMs,
    },
    deduped,
  });
});

// GET /api/emails?status=scheduled|sent
emailsRouter.get("/", async (req, res) => {
  const statusParam = String(req.query.status ?? "scheduled").toLowerCase();

  const statusFilter =
    statusParam === "sent"
      ? { in: ["SENT", "FAILED"] as ("SENT" | "FAILED")[] }
      : { in: ["SCHEDULED", "PROCESSING"] as ("SCHEDULED" | "PROCESSING")[] };

  const emails = await prisma.email.findMany({
    where: { status: statusFilter },
    include: { batch: { select: { subject: true, sender: { select: { name: true } } } } },
    orderBy: statusParam === "sent" ? { sentAt: "desc" } : { scheduledAt: "asc" },
    take: 200,
  });

  res.json({
    emails: emails.map((e) => ({
      id: e.id,
      recipient: e.recipient,
      subject: e.batch.subject,
      sender: e.batch.sender.name,
      status: e.status,
      scheduledAt: e.scheduledAt,
      sentAt: e.sentAt,
      error: e.error,
      previewUrl: e.previewUrl,
    })),
  });
});
