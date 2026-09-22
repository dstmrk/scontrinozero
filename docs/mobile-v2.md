# App nativa iOS/Android (v2.0) — decisioni di design

**Stato al 22 settembre 2026.** Nota di design, non un piano: nessuna release
pianificata. Il guscio Capacitor esiste in `mobile/` e punta all'app deployata,
senza ancora capability native. Serve a non rifare questa analisi fra sei mesi
e a consegnare a chi implementa le decisioni già prese invece di fargliele
reinventare (regola 5, decision budget).

Compagno della nota di scenario `docs/strategia-corrispettivi-2027.md`: stesso
scaffale, stesso mestiere.

---

## 1. Il driver reale

La motivazione storica in `PLAN.md` era doppia — SPID e stampa Bluetooth su
iOS — con un trigger di volume («un volume di utenti iOS con stampantina BT»).
Il trigger di volume è **superato**, e va detto perché: la decisione è
competitiva, non dimensionale. SPID è presente in tutti i prodotti
concorrenti, e il volume non era nemmeno misurabile (REVIEW.md #109: manca
l'attribuzione della pagina di atterraggio al signup).

Due precisazioni che cambiano il posizionamento:

**SPID non è parità di feature, è un canale d'ingresso.** Fisconline richiede
di _ottenere_ le credenziali: richiesta, PIN diviso, attesa. SPID ce l'hanno
già tutti. Chi scarica l'app, scopre di dover recuperare un PIN e chiude è
plausibilmente una fetta del 45% fermo di REVIEW.md #107 — e il pannello
«Onboarding fermi» su `/admin` misura già quell'ipotesi, senza scrivere codice:
`last_verify_at IS NULL` distingue «non ho le credenziali» da «ho sbagliato
password».

**La UX SPID dei concorrenti è peggiore della nostra su Fisconline.** I loro
utenti reinseriscono le credenziali più volte al giorno. Il nostro flusso
Fisconline conserva le credenziali cifrate e rifà il login in silenzio su 401
(`src/lib/ade/session-cache.ts`): l'utente emette senza mai riautenticarsi.
SPID non sostituisce Fisconline, si affianca.

---

## 2. Cosa la v2 non è

**Non è un rewrite.** È la PWA esistente più due capability native. Qualunque
runtime che imponga di riscrivere l'interfaccia butta un prodotto funzionante
per riaverlo uguale mesi dopo — contro il principio «mai barattare un prodotto
funzionante per complessità incompiuta» di `CLAUDE.md`.

Questo è l'invariante che decide tutto il resto di questo documento.

---

## 3. Le due capability native, verificate

**Cattura del cookie di sessione.** Il flusso IdP vive in una webview e la
sessione va letta dal suo cookie jar: in un browser è vietato cross-origin, in
un contenitore nativo no. `@capgo/capacitor-inappbrowser` espone la lettura
dei cookie per URL e l'opzione `useSharedDataStore` (su iOS 17+ il data store
del webview di login è isolato per default). È la primitiva necessaria e
sufficiente.

**BLE su iOS.** Rischio rientrato. Il pacchetto già in uso è
`@point-of-sale/webbluetooth-receipt-printer`, cioè Web Bluetooth, cioè BLE:
le stampanti che l'app supporta su Android sono BLE, e BLE su iOS passa da
CoreBluetooth **senza certificazione MFi**. Se fossero Bluetooth Classic SPP
iOS sarebbe precluso anche in nativo puro — l'MFi non è una strada per un
hobby project.

La parte difficile della stampa resta riusabile:
`@point-of-sale/receipt-printer-encoder` genera i byte ESC/POS in JS puro. Il
seam esiste già — `src/lib/printing/bluetooth-printer.ts:79` dichiara il type
alias `Transport` con un solo punto di istanziazione. Si sostituisce il
trasporto, non il codificatore. Il rilevamento di supporto in
`src/lib/printing/support.ts` va esteso al caso «nativo» oltre a
`navigator.bluetooth`.

---

## 4. Runtime: Capacitor 8

| Opzione                      | Riscrittura UI                   | Verdetto                                    |
| ---------------------------- | -------------------------------- | ------------------------------------------- |
| Capacitor 8 (ex Ionic)       | nessuna                          | **scelto**                                  |
| React Native / Expo          | interfaccia intera               | scartato: costo enorme, beneficio nullo qui |
| Flutter (Dart)               | tutto, più un secondo linguaggio | scartato: nessuna riga del repo riusabile   |
| Nativo puro (Swift + Kotlin) | nessuna, ma due volte            | scartato: vedi sotto                        |

**Perché non il nativo puro, anche se il codice lo scrive un agente.**
Scrivere due volte è economico per un agente; **verificare** due volte non lo
è, e la verifica è dell'utente: la skill `playwright-verify` guida un Chromium
reale contro `dev`, non un simulatore iOS. Il tempo su due codebase native non
se ne va scrivendo codice, se ne va sul bug che si vede su una piattaforma e
non sull'altra. Più due toolchain e due set di dipendenze contro il vincolo
«costi fissi ~€0».

**Configurazione.** `next.config.ts` ha `output: "standalone"`: non è un export
statico e con server components e server actions non lo diventerà. Il guscio
punta quindi all'app deployata via `server.url`, non a asset impacchettati —
con un vantaggio grosso: **un deploy aggiorna web e mobile insieme**, senza
passare dalla review dello store.

Il rischio associato è la linea guida App Store 4.2 (minimum functionality),
che boccia le app che sono solo il wrapper di un sito. Le due capability
native sono ciò che mette l'app dalla parte giusta della regola: è un
argomento in più per implementarle davvero in nativo e non spedire un WebView
e basta. Confidenza media — i revisori variano.

---

## 5. Il contratto nuovo lato server: adozione della sessione

Il pezzo che riceve il cookie **esiste già**.
`src/lib/ade/interactive-session-store.ts` è nato per CIE proprio perché una
sessione con secondo fattore umano non è ri-creabile in silenzio: deposita un
`AdeClient` già autenticato, lo riusa per emissione e annullo finché l'AdE lo
accetta, e su 401 solleva `AdeReauthRequiredError` che emit/void traducono in
`{ reauthRequired }`. È già la semantica di una sessione da webview.

Manca un contratto solo: oggi un `AdeClient` si costruisce **solo facendo un
login**. Non esiste «ecco un cookie jar e una P.IVA, dammi un client
funzionante». Il `p_auth` Liferay probabilmente non serve: tutti i path in
produzione (Fisconline, CIE) lo lasciano a `""` in
`src/lib/ade/real-client.ts` e nessuno lo legge a valle; lo estrae solo lo S11
del flusso SPID su HTTP, che il punto 7 rimuove. Il token `x-appl` il server lo
ricava da sé da `initLight` con i cookie adottati.

Il contratto si verifica **senza una riga di codice nativo**, in due gradini:

1. **Una GET di sola lettura da un IP diverso** (nessun documento fiscale).
   Login SPID al portale da un browser desktop su hotspot del telefono, cookie
   copiati a mano, GET dalla VPS. Candidata: `fullTemplate`, che risponde 406
   senza utenza di lavoro scelta e 200 dopo (HAR.md §18.5). Un 200 dice che la
   sessione non è legata all'IP e che la scelta dell'utenza viaggia coi
   cookie.
2. **Solo se il gradino 1 passa: uno scontrino da €0,01 emesso e annullato**,
   per verificare che la POST di emissione non chieda altro oltre ai cookie.

L'IP diverso è il punto del test: in produzione il login avviene sul telefono e
l'emissione parte dalla VPS. Browser e server sulla stessa rete di casa
passerebbero il test per la ragione sbagliata.

Che i concorrenti facciano SPID via webview non chiude la domanda. Dimostra che
il login in webview funziona e che i cookie si leggono, non che si possano
usare da un'altra macchina: un concorrente che chiama l'AdE dal telefono non
trasporta niente. Se il trapianto fallisce restano due strade, entrambe care:
l'emissione con sessione SPID dal dispositivo (HTTP nativo), che cambia il
percorso emissione/annullo/recovery lato server, oppure SPID di nuovo su HTTP
dal server, il fallback di REVIEW.md #28 col problema AgID del punto 7. Il
guscio serve in entrambi i casi, ed è per questo che si costruisce in
parallelo al test.

---

## 6. Sessione morta a metà turno

Il problema difficile della v2 non è il login, è cosa fa la cassa quando la
sessione muore durante il servizio. Con Fisconline è raro (re-auth silenzioso);
con SPID diventa il caso frequente, e collide col principio numero uno
(l'emissione deve sembrare istantanea, quindi è ottimistica).

Le due metà servono entrambe:

**Pre-check** — già in produzione: `src/lib/services/receipt-service.ts:193`,
`src/lib/services/void-service.ts:597`, `src/lib/services/ade-user-session.ts:50`.
`isCieSessionMissing` in `src/lib/ade/index.ts` ritorna `reauthRequired` prima
dell'insert, così un retry post-rinnovo non trova un PENDING bloccato dallo
stale-gate. **Costa zero**: è un lookup su `Map` in memoria, non un round-trip
all'AdE. Per SPID basta togliere il vincolo `method === "cie"`.

**Resume** — da costruire, ed è più piccolo di quanto sembri. Il pre-check sa
se _noi_ abbiamo una sessione, non se l'AdE la accetta ancora: una sessione
presente ma scaduta lato AdE passa il pre-check e salta alla trasmissione
(`AdeReauthRequiredError`, riga ~913 di `src/lib/services/receipt-service.ts`,
documento marcato ERROR). L'utente perde il carrello battuto.

Tre pezzi su quattro esistono già: la riga del documento è inserita in
transazione **prima** della chiamata AdE (quindi «resume» significa ri-giocare
la trasmissione per il documento X, non ricostruire il carrello);
l'idempotenza c'è (`alreadyExists` + chiavi per-tenant); il segnale
`{ reauthRequired }` arriva già alla UI. Manca uno **stato «non trasmesso,
riprendibile» distinto da ERROR** — oggi ERROR è deliberato, per non lasciare
una riga che il recovery non toccherebbe mai.

Sessione rifiutata significa **sapere** che il documento non è stato
trasmesso: è la classe di fallimento più economica, nessuna riconciliazione,
nessun rischio di doppia emissione. Diversa da un timeout, dove non si sa e
`reconcileSaleDocument` deve andare a chiedere. Da qui l'unica incognita
portante del punto 6, al punto 10.

---

## 7. Cosa muore, cosa resta

**Muore il flusso SPID su HTTP.** Gli helper S1-S15 in
`src/lib/ade/real-client.ts:1303` sono implementati e testati ma senza
chiamanti, e `spidPostCredentials` fa esattamente la cosa che la webview esiste
per evitare: manda codice fiscale e password SPID dell'utente attraverso il
nostro server. Le regole SPID di AgID e i termini degli IdP vietano a un
soggetto non accreditato di raccogliere quelle credenziali — da confermare con
un legale, ma la direzione è quella, e i concorrenti che usano tutti la webview
sono un indizio concorde. Si rimuove, non si avvolge (regola 28). REVIEW.md #28
si chiude per cancellazione, non scrivendo `SPID_ALLOWED_IDP_HOSTS`.

**Resta Fisconline su HTTP.** Le credenziali cifrate danno il re-auth
silenzioso, che è una feature vera e che una sessione da webview non può
offrire. Non è un path legacy, è un compromesso diverso per un metodo diverso.

**Resta CIE su HTTP, e la webview è additiva.** Funziona, è in produzione e
funziona _anche_ nella PWA: sostituirlo regredirebbe chi usa il browser. Due
path per CIE sono due runtime, non due epoche, quindi non sono il compat layer
che la regola 28 vieta. Registrato qui perché è il genere di scelta in cui si
scivola per inerzia.

---

## 8. Branching e release

Nessun branch a lunga vita, nessuno stacco `v1`. Trunk unico: PR verso `main`
come qualunque altro lavoro (regola 1), il codice nativo in `mobile/` nello
stesso repo, con un `package.json` suo perché le dipendenze Capacitor non
entrino nell'immagine web — i tipi condivisi si riusano senza pubblicare un
package, e il filtro per path in CI (`dorny/paths-filter`, già in uso) tiene
separati i job.

Due namespace di tag distinti, perché il workflow di deploy prod/sandbox matcha
`v*.*.*` e una release mobile farebbe altrimenti partire un deploy del web:

- `v1.9.0`, `v1.10.0`, … → web (workflow attuale, invariato)
- `mobile-v1.0.0`, … → app nativa (workflow nuovo)

`next build` non vede la directory mobile: `.dockerignore` la esclude, e
`tsconfig.json` la toglie dal type-check della web app. Dettagli di deploy
nella skill `deploy-release`; istruzioni per costruire il guscio in
`mobile/README.md`.

---

## 9. Decisioni prese

| #   | Decisione                                                      | Confidenza          |
| --- | -------------------------------------------------------------- | ------------------- |
| 1   | Capacitor 8, non RN/Flutter/nativo puro                        | alta                |
| 2   | La v2 non riscrive la UI: guscio + due capability native       | alta                |
| 3   | SPID solo via webview nativa; flusso HTTP S1-S15 rimosso       | alta                |
| 4   | Fisconline resta su HTTP con credenziali cifrate               | alta                |
| 5   | CIE resta su HTTP; la webview è additiva, non sostitutiva      | media               |
| 6   | Pre-check esteso a SPID **e** resume: servono entrambi         | alta                |
| 7   | Trunk unico, tag `mobile-v*` separati                          | alta                |
| 8   | `server.url` verso l'app deployata, non asset impacchettati    | media (rischio 4.2) |
| 9   | Sessione persistita cifrata: differenziatore, non prerequisito | media               |
| 10  | iOS e Android insieme, dallo stesso guscio (ex B, C)           | alta                |
| 11  | Guscio in parallelo al punto E: serve in entrambi gli esiti    | alta                |

Sulla 9: i concorrenti costringono a riautenticarsi più volte al giorno, quindi
perdere le sessioni a ogni deploy non è il problema di prodotto che sembrava.
Persisterle diventa un vantaggio da spedire _insieme_ a SPID, non prima.

Sulla 10: i costi degli store (€99/anno Apple Developer Program, $25 una tantum
Google Play) sono accettati come eccezione esplicita ai «costi fissi ~€0» dei
Principi guida. Il build iOS gira su un Mac con Xcode, che c'è.

---

## 10. Decisioni aperte

| #   | Domanda                                                                                                                                                               | Chi decide                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A   | Un 401 può arrivare **dalla POST di emissione**, dopo che l'AdE ha accettato il documento? Se sì, «sicuro per costruzione» cade e il resume richiede riconciliazione. | risposta secca nei tracciati HAR (`login_spid.har`), non un giudizio |
| D   | Nome e semantica dello stato riprendibile, distinto da ERROR e invisibile allo stale-gate.                                                                            | in fase di slice                                                     |
| E   | Il cookie jar trasportato regge un'emissione? (punto 5)                                                                                                               | test in due gradini, in parallelo al guscio                          |

---

## 11. Conseguenze da non dimenticare

**SPID sarebbe solo-nativo.** `src/app/(marketing)/help/come-collegare-ade/page.tsx`
e `src/app/(marketing)/help/collegare-ade-con-cie/page.tsx` oggi dicono «Il
metodo SPID non è ancora disponibile nell'app». Quel copy diventa condizionale
per piattaforma, non semplicemente aggiornabile: è il disallineamento che la
regola 8 e la skill `marketing-content` esistono per prevenire.

**Il gate SPID nei piani.** Se SPID è un canale d'ingresso e non una
feature premium, non va dietro un gate in `src/lib/plans.ts`. Da confermare
quando la slice arriva.

---

## 12. Ordine delle slice

1. **Guscio** — fatto: `mobile/`, Capacitor 8, `server.url` scelto per
   ambiente al `cap sync`, nessun plugin nativo. Si accetta aprendo l'app sul
   simulatore e vedendo la cassa.
2. **Punto E, gradino 1 e 2** (punto 5) — in parallelo al guscio, senza
   codice nativo. Decide se la slice 3 adotta la sessione sul server o se
   l'emissione SPID passa dal dispositivo.
3. **Cattura del cookie**: InAppBrowser sul portale AdE, login SPID
   dell'utente, il plugin restituisce i cookie, POST al server, `AdeClient`
   adottato nello store interattivo, uno scontrino emesso. Un artefatto, un
   criterio di accettazione.
4. **Stampa BLE nativa** dietro il type alias `Transport` (punto 3).

---

## 13. Cosa non fare adesso

Scrivere la cattura del cookie (slice 3) prima del punto E. Rimuovere gli helper S1-S15 prima che la scelta webview sia
confermata dal punto E — la rimozione è corretta _sotto questo design_, e
questo design ha ancora un test da superare.

E per il contesto di dominio sul client AdE, la skill `ade-integration` resta
la fonte prescrittiva: questo documento è una decisione, non un come-fare.
