import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles, businesses, adeCredentials } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VAT_DESCRIPTIONS, type VatCode, VAT_CODES } from "@/types/cassa";
import { signOut } from "@/server/auth-actions";
import { AccountDeleteSection } from "@/components/settings/account-delete-section";
import { ExportDataSection } from "@/components/settings/export-data-section";
import { AdeCredentialsSection } from "@/components/settings/ade-credentials-section";
import { getProfilePlan } from "@/server/billing-actions";
import { canUseApi, isTrialExpired, TRIAL_DAYS } from "@/lib/plans";
import { PRICE_IDS } from "@/lib/stripe";
import { ApiKeySection } from "@/components/settings/api-key-section";
import { PlanBadge } from "@/components/billing/plan-badge";
import { PlanSelection } from "@/components/billing/plan-selection";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const db = getDb();

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  const business = profile
    ? (
        await db
          .select()
          .from(businesses)
          .where(eq(businesses.profileId, profile.id))
          .limit(1)
      )[0]
    : null;

  const cred = business
    ? ((
        await db
          .select({ verifiedAt: adeCredentials.verifiedAt })
          .from(adeCredentials)
          .where(eq(adeCredentials.businessId, business.id))
          .limit(1)
      )[0] ?? null)
    : null;

  const displayName =
    profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : null;

  const preferredVatLabel =
    business?.preferredVatCode &&
    VAT_CODES.includes(business.preferredVatCode as VatCode)
      ? VAT_DESCRIPTIONS[business.preferredVatCode as VatCode]
      : null;

  const planResult = await getProfilePlan();
  const planData =
    "error" in planResult
      ? null
      : {
          plan: planResult.plan,
          trialStartedAt: planResult.trialStartedAt,
          planExpiresAt: planResult.planExpiresAt,
          hasSubscription: planResult.hasSubscription,
          subscriptionStatus: planResult.subscriptionStatus,
          subscriptionInterval: planResult.subscriptionInterval,
        };

  type BillingCardState =
    | "trial-active"
    | "trial-expired"
    | "subscribed"
    | "past-due"
    | "unlimited";

  const cardState: BillingCardState = (() => {
    if (!planData) return "trial-active";
    if (planData.plan === "unlimited") return "unlimited";
    if (planData.hasSubscription && planData.subscriptionStatus === "past_due")
      return "past-due";
    if (planData.hasSubscription && planData.subscriptionStatus === "active")
      return "subscribed";
    if (isTrialExpired(planData.trialStartedAt)) return "trial-expired";
    return "trial-active";
  })();

  const trialExpiryDate = planData?.trialStartedAt
    ? new Date(
        planData.trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      )
    : null;

  const intervalLabel =
    planData?.subscriptionInterval === "year" ? "annuale" : "mensile";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Impostazioni</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profilo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            <span className="text-muted-foreground">Nome:</span>{" "}
            {displayName || "Non impostato"}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user.email}
          </p>
        </CardContent>
      </Card>

      {business && (
        <Card>
          <CardHeader>
            <CardTitle>Attivita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {business.businessName && (
              <p>
                <span className="text-muted-foreground">Nome attività:</span>{" "}
                {business.businessName}
              </p>
            )}
            {business.vatNumber && (
              <p>
                <span className="text-muted-foreground">P.IVA:</span>{" "}
                {business.vatNumber}
              </p>
            )}
            {business.fiscalCode && (
              <p>
                <span className="text-muted-foreground">C.F.:</span>{" "}
                {business.fiscalCode}
              </p>
            )}
            {(business.address || business.city) && (
              <p>
                <span className="text-muted-foreground">Sede:</span>{" "}
                {[
                  business.address,
                  business.streetNumber,
                  business.city && business.province
                    ? `${business.city} (${business.province})`
                    : (business.city ?? business.province),
                  business.zipCode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            {preferredVatLabel && (
              <p>
                <span className="text-muted-foreground">IVA prevalente:</span>{" "}
                {preferredVatLabel}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Credenziali AdE</CardTitle>
        </CardHeader>
        <CardContent>
          <AdeCredentialsSection
            businessId={business?.id ?? null}
            hasCredentials={!!cred}
            verifiedAt={cred?.verifiedAt ?? null}
          />
        </CardContent>
      </Card>

      {planData && (
        <Card>
          <CardHeader>
            <CardTitle>Piano e Abbonamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Trial scaduto — banner warning */}
            {cardState === "trial-expired" && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                Il periodo di prova è scaduto. Scegli un piano per continuare ad
                emettere scontrini.
              </div>
            )}

            {/* Pagamento fallito — banner errore */}
            {cardState === "past-due" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                Pagamento fallito — aggiorna il metodo di pagamento per evitare
                l&apos;interruzione del servizio.
              </div>
            )}

            {/* Piano corrente */}
            <div>
              <p className="text-muted-foreground mb-2 text-sm font-medium">
                Piano corrente
              </p>
              <div className="flex items-center gap-3">
                <PlanBadge plan={planData.plan} />

                {cardState === "trial-active" && trialExpiryDate && (
                  <span className="text-muted-foreground text-sm">
                    Prova attiva — scade il{" "}
                    {trialExpiryDate.toLocaleDateString("it-IT")}
                  </span>
                )}

                {cardState === "trial-expired" && trialExpiryDate && (
                  <span className="text-sm text-red-600">
                    Scaduto il {trialExpiryDate.toLocaleDateString("it-IT")}
                  </span>
                )}

                {cardState === "subscribed" && (
                  <span className="text-muted-foreground text-sm">
                    Abbonamento {intervalLabel}
                    {planData.planExpiresAt &&
                      ` — rinnovo il ${planData.planExpiresAt.toLocaleDateString("it-IT")}`}
                  </span>
                )}

                {cardState === "past-due" && (
                  <span className="text-sm text-red-600">
                    Abbonamento {intervalLabel} — pagamento scaduto
                  </span>
                )}

                {cardState === "unlimited" && (
                  <span className="text-muted-foreground text-sm">
                    Piano illimitato — gestito direttamente.
                  </span>
                )}
              </div>
            </div>

            {/* Scegli piano — solo senza abbonamento attivo */}
            {(cardState === "trial-active" ||
              cardState === "trial-expired") && (
              <PlanSelection
                starterMonthly={PRICE_IDS.starterMonthly}
                starterYearly={PRICE_IDS.starterYearly}
                proMonthly={PRICE_IDS.proMonthly}
                proYearly={PRICE_IDS.proYearly}
              />
            )}

            {/* Gestisci abbonamento — solo con abbonamento attivo */}
            {cardState === "subscribed" && (
              <div>
                <p className="text-muted-foreground mb-2 text-sm font-medium">
                  Gestisci abbonamento
                </p>
                <p className="text-muted-foreground mb-3 text-sm">
                  Modifica il piano, aggiorna il metodo di pagamento o annulla
                  l&apos;abbonamento tramite il portale sicuro di Stripe.
                </p>
                <a
                  href="/api/stripe/portal"
                  className="text-primary text-sm underline underline-offset-4"
                >
                  Vai al portale Stripe →
                </a>
              </div>
            )}

            {/* Pagamento scaduto — link urgente al portal */}
            {cardState === "past-due" && (
              <a
                href="/api/stripe/portal"
                className="text-sm font-medium text-red-600 underline underline-offset-4"
              >
                Aggiorna metodo di pagamento →
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {business && planData && canUseApi(planData.plan) && (
        <Card>
          <CardHeader>
            <CardTitle>API key</CardTitle>
          </CardHeader>
          <CardContent>
            <ApiKeySection businessId={business.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sessione</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            Esci dall&apos;account su questo dispositivo.
          </p>
          <form action={signOut}>
            <Button variant="outline" type="submit">
              Esci
            </Button>
          </form>
        </CardContent>
      </Card>

      <ExportDataSection />

      <AccountDeleteSection />
    </div>
  );
}
