import { createElement } from "react";
import { and, eq, isNotNull, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, businessMembers } from "@/db/schema";
import {
  CollaboratorAccessEndedEmail,
  collaboratorAccessEndedSubject,
  type AccessEndedReason,
} from "@/emails/collaborator-access-ended";
import { sendEmailsInSequence } from "@/lib/email";
import { logger } from "@/lib/logger";
import { deleteAuthUser } from "./auth-user-delete";

/**
 * Fine dell'accesso di un collaboratore (issue #1099, PR 6b): lo rimuove il
 * titolare, se ne va lui, o se ne va l'attività con l'account del titolare.
 *
 * Il collaboratore non ha un profilo, quindi la cascata FK di `profiles` non
 * lo raggiunge: il suo account auth va cancellato qui. La riga di
 * `business_members` resta, senza account ed email, perché il nome attribuisce
 * i documenti che ha emesso (`commercial_documents.created_by`).
 */

/** Un collaboratore con un account, e l'attività a cui appartiene. */
export type CollaboratorAccount = {
  memberId: string;
  authUserId: string;
  email: string | null;
  businessId: string;
  businessName: string | null;
};

type AccountFilter =
  { authUserId: string } | { memberId: string; businessId: string };

function selectAccounts(where: SQL | undefined) {
  return getDb()
    .select({
      memberId: businessMembers.id,
      // Non null per il filtro qui sotto; Drizzle non lo restringe da sé.
      authUserId: businessMembers.authUserId,
      email: businessMembers.email,
      businessId: businessMembers.businessId,
      businessName: businesses.businessName,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(
      and(
        eq(businessMembers.role, "collaborator"),
        isNotNull(businessMembers.authUserId),
        where,
      ),
    );
}

function asAccounts(
  rows: (Omit<CollaboratorAccount, "authUserId"> & {
    authUserId: string | null;
  })[],
): CollaboratorAccount[] {
  return rows.flatMap((row) =>
    row.authUserId === null ? [] : [{ ...row, authUserId: row.authUserId }],
  );
}

/**
 * Il collaboratore cercato per auth user (chi è loggato) o per membro e
 * attività (il titolare che rimuove): l'attività nel filtro impedisce a un
 * titolare di toccare membri altrui. `null` per un titolare o un membro già
 * rimosso.
 */
export async function findCollaboratorAccount(
  filter: AccountFilter,
): Promise<CollaboratorAccount | null> {
  const where =
    "authUserId" in filter
      ? eq(businessMembers.authUserId, filter.authUserId)
      : and(
          eq(businessMembers.id, filter.memberId),
          eq(businessMembers.businessId, filter.businessId),
        );
  const [account] = asAccounts(await selectAccounts(where).limit(1));
  return account ?? null;
}

/** I collaboratori con un account dell'attività, per la cancellazione del titolare. */
export async function listCollaboratorAccounts(
  businessId: string,
): Promise<CollaboratorAccount[]> {
  return asAccounts(
    await selectAccounts(eq(businessMembers.businessId, businessId)),
  );
}

/**
 * Cancella l'account auth del collaboratore, poi stacca la riga: niente più
 * account, email né ultimo accesso; il nome resta. Prima l'auth, come nel
 * purge del titolare: se fallisce non è cambiato nulla e si ritorna `false`.
 *
 * Se fallisce l'aggiornamento della riga l'accesso è comunque chiuso (nessun
 * login trova più quell'auth user) e si ritorna `true`, con un `error`
 * critico: la riga conserva l'email finché il titolare non rimuove di nuovo
 * il collaboratore, e il secondo giro trova l'auth user già assente.
 */
export async function removeCollaboratorAccount(
  account: CollaboratorAccount,
): Promise<boolean> {
  if (!(await deleteAuthUser(account.authUserId))) return false;
  try {
    await getDb()
      .update(businessMembers)
      .set({ authUserId: null, email: null, lastSeenAt: null })
      .where(eq(businessMembers.id, account.memberId));
  } catch (err) {
    logger.error(
      { err, memberId: account.memberId, critical: true },
      "removeCollaboratorAccount: account cancellato ma riga non staccata",
    );
  }
  return true;
}

/**
 * Avvisa i collaboratori che l'accesso è finito. Fire-and-forget: chi chiama
 * non aspetta Resend. Una email alla volta (`sendEmailsInSequence`): quando
 * il titolare cancella l'account vanno a tutti i collaboratori, che su Team
 * non hanno tetto, e Resend accetta 10 richieste al secondo.
 */
export function notifyCollaboratorsAccessEnded(
  accounts: readonly Pick<
    CollaboratorAccount,
    "memberId" | "email" | "businessName"
  >[],
  reason: AccessEndedReason,
): void {
  const recipients = accounts.flatMap((account) =>
    account.email ? [{ ...account, email: account.email }] : [],
  );
  if (recipients.length === 0) return;
  void sendEmailsInSequence(
    recipients.map((account) => ({
      to: account.email,
      subject: collaboratorAccessEndedSubject(reason, account.businessName),
      react: createElement(CollaboratorAccessEndedEmail, {
        businessName: account.businessName,
        reason,
      }),
    })),
    (err, index) =>
      logger.warn(
        { err, reason, memberId: recipients[index]?.memberId },
        "notifyCollaboratorsAccessEnded: email non inviata",
      ),
  );
}
