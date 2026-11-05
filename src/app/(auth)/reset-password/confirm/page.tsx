import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmResetForm } from "./confirm-reset-form";

/**
 * Il token del reset sta nella query: la pagina non va indicizzata e il suo
 * URL non deve uscire come `Referer` verso nessuna richiesta, nemmeno
 * same-origin (tunnel Sentry, analytics).
 */
export const metadata: Metadata = {
  title: "Reimposta la password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Atterraggio del link di reset password (issue #1159). La GET non chiama
 * Supabase: uno scanner di posta aziendale che apre il link prima
 * dell'utente non consuma il token. Lo consuma il pulsante, con il POST di
 * `confirmPasswordReset`.
 */
export default async function ConfirmResetPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token_hash?: string | string[] }>;
}) {
  const { token_hash: raw } = await searchParams;
  const tokenHash = typeof raw === "string" ? raw.trim() : "";

  if (tokenHash) return <ConfirmResetForm tokenHash={tokenHash} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Link non valido</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-center text-sm">
          Il link per reimpostare la password è incompleto. Aprilo di nuovo
          dall&apos;email, oppure richiedine uno nuovo.
        </p>
        <p className="text-center text-sm">
          <Link href="/reset-password" className="text-primary underline">
            Richiedi un nuovo link
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
