import {
  generateSaleReceiptPdf,
  type SaleReceiptLine,
} from "@/lib/pdf/generate-sale-receipt";
import { getTrustedAppUrl, TrustedAppUrlError } from "@/lib/trusted-app-url";
import { logger } from "@/lib/logger";

/**
 * Sanitizes a string for use as a PDF filename component.
 * Whitelist approach: keeps only [A-Za-z0-9._-], replaces the rest with "-",
 * trims leading/trailing dashes, and falls back to "scontrino" if empty.
 * Implemented without regex to avoid S5852 ReDoS false-positive.
 * Exported for testing.
 */
export function sanitizePdfFilename(raw: string): string {
  const allowedSet = new Set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-",
  );

  // Replace non-whitelisted chars and cap at 100 characters
  let sanitized = "";
  for (let i = 0; i < Math.min(raw.length, 100); i++) {
    sanitized += allowedSet.has(raw[i]) ? raw[i] : "-";
  }

  // Trim leading/trailing dashes without regex
  let start = 0;
  while (start < sanitized.length && sanitized[start] === "-") start++;
  let end = sanitized.length;
  while (end > start && sanitized[end - 1] === "-") end--;

  return sanitized.slice(start, end) || "scontrino";
}

/** Minimum shape required to build the PDF Response. */
interface PdfReceiptInput {
  doc: {
    id: string;
    publicRequest: unknown;
    adeProgressive: string | null;
    adeTransactionId: string | null;
    adeRegisteredAt: Date;
  };
  biz: {
    businessName: string | null;
    vatNumber: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    zipCode: string | null;
  };
  lines: Array<{
    description: string;
    quantity: string | null;
    grossUnitPrice: string | null;
    vatCode: string;
  }>;
}

/**
 * Generates a PDF scontrino from document data and returns a ready-to-send
 * HTTP Response with the correct headers.
 *
 * Shared by the authenticated route (/api/documents/[id]/pdf) and the
 * public route (/r/[id]/pdf).
 *
 * `includeQr`: solo l'esercente (route autenticata) decide se stampare il QR,
 * rispecchiando `printQr` delle preferenze stampante — v.
 * `src/lib/printing/printer-preferences.ts`. La route pubblica non lo passa
 * mai: il cliente sta già leggendo la sua ricevuta, un QR che rimanda a se
 * stessa non ha senso.
 */
export async function generatePdfResponse(
  data: PdfReceiptInput,
  options: { includeQr?: boolean } = {},
): Promise<Response> {
  const { doc, biz, lines } = data;

  let publicUrl: string | null = null;
  if (options.includeQr) {
    try {
      publicUrl = `${getTrustedAppUrl()}/r/${doc.id}`;
    } catch (err) {
      if (err instanceof TrustedAppUrlError) {
        // Il QR è un arricchimento, non il documento fiscale: si degrada
        // stampando il PDF senza QR invece di rompere l'intera richiesta
        // (regola 19).
        logger.warn(
          { err, documentId: doc.id },
          "PDF QR skipped: trusted app URL unavailable",
        );
      } else {
        throw err;
      }
    }
  }

  const publicReq = doc.publicRequest as {
    paymentMethod?: string;
    lotteryCode?: string;
  } | null;
  const rawPayment = publicReq?.paymentMethod ?? "PC";
  const paymentMethod = rawPayment === "PE" ? "PE" : ("PC" as const);
  const lotteryCode = publicReq?.lotteryCode ?? null;

  const pdfLines: SaleReceiptLine[] = lines.map((l) => ({
    description: l.description,
    quantity: Number.parseFloat(l.quantity ?? "1"),
    grossUnitPrice: Number.parseFloat(l.grossUnitPrice ?? "0"),
    vatCode: l.vatCode,
  }));

  const pdfBuffer = await generateSaleReceiptPdf({
    businessName: biz.businessName ?? "",
    vatNumber: biz.vatNumber ?? "",
    address: biz.address,
    city: biz.city,
    province: biz.province,
    zipCode: biz.zipCode,
    lines: pdfLines,
    paymentMethod,
    adeRegisteredAt: doc.adeRegisteredAt,
    adeProgressive: doc.adeProgressive ?? "",
    adeTransactionId: doc.adeTransactionId ?? "",
    lotteryCode,
    publicUrl,
  });

  const safeProgressive = sanitizePdfFilename(
    doc.adeProgressive ?? "scontrino",
  );
  const encodedProgressive = encodeURIComponent(safeProgressive);

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // "inline", non "attachment": su Safari iOS (anche in standalone PWA)
      // "attachment" forza il download e apre il PDF senza toolbar (niente
      // Fine/Stampa, l'utente resta bloccato). "inline" apre il viewer PDF
      // nativo di Safari con Fine/Condividi→Stampa. RFC 5987: filename* per
      // caratteri non-ASCII; filename per client legacy.
      "Content-Disposition": `inline; filename="scontrino-${safeProgressive}.pdf"; filename*=UTF-8''scontrino-${encodedProgressive}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
