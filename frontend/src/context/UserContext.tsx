"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface CurrentUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const UserContext = createContext<CurrentUser | null>(null);

export function UserProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within the /dashboard route tree");
  return ctx;
}
