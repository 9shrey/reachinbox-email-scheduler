"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, TextArea, Select } from "@/components/ui/Field";
import { scheduleBatch, ApiError } from "@/lib/api";
import type { Sender } from "@/types";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function ComposeModal({
  open,
  onClose,
  senders,
  createdByEmail,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  senders: Sender[];
  createdByEmail?: string;
  onScheduled: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState(senders[0]?.id ?? "");
  const [startTime, setStartTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [hourlyLimit, setHourlyLimit] = useState<number | "">("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetAndClose() {
    setSubject("");
    setBody("");
    setStartTime(toDatetimeLocalValue(new Date()));
    setDelaySeconds(5);
    setHourlyLimit("");
    setRecipients([]);
    setFileName(null);
    setError(null);
    idempotencyKey.current = crypto.randomUUID();
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const found = Array.from(new Set((text.match(EMAIL_REGEX) ?? []).map((s) => s.toLowerCase())));
    setRecipients(found);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (recipients.length === 0) {
      setError("Upload a CSV/text file with at least one email address.");
      return;
    }
    if (!senderId) {
      setError("Select a sender.");
      return;
    }

    setSubmitting(true);
    try {
      await scheduleBatch(
        {
          subject,
          body,
          senderId,
          startTime: new Date(startTime).toISOString(),
          delayMs: delaySeconds * 1000,
          hourlyLimit: hourlyLimit === "" ? undefined : hourlyLimit,
          recipients,
          createdByEmail,
        },
        idempotencyKey.current
      );
      onScheduled();
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to schedule emails.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Compose new email">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Quick question about {{company}}"
          required
        />
        <TextArea
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Hi there, ..."
          required
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Leads (CSV or text file)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFile}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {fileName && (
            <p className="mt-1 text-xs text-gray-500">
              {fileName} — <span className="font-medium text-gray-700">{recipients.length}</span>{" "}
              email address{recipients.length === 1 ? "" : "es"} detected
            </p>
          )}
        </div>

        <Select
          label="Send from"
          value={senderId}
          onChange={(e) => setSenderId(e.target.value)}
          required
        >
          {senders.length === 0 && <option value="">No senders configured</option>}
          {senders.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.fromEmail}) — {s.maxEmailsPerHour}/hr cap
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Start time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Input
            label="Delay between emails (s)"
            type="number"
            min={0}
            value={delaySeconds}
            onChange={(e) => setDelaySeconds(Number(e.target.value))}
            hint="Stagger between recipients"
          />
          <Input
            label="Hourly limit"
            type="number"
            min={1}
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="Sender default"
            hint="Overrides sender cap"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
