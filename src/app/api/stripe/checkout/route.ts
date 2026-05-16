import { eq } from "drizzle-orm";
import type Stripe from "stripe";
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

function serviceUnavailableResponse(): Response {
  return Response.json(
    {
      error:
        "Servizio di pagamento temporaneamente non disponibile. Riprova tra qualche istante.",
    },
    { status: 503 },
  );
}

type Db = ReturnType<typeof getDb>;

/**
 * Risolve lo `stripeCustomerId` per l'utente: usa quello esistente in DB,
 * altrimenti crea un nuovo customer Stripe e inserisce la riga subscriptions
 * con `ON CONFLICT DO NOTHING` per gestire double-click concorrenti.
 *
 * Ritorna una `Response` (503) se la creazione del customer Stripe fallisce.
 */
async function getOrCreateStripeCustomerId(args: {
  user: { id: string; email?: string };
  priceId: string;
  stripe: Stripe;
  db: Db;
}): Promise<string | Response> {
  const { user, priceId, stripe, db } = args;
  const [existingSub] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (existingSub?.stripeCustomerId) {
    return existingSub.stripeCustomerId;
  }

  let customer: Awaited<ReturnType<typeof stripe.customers.create>>;
  try {
    customer = await stripe.customers.create({
      email: user.email ?? undefined,
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Stripe customer creation failed");
    return serviceUnavailableResponse();
  }

  const interval = intervalFromPriceId(priceId) ?? "month";

  // ON CONFLICT DO NOTHING: handle concurrent requests from the same user
  // (e.g. double-click). If another request already inserted the row, fall
  // back to a SELECT for the winner's stripeCustomerId. The extra Stripe
  // customer created in the race case is acceptable (orphan, never used).
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

  // inserted.stripeCustomerId is `string | null` per schema (nullable column),
  // but we just inserted `customer.id` (non-null) so the fallback is defensive.
  if (inserted) return inserted.stripeCustomerId ?? customer.id;

  const [winner] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);
  return winner?.stripeCustomerId ?? customer.id;
}

/**
 * P1-02: legge `NEXT_PUBLIC_APP_URL` validato. Ritorna `Response` 503 se la
 * validazione fallisce (URL non https in prod, hostname non in allowlist).
 */
function resolveTrustedAppUrlOr503(): string | Response {
  try {
    return getTrustedAppUrl();
  } catch (err) {
    if (err instanceof TrustedAppUrlError) {
      return serviceUnavailableResponse();
    }
    throw err;
  }
}

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
  const customerResult = await getOrCreateStripeCustomerId({
    user,
    priceId,
    stripe,
    db,
  });
  if (customerResult instanceof Response) return customerResult;
  const stripeCustomerId = customerResult;

  // ── Resolve trusted app URL (P1-02) ───────────────────────────────────────
  const appUrlResult = resolveTrustedAppUrlOr503();
  if (appUrlResult instanceof Response) return appUrlResult;
  const appUrl = appUrlResult;

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  // No Stripe trial: il trial è gestito internamente da ScontrinoZero.
  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id },
      },
      success_url: `${appUrl}/dashboard/settings?success=1`,
      cancel_url: `${appUrl}/dashboard/settings?canceled=1`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    logger.error(
      { err, userId: user.id },
      "Stripe checkout session creation failed",
    );
    return serviceUnavailableResponse();
  }
}
