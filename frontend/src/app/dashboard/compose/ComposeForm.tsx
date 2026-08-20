"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Paperclip,
  Clock,
  ChevronDown,
  Upload,
  X,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { fetchSenders, scheduleBatch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import type { Sender } from "@/types";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function tomorrowAt(hour: number, minute: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const SEND_LATER_PRESETS = [
  { label: "Tomorrow", date: () => tomorrowAt(9, 0) },
  { label: "Tomorrow, 10:00 AM", date: () => tomorrowAt(10, 0) },
  { label: "Tomorrow, 11:00 AM", date: () => tomorrowAt(11, 0) },
  { label: "Tomorrow, 3:00 PM", date: () => tomorrowAt(15, 0) },
];

// Decorative rich-text toolbar to match the Figma composer chrome. Not
// wired to the body field — the assignment only calls for a plain
// subject/body, so these are presentational rather than a half-built
// editor that would misrepresent what's actually functional.
function ToolbarIcon({ icon: Icon }: { icon: typeof Bold }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded text-gray-300" title="Formatting isn't wired up in this build">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function ComposeForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(() => new Date());
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [hourlyLimit, setHourlyLimit] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendLaterOpen, setSendLaterOpen] = useState(false);
  const [pendingStartTime, setPendingStartTime] = useState("");

  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectiveSenderId = senderId ?? senders[0]?.id ?? "";

  useEffect(() => {
    fetchSenders()
      .then(({ senders }) => setSenders(senders))
      .catch(() => {});
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const found = Array.from(new Set((text.match(EMAIL_REGEX) ?? []).map((s) => s.toLowerCase())));
    setRecipients(found);
  }

  function openSendLater() {
    setPendingStartTime(toDatetimeLocalValue(startTime));
    setSendLaterOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    if (recipients.length === 0) {
      setError("Upload a list of leads first.");
      return;
    }
    if (!effectiveSenderId) {
      setError("Select a sender.");
      return;
    }

    setSubmitting(true);
    try {
      await scheduleBatch(
        {
          subject,
          body,
          senderId: effectiveSenderId,
          startTime: startTime.toISOString(),
          delayMs: delaySeconds * 1000,
          hourlyLimit: hourlyLimit === "" ? undefined : hourlyLimit,
          recipients,
        },
        idempotencyKey.current
      );
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to schedule emails.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleChips = recipients.slice(0, 3);
  const overflowCount = recipients.length - visibleChips.length;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
          </div>
          <div className="flex items-center gap-3">
            <span title="Attachments aren't wired up in this build">
              <Paperclip className="h-4 w-4 text-gray-300" />
            </span>
            <div className="relative">
              <button
                onClick={openSendLater}
                title="Send later"
                className={`flex h-6 w-6 items-center justify-center rounded ${
                  sendLaterOpen ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Clock className="h-4 w-4" />
              </button>

              {sendLaterOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                  <p className="mb-3 text-sm font-semibold text-gray-900">Send Later</p>
                  <input
                    type="datetime-local"
                    value={pendingStartTime}
                    onChange={(e) => setPendingStartTime(e.target.value)}
                    className="mb-3 w-full rounded-lg border-0 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-200"
                  />
                  <div className="mb-3 flex flex-col gap-1">
                    {SEND_LATER_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => setPendingStartTime(toDatetimeLocalValue(preset.date()))}
                        className="rounded-md px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" className="px-3 py-1.5" onClick={() => setSendLaterOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="px-3 py-1.5"
                      onClick={() => {
                        if (pendingStartTime) setStartTime(new Date(pendingStartTime));
                        setSendLaterOpen(false);
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <Button className="px-4 py-1.5" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Scheduling…" : "Send"}
            </Button>
          </div>
        </div>

        <div className="space-y-0 divide-y divide-gray-100 border-y border-gray-100">
          <div className="flex items-center gap-3 py-3">
            <span className="w-16 shrink-0 text-sm text-gray-500">From</span>
            <div className="relative">
              <select
                value={effectiveSenderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="appearance-none rounded-full bg-gray-100 py-1.5 pl-3 pr-8 text-sm text-gray-800"
              >
                {senders.length === 0 && <option value="">No senders configured</option>}
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fromEmail}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="flex items-center gap-3 py-3">
            <span className="w-16 shrink-0 text-sm text-gray-500">To</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {recipients.length === 0 && (
                <span className="text-sm text-gray-300">recipient@example.com</span>
              )}
              {visibleChips.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                >
                  {r}
                  <button
                    onClick={() => setRecipients((list) => list.filter((x) => x !== r))}
                    className="text-emerald-400 hover:text-emerald-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                  +{overflowCount}
                </span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload List
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFile}
              className="hidden"
            />
          </div>
          {fileName && (
            <p className="py-1 text-xs text-gray-400">
              {fileName} — <span className="font-medium text-gray-600">{recipients.length}</span>{" "}
              email address{recipients.length === 1 ? "" : "es"} detected
            </p>
          )}

          <div className="flex items-center gap-3 py-3">
            <span className="w-16 shrink-0 text-sm text-gray-500">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-6 py-3">
            <label className="flex items-center gap-2 text-sm text-gray-500">
              Delay between 2 emails
              <input
                type="number"
                min={0}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-14 rounded-md border-0 bg-gray-50 px-2 py-1 text-center text-sm text-gray-800 ring-1 ring-inset ring-gray-200"
              />
              <span className="text-xs text-gray-400">sec</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              Hourly Limit
              <input
                type="number"
                min={1}
                value={hourlyLimit}
                placeholder="00"
                onChange={(e) => setHourlyLimit(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-14 rounded-md border-0 bg-gray-50 px-2 py-1 text-center text-sm text-gray-800 ring-1 ring-inset ring-gray-200 placeholder:text-gray-300"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 border-b border-gray-100 pb-2">
          <ToolbarIcon icon={Undo2} />
          <ToolbarIcon icon={Redo2} />
          <div className="mx-1 h-4 w-px bg-gray-100" />
          <ToolbarIcon icon={Bold} />
          <ToolbarIcon icon={Italic} />
          <ToolbarIcon icon={Underline} />
          <ToolbarIcon icon={Strikethrough} />
          <div className="mx-1 h-4 w-px bg-gray-100" />
          <ToolbarIcon icon={AlignLeft} />
          <ToolbarIcon icon={List} />
          <ToolbarIcon icon={ListOrdered} />
          <ToolbarIcon icon={Quote} />
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type Your Reply..."
          rows={12}
          className="mt-3 w-full resize-none border-0 bg-transparent text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
