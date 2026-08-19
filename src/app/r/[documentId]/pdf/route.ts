import { fetchPublicReceipt } from "@/lib/receipts/fetch-public-receipt";
import { generatePdfResponse } from "@/lib/receipts/generate-pdf-response";
import { getClientIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { isValidUuid } from "@/lib/uuid";

/**
 * Public PDF download — no auth required.
 * The document UUID acts as a public token (122 bits of randomness).
 * Only ACCEPTED SALE documents are served.
 */

// Rate limit: 60 requests per hour per IP
const pdfLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const ip = getClientIp(request.headers);

  if (!pdfLimiter.check(`pdf:${ip}`).success) {
    return Response.json(
      { error: ERROR_MESSAGES.RATE_LIMIT_PUBLIC_MINUTES },
      { status: 429 },
    );
  }

  const { documentId } = await params;

  // CLAUDE.md regola 18: validare UUID a route boundary prima di toccare il DB.
  // Una stringa malformata produrrebbe un 500 Postgres "invalid input syntax for type uuid".
  if (!isValidUuid(documentId)) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  const data = await fetchPublicReceipt(documentId);

  if (!data) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  return generatePdfResponse(data);
}
