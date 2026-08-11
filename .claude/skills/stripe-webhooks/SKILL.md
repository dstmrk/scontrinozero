---
name: stripe-webhooks
description: Use when working with Stripe billing — handling API version `2026-07-29.dahlia` breaking changes (Invoice.subscription moved to invoice.parent?.subscription_details?.subscription, Subscription.current_period_end moved to items[0]), registering the 8 required webhook events (checkout.session.completed/expired, customer.subscription.updated/deleted, invoice.paid/payment_failed/payment_action_required, charge.dispute.created), debugging "pending" subscription rows after checkout, or touching referral bonuses / trial extensions / any derived plan date — never adjust a Stripe-owned date at read time, push trial_end to Stripe via extendSubscriptionForReferral in src/server/referral-reward.ts and let the webhook resync; on derived trial dates in src/lib/plans.ts assert the observable expiry, not the intermediate shift. Files: src/lib/stripe.ts (SDK wrapper), src/app/api/stripe/ (webhook + checkout/portal), src/server/billing-actions.ts. For the AdE stale-pending recovery see the ade-integration skill.
---

# stripe-webhooks — Stripe API version, webhook events, recovery patterns

## API version `2026-07-29.dahlia` — breaking changes

SDK: `stripe` npm v22.x.

- `Invoice.subscription` **rimosso** →
  `invoice.parent?.subscription_details?.subscription`
- `Subscription.current_period_end` **spostato** a livello item →
  `subscription.items.data[0]?.current_period_end`
- Non usare `!` (non-null assertion) su `process.env.STRIPE_WEBHOOK_SECRET` —
  aggiungere guard esplicito (`if (!secret) return 500`) per evitare SonarCloud
  code smell

### Bump della SDK → la versione pinnata va aggiornata nello stesso PR

`stripe-node` tipa `apiVersion` come il **literal della sola versione più
recente** (`Stripe.API_VERSION`), non come union storica: ogni minor della SDK
che sposta il pin rompe `npm run type-check` con

```
src/lib/stripe.ts(48,7): error TS2322: Type '"<vecchia>.dahlia"' is not
assignable to type '"<nuova>.dahlia"'.
```

Non è un errore da aggirare con un cast: allineare il pin è il fix. Workflow —

1. Leggere `node_modules/stripe/CHANGELOG.md` (voce della nuova minor): elenca
   in chiaro i **Remove support for** della nuova API version. Verificare con
   grep che nessuno tocchi la nostra surface (Checkout Session, Subscription,
   Invoice, Customer, BillingPortal); il resto è additivo.
2. Aggiornare `STRIPE_API_VERSION` in `src/lib/stripe.ts`.
3. Aggiornare la stringa **ovunque** — è citata in 5 punti:
   `src/lib/stripe.ts`, `src/lib/stripe.test.ts` (assert esatto), il commento in
   `src/server/referral-reward.ts`, `CLAUDE.md` (stack + sezione Stripe),
   `docs/architecture/data-flows.md` e questa skill.
   Check: `grep -rn "dahlia" src/ CLAUDE.md docs/ .claude/skills/`.

Il pin in codice vale solo per le **richieste in uscita**: gli endpoint webhook
mantengono la versione con cui sono stati creati in dashboard, quindi il bump
non cambia il payload degli eventi in arrivo (nessuna azione lato Stripe).

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
| `invoice.paid`                    | Registrato/deduplicato, **nessuna scrittura** (vedi sotto)   |
| `invoice.payment_failed`          | Imposta status `past_due`                                    |
| `invoice.payment_action_required` | 3D Secure / SCA obbligatorio in EU (PSD2)                    |
| `charge.dispute.created`          | Alert chargeback con `critical: true` — nessuna scrittura DB |

**NON serve registrare:**

- `customer.subscription.created` — coperto da `checkout.session.completed`
- `payment_intent.*` — coperti dagli eventi `invoice.*`
- `customer.subscription.paused/resumed` — feature non usata

### Ordering: Stripe non garantisce l'ordine di consegna

Un evento consegnato in ritardo (retry fino a 3 giorni, consegne concorrenti)
può riportare in DB uno stato **già superato**: due `customer.subscription.updated`
ravvicinati — "annulla a fine periodo" poi "riattiva" dal portale — invertiti
lasciano `cancel_at_period_end = true` finché un evento successivo non corregge.
La dedup per `event.id` protegge dai duplicati, **non** dall'ordine.

Guardia: `subscriptions.last_stripe_event_created` è il watermark
`event.created` dell'ultimo evento **full-sync** applicato. `syncSubscriptionData`
e `handleSubscriptionDeleted` aggiungono alla WHERE dell'UPDATE
`isNotOlderThanWatermark(eventCreatedAt)` → `watermark IS NULL OR watermark <= created`;
0 righe ⇒ evento stale ⇒ `logger.warn` `stripe_event_out_of_order` + **200**
(ack, niente retry: l'evento è processato, non fallito).

Tre regole quando tocchi il webhook:

1. **La guardia vive nella WHERE, non in un read-then-write.** Sotto READ
   COMMITTED il secondo UPDATE concorrente si accoda sul row lock e rivaluta la
   condizione sulla riga aggiornata. Un confronto letto in anticipo ha una
   finestra TOCTOU e con due consegne simultanee fa vincere l'ultimo a
   committare — cioè il bug che stai cercando di chiudere.
2. **Gli handler `invoice.*` non toccano il watermark.** Scrivono campi mirati
   (solo `status` via `applySubscriptionUpdate`), non un full-sync: alzare il
   watermark col `created` di un'invoice scarterebbe il
   `customer.subscription.updated` appaiato, che ha spesso un `created` di poco
   precedente. Per lo stesso motivo `invoice.paid` **non scrive**
   `currentPeriodEnd`: `invoice.period_end` è la fine del ciclo appena _chiuso_,
   e il writer unico di quella grandezza è `syncSubscriptionData`.
3. **Il lookup `subRow` precede l'UPDATE full-sync**, per distinguere le due
   cause di "0 righe": riga assente (desync reale → throw, Stripe ritenta) vs
   guardia scattata (evento stale → warn + ack). Invertirli rende un desync
   indistinguibile da un evento vecchio, e finirebbe silenziosamente in un warn.

### Stato "misto" subscription card (pending + trial)

Se dopo un checkout la card mostra "Prova gratuita" + "Abbonamento annuale" +
portale, la riga `subscriptions` è `pending` (webhook non arrivato o fallito).

Verificare:

1. Endpoint registrato su Stripe per quell'ambiente
2. `STRIPE_WEBHOOK_SECRET` corretto
3. Log server per errori di firma

---

## Referral, trial e date derivate (regola 27)

Due trappole emerse insieme nel programma referral (presentato/presentatore).

### (a) Su una data DERIVATA, asserisci l'esito osservabile, non lo shift intermedio

La scadenza trial è `trialStartedAt + TRIAL_DAYS`: per ALLUNGARE il trial lo
start va spostato in **avanti**, non indietro (spostarlo indietro anticipa la
scadenza → il referee risultava "già scaduto" il giorno della registrazione).
Il bug era coperto da un test verde che asseriva proprio lo shift
all'indietro chiamandolo "trial più lungo": **codificava il modello mentale
sbagliato**. TDD (regole 2/4 di `CLAUDE.md`) ti protegge solo se l'`expect`
controlla la grandezza user-facing (`isTrialExpired`, la data mostrata in
`settings/page.tsx`), non il trasformatore intermedio. Helper:
`getPlan`/`fetchPlan` in `src/lib/plans.ts`.

### (b) Una grandezza posseduta da un sistema esterno di verità non si "aggiusta" a read-time

Il mese bonus del referrer veniva sommato a `planExpiresAt` solo dentro
`getPlan`: l'app mostrava +1 mese ma il portale Stripe (e l'addebito reale)
non si spostavano, la divergenza non si riconciliava mai, e il sync
unidirezionale Stripe→DB del webhook la sovrascriveva. Un
bonus/credito/estensione su una grandezza Stripe va **spinto a Stripe**
(`extendSubscriptionForReferral` in `src/server/referral-reward.ts`:
estensione `trial_end`, poi il webhook risincronizza); il
`referral_bonus_days` resta un meccanismo **solo-trial**.

Generalizza la regola 17 (una sola strategia canonica per le grandezze
monetarie — skill `money-rounding`) e le regole 19/20 (degradare, non
divergere). NB: la copy referral vive anche fuori da `(marketing)/` —
`src/components/settings/referral-section.tsx` — quindi va inclusa nel grep
della skill `marketing-content` quando cambiano i termini del bonus.

---

## Stale recovery AdE → skill `ade-integration`

La sezione sul recovery delle mutazioni AdE idempotenti (soglia 30 min
`getStalePendingThresholdMs`, riconciliazione pre-retry via `searchDocuments` +
`reconcileSaleDocument`/`reconcileVoidDocument` — **implementata**, non più
roadmap) è stata spostata nella skill `ade-integration`, dove vive il resto
dell'integrazione AdE. File: `src/lib/services/ade-recovery.ts`.

## Stripe official Skill

https://raw.githubusercontent.com/stripe/ai/refs/heads/main/skills/stripe-best-practices/SKILL.md
