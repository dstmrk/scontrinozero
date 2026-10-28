"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  adeCredentials,
  businesses,
  collaboratorInvites,
  profiles,
} from "@/db/schema";
import { CollaboratorInviteEmail } from "@/emails/collaborator-invite";
import { authErrorResult } from "@/lib/auth-errors";
import { checkBusinessOwner } from "@/lib/business-permissions";
import {
  countTeamSeats,
  CURRENT_COLLABORATOR_TERMS_VERSION,
  emailHasAccount,
  generateInviteToken,
  INVITE_TTL_MS,
  INVITES_PER_DAY,
  inviteAcceptUrl,
  MAX_OPEN_INVITES,
  ownerInviteBlocker,
} from "@/lib/collaborator-invites";
import { sendEmail } from "@/lib/email";
import {
  findCollaboratorAccount,
  notifyCollaboratorsAccessEnded,
  removeCollaboratorAccount,
} from "@/lib/services/collaborator-account";
import { logger } from "@/lib/logger";
import { getPlanSafe, type PlanInfo } from "@/lib/plans";
import {
  getCollaboratorLimit,
  TRIAL_COLLABORATOR_LIMIT,
} from "@/lib/plans-shared";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { isValidUuid } from "@/lib/uuid";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

/**
 * Collaboratori, lato titolare (issue #1099): condizioni, inviti e rimozione.
 * Tutte le action sono solo del titolare. L'accettazione dell'invito, che è
 * una registrazione, sta in `auth-actions.ts`; l'uscita del collaboratore in
 * `deleteAccount` (`account-actions.ts`).
 */

export type CollaboratorActionResult = { error?: string };

const SETTINGS_PATH = "/dashboard/settings";

/**
 * Per attività e non per utente: il tetto protegge la quota di Resend, che
 * è del servizio. Conta anche i tentativi rifiutati dopo il limiter, così
 * non si sonda a raffica quali email hanno un account.
 */
const inviteLimiter = new RateLimiter({
  maxRequests: INVITES_PER_DAY,
  windowMs: RATE_LIMIT_WINDOWS.DAILY,
});

async function authorizeOwner(
  action: string,
  businessId: string,
): Promise<{ userId: string } | { error: string }> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, action);
  }
  // Guard UUID (regola 9): evita il 22P02 di Postgres in checkBusinessMembership.
  if (!isValidUuid(businessId)) {
    return { error: "Identificativo non valido." };
  }
  const membership = await checkBusinessOwner(user.id, businessId);
  if ("error" in membership) return membership;
  return { userId: user.id };
}

/**
 * Il titolare accetta le Condizioni per i collaboratori, prima del primo
 * invito (decisione 5). Riaccettarle aggiorna data e versione.
 */
export async function acceptCollaboratorTerms(
  businessId: string,
): Promise<CollaboratorActionResult> {
  const auth = await authorizeOwner("acceptCollaboratorTerms", businessId);
  if ("error" in auth) return auth;

  const db = getDb();
  await db
    .update(profiles)
    .set({
      collaboratorTermsVersion: CURRENT_COLLABORATOR_TERMS_VERSION,
      collaboratorTermsAcceptedAt: new Date(),
    })
    .where(eq(profiles.authUserId, auth.userId));

  revalidatePath(SETTINGS_PATH);
  return {};
}

type InviteContext = {
  ownerEmail: string;
  collaboratorTermsVersion: string | null;
  businessName: string | null;
  loginMethod: string | null;
  verifiedAt: Date | null;
};

async function readInviteContext(
  businessId: string,
): Promise<InviteContext | undefined> {
  const db = getDb();
  const [context] = await db
    .select({
      ownerEmail: profiles.email,
      collaboratorTermsVersion: profiles.collaboratorTermsVersion,
      businessName: businesses.businessName,
      loginMethod: adeCredentials.loginMethod,
      verifiedAt: adeCredentials.verifiedAt,
    })
    .from(businesses)
    .innerJoin(profiles, eq(profiles.id, businesses.profileId))
    .leftJoin(adeCredentials, eq(adeCredentials.businessId, businesses.id))
    .where(eq(businesses.id, businessId))
    .limit(1);
  return context;
}

/** Il motivo per cui questa email non si può invitare ora, o `null`. */
async function inviteeBlocker(
  businessId: string,
  email: string,
  planInfo: PlanInfo,
): Promise<string | null> {
  const [hasAccount, seats] = await Promise.all([
    emailHasAccount(email),
    countTeamSeats(businessId, email),
  ]);
  if (hasAccount) {
    return "Questa email ha già un account ScontrinoZero: una persona può far parte di una sola attività.";
  }
  if (seats.openInvites >= MAX_OPEN_INVITES) {
    return `Hai già ${MAX_OPEN_INVITES} inviti in sospeso: revocane uno prima di invitare altre persone.`;
  }
  const limit = getCollaboratorLimit(planInfo.plan);
  if (limit !== null && seats.members + seats.openInvites >= limit) {
    return `Durante la prova puoi avere fino a ${TRIAL_COLLABORATOR_LIMIT} collaboratori, inviti in sospeso compresi. Con Team sono illimitati.`;
  }
  return null;
}

/**
 * Invita un collaboratore, o reinvia l'invito a un'email già invitata: il
 * token e la scadenza si rinnovano e il link precedente smette di valere.
 */
export async function inviteCollaborator(
  businessId: string,
  rawEmail: string,
): Promise<CollaboratorActionResult> {
  const auth = await authorizeOwner("inviteCollaborator", businessId);
  if ("error" in auth) return auth;

  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { error: "Email non valida." };

  if (!inviteLimiter.check(`invite:${businessId}`).success) {
    logger.warn(
      { businessId, errorClass: "invite_rate_limit" },
      "inviteCollaborator rate limit exceeded",
    );
    return {
      error: `Hai già inviato ${INVITES_PER_DAY} inviti nelle ultime 24 ore: riprova domani.`,
    };
  }

  const [planResult, context] = await Promise.all([
    getPlanSafe(auth.userId, "inviteCollaborator"),
    readInviteContext(businessId),
  ]);
  if (!planResult.ok) return { error: planResult.error };
  if (!context) return { error: "Business non trovato o non autorizzato." };

  const blocker =
    ownerInviteBlocker(planResult.info, context)?.message ??
    (email === normalizeEmail(context.ownerEmail)
      ? "È la tua email: invita un'altra persona."
      : await inviteeBlocker(businessId, email, planResult.info));
  if (blocker) return { error: blocker };

  const db = getDb();
  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db
    .insert(collaboratorInvites)
    .values({ businessId, email, tokenHash, expiresAt })
    .onConflictDoUpdate({
      target: [collaboratorInvites.businessId, collaboratorInvites.email],
      set: { tokenHash, expiresAt, createdAt: new Date() },
    })
    .returning({ id: collaboratorInvites.id });

  try {
    await sendEmail({
      to: email,
      subject: context.businessName
        ? `${context.businessName} ti invita a collaborare su ScontrinoZero`
        : "Invito a collaborare su ScontrinoZero",
      react: createElement(CollaboratorInviteEmail, {
        businessName: context.businessName,
        acceptLink: inviteAcceptUrl(token),
        expiresAt,
      }),
    });
  } catch (err) {
    logger.error({ err, businessId }, "inviteCollaborator: email non inviata");
    // Un invito che nessuno ha ricevuto non deve restare valido né contare
    // nei limiti. Il token nel filtro: un reinvio concorrente non si cancella.
    await db
      .delete(collaboratorInvites)
      .where(
        and(
          eq(collaboratorInvites.id, invite.id),
          eq(collaboratorInvites.tokenHash, tokenHash),
        ),
      )
      .catch((cleanupErr: unknown) =>
        logger.error(
          { err: cleanupErr, businessId },
          "inviteCollaborator: invito non ripulito",
        ),
      );
    return {
      error:
        "Non siamo riusciti a inviare l'email di invito. Riprova tra qualche minuto.",
    };
  }

  logger.info({ businessId, inviteId: invite.id }, "Collaboratore invitato");
  revalidatePath(SETTINGS_PATH);
  return {};
}

/** Revoca un invito, valido o scaduto: il link smette di valere. */
export async function revokeCollaboratorInvite(
  businessId: string,
  inviteId: string,
): Promise<CollaboratorActionResult> {
  const auth = await authorizeOwner("revokeCollaboratorInvite", businessId);
  if ("error" in auth) return auth;
  if (!isValidUuid(inviteId)) return { error: "Identificativo non valido." };

  const db = getDb();
  await db
    .delete(collaboratorInvites)
    .where(
      and(
        eq(collaboratorInvites.id, inviteId),
        eq(collaboratorInvites.businessId, businessId),
      ),
    );

  revalidatePath(SETTINGS_PATH);
  return {};
}

/**
 * Rimuove un collaboratore: il suo account si cancella subito e i documenti
 * che ha emesso restano, attribuiti al suo nome. L'effetto è immediato perché
 * ogni azione rilegge l'appartenenza per auth user (decisione 16). Un membro
 * già rimosso, o di un'altra attività, è un no-op.
 */
export async function removeCollaborator(
  businessId: string,
  memberId: string,
): Promise<CollaboratorActionResult> {
  const auth = await authorizeOwner("removeCollaborator", businessId);
  if ("error" in auth) return auth;
  if (!isValidUuid(memberId)) return { error: "Identificativo non valido." };

  const account = await findCollaboratorAccount({ memberId, businessId });
  if (account) {
    if (!(await removeCollaboratorAccount(account))) {
      return {
        error:
          "Non siamo riusciti a rimuovere il collaboratore. Riprova tra qualche minuto.",
      };
    }
    notifyCollaboratorsAccessEnded([account], "removed");
    logger.info({ businessId, memberId }, "Collaboratore rimosso");
  }

  revalidatePath(SETTINGS_PATH);
  return {};
}
