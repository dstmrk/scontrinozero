import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { authenticateApiKey, isApiKeyAuthError } from "@/lib/api-auth";
import { canUseApi } from "@/lib/plans";
import { isValidUuid } from "@/lib/uuid";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await authenticateApiKey(request);
  if (isApiKeyAuthError(auth)) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // ── Plan gate ─────────────────────────────────────────────────────────────
  if (!canUseApi(auth.plan)) {
    return Response.json(
      {
        error:
          "Il tuo piano non include l'accesso alle API. Passa al piano Pro o Developer.",
      },
      { status: 402 },
    );
  }

  // ── Business key required ─────────────────────────────────────────────────
  if (!auth.businessId) {
    return Response.json(
      {
        error: "Questa API richiede una business key (szk_live_).",
      },
      { status: 403 },
    );
  }

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
