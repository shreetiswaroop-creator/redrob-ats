"use client";

import { createContext, useContext } from "react";
import { UserRole } from "./types";

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

const ActorContext = createContext<{ actor: string; user: AuthedUser | null }>({ actor: "", user: null });

// "actor" here is just user.name — kept as a separate field since most call
// sites only ever needed the display name for audit-trail purposes, not the
// full user object. Real identity now comes from the verified session
// (see src/lib/session.ts), not from anything client-editable.
export function ActorProvider({ user, children }: { user: AuthedUser; children: React.ReactNode }) {
  return <ActorContext.Provider value={{ actor: user.name, user }}>{children}</ActorContext.Provider>;
}

export function useActor() {
  return useContext(ActorContext);
}
