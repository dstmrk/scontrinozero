# ScontrinoZero — Piano di sviluppo

## Versione corrente: v1.1.2 ✅ — Prossima release: v1.2.0 (PWA) ⬜

Il piano usa **release semantiche** (vx.y.z). La v1.1.0 è stata rilasciata in produzione.

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Release post-lancio (v1.x.y)

| Versione     | Descrizione                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **v1.1.0**   | ✅ Lotteria degli Scontrini: codice lotteria nel payload AdE, form emissione, storico, PDF                                   |
| **v1.1.1**   | ✅ Fix sicurezza/affidabilità: UUID validation, void atomicity, delete account retry, password reset hardening, trusted IP   |
| **v1.1.2**   | ✅ Tech debt code review: consolidamento validazioni, ottimizzazione query DB (rinviato a v1.2.x)                            |
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

### v1.1.0 — Lotteria degli Scontrini ✅

Il documento commerciale può includere il codice lotteria del cliente (codice fiscale, 16 car.),
trasmesso ad AdE nel payload. Il cliente può partecipare alla lotteria degli scontrini
inquadrando un QR code o comunicando verbalmente il codice fiscale.

**Task (TDD — test prima):**

- ✅ Analizzare il campo codice lotteria nel payload AdE (verificare nome campo e posizione nel documento commerciale)
- ✅ Aggiungere colonna nullable `lottery_code` in `commercial_documents` (migration Drizzle)
- ✅ Estendere `buildPayload()` / mapper AdE per includere il codice lotteria quando valorizzato
- ✅ `MockAdeClient`: supportare il campo codice lotteria nelle risposte simulate
- ✅ UI form cassa: campo opzionale "Codice lotteria" con validazione (CF 16 caratteri alfanumerici)
- ✅ Server action `emitReceipt`: persistere il codice lotteria ricevuto
- ✅ Storico scontrini: mostrare codice lotteria se presente
- ✅ PDF scontrino (pdfkit): includere riga codice lotteria se presente
- ✅ Share link pubblico: mostrare codice lotteria se presente
- ✅ Test TDD: mapper payload, validazione CF, persistenza, rendering PDF e storico

---

### v1.2.x — Tech debt dalla code review (backlog) ⬜

Da pianificare come task separati tra v1.2.0 e v1.3.0, in ordine di priorità:

**Validazioni (Issue #15):**

- ⬜ Schemi Zod condivisi per input API e server actions (oggi validazione distribuita/manuale)
- ⬜ Error model uniforme (`code`, `message`, `details`, `field`) per API e form errors
- ⬜ `safeParse` + risposta 400 strutturata uniforme su tutte le route API

**Query optimization (Issue #12):**

- ⬜ `checkBusinessOwnership`: unire le 2 query (profile + business) in un JOIN unico
- ⬜ `fetchAdePrerequisites`: unire le 2 query (ade_credentials + business) in un JOIN unico
- ⬜ Benchmark roundtrip prima/dopo per misurare impatto reale

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

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Stripe prima di PWA**: meglio pochi utenti paganti che tanti utenti gratuiti non monetizzati.
