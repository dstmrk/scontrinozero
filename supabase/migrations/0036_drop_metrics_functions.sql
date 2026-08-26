-- Migration 0036: elimina le funzioni `metrics_*` del pannello KPI esterno
-- Feature: pannello operatore in-app (/admin), v1.7.8.
--
-- Cinque funzioni plpgsql create a mano sul progetto Supabase di produzione e
-- mai passate da questa cartella: `metrics_kpi`, `metrics_top_merchants`,
-- `metrics_recent_profiles`, `metrics_trial_expiring`, `metrics_paid_users`.
-- Le consumava un solo chiamante, il Worker Cloudflare del repo separato
-- `dstmrk/scontrinozero-dashboard`; nessun call-site in questo repo.
--
-- Perche' si eliminano invece di versionarle. Contenevano una copia della
-- logica di business (durata trial, elenco piani a pagamento, stati documento,
-- somma degli importi) che era gia' divergita dal codice in tre punti misurati:
--
--   1. `trial_started_at + 30 days` secco, ignorando `referral_bonus_days`:
--      dichiarava scaduta la prova di chi aveva un bonus referral, mentre
--      l'app gliela teneva aperta;
--   2. incasso come `sum(quantity * gross_unit_price)`, formula precedente
--      alla 0034: ogni riga scontata contava per il prezzo di listino;
--   3. `ACCEPTED` e `VOID_ACCEPTED` sommati nello stesso incasso, mentre
--      l'app esclude gli annullati.
--
-- Versionarle avrebbe congelato le tre copie invece di rimuoverle. Le stesse
-- letture ora vivono in `src/server/admin-metrics.ts` e
-- `src/server/admin-directory.ts`, che derivano quelle grandezze dalle
-- costanti dell'app (`TRIAL_DAYS`, `PAID_SELF_SERVICE_PLANS`) e dal canone
-- monetario di `src/lib/receipts/receipt-totals.ts`.
--
-- ⚠️ Effetto collaterale atteso e accettato: il Worker della dashboard esterna
-- smette di funzionare (`/api/*` risponde 500 su ogni rotta tranne `/health`).
-- Quel pannello e' sostituito da `/admin` e il suo repo va archiviato.
--
-- `IF EXISTS` perche' la migrazione deve applicarsi anche dove le funzioni non
-- sono mai state create: sandbox, dev sul Raspberry Pi, ogni installazione
-- self-hosted, e qualunque DB ricreato da zero. La firma completa e'
-- obbligatoria: `DROP FUNCTION` senza argomenti fallisce se esistono overload,
-- e serve comunque a documentare quali funzioni si stanno rimuovendo.
--
-- Per ricrearle: `supabase/dashboard-functions.sql` nel repo
-- `dstmrk/scontrinozero-dashboard`, alla revisione a9e484b.

DROP FUNCTION IF EXISTS public.metrics_kpi(timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.metrics_top_merchants(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.metrics_recent_profiles(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.metrics_trial_expiring();
DROP FUNCTION IF EXISTS public.metrics_paid_users();
