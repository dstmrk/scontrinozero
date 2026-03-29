import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions, profiles } from "@/db/schema";
import { getStripe, planFromPriceId, intervalFromPriceId } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";

export async function POST(req: Request): Promise<Response> {
  // ── Verify Stripe signature (raw body required) ───────────────────────────
  const payload = await req.text();
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

  // ── Handle event ──────────────────────────────────────────────────────────
  try {
    await handleEvent(event, stripe);
  } catch (err) {
    logger.error(
      { err, eventType: event.type },
      "Error processing Stripe webhook event",
    );
    return Response.json({ error: "Internal error." }, { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  const db = getDb();

  switch (event.type) {
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

      await db
        .update(subscriptions)
        .set({ currentPeriodEnd: new Date(invoice.period_end * 1000) })
        .where(
          eq(subscriptions.stripeSubscriptionId, subscriptionId as string),
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

      await db
        .update(subscriptions)
        .set({ status: "incomplete" })
        .where(
          eq(subscriptions.stripeSubscriptionId, subscriptionId as string),
        );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId) break;

      await db
        .update(subscriptions)
        .set({ status: "past_due" })
        .where(
          eq(subscriptions.stripeSubscriptionId, subscriptionId as string),
        );
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

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
      break;
    }

    default:
      // Unknown event type — ignore silently
      break;
  }
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
    logger.error(
      { priceId, stripeSubscriptionId: stripeSub.id },
      "Unknown priceId in Stripe webhook — skipping plan update",
    );
    return;
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

    if (subRow) {
      await tx
        .update(profiles)
        .set({ plan, planExpiresAt: currentPeriodEnd })
        .where(eq(profiles.authUserId, subRow.userId));
    }
  });
}
