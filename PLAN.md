# ScontrinoZero — Piano di sviluppo

La versione pubblicata corrente è in `package.json`. Lo storico delle release è ricostruibile dai tag git (`git tag -l "v1.*"`).

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Roadmap

Obiettivo corrente: **aumentare gli utenti e semplificare l'adozione**. Le prime
release riducono l'attrito d'iscrizione; le successive completano l'operatività al
banco e le feature Pro committed.

| Versione   | Descrizione                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.8.0** | **Sync documenti commerciali da AdE** (feature **Pro**, ex #107): recupero/importazione dei documenti commerciali/corrispettivi storici emessi, per riconciliazione e continuità dati. _Committed («in arrivo» sul Pro), pianificata dopo stampa scontrino e storno. Groundwork già presente: `searchDocuments`/`getDocument` in `src/lib/ade/client.ts` (oggi usati solo per recovery interno)._ |

> **Oltre v1.8 — app nativa iOS/Android (v2.0, in valutazione).** Due capability
> restano precluse alla PWA: **SPID** (il flusso IdP vive in una webview e richiede
> persistere il cookie di sessione) e la **stampa Bluetooth su iOS** (WebKit non
> implementa Web Bluetooth e non c'è flag che lo abiliti; il foglio di stampa OS
> non raggiunge le stampanti BT su nessuna piattaforma). Un wrapper nativo le
> abiliterebbe entrambe. _Nota: fino alla v1.5 questo blocco dava la stampa BT per
> preclusa alla PWA **in generale** — non è vero su Android, dove la v1.6.0 la
> spedisce via Web Bluetooth. Resta vero su iOS, che è quindi diventato il driver
> concreto di questa valutazione. Non pianificata: trigger su un volume di utenti
> iOS con stampantina BT che giustifichi il costo di manutenzione di un secondo
> runtime._

---

## Nice to have (no release)

Idee valutate e **deliberatamente fuori dalla roadmap**: ognuna aggiunge
superficie software (più codice, più bug potenziali, più manutenzione) a fronte
di un beneficio incerto sul bacino target (micro-esercenti). Si promuovono a
una release **solo** quando emerge domanda utente documentata — non per
completezza. Coerente con il principio "Minimalismo" del piano.

- **CIE in evidenza nel funnel marketing** (ex REVIEW #47, punto 2) — il
  collegamento all'AdE con CIE (app CIE ID) è live, documentato in
  `/help/collegare-ade-con-cie` e citato come alternativa nel copy; nel funnel
  principale (hero homepage, card `funzionalita`) Fisconline resta però il
  default, coerente con l'app dove CIE è sotto "Altre opzioni". Promuovere CIE a
  metodo co-primario (card/hero dedicati) è una scelta di prominenza, non una
  correzione. _Trigger:_ un volume di utenti che confermano il flusso CIE reale
  senza problemi.
- **Inserimento sconto** - aggiunta informazione sconto sul totale, presente nel
  documento commerciale online. _Trigger:_ file har.
- **Paginazione lista catalogo (Pro)** — la modifica prodotto è già spedita, ma
  la lista carica tutti i prodotti in un colpo (`getCatalogItems` in
  `src/server/catalog-actions.ts`, nessun limit/offset). Serve solo ai Pro con
  cataloghi grandi (Starter è capato a 5, `STARTER_CATALOG_LIMIT` in
  `src/lib/plans-shared.ts`). _Trigger:_ Pro con cataloghi oltre ~50 prodotti.
- **Badge proattivo stato AdE** — oggi il collegamento all'AdE si scopre rotto
  solo _reagendo_: il `CieReauthBanner`
  (`src/components/ade/cie-reauth-banner.tsx`) compare in cassa/storno **dopo**
  che un'emissione è fallita con `reauthRequired`, e le credenziali mai
  verificate si vedono solo entrando in Impostazioni → Credenziali AdE. Un
  indicatore in cima al dashboard (o nell'header) quando `verifiedAt` è nullo o
  la sessione è scaduta anticiperebbe la scoperta al momento giusto, prima del
  banco. Emersa dal pass UX del menu Impostazioni (v1.7.x): tenuta fuori da quel
  PR perché è una feature a sé, non un riordino di card. _Trigger:_ segnalazioni
  di emissioni fallite per credenziali scadute, o eventi `ade_user_error`
  ricorrenti sullo stesso utente in Sentry.
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
