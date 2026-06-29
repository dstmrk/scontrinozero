import { redirect } from "next/navigation";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import {
  profiles,
  businesses,
  adeCredentials,
  referralRedemptions,
} from "@/db/schema";
import { ReferralSection } from "@/components/settings/referral-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VAT_DESCRIPTIONS, type VatCode, VAT_CODES } from "@/types/cassa";
import { signOut } from "@/server/auth-actions";
import { AccountDeleteSection } from "@/components/settings/account-delete-section";
import { ExportDataSection } from "@/components/settings/export-data-section";
import { AdeCredentialsSection } from "@/components/settings/ade-credentials-section";
import { EditAdeCredentialsSection } from "@/components/settings/edit-ade-credentials-section";
import { EditProfileSection } from "@/components/settings/edit-profile-section";
import { EditBusinessSection } from "@/components/settings/edit-business-section";
import { ChangePasswordSection } from "@/components/settings/change-password-section";
import { ThemeSection } from "@/components/settings/theme-section";
import { getProfilePlan } from "@/server/billing-actions";
import { canUseApi, TRIAL_DAYS } from "@/lib/plans";
import {
  computeBillingCardState,
  getCancelingStatusText,
  getManageSubscriptionCopy,
} from "./billing-card-state";
import { PRICE_IDS } from "@/lib/stripe";
import { ApiKeySection } from "@/components/settings/api-key-section";
import { ExtraSettingsSection } from "@/components/settings/extra-settings-section";
import { SupportSection } from "@/components/settings/support-section";
import { PlanBadge } from "@/components/billing/plan-badge";
import { PlanSelection } from "@/components/billing/plan-selection";
import { RefreshOnSuccess } from "@/components/billing/refresh-on-success";
import { ScrollToHash } from "@/components/billing/scroll-to-hash";
import { APP_VERSION, getBuildLabel } from "@/lib/version";

/**
 * Compone la riga "Sede" dell'attività. Estratta a livello di modulo per
 * tenere bassa la Cognitive Complexity di SettingsPage (S3776): concentra qui
 * la logica città/provincia/CAP. Ritorna null se non c'è né indirizzo né città.
 */
function formatBusinessLocation(business: {
  address: string | null | undefined;
  streetNumber: string | null | undefined;
  city: string | null | undefined;
  province: string | null | undefined;
  zipCode: string | null | undefined;
}): string | null {
  if (!business.address && !business.city) return null;
  const cityProvince =
    business.city && business.province
      ? `${business.city} (${business.province})`
      : (business.city ?? business.province);
  return [
    business.address,
    business.streetNumber,
    cityProvince,
    business.zipCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ success?: string }>;
}) {
  // searchParams e creazione del client Supabase sono indipendenti → in parallelo.
  const [{ success }, supabase] = await Promise.all([
    searchParams,
    createServerSupabaseClient(),
  ]);
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

  const businessLocation = business ? formatBusinessLocation(business) : null;

  const completedReferrals = profile
    ? ((
        await db
          .select({ value: count() })
          .from(referralRedemptions)
          .where(
            and(
              eq(referralRedemptions.referrerId, profile.id),
              isNotNull(referralRedemptions.rewardedAt),
            ),
          )
      )[0]?.value ?? 0)
    : 0;

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
          cancelAtPeriodEnd: planResult.cancelAtPeriodEnd,
        };

  const cardState = computeBillingCardState(planData);

  const trialExpiryDate = planData?.trialStartedAt
    ? new Date(
        planData.trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      )
    : null;

  const intervalLabel =
    planData?.subscriptionInterval === "year" ? "annuale" : "mensile";

  // Heading di sezione: raggruppa visivamente le card per area tematica.
  const sectionHeadingClass =
    "text-muted-foreground text-sm font-semibold tracking-wide uppercase";

  return (
    <div className="space-y-8">
      <RefreshOnSuccess active={success === "1"} />
      <ScrollToHash />
      <h1 className="text-2xl font-bold">Impostazioni</h1>

      {/* Account — profilo, sicurezza, sessione */}
      <section className="space-y-4">
        <h2 className={sectionHeadingClass}>Account</h2>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Profilo</CardTitle>
              <EditProfileSection
                firstName={profile?.firstName ?? null}
                lastName={profile?.lastName ?? null}
              />
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <span className="text-muted-foreground">Nome:</span>{" "}
                {displayName || "Non impostato"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                {user.email}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sicurezza</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordSection />
            </CardContent>
          </Card>

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
        </div>
      </section>

      {/* Attività e fisco — dati attività, credenziali AdE */}
      <section className="space-y-4">
        <h2 className={sectionHeadingClass}>Attività e fisco</h2>
        <div className="space-y-6">
          {business && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Attività</CardTitle>
                <EditBusinessSection
                  businessId={business.id}
                  businessName={business.businessName ?? null}
                  address={business.address ?? null}
                  streetNumber={business.streetNumber ?? null}
                  city={business.city ?? null}
                  province={business.province ?? null}
                  zipCode={business.zipCode ?? null}
                  preferredVatCode={business.preferredVatCode ?? null}
                />
              </CardHeader>
              <CardContent className="space-y-2">
                {business.businessName && (
                  <p>
                    <span className="text-muted-foreground">
                      Nome attività:
                    </span>{" "}
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
                {businessLocation && (
                  <p>
                    <span className="text-muted-foreground">Sede:</span>{" "}
                    {businessLocation}
                  </p>
                )}
                {preferredVatLabel && (
                  <p>
                    <span className="text-muted-foreground">
                      IVA prevalente:
                    </span>{" "}
                    {preferredVatLabel}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Credenziali AdE</CardTitle>
              {business && (
                <EditAdeCredentialsSection businessId={business.id} />
              )}
            </CardHeader>
            <CardContent>
              <AdeCredentialsSection
                businessId={business?.id ?? null}
                hasCredentials={!!cred}
                verifiedAt={cred?.verifiedAt ?? null}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Abbonamento — piano corrente, referral.
          Reso solo se almeno una card è presente, per non lasciare un
          heading orfano (utente autenticato senza profilo/piano). */}
      {(planData || profile) && (
        <section className="space-y-4">
          <h2 className={sectionHeadingClass}>Abbonamento</h2>
          <div className="space-y-6">
            {planData && (
              // id="billing" → ancora del deep-link BILLING_SETTINGS_HREF
              // (/dashboard/settings#billing). scroll-mt evita che la sticky header
              // copra il titolo quando si atterra sull'ancora.
              <Card id="billing" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle>Piano e Abbonamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Trial scaduto — banner warning */}
                  {cardState === "trial-expired" && (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                      Il periodo di prova è scaduto. Scegli un piano per
                      continuare ad emettere scontrini.
                    </div>
                  )}

                  {/* Pagamento fallito — banner errore */}
                  {cardState === "past-due" && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      Pagamento fallito — aggiorna il metodo di pagamento per
                      evitare l&apos;interruzione del servizio.
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
                          Scaduto il{" "}
                          {trialExpiryDate.toLocaleDateString("it-IT")}
                        </span>
                      )}

                      {cardState === "subscribed" && (
                        <span className="text-muted-foreground text-sm">
                          Abbonamento {intervalLabel}
                          {planData.planExpiresAt &&
                            ` — rinnovo il ${planData.planExpiresAt.toLocaleDateString("it-IT")}`}
                        </span>
                      )}

                      {cardState === "canceling" && (
                        <span className="text-sm text-yellow-700">
                          {getCancelingStatusText(
                            intervalLabel,
                            planData.planExpiresAt,
                          )}
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

                  {/* Gestisci abbonamento — abbonamento attivo o in cancellazione */}
                  {(cardState === "subscribed" ||
                    cardState === "canceling") && (
                    <div>
                      <p className="text-muted-foreground mb-2 text-sm font-medium">
                        Gestisci abbonamento
                      </p>
                      <p className="text-muted-foreground mb-3 text-sm">
                        {getManageSubscriptionCopy(cardState)}
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

            {profile && (
              <Card>
                <CardHeader>
                  <CardTitle>Referral</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReferralSection
                    referralCode={profile.referralCode}
                    completedReferrals={completedReferrals}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Preferenze — aspetto */}
      <section className="space-y-4">
        <h2 className={sectionHeadingClass}>Preferenze</h2>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aspetto</CardTitle>
            </CardHeader>
            <CardContent>
              <ThemeSection />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Supporto — Help Center + contatto email pre-compilato */}
      <section className="space-y-4">
        <h2 className={sectionHeadingClass}>Supporto</h2>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assistenza</CardTitle>
            </CardHeader>
            <CardContent>
              <SupportSection
                accountEmail={user.email}
                plan={planData?.plan ?? null}
                appVersion={APP_VERSION}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Altre impostazioni — sezioni a basso uso, nascoste di default */}
      <ExtraSettingsSection>
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

        <ExportDataSection />

        <AccountDeleteSection />

        <Card>
          <CardHeader>
            <CardTitle>Informazioni</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>
              ScontrinoZero {APP_VERSION} &mdash; build {getBuildLabel()}
            </p>
          </CardContent>
        </Card>
      </ExtraSettingsSection>
    </div>
  );
}
