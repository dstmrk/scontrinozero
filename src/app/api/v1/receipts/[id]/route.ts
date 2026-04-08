import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { isValidUuid } from "@/lib/uuid";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
} from "@/lib/api-v1-helpers";

export function OPTIONS(): Response {
  return corsOptionsResponse("GET, OPTIONS");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  const { id } = await params;

  if (!isValidUuid(id)) {
    return Response.json({ error: "ID non valido." }, { status: 400 });
  }

  const db = getDb();
  const [doc] = await db
    .select({
      id: commercialDocuments.id,
      kind: commercialDocuments.kind,
      status: commercialDocuments.status,
      idempotencyKey: commercialDocuments.idempotencyKey,
      adeTransactionId: commercialDocuments.adeTransactionId,
      adeProgressive: commercialDocuments.adeProgressive,
      createdAt: commercialDocuments.createdAt,
    })
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.id, id),
        eq(commercialDocuments.businessId, auth.businessId),
      ),
    )
    .limit(1);

  if (!doc) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  return Response.json(doc);
}
