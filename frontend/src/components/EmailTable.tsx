import type { EmailRow } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, LoadingRows, ErrorState } from "@/components/ui/States";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmailTable({
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
  const timeLabel = mode === "scheduled" ? "Scheduled time" : "Sent time";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {timeLabel}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          {!isLoading && !error && rows.length > 0 && (
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{row.recipient}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{row.subject}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(mode === "scheduled" ? row.scheduledAt : row.sentAt)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={row.status} />
                      {row.previewUrl && (
                        <a
                          href={row.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          preview
                        </a>
                      )}
                    </div>
                    {row.error && <p className="mt-1 text-xs text-red-600">{row.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {isLoading && <LoadingRows />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          title={mode === "scheduled" ? "No scheduled emails" : "No sent emails yet"}
          subtitle={
            mode === "scheduled"
              ? "Compose a new email to schedule your first send."
              : "Emails will show up here once they've been sent."
          }
        />
      )}
    </div>
  );
}
