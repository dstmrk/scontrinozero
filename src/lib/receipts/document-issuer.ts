import { asc, eq, isNull, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { businessMembers, commercialDocuments } from "@/db/schema";
import type { MemberRole } from "@/db/schema/business-members";
import { logger } from "@/lib/logger";
import { isValidUuid } from "@/lib/uuid";

/**
 * Chi ha emesso un documento (issue #1099): il titolare, un collaboratore o
 * la Developer API. Stessa etichetta nello storico, nell'export CSV e nelle
 * analytics, letta da `commercial_documents.created_by` (migrazione 0044):
 * NULL vuol dire Developer API, perché ogni documento della UI ha un membro.
 */

/** Il valore del filtro "Emesso da" che sceglie la Developer API. */
export const API_ISSUER = "api";

export type DocumentIssuer = Readonly<{
  kind: "owner" | "collaborator" | "api";
  label: string;
}>;

/**
 * Il membro che ha emesso, come lo portano le colonne `issuerColumns`: tutte
 * NULL senza membro, cioè dalla Developer API.
 */
export type IssuerColumns = Readonly<{
  issuerRole: MemberRole | null;
  issuerName: string | null;
  issuerAuthUserId: string | null;
}>;

/**
 * Colonne del membro da affiancare a un documento, con il LEFT JOIN
 * `issuerJoinCondition` su `business_members`.
 */
export const issuerColumns = {
  issuerRole: businessMembers.role,
  issuerName: businessMembers.name,
  issuerAuthUserId: businessMembers.authUserId,
};

export const issuerJoinCondition = eq(
  businessMembers.id,
  commercialDocuments.createdBy,
);

export function describeIssuer(member: IssuerColumns): DocumentIssuer {
  if (!member.issuerRole) return { kind: "api", label: "Developer API" };
  if (member.issuerRole === "owner") {
    return { kind: "owner", label: "Titolare" };
  }
  const name = member.issuerName?.trim() || "Collaboratore";
  return {
    kind: "collaborator",
    // Il nome resta dopo la rimozione e attribuisce i documenti; il suffisso
    // dice perché quel nome non è più fra i collaboratori.
    label: member.issuerAuthUserId === null ? `${name} (rimosso)` : name,
  };
}

/**
 * La condizione del filtro "Emesso da": un membro per id, la Developer API
 * con `API_ISSUER`, niente senza filtro. Il valore arriva da URL e server
 * action, quindi uno estraneo si rifiuta prima che diventi un cast fallito
 * in Postgres (regola 9). Un id di un'altra attività non trova nulla: le
 * query filtrano già per attività.
 */
export function issuerCondition(
  filter: string | null | undefined,
): SQL | null | { error: string } {
  if (!filter) return null;
  if (filter === API_ISSUER) return isNull(commercialDocuments.createdBy);
  if (isValidUuid(filter)) return eq(commercialDocuments.createdBy, filter);
  return { error: "Filtro «Emesso da» non valido." };
}

export type IssuerOption = Readonly<{ value: string; label: string }>;

const NO_MEMBER: IssuerColumns = {
  issuerRole: null,
  issuerName: null,
  issuerAuthUserId: null,
};

/**
 * Le voci del filtro "Emesso da" per il titolare: lui, i collaboratori
 * (rimossi compresi, perché i loro documenti restano) e la Developer API.
 * Vuoto senza collaboratori, perché con un solo membro il filtro non sceglie
 * niente. Una lettura fallita toglie il filtro invece di rompere la pagina
 * (regola 19).
 */
export async function listIssuerOptions(
  businessId: string,
): Promise<IssuerOption[]> {
  let members: Array<IssuerColumns & { id: string }>;
  try {
    members = await getDb()
      .select({ id: businessMembers.id, ...issuerColumns })
      .from(businessMembers)
      .where(eq(businessMembers.businessId, businessId))
      .orderBy(asc(businessMembers.createdAt));
  } catch (err) {
    logger.error({ err, businessId }, "listIssuerOptions: lettura fallita");
    return [];
  }

  if (!members.some((member) => member.issuerRole === "collaborator")) {
    return [];
  }

  // Il titolare in testa, poi i collaboratori nell'ordine in cui sono entrati.
  const ordered = [
    ...members.filter((member) => member.issuerRole === "owner"),
    ...members.filter((member) => member.issuerRole !== "owner"),
  ];
  return [
    ...ordered.map((member) => ({
      value: member.id,
      label: describeIssuer(member).label,
    })),
    { value: API_ISSUER, label: describeIssuer(NO_MEMBER).label },
  ];
}
