import { Redis } from "ioredis";
import { env } from "../config/env.js";

// BullMQ requires maxRetriesPerRequest: null on the connection it's handed.
// One shared connection is reused by the queue, the worker, and the rate limiter's counters.
export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
});
