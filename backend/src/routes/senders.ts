import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const sendersRouter = Router();

sendersRouter.get("/", async (_req, res) => {
  const senders = await prisma.sender.findMany({
    select: { id: true, name: true, fromEmail: true, maxEmailsPerHour: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ senders });
});
