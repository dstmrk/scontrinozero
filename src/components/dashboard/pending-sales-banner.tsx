"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type {
  PendingCandidate,
  PendingSaleSummary,
  VerifyPendingSaleResult,
} from "@/lib/services/pending-verification";
import {
  confirmPendingDocument,
  verifyPendingDocument,
} from "@/server/pending-actions";

/**
 * Data e ora italiane di un istante ISO.
 *
 * `timeZone` esplicito e non il fuso del runtime: il banner è un client
 * component ma viene comunque server-renderizzato, e il server gira in UTC —
 * senza il fuso fissato l'HTML e l'idratazione mostrerebbero due ore diverse
 * (regola 15).
 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

/**
 * Un messaggio per esito, orientato all'azione successiva: quello che
 * l'esercente deve sapere è se può battere di nuovo o no.
 */
type SettledOutcome = Exclude<
  Extract<VerifyPendingSaleResult, { outcome: string }>["outcome"],
  // `ambiguous` non ha un messaggio: apre la scelta fra i candidati, che è una
  // domanda, non un esito da riferire.
  "ambiguous"
>;

const RESULT_MESSAGES: Record<SettledOutcome, string> = {
  accepted:
    "Lo scontrino era già registrato all'Agenzia delle Entrate: ora lo trovi nello storico. Non riemetterlo.",
  "not-registered":
    "Nessun documento corrispondente all'Agenzia delle Entrate: la vendita non è stata trasmessa. Riemetti lo scontrino dalla cassa.",
  "in-progress":
    "Lo scontrino è ancora in elaborazione. Riprova fra qualche minuto.",
  settled: "Lo scontrino è già stato chiuso. Ricarica la pagina.",
};

/**
 * Avviso non bloccante sugli scontrini rimasti in sospeso, con l'azione che li
 * verifica su AdE (REVIEW.md #103, slice 2).
 *
 * **Un banner, non righe nello storico.** Storico e analytics continuano a
 * filtrare `ACCEPTED`/`VOID_ACCEPTED`: una riga che potrebbe non essere nulla
 * non deve sporcare la lista dei documenti emessi né il fatturato. Ma non deve
 * nemmeno restare invisibile, che è il difetto da cui nasce tutto.
 *
 * **Su candidati multipli sceglie l'esercente, mai il codice.** Quando lo
 * stesso importo ricorre più volte nello stesso giorno nessuna euristica sa
 * quale documento AdE corrisponda a questa vendita. Chi sta al banco sì.
 */
export function PendingSalesBanner({
  businessId,
  documents,
}: {
  readonly businessId: string;
  readonly documents: readonly PendingSaleSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<{
    documentId: string;
    candidates: readonly PendingCandidate[];
  } | null>(null);

  if (documents.length === 0) return null;

  function applyResult(result: VerifyPendingSaleResult): void {
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    if (result.outcome === "ambiguous") {
      setAmbiguous({
        documentId: result.documentId,
        candidates: result.candidates,
      });
      setMessage(null);
      return;
    }
    setAmbiguous(null);
    setMessage(RESULT_MESSAGES[result.outcome]);
    // `refresh()` e non un aggiornamento locale: la riga può essere sparita
    // dall'elenco, comparsa nello storico o entrambe, e la verità sta nel
    // server component che ha reso il banner.
    router.refresh();
  }

  function run(
    documentId: string,
    action: () => Promise<VerifyPendingSaleResult>,
  ): void {
    setBusyId(documentId);
    setMessage(null);
    startTransition(async () => {
      try {
        applyResult(await action());
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <Alert variant="warning" className="mb-4">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription className="space-y-3">
        <p>
          {documents.length === 1
            ? "Uno scontrino non ha ricevuto conferma dall'Agenzia delle Entrate."
            : `${documents.length} scontrini non hanno ricevuto conferma dall'Agenzia delle Entrate.`}{" "}
          Verifica se sono stati registrati prima di riemetterli.
        </p>

        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span>
                {formatCurrency(doc.totalCents / 100)} &middot;{" "}
                {formatDateTime(doc.createdAt)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  run(doc.id, () => verifyPendingDocument(businessId, doc.id))
                }
              >
                {busyId === doc.id && (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                )}
                Verifica stato
              </Button>
            </li>
          ))}
        </ul>

        {ambiguous && (
          <div className="space-y-2">
            <p className="font-medium">
              L&apos;Agenzia delle Entrate ha più documenti compatibili. Quale
              corrisponde a questa vendita?
            </p>
            <ul className="space-y-2">
              {ambiguous.candidates.map((candidate) => (
                <li
                  key={candidate.idtrx}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    {candidate.numeroProgressivo} &middot; {candidate.data}{" "}
                    &middot; {formatCurrency(candidate.totalCents / 100)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      run(ambiguous.documentId, () =>
                        confirmPendingDocument(
                          businessId,
                          ambiguous.documentId,
                          candidate.idtrx,
                        ),
                      )
                    }
                  >
                    <Check aria-hidden="true" /> È questo
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs">
              Se non riconosci nessuno di questi documenti non confermare:
              riemetti lo scontrino dalla cassa.
            </p>
          </div>
        )}

        {message && <p role="status">{message}</p>}
      </AlertDescription>
    </Alert>
  );
}
