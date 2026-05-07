# Code Review — ScontrinoZero

<!-- STATE: completed -->
<!-- LAST_PASS: 2 -->
<!-- LAST_AREA_COMPLETED: tests -->
<!-- NEXT_AREA_TO_SCAN: none -->
<!-- AREAS_REMAINING: none -->

## Findings (ordinati per priorità)

<!-- I finding vengono aggiunti incrementalmente, mai persi -->

### [P1] API receipts POST accetta `lotteryCode` non conforme al formato atteso

- **Categoria**: funzionalità
- **File**: `src/app/api/v1/receipts/route.ts:65`
- **Problema**: la validazione consente qualsiasi stringa di lunghezza <= 8 (`z.string().max(8)`), inclusi caratteri non alfanumerici e stringhe vuote. In presenza di input client non fidati (integrazioni terze via API key), il servizio può tentare emissioni AdE con codice lotteria invalido, causando errori runtime downstream o rifiuti non immediatamente diagnosticabili.
- **Impatto**: peggiora affidabilità della Developer API (422 evitabili), aumenta rumore operativo, e crea divergenza tra comportamento UI (più guidato) e API.
- **Fix proposto**: nel `receiptBodySchema` introdurre validazione stretta: `z.string().regex(/^[A-Z0-9]{8}$/)` con normalizzazione `.trim().toUpperCase()` prima del validate (in `parseAndValidateBody` o adapter locale). Mantenere `nullable().optional()` per backward compatibility. Aggiornare mapping errore con messaggio machine-readable (`code: "invalid_lottery_code"`) se già presente envelope standard.
- **Test da aggiungere**: in `src/app/api/v1/receipts/route.test.ts` aggiungere casi: (1) `lotteryCode="ABC12345"` accettato; (2) `lotteryCode="abc12345"` normalizzato/accettato (se scelta normalizzazione); (3) `lotteryCode="ABC-2345"` rifiutato 400/422; (4) stringa vuota rifiutata.
- **Trovato in passata**: 0

### [P2] Calcoli monetari in pagina ricevuta pubblica basati su `number` floating-point

- **Categoria**: bad practice
- **File**: `src/app/r/[documentId]/page.tsx:64`
- **Problema**: totali e quota IVA sono calcolati con `Number.parseFloat` + operazioni floating-point (`qty * price`, somme iterative). Anche se la visualizzazione formatta a 2 decimali, il calcolo base può introdurre errori cumulativi (es. 0.1+0.2), specialmente su ricevute con molte linee e quantità decimali.
- **Impatto**: mismatch potenziale tra totale mostrato nella pagina pubblica e totale fiscale persistito/PDF, con rischio di confusione utente e ticket supporto.
- **Fix proposto**: riusare una utility deterministica già usata lato dominio (decimal string math o integer cents/milliunits). Opzioni: (a) esporre dal backend totale già calcolato/arrotondato, (b) riutilizzare una helper in `src/lib/receipt-format` che lavori in centesimi/millesimi e ritorni valori stabili. Evitare `parseFloat` nel rendering business-critical.
- **Test da aggiungere**: in `src/app/r/[documentId]/page` testare una ricevuta con linee `0.1`, `0.2`, quantità frazionarie e verificare output identico a totale atteso calcolato con aritmetica decimale esatta.
- **Trovato in passata**: 0

### [P2] Invio magic link senza CAPTCHA aumenta superficie di abuso email

- **Categoria**: sicurezza
- **File**: `src/server/auth-actions.ts:313`
- **Problema**: `signInWithMagicLink()` applica solo validazione email + rate limit per IP, ma non verifica Turnstile/CAPTCHA (a differenza di `signUp`). Un attaccante distribuito (botnet/IP rotation) può usare l’endpoint per inviare grandi volumi di email OTP verso terzi, usando l’infrastruttura come mail cannon e degradando reputazione dominio mittente.
- **Impatto**: rischio reputazionale (deliverability peggiorata), incremento costi provider email/auth, e potenziale throttling lato Supabase in scenari di abuso.
- **Fix proposto**: estendere il form magic-link con `captchaToken` e riusare `verifyCaptcha()` prima di `signInWithOtp`. Aggiungere un `expectedAction` dedicato (es. `magic_link`) appena disponibile la validazione action lato server. Mantenere messaggistica neutra per non abilitare enumeration.
- **Test da aggiungere**: in `src/server/auth-actions.test.ts` coprire: (1) token CAPTCHA mancante → errore; (2) token invalido → errore; (3) token valido → invoca `signInWithOtp`; (4) rate limit continua a essere applicato dopo CAPTCHA valido.
- **Trovato in passata**: 0

### Stato passate

- Passata 0 completata su tutte le aree con nuovi finding in `src/app` e `src/server`.
- Passata 1 (controllo convergenza rapido su `src/lib`, `src/components`, `supabase`, `scripts`, `tests`) non ha aggiunto nuovi finding rispetto alla passata precedente.
- Passata 2 completa (non rapida) eseguita con focus affidabilità infrastruttura/migrazioni: aggiunto 1 finding nuovo in `scripts/migrate.ts`.

### [P1] Bootstrap migrazioni troppo permissivo: possibile marcatura “applied” su schema parziale

- **Categoria**: funzionalità
- **File**: `scripts/migrate.ts:103`
- **Problema**: la logica bootstrap considera “schema già esistente” se trova solo il tipo Postgres `document_kind`, e in quel caso marca **tutte** le migrazioni come già applicate senza eseguirle. In ambienti parzialmente inizializzati (o con oggetti creati manualmente), questa euristica può generare falso positivo: alcune tabelle/constraint/index restano mancanti ma il runner non le applicherà più.
- **Impatto**: rischio di drift schema silenzioso tra ambienti, errori runtime tardivi in produzione e debugging complesso perché la tabella `__applied_migrations` risulta completa anche quando il DB non lo è.
- **Fix proposto**: rendere il bootstrap esplicito e sicuro: (1) attivarlo solo con flag dedicata (`MIGRATIONS_BOOTSTRAP_ALLOW=true`), (2) verificare un set minimo di invarianti (es. presenza di 3-5 tabelle core + enum + colonne chiave) invece di un solo tipo, (3) loggare un report con mismatch e fallire hard se invarianti incomplete.
- **Test da aggiungere**: in `tests/unit/scripts-migrate.test.ts` aggiungere casi: (a) `document_kind` presente ma tabelle core assenti => bootstrap deve fallire; (b) invarianti tutte presenti + flag attiva => bootstrap consentito; (c) flag assente => nessun bootstrap automatico.
- **Trovato in passata**: 2
