import { Suspense } from "react";
import { getPartnerContext } from "@/lib/partners/partner-context";
import { RegisterForm } from "./register-form";

/**
 * Server component: risolve il contesto partner dall'header `Host` e lo passa
 * come prop al form client (regola 15: calcolo server → prop al client). Sui
 * subdomain partner `forcedReferralCode`/`partnerLabel` sono valorizzati e il
 * form blocca il campo referral sul codice del partner.
 *
 * Il `Suspense` resta necessario: `RegisterForm` legge `useSearchParams`
 * (?ref=, ?rcode=) e Next lo richiede per il prerender SSG (CSR bailout).
 */
export default async function RegisterPage() {
  const partner = await getPartnerContext();
  return (
    <Suspense fallback={null}>
      <RegisterForm
        forcedReferralCode={partner?.referralCode ?? null}
        partnerLabel={partner?.label ?? null}
      />
    </Suspense>
  );
}
