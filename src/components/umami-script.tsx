import Script from "next/script";

/**
 * Loader dello script Umami (web-analytics self-hosted, cookieless).
 *
 * Env baked al build (regola 18 CLAUDE.md): se `NEXT_PUBLIC_UMAMI_SRC` o
 * `NEXT_PUBLIC_UMAMI_WEBSITE_ID` sono assenti o **vuote** → ritorna `null`
 * (Umami disattivo, es. dev/self-hosted senza istanza; un `?? default` non
 * scatterebbe su `""`). `afterInteractive` differisce il caricamento e non
 * blocca il first paint (performance percepita — priorità #1).
 *
 * Montato nel root layout: copre tutte le route group (marketing/app/auth/
 * dashboard). Distinto dal dominio "analytics" business (KPI dashboard).
 */
export function UmamiScript() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return null;
  return (
    <Script src={src} data-website-id={websiteId} strategy="afterInteractive" />
  );
}
