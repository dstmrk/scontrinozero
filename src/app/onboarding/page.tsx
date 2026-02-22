import { getOnboardingStatus } from "@/server/onboarding-actions";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const status = await getOnboardingStatus();

  // Resume al giusto step in base allo stato salvato nel DB
  const initialStep = status.hasBusiness ? (status.hasCredentials ? 2 : 1) : 0;
  const initialBusinessId = status.businessId ?? null;

  return (
    <OnboardingForm
      initialStep={initialStep}
      initialBusinessId={initialBusinessId}
    />
  );
}
