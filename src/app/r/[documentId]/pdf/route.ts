import { fetchPublicReceipt } from "@/lib/receipts/fetch-public-receipt";
import { generatePdfResponse } from "@/lib/receipts/generate-pdf-response";

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

  return generatePdfResponse(data);
}
