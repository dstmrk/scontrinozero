---
name: stripe-webhooks
description: Use when working with Stripe billing — handling API version `2026-05-27.dahlia` breaking changes (Invoice.subscription moved to invoice.parent?.subscription_details?.subscription, Subscription.current_period_end moved to items[0]), registering the 8 required webhook events (checkout.session.completed/expired, customer.subscription.updated/deleted, invoice.paid/payment_failed/payment_action_required, charge.dispute.created), debugging "pending" subscription rows after checkout, or implementing stale-pending recovery thresholds for idempotent AdE mutations (getStalePendingThresholdMs in receipt-service/void-service). Files: src/server/stripe/, src/app/api/stripe/, webhook handler.
---

# stripe-webhooks — Stripe API version, webhook events, recovery patterns

## API version `2026-05-27.dahlia` — breaking changes

SDK: `stripe` npm v22.x.

- `Invoice.subscription` **rimosso** →
  `invoice.parent?.subscription_details?.subscription`
- `Subscription.current_period_end` **spostato** a livello item →
  `subscription.items.data[0]?.current_period_end`
- Non usare `!` (non-null assertion) su `process.env.STRIPE_WEBHOOK_SECRET` —
  aggiungere guard esplicito (`if (!secret) return 500`) per evitare SonarCloud
  code smell

---

## Webhook events: lista completa (8 eventi)

Il webhook handler gestisce **8 eventi**. Ogni endpoint (prod, sandbox, dev
locale) deve avere il proprio `whsec_*` separato generato da Stripe (Settings →
Webhooks → Add endpoint). **Mai condividere** lo stesso `STRIPE_WEBHOOK_SECRET`
tra ambienti diversi.

**Evento più critico da non dimenticare:** `customer.subscription.updated` — è
l'unico che chiama `syncSubscriptionData` sui rinnovi, aggiornando
`profiles.planExpiresAt`. Senza di esso la data di rinnovo in UI è sempre stale
e la recovery da `past_due` non funziona mai.

| Evento                            | Perché                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| `checkout.session.completed`      | Attiva l'abbonamento dopo il pagamento                       |
| `checkout.session.expired`        | Cleanup righe `pending` abbandonate (24h di default)         |
| `customer.subscription.updated`   | Rinnovi, upgrade/downgrade, recovery da `past_due`           |
| `customer.subscription.deleted`   | Cancellazione → reset a `trial` in transaction               |
| `invoice.paid`                    | Aggiorna `currentPeriodEnd` su ogni rinnovo (safety net)     |
| `invoice.payment_failed`          | Imposta status `past_due`                                    |
| `invoice.payment_action_required` | 3D Secure / SCA obbligatorio in EU (PSD2)                    |
| `charge.dispute.created`          | Alert chargeback con `critical: true` — nessuna scrittura DB |

**NON serve registrare:**

- `customer.subscription.created` — coperto da `checkout.session.completed`
- `payment_intent.*` — coperti dagli eventi `invoice.*`
- `customer.subscription.paused/resumed` — feature non usata

### Stato "misto" subscription card (pending + trial)

Se dopo un checkout la card mostra "Prova gratuita" + "Abbonamento annuale" +
portale, la riga `subscriptions` è `pending` (webhook non arrivato o fallito).

Verificare:

1. Endpoint registrato su Stripe per quell'ambiente
2. `STRIPE_WEBHOOK_SECRET` corretto
3. Log server per errori di firma

---

## Stale recovery di mutazioni esterne idempotenti (AdE)

Il recovery di una row PENDING/ERROR senza `adeTransactionId` ri-invoca
`submitSale`/`submitVoid`. AdE non accetta idempotency-key nel payload: se la
prima call era arrivata ad AdE ma la response si è persa in volo (timeout,
container kill, network glitch), il retry crea un documento fiscale duplicato
o un VOID duplicato — **irreversibile**.

**Mitigazione:** soglia stale di 30 minuti in `getStalePendingThresholdMs()`
(sia `receipt-service` che `void-service`). 30 min è sopra la durata sessione
AdE tipica, quindi un retry sotto soglia ritorna `PENDING_IN_PROGRESS` e
l'utente lo riproverà quando la sessione AdE non sarà più valida.

Logging esplicito al rientro in recovery senza `adeTransactionId` per audit.
Override env per test E2E o ambienti controllati:
`STALE_PENDING_THRESHOLD_MINUTES=5`.

**Soluzione corretta (roadmap):** `searchDocuments`/`getDocument` su AdE
pre-retry per scoprire se un documento collegato esiste già — richiede
l'endpoint AdE di ricerca (vedi `ricerca_documento.har`).

## Stripe official Skill

https://raw.githubusercontent.com/stripe/ai/refs/heads/main/skills/stripe-best-practices/SKILL.md
