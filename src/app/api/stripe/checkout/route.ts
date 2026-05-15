import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getStripe, isValidPriceId, intervalFromPriceId } from "@/lib/stripe";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { readJsonWithLimit } from "@/lib/request-utils";
import { getTrustedAppUrl, TrustedAppUrlError } from "@/lib/trusted-app-url";

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
  // 8 KB is ample for { priceId } — rejects oversized payloads before JSON.parse.
  const bodyResult = await readJsonWithLimit(req, 8 * 1024);
  if (!bodyResult.ok) {
    return "tooLarge" in bodyResult
      ? Response.json({ error: "Payload troppo grande." }, { status: 413 })
      : Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const body = bodyResult.data as Record<string, unknown>;

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
    let customer: Awaited<ReturnType<typeof stripe.customers.create>>;
    try {
      customer = await stripe.customers.create({
        email: user.email ?? undefined,
      });
    } catch (err) {
      logger.error({ err, userId: user.id }, "Stripe customer creation failed");
      return Response.json(
        {
          error:
            "Servizio di pagamento temporaneamente non disponibile. Riprova tra qualche istante.",
        },
        { status: 503 },
      );
    }

    const interval = intervalFromPriceId(priceId) ?? "month";

    // Use ON CONFLICT DO NOTHING to handle concurrent requests from the same
    // user (e.g. double-click). If another request already inserted the row,
    // the insert is silently skipped and we fall back to a SELECT to retrieve
    // the existing stripeCustomerId. The extra Stripe customer created here in
    // the race case is acceptable (orphan, never used).
    const [inserted] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        stripeCustomerId: customer.id,
        stripePriceId: priceId,
        interval,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ stripeCustomerId: subscriptions.stripeCustomerId });

    if (inserted) {
      stripeCustomerId = inserted.stripeCustomerId;
    } else {
      // Conflict: another concurrent request inserted first. Re-read the
      // winner's stripeCustomerId to create the checkout session with it.
      const [winner] = await db
        .select({ stripeCustomerId: subscriptions.stripeCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id))
        .limit(1);
      stripeCustomerId = winner?.stripeCustomerId ?? customer.id;
    }
  }

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  // No Stripe trial: il trial è gestito internamente da ScontrinoZero.
  // P1-02: validate appUrl prima di passare a Stripe — una misconfigurazione
  // env produrrebbe `success_url`/`cancel_url` verso un dominio non fidato.
  let appUrl: string;
  try {
    appUrl = getTrustedAppUrl();
  } catch (err) {
    if (err instanceof TrustedAppUrlError) {
      return Response.json(
        {
          error:
            "Servizio di pagamento temporaneamente non disponibile. Riprova tra qualche istante.",
        },
        { status: 503 },
      );
    }
    throw err;
  }
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id },
      },
      success_url: `${appUrl}/dashboard/settings?success=1`,
      cancel_url: `${appUrl}/dashboard/settings?canceled=1`,
    });
  } catch (err) {
    logger.error(
      { err, userId: user.id },
      "Stripe checkout session creation failed",
    );
    return Response.json(
      {
        error:
          "Servizio di pagamento temporaneamente non disponibile. Riprova tra qualche istante.",
      },
      { status: 503 },
    );
  }

  return Response.json({ url: session.url });
}
