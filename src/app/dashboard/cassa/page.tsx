import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { CassaClient } from "@/components/cassa/cassa-client";

export default async function CassaPage() {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  return (
    <Suspense>
      <CassaClient businessId={status.businessId} />
    </Suspense>
  );
}
