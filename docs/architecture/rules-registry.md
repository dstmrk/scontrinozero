# Registro regole di dominio — indice `regola N` → owner

> Mappa _descrittiva_ per risolvere un `regola N` che trovi citato in un
> commento, un test o una skill. Le regole **sempre-attive** (1, 2, 3, 4, 5, 7,
> 9, 19, 20, 28, 29, 32) stanno per esteso in `CLAUDE.md` e non si ripetono qui:
> servono prima che una skill possa attivarsi. Tutte le altre vivono nella skill
> o nel gate che le possiede — questa è solo la rubrica.
>
> **La numerazione è stabile e non si ricicla.** Il codice cita `regola N` in
> centinaia di punti: un numero non viene mai riassegnato a una regola diversa.
> Quando una regola viene assorbita o superata, la riga resta e lo dichiara.

- **6** — assorbita nella **7**.
- **8** Marketing/SEO: mai promettere feature non live; se cambi
  label/menu/stati/gating aggiorna i contenuti nello stesso task → skill
  `marketing-content`.
- **10** SDK esterni (Stripe, AdE, Resend) in try-catch → log strutturato +
  503, mai un 500 nudo → skill `security-patterns`.
- **11** Migrazioni DB tutte handwritten dopo `0000`; il comando di generazione
  automatica è vietato → hook `.claude/hooks/block-drizzle-generate.sh`, skill
  `db-migrations`.
- **12** CI failure opaco (Sonar/Gitleaks non visibile nel diff): chiedi
  file/riga, no blind fix → skill `sonar-quality-gate`.
- **13** Debug HTTP in produzione: diagnostic logging → riproduci in locale →
  conferma la root cause. Mai mergiare ipotesi → skill `ade-integration`.
- **14** HAR: cross-reference one-by-one di **ogni** request, non solo l'ordine
  → skill `ade-integration`, `HAR.md`.
- **15** Link marketing→app verso `/login` ecc.: `appHref()` + plain `<a>`, mai
  `<Link>`; `appHref()` è server-only → skill `react-patterns`.
- **16** Mock tipati: mai spread di `...args` in un `vi.fn()` a zero argomenti
  (TS2556 rompe `type-check` prima dei test) → skill `testing-patterns`.
- **17** Importi: `round(grossUnitPrice * quantity * 100)` per riga sommato come
  interi, mai per documento; chiave secondaria stabile prima di ogni
  `slice`/topN → skill `money-rounding`.
- **18** Env d'identità: i `NEXT_PUBLIC_*` sono baked al build; un `?? default`
  non scatta su variabile presente ma vuota (`""`) → skill `deploy-release`.
- **21** Una feature di telemetria non è rilasciata finché la sentinella non
  appare in Sentry (~5 min) → skill `deploy-release`, skill `sentry-hygiene`.
- **22** `Sentry.setUser({ id })` su ogni richiesta autenticata — già dentro
  `getAuthenticatedUser`, non aggirarlo; solo UUID, mai email/ip → skill
  `sentry-hygiene`.
- **23** Flow AdE multi-step: `flow: "<slug>"` nel context di
  `logAdeFailure()`, slug stabile o perdi lo storico del group → skill
  `sentry-hygiene`.
- **24** `assertIdentityEnv()` è la prima istruzione di `register()`: in prod un
  valore malformato blocca il boot → skill `deploy-release`.
- **25** Nessun deploy è "concluso" senza i tre curl verdi: live + env + drain →
  skill `deploy-release`.
- **26** Sposti un modulo, cambi un data flow o una soglia → aggiorna la mappa
  in `docs/architecture/` nello stesso PR; il gate è `npm run arch:check` (+
  hook), contratto in `scripts/check-architecture-docs.mjs`.
- **27** Date derivate: asserisci l'esito osservabile, non lo shift; una
  grandezza posseduta da Stripe si aggiusta su Stripe, mai a read-time → skill
  `stripe-webhooks`.
- **30** Config di bundling: sotto Turbopack un plugin webpack-only non gira
  **senza dare errore** — cerca la stringa nei chunk serviti, il sorgente non è
  prova → skill `pwa-serwist`, skill `sentry-hygiene`.
- **31** Mai un `route.ts`/`page.tsx` sotto una cartella `_nome`: private folder
  → 404 ovunque, con i test verdi → guardia
  `src/app/routable-segments.test.ts`.
