"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Clock, Send, ChevronDown, LogOut } from "lucide-react";
import { useCurrentUser } from "@/context/UserContext";
import { Button } from "@/components/ui/Button";
import type { EmailCounts } from "@/types";

type Tab = "scheduled" | "sent";

function CountPill({ count, tone }: { count: number; tone: "active" | "neutral" }) {
  return (
    <span
      className={
        tone === "active"
          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600"
      }
    >
      {count}
    </span>
  );
}

export function Sidebar({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  counts: EmailCounts;
}) {
  const user = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-5">
      <div className="mb-6 px-1 text-xl font-extrabold tracking-tight text-gray-900">
        ReachInbox
      </div>

      <div className="relative mb-4">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-gray-50"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name ?? "User avatar"} className="h-9 w-9 rounded-full" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        </button>

        {menuOpen && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <Button
              variant="ghost"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full justify-start rounded-none px-3 py-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        )}
      </div>

      {/* Styled to match Button's "outline" variant, but rendered as a Link
          directly (not <Link><button>, which is invalid nested-interactive HTML). */}
      <Link
        href="/dashboard/compose"
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-full border border-emerald-500 bg-white px-4 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
      >
        Compose
      </Link>

      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Core</p>

      <nav className="flex flex-col gap-1">
        <button
          onClick={() => onTabChange("scheduled")}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "scheduled" ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scheduled
          </span>
          <CountPill count={counts.scheduled} tone="active" />
        </button>

        <button
          onClick={() => onTabChange("sent")}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "sent" ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Sent
          </span>
          <CountPill count={counts.sent} tone="neutral" />
        </button>
      </nav>
    </aside>
  );
}
