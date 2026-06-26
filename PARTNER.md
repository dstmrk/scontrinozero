# PARTNER.md — Programma Partner (approccio leggero)

Guida operativa per onboardare un **partner/reseller**. Il programma è
volutamente minimale: **nessun codice dedicato, nessun motore di attribuzione
nuovo**. Si appoggia al sistema referral esistente più una tabella di mapping
per il branding del subdomain.

## Cosa ottiene un partner

1. **Piano `unlimited`** sul proprio account (tutte le feature, nessuna
   scadenza). Assegnazione manuale.
2. **Attribuzione dei "suoi" utenti** tramite il proprio **referral code**
   (ogni profilo ne ha già uno, `profiles.referral_code`): chi si registra con
   quel codice finisce in `referral_redemptions` con `referrer_id` = il partner.
   Il conteggio è una semplice query (sotto).
3. **(Opzionale) Subdomain ad-hoc** `<slug>-app.<dominio-app>` (es.
   `nds-app.scontrinozero.it`). L'unica differenza visiva è un **testo statico**
   accanto al logo (es. "x NDS"), deciso da noi. Sul subdomain la registrazione
   è **vincolata al codice del partner** (force + lock).

## Come funziona nel codice

- Risoluzione hostname → partner: `src/lib/partners/partner-host.ts`
  (`extractPartnerSlug`) e `src/lib/partners/partner-context.ts`
  (`getPartnerContext`, `getPartnerBySlug`).
- Testo accanto al logo: `src/components/partner-brand-suffix.tsx`, montato in
  `src/app/dashboard/layout.tsx` e `src/app/(auth)/layout.tsx`.
- Force + lock + enforcement registrazione: `src/app/(auth)/register/register-form.tsx`
  (campo bloccato) e `src/server/auth-actions.ts` (`enforcePartnerReferral`,
  più l'estensione dell'allowlist Turnstile ai subdomain partner).
- Tabella: `src/db/schema/partners.ts` / `supabase/migrations/0022_partners.sql`.

La mappa `partners` lega `slug` → `label` → `referrer_profile_id` (il profilo
del partner). Il referral code si risolve via join a `profiles.referral_code`
(single source of truth, niente denormalizzazione).

---

## Onboarding di un nuovo partner (ops manuali)

> Sostituisci `<slug>`, `<label>`, `<partner-email>`, `<profile-uuid>`,
> `<dominio-app>` con i valori reali. Lo `slug` è una **singola label hostname**
> (minuscolo, `[a-z0-9-]`, niente punti), es. `nds`.

### 1. Crea l'account partner e assegna `unlimited`

Il partner si registra normalmente (o lo crei tu). Poi:

```sql
-- Recupera id e referral code del partner
SELECT id, referral_code FROM profiles WHERE email = '<partner-email>';

-- Concedi il piano unlimited (manuale, come per gli unlimited invite-only)
UPDATE profiles SET plan = 'unlimited' WHERE email = '<partner-email>';
```

Annota `id` (= `<profile-uuid>`) e `referral_code` (= il codice da distribuire).

### 2. (Solo se vuoi il subdomain) Inserisci la riga `partners`

```sql
INSERT INTO partners (slug, label, referrer_profile_id)
VALUES ('<slug>', '<label>', '<profile-uuid>');
```

`label` è il testo mostrato accanto al logo (es. `x NDS`). Per **disattivare**
un subdomain senza cancellare la storia: `UPDATE partners SET active = false
WHERE slug = '<slug>';`.

### 3. (Solo subdomain) Routing Cloudflare

Il container è unico: tutti i subdomain puntano allo stesso backend. Per ogni
partner:

1. **DNS**: crea `<slug>-app.<dominio-app>` come CNAME verso il Cloudflare
   Tunnel (`cloudflared tunnel route dns <TUNNEL> <slug>-app.<dominio-app>`).
2. **Ingress** del tunnel: aggiungi una regola
   `<slug>-app.<dominio-app> → http://localhost:3000` (stesso target di
   `app.<dominio-app>`).
3. **Turnstile**: verifica che il **widget Turnstile di produzione** ammetta i
   subdomain partner. Lato applicativo l'allowlist è già dinamica
   (`isAcceptedTurnstileHostname` accetta i subdomain partner attivi), ma il
   widget su Cloudflare deve a sua volta consentire l'hostname, altrimenti
   `siteverify` rifiuta il token (`captcha_hostname_mismatch`).

### 4. Consegna al partner

- **Con subdomain**: il partner manda i suoi utenti su
  `https://<slug>-app.<dominio-app>/register`. Il codice referral è già
  applicato e bloccato; ogni iscrizione valida è attribuita al partner.
- **Senza subdomain**: il partner distribuisce il link referral standard
  `https://app.<dominio-app>/register?rcode=<referral_code>`.

---

## Comportamento della registrazione sul subdomain (force + lock)

- Il campo referral è **pre-compilato e bloccato** sul codice del partner.
- Il server **rifiuta** ogni registrazione sul subdomain il cui codice ≠ codice
  del partner (`enforcePartnerReferral`): garanzia contro tampering/direct-POST.
- Il dominio principale `app.<dominio-app>` resta invariato: `?rcode=` opzionale.

**Limiti accettati (best-effort):**

- Il testo "x NDS" **non** sopravvive ai redirect cross-origin: i link nelle
  email (conferma, reset password) e il return da Stripe portano al dominio
  canonico `app.<dominio-app>`, dove il testo non viene mostrato.
- Chi raggiunge l'URL del subdomain (non linkato, `noindex`) e si registra
  conta come utente del partner: il subdomain **è** il confine di attribuzione
  (il referral code non è un segreto per-utente).

---

## Reporting: quanti utenti ha portato un partner

```sql
-- Totale iscrizioni attribuite al partner + quante hanno completato la
-- verifica P.IVA (rewarded_at valorizzato = "convertite").
SELECT
  COUNT(*)                                   AS signups_totali,
  COUNT(*) FILTER (WHERE rr.rewarded_at IS NOT NULL) AS verificate
FROM referral_redemptions rr
JOIN partners p ON p.referrer_profile_id = rr.referrer_id
WHERE p.slug = '<slug>';
```

Senza subdomain (partner identificato solo dal referral code):

```sql
SELECT COUNT(*) FROM referral_redemptions rr
JOIN profiles pr ON pr.id = rr.referrer_id
WHERE pr.email = '<partner-email>';
```

---

## Note ambiente

- **Dev** (`app-dev.<dominio>`): un partner dev è `<slug>-app-dev.<dominio>`;
  `extractPartnerSlug` lo gestisce automaticamente perché deriva l'app hostname
  dall'env (`APP_HOSTNAME` / `NEXT_PUBLIC_APP_HOSTNAME`).
- **Offboarding**: `UPDATE partners SET active = false …` disattiva il subdomain
  branding e l'enforcement; per togliere le feature, riporta il piano del
  partner da `unlimited` al piano dovuto.

---

## Perché non codici monouso per-partner

La spec originale (v1.4.0) prevedeva un modello più sofisticato: **codici
monouso** con prefisso per-partner (`<partner>_<univoco>`), tabella
`partner_codes`, claim atomico race-safe al signup, più script di
generazione/billing/sospensione. È stata **deliberatamente scartata** a favore
dell'approccio leggero qui documentato.

Motivi:

- **Zero nuovo gating, zero nuovi script**: riusa il sistema referral esistente
  e il piano `unlimited` già pronto, invece di una tabella + 3 script admin da
  scrivere e testare.
- **Fatturazione wholesale fuori dal codice**: il prezzo all'ingrosso, il
  prepagato e la sospensione per insoluto restano un **accordo contrattuale** col
  partner, non logica applicativa da mantenere.
- **Superficie minima** (principio guida del progetto): meno codice = meno bug.

Da riconsiderare **solo** se emerge una necessità reale di attribuzione monouso
anti-leak (codici che non possono circolare) o di automazione
billing/sospensione lato piattaforma.
