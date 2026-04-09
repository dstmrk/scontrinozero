"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { searchReceipts } from "@/server/storico-actions";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STORICO_PAGE_SIZE,
  type ReceiptListItem,
  type SearchReceiptsParams,
  type StatusFilter,
  type VoidReceiptResult,
} from "@/types/storico";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatProgressive(progressive: string | null): string {
  if (!progressive) return "—";
  const slashIndex = progressive.indexOf("/");
  if (slashIndex === -1) return progressive;
  return progressive.slice(slashIndex + 1);
}

function formatCurrency(amount: string): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number.parseFloat(amount));
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
}: StoricoClientProps) {
  const router = useRouter();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  const [receipts, setReceipts] = useState<ReceiptListItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [selected, setSelected] = useState<ReceiptListItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);

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

  // Handle search — also syncs filters to URL for deep-linking
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const dateFrom = dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd")
      : undefined;
    const dateTo = dateRange?.to
      ? format(dateRange.to, "yyyy-MM-dd")
      : undefined;

    const urlParams = new URLSearchParams();
    if (dateFrom) urlParams.set("dal", dateFrom);
    if (dateTo) urlParams.set("al", dateTo);
    urlParams.set("stato", statusFilter);
    router.replace(`/dashboard/storico?${urlParams.toString()}`);

    const params: SearchReceiptsParams = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (statusFilter) params.status = statusFilter;

    startTransition(async () => {
      const result = await searchReceipts(businessId, {
        ...params,
        page: 1,
        pageSize: PAGE_SIZE,
      });
      setReceipts(result.items);
      setTotal(result.total);
      setPage(1);
    });
  }

  // Handle page change — re-fetches from server with same filters, new page
  function handlePageChange(newPage: number) {
    const dateFrom = dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd")
      : undefined;
    const dateTo = dateRange?.to
      ? format(dateRange.to, "yyyy-MM-dd")
      : undefined;

    startTransition(async () => {
      const result = await searchReceipts(businessId, {
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        page: newPage,
        pageSize: PAGE_SIZE,
      });
      setReceipts(result.items);
      setTotal(result.total);
      setPage(newPage);
    });
  }

  // Handle void success: update the row status optimistically
  function handleVoidSuccess(result: VoidReceiptResult, originalId: string) {
    if (result.error) return;
    setReceipts((prev) =>
      prev.map((r) =>
        r.id === originalId ? { ...r, status: "VOID_ACCEPTED" } : r,
      ),
    );
    setSelected(null);
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
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "Ricerca…" : "Cerca"}
        </Button>
      </form>

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
                      {formatDate(receipt.createdAt)}
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
              onClick={() => void handlePageChange(page - 1)}
              disabled={page === 1 || isPending}
            >
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePageChange(page + 1)}
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
          onClose={() => setSelected(null)}
          onSuccess={handleVoidSuccess}
        />
      )}
    </div>
  );
}
