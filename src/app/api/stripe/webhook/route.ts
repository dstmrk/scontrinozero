import { and, eq, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions, profiles, stripeWebhookEvents } from "@/db/schema";
import {
  getStripe,
  planFromPriceId,
  intervalFromPriceId,
  STRIPE_WEBHOOK_REQUEST_OPTIONS,
} from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { readTextWithLimit } from "@/lib/request-utils";
import type Stripe from "stripe";

const WEBHOOK_MAX_BYTES = 256 * 1024; // 256 KB — sufficient for all Stripe payloads

export async function POST(req: Request): Promise<Response> {
  // ── Body size guard ───────────────────────────────────────────────────────
  // Read the raw body with a hard limit before any signature verification.
  // Stripe requires the exact bytes for HMAC, so we use readTextWithLimit
  // (not readJsonWithLimit) to preserve the raw payload.
  const bodyResult = await readTextWithLimit(req, WEBHOOK_MAX_BYTES);
  if (!bodyResult.ok) {
    if ("tooLarge" in bodyResult) {
      return Response.json({ error: "Payload too large." }, { status: 413 });
    }
    return Response.json({ error: "Failed to read body." }, { status: 400 });
  }
  const payload = bodyResult.text;

  // ── Verify Stripe signature (raw body required) ───────────────────────────
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured");
    return Response.json(
      { error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  // ── Livemode guard ───────────────────────────────────────────────────────
  // If STRIPE_EXPECT_LIVEMODE is set, reject events that don't match the
  // expected context (prevents test/live data contamination on misconfiguration).
  const expectLivemodeEnv = process.env.STRIPE_EXPECT_LIVEMODE;
  if (expectLivemodeEnv !== undefined) {
    const expectedLivemode = expectLivemodeEnv === "true";
    if (event.livemode !== expectedLivemode) {
      logger.warn(
        { livemode: event.livemode, expected: expectedLivemode },
        "Stripe event livemode mismatch — ignoring",
      );
      return Response.json({ received: true });
    }
  }

  // ── Dedup + process ──────────────────────────────────────────────────────
  // Strategy: INSERT-first atomic claim.
  //
  // Previous SELECT-then-INSERT had a race: two concurrent deliveries of the
  // same event both passed the SELECT check, both called handleEvent (double
  // side effects on subscription/profile), then only one INSERT won. The dedup
  // table showed a single "processed" entry, hiding the double execution.
  //
  // New pattern:
  //   1. INSERT with ON CONFLICT DO NOTHING + RETURNING. DB guarantees only
  //      one concurrent request gets a row back. Others see empty RETURNING →
  //      already claimed or processed → return 200 immediately.
  //   2. Winner calls handleEvent. On failure: DELETE the claim (best-effort)
  //      then re-throw → 500 → Stripe retries. If DELETE also fails: log
  //      critical (manual cleanup: DELETE FROM stripe_webhook_events WHERE
  //      event_id = '<id>').
  //   3. On success: claim row stays → permanent dedup for future retries.
  try {
    const db = getDb();

    // 1. Atomic claim: only one concurrent request wins the INSERT
    const [claimed] = await db
      .insert(stripeWebhookEvents)
      .values({ eventId: event.id, eventType: event.type })
      .onConflictDoNothing()
      .returning({ eventId: stripeWebhookEvents.eventId });

    if (!claimed) {
      logger.warn(
        { eventId: event.id, eventType: event.type },
        "Duplicate Stripe webhook event — already claimed or processed, skipping",
      );
      return Response.json({ received: true });
    }

    // 2. Process the event (we are the sole handler for this event)
    await processWithClaimRelease(db, event.id, event, stripe);
  } catch (err) {
    logger.error(
      { err, eventType: event.type },
      "Error processing Stripe webhook event",
    );
    return Response.json({ error: "Internal error." }, { status: 500 });
  }

  return Response.json({ received: true });
}

/**
 * Call handleEvent and release the atomic claim if processing fails,
 * so Stripe can retry the event. Extracted to reduce Cognitive Complexity
 * of the POST handler (nested try/catch would push it over the allowed limit).
 *
 * On DELETE failure the claim stays locked — log critical and require manual
 * cleanup: DELETE FROM stripe_webhook_events WHERE event_id = '<id>'.
 */
async function processWithClaimRelease(
  db: ReturnType<typeof getDb>,
  eventId: string,
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  try {
    await handleEvent(event, stripe);
    await db
      .update(stripeWebhookEvents)
      .set({ completedAt: new Date() })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  } catch (processErr) {
    // Release claim so Stripe can retry this event.
    try {
      await db
        .delete(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, eventId));
    } catch (deleteErr) {
      logger.error(
        { eventId, err: deleteErr },
        "Failed to release Stripe webhook claim — event stuck, manual cleanup required",
      );
    }
    throw processErr; // propagates to outer catch → 500 → Stripe retries
  }
}

async function handleEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  const db = getDb();

  switch (event.type) {
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.customer) break;

      // Cancel any pending subscription row created at checkout initiation.
      // The WHERE status = "pending" guard prevents accidentally canceling a
      // row that was already activated by a subsequent successful checkout
      // session with the same Stripe customer (e.g. user retried after expiry).
      const expiredUpdated = await db
        .update(subscriptions)
        .set({ status: "canceled" })
        .where(
          and(
            eq(subscriptions.stripeCustomerId, session.customer as string),
            eq(subscriptions.status, "pending"),
          ),
        )
        .returning({ id: subscriptions.id });

      if (expiredUpdated.length === 0) {
        // Not an error: the pending row may never have existed (e.g. user never
        // initiated checkout) or was already cleaned up. Log for observability.
        logger.warn(
          { stripeCustomerId: session.customer },
          "checkout.session.expired: no pending subscription row found — nothing to cancel",
        );
      }
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      // Disputes (chargebacks) require immediate manual review.
      // Log with critical: true so on-call alerting fires.
      logger.error(
        {
          critical: true,
          disputeId: dispute.id,
          chargeId: dispute.charge as string,
          amount: dispute.amount,
          reason: dispute.reason,
        },
        "Stripe dispute created — immediate action required",
      );
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription !== "string" || !session.customer) break;

      // Retrieve full subscription object for price/interval data.
      // Webhook-scoped timeout + retries (vedi STRIPE_WEBHOOK_REQUEST_OPTIONS).
      // NB: questa è una read, idempotente per natura — i retry SDK sono safe.
      // Loggiamo con errorClass per discriminare nei dashboard gli errori del
      // call outbound dagli errori della logica DB downstream.
      let stripeSub: Stripe.Subscription;
      try {
        stripeSub = await stripe.subscriptions.retrieve(
          session.subscription,
          undefined,
          STRIPE_WEBHOOK_REQUEST_OPTIONS,
        );
      } catch (err) {
        logger.error(
          {
            err,
            eventType: event.type,
            errorClass: (err as Error)?.constructor?.name ?? "Unknown",
          },
          "stripe.subscriptions.retrieve failed in webhook",
        );
        // Rilancia: il claim verrà rilasciato da processWithClaimRelease e
        // Stripe ritenterà l'evento.
        throw err;
      }
      await syncSubscriptionData(
        db,
        session.customer as string,
        stripeSub,
        event.created,
      );
      break;
    }

    case "invoice.paid":
      // Nessuna scrittura: l'evento resta registrato e deduplicato, ma
      // `currentPeriodEnd` ha un solo writer corretto, `syncSubscriptionData`
      // (regola 27b, una sola fonte di verità per una grandezza di Stripe).
      //
      // `invoice.period_end` è la fine del ciclo di fatturazione appena
      // **chiuso** (≈ l'istante del rinnovo), non la fine del nuovo periodo
      // pagato — quella vive in `invoice.lines.data[0].period.end`, ed è la
      // stessa che `syncSubscriptionData` legge già da
      // `items[0].current_period_end`. Poiché `invoice.paid` e
      // `customer.subscription.updated` arrivano insieme senza ordering
      // garantito, il valore sbagliato vinceva circa metà delle volte e
      // restava in DB per un intero ciclo.
      break;

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscriptionData(
        db,
        sub.customer as string,
        sub,
        event.created,
      );
      break;
    }

    case "invoice.payment_action_required": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId) break;
      await applySubscriptionUpdate(
        db,
        subscriptionId as string,
        { status: "incomplete" },
        "invoice.payment_action_required",
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId) break;
      await applySubscriptionUpdate(
        db,
        subscriptionId as string,
        { status: "past_due" },
        "invoice.payment_failed",
      );
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(db, sub, event.created);
      break;
    }

    default:
      // Unknown event type — ignore silently
      break;
  }
}

/**
 * UPDATE subscriptions WHERE stripeSubscriptionId = subscriptionId, then warn
 * if no row was found. Extracted to reduce Cognitive Complexity of handleEvent:
 * i due handler invoice che aggiornano lo stato condividono questo pattern.
 *
 * La firma accetta di proposito il solo `status`: `currentPeriodEnd` ha un
 * unico writer, `syncSubscriptionData`, e restringere il tipo impedisce a un
 * handler futuro di reintrodurre la scrittura da un'invoice (REVIEW #70).
 */
async function applySubscriptionUpdate(
  db: ReturnType<typeof getDb>,
  subscriptionId: string,
  fields: { status: string },
  eventLabel: string,
): Promise<void> {
  const updated = await db
    .update(subscriptions)
    .set(fields)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .returning({ id: subscriptions.id });

  if (updated.length === 0) {
    logger.warn(
      { stripeSubscriptionId: subscriptionId },
      `${eventLabel}: no subscription row found — event acknowledged`,
    );
  }
}

/**
 * Guardia sull'ordine di consegna (REVIEW.md #61): un evento full-sync si
 * applica solo se non è più vecchio dell'ultimo già applicato sulla riga.
 *
 * `lte` e non `lt`: due eventi Stripe possono condividere lo stesso `created`
 * (es. `invoice.paid` + `customer.subscription.updated` allo stesso secondo) e
 * la dedup per `event.id` impedisce comunque di riapplicare lo stesso evento.
 * `IS NULL` copre la prima scrittura, quando il watermark non esiste ancora.
 *
 * Vive nella WHERE dell'UPDATE, non in un read-then-write: sotto READ COMMITTED
 * il secondo UPDATE concorrente si mette in coda sul row lock e rivaluta la
 * condizione sulla riga aggiornata, quindi l'evento stale trova 0 righe. Un
 * confronto letto in anticipo avrebbe una finestra TOCTOU e, con due consegne
 * simultanee, lascerebbe vincere l'ultimo a committare — cioè il bug stesso.
 */
function isNotOlderThanWatermark(eventCreatedAt: Date) {
  return or(
    isNull(subscriptions.lastStripeEventCreated),
    lte(subscriptions.lastStripeEventCreated, eventCreatedAt),
  );
}

/**
 * Cancel a deleted Stripe subscription and downgrade the user's plan to trial.
 * Extracted to reduce Cognitive Complexity of handleEvent: the transaction
 * callback adds nesting that would otherwise push handleEvent over the limit.
 */
async function handleSubscriptionDeleted(
  db: ReturnType<typeof getDb>,
  sub: Stripe.Subscription,
  eventCreated: number,
): Promise<void> {
  const eventCreatedAt = new Date(eventCreated * 1000);

  // Find the userId from the subscriptions table (read-only, outside tx)
  const [subRow] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);

  // Wrap both writes in a transaction: subscription + profile must stay
  // consistent. A partial update (subscription canceled but plan not reset,
  // or vice versa) would leave feature gates in an inconsistent state.
  await db.transaction(async (tx) => {
    // Azzera anche stripeSubscriptionId/stripePriceId/currentPeriodEnd.
    // Lasciarli stale fa fallire `applySubscriptionUpdate` quando arriva un
    // customer.subscription.updated per la sub successiva creata dopo un
    // re-checkout (lookup per stripeSubscriptionId non trova la nuova).
    const applied = await tx
      .update(subscriptions)
      .set({
        status: "canceled",
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodEnd: null,
        lastStripeEventCreated: eventCreatedAt,
      })
      .where(
        and(
          eq(subscriptions.stripeSubscriptionId, sub.id),
          isNotOlderThanWatermark(eventCreatedAt),
        ),
      )
      .returning({ id: subscriptions.id });

    if (applied.length === 0) {
      // 0 righe: o la riga non esiste (nessun `subRow`), o la guardia ha
      // respinto un evento più vecchio del watermark. `subRow` discrimina.
      logOutOfOrderOrMissing(sub.id, eventCreated, Boolean(subRow));
      return;
    }

    if (subRow) {
      await tx
        .update(profiles)
        .set({ plan: "trial" })
        .where(eq(profiles.authUserId, subRow.userId));
    }
  });
}

/**
 * Log del caso "UPDATE a 0 righe" su `customer.subscription.deleted`. Estratto
 * per non annidare un if/else dentro il callback della transazione (Cognitive
 * Complexity) e per tenere i due messaggi vicini: distinguerli è ciò che rende
 * `stripe_event_out_of_order` una metrica leggibile invece di un catch-all.
 */
function logOutOfOrderOrMissing(
  stripeSubscriptionId: string,
  eventCreated: number,
  rowExists: boolean,
): void {
  if (rowExists) {
    logger.warn(
      { stripeSubscriptionId, eventCreated, outOfOrder: true },
      "stripe_event_out_of_order: customer.subscription.deleted più vecchio dell'ultimo evento applicato — ignorato, evento acknowledged",
    );
    return;
  }
  logger.warn(
    { stripeSubscriptionId, eventCreated },
    "customer.subscription.deleted: no subscription row found — event acknowledged",
  );
}

/**
 * Sync subscription data into DB and update the user's plan on profiles.
 * Both writes are wrapped in a transaction to ensure consistency: if the
 * profile update fails after the subscription update, the plan would be
 * out of sync with the billing state.
 */
async function syncSubscriptionData(
  db: ReturnType<typeof getDb>,
  stripeCustomerId: string,
  stripeSub: Stripe.Subscription,
  eventCreated: number,
): Promise<void> {
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId);
  const interval = intervalFromPriceId(priceId);

  if (!plan || !interval) {
    // Throw so processWithClaimRelease releases the claim and Stripe retries.
    // Silently returning would acknowledge the event as done while the plan
    // was never updated — a persistent desync with no recovery path.
    logger.error(
      { priceId, stripeSubscriptionId: stripeSub.id, unknownPriceId: true },
      "Unknown priceId in Stripe webhook — releasing claim for Stripe retry",
    );
    throw new Error(
      `Unknown priceId ${priceId} — configure STRIPE_PRICE_ID_* env vars`,
    );
  }

  const status = stripeSub.status;
  const currentPeriodEnd = new Date(
    (stripeSub.items.data[0]?.current_period_end ?? 0) * 1000,
  );
  // Annullamento a fine periodo dal portale Stripe (REVIEW.md #34): lo status
  // resta 'active' fino a currentPeriodEnd. Scriviamo sempre il valore corrente
  // così la riattivazione (toggle a false) si riallinea senza update parziali.
  const cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
  const eventCreatedAt = new Date(eventCreated * 1000);

  await db.transaction(async (tx) => {
    // Il lookup precede l'UPDATE di proposito: serve a distinguere le due
    // cause di un UPDATE a 0 righe — riga assente (desync, si rilancia perché
    // Stripe ritenti) contro guardia di ordering scattata (evento stale, si
    // acknowledgia). Senza questa lettura i due casi sono indistinguibili e un
    // desync reale finirebbe silenziosamente in un warn.
    const [subRow] = await tx
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (!subRow) {
      // Throw instead of silently returning: this causes handleEvent to fail,
      // the event is NOT marked as processed, and Stripe can retry. A silent
      // return here would acknowledge the event as done while the profile was
      // never updated — a silent desync with no recovery path.
      logger.error(
        { stripeCustomerId, stripeSubscriptionId: stripeSub.id },
        "syncSubscriptionData: no subscription row found for stripeCustomerId — failing so Stripe can retry",
      );
      throw new Error(
        `syncSubscriptionData: no subscription row for stripeCustomerId ${stripeCustomerId}`,
      );
    }

    const applied = await tx
      .update(subscriptions)
      .set({
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: priceId,
        status,
        interval,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        lastStripeEventCreated: eventCreatedAt,
      })
      .where(
        and(
          eq(subscriptions.stripeCustomerId, stripeCustomerId),
          isNotOlderThanWatermark(eventCreatedAt),
        ),
      )
      .returning({ id: subscriptions.id });

    if (applied.length === 0) {
      // La riga esiste (il SELECT sopra l'ha trovata) ⇒ 0 righe significa
      // guardia di ordering. Niente scrittura sul profilo: applicare il plan
      // di un evento stale è esattamente il bug che questa guardia previene.
      logger.warn(
        {
          stripeCustomerId,
          stripeSubscriptionId: stripeSub.id,
          eventCreated,
          outOfOrder: true,
        },
        "stripe_event_out_of_order: evento subscription più vecchio dell'ultimo applicato — ignorato, evento acknowledged",
      );
      return;
    }

    await tx
      .update(profiles)
      .set({ plan, planExpiresAt: currentPeriodEnd })
      .where(eq(profiles.authUserId, subRow.userId));
  });
}
