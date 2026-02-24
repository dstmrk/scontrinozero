"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { searchReceipts } from "@/server/void-actions";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ReceiptListItem,
  SearchReceiptsParams,
  VoidReceiptResult,
} from "@/types/storico";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: string): string {
  return `€ ${parseFloat(amount).toFixed(2).replace(".", ",")}`;
}

function StatusBadge({ status }: { status: ReceiptListItem["status"] }) {
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

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StoricoClientProps {
  businessId: string;
  initialData: ReceiptListItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StoricoClient({ businessId, initialData }: StoricoClientProps) {
  const [receipts, setReceipts] = useState<ReceiptListItem[]>(initialData);
  const [selected, setSelected] = useState<ReceiptListItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);

  // Search form state — defaults aligned with page.tsx server-side prefetch
  const todayStr = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState<
    "" | "ACCEPTED" | "VOID_ACCEPTED"
  >("ACCEPTED");

  // Handle search
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const params: SearchReceiptsParams = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (statusFilter) params.status = statusFilter;

    startTransition(async () => {
      const results = await searchReceipts(businessId, params);
      setReceipts(results);
      setPage(1);
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

  const voidableCount = receipts.filter((r) => r.status === "ACCEPTED").length;
  const totalPages = Math.max(1, Math.ceil(receipts.length / PAGE_SIZE));
  const pagedReceipts = receipts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Storico scontrini</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {receipts.length === 0
            ? "Nessuno scontrino trovato."
            : `${receipts.length} scontrini trovati${voidableCount > 0 ? `, ${voidableCount} annullabili` : ""}.`}
        </p>
      </div>

      {/* Search form */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap items-end gap-3 rounded-lg border px-4 py-3"
      >
        <div className="min-w-[140px]">
          <label htmlFor="dateFrom" className="mb-1 block text-xs font-medium">
            Dal
          </label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="min-w-[140px]">
          <label htmlFor="dateTo" className="mb-1 block text-xs font-medium">
            Al
          </label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="min-w-[140px]">
          <label
            htmlFor="statusFilter"
            className="mb-1 block text-xs font-medium"
          >
            Stato
          </label>
          <div className="relative">
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "" | "ACCEPTED" | "VOID_ACCEPTED",
                )
              }
              className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 h-8 w-full min-w-0 appearance-none rounded-lg border bg-transparent px-2.5 py-1 pr-7 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              <option value="ACCEPTED">Emesso</option>
              <option value="VOID_ACCEPTED">Annullato</option>
              <option value="">Tutti</option>
            </select>
            <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2" />
          </div>
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Ricerca…" : "Cerca"}
        </Button>
      </form>

      {/* Table */}
      {receipts.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
          Nessuno scontrino trovato per i filtri selezionati.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Data</th>
                <th className="px-4 py-3 text-left font-medium">Progressivo</th>
                <th className="px-4 py-3 text-right font-medium">Totale</th>
                <th className="px-4 py-3 text-left font-medium">Stato</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedReceipts.map((receipt) => {
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
                        ? "hover:bg-muted/30 cursor-pointer"
                        : "opacity-60"
                    }
                    onClick={() => hasDetail && setSelected(receipt)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(receipt.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">
                        {receipt.adeProgressive ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatCurrency(receipt.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={receipt.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
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
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
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
