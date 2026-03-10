import { getProfilePlan } from "@/server/billing-actions";
import { isTrialExpired } from "@/lib/plans";
import { PRICE_IDS } from "@/lib/stripe";
import { CheckoutButton } from "@/components/billing/checkout-button";

function PlanBadge({ plan }: { plan: string }) {
  const labels: Record<string, string> = {
    trial: "Prova gratuita",
    starter: "Starter",
    pro: "Pro",
    unlimited: "Unlimited",
  };
  return (
    <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-sm font-medium">
      {labels[plan] ?? plan}
    </span>
  );
}

export default async function AbbonamentoPage() {
  const result = await getProfilePlan();

  if ("error" in result) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">{result.error}</p>
      </div>
    );
  }

  const { plan, trialStartedAt, planExpiresAt, hasSubscription } = result;
  const trialExpired = isTrialExpired(trialStartedAt);
  const isActivePaid =
    plan === "starter" || plan === "pro" || plan === "unlimited";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Abbonamento</h1>

      {/* Piano corrente */}
      <section className="rounded-lg border p-6">
        <h2 className="mb-3 text-lg font-semibold">Piano corrente</h2>
        <div className="flex items-center gap-3">
          <PlanBadge plan={plan} />
          {plan === "trial" && !trialExpired && trialStartedAt && (
            <span className="text-muted-foreground text-sm">
              Prova attiva — scade il{" "}
              {new Date(
                trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
              ).toLocaleDateString("it-IT")}
            </span>
          )}
          {plan === "trial" && trialExpired && (
            <span className="text-sm text-red-600">
              Periodo di prova scaduto
            </span>
          )}
          {isActivePaid && planExpiresAt && (
            <span className="text-muted-foreground text-sm">
              Rinnovo il {planExpiresAt.toLocaleDateString("it-IT")}
            </span>
          )}
        </div>
      </section>

      {/* Scegli piano (solo se non già su Pro o Unlimited) */}
      {plan !== "pro" && plan !== "unlimited" && (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Scegli il tuo piano</h2>
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
        </section>
      )}

      {/* Gestisci abbonamento */}
      {hasSubscription && (
        <section className="rounded-lg border p-6">
          <h2 className="mb-2 text-lg font-semibold">Gestisci abbonamento</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Modifica il piano, aggiorna il metodo di pagamento o annulla
            l&apos;abbonamento.
          </p>
          <a
            href="/api/stripe/portal"
            className="text-primary text-sm underline underline-offset-4"
          >
            Vai al portale Stripe →
          </a>
        </section>
      )}
    </div>
  );
}
