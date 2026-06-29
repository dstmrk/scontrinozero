import { createHash } from "node:crypto";
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
 * Stati Stripe "vivi/billabili": una subscription esistente in uno di questi
 * non deve mai generare un secondo checkout, altrimenti Stripe crea una sub
 * duplicata sullo stesso customer e `syncSubscriptionData` sovrascrive l'unica
 * riga DB lasciando la vecchia sub viva e non tracciata (rischio doppio
 * addebito sul dunning `past_due` — REVIEW #38).
 *
 * `incomplete`/`incomplete_expired` NON inclusi: sono il pre-attivazione del
 * primo pagamento, bloccarli impedirebbe il retry SCA legittimo. `trialing`
 * non è usato (il trial è interno a ScontrinoZero). `canceled`/`pending` →
 * checkout consentito (riattivazione).
 */
const BILLABLE_STATUSES = new Set(["active", "past_due", "unpaid"]);

function operationInProgressResponse(): Response {
  return Response.json(
    { error: "Operazione in corso, riprova tra qualche secondo." },
    { status: 503 },
  );
}

/**
 * Idempotency key Stripe derivata da userId + finestra orario (1h): seconda
 * difesa contro doppie create in caso di retry client, oltre al claim DB.
 */
function buildIdempotencyKey(userId: string, suffix: string): string {
  const hourWindow = Math.floor(Date.now() / (60 * 60 * 1000));
  return createHash("sha256")
    .update(`${userId}:${hourWindow}:${suffix}`)
    .digest("hex");
}

/**
 * Risolve lo `stripeCustomerId` per l'utente.
 *
 * Claim preventivo in DB (riga `subscriptions` con `stripeCustomerId` ancora
 * `NULL`) **prima** di chiamare `stripe.customers.create`: solo chi vince
 * l'INSERT crea il customer Stripe, evitando l'orfano che si generava prima
 * quando due richieste concorrenti creavano entrambe un customer.
 *
 * Ritorna una `Response` (409 se l'utente ha già una subscription in uno stato
 * "vivo/billabile" — vedi `BILLABLE_STATUSES`, 503 se la creazione Stripe
 * fallisce o se un'altra richiesta sta già creando il customer per lo stesso
 * utente).
 */
async function getOrCreateStripeCustomerId(args: {
  user: { id: string; email?: string };
  priceId: string;
  stripe: Stripe;
  db: Db;
}): Promise<string | Response> {
  const { user, priceId, stripe, db } = args;
  const [existingSub] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (existingSub?.status && BILLABLE_STATUSES.has(existingSub.status)) {
    return Response.json(
      { error: "Hai già un abbonamento. Gestiscilo dal portale Stripe." },
      { status: 409 },
    );
  }

  if (existingSub?.stripeCustomerId) {
    return existingSub.stripeCustomerId;
  }

  if (existingSub) {
    // Row exists but stripeCustomerId is still NULL: another concurrent
    // request already claimed it and is creating the Stripe customer.
    return operationInProgressResponse();
  }

  // No row yet: claim it before creating the Stripe customer. ON CONFLICT DO
  // NOTHING handles concurrent requests from the same user (e.g. double-click)
  // — only the winner proceeds to create the customer.
  const [claimed] = await db
    .insert(subscriptions)
    .values({ userId: user.id, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: subscriptions.id });

  if (!claimed) {
    return operationInProgressResponse();
  }

  let customer: Awaited<ReturnType<typeof stripe.customers.create>>;
  try {
    customer = await stripe.customers.create(
      { email: user.email ?? undefined },
      { idempotencyKey: buildIdempotencyKey(user.id, "customer") },
    );
  } catch (err) {
    logger.error({ err, userId: user.id }, "Stripe customer creation failed");
    return serviceUnavailableResponse();
  }

  const interval = intervalFromPriceId(priceId) ?? "month";
  await db
    .update(subscriptions)
    .set({
      stripeCustomerId: customer.id,
      stripePriceId: priceId,
      interval,
    })
    .where(eq(subscriptions.userId, user.id));

  return customer.id;
}

/**
 * Legge `NEXT_PUBLIC_APP_URL` validato. Ritorna `Response` 503 se la
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

  // ── Resolve trusted app URL ──────────────────────────────────────────────
  const appUrlResult = resolveTrustedAppUrlOr503();
  if (appUrlResult instanceof Response) return appUrlResult;
  const appUrl = appUrlResult;

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  // No Stripe trial: il trial è gestito internamente da ScontrinoZero.
  try {
    const session = await stripe.checkout.sessions.create(
      {
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { userId: user.id },
        },
        success_url: `${appUrl}/dashboard/settings?success=1`,
        cancel_url: `${appUrl}/dashboard/settings?canceled=1`,
      },
      { idempotencyKey: buildIdempotencyKey(user.id, `session:${priceId}`) },
    );
    return Response.json({ url: session.url });
  } catch (err) {
    logger.error(
      { err, userId: user.id },
      "Stripe checkout session creation failed",
    );
    return serviceUnavailableResponse();
  }
}
