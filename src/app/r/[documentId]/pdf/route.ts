import { fetchPublicReceipt } from "@/lib/receipts/fetch-public-receipt";
import {
  generateSaleReceiptPdf,
  type SaleReceiptLine,
} from "@/lib/pdf/generate-sale-receipt";

/**
 * Public PDF download — no auth required.
 * The document UUID acts as a public token (122 bits of randomness).
 * Only ACCEPTED SALE documents are served.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const { documentId } = await params;

  const data = await fetchPublicReceipt(documentId);

  if (!data) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  const { doc, biz, lines } = data;

  const publicReq = doc.publicRequest as { paymentMethod?: string } | null;
  const rawPayment = publicReq?.paymentMethod ?? "PC";
  const paymentMethod = (rawPayment === "PE" ? "PE" : "PC") as "PC" | "PE";

  const pdfLines: SaleReceiptLine[] = lines.map((l) => ({
    description: l.description,
    quantity: parseFloat(l.quantity ?? "1"),
    grossUnitPrice: parseFloat(l.grossUnitPrice ?? "0"),
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

  const safeProgressive = (doc.adeProgressive ?? "scontrino").replace(
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
