---
name: stripe-webhooks
description: Use when working with Stripe billing — handling API version `2026-05-27.dahlia` breaking changes (Invoice.subscription moved to invoice.parent?.subscription_details?.subscription, Subscription.current_period_end moved to items[0]), registering the 8 required webhook events (checkout.session.completed/expired, customer.subscription.updated/deleted, invoice.paid/payment_failed/payment_action_required, charge.dispute.created), or debugging "pending" subscription rows after checkout. Files: src/lib/stripe.ts (SDK wrapper), src/app/api/stripe/ (webhook + checkout/portal), src/server/billing-actions.ts. For the AdE stale-pending recovery see the ade-integration skill.
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

## Stale recovery AdE → skill `ade-integration`

La sezione sul recovery delle mutazioni AdE idempotenti (soglia 30 min
`getStalePendingThresholdMs`, riconciliazione pre-retry via `searchDocuments` +
`reconcileSaleDocument`/`reconcileVoidDocument` — **implementata**, non più
roadmap) è stata spostata nella skill `ade-integration`, dove vive il resto
dell'integrazione AdE. File: `src/lib/services/ade-recovery.ts`.

## Stripe official Skill

https://raw.githubusercontent.com/stripe/ai/refs/heads/main/skills/stripe-best-practices/SKILL.md
