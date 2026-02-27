import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
  profiles,
} from "@/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePdfResponse } from "@/lib/receipts/generate-pdf-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { documentId } = await params;
  const db = getDb();

  // ── Fetch document + business (ownership check via JOIN on profiles) ───────
  const rows = await db
    .select({ doc: commercialDocuments, biz: businesses })
    .from(commercialDocuments)
    .innerJoin(businesses, eq(commercialDocuments.businessId, businesses.id))
    .innerJoin(profiles, eq(businesses.profileId, profiles.id))
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        eq(profiles.authUserId, user.id),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  const { doc, biz } = rows[0];

  if (doc.kind !== "SALE") {
    return Response.json(
      {
        error:
          "Il PDF è disponibile solo per documenti di vendita (kind=SALE).",
      },
      { status: 400 },
    );
  }

  // ── Fetch lines ────────────────────────────────────────────────────────────
  const dbLines = await db
    .select()
    .from(commercialDocumentLines)
    .where(eq(commercialDocumentLines.documentId, doc.id))
    .orderBy(commercialDocumentLines.lineIndex);

  return generatePdfResponse({ doc, biz, lines: dbLines });
}
