import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
} from "@/db/schema";
import { ShareButton } from "./share-button";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeVatAmount(lineTotalGross: number, vatCode: string): number {
  const rate = parseFloat(vatCode);
  if (isNaN(rate) || rate === 0) return 0;
  return lineTotalGross - lineTotalGross / (1 + rate / 100);
}

const VAT_LABELS: Record<string, string> = {
  "4": "4%",
  "5": "5%",
  "10": "10%",
  "22": "22%",
  N1: "Esclusa",
  N2: "Non sogg.",
  N3: "Non imp.",
  N4: "Esente",
  N5: "Reg.marg.",
  N6: "Non IVA",
};

const PAYMENT_LABELS: Record<string, string> = {
  PC: "Contante",
  PE: "Elettronico",
};

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchReceiptData(documentId: string) {
  const db = getDb();

  const rows = await db
    .select({ doc: commercialDocuments, biz: businesses })
    .from(commercialDocuments)
    .innerJoin(businesses, eq(commercialDocuments.businessId, businesses.id))
    .where(eq(commercialDocuments.id, documentId))
    .limit(1);

  if (rows.length === 0) return null;

  const { doc, biz } = rows[0];

  if (doc.kind !== "SALE" || doc.status !== "ACCEPTED") return null;

  const lines = await db
    .select()
    .from(commercialDocumentLines)
    .where(eq(commercialDocumentLines.documentId, doc.id))
    .orderBy(commercialDocumentLines.lineIndex);

  return { doc, biz, lines };
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const { documentId } = await params;
  const data = await fetchReceiptData(documentId);
  if (!data) return { title: "Ricevuta non trovata" };

  return {
    title: `Ricevuta — ${data.biz.businessName}`,
    description: `Documento commerciale del ${formatDate(data.doc.createdAt)} — ${data.biz.businessName}`,
    robots: { index: false, follow: false },
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const data = await fetchReceiptData(documentId);

  if (!data) notFound();

  const { doc, biz, lines } = data;

  const publicReq = doc.publicRequest as { paymentMethod?: string } | null;
  const rawPayment = publicReq?.paymentMethod ?? "PC";
  const paymentMethod = rawPayment === "PE" ? "PE" : "PC";

  // Compute totals
  let grandTotal = 0;
  const vatByCode = new Map<string, number>();

  for (const line of lines) {
    const qty = parseFloat(line.quantity ?? "1");
    const price = parseFloat(line.grossUnitPrice ?? "0");
    const lineTotal = qty * price;
    grandTotal += lineTotal;

    const existing = vatByCode.get(line.vatCode) ?? 0;
    vatByCode.set(
      line.vatCode,
      existing + computeVatAmount(lineTotal, line.vatCode),
    );
  }

  const addressLine = [biz.address, biz.city, biz.province, biz.zipCode]
    .filter(Boolean)
    .join(", ");

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
            {addressLine && (
              <p className="mt-0.5 text-xs text-gray-500">{addressLine}</p>
            )}
            <p className="mt-0.5 text-xs text-gray-500">
              P.IVA {biz.vatNumber}
            </p>
          </div>

          {/* Document title */}
          <div className="border-b border-dashed border-gray-200 px-6 py-3 text-center">
            <p className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
              Documento Commerciale
            </p>
            <p className="text-xs text-gray-500">di vendita o prestazione</p>
          </div>

          {/* Line items */}
          <div className="border-b border-dashed border-gray-200 px-6 py-4">
            <div className="mb-2 flex border-b border-gray-100 pb-1 text-xs text-gray-400">
              <span className="flex-1">Descrizione</span>
              <span className="w-10 text-center">IVA</span>
              <span className="w-16 text-right">€</span>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => {
                const qty = parseFloat(line.quantity ?? "1");
                const price = parseFloat(line.grossUnitPrice ?? "0");
                const lineTotal = qty * price;
                const vatLabel = VAT_LABELS[line.vatCode] ?? line.vatCode;
                return (
                  <div key={idx} className="flex items-start gap-1 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="leading-tight font-medium">
                        {line.description}
                      </p>
                      {qty !== 1 && (
                        <p className="text-xs text-gray-400">
                          {qty % 1 === 0 ? Math.round(qty) : qty} ×{" "}
                          {formatPrice(price)}
                        </p>
                      )}
                    </div>
                    <span className="w-10 flex-shrink-0 text-center text-xs text-gray-500">
                      {vatLabel}
                    </span>
                    <span className="w-16 flex-shrink-0 text-right font-medium">
                      {formatPrice(lineTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1 border-b border-dashed border-gray-200 px-6 py-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotale</span>
              <span>{formatPrice(grandTotal)}</span>
            </div>
            {Array.from(vatByCode.entries())
              .filter(([, v]) => v > 0.005)
              .map(([code, vatAmount]) => (
                <div
                  key={code}
                  className="flex justify-between text-xs text-gray-400"
                >
                  <span>di cui IVA {VAT_LABELS[code] ?? code}</span>
                  <span>{formatPrice(vatAmount)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold">
              <span>Totale</span>
              <span>€ {formatPrice(grandTotal)}</span>
            </div>
          </div>

          {/* Payment + footer */}
          <div className="space-y-1 px-6 py-4 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Pagamento</span>
              <span className="font-medium text-gray-700">
                {PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Data</span>
              <span>{formatDate(doc.createdAt)}</span>
            </div>
            {doc.adeProgressive && (
              <div className="flex justify-between">
                <span>Progressivo AdE</span>
                <span className="font-mono">{doc.adeProgressive}</span>
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
