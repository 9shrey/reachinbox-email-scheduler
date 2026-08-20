import { redis } from "../db/redis.js";

/**
 * Redis-backed, per-sender, per-hour-window send counter.
 *
 * Key shape: rate:<senderId>:<hourBucket>  e.g. rate:abc123:2026-08-20T14
 * - Bucket = the sender's send count for that calendar hour, TTL'd at 2h
 *   (generous margin so a bucket always outlives its own hour, and old
 *   buckets clean themselves up instead of growing forever).
 * - INCR is atomic in Redis, so this is safe across many worker processes
 *   incrementing the same key concurrently — this is the actual mechanism
 *   that makes rate limiting safe under concurrency, not an in-memory count.
 * - We increment first, then check: if the increment pushed us over the
 *   limit we immediately DECR back (give the slot back) and report
 *   "not allowed" — this keeps the counter equal to "sends actually let
 *   through", not "attempts", so a burst of rejected jobs doesn't eat into
 *   next hour's headroom.
 */

function hourBucket(date: Date): string {
  return date.toISOString().slice(0, 13); // "2026-08-20T14"
}

export function startOfNextHour(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

export async function tryConsumeSendSlot(
  senderId: string,
  limit: number,
  at: Date = new Date()
): Promise<{ allowed: boolean; nextWindowStart: Date }> {
  const key = `rate:${senderId}:${hourBucket(at)}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 2 * 60 * 60); // 2h TTL, well past this bucket's relevance
  }

  if (count > limit) {
    await redis.decr(key); // give the slot back, this attempt isn't going through
    return { allowed: false, nextWindowStart: startOfNextHour(at) };
  }

  return { allowed: true, nextWindowStart: startOfNextHour(at) };
}

/** Give back a previously-consumed slot (e.g. a claim race meant the send never actually happened). */
export async function releaseSendSlot(senderId: string, at: Date = new Date()) {
  const key = `rate:${senderId}:${hourBucket(at)}`;
  await redis.decr(key);
}
