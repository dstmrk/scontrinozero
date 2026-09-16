import { getOnboardingStatus } from "@/server/onboarding-actions";
import { loadAdeIdentityMismatches } from "@/lib/services/ade-identity";
import { AdeIdentityNotice } from "@/components/settings/ade-identity-notice";

/**
 * Avviso sul disallineamento fra l'identità stampata sullo scontrino e quella
 * registrata all'AdE (REVIEW.md #106), montato nello shell del dashboard.
 *
 * **Perché non basta averlo in impostazioni.** Finita la verifica,
 * l'onboarding manda l'esercente su `/dashboard` e da lì si va in cassa: chi
 * opera per conto di una società può emettere il primo scontrino con la P.IVA
 * della società e il proprio nome sopra senza mai aprire le impostazioni. Il
 * momento in cui il dato sbagliato è stato appena digitato è anche l'unico in
 * cui nessuno glielo diceva.
 *
 * Server component a sé, dietro `<Suspense>` come `PendingSalesSection`: la
 * query non deve poter ritardare lo shell, da cui dipende la performance
 * percepita della cassa. Nel caso normale — nessuna divergenza, o un'utenza
 * "me stesso" — non rende nulla e il costo si ferma a una SELECT prefissata
 * `business_id`.
 *
 * `getOnboardingStatus` è deduplicata via `react/cache` con quella del layout:
 * non ripaga il round-trip. Da lì arriva anche il gate che rende gratuito il
 * caso normale: l'avviso può accendersi **solo** per chi ha scelto su quale
 * P.IVA operare, quindi per tutti gli altri — la stragrande maggioranza — si
 * esce prima di leggere qualunque cosa, e il costo è zero.
 */
export async function AdeIdentitySection() {
  const status = await getOnboardingStatus();
  if (!status.businessId || !status.hasUtenzaPiva) return null;

  const { denominazione, sedeLegale } = await loadAdeIdentityMismatches(
    status.businessId,
  );
  if (!denominazione && !sedeLegale) return null;

  return (
    <AdeIdentityNotice
      businessId={status.businessId}
      denominazione={denominazione}
      sedeLegale={sedeLegale}
    />
  );
}
