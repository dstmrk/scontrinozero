# Mappa codebase — Config manifest

> Indice _puntatore_ di soglie/limiti/gate. **Non ricopia i valori** che
> diverrebbero divergenti: indica la **fonte di verità** (il file/costante) così
> resta un solo posto da cambiare. Quando aggiungi una soglia, aggiungi qui la
> riga puntatore, non il valore duplicato.

| Cosa                                                                     | Fonte di verità                                                                           | Note                                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Soglie rate-limit per server action (emit/void/pdf/checkout/portal/auth) | `src/lib/rate-limit.ts`                                                                   | Valori consolidati elencati nella skill `testing-patterns`                        |
| IP del client (dietro Cloudflare)                                        | `src/lib/get-client-ip.ts`                                                                | `CF-Connecting-IP`, skill `security-patterns`                                     |
| Prezzi e feature gate per piano                                          | `src/lib/plans.ts`, `src/lib/plans-shared.ts`                                             | Tabella Pricing anche in `CLAUDE.md`                                              |
| Limiti mensili Developer API                                             | `src/lib/plans-shared.ts` (`DEVELOPER_MONTHLY_LIMITS`)                                    | Definiti ma non ancora applicati — vedi `REVIEW.md`                               |
| Soglia stale-pending (recovery AdE)                                      | `src/lib/services/ade-recovery.ts`                                                        | Dettaglio nella skill `stripe-webhooks`                                           |
| Idempotency / request hash                                               | `src/lib/services/request-hash.ts`                                                        | Riuso chiave con payload diverso → mismatch esplicito                             |
| Aritmetica monetaria (cents per-riga)                                    | `src/lib/receipts/document-lines.ts`                                                      | Canonica ovunque (CLAUDE.md regola 17)                                            |
| Soglia lotteria (€1,00)                                                  | `src/lib/receipts/document-lines.ts`, `src/lib/receipts/lottery-code-schema.ts`           | Calcolata sui totali per-riga                                                     |
| Env d'identità (URL/hostname)                                            | `src/lib/identity-env.ts`, `src/lib/hostname-env.ts`                                      | Fail-fast al boot (regola 24)                                                     |
| Versione T&C corrente                                                    | `src/server/auth-actions.ts` (`CURRENT_TERMS_VERSION`)                                    | Procedura aggiornamento in `CLAUDE.md`                                            |
| CSP / security headers                                                   | `src/lib/csp.ts`, `src/lib/security-headers.ts`                                           | —                                                                                 |
| Limiti lunghezza/valore campi (business, righe, catalogo, email)         | `src/lib/validation.ts` (`BUSINESS_PROFILE_LIMITS`), `src/lib/receipts/receipt-schema.ts` | Zod = SoT; mirror DB CHECK in `supabase/migrations/0019_db_check_constraints.sql` |
| Chiave/secret Turnstile per ambiente                                     | `src/components/turnstile-widget.tsx`                                                     | `NEXT_PUBLIC_*` baked al build (CLAUDE.md, sezione Deploy)                        |

**Trial:** 30 giorni Starter/Pro, senza carta — gate in `src/lib/plans.ts`,
copy/dettagli in `CLAUDE.md` (sezione Pricing).
