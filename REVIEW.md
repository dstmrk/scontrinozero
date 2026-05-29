# Code review approfondita — ScontrinoZero

Data review: 2026-05-29.

## Metodo seguito

- Ho letto `PLAN.md` prima di consolidare i finding e ho escluso i miglioramenti già presenti lì.
- Ho fatto una prima passata sui confini critici dell'applicazione: auth, onboarding AdE, emissione/annullo scontrini, API v1, billing Stripe, DB schema/migration, export/account deletion e pagine pubbliche.
- Ho fatto una seconda passata mirata su race condition, idempotenza, limiti di input, timeout e coerenza DB ↔ provider esterni.
- Ho ripetuto una terza passata confrontando i candidati con `PLAN.md`: non sono emersi nuovi finding non già inclusi sotto, quindi mi sono fermato.
- Nota esplicita: non ho aperto finding sul rate limiter in memory, perché in produzione l'applicazione gira su un solo Docker come indicato.

## Miglioramenti già presenti in `PLAN.md` e quindi NON duplicati qui

Questi punti sono stati verificati ma non ripetuti nei finding:

- Flag durabili per idempotenza welcome/operator email in `verifyAdeCredentials`.
- Enforcement dei limiti mensili Developer API.
- Paginazione cursor-based / export non limitato / `COUNT(*)` nella Developer API.
- CHECK constraint e length limit a livello DB.
- Indice composito/partial su `api_keys (business_id, revoked_at)`.
- Centralizzazione di retry/timeout provider esterni.
- Rimozione CSP `unsafe-inline` già tracciata dal commento in `src/lib/csp.ts` e dal backlog.

---

## P1 — Bloccanti o ad alto rischio

### P1.1 — `verifyAdeCredentials` può salvare identità fiscale ottenuta da credenziali stale

**Categoria:** sicurezza / compliance fiscale / race condition.

**Evidenza:** `verifyAdeCredentials` legge le credenziali e salva uno snapshot di `cred.updatedAt`, poi decifra e fa login AdE. Prima di controllare se le credenziali sono state cambiate nel frattempo, aggiorna `businesses.vatNumber`, `businesses.fiscalCode` e `profiles.partitaIva` con i dati fiscali letti dalla sessione AdE. Solo dopo esegue l'update ottimistico di `adeCredentials.verifiedAt` filtrando su `updatedAt`. Il controllo ottimistico protegge quindi soltanto `verifiedAt`, non i dati fiscali già scritti.

**Scenario riproducibile:**

1. Utente avvia verifica credenziali A.
2. Mentre `adeClient.login()` / `getFiscalData()` è in corso, l'utente salva credenziali B sullo stesso `businessId`; `saveAdeCredentials` aggiorna la riga e resetta `verifiedAt`.
3. La verifica A completa `getFiscalData()` e scrive P.IVA / codice fiscale su `businesses` e `profiles`.
4. L'update finale di `verifiedAt` fallisce perché `updatedAt` non corrisponde, ma la business identity è già stata sovrascritta con i dati della sessione A.

**Impatto:** l'account può restare associato a dati fiscali non corrispondenti alle credenziali correnti. Questo impatta onboarding, anti-abuso trial su P.IVA, intestazione scontrini e audit fiscale.

**Fix richiesto per un agente AI:**

- Spostare il controllo `updatedAt` prima di qualunque scrittura di `businesses` / `profiles`, oppure rendere atomica la finalizzazione in un'unica transazione.
- La transazione deve aggiornare `businesses`, `profiles` e `adeCredentials.verifiedAt` solo se la riga `ade_credentials` del `businessId` ha ancora lo stesso `updatedAt` letto prima della chiamata AdE.
- Se il controllo fallisce, non deve essere scritto nessun dato fiscale; restituire un errore esplicito tipo: “Le credenziali sono state modificate durante la verifica. Riprova.”
- Aggiungere test unitario con sequenza: select cred → update cred concorrente → fiscal data ok → nessun update a `businesses`/`profiles` e `verifiedAt` non valorizzato.
- Valutare una piccola helper `finalizeAdeVerificationIfCurrent({ businessId, credentialVersion, fiscalData, userId })` per rendere il comportamento testabile senza mocking profondo di AdE.

### P1.2 — Onboarding può creare più `businesses` per lo stesso profilo

**Categoria:** integrità dati / architettura multi-tenant / race condition.

**Evidenza:** lo schema Drizzle definisce solo un indice su `businesses.profileId`, non un vincolo unique. `saveBusiness` fa `SELECT ... WHERE profileId LIMIT 1` e, se non trova righe, inserisce una nuova business dentro una transazione, ma non prende un lock sulla riga `profiles` e non ha un vincolo DB che serializzi due submit concorrenti.

**Scenario riproducibile:** doppio submit iniziale dell'onboarding o retry di rete parallelo. Entrambe le transazioni vedono zero business e inseriscono due righe con lo stesso `profile_id`.

**Impatto:** molte parti dell'app assumono implicitamente 1 business per profilo (`getOnboardingStatus` fa left join e `limit(1)`, API key e dashboard operano sul primo business trovato). Duplicati possono causare credenziali AdE, storico, API key e impostazioni applicate alla business “sbagliata” in modo non deterministico.

**Fix richiesto per un agente AI:**

- Aggiungere migration handwritten con vincolo `UNIQUE (profile_id)` su `businesses`.
- Prima della migration, prevedere script/query di dedup o almeno documentare fail-fast se esistono duplicati; scegliere quale riga mantenere in base a `created_at` e presenza di `fiscal_code` / credenziali / documenti.
- Aggiornare schema Drizzle usando `uniqueIndex` o `.unique()` su `profileId`.
- Modificare `saveBusiness` per usare un vero upsert su `profileId` (`onConflictDoUpdate`) oppure prendere `SELECT ... FOR UPDATE` su `profiles` prima del check.
- Aggiungere test di concorrenza o test unitario che simuli due chiamate e verifichi una sola business finale.

### P1.3 — Stale recovery di SALE/VOID può duplicare operazioni fiscali con retry concorrenti

**Categoria:** idempotenza / consistenza con provider esterno / rischio fiscale.

**Evidenza:** quando una SALE esistente con stessa idempotency key è `PENDING`/`ERROR` e oltre soglia stale, `handleExistingReceipt` chiama `recoverStaleReceipt`; se non ci sono `adeTransactionId` e `adeProgressive`, `recoverStaleReceipt` riesegue `submitSaleToAde`. La selezione dell'esistente non prende lock e non marca la recovery “in corso”. Il pattern del VOID è analogo: `resolveVoidConflict` decide che un VOID stale è recuperabile; se non ha transaction id noto, `insertOrResolveVoid` ritorna `kind: inserted` con il vecchio `voidDocumentId` e il flusso riesegue `submitVoid`.

**Scenario riproducibile:** due client/job ritentano quasi contemporaneamente la stessa idempotency key dopo la soglia stale. Entrambi leggono lo stesso stato stale senza lock, entrambi decidono di recuperare e possono chiamare AdE in parallelo.

**Impatto:** possibile doppia emissione di documento commerciale o doppio annullo fiscale. I commenti riconoscono già il rischio residuo quando non esiste idempotency AdE, ma manca una serializzazione applicativa/DB che impedisca la duplicazione tra retry concorrenti interni.

**Fix richiesto per un agente AI:**

- Introdurre un lock per documento durante la recovery: opzioni accettabili sono `SELECT ... FOR UPDATE` in transaction sul record `commercial_documents`, `pg_advisory_xact_lock(hash(documentId))`, oppure update atomico di uno stato/flag dedicato tipo `RECOVERING` se si decide di estendere enum e schema.
- Per SALE: la decisione stale + eventuale finalize-only/resubmit deve avvenire dentro la sezione protetta. Solo un processo deve poter uscire dalla sezione con permesso di chiamare AdE.
- Per VOID: applicare lo stesso lock sul `voidDocumentId` o sul `voidedDocumentId` della SALE, in modo da serializzare anche idempotency key diverse che puntano allo stesso SALE.
- Se un secondo retry trova recovery già in corso, deve rispondere `PENDING_IN_PROGRESS` / `VOID_PENDING_IN_PROGRESS` con `Retry-After`, non chiamare AdE.
- Aggiungere test con due promise concorrenti che arrivano al branch stale e verificare una sola chiamata mock a `submitSale` / `submitVoid`.

### P1.4 — Idempotency key riusata con payload diverso restituisce il risultato precedente senza rilevare mismatch

**Categoria:** funzionalità API / bad practice idempotenza / integrità fiscale.

**Evidenza:** su SALE, il conflitto di idempotenza è gestito con `onConflictDoNothing`; se la riga esiste, `handleExistingReceipt` cerca solo `idempotencyKey` + `businessId` e, se lo stato è `ACCEPTED`, ritorna il documento esistente. Non confronta righe, importi, metodo di pagamento o lottery code con la richiesta corrente. Su VOID il branch `existingByKey` controlla solo business + idempotency key; non verifica che il `documentId` della richiesta corrente coincida col `voidedDocumentId` della riga VOID esistente.

**Scenario riproducibile SALE:** un client riusa per errore lo stesso UUID idempotency per due vendite diverse. La seconda chiamata riceve `201` con il documento della prima vendita invece di un errore `409 idempotency_payload_mismatch`.

**Scenario riproducibile VOID:** un client riusa la stessa idempotency key per annullare un secondo documento; se esiste un VOID accettato con quella key, il servizio può restituire il primo annullo come se fosse idempotente anche se il target è diverso.

**Impatto:** API sorprendente e fiscalmente pericolosa: il client può credere emesso/annullato un documento che in realtà non corrisponde alla richiesta inviata.

**Fix richiesto per un agente AI:**

- Salvare in `commercial_documents.publicRequest` un payload canonico completo per SALE: `lines` normalizzate, `paymentMethod`, `lotteryCode` effettivo e totale in centesimi. O salvare un `requestHash` SHA-256 canonico in una nuova colonna.
- In caso di conflitto idempotency, confrontare il payload/hash corrente con quello salvato. Se differisce, rispondere `409` con codice machine-readable `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Per VOID, salvare `publicRequest` con `documentId` target o confrontare `voidedDocumentId` dell'esistente con `input.documentId`.
- Aggiornare `serviceErrorResponse` e i tipi `SubmitReceiptErrorCode` / `VoidReceiptErrorCode`.
- Aggiungere test API e service-level per: stesso payload → ritorno idempotente; payload diverso → 409; void target diverso con stessa key → 409.

### P1.5 — Checkout Stripe non è idempotente e può creare più sessioni/subscription per lo stesso utente

**Categoria:** billing / rischio economico / UX.

**Evidenza:** `getOrCreateStripeCustomerId` gestisce la race sulla creazione del customer e accetta un customer orfano in caso di double-click, ma la route crea sempre una nuova Checkout Session con `stripe.checkout.sessions.create`. Non viene salvato un `checkoutSessionId`, non viene riusata una sessione aperta, non viene passato un idempotency key applicativo alla chiamata Stripe e non c'è un blocco se l'utente ha già una subscription attiva/pending.

**Scenario riproducibile:** utente fa doppio click o apre due tab e avvia due checkout session; può completarle entrambe e ottenere più subscription Stripe sullo stesso customer. Il DB locale ha una sola riga `subscriptions` e verrà aggiornato dall'ultimo webhook, lasciando il rischio di addebiti duplicati non rappresentati correttamente nell'app.

**Impatto:** possibile doppio pagamento, support manuale, desync billing e perdita di fiducia.

**Fix richiesto per un agente AI:**

- Aggiungere una colonna per `stripe_checkout_session_id` e/o `checkout_session_expires_at` se si vuole riusare sessioni aperte, oppure introdurre una tabella `checkout_sessions` per user.
- Prima di creare una nuova sessione, verificare se esiste subscription locale `active`, `trialing`, `past_due`, `incomplete` o una sessione pending non scaduta e decidere: redirect al portal, ritorno della sessione esistente, oppure errore esplicito.
- Passare una `idempotencyKey` Stripe stabile per finestra breve, ad esempio `checkout:${user.id}:${priceId}:${bucket}` se compatibile con il modello prodotto.
- Nei webhook, rilevare più subscription attive per lo stesso customer e loggare `critical: true` o cancellare/gestire secondo policy.
- Aggiungere test per doppia chiamata concorrente alla route checkout: una sola sessione Stripe creata o seconda risposta che riusa/blocca.

---

## P2 — Importanti ma non immediatamente bloccanti

### P2.1 — Server action con UUID non validati possono generare 500 invece di errori applicativi

**Categoria:** robustezza / sicurezza applicativa / input validation.

**Evidenza:** la route API valida gli UUID al boundary, ma le server action UI non sono uniformi. `emitReceipt` valida `businessId` solo con `z.string().min(1)`, poi passa a `checkBusinessOwnership`, che confronta il valore con una colonna `uuid`. `voidReceipt` non ha uno schema runtime per `businessId`, `documentId` e `idempotencyKey` prima di interrogare Postgres. Una chiamata server action manipolata può quindi inviare stringhe non UUID e ottenere errori Postgres `invalid input syntax for type uuid`.

**Impatto:** errori 500/Sentry evitabili, log noise, UX incoerente e superficie DoS leggera tramite richieste malformate autenticate.

**Fix richiesto per un agente AI:**

- Usare `z.string().uuid()` per `businessId`, `documentId` e `idempotencyKey` in tutte le server action che arrivano dal client.
- Applicare la validazione prima di `checkBusinessOwnership` e prima di qualunque query DB.
- Per `voidReceipt`, creare uno schema analogo a `submitReceiptSchema` e restituire messaggi utente coerenti.
- Aggiungere test che chiamano le server action con UUID malformati e verificano risposta `{ error }`, non throw.

### P2.2 — Link pubblico ricevuta usa il primary key UUID come bearer token non revocabile

**Categoria:** privacy / architettura sicurezza.

**Evidenza:** `fetchPublicReceipt` serve una ricevuta pubblica senza auth usando `commercial_documents.id` come token pubblico; la pagina `/r/[documentId]` e il PDF pubblico riusano lo stesso identificativo. Lo stesso UUID è anche usato internamente nelle API/dashboard come primary key del documento.

**Impatto:** il documento UUID diventa un segreto permanente. Se finisce in log, screenshot, analytics, chat support o referer, chiunque può vedere ricevuta e PDF finché il record resta `ACCEPTED`. Non esiste rotazione/revoca selettiva del link pubblico senza cambiare l'id primario o bloccare la ricevuta.

**Fix richiesto per un agente AI:**

- Aggiungere a `commercial_documents` un `public_share_token` random indipendente, nullable o valorizzato solo per SALE accettate, con indice unique.
- Modificare `/r/[documentId]` e `/r/[documentId]/pdf` per accettare il token pubblico, non il primary key.
- Mantenere redirect/backward compatibility temporanea se necessario, ma non esporre più nuovi link con `id` primario.
- Prevedere `public_share_revoked_at` o rotazione token dalle impostazioni/storico.
- Aggiornare PDF/share button/test e assicurarsi che API v1 continui a usare l'id interno.

### P2.3 — `deleteAccount` elimina prima l'utente Supabase Auth e solo dopo i dati applicativi

**Categoria:** privacy / operabilità / consistenza dati.

**Evidenza:** `deleteAccount` cancella prima `auth.users` via admin API. Solo successivamente elimina `profiles`, confidando nella cascade. Se la delete DB fallisce, l'utente non può più autenticarsi per riprovare, mentre profilo, business, credenziali cifrate e documenti possono restare orfani fino a cleanup manuale.

**Impatto:** retention involontaria di dati personali e fiscali dopo richiesta di cancellazione account. Il codice logga `critical`, ma il recupero è manuale e l'utente non ha più self-service.

**Fix richiesto per un agente AI:**

- Introdurre uno stato di cancellazione applicativa, ad esempio `profiles.deletion_requested_at` / `deletion_completed_at`, oppure una tabella `account_deletion_jobs`.
- Cancellare o anonimizzare i dati applicativi in transazione prima di eliminare Auth, oppure marcare l'account come pending deletion e far completare la delete Auth solo dopo successo DB.
- Se Auth delete fallisce dopo DB delete, mantenere un percorso di retry server-side/job e impedire login normale mostrando “account in eliminazione”.
- Aggiungere test per fallimento DB dopo Auth e per fallimento Auth dopo DB, verificando che non restino stati irrecuperabili senza job/flag.

### P2.4 — Parametri pagination/filter API v1 accettano valori invalidi silenziosamente

**Categoria:** funzionalità API / contract design.

**Evidenza:** `GET /api/v1/receipts` parse-a `page` e `limit` con `parseInt` e fallback/clamp silenziosi; `kind` diverso da `SALE`/`VOID` viene trattato come assente. Quindi `page=abc`, `limit=abc`, `limit=999999` o `kind=foo` non producono un errore client, ma risposte valide con default/clamp.

**Impatto:** client integration bug difficili da scoprire; i partner possono credere di aver filtrato/paginato correttamente mentre ricevono altro. Questo è particolarmente problematico perché la Developer API è un contratto pubblico.

**Fix richiesto per un agente AI:**

- Definire uno schema Zod per query params: `page` intero positivo, `limit` intero 1..100, `kind` enum opzionale.
- Rifiutare valori non numerici, decimali, negativi o enum non supportati con `400` e messaggio field-specific.
- Mantenere compatibilità solo per parametro omesso, non per parametro presente ma invalido.
- Aggiungere test per `page=abc`, `page=0`, `limit=101`, `kind=foo`.

### P2.5 — `saveBusiness` valida quasi tutti i campi liberi ma non `streetNumber`

**Categoria:** input validation / qualità dati.

**Evidenza:** `validateSaveBusinessInput` applica limiti a nome, cognome, ragione sociale, indirizzo, città e provincia, ma `streetNumber` viene letto dal form e scritto su DB senza limite di lunghezza.

**Impatto:** campo testuale illimitato in una server action autenticata. Non è un rischio critico, ma può sporcare dati, appesantire payload, causare layout problematici e aggirare l'obiettivo dei limiti centralizzati.

**Fix richiesto per un agente AI:**

- Aggiungere `streetNumber` a `BUSINESS_PROFILE_LIMITS`, ad esempio 20 o 30 caratteri.
- Validarlo in `validateSaveBusinessInput` e nell'equivalente update impostazioni se presente.
- Aggiungere test server action e UI/form validation se esistente.
- Se si implementano in futuro i DB CHECK del `PLAN.md`, includere anche `businesses.street_number`.

---

## P3 — Miglioramenti di architettura/manutenibilità

### P3.1 — Validazione request SALE duplicata tra API route e server action

**Categoria:** architettura / manutenibilità.

**Evidenza:** `receiptBodySchema` nella route API e `submitReceiptSchema` nella server action contengono regole quasi identiche su righe, quantità, prezzo, VAT code, payment method, idempotency e lottery code. La differenza principale è il campo UI-only `id`.

**Impatto:** drift futuro probabile: una regola fiscale o limite può essere aggiornata in un canale e dimenticata nell'altro. Per un'app fiscale, divergenze tra UI e API sono costose da diagnosticare.

**Fix richiesto per un agente AI:**

- Estrarre uno schema condiviso in `src/lib/receipts/receipt-input-schema.ts` o simile.
- Definire `receiptLineCoreSchema` e comporre due schema sottili: API senza `id`, UI con `id` opzionale/required.
- Esportare un normalizer che converte entrambe le forme in `SubmitReceiptInput` canonico.
- Aggiornare test esistenti per importare lo schema condiviso e aggiungere un test anti-drift sulle costanti di limite.

### P3.2 — `ADE_MODE` defaulta a `mock`, con rischio configurazione production sbagliata

**Categoria:** configurazione / operabilità.

**Evidenza:** i flussi di verifica, cambio password, emissione e annullo AdE usano `(process.env.ADE_MODE as "mock" | "real") || "mock"`. Se in produzione la variabile manca o contiene un valore inatteso, l'app può usare il client mock invece del client reale.

**Impatto:** misconfigurazione silenziosa: verifiche/emissioni/annulli potrebbero sembrare riuscire senza interagire davvero con AdE, oppure comportarsi in modo diverso dal previsto. In ambito fiscale è preferibile fallire chiuso.

**Fix richiesto per un agente AI:**

- Creare helper `getAdeMode()` che valida strettamente `ADE_MODE`.
- In `NODE_ENV === "production"`, richiedere esplicitamente `ADE_MODE=real` salvo eventuale flag di sandbox chiaramente nominato.
- Per dev/test, mantenere default `mock`.
- Sostituire tutti i cast inline con helper centralizzato.
- Aggiungere test per env mancante/invalido in production e dev.

### P3.3 — Query `fetchPublicReceipt` filtra stato/kind dopo aver letto la riga

**Categoria:** performance / minimizzazione dati.

**Evidenza:** `fetchPublicReceipt` cerca il documento solo per `id`, join-a `businesses`, poi controlla in applicazione `doc.kind !== "SALE" || doc.status !== "ACCEPTED"`. Se il documento è VOID, ERROR o PENDING, la query ha comunque letto documento e business.

**Impatto:** piccolo oggi, ma il boundary pubblico dovrebbe minimizzare dati e lavoro già nella query. Aiuta anche a evitare futuri refactor che usino accidentalmente dati di documenti non pubblicabili.

**Fix richiesto per un agente AI:**

- Spostare `kind = 'SALE'` e `status = 'ACCEPTED'` nella clausola `WHERE`.
- Valutare una select esplicita dei soli campi necessari alla pagina/PDF, invece di `doc: commercialDocuments, biz: businesses` completi.
- Aggiungere test che un documento non accepted non carichi le lines e ritorni `null`.
