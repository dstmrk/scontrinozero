import { fetchPublicReceipt } from "@/lib/receipts/fetch-public-receipt";
import { generatePdfResponse } from "@/lib/receipts/generate-pdf-response";
import { RateLimiter } from "@/lib/rate-limit";

/**
 * Public PDF download — no auth required.
 * The document UUID acts as a public token (122 bits of randomness).
 * Only ACCEPTED SALE documents are served.
 */

// Rate limit: 60 requests per hour per IP
const pdfLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!pdfLimiter.check(`pdf:${ip}`).success) {
    return Response.json(
      { error: "Troppe richieste. Riprova tra qualche minuto." },
      { status: 429 },
    );
  }

  const { documentId } = await params;

  const data = await fetchPublicReceipt(documentId);

  if (!data) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  return generatePdfResponse(data);
}
