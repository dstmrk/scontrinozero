"use client";

import { useState, useTransition } from "react";
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

  // Search form state — defaults aligned with page.tsx server-side prefetch
  const todayStr = new Date().toISOString().split("T")[0];
  const [progressivo, setProgressivo] = useState("");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState<
    "" | "ACCEPTED" | "VOID_ACCEPTED"
  >("ACCEPTED");

  // Handle search
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const params: SearchReceiptsParams = {};
    if (progressivo.trim()) params.progressivo = progressivo.trim();
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (statusFilter) params.status = statusFilter;

    startTransition(async () => {
      const results = await searchReceipts(businessId, params);
      setReceipts(results);
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
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      >
        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="progressivo"
            className="mb-1 block text-xs font-medium"
          >
            Progressivo
          </label>
          <Input
            id="progressivo"
            placeholder="es. DCW2026/5111-2188"
            value={progressivo}
            onChange={(e) => setProgressivo(e.target.value)}
          />
        </div>
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
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "" | "ACCEPTED" | "VOID_ACCEPTED",
              )
            }
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="ACCEPTED">Emesso</option>
            <option value="VOID_ACCEPTED">Annullato</option>
            <option value="">Tutti</option>
          </select>
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
              {receipts.map((receipt) => {
                const isVoidable = receipt.status === "ACCEPTED";
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(receipt);
                          }}
                        >
                          Dettaglio
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
