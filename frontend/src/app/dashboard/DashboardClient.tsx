"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { ComposeModal } from "@/components/ComposeModal";
import { EmailTable } from "@/components/EmailTable";
import { fetchEmails, fetchSenders, ApiError } from "@/lib/api";
import type { EmailRow, Sender } from "@/types";

type Tab = "scheduled" | "sent";

export function DashboardClient({
  name,
  email,
  image,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("scheduled");
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async (activeTab: Tab) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { emails } = await fetchEmails(activeTab);
      setRows(emails);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not reach the backend API.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useEffect(() => {
    fetchSenders()
      .then(({ senders }) => setSenders(senders))
      .catch(() => {});
  }, []);

  // Light polling so the tables reflect the worker's progress without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => load(tab), 8000);
    return () => clearInterval(id);
  }, [tab, load]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header name={name} email={email} image={image} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Emails</h1>
            <p className="text-sm text-gray-500">Schedule, track, and review your cold email sends.</p>
          </div>
          <Button onClick={() => setComposeOpen(true)}>+ Compose new email</Button>
        </div>

        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {(["scheduled", "sent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "scheduled" ? "Scheduled Emails" : "Sent Emails"}
            </button>
          ))}
        </div>

        <EmailTable mode={tab} rows={rows} isLoading={isLoading} error={loadError} />
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        senders={senders}
        createdByEmail={email ?? undefined}
        onScheduled={() => load("scheduled")}
      />
    </div>
  );
}
