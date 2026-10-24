import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  businesses,
  businessMembers,
  collaboratorInvites,
  profiles,
} from "@/db/schema";
import { resolveAppHostname } from "@/lib/hostname-env";
import type { PlanInfo } from "@/lib/plans";
import { canUseCollaborators } from "@/lib/plans-shared";

/**
 * Inviti dei collaboratori (issue #1099, PR 6a): token, limiti, letture
 * condivise fra le action del titolare, la pagina d'invito e l'accettazione.
 *
 * Un invito è una riga di `collaborator_invites`. È **valido** finché la riga
 * esiste e `expires_at` è nel futuro; revoca e accettazione cancellano la
 * riga, quindi non esiste uno stato "usato".
 */

/**
 * Versione corrente delle Condizioni per i collaboratori. Va di pari passo con
 * la pagina `/condizioni-collaboratori/<versione>` e con il redirect di
 * `/condizioni-collaboratori`; la procedura per una versione nuova è nella
 * skill `deploy-release`.
 */
export const CURRENT_COLLABORATOR_TERMS_VERSION = "v01";

/** Validità di un invito: 7 giorni (decisione 14). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Inviti validi per attività, oltre i quali non se ne mandano altri. */
export const MAX_OPEN_INVITES = 10;

/**
 * Inviti al giorno per attività, reinvii compresi. Ogni invito è un'email: il
 * piano gratuito di Resend ne manda 100 al giorno per tutto il servizio.
 */
export const INVITES_PER_DAY = 20;

export const FISCONLINE_REQUIRED_WITH_TEAM_MESSAGE =
  "Con collaboratori o inviti in sospeso l'accesso all'AdE resta con Fisconline: rimuovi prima i collaboratori e revoca gli inviti.";

/** Perché il titolare non può ancora invitare: un passo da fare alla volta. */
export type OwnerInviteBlocker = {
  step: "plan" | "fisconline" | "terms";
  message: string;
};

/**
 * Il primo motivo per cui il titolare non può invitare, o `null` se può. La
 * card dei collaboratori lo usa per scegliere cosa mostrare, l'action per
 * rifiutare: le due cose non possono divergere.
 */
export function ownerInviteBlocker(
  planInfo: Pick<PlanInfo, "plan" | "trialStartedAt" | "planExpiresAt">,
  owner: {
    collaboratorTermsVersion: string | null;
    loginMethod: string | null;
    verifiedAt: Date | null;
  },
): OwnerInviteBlocker | null {
  if (
    !canUseCollaborators(
      planInfo.plan,
      planInfo.trialStartedAt,
      planInfo.planExpiresAt,
    )
  ) {
    return {
      step: "plan",
      message: "Il piano attuale non include i collaboratori.",
    };
  }
  // Decisione 7: con CIE e SPID ogni sessione nuova chiede il titolare, e la
  // verifica deve essere riuscita, non solo le credenziali salvate.
  if (owner.loginMethod !== "fisconline" || owner.verifiedAt === null) {
    return {
      step: "fisconline",
      message:
        "Per invitare collaboratori servono credenziali Fisconline verificate.",
    };
  }
  if (owner.collaboratorTermsVersion !== CURRENT_COLLABORATOR_TERMS_VERSION) {
    return {
      step: "terms",
      message: "Accetta prima le Condizioni per i collaboratori.",
    };
  }
  return null;
}

/** 32 byte casuali: 43 caratteri base64url, senza padding. */
const TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[\w-]{43}$/;

/** Il token va solo nel link dell'email; nel DB finisce l'hash. */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Guard prima di ogni lookup: un valore malformato non tocca il DB. */
export function isInviteTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

export function inviteAcceptUrl(token: string): string {
  return `https://${resolveAppHostname()}/invito/${token}`;
}

/** L'invito dietro un link, con il nome dell'attività da mostrare. */
export type InviteFromLink = {
  id: string;
  businessId: string;
  email: string;
  expiresAt: Date;
  businessName: string | null;
};

/** L'invito con questo token, scaduto o no; `null` se non esiste più. */
export async function findInviteByToken(
  token: string,
): Promise<InviteFromLink | null> {
  const db = getDb();
  const [invite] = await db
    .select({
      id: collaboratorInvites.id,
      businessId: collaboratorInvites.businessId,
      email: collaboratorInvites.email,
      expiresAt: collaboratorInvites.expiresAt,
      businessName: businesses.businessName,
    })
    .from(collaboratorInvites)
    .innerJoin(businesses, eq(businesses.id, collaboratorInvites.businessId))
    .where(eq(collaboratorInvites.tokenHash, hashInviteToken(token)))
    .limit(1);
  return invite ?? null;
}

/**
 * True se l'attività ha collaboratori con un account o inviti ancora validi:
 * in quel caso l'accesso all'AdE resta con Fisconline (decisione 7), perché
 * con CIE e SPID ogni sessione nuova chiede il titolare.
 */
export async function hasCollaboratorsOrOpenInvites(
  businessId: string,
): Promise<boolean> {
  const db = getDb();
  const [[member], [invite]] = await Promise.all([
    db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "collaborator"),
          isNotNull(businessMembers.authUserId),
        ),
      )
      .limit(1),
    db
      .select({ id: collaboratorInvites.id })
      .from(collaboratorInvites)
      .where(
        and(
          eq(collaboratorInvites.businessId, businessId),
          gt(collaboratorInvites.expiresAt, new Date()),
        ),
      )
      .limit(1),
  ]);
  return member !== undefined || invite !== undefined;
}

/**
 * Posti occupati nell'attività: collaboratori con un account e inviti ancora
 * validi, escluso l'invito per `exceptEmail` che un reinvio sostituirebbe. Ne
 * vive il limite della prova e quello degli inviti in sospeso.
 */
export async function countTeamSeats(
  businessId: string,
  exceptEmail: string,
): Promise<{ members: number; openInvites: number }> {
  const db = getDb();
  const [[members], [invites]] = await Promise.all([
    db
      .select({ value: count() })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "collaborator"),
          isNotNull(businessMembers.authUserId),
        ),
      ),
    db
      .select({ value: count() })
      .from(collaboratorInvites)
      .where(
        and(
          eq(collaboratorInvites.businessId, businessId),
          gt(collaboratorInvites.expiresAt, new Date()),
          ne(collaboratorInvites.email, exceptEmail),
        ),
      ),
  ]);
  return { members: members?.value ?? 0, openInvites: invites?.value ?? 0 };
}

/**
 * True se l'email ha già un account: un titolare, o un collaboratore non
 * rimosso. Una persona appartiene a una sola attività (decisione 15), quindi
 * un'email così non si invita e non accetta inviti. `email` va già passata da
 * `normalizeEmail`.
 */
export async function emailHasAccount(email: string): Promise<boolean> {
  const db = getDb();
  const [[owner], [member]] = await Promise.all([
    db
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${email}`)
      .limit(1),
    db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.email, email),
          isNotNull(businessMembers.authUserId),
        ),
      )
      .limit(1),
  ]);
  return owner !== undefined || member !== undefined;
}

export type TeamMember = {
  id: string;
  name: string | null;
  email: string | null;
};
export type TeamInvite = {
  id: string;
  email: string;
  expiresAt: Date;
  /** Calcolato alla lettura, così chi lo mostra resta puro. */
  expired: boolean;
};

/**
 * Collaboratori con un account e inviti dell'attività, scaduti compresi: il
 * titolare li vede nelle impostazioni e decide se reinviarli o eliminarli.
 */
export async function listTeam(
  businessId: string,
): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const db = getDb();
  const [members, invites] = await Promise.all([
    db
      .select({
        id: businessMembers.id,
        name: businessMembers.name,
        email: businessMembers.email,
      })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "collaborator"),
          isNotNull(businessMembers.authUserId),
        ),
      )
      .orderBy(asc(businessMembers.createdAt)),
    db
      .select({
        id: collaboratorInvites.id,
        email: collaboratorInvites.email,
        expiresAt: collaboratorInvites.expiresAt,
      })
      .from(collaboratorInvites)
      .where(eq(collaboratorInvites.businessId, businessId))
      .orderBy(desc(collaboratorInvites.createdAt)),
  ]);
  const now = Date.now();
  return {
    members,
    invites: invites.map((invite) => ({
      ...invite,
      expired: invite.expiresAt.getTime() <= now,
    })),
  };
}
