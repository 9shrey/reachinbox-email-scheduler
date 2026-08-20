import clsx from "clsx";
import type { EmailStatus } from "@/types";

const styles: Record<EmailStatus, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[status]
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
