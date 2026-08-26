import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin-gate";
import { logger } from "@/lib/logger";
import { getAuthenticatedUser } from "@/lib/server-auth";

/**
 * Shell del pannello operatore.
 *
 * È l'**unico** gate di `/admin/*`: le funzioni che leggono le metriche non
 * sono server action e non hanno un endpoint proprio, quindi passare di qui è
 * l'unico modo per raggiungerle. Il middleware (`src/proxy.ts`) tratta
 * `/admin` come route protetta e rimbalza al login chi non ha sessione, ma il
 * controllo va rifatto qui: il middleware garantisce l'autenticazione, non
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
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    redirect("/login");
  }

  if (!isAdminEmail(user.email)) {
    // warn e non error (regola 20): è una condizione prevedibile — un URL
    // indovinato o condiviso — non un guasto. Solo lo user id, mai l'email
    // (denylist telemetria di src/lib/logger.ts).
    logger.warn(
      { errorClass: "admin_forbidden", userId: user.id },
      "admin: accesso negato, email fuori allowlist",
    );
    notFound();
  }

  return (
    <div className="container mx-auto min-h-screen px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Pannello operatore</h1>
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Torna all&apos;app
        </Link>
      </header>
      {children}
    </div>
  );
}
