"use server";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  businesses,
  catalogItems,
  commercialDocumentLines,
  commercialDocuments,
  profiles,
} from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportUserDataResult {
  error?: string;
  data?: {
    exportedAt: string;
    profile: {
      email: string;
      firstName: string | null;
      lastName: string | null;
      plan: string;
      trialStartedAt: Date | null;
      planExpiresAt: Date | null;
      termsAcceptedAt: Date | null;
      termsVersion: string | null;
      createdAt: Date;
    };
    business: {
      businessName: string | null;
      vatNumber: string | null;
      fiscalCode: string | null;
      address: string | null;
      city: string | null;
      province: string | null;
      zipCode: string | null;
      createdAt: Date;
    } | null;
    receipts: {
      id: string;
      kind: string;
      status: string;
      adeProgressive: string | null;
      adeTransactionId: string | null;
      createdAt: Date;
      lines: {
        description: string;
        quantity: string;
        grossUnitPrice: string;
        vatCode: string;
      }[];
    }[];
    catalogItems: {
      description: string;
      defaultPrice: string | null;
      defaultVatCode: string;
      createdAt: Date;
    }[];
  };
}

// ---------------------------------------------------------------------------
// exportUserData
// ---------------------------------------------------------------------------

/**
 * Esporta tutti i dati dell'utente autenticato in formato strutturato.
 * Implementa il diritto alla portabilità dei dati (GDPR art. 20).
 *
 * Include: profilo, attività, scontrini (con righe), catalogo prodotti.
 * Esclude: credenziali AdE cifrate (dati di sicurezza, non portabili).
 */
export async function exportUserData(): Promise<ExportUserDataResult> {
  let user: { id: string };
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
  }

  const db = getDb();

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!profile) {
    return { error: "Profilo non trovato." };
  }

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.profileId, profile.id))
    .limit(1);

  const profileData = {
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    plan: profile.plan,
    trialStartedAt: profile.trialStartedAt,
    planExpiresAt: profile.planExpiresAt,
    termsAcceptedAt: profile.termsAcceptedAt,
    termsVersion: profile.termsVersion,
    createdAt: profile.createdAt,
  };

  if (!business) {
    logger.info({ userId: user.id }, "Export: no business found");
    return {
      data: {
        exportedAt: new Date().toISOString(),
        profile: profileData,
        business: null,
        receipts: [],
        catalogItems: [],
      },
    };
  }

  const docs = await db
    .select()
    .from(commercialDocuments)
    .where(eq(commercialDocuments.businessId, business.id))
    .orderBy(desc(commercialDocuments.createdAt));

  let linesByDocId = new Map<string, typeof lines>();
  let lines: {
    id: string;
    documentId: string;
    lineIndex: number;
    description: string;
    quantity: string;
    grossUnitPrice: string;
    vatCode: string;
    adeLineId: string | null;
  }[] = [];

  if (docs.length > 0) {
    const docIds = docs.map((d) => d.id);
    lines = await db
      .select()
      .from(commercialDocumentLines)
      .where(inArray(commercialDocumentLines.documentId, docIds))
      .orderBy(asc(commercialDocumentLines.lineIndex));

    linesByDocId = new Map<string, typeof lines>();
    for (const line of lines) {
      const existing = linesByDocId.get(line.documentId) ?? [];
      existing.push(line);
      linesByDocId.set(line.documentId, existing);
    }
  }

  const catalog = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.businessId, business.id))
    .orderBy(asc(catalogItems.createdAt));

  return {
    data: {
      exportedAt: new Date().toISOString(),
      profile: profileData,
      business: {
        businessName: business.businessName,
        vatNumber: business.vatNumber,
        fiscalCode: business.fiscalCode,
        address: business.address,
        city: business.city,
        province: business.province,
        zipCode: business.zipCode,
        createdAt: business.createdAt,
      },
      receipts: docs.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        status: doc.status,
        adeProgressive: doc.adeProgressive,
        adeTransactionId: doc.adeTransactionId,
        createdAt: doc.createdAt,
        lines: (linesByDocId.get(doc.id) ?? []).map((l) => ({
          description: l.description,
          quantity: l.quantity,
          grossUnitPrice: l.grossUnitPrice,
          vatCode: l.vatCode,
        })),
      })),
      catalogItems: catalog.map((item) => ({
        description: item.description,
        defaultPrice: item.defaultPrice,
        defaultVatCode: item.defaultVatCode,
        createdAt: item.createdAt,
      })),
    },
  };
}
