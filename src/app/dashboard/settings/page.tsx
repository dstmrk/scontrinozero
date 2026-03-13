import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles, businesses, adeCredentials } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VAT_DESCRIPTIONS, type VatCode, VAT_CODES } from "@/types/cassa";
import { AccountDeleteSection } from "@/components/settings/account-delete-section";
import { ExportDataSection } from "@/components/settings/export-data-section";
import { AdeCredentialsSection } from "@/components/settings/ade-credentials-section";
import { getProfilePlan } from "@/server/billing-actions";
import { isTrialExpired } from "@/lib/plans";
import { PRICE_IDS } from "@/lib/stripe";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PlanBadge } from "@/components/billing/plan-badge";

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
      : profile?.fullName || null;

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
        };

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
            {/* Piano corrente */}
            <div>
              <p className="text-muted-foreground mb-2 text-sm font-medium">
                Piano corrente
              </p>
              <div className="flex items-center gap-3">
                <PlanBadge plan={planData.plan} />
                {planData.plan === "trial" &&
                  !isTrialExpired(planData.trialStartedAt) &&
                  planData.trialStartedAt && (
                    <span className="text-muted-foreground text-sm">
                      Prova attiva — scade il{" "}
                      {new Date(
                        planData.trialStartedAt.getTime() +
                          30 * 24 * 60 * 60 * 1000,
                      ).toLocaleDateString("it-IT")}
                    </span>
                  )}
                {planData.plan === "trial" &&
                  isTrialExpired(planData.trialStartedAt) && (
                    <span className="text-sm text-red-600">
                      Periodo di prova scaduto
                    </span>
                  )}
                {(planData.plan === "starter" ||
                  planData.plan === "pro" ||
                  planData.plan === "unlimited") &&
                  planData.planExpiresAt && (
                    <span className="text-muted-foreground text-sm">
                      Rinnovo il{" "}
                      {planData.planExpiresAt.toLocaleDateString("it-IT")}
                    </span>
                  )}
              </div>
            </div>

            {/* Scegli piano */}
            {planData.plan !== "pro" && planData.plan !== "unlimited" && (
              <div>
                <p className="text-muted-foreground mb-3 text-sm font-medium">
                  Scegli il tuo piano
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Starter */}
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold">Starter</h3>
                    <p className="text-muted-foreground mb-3 text-sm">
                      Scontrini illimitati · catalogo 5 prodotti
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Mensile — €4.99/mese</span>
                        <CheckoutButton
                          priceId={PRICE_IDS.starterMonthly}
                          label="Scegli"
                          variant="outline"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Annuale — €29.99/anno</span>
                        <CheckoutButton
                          priceId={PRICE_IDS.starterYearly}
                          label="Scegli"
                          variant="outline"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pro */}
                  <div className="rounded-lg border-2 border-blue-500 p-4">
                    <h3 className="font-semibold">Pro</h3>
                    <p className="text-muted-foreground mb-3 text-sm">
                      Catalogo illimitato · analytics · export
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Mensile — €8.99/mese</span>
                        <CheckoutButton
                          priceId={PRICE_IDS.proMonthly}
                          label="Scegli"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Annuale — €49.99/anno</span>
                        <CheckoutButton
                          priceId={PRICE_IDS.proYearly}
                          label="Scegli"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Gestisci abbonamento */}
            {planData.hasSubscription && (
              <div>
                <p className="text-muted-foreground mb-2 text-sm font-medium">
                  Gestisci abbonamento
                </p>
                <p className="text-muted-foreground mb-3 text-sm">
                  Modifica il piano, aggiorna il metodo di pagamento o annulla
                  l&apos;abbonamento.
                </p>
                <a
                  href="/api/stripe/portal"
                  className="text-primary text-sm underline underline-offset-4"
                >
                  Vai al portale Stripe →
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ExportDataSection />

      <AccountDeleteSection />
    </div>
  );
}
