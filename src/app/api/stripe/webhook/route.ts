import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions, profiles, stripeWebhookEvents } from "@/db/schema";
import { getStripe, planFromPriceId, intervalFromPriceId } from "@/lib/stripe";
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

      // Retrieve full subscription object for price/interval data
      const stripeSub = await stripe.subscriptions.retrieve(
        session.subscription,
      );
      await syncSubscriptionData(db, session.customer as string, stripeSub);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId) break;
      await applySubscriptionUpdate(
        db,
        subscriptionId as string,
        { currentPeriodEnd: new Date(invoice.period_end * 1000) },
        "invoice.paid",
      );
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscriptionData(db, sub.customer as string, sub);
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
      await handleSubscriptionDeleted(db, sub);
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
 * three invoice handlers share this identical pattern.
 */
async function applySubscriptionUpdate(
  db: ReturnType<typeof getDb>,
  subscriptionId: string,
  fields: { status?: string | null; currentPeriodEnd?: Date | null },
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
 * Cancel a deleted Stripe subscription and downgrade the user's plan to trial.
 * Extracted to reduce Cognitive Complexity of handleEvent: the transaction
 * callback adds nesting that would otherwise push handleEvent over the limit.
 */
async function handleSubscriptionDeleted(
  db: ReturnType<typeof getDb>,
  sub: Stripe.Subscription,
): Promise<void> {
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
    await tx
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id));

    if (subRow) {
      await tx
        .update(profiles)
        .set({ plan: "trial" })
        .where(eq(profiles.authUserId, subRow.userId));
    }
  });
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

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: priceId,
        status,
        interval,
        currentPeriodEnd,
      })
      .where(eq(subscriptions.stripeCustomerId, stripeCustomerId));

    // Get userId from subscriptions to update profiles
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

    await tx
      .update(profiles)
      .set({ plan, planExpiresAt: currentPeriodEnd })
      .where(eq(profiles.authUserId, subRow.userId));
  });
}
