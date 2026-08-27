import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Segnaposto dei blocchi del pannello operatore, mostrati dai boundary
 * Suspense di `src/app/admin/page.tsx` mentre la loro query è in coda o in
 * volo.
 *
 * Ricalcano la struttura del componente vero — stessa `Card`, stesse altezze,
 * stesso numero di righe — perché il punto è che il contenuto **prenda il
 * posto** dello skeleton senza spostare nulla: un layout che salta quando i
 * dati arrivano costa più fastidio di quanto lo skeleton ne risparmi.
 *
 * Titolo e descrizione delle tabelle sono quelli veri, non barrette grigie:
 * sono noti a render time e dicono all'operatore cosa sta arrivando.
 */

/**
 * Chiavi delle righe finte. Un array letterale e non l'indice dell'array:
 * stessa scelta di `src/app/dashboard/loading.tsx`. La sua lunghezza è anche
 * il tetto di righe/card che uno scheletro può disegnare — oltre servono
 * altre chiavi, non un `slice` più lungo.
 */
const ROW_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

interface AdminKpiCardsSkeletonProps {
  /** Quante card mostrare; il boundary ne copre sempre un numero fisso. */
  readonly count: number;
  /**
   * Quante delle prime card portano una sparkline.
   *
   * Non un booleano per l'intero gruppo: nei due gruppi veri le card con
   * sparkline sono 1 su 3 (utenti) e 2 su 3 (scontrini), e disegnarla su
   * tutte renderebbe lo scheletro più alto del contenuto — cioè un salto di
   * layout all'arrivo dei dati, che è proprio ciò che lo scheletro evita. In
   * entrambi i gruppi le card con sparkline vengono per prime.
   */
  readonly sparklines?: number;
  /** Cosa sta caricando, per chi usa uno screen reader. */
  readonly label: string;
}

/**
 * Card KPI finte, come frammento: si montano direttamente nella griglia della
 * pagina, così le card vere le sostituiscono una a una senza un contenitore
 * intermedio che ne alteri la disposizione.
 */
export function AdminKpiCardsSkeleton({
  count,
  sparklines = 0,
  label,
}: AdminKpiCardsSkeletonProps) {
  return (
    <>
      {ROW_KEYS.slice(0, count).map((key, index) => (
        <Card key={key} aria-hidden="true">
          <CardHeader>
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-28" />
            {index < sparklines && <Skeleton className="h-7 w-full" />}
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Caricamento di {label} in corso</span>
    </>
  );
}

interface AdminTableSkeletonProps {
  readonly title: string;
  readonly description?: string;
  /** Quante righe finte disegnare. */
  readonly rows?: number;
}

/** Tabella finta: intestazione vera, righe grigie. */
export function AdminTableSkeleton({
  title,
  description,
  rows = 5,
}: AdminTableSkeletonProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3" aria-hidden="true">
          {ROW_KEYS.slice(0, rows).map((key) => (
            <Skeleton key={key} className="h-5 w-full" />
          ))}
        </div>
        <span className="sr-only">Caricamento di {title} in corso</span>
      </CardContent>
    </Card>
  );
}
