"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  getReceiptDetail,
  searchReceipts,
  searchReceiptsIncludingAde,
} from "@/server/storico-actions";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import { ExportCsvButton } from "@/app/dashboard/storico/export-csv-button";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { canUsePro, type Plan } from "@/lib/plans-shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ADE_SEARCH_MAX_DAYS,
  STORICO_PAGE_SIZE,
  type ReceiptListItem,
  type SearchReceiptsParams,
  type StatusFilter,
  type StoricoRow,
  type VoidReceiptResult,
} from "@/types/storico";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatProgressive(progressive: string | null): string {
  if (!progressive) return "—";
  const slashIndex = progressive.indexOf("/");
  if (slashIndex === -1) return progressive;
  return progressive.slice(slashIndex + 1);
}

/**
 * Marca una riga che vive solo sull'archivio AdE.
 *
 * Non è solo un colore: il colore da solo sarebbe l'unico veicolo
 * dell'informazione (WCAG 1.4.1) e sparirebbe in stampa, in monocromia e per
 * chi non distingue quella coppia di tinte. La sigla accanto al progressivo
 * regge da sola, e sta dentro la colonna che già c'è — nessuna colonna nuova.
 *
 * Nemmeno `opacity-60`, che in questa tabella significa già "riga non
 * apribile perché fallita": un documento regolarmente emesso altrove non è un
 * documento in errore.
 */
function OriginBadge() {
  return (
    <span
      className="ml-2 rounded border border-sky-200 bg-sky-50 px-1 py-px align-middle text-[10px] font-medium tracking-wide text-sky-700"
      title="Documento emesso fuori da ScontrinoZero, letto dall'archivio dell'Agenzia delle Entrate"
    >
      AdE
    </span>
  );
}

function StatusBadge({
  status,
}: Readonly<{ status: ReceiptListItem["status"] }>) {
  if (status === "ACCEPTED") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Emesso
      </span>
    );
  }
  if (status === "VOID_ACCEPTED") {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        Annullato
      </span>
    );
  }
  if (status === "ERROR") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Errore
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
        In corso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = STORICO_PAGE_SIZE;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StoricoClientProps {
  readonly businessId: string;
  readonly initialItems: ReceiptListItem[];
  readonly initialTotal: number;
  readonly initialDateFrom?: string;
  readonly initialDateTo?: string;
  readonly initialStatus?: StatusFilter;
  /** Stato iniziale del flag "cerca anche su AdE", da `?ade=1`. */
  readonly initialIncludeAde?: boolean;
  readonly plan: Plan;
  readonly trialStartedAt?: Date | null;
  /** Intestazione esercente per la ristampa su termica; `null` se incompleta. */
  readonly printProfile?: ReceiptPrintProfile | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StoricoClient({
  businessId,
  initialItems,
  initialTotal,
  initialDateFrom,
  initialDateTo,
  initialStatus,
  initialIncludeAde = false,
  plan,
  trialStartedAt = null,
  printProfile = null,
}: StoricoClientProps) {
  const router = useRouter();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  const [receipts, setReceipts] = useState<StoricoRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [selected, setSelected] = useState<ReceiptListItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);

  const isPro = canUsePro(plan, null, trialStartedAt);

  /**
   * Filtro, non interruttore istantaneo: si applica premendo "Cerca", come il
   * periodo e lo stato. Spuntarlo non deve far partire da solo un login AdE.
   */
  const [includeAde, setIncludeAde] = useState(initialIncludeAde && isPro);

  /**
   * Cosa è andato storto **nel solo ramo AdE** dell'ultima ricerca. Separato
   * dall'elenco di proposito: quando l'Agenzia non risponde le righe nostre
   * restano a schermo e questo avviso spiega cosa manca.
   */
  const [adeNotice, setAdeNotice] = useState<{
    error?: string;
    reauthRequired?: boolean;
    truncated?: boolean;
  }>({});

  // Parse optional YYYY-MM-DD string to Date (avoids UTC timezone shift)
  function parseISODate(str: string | undefined): Date | undefined {
    if (!str) return undefined;
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }

  // Search form state — initialised from URL params passed by server
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: parseISODate(initialDateFrom) ?? sevenDaysAgo,
    to: parseISODate(initialDateTo) ?? today,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialStatus ?? "ACCEPTED",
  );

  /** I filtri correnti nella forma che le due server action accettano. */
  function currentParams(): SearchReceiptsParams {
    const params: SearchReceiptsParams = {};
    if (dateRange?.from) params.dateFrom = format(dateRange.from, "yyyy-MM-dd");
    if (dateRange?.to) params.dateTo = format(dateRange.to, "yyyy-MM-dd");
    if (statusFilter) params.status = statusFilter;
    return params;
  }

  /**
   * Una ricerca, due possibili sorgenti.
   *
   * Con il flag attivo l'attesa è dichiarata e la ricerca è **una sola**: la
   * variante progressiva — righe locali subito, righe AdE che si fondono dopo
   * — riordinerebbe l'elenco sotto le dita di chi sta già leggendo, che è
   * peggio di qualche secondo annunciato.
   */
  function runSearch(newPage: number, withAde: boolean) {
    const params = currentParams();
    startTransition(async () => {
      if (!withAde) {
        const result = await searchReceipts(businessId, {
          ...params,
          page: newPage,
          pageSize: PAGE_SIZE,
        });
        setReceipts(result.items);
        setTotal(result.total);
        setAdeNotice({});
        setPage(newPage);
        return;
      }

      const result = await searchReceiptsIncludingAde(businessId, {
        ...params,
        page: newPage,
        pageSize: PAGE_SIZE,
      });
      // `error` è un rifiuto della richiesta intera (periodo troppo largo,
      // piano, rate limit): non c'è nessun elenco da mostrare. `adeError` è il
      // degrado del solo ramo AdE, e lì le righe nostre ci sono.
      setReceipts(result.items);
      setTotal(result.total);
      setAdeNotice({
        error: result.error ?? result.adeError,
        reauthRequired: result.adeReauthRequired,
        truncated: result.adeTruncated,
      });
      setPage(newPage);
    });
  }

  // Handle search — also syncs filters to URL for deep-linking
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const params = currentParams();
    const urlParams = new URLSearchParams();
    if (params.dateFrom) urlParams.set("dal", params.dateFrom);
    if (params.dateTo) urlParams.set("al", params.dateTo);
    urlParams.set("stato", statusFilter);
    if (includeAde) urlParams.set("ade", "1");
    router.replace(`/dashboard/storico?${urlParams.toString()}`);

    runSearch(1, includeAde);
  }

  // Handle page change — re-fetches from server with same filters, new page
  function handlePageChange(newPage: number) {
    runSearch(newPage, includeAde);
  }

  /**
   * Sostituisce una riga sia nell'elenco sia nella modale, quando è quella
   * aperta. Le due copie della stessa vendita devono muoversi insieme: la
   * modale resta montata durante l'annullo, e una sola aggiornata mostrerebbe
   * due verità sullo stesso documento.
   */
  function replaceRow(
    documentId: string,
    update: (row: ReceiptListItem) => ReceiptListItem,
  ) {
    setReceipts((prev) =>
      prev.map((r) =>
        r.origin === "local" && r.id === documentId ? update(r) : r,
      ),
    );
    setSelected((prev) => (prev?.id === documentId ? update(prev) : prev));
  }

  // Handle void success: update the row status optimistically
  function handleVoidSuccess(result: VoidReceiptResult, originalId: string) {
    if (result.error) return;
    // La modale NON si chiude: mostra la conferma e, appena la rilettura
    // arriva, la ricevuta di annullamento da consegnare al cliente che è
    // ancora al banco. Chiuderla qui costringeva a ritrovare e riaprire la
    // riga proprio in quel momento.
    replaceRow(originalId, (r) => ({ ...r, status: "VOID_ACCEPTED" }));
    refreshVoidedRow(originalId);
  }

  /**
   * Rilegge dal server la riga appena annullata.
   *
   * L'aggiornamento ottimistico qui sopra sa solo che lo stato è passato a
   * VOID_ACCEPTED: l'annullo appena creato (id, progressivo, istante
   * registrato dall'AdE) nasce sul server e il client non può inventarselo —
   * è il documento da consegnare al cliente, l'orario deve essere quello
   * fiscale. Senza questa rilettura la modale resta sulla conferma senza
   * ricevuta di annullamento né stampa, e i bottoni compaiono solo rifacendo
   * la ricerca.
   *
   * Fallimento (sessione scaduta, DB in errore) → si tiene la riga
   * ottimistica: la ricerca successiva la riallinea comunque.
   */
  function refreshVoidedRow(documentId: string) {
    startTransition(async () => {
      const detail = await getReceiptDetail(businessId, documentId);
      const fresh = detail.item;
      if (!fresh) return;
      replaceRow(documentId, () => fresh);
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summaryText = `${total} scontrini trovati.`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Storico scontrini</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {total === 0 ? "Nessuno scontrino trovato." : summaryText}
        </p>
      </div>

      {/* Search form */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap items-end gap-3 rounded-lg border px-3 py-2"
      >
        <div className="min-w-[200px]">
          <label htmlFor="periodo" className="mb-1 block text-xs font-medium">
            Periodo
          </label>
          <DateRangePicker
            id="periodo"
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
        <div className="min-w-[140px]">
          <label
            htmlFor="statusFilter"
            className="mb-1 block text-xs font-medium"
          >
            Stato
          </label>
          <Select
            value={statusFilter === "" ? "ALL" : statusFilter}
            onValueChange={(v) =>
              setStatusFilter((v === "ALL" ? "" : v) as StatusFilter)
            }
          >
            <SelectTrigger id="statusFilter" className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACCEPTED">Emesso</SelectItem>
              <SelectItem value="VOID_ACCEPTED">Annullato</SelectItem>
              <SelectItem value="ALL">Tutti</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isPro && (
          <div className="flex w-full items-start gap-2 pt-1">
            <Checkbox
              id="includeAde"
              checked={includeAde}
              onCheckedChange={(v) => setIncludeAde(v === true)}
              disabled={isPending}
            />
            <label htmlFor="includeAde" className="text-xs leading-snug">
              <span className="font-medium">
                Cerca anche i documenti emessi fuori da ScontrinoZero
              </span>
              <span className="text-muted-foreground block">
                Legge l&apos;archivio dell&apos;Agenzia delle Entrate: richiede
                qualche secondo, copre al massimo {ADE_SEARCH_MAX_DAYS} giorni
                per volta e i documenti trovati sono di sola lettura.
              </span>
            </label>
          </div>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "Ricerca…" : "Cerca"}
        </Button>
        <ExportCsvButton
          plan={plan}
          trialStartedAt={trialStartedAt}
          dateFrom={
            dateRange?.from
              ? format(dateRange.from, "yyyy-MM-dd")
              : format(sevenDaysAgo, "yyyy-MM-dd")
          }
          dateTo={
            dateRange?.to
              ? format(dateRange.to, "yyyy-MM-dd")
              : format(today, "yyyy-MM-dd")
          }
          status={statusFilter === "" ? null : statusFilter}
          includeAde={includeAde}
        />
      </form>

      {/* Avvisi del ramo AdE — mai al posto dell'elenco, sempre accanto */}
      {adeNotice.error && (
        <Alert variant="warning">
          <AlertDescription>
            {adeNotice.error}
            {adeNotice.reauthRequired && (
              <>
                {" "}
                <a href="/dashboard/settings" className="underline">
                  Vai alle impostazioni per ricollegarti
                </a>
                {"."}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {adeNotice.truncated && (
        <Alert>
          <AlertDescription>
            L&apos;archivio dell&apos;Agenzia delle Entrate contiene più
            documenti di quanti se ne possano leggere in una volta: restringi il
            periodo per vederli tutti.
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      {total === 0 ? (
        <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
          Nessuno scontrino trovato per i filtri selezionati.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-left font-medium">Progressivo</th>
                <th className="px-3 py-2 text-right font-medium">Totale</th>
                <th className="px-3 py-2 text-left font-medium">Stato</th>
                <th className="px-3 py-2" aria-label="Dettaglio"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {receipts.map((receipt) => {
                // Le righe che vivono solo su AdE non si aprono: la ricerca ne
                // restituisce la sola testata, quindi non c'è nessun dettaglio
                // da mostrare — e non sono annullabili, perché l'annullo
                // creerebbe una riga VOID che punta a un documento che nel
                // nostro database non esiste.
                if (receipt.origin === "ade") {
                  return (
                    <tr key={`ade:${receipt.idtrx}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(receipt.adeRegisteredAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-muted-foreground font-mono text-xs">
                          {formatProgressive(receipt.adeProgressive)}
                        </span>
                        <OriginBadge />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(receipt.total)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={receipt.status} />
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  );
                }

                // SALE receipts (both ACCEPTED and VOID_ACCEPTED) can open the
                // detail dialog to view lines and re-send the PDF receipt.
                const hasDetail =
                  receipt.kind === "SALE" &&
                  (receipt.status === "ACCEPTED" ||
                    receipt.status === "VOID_ACCEPTED");
                return (
                  <tr
                    key={receipt.id}
                    className={
                      hasDetail
                        ? "hover:bg-muted/30 focus-visible:bg-muted/30 cursor-pointer outline-none"
                        : "opacity-60"
                    }
                    onClick={() => hasDetail && setSelected(receipt)}
                    onKeyDown={(e) => {
                      if (hasDetail && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setSelected(receipt);
                      }
                    }}
                    tabIndex={hasDetail ? 0 : undefined}
                    aria-label={
                      hasDetail
                        ? `Apri dettaglio scontrino ${formatProgressive(receipt.adeProgressive)}`
                        : undefined
                    }
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(receipt.adeRegisteredAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">
                        {formatProgressive(receipt.adeProgressive)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(receipt.total)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={receipt.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {hasDetail && (
                        <span className="text-muted-foreground text-xs">›</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Pagina {page} di {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || isPending}
            >
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages || isPending}
            >
              Successiva
            </Button>
          </div>
        </div>
      )}

      {/* Void dialog */}
      {selected && (
        <VoidReceiptDialog
          receipt={selected}
          businessId={businessId}
          printProfile={printProfile}
          onClose={() => setSelected(null)}
          onSuccess={handleVoidSuccess}
        />
      )}
    </div>
  );
}
