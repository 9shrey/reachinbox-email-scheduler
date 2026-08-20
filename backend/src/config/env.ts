import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  emailSendMinDelayMs: Number(process.env.EMAIL_SEND_MIN_DELAY_MS ?? 2000),
  defaultMaxEmailsPerHourPerSender: Number(
    process.env.DEFAULT_MAX_EMAILS_PER_HOUR_PER_SENDER ?? 100
  ),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
};
