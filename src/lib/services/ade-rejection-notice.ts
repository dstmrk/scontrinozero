import { createElement } from "react";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, businessMembers, profiles } from "@/db/schema";
import {
  AdeCredentialsRejectedEmail,
  adeCredentialsRejectedSubject,
} from "@/emails/ade-credentials-rejected";
import type { LoginRejectionOutcome } from "@/lib/ade/verify-outcome";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { getTrustedAppUrl } from "@/lib/trusted-app-url";

/**
 * Avvisa il titolare che l'AdE ha rifiutato le credenziali Fisconline
 * dell'attività e i login automatici sono fermi (issue #1099). Sostituisce il
 * promemoria a 90 giorni della decisione 8: la data di scadenza la conosce
 * solo l'AdE, mentre il rifiuto è un fatto.
 *
 * Solo con collaboratori che hanno ancora un accesso: il titolare da solo
 * vede già l'errore alla cassa, il collaboratore invece legge "avvisa il
 * titolare" e il titolare può non esserci.
 *
 * Il chiamante la invoca una volta sola per episodio, sulla transizione che
 * ferma i login; la chiave di idempotenza copre un invio ripetuto dopo un
 * timeout di Resend. Non lancia.
 */
export async function notifyOwnerOfAdeRejection(params: {
  businessId: string;
  outcome: LoginRejectionOutcome;
  /** `updated_at` delle credenziali rifiutate. */
  credentialVersion: Date;
}): Promise<void> {
  const { businessId, outcome, credentialVersion } = params;
  try {
    const db = getDb();
    const [owners, collaborators] = await Promise.all([
      db
        .select({
          email: profiles.email,
          businessName: businesses.businessName,
        })
        .from(businesses)
        .innerJoin(profiles, eq(profiles.id, businesses.profileId))
        .where(eq(businesses.id, businessId))
        .limit(1),
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
    ]);
    const owner = owners[0];
    if (collaborators.length === 0 || !owner?.email) return;

    await sendEmail({
      to: owner.email,
      subject: adeCredentialsRejectedSubject(outcome, owner.businessName),
      react: createElement(AdeCredentialsRejectedEmail, {
        businessName: owner.businessName,
        outcome,
        settingsUrl: `${getTrustedAppUrl()}/dashboard/settings`,
      }),
      idempotencyKey: `ade-credentials-rejected/${businessId}/${credentialVersion.toISOString()}`,
    });
  } catch (err) {
    logger.warn(
      { err, businessId, outcome },
      "notifyOwnerOfAdeRejection: email non inviata",
    );
  }
}
