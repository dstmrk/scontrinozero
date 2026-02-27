import {
  generateSaleReceiptPdf,
  type SaleReceiptLine,
} from "@/lib/pdf/generate-sale-receipt";

/** Minimum shape required to build the PDF Response. */
interface PdfReceiptInput {
  doc: {
    publicRequest: unknown;
    adeProgressive: string | null;
    adeTransactionId: string | null;
    createdAt: Date;
  };
  biz: {
    businessName: string;
    vatNumber: string;
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
 */
export async function generatePdfResponse(
  data: PdfReceiptInput,
): Promise<Response> {
  const { doc, biz, lines } = data;

  const publicReq = doc.publicRequest as { paymentMethod?: string } | null;
  const rawPayment = publicReq?.paymentMethod ?? "PC";
  const paymentMethod = rawPayment === "PE" ? "PE" : ("PC" as const);

  const pdfLines: SaleReceiptLine[] = lines.map((l) => ({
    description: l.description,
    quantity: Number.parseFloat(l.quantity ?? "1"),
    grossUnitPrice: Number.parseFloat(l.grossUnitPrice ?? "0"),
    vatCode: l.vatCode,
  }));

  const pdfBuffer = await generateSaleReceiptPdf({
    businessName: biz.businessName,
    vatNumber: biz.vatNumber,
    address: biz.address,
    city: biz.city,
    province: biz.province,
    zipCode: biz.zipCode,
    lines: pdfLines,
    paymentMethod,
    createdAt: doc.createdAt,
    adeProgressive: doc.adeProgressive ?? "",
    adeTransactionId: doc.adeTransactionId ?? "",
  });

  const safeProgressive = (doc.adeProgressive ?? "scontrino").replaceAll(
    /[/\\]/g,
    "-",
  );

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="scontrino-${safeProgressive}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
