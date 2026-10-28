import { createElement } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, profiles } from "@/db/schema";
import {
  CollaboratorSuspendedEmail,
  collaboratorSuspendedSubject,
} from "@/emails/collaborator-suspended";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { getPlanSafe } from "@/lib/plans";
import { canUseCollaborators } from "@/lib/plans-shared";
import { listCollaboratorAccounts } from "./collaborator-account";

/**
 * Avvisa i collaboratori che il piano del titolare non li include più
 * (issue #1099, decisione 3 sul commento delle decisioni). La chiama il
 * webhook Stripe dopo il commit, quando un cambio porta via Team
 * (`leavesTeam`).
 *
 * Decide il piano effettivo del titolare letto adesso, non l'evento: chi
 * annulla Team durante la prova torna a `trial`, e una prova in corso
 * ammette ancora i collaboratori. La prova che scade da sola non passa da
 * qui: Stripe non manda eventi, e il collaboratore trova l'avviso nell'app.
 *
 * La chiave di idempotenza vale per collaboratore e giorno, come il
 * preavviso d'inattività: un evento riconsegnato lo stesso giorno non scrive
 * due volte. Non lancia.
 */
export async function notifyCollaboratorsOfSuspension(
  ownerAuthUserId: string,
): Promise<void> {
  try {
    const planResult = await getPlanSafe(
      ownerAuthUserId,
      "notifyCollaboratorsOfSuspension",
    );
    if (!planResult.ok) return;
    const { plan, trialStartedAt, planExpiresAt } = planResult.info;
    if (canUseCollaborators(plan, trialStartedAt, planExpiresAt)) return;

    const [business] = await getDb()
      .select({ id: businesses.id })
      .from(businesses)
      .innerJoin(profiles, eq(profiles.id, businesses.profileId))
      .where(eq(profiles.authUserId, ownerAuthUserId))
      .limit(1);
    if (!business) return;

    const day = new Date().toISOString().slice(0, 10);
    const accounts = await listCollaboratorAccounts(business.id);
    // Una alla volta: Resend accetta 10 richieste al secondo per account, e
    // su Team i collaboratori non hanno tetto. Il webhook non aspetta questa
    // funzione, quindi la sequenza non costa nulla a nessuno.
    for (const account of accounts) {
      if (!account.email) continue;
      const message = {
        to: account.email,
        subject: collaboratorSuspendedSubject(account.businessName),
        react: createElement(CollaboratorSuspendedEmail, {
          businessName: account.businessName,
        }),
        idempotencyKey: `collaborator-suspended/${account.memberId}/${day}`,
      };
      try {
        await sendEmail(message); // NOSONAR — sequenziale per il rate limit di Resend
      } catch (err) {
        logger.warn(
          { err, memberId: account.memberId },
          "notifyCollaboratorsOfSuspension: email non inviata",
        );
      }
    }
  } catch (err) {
    logger.warn(
      { err, ownerAuthUserId },
      "notifyCollaboratorsOfSuspension: avviso non inviato",
    );
  }
}
