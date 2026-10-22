import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { APP_VERSION, getBuildLabel } from "@/lib/version";
import { requireAdminOrNotFound } from "@/server/admin-guard";

/**
 * Shell del pannello amministratore.
 *
 * Primo gate di `/admin/*`, **non l'unico**: un layout non gira a ogni
 * richiesta (vedi `src/server/admin-guard.ts`), quindi lo stesso controllo è
 * ripetuto in `page.tsx` e in `runAdminRead`, dove il dato viene letto. Il
 * middleware (`src/proxy.ts`) tratta `/admin` come route protetta e rimbalza
 * al login chi non ha sessione, ma garantisce l'autenticazione, non
 * l'autorizzazione.
 *
 * Un utente autenticato ma fuori allowlist riceve **404, non 403**: un 403
 * confermerebbe a chiunque abbia un account che il pannello esiste.
 *
 * Nessuna chrome del dashboard (bottom nav, tour, prompt PWA) e nessun
 * redirect all'onboarding: il pannello non è un'area prodotto e chi lo apre
 * non sta usando la cassa.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminOrNotFound();

  return (
    <div className="container mx-auto min-h-screen px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Pannello amministratore</h1>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            ScontrinoZero {APP_VERSION} &mdash; build {getBuildLabel()}
          </span>
          <Link
            href="/dashboard"
            aria-label="Torna all'app"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
