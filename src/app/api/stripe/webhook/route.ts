import { eq } from "drizzle-orm";
import type { NodePostgresDatabase } from "drizzle-orm/node-postgres";
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

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    return Response.json({ error: "Invalid signature." }, { status: 400 });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as NodePostgresDatabase<any>;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.subscription || !session.customer) break;

      // Retrieve full subscription object for price/interval data
      const stripeSub = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );
      await upsertSubscriptionData(db, session.customer as string, stripeSub);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) break;

      await db
        .update(subscriptions)
        .set({ currentPeriodEnd: new Date(invoice.period_end * 1000) })
        .where(
          eq(
            subscriptions.stripeSubscriptionId,
            invoice.subscription as string,
          ),
        );
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionData(db, sub.customer as string, sub);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      // Find the userId from the subscriptions table
      const [subRow] = await db
        .select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        .limit(1);

      // Mark subscription as canceled
      await db
        .update(subscriptions)
        .set({ status: "canceled" })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));

      // Downgrade profile to trial (read-only)
      if (subRow) {
        await db
          .update(profiles)
          .set({ plan: "trial" })
          .where(eq(profiles.authUserId, subRow.userId));
      }
      break;
    }

    default:
      // Unknown event type — ignore silently
      break;
  }
}

/**
 * Upsert subscription data into DB and sync the user's plan on profiles.
 */

async function upsertSubscriptionData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: NodePostgresDatabase<any>,
  stripeCustomerId: string,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId) ?? "starter";
  const interval = intervalFromPriceId(priceId) ?? "month";
  const status = stripeSub.status;
  const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);

  // Update the subscription row
  await db
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
  const [subRow] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);

  if (subRow) {
    await db
      .update(profiles)
      .set({ plan, planExpiresAt: currentPeriodEnd })
      .where(eq(profiles.authUserId, subRow.userId));
  }
}
