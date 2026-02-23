import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
  profiles,
} from "@/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  generateSaleReceiptPdf,
  type SaleReceiptLine,
} from "@/lib/pdf/generate-sale-receipt";

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

  // ── Extract payment method from publicRequest ──────────────────────────────
  const publicReq = doc.publicRequest as { paymentMethod?: string } | null;
  const rawPayment = publicReq?.paymentMethod ?? "PC";
  const paymentMethod = (rawPayment === "PE" ? "PE" : "PC") as "PC" | "PE";

  // ── Map DB lines to PDF data ───────────────────────────────────────────────
  const pdfLines: SaleReceiptLine[] = dbLines.map((l) => ({
    description: l.description,
    quantity: parseFloat(l.quantity ?? "1"),
    grossUnitPrice: parseFloat(l.grossUnitPrice ?? "0"),
    vatCode: l.vatCode,
  }));

  // ── Generate PDF ──────────────────────────────────────────────────────────
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

  // Sanitize progressive for filename (remove slashes)
  const safeProgressive = (doc.adeProgressive ?? "scontrino").replace(
    /[/\\]/g,
    "-",
  );

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="scontrino-${safeProgressive}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
