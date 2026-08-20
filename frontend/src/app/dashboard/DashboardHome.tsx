"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, SlidersHorizontal, RotateCw } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { EmailList } from "@/components/EmailList";
import { fetchEmailCounts, fetchEmails, ApiError } from "@/lib/api";
import type { EmailCounts, EmailRow } from "@/types";

type Tab = "scheduled" | "sent";

export function DashboardHome() {
  const [tab, setTab] = useState<Tab>("scheduled");
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [counts, setCounts] = useState<EmailCounts>({ scheduled: 0, sent: 0 });
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (activeTab: Tab) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [{ emails }, freshCounts] = await Promise.all([
        fetchEmails(activeTab),
        fetchEmailCounts(),
      ]);
      setRows(emails);
      setCounts(freshCounts);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not reach the backend API.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-dependency-change; load() sets loading state before its first await
    load(tab);
  }, [tab, load]);

  // Light polling so the list reflects the worker's progress without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => load(tab), 8000);
    return () => clearInterval(id);
  }, [tab, load]);

  const visibleRows = query.trim()
    ? rows.filter(
        (r) =>
          r.recipient.toLowerCase().includes(query.toLowerCase()) ||
          r.subject.toLowerCase().includes(query.toLowerCase())
      )
    : rows;

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar activeTab={tab} onTabChange={setTab} counts={counts} />

      <main className="min-w-0 flex-1 bg-gray-50/40 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border-0 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            title="Filter"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 ring-1 ring-inset ring-gray-200 hover:bg-white"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            title="Refresh"
            onClick={() => load(tab)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 ring-1 ring-inset ring-gray-200 hover:bg-white"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <EmailList mode={tab} rows={visibleRows} isLoading={isLoading} error={loadError} />
      </main>
    </div>
  );
}
