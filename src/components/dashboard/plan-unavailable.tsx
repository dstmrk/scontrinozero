import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Fallback inline reso al posto del contenuto di una pagina del dashboard
 * quando la lettura del piano degrada (`getPlanSafe` → `{ ok: false, error }`,
 * REVIEW.md #85).
 *
 * Sta dentro la shell del dashboard, quindi header e navigazione restano
 * usabili: l'esercente può cambiare pagina invece di trovarsi davanti a uno
 * schermo d'errore. `message` arriva dal chiamante perché è l'unica cosa che
 * distingue "profilo orfano" (serve il supporto) da "DB sovraccarico"
 * (transitorio, basta riprovare) — distinzione che il boundary di segmento non
 * può fare, visto che in produzione Next gli cancella il messaggio.
 */
export function PlanUnavailable({ message }: Readonly<{ message: string }>) {
  return (
    <div className="mx-auto max-w-sm py-8">
      <Alert variant="critical">
        <AlertTitle>Impossibile caricare il tuo piano</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  );
}
