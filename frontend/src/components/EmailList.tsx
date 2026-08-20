import { Clock, Send, XCircle, Star } from "lucide-react";
import type { EmailRow } from "@/types";
import { EmptyState, LoadingRows, ErrorState } from "@/components/ui/States";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Figma's list rows fold "time" and "status" into a single pill (amber
 * clock+time for scheduled, gray send+"Sent" for delivered, red for
 * failed) rather than separate table columns. We keep that visual
 * language but the pill text still carries the actual timestamp, so the
 * "Scheduled time" / "Sent time" data the spec asks for is never lost.
 */
function StatusPill({ row }: { row: EmailRow }) {
  if (row.status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }
  if (row.status === "SENT") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        <Send className="h-3.5 w-3.5" />
        {formatTime(row.sentAt ?? row.scheduledAt)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      <Clock className="h-3.5 w-3.5" />
      {formatTime(row.scheduledAt)}
    </span>
  );
}

export function EmailList({
  mode,
  rows,
  isLoading,
  error,
}: {
  mode: "scheduled" | "sent";
  rows: EmailRow[];
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) return <LoadingRows />;
  if (error) return <ErrorState message={error} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title={mode === "scheduled" ? "No scheduled emails" : "No sent emails yet"}
        subtitle={
          mode === "scheduled"
            ? "Compose a new email to schedule your first send."
            : "Emails will show up here once they've been sent."
        }
      />
    );
  }

  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50">
          <div className="w-48 shrink-0 truncate text-sm font-medium text-gray-900">
            To: {row.recipient}
          </div>
          <div className="shrink-0">
            <StatusPill row={row} />
          </div>
          <div className="min-w-0 flex-1 truncate text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{row.subject}</span>
            {" — "}
            {row.bodyPreview}
            {row.error && <span className="ml-2 text-xs text-red-600">({row.error})</span>}
          </div>
          <Star className="h-4 w-4 shrink-0 text-gray-300 hover:text-amber-400" />
        </div>
      ))}
    </div>
  );
}
