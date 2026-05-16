import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getStripe } from "@/lib/stripe";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getTrustedAppUrl, TrustedAppUrlError } from "@/lib/trusted-app-url";

const portalLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
});

async function createPortalSession(userId: string): Promise<Response | string> {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitResult = portalLimiter.check(`portal:${userId}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId }, "Stripe portal rate limit exceeded");
    return Response.json(
      { error: "Troppe richieste. Riprova tra qualche ora." },
      { status: 429 },
    );
  }

  const db = getDb();

  // ── Get Stripe customer ID ────────────────────────────────────────────────
  const [subRow] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const stripeCustomerId = subRow?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    return Response.json(
      { error: "Nessun abbonamento attivo trovato." },
      { status: 400 },
    );
  }

  // ── Create Billing Portal session ─────────────────────────────────────────
  // P1-02: validate appUrl prima di passare a Stripe — una misconfigurazione
  // env produrrebbe `return_url` verso un dominio non fidato dopo il portal.
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
  const stripe = getStripe();
  let session: Awaited<ReturnType<typeof stripe.billingPortal.sessions.create>>;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/dashboard/settings`,
    });
  } catch (err) {
    logger.error(
      { err, userId },
      "Stripe billing portal session creation failed",
    );
    return Response.json(
      {
        error:
          "Servizio di pagamento temporaneamente non disponibile. Riprova tra qualche istante.",
      },
      { status: 503 },
    );
  }

  return session.url;
}

export async function GET(_req: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  const result = await createPortalSession(user.id);
  if (result instanceof Response) return result;
  return Response.redirect(result);
}

export async function POST(_req: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  const result = await createPortalSession(user.id);
  if (result instanceof Response) return result;
  return Response.json({ url: result });
}
