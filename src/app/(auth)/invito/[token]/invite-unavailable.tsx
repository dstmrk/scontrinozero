import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InviteView } from "./invite-view";

/** Invito scaduto, inesistente o non leggibile: cosa dire e dove mandare. */
export function InviteUnavailable({
  view,
}: Readonly<{ view: Exclude<InviteView, { kind: "valid" }> }>) {
  if (view.kind === "error") {
    return (
      <Notice title="Invito">
        Non riusciamo a leggere l&apos;invito. Riprova tra qualche minuto.
      </Notice>
    );
  }
  if (view.kind === "expired") {
    return (
      <Notice title="Invito scaduto">
        L&apos;invito di {view.businessName ?? "questa attività"} è scaduto:
        chiedi al titolare di mandartene uno nuovo.
      </Notice>
    );
  }
  return (
    <Notice title="Invito non valido">
      Il link non vale più: l&apos;invito è stato revocato, sostituito da uno
      più recente o già usato. Se hai già creato il tuo accesso,{" "}
      <Link href="/login" className="text-primary underline">
        accedi
      </Link>
      .
    </Notice>
  );
}

function Notice({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{children}</p>
      </CardContent>
    </Card>
  );
}
