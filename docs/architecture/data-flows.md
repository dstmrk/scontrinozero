# Mappa codebase — Data flows

> Deep-dive _on-demand_: leggilo quando tocchi uno di questi flussi. Ogni step
> punta al file; le **regole di comportamento** restano in `CLAUDE.md` (non le
> ripeto, le cito per numero). Per "dove sta X" → `docs/architecture/INDEX.md`.

## Auth della richiesta

1. UI/route handler chiama `getAuthenticatedUser` in `src/lib/server-auth.ts`.
2. Risolve la sessione via `src/lib/supabase/server.ts` e **binda l'UUID** allo
   scope Sentry (`Sentry.setUser({ id })`, CLAUDE.md regola 22).
3. Le azioni auth (login/register/reset, versione T&C) vivono in
   `src/server/auth-actions.ts`; il refresh sessione lato edge in
   `src/lib/supabase/middleware.ts`.
4. Errori d'input prevedibili (password sbagliata, P.IVA già usata) → `warn`,
   non Sentry (regola 20).
5. L'accesso a un'attività passa da `checkBusinessMembership`, che legge
   `business_members` (issue #1099): una riga per persona, ruolo `owner` o
   `collaborator`, al più un titolare per attività. Il collaboratore non ha
   una riga `profiles`; il piano lo prende dal titolare
   (`planOwnerAuthUserId` in `src/lib/plans.ts`). La riga `owner` nasce con
   l'attività in `saveBusiness` (`src/server/onboarding-actions.ts`).
6. Cosa può fare il ruolo lo decide `src/lib/business-permissions.ts`.
   `checkBusinessOwner` chiude al titolare credenziali AdE, dati
   dell'attività, catalogo in scrittura, analytics, ricerca su AdE e chiavi
   API; il checkout Stripe rifiuta il collaboratore con `isCollaborator`.
   Emissione, annullo e reso passano da `collaboratorSuspendedError`: il
   collaboratore opera solo se il piano del titolare ammette collaboratori
   (`canUseCollaborators` in `src/lib/plans-shared.ts`), calcolato a ogni
   richiesta. Il collaboratore vede e tocca solo i documenti che ha creato
   (`ownDocumentsCondition` nello storico, `canAccessDocument` su annullo e
   pending, regola d'autore nella route del PDF); il reso vale su qualunque
   vendita, trovata col numero stampato e la data (`findSaleForReturn` in
   `src/server/storico-actions.ts`, dialog
   `src/components/storico/sale-lookup-dialog.tsx`). Per il titolare nessuno
   di questi controlli aggiunge query.
   Gli errori sulle credenziali AdE dell'attività (password scaduta,
   credenziali rifiutate o non verificate, utenza bloccata) parlano al
   titolare: `forMember` li riscrive per il collaboratore con "avvisa il
   titolare", nelle action di emissione, annullo, reso e verifica dei
   pending.
7. Cosa vede il ruolo lo decide il dashboard. `getOnboardingStatus` parte da
   `business_members` e porta la membership; il layout la passa ai
   componenti client con `MemberRoleProvider`
   (`src/components/dashboard/member-role.tsx`, `useIsCollaborator`). Il
   collaboratore non passa dall'onboarding e non vede il tour, Analytics,
   l'avviso sull'identità AdE, la ricerca su AdE, l'export CSV né i comandi
   di modifica del catalogo; le sue impostazioni sono
   `src/app/dashboard/settings/collaborator-settings.tsx`. Quando il piano
   del titolare non ammette collaboratori,
   `src/app/dashboard/collaborator-suspended-section.tsx` gli dice che resta
   la sola lettura.

## Invito di un collaboratore

1. Il titolare apre Impostazioni → Collaboratori
   (`src/app/dashboard/settings/collaborators-card.tsx`, che legge
   collaboratori e inviti con `listTeam`). `ownerInviteBlocker` in
   `src/lib/collaborator-invites.ts` decide il passo: piano che ammette
   collaboratori, credenziali Fisconline verificate, Condizioni per i
   collaboratori accettate nella versione corrente (`acceptCollaboratorTerms`,
   `profiles.collaborator_terms_*`).
2. `inviteCollaborator` (`src/server/collaborator-actions.ts`) rifà gli stessi
   controlli, rifiuta un'email che ha già un account (`emailHasAccount`,
   rischio accettato in `docs/architecture/accepted-risks.md`) e applica i
   limiti di `docs/architecture/config-manifest.md` (`countTeamSeats` per la
   prova). Salva lo SHA-256 del token in `collaborator_invites`, con un
   upsert su attività ed email (reinviare sostituisce token e scadenza), e
   manda `src/emails/collaborator-invite.tsx`. Se l'email non parte, l'invito
   si cancella.
3. Il link porta a `/invito/<token>` (`src/app/(auth)/invito/[token]/`), solo
   per chi non ha una sessione (`AUTH_ONLY_PATHS` in `src/proxy.ts`). La
   pagina distingue invito valido, scaduto e inesistente.
4. `acceptCollaboratorInvite` in `src/server/auth-actions.ts`: Turnstile con
   azione `accept-invite`, rate limit auth, invito ancora valido ed email
   senza account, poi `admin.createUser` con `email_confirm: true`, perché il
   link ha già provato l'email. In una transazione cancella l'invito (per id,
   hash del token e scadenza) e crea la riga `collaborator` con nome, email e
   versioni di Termini e Condizioni; se fallisce, cancella l'account appena
   creato. Poi il login: il form traccia `collaborator_invite_accepted` su
   Umami e va al dashboard. Nessuna riga `profiles`, quindi niente trial,
   referral o mail all'operatore.
5. `revokeCollaboratorInvite` cancella l'invito e il link smette di valere.
   Finché l'attività ha collaboratori o inviti validi, `saveAdeCredentials`
   rifiuta CIE e `connectAdeWithSpid` rifiuta SPID
   (`hasCollaboratorsOrOpenInvites`): con più persone alla cassa l'accesso
   resta con Fisconline.

## Uscita di un collaboratore

1. Il collaboratore non ha un profilo: la cascata FK di `profiles` porta via
   la sua riga di `business_members` ma non il suo account auth. Ogni uscita
   passa quindi da `src/lib/services/collaborator-account.ts`:
   `removeCollaboratorAccount` cancella l'account (`deleteAuthUser` in
   `src/lib/services/auth-user-delete.ts`, con retry) e stacca la riga
   (niente account, email né ultimo accesso; il nome resta e attribuisce i
   documenti); `notifyCollaboratorAccessEnded` manda
   `src/emails/collaborator-access-ended.tsx`.
2. Il titolare rimuove un collaboratore dalla card
   (`src/components/settings/collaborator-member-list.tsx`, che mostra anche
   l'ultimo accesso) con `removeCollaborator`. L'effetto è immediato, perché
   ogni azione rilegge l'appartenenza per auth user.
3. Il collaboratore esce da solo con `deleteAccount`: stessa password di
   conferma del titolare, poi il ramo `leaveBusiness`, senza Stripe né
   purge. Il suo export GDPR è `exportCollaboratorData`: dati personali, non
   i documenti dell'attività.
4. Cancellazione del titolare, self-service o sweep: `purgeUserById` cancella
   prima gli account dei collaboratori e si ferma con il titolare intatto se
   uno fallisce; a titolare cancellato li avvisa. Lo sweep di inattività
   (`src/lib/services/inactive-user-prune.ts`) conta anche
   `business_members.last_seen_at`, scritto da `touchLastSeen` nella stessa
   query del profilo: un'attività con collaboratori attivi non si cancella.
5. Logout su un dispositivo condiviso: `ClearSessionData`
   (`src/components/clear-session-data.tsx`, layout `(auth)`) svuota carrello,
   cache di TanStack Query e cache delle pagine del service worker.

## Emissione scontrino (cassa)

1. Form cassa (`src/components/cassa`) → server action
   `src/server/receipt-actions.ts`.
2. Validazione + calcolo totali **per-riga in cents** con
   `src/lib/receipts/document-lines.ts` (regola 17): l'importo trasmesso ad AdE
   e quello mostrato al cliente devono coincidere.
3. Orchestrazione in `src/lib/services/receipt-service.ts`: idempotency
   (`src/lib/services/request-hash.ts`), chiamata AdE, transazione DB. La
   riga registra chi l'ha prodotta (`DocumentOrigin`,
   `src/lib/services/document-origin.ts`): `created_by` col membro dalla web
   app, `api_key_id` con la chiave dalla Developer API. Vale anche per annullo
   e reso.
4. Client AdE risolto da `src/lib/ade/index.ts` (reale `src/lib/ade/real-client.ts`
   vs mock `src/lib/ade/mock-client.ts` secondo `ADE_MODE`). La sessione Fisconline
   è riusata fra operazioni ravvicinate dello stesso business via
   `withAdeSession` + `src/lib/ade/session-cache.ts` (cache in-process con TTL/LRU
   e lock per-business), invalidata su cambio credenziali. Evita di ripetere il
   login (~10 round-trip, latenza dominante) a ogni emissione. Se l'AdE
   **rifiuta** le credenziali (errate, password scaduta, utenza bloccata) i
   login automatici si fermano al primo rifiuto (issue #1099): la cache
   rilancia lo stesso errore alle operazioni già in coda con le stesse
   credenziali, e `onLoginRejected` (cablato da `toAdeSessionParams` in
   `src/lib/server-auth.ts`) azzera `ade_credentials.verified_at`. Da lì
   `fetchAdePrerequisites` ferma l'operazione prima del login finché il
   titolare non risalva o riverifica; con la password scaduta risponde
   `ADE_PASSWORD_EXPIRED` come il login che l'ha scoperta. Sulla stessa
   transizione, se l'attività ha collaboratori con un accesso, parte un'email
   al titolare (`src/lib/services/ade-rejection-notice.ts`), senza attenderla.
5. **Ramo interattivo** (login method `cie` o `spid`): la sessione vive in
   `src/lib/ade/interactive-session-store.ts` e **non è rinnovabile in
   silenzio** (push CIE, o login SPID nella webview dell'app nativa adottato
   da `connectAdeWithSpid`). Il service fa il pre-check
   `isInteractiveSessionMissing` **prima** di inserire il documento: se manca/scaduta
   ritorna `{ reauthRequired: "cie" | "spid" }` senza trasmettere nulla — la
   UI mostra `src/components/ade/ade-reauth-banner.tsx`, che chiede l'accesso
   del metodo indicato (notifica CIE; per SPID il login nell'app, o il rimando
   all'app se si è nel browser), la Developer API
   risponde 409. Lo stesso esito arriva da `AdeReauthRequiredError` a metà
   flusso (documento marcato ERROR, mai duplicato). Una sessione che muore
   **dopo** il pre-check è riconosciuta da `isSessionNotActive`
   (`src/lib/ade/real-client.ts`): non solo il `401`, ma anche un **4xx con body
   non JSON** — l'API REST del DCO risponde sempre JSON, quindi quel 4xx viene da
   un gateway davanti all'app e la POST non ha raggiunto l'handler (misurato in
   produzione: `405` + `text/html` su sessione CIE di 4h20m).
6. UI optimistic: lo scontrino "sembra istantaneo" anche se AdE risponde in 2-5s
   (priorità #1). La server action degrada, non lancia (regola 19).
7. Fallimenti AdE classificati da `src/lib/ade/log-failure.ts` con
   `flow: "emit-receipt"` (regole 20/23).

## Stampa scontrino su termica Bluetooth

Interamente **client-side**: nessuna server action, nessuna chiamata AdE. Parte
da uno scontrino **già emesso**, quindi un fallimento di stampa non è mai un
fallimento di emissione.

1. Rilevazione supporto: `src/lib/printing/support.ts` distingue
   supportato / adattatore spento / webview in-app / browser senza Web Bluetooth
   (iOS, Firefox) / app nativa senza BLE (permesso negato). Guida la copy, non
   solo l'abilitazione del bottone. Nell'app il BLE passa dal plugin, e il
   plugin si attiva solo con `activate` (gesto «Collega»): su iOS la prima
   attivazione chiede il permesso.
2. Connessione: `src/lib/printing/bluetooth-printer.ts`, singleton di modulo con
   `subscribe`/`getSnapshot` per `useSyncExternalStore` (stessa forma di
   `src/lib/pwa/install-prompt-store.ts`). È un singleton perché
   `navigator.bluetooth.getDevices()` — la riconnessione silenziosa — è dietro
   flag su Chrome: la connessione GATT va tenuta viva per la sessione, così si
   accoppia una volta all'apertura e non a ogni scontrino. Il trasporto lo
   sceglie `getTransport`: Web Bluetooth nel browser,
   `src/lib/printing/native-ble-transport.ts` (plugin
   `@capacitor-community/bluetooth-le` via bridge) nell'app, dove la
   riconnessione per id funziona.
3. Profilo stampante normalizzato alla connessione da
   `src/lib/printing/printer-profile.ts`: il trasporto emette nomi di
   `codepageMapping`/`language` che l'encoder non accetta più (`default`,
   `zjiang`, `meow`) e che lo farebbero **lanciare**. I profili che non sono
   ESC/POS travestito (`meow`, le "cat printer") non vengono normalizzati ma
   **rifiutati** all'accoppiamento (`isIncompatiblePrinterLanguage`): degradarli
   darebbe "Collegata" in UI e caratteri casuali sullo scontrino.
4. Rendering: `src/lib/printing/receipt-escpos.ts` (puro) rispecchia sezione per
   sezione il PDF di `src/lib/pdf/commercial-document.ts` e riusa
   `computeReceiptTotals` da `src/lib/receipts/receipt-totals.ts` (regola 17).
   Entrambi seguono il "layout standard" AdE del documento commerciale
   (ordine sezioni, `Importo pagato` sempre presente, `di cui IVA` sotto il
   totale, codifica IVA `ES*` + legenda da `src/lib/receipts/vat-display.ts`);
   la pagina pubblica `src/app/r` espone le stesse voci in forma di card.
   Le stesse tre superfici rendono anche la **ricevuta di annullamento** e
   quella **di reso** (sottotitolo `emesso per ANNULLAMENTO` / `emesso per
RESO`, blocco `Documento di riferimento`, nessun pagamento): i lettori
   restituiscono la vendita citata in `referenceSale`; le righe sono quelle
   della vendita sull'annullo, quelle proprie sul reso.
   `src/lib/printing/thermal-text.ts` traslittera le accentate maiuscole, che
   CP437 non rappresenta.
5. Composizione e invio: `src/lib/printing/print-receipt.ts` importa l'encoder
   con `import()` **dinamico** — sono ~21 KB gz che restano fuori dal bundle
   iniziale della cassa.
6. Superfici: `src/components/printing/print-receipt-button.tsx` (cassa e
   storico) degrada a scalare — stampa diretta → scelta collega/PDF → PDF; la
   card `src/components/settings/printer-section.tsx` gestisce accoppiamento,
   stampa di prova e preferenze per dispositivo
   (`src/lib/printing/printer-preferences.ts`, su `localStorage`: una stampante
   è attaccata a un telefono, non a un account).
7. Errori: mai Sentry (regola 20). Bluetooth spento, chooser annullato,
   stampante fuori portata o non ESC/POS sono condizioni prevedibili dall'input
   utente → messaggi azionabili da `src/lib/printing/error-messages.ts`.

## Annullo documento (void)

Analogo all'emissione: `src/server/void-actions.ts` →
`src/lib/services/void-service.ts` → client AdE; logging con
`flow: "void-receipt"` via `src/lib/ade/log-failure.ts`. Vale lo stesso ramo
interattivo dell'emissione (pre-check `isInteractiveSessionMissing` → `reauthRequired`,
dialog "Ricollegati" in `src/components/storico/void-receipt-dialog.tsx`).

## Reso merce (return)

Documento commerciale di reso (`HAR.md` #19), su tutti i piani (gate
`canEmit`, come l'emissione). Dalla cassa: dettaglio della vendita nello
storico → "Fai un reso" (`src/components/storico/return-receipt-panel.tsx`,
quantità per riga con tetto = venduti − già resi, anteprima dell'importo con
`buildReturnLines`) → `returnReceipt` (`src/server/return-actions.ts`: auth,
rate limit `return:<userId>`, zod, appartenenza all'attività) →
`src/lib/services/return-service.ts`. A reso registrato il pannello rilegge il
RETURN per la stampa termica e lo storico rilegge la vendita (già-reso).
Lo stesso pannello si apre da "Reso da scontrino"
(`src/components/storico/sale-lookup-dialog.tsx`): numero stampato e data →
`findSaleForReturn` (rate limit `saleLookup:<userId>`), anche per una vendita
che non è nell'elenco, come quelle di un altro membro per il collaboratore.
Dalla Developer API: `POST /api/v1/receipts/{id}/return` (stesso servizio,
`apiKeyId` sulla riga); il dettaglio v1 porta `returnedQuantity` per riga da
`src/lib/receipts/returned-quantities.ts`, lo stesso conteggio dello storico.

1. Riga `commercial_documents` con `kind = 'RETURN'` e `returned_document_id`
   verso la vendita (migrazione 0042). La vendita resta `ACCEPTED`: una
   vendita può avere più resi, e il già-reso si legge dall'AdE (cumulativo
   `reso` di riga nel dettaglio GET), che vede anche i resi fatti dal portale.
2. Guardie nostre, perché l'AdE non le ha (#19f): niente reso di una vendita
   annullata (DB, più flag `annulli` della riga V per l'annullo dal portale);
   niente annullo di una vendita con un reso, letto due volte — nel DB prima
   di aprire la sessione (`saleHasAcceptedReturn` in
   `src/lib/receipts/returned-quantities.ts`, colonna della SELECT della
   vendita) e sul dettaglio AdE (`hasAnyReturn`, che vede anche i resi dal
   portale e su un cumulativo illeggibile blocca). L'indice
   `idx_commercial_documents_correction_in_flight` ammette **una sola
   correzione PENDING per vendita**, annullo o reso.
3. In sessione: ricerca V (annullata?) → `getDocument` → righe AdE uguali a
   quelle salvate (quantità e aliquota per indice) → validazione delle
   quantità sul residuo → righe **riproporzionabili** (`isReturnComputable`:
   le vendite emesse fino alla v1.7.0 e quelle API a tre decimali non lo sono,
   e il reso si rifiuta) → `mapReturnToAdePayload`
   (`src/lib/ade/return-mapper.ts`) e righe del reso
   (`src/lib/receipts/return-lines.ts`, sconto ripartito in modo telescopico)
   → importo atteso, istante e righe scritti **prima** della POST →
   `submitReturn`.
4. Recovery: come l'annullo, pull-based sulla stessa key, con
   `reconcileReturnDocument` (`resi` + importo a 8 decimali) in una finestra
   centrata sull'**ultima POST** (`submittedAt`), non sulla nascita della
   riga. Il claim riporta la riga a `PENDING`, così una ritrasmissione da una
   riga `ERROR` resta dentro l'indice di correzione. In più, una riga
   PENDING stale di **un'altra** key non blocca per sempre: la si riconcilia,
   e se è registrata la richiesta nuova va rifatta (`RETURN_STATE_CHANGED`),
   se è assente si chiude ERROR e la nuova procede. Una riga nata in questa
   richiesta e fallita prima della POST si cancella.
5. Superfici: il RETURN accettato si stampa (PDF, termica, ricevuta
   pubblica) col layout AdE del reso — `emesso per RESO`, documento di
   riferimento, righe proprie, nessun pagamento. L'elenco v1 senza `kind` resta su
   `SALE`/`VOID` (`V1_DEFAULT_LIST_KINDS`, regola 28): i resi si leggono con
   `kind=RETURN` o per id. L'analytics sottrae i resi nel giorno
   del reso: ricavi, serie temporale e prodotti sono netti, scontrini emessi e
   scontrino medio restano sulle vendite, i metodi di pagamento pure (il
   rimborso non ha un metodo noto). Storico ed export CSV leggono
   `kind IN ('SALE','RETURN')`, con le stesse righe nello stesso ordine: il
   reso è una riga a sé, nel giorno del reso, in negativo, con stato `reso`
   (il CSV lascia vuote le celle di cassa e cita la vendita in `rif_vendita`, il dettaglio porta quantità e
   totale di riga negativi). Sulla riga della vendita `returnedQuantity`
   somma i resi accettati per `lineIndex` (`fetchReturnedByLine` in
   `src/server/storico-actions.ts`); da lì `saleReturnProgress`
   (`src/lib/receipts/return-progress.ts`) dà il badge reso parziale/totale
   e toglie "Annulla scontrino" dal dettaglio. Il reso si apre, si reinvia e
   si ristampa; non si annulla. Logging con `flow: "return-receipt"`.

## Onboarding AdE (collegamento credenziali)

1. Wizard `src/app/onboarding` → `src/server/onboarding-actions.ts` —
   **method-aware** (`loginMethod: "fisconline" | "cie" | "spid"`) in
   `saveAdeCredentials`/`verifyAdeCredentials`, e `connectAdeWithSpid` per
   SPID dall'app nativa.
2. Verifica credenziali contro AdE; le credenziali sono cifrate AES-256-GCM
   con `src/lib/crypto.ts` e salvate in `src/db/schema/ade-credentials.ts`.
   **Ramo CIE**: login federato via SAML IdP (`loginCie` in
   `src/lib/ade/real-client.ts`, credenziali "livello 2" dell'app CIE ID),
   conferma via **notifica push** con finestra di polling (vedi
   `docs/architecture/config-manifest.md`). **Ramo SPID**: `connectAdeWithSpid`
   adotta i cookie della webview, confronta i dati fiscali letti
   nell'adozione con la P.IVA registrata e solo allora scrive la riga `spid`
   (issue #1040). Per CIE e SPID, in `ADE_MODE=real`, la sessione entra
   nello store interattivo solo a verifica riuscita (identity guard e
   salvataggio), per il riuso in emissione/annullo.
3. Logging con `flow: "onboarding-verify"` in `src/lib/ade/log-failure.ts`.
4. Anti-frode trial: al primo claim della P.IVA si registra il suo HMAC
   (`src/lib/piva-hash.ts`) in `src/db/schema/trial-vat-ledger.ts` (registro che
   sopravvive alla cancellazione dell'account). Se la P.IVA è già presente →
   `trialStartedAt = null` → sola lettura immediata via i gate esistenti in
   `src/lib/plans-shared.ts`.

## Recovery stale-pending AdE

Un documento rimasto "pending" (es. crash dopo la chiamata AdE) viene
riconciliato da `src/lib/services/ade-recovery.ts`, con la soglia temporale
descritta nella skill `ade-integration` e in `docs/architecture/config-manifest.md`.
Prima di ri-sottomettere ad AdE, il recovery interroga `searchDocuments`
(HAR di riferimento: `ricerca.har`, locale e gitignorata) e riconcilia il
documento con la fonte di verità via
`reconcileSaleDocument`/`reconcileVoidDocument`: se AdE l'aveva già accettato →
finalize-only (nessun duplicato fiscale), altrimenti re-submit; lookup
ambiguo o fallito → resta pending (fail-safe).

Su annullo e reso il claim della riga stale la riporta anche a `PENDING`
(`claimStaleDocument(..., { reopen: true })`): gli indici che serializzano le
correzioni di una vendita (0012 per i VOID, 0042 per annullo e reso)
escludono `ERROR`, e una ritrasmissione da una riga `ERROR` partirebbe in
parallelo a un'altra correzione. Se un'altra correzione è già in volo, la
riapertura viola l'indice e la richiesta si ferma senza toccare l'AdE.

Il match porta anche `registeredAt` (il `data` del documento AdE, wall-clock
italiano, parsato da `parseAdeResultDate`): la finalizzazione lo scrive in
`ade_registered_at` via `adeRegisteredAtPatchFromDate`
(`src/lib/services/ade-registered-at.ts`), così la data fiscale della riga
riconciliata è quella dell'AdE e non il `DEFAULT now()` dell'INSERT — che su una
riga stale può precederla di minuti. Resta col default il solo ramo che
finalizza **senza** interrogare AdE (`adeTransactionId` già persistito): lì lo
scarto è la finestra del fallimento DB, non la soglia stale.

## Ciclo abbonamento Stripe

1. Checkout/portal da `src/server/billing-actions.ts` (wrapper SDK in
   `src/lib/stripe.ts`).
2. Webhook firmato → `src/app/api/stripe`; gli eventi processati aggiornano il
   piano su `src/db/schema/profiles.ts` (idempotenza via
   `src/db/schema/stripe-webhook-events.ts`).
3. API version `2026-09-30.endive` e gli 8 eventi obbligatori → skill
   `stripe-webhooks` + `CLAUDE.md`.
4. Dopo il commit, senza attendere: la mail all'operatore e, quando il cambio
   porta via Team (`leavesTeam` in `src/lib/subscription-change.ts`), l'email
   ai collaboratori (`src/lib/services/collaborator-suspension-notice.ts`),
   che parte solo se il piano effettivo del titolare non li ammette più. La
   prova che scade da sola non manda eventi e non scrive a nessuno: il
   collaboratore trova l'avviso nell'app (issue #1099).

## Osservabilità ed errori

1. Tutto passa da `src/lib/logger.ts` (pino). `warn` resta nei log; `error`
   (level ≥ 50) emette anche `Sentry.captureException`.
2. AdE: `src/lib/ade/log-failure.ts` decide il ramo — `ade_user_error`/
   `ade_transient` → solo `warn`; `ade_failure` → Sentry con fingerprint per
   `flow` (regole 20/23).
3. Rumore di rete client filtrato in `src/lib/sentry-filters.ts`
   (`clientBeforeSend`, montato in `instrumentation-client.ts` — unico entry
   point Sentry lato browser con Turbopack).
4. Validazione drain + smoke post-deploy via `src/app/api/health`
   (`live`, `env`, `sentry-sentinel` — regole 21/25, skill `sentry-hygiene`).
