# ScontrinoZero — Piano di sviluppo

La versione pubblicata corrente è in `package.json`. Lo storico delle release è ricostruibile dai tag git (`git tag -l "v1.*"`).

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Roadmap

| Versione      | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.4.0** ✅ | _Rilasciata._ Coupon/promo codes (`allow_promotion_codes`), referral program Member-Get-Member, Stripe Customer Portal polish, **Partner/reseller** (approccio leggero: piano `unlimited` + referral code del partner + subdomain branding `<slug>-app`, vedi [PARTNER.md](./PARTNER.md))                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **v1.4.x**    | Supporto in-app: voce "Supporto" nelle impostazioni del dashboard (link a `/help/contatto-assistenza`, eventuale mailto pre-compilato). Da approfondire in conversazione ad-hoc prima della v1.5.0. **Durabilità idempotency welcome/operator email** (`verifyAdeCredentials`): oggi gating su `businessSnapshot.fiscalCode` (fix 6cc4057). Migrare a flag durabili `welcome_email_sent_at` / `operator_notified_at` su `businesses`, backfill da `created_at` dei business con `fiscalCode` già valorizzato. Sblocca audit trail, resilienza a reset manuale di `fiscalCode`, re-send esplicito futuro. Migration handwritten, ~6 file (migration SQL + journal + schema Drizzle + 2 server-action site + test). |
| **v1.5.0**    | **Personalizzazione scontrino per utenti Pro** (ex #588): intestazione/logo/messaggio personalizzato sul documento commerciale. Pro-gated, bassa superficie, upsell del piano                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **v1.6.0**    | Catalogo: **modifica prodotto** (CRUD locale completo, senza sync AdE)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **v1.7.0**    | **AdE auth multi-metodo**: SPID e CIE selezionabili in onboarding + settings; cookie jar cifrato, re-auth on 401                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **v1.8.0**    | **Espansione auth**: indagare Passkey e login/registrazione social Google/Apple via Supabase Auth (valutare fattibilità/integrazione prima dell'implementazione)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **v1.9.0**    | **Storno avanzato**: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **v1.10.0**   | **Stampa termica Bluetooth** 58/80mm (Web Bluetooth)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **v1.x**      | **GDPR — cancellazione utenti inattivi >12 mesi** (ex #97): rilevazione inattività (ultimo scontrino), email di avviso ≥30 giorni prima, cancellazione dati correlati. Base legale: minimizzazione dati                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **v1.x**      | Umami analytics (event tracking lato app) — voce minore, accorpabile a una release vicina                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## Nice to have (no release)

Idee valutate e **deliberatamente fuori dalla roadmap**: ognuna aggiunge
superficie software (più codice, più bug potenziali, più manutenzione) a fronte
di un beneficio incerto sul bacino target (micro-esercenti). Si promuovono a
una release **solo** quando emerge domanda utente documentata — non per
completezza. Coerente con il principio "Minimalismo" del piano.

- **Email scontrino al cliente** (PDF allegato via Resend) — superficie email
  deliverability/bounce per beneficio marginale; lo scontrino è già accessibile
  via pagina pubblica/PDF. _Trigger:_ richieste utenti ricorrenti.
- **Sync catalogo/dati documento commerciale con AdE** (ex #107) — flusso AdE
  fragile aggiuntivo (HAR aggiungi/modifica/elimina) a fronte di un catalogo
  locale già funzionante. _Trigger:_ richiesta esplicita + HAR disponibile.
- **CSV import prodotti** — gli esercenti target hanno cataloghi piccoli;
  data-mapping/validazione import è superficie sproporzionata. _Trigger:_
  onboarding di esercenti con cataloghi grandi.
- **Barcode scanner** (BarcodeDetector API) — frammentazione browser/PWA e
  fallback complessi. _Trigger:_ domanda da retail con molti SKU.
- **Buoni pasto** (nuovo metodo di pagamento) — un nuovo metodo significa nuovo
  stato fiscale/UX da mantenere e testare. _Trigger:_ richiesta da esercenti
  della ristorazione.
- **Pagamento misto** (es. parte contanti + parte carta) — moltiplica i casi di
  pagamento e i test su totale/arrotondamenti (`CLAUDE.md` regola 17).
  _Trigger:_ richiesta reale.
- **Integrazioni POS** (Nexi #93, SumUp #92) — 2 SDK esterni + webhook +
  riconciliazione pagamento↔scontrino; alta superficie, beneficio incerto sui
  micro-esercenti che spesso usano un POS separato. _Trigger:_ domanda B2B
  concreta; eventualmente una sola integrazione (es. SumUp) come pilota.
- **Developer API (Fase A + B)** — API key per-merchant, endpoints
  emissione/annullamento (Fase A), poi partner account/webhook/multi-operatore
  (Fase B). Mercato di nicchia, superficie elevata. La spec di riferimento
  resta in [DEVELOPER.md](./DEVELOPER.md). _Trigger:_ domanda da
  partner/integratori.

---

## v1.4.0 — Partner/reseller (rilasciato, approccio leggero)

Implementato. Documentazione operativa: **[PARTNER.md](./PARTNER.md)**.

Sintesi: il partner riceve il piano `unlimited` (assegnazione manuale) e i suoi
utenti vengono attribuiti tramite il **referral code** del partner (sistema
referral esistente, `referral_redemptions` — nessun motore di attribuzione
nuovo). Opzionalmente un **subdomain ad-hoc** `<slug>-app.<dominio>` mostra un
testo statico accanto al logo (es. "x NDS") e **vincola la registrazione al
codice del partner** (force + lock + enforcement server-side). Mapping nella
tabella `partners` (`supabase/migrations/0022_partners.sql`,
`src/db/schema/partners.ts`); risoluzione hostname in
`src/lib/partners/partner-host.ts` e `src/lib/partners/partner-context.ts`;
branding in `src/components/partner-brand-suffix.tsx`; enforcement in
`src/server/auth-actions.ts`. Reporting = query su `referral_redemptions`
(vedi PARTNER.md).

> **Approccio "single-use partner codes" deliberatamente scartato.** La spec
> originale prevedeva codici monouso con prefisso per-partner, tabella
> `partner_codes`, claim atomico race-safe e script di
> generazione/billing/sospensione. È stata **superata** da questo approccio
> leggero: riusa referral + `unlimited` senza nuovo gating né nuovi script, e
> tiene la fatturazione wholesale fuori dal codice (accordo contrattuale col
> partner). Da riconsiderare solo se emerge una necessità reale di attribuzione
> monouso anti-leak o di automazione billing/sospensione.

---

## Strategia SEO & lancio (GTM)

**Tesi.** Budget marketing zero, dominio nuovo, prodotto live: l'unica leva sostenibile è SEO + lancio open source mirato. La SEO classica è lenta (3–9 mesi a regime), quindi va **avviata subito** ma accompagnata da leve veloci (tool gratuiti su `/strumenti`, lancio comunità) che generino primi backlink e traffico in giorni invece che in mesi.

**Stato.** L'architettura dei contenuti è **già live**: `/guide` (educativo top-of-funnel), `/per/[slug]` (landing per categoria), `/confronto` (alta intenzione commerciale), `/strumenti/[slug]` (backlink-magnet), affiancati a `/help` (operativo). Gli **invarianti redazionali** (data file per route, niente promesse di feature non live, slug separati `/help` vs `/guide`, review umana) vivono in `CLAUDE.md` regola 8. Da qui resta da eseguire il **lancio**, non l'architettura.

**Gate di lancio (hard).** ProductHunt/HN sono "one-shot a memoria lunga": vanno sparati una volta sola, solo quando il sito è pronto a convertire un picco e le promesse Pro sono onorate. Non anticipare.

---

## Bug noti / tech debt

Il registro dei bug noti, del tech debt e dei miglioramenti di
sicurezza/performance vive in [REVIEW.md](./REVIEW.md), ordinato per priorità
(P1/P2/P3) con file:riga, scenario e fix proposto per ogni voce. Anche la
motivazione dell'allowlist audit-ci (`GHSA-67mh-4wv8-2f99`) è lì, nella sezione
"Rischi accettati". `PLAN.md` resta la roadmap delle funzionalità: gli item di
REVIEW.md legati a una release (es. autocomplete catalogo → v1.6.0, allowlist
SPID → v1.7.0) riportano il target nella voce stessa. Gli item legati a feature
ora **nice-to-have** (es. limiti mensili Developer API) restano in REVIEW.md ma
diventano bloccanti solo se/quando la feature viene promossa a release.

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Performance percepita prima di tutto**: ogni interazione deve sembrare istantanea (optimistic UI, prefetching, stale-while-revalidate).
4. **Superficie minima — nice-to-have gated da domanda**: una feature entra in roadmap solo quando sblocca adozione/lancio o c'è domanda utente documentata. Tutto il resto vive in "Nice to have (no release)" finché non lo richiede qualcuno. Meno codice = meno bug, meno manutenzione.
