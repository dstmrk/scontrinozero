# UPSTREAM — copia vendorizzata

| | |
| --- | --- |
| Origine | https://github.com/cloudflare/security-audit-skill (`skills/security-audit/`) |
| Commit | `c1c8a8c` (14 set 2026, "Clarify guidance and full audit modes") |
| Licenza | MIT, Cloudflare, Inc. — testo in `LICENSE` |

## Cosa è identico all'upstream

Tutti i file di questa directory tranne i due sotto. Non si modificano a mano:
una correzione utile si apre come PR upstream, una locale va in
`SCONTRINOZERO.md`.

## Deviazioni locali (le uniche)

1. `SKILL.md`: la `description` del frontmatter è ristretta ad audit e pen-test
   espliciti (l'originale copriva anche "security questions" e avrebbe
   sovrapposto `security-patterns`) e una riga sotto il titolo rimanda a
   `SCONTRINOZERO.md`.
2. Non sono copiati `validate-findings.test.cjs` e
   `validate-coverage-ledger.test.cjs`: sono test dell'upstream, non nostri, e
   ESLint/Prettier/Sonar non devono vederli. Per verificare la copia dei
   validator, esegui `node --test` nella directory dell'upstream.

`SCONTRINOZERO.md` e questo file sono nostri e non esistono upstream.

## Aggiornare

1. Clona l'upstream e leggi `git log` dal commit pinnato.
2. Sovrascrivi i file (non i due nostri), riapplica la deviazione 1.
3. `node --test` nell'upstream, poi un `node validate-findings.cjs` su un
   `findings.json` di prova.
4. Aggiorna il commit in questa tabella.
