import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getStripe, isValidPriceId, intervalFromPriceId } from "@/lib/stripe";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const checkoutLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
});

export async function POST(req: Request): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitResult = checkoutLimiter.check(`checkout:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Stripe checkout rate limit exceeded");
    return Response.json(
      { error: "Troppe richieste. Riprova tra qualche ora." },
      { status: 429 },
    );
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const priceId = typeof body.priceId === "string" ? body.priceId : null;
  if (!priceId || !isValidPriceId(priceId)) {
    return Response.json({ error: "Price ID non valido." }, { status: 400 });
  }

  const stripe = getStripe();
  const db = getDb();

  // ── Get or create Stripe customer ─────────────────────────────────────────
  const [existingSub] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  let stripeCustomerId = existingSub?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
    });
    stripeCustomerId = customer.id;

    const interval = intervalFromPriceId(priceId) ?? "month";
    await db.insert(subscriptions).values({
      userId: user.id,
      stripeCustomerId,
      stripePriceId: priceId,
      interval,
      status: "pending",
    });
  }

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  // No Stripe trial: il trial è gestito internamente da ScontrinoZero.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    subscription_data: {
      metadata: { userId: user.id },
    },
    success_url: `${appUrl}/dashboard/settings?success=1`,
    cancel_url: `${appUrl}/dashboard/settings?canceled=1`,
  });

  return Response.json({ url: session.url });
}
