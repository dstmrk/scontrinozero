# ScontrinoZero — Piano di sviluppo

## Versione corrente: v1.1.3 ✅ — Prossima release: v1.2.0 (PWA) ⬜

Il piano usa **release semantiche** (vx.y.z). La v1.1.0 è stata rilasciata in produzione.

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Release post-lancio (v1.x.y)

| Versione     | Descrizione                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **v1.1.0**   | ✅ Lotteria degli Scontrini: codice lotteria nel payload AdE, form emissione, storico, PDF                                   |
| **v1.1.1**   | ✅ Fix sicurezza/affidabilità: UUID validation, void atomicity, delete account retry, password reset hardening, trusted IP   |
| **v1.1.2**   | ✅ Tech debt code review (parziale)                                                                                          |
| **v1.1.3**   | ✅ Tech debt code review: Zod safeParse route API v1, JOIN singolo per checkBusinessOwnership e fetchAdePrerequisites        |
| **v1.2.0**   | PWA: `@serwist/next`, manifest, offline shell, install prompt                                                                |
| **v1.3.0**   | Landing & SEO polish: social proof, pagine dedicate funzionalità/prezzi, screenshot UI                                       |
| **v1.4.0**   | Coupon/promo codes, referral program, Stripe Customer Portal polish                                                          |
| **v1.5.0**   | Email scontrino al cliente (PDF allegato via Resend)                                                                         |
| **v1.6.0**   | Dashboard analytics: totale giornaliero, sparkline revenue, export CSV                                                       |
| **v1.7.0**   | Catalogo: modifica prodotto + sync AdE (HAR: aggiungi/modifica/elimina)                                                      |
| **v1.8.0**   | AdE auth multi-metodo: SPID e CIE selezionabili in onboarding + settings; cookie jar cifrato nel DB, re-auth on 401          |
| **v1.9.0**   | CSV import prodotti, barcode scanner (BarcodeDetector API), Umami analytics                                                  |
| **v1.10.0+** | Bluetooth printing (58/80mm), Passkey                                                                                        |
| **v1.11.0**  | Storno avanzato: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento                   |
| **v1.x**     | Developer API Fase A: API key per-merchant, Pro gate, endpoints emissione/annullamento — vedi [DEVELOPER.md](./DEVELOPER.md) |
| **v2.0.0+**  | Developer API Fase B: partner account, management API, piani developer, webhook, multi-operatore                             |

---

---

### v1.9.0 — Scontrino di annullamento (post-lancio) ⬜

Quando annulliamo uno scontrino, AdE genera un nuovo documento commerciale di annullamento.

**Task (TDD — test prima):**

- ⬜ Persistire nel DB il numero/progressivo del documento commerciale di annullamento restituito da AdE
- ⬜ Estendere `voidReceipt`/storico per esporre il riferimento del documento di annullamento
- ⬜ Aggiungere stampa/anteprima "scontrino di annullamento" dedicato
- ⬜ Includere nel layout testo di riferimento, es.:
  - `DOCUMENTO COMMERCIALE emesso per ANNULLAMENTO`
  - `Documento di riferimento: N. 0005-0009 del 03-06-2020`
- ⬜ Test TDD per mapping payload AdE, persistenza e rendering documento

---

## Backlog sicurezza / tech debt

| ID     | Descrizione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Priorità |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **B1** | **Stripe webhook dedup su `event.id`**: aggiungere tabella `stripe_webhook_events(event_id unique, processed_at, type, status)` + insert-if-not-exists atomico prima di processare. Stripe può inviare eventi duplicati; le operazioni del webhook sono idempotenti per natura ma la dedup riduce fragilità.                                                                                                                                                                                                                   | P2       |
| **B2** | **Paginazione cursor-based su storico e export**: `searchReceipts` carica tutti i documenti in memoria; `exportUserData` esporta senza limiti. Da affrontare quando il volume per-tenant lo richiede.                                                                                                                                                                                                                                                                                                                          | P2       |
| **B3** | **Key rotation zero-downtime**: `decrypt()` supporta già `Map<number, Buffer>`. Callers usano ancora `new Map([[version, getEncryptionKey()]])`. Serve runbook + script re-encryption + test E2E.                                                                                                                                                                                                                                                                                                                              | P3       |
| **B4** | **Error envelope uniforme API**: standardizzare `{code, message, requestId}` su tutti gli endpoint; wrapping coerente delle integrazioni esterne con classificazione transient/permanent.                                                                                                                                                                                                                                                                                                                                      | P3       |
| **B5** | **TTL/revoca link pubblici scontrini** (da code review P2-01): sostituire accesso diretto via document UUID con share token separato, con `expires_at`, `revoked_at`, `last_accessed_at` e UI di rigenerazione/revoca. UUID da 122 bit è sicuro contro enumeration, ma un link condiviso per errore resta valido per sempre. Da fare in v1.4.0+.                                                                                                                                                                               | P2       |
| **B6** | **Enforcement limiti mensili Developer API** (da code review P1-02): `DEVELOPER_MONTHLY_LIMITS` è definito in `plans.ts` ma non applicato. Serve contatore per-business su finestra mensile UTC, blocco alla soglia con errore esplicito, e quota residua nel payload risposta. Implementare contestualmente al lancio dei developer plan in v2.0.0.                                                                                                                                                                           | P1       |
| **B7** | **Stale PENDING recovery per emissione scontrini** (da code review P1-03): quando un documento è in PENDING da più di N minuti (crash/timeout downstream), il retry con la stessa idempotency key dovrebbe essere consentito. Attualmente il client riceve "stato inconsistente" e deve usare una nuova key (workaround UI: "svuota carrello e riprova"). Fix richiede: SELECT FOR UPDATE sul record, soglia stale configurabile, machine-readable error code. Da implementare contestualmente a B4 (error envelope uniforme). | P2       |
| **B8** | **CAPTCHA hostname allowlist** (`TURNSTILE_ALLOWED_HOSTNAMES`): `verifyCaptcha()` in `src/server/auth-actions.ts` usa un singolo hostname exact-match. Supportare una lista di hostname configurabili (es. www + non-www, staging) senza dover aggiornare il codice. Da implementare solo se si aggiunge un terzo ambiente (staging/preview).                                                                                                                                                                                  | P3       |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Stripe prima di PWA**: meglio pochi utenti paganti che tanti utenti gratuiti non monetizzati.
