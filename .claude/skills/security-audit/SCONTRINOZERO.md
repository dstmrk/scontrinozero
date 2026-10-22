# SCONTRINOZERO — strato locale

Letto prima di `SKILL.md` a ogni run. Dove contraddice l'upstream, vince questo
file. Non sostituisce `security-patterns`: quella dice _come si scrive_ un
boundary, questa dice _come si cerca_ dove un boundary manca.

## Quando

Solo su richiesta esplicita dell'utente (regola 33: un audit non è un'attività
che si avvia di propria iniziativa, e costa decine di invocazioni di agente).
Senza richiesta, `SKILL.md` resta in modalità guidance: nessuna directory di
output, nessun file.

## Parametri della run

- **Profilo**: `standard`, con scope per sottosistema (tabella sotto). Un audit
  dell'intero repo in una sola run è `deep` e va chiesto per nome.
- **Budget**: fissalo prima della recon e riportalo all'utente (campo `budget`
  di `run-metadata.json`). Senza budget dichiarato, proponi un numero e aspetta.
- **Output**: fuori dal repo, `~/security-audit-skill/scontrinozero/run-<N>`
  (default upstream). Mai dentro `/home/user/scontrinozero`: `REPORT.md` e
  `findings.json` non sono documentazione del progetto.
- **Esecuzione di codice**: la sessione cloud non ha un sandbox OS-enforced
  verificato, quindi l'audit è source-only. Ciò che richiede di eseguire codice
  resta `needs_validation` con il piano di verifica, come prevede `SKILL.md`.
  Mai sonde su `scontrinozero.it`, sandbox o dev, né su AdE, Stripe, Supabase.

## Companion

Tutti presenti per i riferimenti incrociati dell'upstream. Selezionati per la
recon: `WEB-PROTOCOL-AND-AUTH`, `CLIENT-SIDE`, `DATA-ISOLATION-AND-LIFECYCLE`,
`PROTOCOLS-RPC-AND-MESSAGING` (webhook Stripe), `RESOURCE-EXHAUSTION-AND-AVAILABILITY`,
`SUPPLY-CHAIN-AND-RELEASE`, `CLOUD-AND-DEPLOYMENT`, `DESKTOP-MOBILE-AND-LOCAL-IPC`
(Capacitor in `mobile/`). Non selezionati: `MEMORY-SAFETY-AND-BINARY` (nessun
codice nativo nostro), `AI-AND-LLM` (l'app non invoca LLM; il workflow
`anthropics/claude-code-action` in CI cade semmai sotto `SUPPLY-CHAIN`).

## Superficie da cui parte la recon

Punti di partenza, non una checklist: la recon li verifica sul codice.
`docs/architecture/INDEX.md` resta la mappa.

| Sottosistema        | Boundary da attaccare                                                                      | Dove                                              |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Isolamento tenant   | Ogni query/azione filtra per business/profilo dell'utente autenticato; RLS Supabase        | `src/server/*-actions.ts`, `src/db/`, `supabase/` |
| Developer API       | Chiavi `szk_*`, scope live vs mgmt, UUID e body-size al boundary, rate limit               | `src/app/api/v1/`, `src/lib/api-auth.ts`, `api-keys.ts` |
| Credenziali AdE     | Cifratura a riposo, rotazione `ENCRYPTION_KEY`, `key_version` per riga, log redaction      | `src/lib/crypto.ts`, `src/lib/ade/`               |
| Billing             | Firma e idempotenza dei webhook, plan-gate lato server, referral/trial                     | `src/app/api/stripe/`, `src/lib/plans.ts`         |
| Auth e anti-abuso   | Enumerazione account, Turnstile (hostname allowlist), redirect param, `CF-Connecting-IP`   | `src/server/auth-actions.ts`, `src/lib/get-client-ip.ts` |
| Link pubblici       | Scontrini `/r/<uuid>` senza TTL (rischio già accettato, vedi sotto)                        | `src/app/r/`                                      |
| Export e documenti  | CSV injection, accesso a documenti altrui, PDF                                             | `src/app/api/export/`, `src/app/api/documents/`   |
| Header e CSP        | CSP, report endpoint, header di sicurezza                                                  | `src/lib/security-headers.ts`, `src/lib/csp.ts`, `src/app/api/csp-report/` |
| Supply chain e CI   | Workflow GitHub, immagini Docker, deploy sul VPS/Raspberry                                 | `.github/`, `Dockerfile`, `deploy/`               |
| App nativa          | Webview Capacitor, deep link, target server                                                | `mobile/`                                         |

## Rischi già accettati

Prima di dare a un hunter il perimetro, passagli l'elenco delle voci di
`docs/architecture/accepted-risks.md`: sono "decisioni già prese", non finding.
Un candidato che coincide con una voce si scarta citando la voce, a meno che il
**trigger di riapertura** scritto nella voce sia scattato — in quel caso è un
finding e la voce esce dal file (stessa regola del file).

## Consegna dei finding (regola 33)

Il formato dell'upstream (`findings.json` validato) resta il lavoro della run.
Poi, nel repo:

| Verdetto upstream      | Cosa succede                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `confirmed`            | Un'issue GitHub per fingerprint, corpo nel formato della skill `decision-ledger`, label `P1`-`P3` e `security`. **Mai `ready`.** |
| `needs_validation`     | Un'issue sola per run con l'elenco, senza severità. Non diventa codice finché il fatto mancante non è risolto. |
| `rejected`             | Resta nel report della run. Una scelta consapevole entra in `accepted-risks.md` con trigger.   |

Mappa severità → priorità: `critical`/`high` → `P1`, `medium` → `P2`,
`low`/`informational` → `P3`. Prima di aprire un'issue: ricerca fra le aperte e
in `accepted-risks.md`. Il corpo dell'issue non cita payload di exploit né
valori di segreti; le issue del repo sono pubbliche. Un finding di sicurezza
con impatto reale su produzione si segnala all'utente in chat **prima** di
metterlo in un'issue pubblica.

L'audit non modifica codice (principio dell'upstream). I fix sono PR separate,
una per issue, con test di regressione (regola 2).

## Cosa porta l'utente a fine run

Report breve in chat: profilo, scope, budget speso e residuo, copertura
dichiarata (mai "il resto è sicuro"), numero di record per verdetto, link alle
issue. Il percorso della directory di output, non i file.
