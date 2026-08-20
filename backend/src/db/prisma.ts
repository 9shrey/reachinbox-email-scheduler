import { PrismaClient } from "@prisma/client";

// Single shared Prisma client instance for the whole process (API server or worker).
export const prisma = new PrismaClient();
