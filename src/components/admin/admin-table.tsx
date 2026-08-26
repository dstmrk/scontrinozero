import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Tabella del pannello operatore: intestazione, righe, stato vuoto.
 *
 * Server component senza stato — niente ordinamento o paginazione lato client,
 * quindi niente TanStack Table (che lo storico usa perché lì servono davvero
 * filtri e ordinamento interattivi). Le quattro tabelle del pannello sono
 * elenchi corti e già ordinati dal database: aggiungere un client component
 * costerebbe JavaScript per zero funzionalità in più.
 */
export interface AdminTableColumn<T> {
  readonly header: string;
  readonly cell: (row: T) => React.ReactNode;
  /** Numeri e importi vanno a destra, così le cifre si incolonnano. */
  readonly align?: "right";
}

interface AdminTableProps<T> {
  readonly title: string;
  readonly description?: string;
  readonly columns: ReadonlyArray<AdminTableColumn<T>>;
  readonly rows: readonly T[];
  /**
   * Chiave stabile della riga. Esplicita e non l'indice dell'array: le righe
   * sono già ordinate dal database e l'indice funzionerebbe, ma un giorno
   * qualcuno ordinerà questa tabella e le chiavi da indice fanno riusare a
   * React il DOM della riga sbagliata — un bug che non si vede nei test.
   */
  readonly rowKey: (row: T) => string;
  /** Testo mostrato al posto della tabella quando non ci sono righe. */
  readonly empty: string;
}

export function AdminTable<T>({
  title,
  description,
  columns,
  rows,
  rowKey,
  empty,
}: AdminTableProps<T>) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{empty}</p>
        ) : (
          // La tabella scorre nel proprio contenitore: su mobile il pannello
          // non deve far scorrere l'intera pagina in orizzontale.
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label={title}>
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  {columns.map((column) => (
                    <th
                      key={column.header}
                      scope="col"
                      className={cn(
                        "py-2 pr-3 text-left font-medium whitespace-nowrap",
                        column.align === "right" && "pr-0 pl-3 text-right",
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={rowKey(row)} className="border-b last:border-0">
                    {columns.map((column) => (
                      <td
                        key={column.header}
                        className={cn(
                          "py-2 pr-3",
                          column.align === "right" &&
                            "pr-0 pl-3 text-right tabular-nums",
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
