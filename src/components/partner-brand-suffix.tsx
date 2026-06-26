import { getPartnerContext } from "@/lib/partners/partner-context";

/**
 * Suffisso brand del partner accanto al logo (es. "x NDS"), reso solo sui
 * subdomain partner `<slug>-app.scontrinozero.it`.
 *
 * Server component: risolve il partner dall'header `Host` della richiesta
 * (`getPartnerContext`). Sul dominio app/marketing standard ritorna `null`,
 * quindi nessun impatto visivo. Best-effort: i flussi che reindirizzano al
 * dominio canonico (link email, return Stripe) non mostreranno il suffisso.
 */
export async function PartnerBrandSuffix() {
  const partner = await getPartnerContext();
  if (!partner) return null;

  return (
    <span className="text-muted-foreground font-normal">{partner.label}</span>
  );
}
