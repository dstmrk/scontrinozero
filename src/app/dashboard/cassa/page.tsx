import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { VAT_CODES, type VatCode } from "@/types/cassa";
import { CassaClient } from "@/components/cassa/cassa-client";
import { PlanUnavailable } from "@/components/dashboard/plan-unavailable";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { canUseDashboardCashier, canUsePro, getPlanSafe } from "@/lib/plans";
import { fetchReceiptPrintProfile } from "@/lib/receipts/print-profile";

export default async function CassaPage() {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  // I piani developer_* emettono SOLO via Developer API key — la UI cassa
  // non è esposta loro, vedi `canUseDashboardCashier`.
  const user = await getAuthenticatedUser();

  // `getPlanSafe` e non `getPlan` (REVIEW.md #85): su profilo orfano o `57014`
  // il throw finirebbe al boundary di segmento, che in produzione può solo dire
  // "qualcosa è andato storto" — qui invece il messaggio è preciso. Niente
  // `try/catch` intorno alla regione: il `redirect()` qui sotto funziona
  // lanciando `NEXT_REDIRECT` e un catch largo se lo mangerebbe.
  const planResult = await getPlanSafe(user.id, "cassaPage");
  if (!planResult.ok) {
    return <PlanUnavailable message={planResult.error} />;
  }

  if (!canUseDashboardCashier(planResult.info.plan)) {
    redirect("/dashboard/settings#api-keys");
  }

  const db = getDb();
  // Intestazione e messaggio di cortesia per la stampa termica si leggono QUI,
  // non dopo l'emissione: un round-trip in più sulla schermata di successo si
  // vedrebbe, e l'auto-stampa deve partire senza attese (principio #1).
  const [[business], printProfile] = await Promise.all([
    db
      .select({ preferredVatCode: businesses.preferredVatCode })
      .from(businesses)
      .where(eq(businesses.id, status.businessId))
      .limit(1),
    fetchReceiptPrintProfile(status.businessId),
  ]);

  const preferredVatCode =
    business?.preferredVatCode &&
    VAT_CODES.includes(business.preferredVatCode as VatCode)
      ? (business.preferredVatCode as VatCode)
      : undefined;

  return (
    <Suspense>
      <CassaClient
        businessId={status.businessId}
        preferredVatCode={preferredVatCode}
        printProfile={printProfile}
        discountsUnlocked={canUsePro(
          planResult.info.plan,
          planResult.info.planExpiresAt,
          planResult.info.trialStartedAt,
        )}
      />
    </Suspense>
  );
}
