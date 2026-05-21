import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { VAT_CODES, type VatCode } from "@/types/cassa";
import { CassaClient } from "@/components/cassa/cassa-client";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { canUseDashboardCashier, getPlan } from "@/lib/plans";

export default async function CassaPage() {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  // I piani developer_* emettono SOLO via Developer API key — la UI cassa
  // non è esposta loro, vedi `canUseDashboardCashier`.
  const user = await getAuthenticatedUser();
  const planInfo = await getPlan(user.id);
  if (!canUseDashboardCashier(planInfo.plan)) {
    redirect("/dashboard/settings#api-keys");
  }

  const db = getDb();
  const [business] = await db
    .select({ preferredVatCode: businesses.preferredVatCode })
    .from(businesses)
    .where(eq(businesses.id, status.businessId))
    .limit(1);

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
      />
    </Suspense>
  );
}
