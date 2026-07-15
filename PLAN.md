# ScontrinoZero — Piano di sviluppo

La versione pubblicata corrente è in `package.json`. Lo storico delle release è ricostruibile dai tag git (`git tag -l "v1.*"`).

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Roadmap

Obiettivo corrente: **aumentare gli utenti e semplificare l'adozione**. Le prime
release riducono l'attrito d'iscrizione; le successive completano l'operatività al
banco e le feature Pro committed.

| Versione   | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.6.0** | **Stampa scontrino via foglio di stampa OS** (AirPrint su iOS, Mopria su Android, dialog di stampa su desktop): bottone "Stampa" che apre il PDF scontrino — **già generato a 58mm** in `src/lib/pdf/generate-sale-receipt.ts`, esposto da `src/app/api/documents/[documentId]/pdf/route.ts`. _Alta utilità operativa (scontrino fisico al banco): prioritaria rispetto al social login e al sync AdE. Corsia unica cross-platform, superficie minima, **nessun Web Bluetooth**. ⚠️ Il foglio di stampa OS parla solo **rete/WiFi** (AirPrint/Mopria): copre le stampanti scontrini WiFi/AirPrint e qualsiasi stampante di rete, **non** le stampantine BT economiche ESC/POS → quel caso è coperto dalla stampa Bluetooth diretta dell'app nativa (v2.0)._ |
| **v1.7.0** | **Espansione auth**: Passkey e login/registrazione social Google/Apple via Supabase Auth (valutare fattibilità/integrazione prima dell'implementazione). _Leva d'adozione, iscrizione a un tap._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **v1.8.0** | **Storno avanzato**: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **v1.9.0** | **Sync documenti commerciali da AdE** (feature **Pro**, ex #107): recupero/importazione dei documenti commerciali/corrispettivi storici emessi, per riconciliazione e continuità dati. _Committed («in arrivo» sul Pro), pianificata dopo stampa scontrino e storno. Groundwork già presente: `searchDocuments`/`getDocument` in `src/lib/ade/client.ts` (oggi usati solo per recovery interno)._                                                                                                                                                                                                                                                                                                                                                           |

> **Oltre v1.9 — app nativa iOS/Android (v2.0, in valutazione).** Due capability
> restano precluse alla PWA e convergono sullo stesso sblocco: **SPID** (il flusso
> IdP vive in una webview e richiede persistere il cookie di sessione) e la **stampa
> Bluetooth diretta** verso le stampantine termiche ESC/POS economiche (SDK vendor /
> BLE raw — su iOS il Web Bluetooth è del tutto assente, e comunque il foglio di
> stampa OS non raggiunge le stampanti BT su nessuna piattaforma; cfr. v1.6). Un
> wrapper nativo le abiliterebbe entrambe. _Non pianificata: trigger su un volume
> utenti che giustifichi il costo di manutenzione di un secondo runtime — il caso
> "esercente con stampantina BT economica" è il driver documentabile._

> **Già spedite** (storico nei tag git, non più in roadmap): **AdE auth con CIE**
> (v1.5.0, ex #1 attrito d'iscrizione): login CIE ID (email + password app CIE ID,
> conferma via notifica push) selezionabile in onboarding e settings come alternativa
> a Fisconline; sessione interattiva cifrata con rinnovo alla scadenza. **SPID escluso**
> (flusso IdP in webview, cookie di sessione non persistibile in PWA) → rimandato
> all'app nativa (v2.0). Onboarding tour
> dashboard (v1.4.1), catalogo con CRUD completo inclusa la **modifica prodotto**
> (`updateCatalogItem` in `src/server/catalog-actions.ts`), **GDPR —
> cancellazione utenti inattivi >12 mesi** (v1.4.2, ex #97): sweep in-process
> opt-in con preavviso email ≥30 giorni; inattività = ultimo scontrino o login;
> `src/lib/services/inactive-user-prune.ts`. **Umami web-analytics** (v1.4.2):
> script cookieless self-hosted + eventi custom (`receipt_emitted`,
> `plan_upgrade_click`, `onboarding_step_completed`) via `src/lib/umami.ts`;
> env baked `NEXT_PUBLIC_UMAMI_*`, runbook in `deploy/umami/`.

---

## Nice to have (no release)

Idee valutate e **deliberatamente fuori dalla roadmap**: ognuna aggiunge
superficie software (più codice, più bug potenziali, più manutenzione) a fronte
di un beneficio incerto sul bacino target (micro-esercenti). Si promuovono a
una release **solo** quando emerge domanda utente documentata — non per
completezza. Coerente con il principio "Minimalismo" del piano.

- **Personalizzazione scontrino (Pro)** (ex #588) — intestazione/logo/messaggio
  personalizzato sul documento commerciale. Bassa superficie ma è un upsell, non
  una leva d'adozione: rimandata finché non è la priorità. _Trigger:_ domanda
  documentata da utenti Pro.
- **Paginazione lista catalogo (Pro)** — la modifica prodotto è già spedita, ma
  la lista carica tutti i prodotti in un colpo (`getCatalogItems` in
  `src/server/catalog-actions.ts`, nessun limit/offset). Serve solo ai Pro con
  cataloghi grandi (Starter è capato a 5, `STARTER_CATALOG_LIMIT` in
  `src/lib/plans-shared.ts`). _Trigger:_ Pro con cataloghi oltre ~50 prodotti.
- **Email scontrino al cliente** (PDF allegato via Resend) — superficie email
  deliverability/bounce per beneficio marginale; lo scontrino è già accessibile
  via pagina pubblica/PDF. _Trigger:_ richieste utenti ricorrenti.
- **Sync catalogo prodotti con AdE** (ex #107) — importare i prodotti dalla
  rubrica AdE nel catalogo locale: flusso AdE fragile aggiuntivo (HAR
  aggiungi/modifica/elimina) a fronte di un catalogo locale già funzionante. **Non**
  è una feature «in arrivo» (il recupero dei _documenti commerciali_ da AdE — cosa
  diversa — è invece committed su Pro: v1.9.0). _Trigger:_ richiesta esplicita +
  HAR disponibile.
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
- **Integrazioni POS — SumUp (#92) come pilota Pro**, Nexi (#93) a seguire —
  SDK esterni + webhook + riconciliazione pagamento↔scontrino; alta superficie,
  beneficio incerto sui micro-esercenti che spesso usano un POS separato. Se si
  procede, **SumUp come feature Pro** in pilota singolo prima di generalizzare.
  _Trigger:_ domanda B2B concreta.
- **Developer API (Fase A + B)** — API key per-merchant, endpoints
  emissione/annullamento (Fase A), poi partner account/webhook/multi-operatore
  (Fase B). Mercato di nicchia, superficie elevata. La spec di riferimento
  resta in [DEVELOPER.md](./DEVELOPER.md). _Trigger:_ domanda da
  partner/integratori.

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
REVIEW.md legati a una release (es. allowlist SPID → v2.0, app nativa) riportano il target
nella voce stessa. Gli item legati a feature ora **nice-to-have** (es. limiti
mensili Developer API) restano in REVIEW.md ma diventano bloccanti solo se/quando
la feature viene promossa a release.

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Performance percepita prima di tutto**: ogni interazione deve sembrare istantanea (optimistic UI, prefetching, stale-while-revalidate).
4. **Superficie minima — nice-to-have gated da domanda**: una feature entra in roadmap solo quando sblocca adozione/lancio o c'è domanda utente documentata. Tutto il resto vive in "Nice to have (no release)" finché non lo richiede qualcuno. Meno codice = meno bug, meno manutenzione.
