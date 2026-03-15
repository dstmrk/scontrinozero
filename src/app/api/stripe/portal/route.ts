import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getStripe } from "@/lib/stripe";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const portalLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
});

export async function POST(_req: Request): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitResult = portalLimiter.check(`portal:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Stripe portal rate limit exceeded");
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
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  const stripeCustomerId = subRow?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    return Response.json(
      { error: "Nessun abbonamento attivo trovato." },
      { status: 400 },
    );
  }

  // ── Create Billing Portal session ─────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/dashboard/settings`,
  });

  return Response.json({ url: session.url });
}
