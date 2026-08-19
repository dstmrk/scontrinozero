import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { fetchPublicReceipt } from "@/lib/receipts/fetch-public-receipt";
import { getClientIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { computeReceiptTotals } from "@/lib/receipts/document-lines";
import {
  PAYMENT_LABELS,
  formatBusinessAddressLines,
  formatReceiptDate,
  formatReceiptDateTime,
  formatReceiptPrice,
} from "@/lib/receipt-format";
import {
  formatVatLegendLine,
  receiptVatLabel,
  receiptVatLegend,
} from "@/lib/receipts/vat-display";
import { ShareButton } from "./share-button";

// Static metadata — no DB query needed here.
// Using a dynamic generateMetadata would double the DB fetch (metadata + page
// component both call fetchPublicReceipt in the same RSC render tree), and
// fetchPublicReceipt cannot be wrapped with cache() because the same function
// is used from the /pdf Route Handler (a separate HTTP request where cache()
// would create a false deduplication expectation).
export const metadata: Metadata = {
  title: "Documento Commerciale | ScontrinoZero",
  robots: { index: false, follow: false },
};

// Rate limit: 60 richieste/ora per IP — parità con la sibling route /pdf.
// Bucket separato (chiave `receipt-page:`) così che le viste della pagina e i
// download PDF abbiano budget indipendenti.
const pageLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Stessa resa di PDF e termica (`DD-MM-YYYY HH:MM`, ora italiana): le tre
 * copie dello stesso documento non devono differire nemmeno nel separatore.
 * Il layout AdE usa i trattini.
 */
function formatDate(date: Date): string {
  return formatReceiptDateTime(new Date(date));
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function PublicReceiptPage({
  params,
}: {
  readonly params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  // Rate-limit per-IP PRIMA della query DB non autenticata (fetchPublicReceipt).
  // headers() è async in Next 16. Un RSC non può restituire un 429 reale come una
  // Route Handler, ma la pagina è robots:noindex: rendiamo un blocco "troppe
  // richieste" (HTTP 200) saltando la query — l'obiettivo anti-abuso è raggiunto.
  const ip = getClientIp(await headers());
  if (!pageLimiter.check(`receipt-page:${ip}`).success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-center text-sm text-gray-600">
          {ERROR_MESSAGES.RATE_LIMIT_PUBLIC_MINUTES}
        </p>
      </div>
    );
  }

  const data = await fetchPublicReceipt(documentId);

  if (!data) notFound();

  const { doc, biz, lines, voidedSale } = data;

  // Su un annullo le righe sono quelle della vendita annullata e il blocco
  // pagamenti sparisce: un annullo non incassa. `fetchPublicReceipt` rifiuta
  // gia' un VOID che non trova la sua vendita, quindi qui `voidedSale` c'e'
  // sempre quando serve.
  const isVoid = doc.kind === "VOID";

  const publicReq = doc.publicRequest as {
    paymentMethod?: string;
    lotteryCode?: string;
  } | null;
  const rawPayment = publicReq?.paymentMethod ?? "PC";
  const paymentMethod = rawPayment === "PE" ? "PE" : "PC";
  const lotteryCode = publicReq?.lotteryCode ?? null;

  // Cents-based deterministic totals (avoid IEEE-754 drift on many/decimal lines)
  const totals = computeReceiptTotals(lines);
  const { grandTotal, vatByCode, vatTotal } = totals;

  // Righe indirizzo nella forma del layout standard AdE (via, poi
  // `Comune(PR), CAP`), le stesse che stampano PDF e termica.
  const addressLines = formatBusinessAddressLines(biz);

  // Legenda degli asterischi della colonna IVA (`*ES = Esente`): vuota — e
  // quindi non renderizzata — se il documento non contiene nature.
  const vatLegend = receiptVatLegend(lines.map((l) => l.vatCode));

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto max-w-sm">
        {/* Receipt card */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
          {/* Header */}
          <div className="border-b border-dashed border-gray-200 px-6 py-5 text-center">
            <h1 className="text-lg leading-tight font-bold">
              {biz.businessName}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              P.IVA {biz.vatNumber}
            </p>
            {addressLines.map((line) => (
              <p key={line} className="mt-0.5 text-xs text-gray-500">
                {line}
              </p>
            ))}
          </div>

          {/* Document title */}
          <div className="border-b border-dashed border-gray-200 px-6 py-3 text-center">
            <p className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
              Documento Commerciale
            </p>
            <p className="text-xs text-gray-500">
              {isVoid ? "emesso per ANNULLAMENTO" : "di vendita o prestazione"}
            </p>
            {isVoid && voidedSale && (
              <div className="mt-2 text-xs text-gray-500">
                <p>Documento di riferimento:</p>
                <p className="font-medium text-gray-700">
                  N. {voidedSale.adeProgressive} del{" "}
                  {formatReceiptDate(voidedSale.adeRegisteredAt)}
                </p>
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="border-b border-dashed border-gray-200 px-6 py-4">
            <div className="mb-2 flex border-b border-gray-100 pb-1 text-xs text-gray-400">
              <span className="flex-1">DESCRIZIONE</span>
              <span className="w-10 text-center">IVA</span>
              <span className="w-16 text-right">Prezzo(€)</span>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => {
                const { qty, price, lineTotal } = totals.perLine[idx];
                const vatLabel = receiptVatLabel(line.vatCode);
                return (
                  <div key={line.id} className="flex items-start gap-1 text-sm">
                    <div className="min-w-0 flex-1">
                      {/* `break-words`: una descrizione senza spazi (es. un
                          codice prenotazione lungo) sborderebbe dalla card e
                          farebbe scrollare l'intera pagina in orizzontale. */}
                      <p className="leading-tight font-medium break-words">
                        {line.description}
                      </p>
                      {qty !== 1 && (
                        <p className="text-xs text-gray-400">
                          n.{qty % 1 === 0 ? Math.round(qty) : qty} *{" "}
                          {formatReceiptPrice(price)}
                        </p>
                      )}
                    </div>
                    <span className="w-10 flex-shrink-0 text-center text-xs text-gray-500">
                      {vatLabel}
                    </span>
                    <span className="w-16 flex-shrink-0 text-right font-medium">
                      {formatReceiptPrice(lineTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals — ordine del layout standard AdE: subtotale, totale
              complessivo, `di cui IVA`. Il dettaglio per aliquota si aggiunge
              solo con più di un'aliquota, altrimenti ripete l'aggregato. */}
          <div className="space-y-1 border-b border-dashed border-gray-200 px-6 py-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotale</span>
              <span>{formatReceiptPrice(grandTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold">
              <span>TOTALE COMPLESSIVO</span>
              <span>€ {formatReceiptPrice(grandTotal)}</span>
            </div>
            {vatTotal > 0 && (
              <div className="flex justify-between text-sm font-semibold text-gray-600">
                <span>di cui IVA</span>
                <span>{formatReceiptPrice(vatTotal)}</span>
              </div>
            )}
            {/* Nessun filtro sugli importi: `computeReceiptTotals` scarta già
                le voci a zero centesimi, quindi ogni entry vale almeno 0,01. */}
            {vatByCode.size > 1 &&
              Array.from(vatByCode.entries()).map(([code, vatAmount]) => (
                <div
                  key={code}
                  className="flex justify-between text-xs text-gray-400"
                >
                  <span>di cui IVA {receiptVatLabel(code)}</span>
                  <span>{formatReceiptPrice(vatAmount)}</span>
                </div>
              ))}
          </div>

          {/* Payment — solo sulla vendita. `Importo pagato` va sempre
              indicato (prescrizioni generali AdE); la riga della modalità
              sparisce a importo zero. */}
          {!isVoid && (
            <div className="space-y-1 border-b border-dashed border-gray-200 px-6 py-4 text-xs text-gray-500">
              {grandTotal !== 0 && (
                <div className="flex justify-between">
                  <span>{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}</span>
                  <span className="font-medium text-gray-700">
                    {formatReceiptPrice(grandTotal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Importo pagato</span>
                <span className="font-medium text-gray-700">
                  {formatReceiptPrice(grandTotal)}
                </span>
              </div>
            </div>
          )}

          {vatLegend.length > 0 && (
            <div className="border-b border-dashed border-gray-200 px-6 py-3 text-xs text-gray-400">
              {vatLegend.map((entry) => (
                <p key={entry.code}>{formatVatLegendLine(entry)}</p>
              ))}
            </div>
          )}

          {/* Footer: data e numero documento, poi il codice lotteria */}
          <div className="space-y-1 px-6 py-4 text-center text-xs text-gray-500">
            <p>{formatDate(doc.adeRegisteredAt)}</p>
            {doc.adeProgressive && (
              <p>
                <span>DOCUMENTO N.</span>{" "}
                <span className="font-mono">{doc.adeProgressive}</span>
              </p>
            )}
            {lotteryCode && (
              <div className="pt-2">
                <p>Codice Lotteria</p>
                <p className="font-mono font-medium text-gray-700">
                  {lotteryCode}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <a
            href={`/r/${documentId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-700 active:bg-gray-800"
          >
            <Download className="h-4 w-4" />
            Scarica PDF
          </a>
          <ShareButton url={`/r/${documentId}`} title="La tua ricevuta" />
        </div>

        {/* Footer branding */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Documento emesso con{" "}
          <a
            href="https://scontrinozero.it"
            className="underline hover:text-gray-600"
          >
            ScontrinoZero
          </a>
        </p>
      </div>
    </div>
  );
}
