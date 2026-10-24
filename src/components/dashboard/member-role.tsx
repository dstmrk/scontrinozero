"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MemberRole } from "@/db/schema/business-members";

/**
 * Il ruolo di chi usa il dashboard (issue #1099), letto dal layout e passato
 * ai componenti client che cambiano per il collaboratore: la nav senza
 * Analytics, i messaggi "chiedi al titolare", i comandi riservati al titolare.
 *
 * Decide solo cosa si vede: i permessi li applicano le server action. Il
 * default è il titolare, così un componente montato fuori dal dashboard, o in
 * un test, si comporta come prima.
 */
const MemberRoleContext = createContext<MemberRole>("owner");

export function MemberRoleProvider({
  role,
  children,
}: Readonly<{ role: MemberRole; children: ReactNode }>) {
  return (
    <MemberRoleContext.Provider value={role}>
      {children}
    </MemberRoleContext.Provider>
  );
}

export function useIsCollaborator(): boolean {
  return useContext(MemberRoleContext) === "collaborator";
}
