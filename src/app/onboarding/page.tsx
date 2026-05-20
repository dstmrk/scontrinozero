import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const status = await getOnboardingStatus();

  // Onboarding già completato: evita il re-entry sul wizard, che farebbe
  // ri-eseguire `saveBusiness` su un profilo già onboardato (con il rischio
  // di sovrascrivere firstName/lastName). Edit del business va da /settings.
  if (status.credentialsVerified) {
    redirect("/dashboard");
  }

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
