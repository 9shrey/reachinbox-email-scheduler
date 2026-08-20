"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">Login</h1>

        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-emerald-100"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.19 3.32v2.77h3.55c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.77c-.98.66-2.23 1.06-3.73 1.06-2.87 0-5.3-1.94-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09A6.6 6.6 0 015.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.07l3.66 2.84C6.7 7.32 9.13 5.38 12 5.38z"
            />
          </svg>
          Login with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">or sign up through email</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div className="space-y-3" title="Email/password sign-in isn't implemented — this build uses Google OAuth only, per the assignment's requirements.">
          <input
            disabled
            placeholder="Email ID"
            className="w-full cursor-not-allowed rounded-lg border-0 bg-gray-100 px-3 py-2.5 text-sm text-gray-400 placeholder:text-gray-400"
          />
          <input
            disabled
            placeholder="Password"
            type="password"
            className="w-full cursor-not-allowed rounded-lg border-0 bg-gray-100 px-3 py-2.5 text-sm text-gray-400 placeholder:text-gray-400"
          />
          <button
            disabled
            className="w-full cursor-not-allowed rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-medium text-white"
          >
            Login
          </button>
          <p className="text-center text-xs text-gray-400">Use “Login with Google” above — email/password isn’t wired up.</p>
        </div>
      </div>
    </div>
  );
}
