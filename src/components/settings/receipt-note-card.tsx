import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BILLING_SETTINGS_HREF,
  canUsePro,
  type Plan,
} from "@/lib/plans-shared";
import { ReceiptNoteSection } from "./receipt-note-section";

/**
 * Card "Personalizza lo scontrino" delle impostazioni: il messaggio di cortesia
 * stampato in coda al documento commerciale, dove il layout standard AdE scrive
 * "Arrivederci e Grazie!".
 *
 * La card c'è SEMPRE, anche sui piani senza accesso: chi non ha la feature ne
 * vede la descrizione e l'upsell invece del campo. Stessa scelta di
 * `ApiKeyCard`, nata da un utente che cercava una feature di cui l'app non
 * faceva parola.
 *
 * Presentazionale puro (nessun hook): resta renderizzabile dal server component
 * della pagina e testabile con `render()`.
 */
export function ReceiptNoteCard({
  businessId,
  note,
  plan,
  planExpiresAt,
  trialStartedAt,
}: {
  readonly businessId: string;
  readonly note: string | null;
  readonly plan: Plan;
  readonly planExpiresAt: Date | null;
  readonly trialStartedAt: Date | null;
}) {
  const unlocked = canUsePro(plan, planExpiresAt, trialStartedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalizza lo scontrino</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Aggiungi un messaggio di cortesia in fondo agli scontrini che emetti —
          un saluto, gli orari, il tuo profilo social.{" "}
          {/* Path relativo: dal dominio app il middleware fa l'hop verso il
              dominio marketing (stesso pattern di `SupportSection`). */}
          <a
            href="/help/messaggio-personalizzato-scontrino"
            className="text-primary hover:underline"
          >
            Come funziona
          </a>
          {"."}
        </p>

        {unlocked ? (
          <ReceiptNoteSection businessId={businessId} initialNote={note} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Il messaggio personalizzato è incluso nel piano Pro e nella prova
              gratuita.
            </p>
            <a
              href={BILLING_SETTINGS_HREF}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Passa a Pro
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
