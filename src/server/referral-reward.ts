import { getStripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { REFERRAL_BONUS_DAYS } from "@/lib/referral-code";

const BONUS_SECONDS = REFERRAL_BONUS_DAYS * 24 * 60 * 60;

/**
 * Eroga il mese gratis di referral a un referrer con abbonamento Stripe
 * attivo, spostando in avanti la `trial_end` della subscription:
 *
 *   trial_end = current_period_end + REFERRAL_BONUS_DAYS
 *
 * Stripe tratta la finestra fino a `trial_end` come trial → nessun addebito →
 * la prossima data di rinnovo si sposta davvero di un mese, coerente con
 * quanto mostra l'app (il webhook `customer.subscription.updated` risincronizza
 * poi `subscriptions.current_period_end` e `profiles.plan_expires_at`).
 * `proration_behavior: "none"` evita righe di credito/debito spurie.
 *
 * Best-effort (CLAUDE.md regola 10): un fallimento Stripe NON deve rompere
 * l'onboarding del referee che ha innescato il reward. Su errore logghiamo a
 * `critical` (così è cercabile per la riconciliazione manuale del mese dovuto)
 * e ritorniamo `{ extended: false }` senza rilanciare.
 *
 * NB: per i referrer a pagamento attivi NON si incrementa `referralBonusDays`
 * (che ormai è puramente un meccanismo trial): Stripe è la fonte di verità
 * della data di rinnovo. Se l'estensione fallisce qui, il referrer resta senza
 * bonus finché non si riconcilia a mano — preferibile a una data app che
 * diverge di nuovo da Stripe.
 *
 * @param stripeSubscriptionId  La subscription Stripe del referrer (attiva).
 * @param referrerId            profiles.id del referrer (solo per log).
 * @param refereeId             profiles.id del referee — chiave di idempotenza
 *                              stabile per redemption (evita doppia estensione
 *                              sotto retry della stessa finalizeAdeVerification).
 */
export async function extendSubscriptionForReferral(args: {
  stripeSubscriptionId: string;
  referrerId: string;
  refereeId: string;
}): Promise<{ extended: boolean }> {
  const { stripeSubscriptionId, referrerId, refereeId } = args;

  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    // API 2026-05-27.dahlia: current_period_end vive su items.data[0]
    // (rimosso dal top-level Subscription), stesso accesso del webhook.
    const currentPeriodEnd = sub.items.data[0]?.current_period_end;
    if (!currentPeriodEnd) {
      logger.warn(
        { critical: true, referrerId, refereeId, stripeSubscriptionId },
        "Referral Stripe extension skipped: missing current_period_end",
      );
      return { extended: false };
    }

    const trialEnd = currentPeriodEnd + BONUS_SECONDS;

    await stripe.subscriptions.update(
      stripeSubscriptionId,
      { trial_end: trialEnd, proration_behavior: "none" },
      { idempotencyKey: `referral-extend:${refereeId}` },
    );

    logger.info(
      { referrerId, refereeId, stripeSubscriptionId, trialEnd },
      "Referral reward: Stripe subscription extended by one free month",
    );
    return { extended: true };
  } catch (err) {
    logger.error(
      { err, critical: true, referrerId, refereeId, stripeSubscriptionId },
      "Referral Stripe extension failed — owed free month needs manual reconciliation",
    );
    return { extended: false };
  }
}
