import { and, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { businessMembers, commercialDocuments } from "@/db/schema";
import { canUseCollaborators } from "@/lib/plans-shared";
import type { PlanInfo } from "@/lib/plans";
import {
  checkBusinessMembership,
  type BusinessAccessError,
  type BusinessMembership,
} from "@/lib/server-auth";

/**
 * Cosa può fare un membro di un'attività in base al ruolo (issue #1099).
 *
 * Il titolare fa tutto. Il collaboratore emette, annulla i propri documenti,
 * fa resi su qualunque vendita dell'attività e legge il catalogo; vede solo i
 * documenti che ha creato. Il resto (credenziali AdE, dati dell'attività,
 * analytics, export, chiavi API, fatturazione) è del titolare.
 *
 * Per il titolare nessuna funzione qui aggiunge una query: i controlli in più
 * scattano solo per il collaboratore, che oggi non esiste ancora.
 */

export const OWNER_ONLY_MESSAGE =
  "Questa operazione è riservata al titolare dell'attività.";

export const COLLABORATORS_SUSPENDED_MESSAGE =
  "Il piano dell'attività non include i collaboratori: chiedi al titolare.";

/** Come `checkBusinessMembership`, ma solo per il titolare. */
export async function checkBusinessOwner(
  userId: string,
  businessId: string,
): Promise<BusinessMembership | BusinessAccessError> {
  const membership = await checkBusinessMembership(userId, businessId);
  if ("error" in membership) return membership;
  if (membership.role !== "owner") return { error: OWNER_ONLY_MESSAGE };
  return membership;
}

/**
 * Il messaggio da restituire se il membro non può emettere, annullare o
 * rendere perché il piano del titolare non ammette collaboratori; `null` se
 * può. Il titolare non è mai sospeso: i suoi limiti li decide `canEmit`.
 */
export function collaboratorSuspendedError(
  membership: BusinessMembership,
  planInfo: Pick<PlanInfo, "plan" | "trialStartedAt" | "planExpiresAt">,
): string | null {
  if (membership.role === "owner") return null;
  return canUseCollaborators(
    planInfo.plan,
    planInfo.trialStartedAt,
    planInfo.planExpiresAt,
  )
    ? null
    : COLLABORATORS_SUSPENDED_MESSAGE;
}

/**
 * Condizione da aggiungere alle letture di `commercial_documents` perché il
 * collaboratore veda solo i documenti che ha creato; `undefined` per il
 * titolare, che vede tutta l'attività.
 */
export function ownDocumentsCondition(
  membership: BusinessMembership,
): SQL | undefined {
  return membership.role === "owner"
    ? undefined
    : eq(commercialDocuments.createdBy, membership.memberId);
}

/**
 * True se il membro può agire sul documento: sempre per il titolare, solo sui
 * documenti propri per il collaboratore. Un documento altrui risponde come uno
 * inesistente, così un id indovinato non dice nulla.
 */
export async function canAccessDocument(
  membership: BusinessMembership,
  businessId: string,
  documentId: string,
): Promise<boolean> {
  if (membership.role === "owner") return true;

  const db = getDb();
  const [doc] = await db
    .select({ id: commercialDocuments.id })
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        eq(commercialDocuments.businessId, businessId),
        eq(commercialDocuments.createdBy, membership.memberId),
      ),
    )
    .limit(1);
  return doc !== undefined;
}

/**
 * True se l'utente è collaboratore di un'attività. Serve dove la richiesta non
 * porta un `businessId`, come il checkout Stripe: un collaboratore non compra
 * piani, li compra il titolare.
 */
export async function isCollaborator(userId: string): Promise<boolean> {
  const db = getDb();
  const [member] = await db
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(eq(businessMembers.authUserId, userId))
    .limit(1);
  return member?.role === "collaborator";
}
