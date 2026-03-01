import { getOnboardingStatus } from "@/server/onboarding-actions";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const status = await getOnboardingStatus();

  // Resume al giusto step in base allo stato salvato nel DB
  let initialStep: number;
  if (status.hasBusiness) {
    initialStep = status.hasCredentials ? 2 : 1;
  } else {
    initialStep = 0;
  }
  const initialBusinessId = status.businessId ?? null;

  return (
    <OnboardingForm
      initialStep={initialStep}
      initialBusinessId={initialBusinessId}
    />
  );
}
