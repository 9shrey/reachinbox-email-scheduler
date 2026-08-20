import type { EmailRow, ScheduleBatchInput, ScheduleBatchResponse, Sender } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

export function fetchSenders(): Promise<{ senders: Sender[] }> {
  return request("/api/senders");
}

export function fetchEmails(status: "scheduled" | "sent"): Promise<{ emails: EmailRow[] }> {
  return request(`/api/emails?status=${status}`);
}

export function scheduleBatch(
  input: ScheduleBatchInput,
  idempotencyKey: string
): Promise<ScheduleBatchResponse> {
  return request("/api/emails/schedule", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export { ApiError };
