# Rischi accettati

> Scelte consapevoli, ognuna con un trigger di riapertura. Non sono lavoro da
> pianificare, quindi non sono issue: stanno qui perché servono a chi legge il
> codice, un log o un suggerimento di una dashboard e sta per riaprire una
> scelta già fatta. Prima di aprire un'issue per un finding nuovo, controlla
> che non sia già qui (regola 33). Quando un trigger scatta, la voce esce da
> questo file e diventa un'issue.
>
> Migrati da `REVIEW.md` il 2026-10-02, quando il backlog è passato alle issue
> GitHub. Le voci nate come finding portano nel titolo la PR che le ha chiuse:
> è la stessa che cita il codice.

> ⚠️ **Un rischio accettato su un advisory ha una data di scadenza implicita.**
> Quando il job `audit` inizia a fallire su un advisory documentato qui come
> "senza fix upstream", **ricontrolla range e severity nel registry prima di
> allargare l'allowlist**: gli advisory vengono ri-classificati e ri-rangiati nel
> tempo. È successo con `GHSA-mh99-v99m-4gvg` (brace-expansion): l'entry qui
> affermava che non esisteva backport `1.x`, poi è uscito `1.1.17`, l'advisory è
> passata da `<=5.0.7` a `<1.1.17` e da moderate a **high** (CVSS 7.5) — la
> soluzione era bumpare l'override, non aggiungere path all'allowlist.
> `npm audit --json` mostra `range` e `severity` correnti dell'advisory.

## Quattro documenti `PENDING` del 4 agosto 2026 restano aperti

Misurato sul DB di produzione il 22/09/2026 e chiuso contattando gli
esercenti. Erano cinque: una si è risolta dopo la mail, le altre quattro
restano aperte e **non c'è azione nostra**. Ri-sottomettere è irreversibile e
`pending-verification.ts` è progettato per non decidere da solo; la
riconciliazione richiede l'archivio AdE, la esegue una persona, e la persona
che può farlo è l'esercente — che è stato avvisato.

**Conseguenza operativa, da conoscere prima di indagare.** Lo sweep in
`instrumentation-node.ts` continuerà a loggare `stale_pending_documents` con
`salePending: 4` a ogni giro (~6h), a tempo indefinito. Quel contatore non è
un segnale nuovo: è questo residuo. Chi lo trova nei log e ci apre
un'indagine sta ri-scoprendo una voce già chiusa, ed è la ragione per cui
questa riga esiste.

**Riaprire:** se il contatore sale **sopra** 4, o se compare un `PENDING` con
un `business_id` diverso da quello misurato. Entrambi sono un caso nuovo, non
questo. Un contatore che scende è un esercente che ha sistemato il suo.

Il dato tecnico che valeva conservare — tutte via Developer API, due coppie
con lo stesso `request_hash` a 57 e 20 secondi di distanza, ogni tentativo con
una `idempotencyKey` nuova — vive nella skill `ade-integration`, dove ha già
falsificato un'assunzione sul recovery.

## Cloudflare Security Insights: Bot Fight Mode e AI Labyrinth restano off

I Security Insights delle due zone suggeriscono di attivarli. È una scelta
consapevole non farlo — vale per entrambe le zone, e l'insight tornerà a
proporli a ogni scansione.

**Bot Fight Mode — no.** Sul piano free agisce sull'intera zona: nessuna
esclusione per path, nessuna skip rule. Ma tutto ciò che entra qui via HTTP e
non è un browser è, per definizione, "automatico": la Developer API pubblica
`/api/v1` con Bearer key (`DEVELOPER.md`, consumer esterni), il webhook Stripe
su `/api/stripe/webhook`, le tre probe di smoke `/api/health/*` e il tunnel
Sentry `/monitoring`. Una challenge su questi path non è degrado, è rottura:
un client server-to-server non risolve un JS challenge e non segue redirect —
è la stessa classe di bug già pagata con i webhook Stripe rimbalzati 307
(vedi il commento su `/api/` in `src/proxy.ts`). Il rate limiting che serve
davvero è già applicativo, per-azione (skill `testing-patterns`).
**Riaprire:** se la zona passa a un piano Pro, dove Super Bot Fight Mode
ammette skip rule per path → valutarlo escludendo `/api/*` e `/monitoring`.
Oppure, se nei log comparisse scraping o credential stuffing reale, prima una
WAF rate-limit rule mirata su `/login` e `/register`, non una policy di zona.

**AI Labyrinth — no, e in particolare mai sulla zona marketing.** Serve a dare
in pasto contenuto-esca ai crawler AI. Qui la strategia dei contenuti è
l'opposto: `/llms.txt` e `/llms-full.txt` esistono apposta per farsi leggere,
e la checklist GEO della skill `marketing-content` (risposta secca in apertura,
fatti numerati citabili, FAQ) è scritta per **farsi citare** da ChatGPT,
Claude, Perplexity e AI Overviews. Attivarlo avvelenerebbe esattamente il
canale su cui il sito è costruito. **Riaprire:** solo se diventasse
attivabile per singolo hostname, limitandolo ad `app.` e `sandbox.` — che sono
già `noindex` e non hanno alcun valore SEO/GEO.

Il terzo insight della stessa famiglia, "Security.txt not configured", **è
invece stato accolto**: il file è servito dall'app
(`src/app/.well-known/security.txt/`) sull'apex `.it`, e la zona `.com` lo
risolve seguendo il redirect verso `.it`.

## E-E-A-T: contenuto YMYL firmato da un'organizzazione senza volto

`/guide` e `/help` parlano di sanzioni, aliquote IVA, regime forfettario e
obbligo POS: dalle Quality Rater Guidelines di settembre 2025 è **YMYL pieno**
(legale + finanziario), la categoria a cui Google applica l'asticella E-E-A-T
più alta. Il test "Who / How / Why" della guida sui contenuti helpful si
aspetta, per YMYL, una **byline con una pagina autore** che dica chi ha
scritto e con quale competenza, e la **disclosure del processo** quando il
lettore se la chiederebbe — per esempio su contenuto assistito da AI.

Stato attuale: `articleJsonLd` (`src/components/json-ld.tsx`) dichiara
`author: { "@type": "Organization", name: "Team ScontrinoZero" }`. Nessun
`Person`, nessuna bio, nessuna pagina autore, nessuna disclosure di metodo, su
~89 pagine di contenuto prodotto via LLM con revisione umana (la skill
`marketing-content` lo dichiara in chiaro). Il contrappeso E-E-A-T oggi vale
zero, e il volume ci colloca nella fascia che la policy sui contenuti scalati
guarda per prima.

**Rischio accettato**, deciso il 2026-08-27: non esporre una persona fisica su
un progetto hobby, e non aggiungere una disclosure che nessun competitor
italiano espone. Le pagine restano accurate e verificate su fonte primaria
(tabella dei riferimenti normativi nella skill), che è il pezzo di Trust che
conta di più.

**Riaprire se:** le impression di `/guide` o `/help` calano in modo sostenuto
su GSC senza una causa tecnica identificabile; oppure a un core update che
tocca visibilmente il traffico organico; oppure se il progetto smette di essere
one-man e una byline reale diventa disponibile a costo sociale zero. In quel
caso l'ordine giusto è: prima la disclosure di metodo (copre il "How" senza
esporre nessuno), poi eventualmente `Person` + pagina autore.

## SonarCloud non indicizza `src/app/.well-known/**`

Misurato sulla PR #881 via API SonarCloud, non dedotto:

```
$ curl -sS 'https://sonarcloud.io/api/measures/component?component=dstmrk_scontrinozero\
&pullRequest=881&metricKeys=new_lines,new_lines_to_cover'
new_lines = 7 · new_lines_to_cover = 0

$ curl -sS '…component=dstmrk_scontrinozero:src/app/.well-known/security.txt/route.ts&pullRequest=881…'
{"errors":[{"msg":"Component '…' of pull request '881' not found"}]}
```

Quella PR aggiungeva 160 righe di TypeScript; Sonar ne ha viste **7** (le
sole di `src/proxy.ts` e `src/proxy.test.ts`). I due file sotto la
dot-directory non esistono proprio come componenti. Conseguenza da tenere a
mente leggendo il gate: `0.0% Coverage on New Code` **passa** perché non ci
sono nuove righe da coprire, non perché la copertura sia a posto — e
qualunque cosa finisca sotto `.well-known/` è invisibile a bug, code smell,
security hotspot e coverage.

Il buco è solo lato Sonar: `coverage/lcov.info` contiene regolarmente
`SF:src/app/.well-known/security.txt/route.ts`, quindi
`npm run test:coverage` in locale e in CI copre il file per davvero.

**Non "risolvere" con `sonar.scanner.excludeHiddenFiles=false`.** La doc
Sonar dice che i file nascosti tracciati da Git sono già inclusi di default,
ma quella frase sta sulla pagina _Secrets_ e riguarda l'analisi dei segreti:
sull'analizzatore TS l'evidenza sopra dice il contrario. Aggiungere la
proprietà sarebbe un placebo che fa sembrare chiuso un buco aperto.

**Perché si accetta.** Sotto `/.well-known` ci vanno file statici e brevi per
definizione — `security.txt` oggi, al più `apple-app-site-association` o un
redirect `change-password` domani. Un gate cieco su una trentina di righe di
testo costante costa meno dell'indirezione che servirebbe a evitarlo.

**Riaprire** appena lì dentro entra logica non banale (rami, input utente,
chiamate esterne): a quel punto la route si sposta fuori dalla dot-directory
(`src/app/well-known/…`) e l'URL pubblico si ottiene con un rewrite in
`next.config.ts`, dove già vivono quelli di `/v1/:path*`. L'analisi Sonar
vale l'indirezione solo da quel momento in poi.

## audit-ci: advisory `braces` dev-only, senza patch

`audit-ci.json` allowlista `GHSA-vfj7-8cjw-p6xm` (high, CWE-674: stack
exhaustion su pattern di espansione annidati in profondità), segnalato dall'audit dal
2026-10-03. Il range vulnerabile è `<=3.0.3`, cioè anche l'ultima release:
non c'è una versione da installare né da forzare con un override. `braces`
entra solo come dipendenza di sviluppo (`shadcn`, `eslint-config-next`,
`ts-morph` → `fast-glob` → `micromatch` → `braces`); `npm audit --omit=dev`
sulle dipendenze di runtime è pulito, quindi non arriva nel container.
L'attacco richiede di far espandere a `braces` un pattern scelto
dall'attaccante: nella toolchain i pattern sono i nostri (glob di config e di
CLI). Superficie ≈ 0. **Riaprire:** quando esce `braces` > 3.0.3 (o
`micromatch` smette di dipenderne) → aggiornare il lockfile e togliere
l'allowlist; subito, se `braces` compare fra le dipendenze di runtime.

## audit-ci: advisory `esbuild` dev-only

`audit-ci.json` allowlista `GHSA-67mh-4wv8-2f99` (dev-server SSRF).
`esbuild` non è in `dependencies` prod: entra solo transitivamente via toolchain
dev (`drizzle-kit`/`tsx`/`@esbuild-kit/*`, tutte `devDependencies`), mai a runtime
né nella build Next (SWC). Superficie ≈ 0. **Riaprire:** quando la toolchain
aggiorna `esbuild` > 0.28.0 senza major rischioso → togliere l'allowlist.

## Verifica su AdE reale sostituita da sentinella Sentry (PR #702)

Il fix della PR #702 (totali payload per-riga in cents) è spedito. Il
sub-task A del mapper (PR #849) ha poi allineato il payload alla
semantica del portale — `prezzoLordo` unitario, netti a piena precisione —
su prova documentale (due
payload reali accettati dall'AdE, `HAR.md` voci #1 e #12), ma **entrambi a
quantità intera**: nessuna cattura copre una quantità frazionaria, e la
conferma richiederebbe di emettere su `ADE_MODE=real` uno scontrino a peso
(regole 13/14). Invece di bloccare il rollout su quella verifica manuale, si
accetta la strategia adottata — `ammontareComplessivo` e i lordi restano
cent-esatti, i netti derivano dal lordo di riga così che
`imponibileNetto + importoIVA = totale` regga anche sulle frazionarie — e si
delega il rilevamento a due sentinelle in `runSubmitSale`
(`src/lib/services/receipt-service.ts`):

1. **Invariante** — `sum(vendita[].importo) !== ammontareComplessivo` →
   `logger.error` "ade:payload_total_mismatch" (fingerprint
   `["emit-receipt","payload-total-mismatch"]`). Deterministica: non scatta mai
   se l'arrotondamento è corretto → zero rumore, guardia anti-regressione.
2. **Rifiuto AdE su quantità frazionaria** — `esito:false` con almeno una riga a
   `quantity` non intera → `logger.error` "ade:fractional_qty_rejected"
   (fingerprint `["emit-receipt","fractional-qty-rejected"]`, con `adeErrorCodes`
   nei log). I rifiuti su quantità intere restano `warn` (regola 20).

**Riaprire:** se una delle due sentinelle apre una issue Sentry — allora
l'assunzione sui totali va rivista, e il campione da chiedere è un rifiuto AdE
su riga a quantità frazionaria con aliquota IVA.

## Reso bloccato sulle vendite non riproporzionabili (PR #1020)

`isReturnComputable` (`src/lib/ade/return-mapper.ts`) rifiuta il reso
(`RETURN_NOT_ALLOWED`) sulle righe dove le formule del portale (`HAR.md`
#19b) stornerebbero un importo diverso dal venduto: le vendite emesse fino
alla v1.7.0 (19/03–20/08/2026), il cui mapper trasmetteva `prezzoUnitario`
di riga, e quelle della Developer API con quantità a tre decimali. Il rifiuto
vale solo sulle righe rese; le righe da un pezzo senza sconto della v1.7.0
passano, perché lì le formule coincidono.

Non c'è un percorso alternativo, né dal servizio né in UI: l'esercente vede il
rifiuto e l'invito a scrivere all'assistenza. Accettato dall'owner il
03/10/2026: la base utenti è quasi tutta di B&B e finora nessun esercente ha
avuto bisogno di un reso. Calcolare il reso in proporzione sull'imponibile di
riga è possibile, ma è una formula mai misurata sul portale applicata a un
documento irreversibile.

**Riaprire:** quando un esercente chiede il reso di una di quelle vendite. Il
segnale nei log è il warn `Return: sale lines not computable with the portal
formulas` (`saleDocumentId`, `businessId`), fuori da Sentry per regola 20.

## `flagIdentificativiModificati` diverge dal portale (PR #849)

`src/lib/ade/mapper.ts` manda `flagIdentificativiModificati: true` (e
`altriDatiIdentificativi.modificati: true`), il portale manda `false` su
entrambi. L'AdE **accetta entrambi** — la produzione funziona da sempre — ed è
l'unica delle sei divergenze della voce #11 di `HAR.md` rimasta aperta dopo il
sub-task A: le altre cinque sono chiuse. Il `true` è deliberato e coerente,
segnala all'AdE che stiamo inviando dati di identificazione nostri invece di
quelli memorizzati sul portale. Registrato per non ri-scoprirlo a ogni audit del
mapper. **Riaprire:** se l'AdE iniziasse a rifiutare o a trattare diversamente i
documenti con il flag a `true`.

## Utenza AdE di lavoro: i rami non osservati restano scoperti (issue #984)

L'issue #984 ha portato l'onboarding oltre la P.IVA intestata alla persona:
utenza `incaricato`, più P.IVA dirette, le due personae insieme, picker in
onboarding e in impostazioni. Restano tre scelte, accettate perché nessun
caso reale le esercita e nessun tracciato dice cosa cambierebbe a valle:
scriverle ora sarebbe codice non verificabile.

- **Rami `delega` e `tutore`.** Il bundle del wizard ne dice nomi e flag
  (`HAR.md` `#18.7`), non il traffico che producono (`#18.6`). Un'utenza
  che ha solo quelle personae arriva a `AdeNoPartitaIvaError`.
- **`tipoincaricante` cablato.** `ADE_TIPO_INCARICANTE` in
  `src/lib/ade/real-client.ts` è il default del portale, `incaricoDiretto`.
  Il portale lo deriva da `deleghe`, `tutore` e `intermediario`
  dell'incarico scelto; i tre booleani arrivano già in `AdeIncarico.raw`.
  Corretto per l'unica utenza incaricata osservata, che li ha tutti falsi.
- **Conferma senza denominazione per gli incarichi.** `incarichi[]` porta
  le sole P.IVA (`HAR.md` `#18.1`), e mostrare il nome costerebbe un
  `procediWizard` per candidato. Anche la tendina del portale mostra le
  sole P.IVA (`#18.5-bis`), e il nome compare in impostazioni subito dopo
  la scelta.

**Riaprire:** il primo `ade_credentials.last_verify_outcome =
'no_partita_iva'` (utenza senza P.IVA dirette né incarichi leggibili: il
caso `delega`/`tutore`), oppure il primo incarico con uno dei tre flag
acceso in `AdeIncarico.raw`. Il conteggio va fatto sul DB: il log
`ade:wizard_piva_missing` nei Sentry Logs è campionato e non serve a
contare. Per vedere chi è fermo a metà onboarding qualunque sia la causa:
`ade_credentials.verified_at IS NULL` in join con `businesses.fiscal_code
IS NULL`.

## Link pubblici scontrini senza TTL/revoca, UUID come token (PR #632)

`src/app/r/[documentId]/page.tsx` + `src/lib/receipts/fetch-public-receipt.ts`
usano il document UUID come token, senza scadenza/revoca. UUID = 122 bit
(enumerazione infattibile); la pagina espone solo dati del commerciante (già
pubblici sullo scontrino), nessuna PII del cliente; è by-design un artefatto da
consegnare, `robots: noindex`. Fix (tabella + migration + route + UI) sproporzionato
per un hobby project. **Riaprire:** se lo scontrino includerà dati anagrafici del
cliente, o se servirà audit/revoca degli accessi.

## Referral bonus: limiti dopo lo split trial-vs-Stripe (PR #670)

`src/lib/plans.ts` (`fetchPlan`), `src/server/onboarding-actions.ts`
(`finalizeAdeVerification`), `src/server/referral-reward.ts`
(`extendSubscriptionForReferral`). Tre limiti del bonus (+1 mese), rationale nella
regola 27 (skill `stripe-webhooks`):

1. **Carry-over trial→pagato:** chi accumula `referralBonusDays` in trial e poi si
   abbona perde i giorni residui (il checkout non imposta `trial_end`).
2. **Referrer `unlimited`:** il reward incrementa `referralBonusDays` ma è un no-op
   (tocca solo il trial). Accettato (`unlimited` è invite-only/gratis).
3. **Estensione Stripe fallita → riconciliazione manuale:** `rewardedAt` è già
   committato; se Stripe è giù il mese va riconciliato a mano (log `critical: true`
   "owed free month needs manual reconciliation"). Preferito a una data app
   divergente da Stripe.

**Riaprire:** se si decide di erogare il carry-over trial→pagato (item 1).
