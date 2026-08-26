import { sql } from "drizzle-orm";

import { withStatementTimeout } from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { PAID_SELF_SERVICE_PLANS, TRIAL_DAYS } from "@/lib/plans";
import {
  ADMIN_QUERY_TIMEOUT_MS,
  type RawRow,
  lineCentsSql,
  toNullableText,
  toNumber,
  toRows,
  toText,
} from "./admin-sql";
import { type AnalyticsRange, rangeToBounds } from "./analytics-helpers";

/**
 * Elenchi del pannello operatore (`/admin`) — le quattro tabelle che affiancano
 * i KPI di `admin-metrics.ts`: classifiche esercenti, ultimi registrati, trial
 * in scadenza, utenti paganti.
 *
 * Separato da `admin-metrics.ts` perché la natura del dato è diversa: qui ogni
 * riga porta **nome ed email di una persona**. Tenerlo distinto rende esplicito
 * dove il pannello tocca dati personali, e dove no. Nessuno di questi valori
 * finisce mai in un log o in Sentry: sui fallimenti si logga solo `errorClass`
 * e il range (denylist telemetria di `src/lib/logger.ts`).
 *
 * Server-only come il gemello: nessun `"use server"`, nessun endpoint RPC,
 * l'unica via d'accesso è la RSC dietro il gate del layout.
 *
 * Sostituisce `metrics_top_merchants`, `metrics_recent_profiles`,
 * `metrics_trial_expiring` e `metrics_paid_users`, le funzioni plpgsql
 * eliminate da `supabase/migrations/0036_drop_metrics_functions.sql` — che
 * documenta anche i tre punti in cui erano divergite dal codice.
 */

export type AdminMerchant = {
  readonly businessId: string;
  readonly businessName: string | null;
  readonly ownerName: string | null;
  /** "Milano (MI)" — città e provincia, quando ci sono. */
  readonly location: string | null;
  readonly email: string;
  readonly receipts: number;
  readonly revenueCents: number;
};

export type AdminProfileRow = {
  readonly name: string | null;
  readonly email: string;
  /** ISO 8601 — `json_build_object` serializza i timestamptz come stringa. */
  readonly createdAt: string;
};

export type AdminTrialRow = {
  readonly name: string | null;
  readonly email: string;
  /** ISO 8601. Scadenza DERIVATA: start + bonus referral + TRIAL_DAYS. */
  readonly trialExpiresAt: string;
};

export type AdminPaidUserRow = {
  readonly name: string | null;
  readonly email: string;
  readonly plan: string;
  /** ISO 8601, o null quando il piano è stato messo a mano (nessun abbonamento). */
  readonly planActivatedAt: string | null;
};

export type AdminDirectory = {
  readonly topByReceipts: readonly AdminMerchant[];
  readonly topByRevenue: readonly AdminMerchant[];
  readonly recentProfiles: readonly AdminProfileRow[];
  readonly trialExpiring: readonly AdminTrialRow[];
  readonly paidUsers: readonly AdminPaidUserRow[];
};

export type AdminDirectoryResult =
  { directory: AdminDirectory } | { error: string };

const LOAD_ERROR =
  "Impossibile caricare gli elenchi. Riprova tra qualche istante.";

/** Quanti esercenti mostrare in ciascuna delle due classifiche. */
const TOP_MERCHANTS = 5;

/** Tetto delle tabelle-elenco: oltre non è più una tabella, è un export. */
const LIST_LIMIT = 50;
const PAID_USERS_LIMIT = 100;

/**
 * Ampiezza della finestra "trial in scadenza", in giorni **prima e dopo**
 * adesso: si vogliono vedere sia le prove che stanno per finire sia quelle
 * finite da poco, che sono il momento utile per intervenire.
 */
const TRIAL_WINDOW_DAYS = 7;

/**
 * Scadenza trial come la calcola l'app: `trial_started_at` traslato in avanti
 * dei giorni bonus referral, più `TRIAL_DAYS`.
 *
 * Gemello SQL di `trialStartWithReferralBonus` + `isTrialExpired`
 * (`src/lib/plans-shared.ts`). La funzione plpgsql che questo codice sostituisce
 * usava `trial_started_at + 30 days` secco, e mostrava come scaduta la prova di
 * chiunque avesse un bonus referral — mentre l'app gliela teneva aperta.
 * Assume le righe `profiles` aliasate `p`.
 */
const trialExpiresAtSql = sql`(
  p.trial_started_at
  + make_interval(days => p.referral_bonus_days)
  + make_interval(days => ${TRIAL_DAYS})
)`;

/** Nome completo, o NULL se il profilo non ne ha uno utilizzabile. */
const fullNameSql = sql`nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')`;

/** Elenco dei piani acquistabili, come lista di parametri per un `IN`. */
const paidPlansSql = sql.join(
  PAID_SELF_SERVICE_PLANS.map((plan) => sql`${plan}`),
  sql`, `,
);

function mapMerchant(row: RawRow): AdminMerchant {
  return {
    businessId: toText(row.business_id),
    businessName: toNullableText(row.business_name),
    ownerName: toNullableText(row.owner_name),
    location: toNullableText(row.location),
    email: toText(row.email),
    receipts: toNumber(row.receipts),
    revenueCents: toNumber(row.revenue_cents),
  };
}

/**
 * Elenchi del pannello operatore per il range dato.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19). Le quattro
 * query girano in una sola transazione: condividono budget di timeout e
 * snapshot, così le classifiche non contraddicono i KPI mostrati accanto.
 *
 * `reference` è iniettabile per i test — in produzione è sempre "adesso".
 */
export async function getAdminDirectory(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminDirectoryResult> {
  const { from, to } = rangeToBounds(range, reference);
  // Date legate come ISO string + cast esplicito: un oggetto Date passato a un
  // template sql`` viene serializzato in una forma che Postgres non riconosce
  // come timestamptz (skill db-migrations).
  const rangeStart = sql`${from.toISOString()}::timestamptz`;
  const rangeEnd = sql`${to.toISOString()}::timestamptz`;

  try {
    const [merchantsRow, profilesRow, trialsRow, paidRow] =
      await withStatementTimeout(ADMIN_QUERY_TIMEOUT_MS, async (tx) => {
        const [merchants] = (await tx.execute(sql`
      WITH agg AS (
        -- Solo SALE ACCEPTED, come i KPI: uno scontrino annullato non è
        -- fatturato dell'esercente. count(DISTINCT) perché il join sulle righe
        -- moltiplica i documenti.
        SELECT
          cd.business_id                                   AS business_id,
          count(DISTINCT cd.id)::bigint                    AS receipts,
          coalesce(sum(${lineCentsSql}), 0)::bigint        AS revenue_cents
        FROM commercial_documents cd
        LEFT JOIN commercial_document_lines l ON l.document_id = cd.id
        WHERE cd.kind = 'SALE'
          AND cd.status = 'ACCEPTED'
          AND cd.created_at >= ${rangeStart}
          AND cd.created_at <  ${rangeEnd}
        GROUP BY cd.business_id
      ),
      merchants AS (
        SELECT
          a.business_id,
          b.business_name,
          ${fullNameSql} AS owner_name,
          nullif(
            trim(concat_ws(' ',
              nullif(b.city, ''),
              nullif(
                CASE WHEN nullif(b.province, '') IS NOT NULL
                  THEN '(' || b.province || ')'
                END,
              '')
            )),
            ''
          ) AS location,
          p.email,
          a.receipts,
          a.revenue_cents
        FROM agg a
        JOIN businesses b ON b.id = a.business_id
        JOIN profiles   p ON p.id = b.profile_id
      )
      SELECT
        (
          -- business_id come ultima chiave di ordinamento: senza, due esercenti
          -- a pari scontrini e pari incasso si scambiano di posto fra un
          -- refresh e l'altro (skill money-rounding, ordini deterministici).
          SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.receipts DESC, t.revenue_cents DESC, t.business_id), '[]'::json)
          FROM (
            SELECT * FROM merchants
            ORDER BY receipts DESC, revenue_cents DESC, business_id
            LIMIT ${TOP_MERCHANTS}
          ) t
        ) AS by_receipts,
        (
          SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.revenue_cents DESC, t.receipts DESC, t.business_id), '[]'::json)
          FROM (
            SELECT * FROM merchants
            ORDER BY revenue_cents DESC, receipts DESC, business_id
            LIMIT ${TOP_MERCHANTS}
          ) t
        ) AS by_revenue
    `)) as unknown as RawRow[];

        const [profiles] = (await tx.execute(sql`
      SELECT coalesce(
        json_agg(
          json_build_object('name', name, 'email', email, 'created_at', created_at)
          ORDER BY created_at DESC
        ),
        '[]'::json
      ) AS rows
      FROM (
        SELECT ${fullNameSql} AS name, p.email AS email, p.created_at AS created_at
        FROM profiles p
        WHERE p.created_at >= ${rangeStart}
          AND p.created_at <  ${rangeEnd}
        ORDER BY p.created_at DESC
        LIMIT ${LIST_LIMIT}
      ) t
    `)) as unknown as RawRow[];

        const [trials] = (await tx.execute(sql`
      SELECT coalesce(
        json_agg(
          json_build_object('name', name, 'email', email, 'trial_expires_at', trial_expires_at)
          ORDER BY trial_expires_at ASC
        ),
        '[]'::json
      ) AS rows
      FROM (
        -- Finestra ancorata ad ADESSO, non al range selezionato: la domanda
        -- "chi devo richiamare questa settimana" non dipende dal periodo che
        -- stai guardando nelle card.
        SELECT
          ${fullNameSql}          AS name,
          p.email                 AS email,
          ${trialExpiresAtSql}    AS trial_expires_at
        FROM profiles p
        WHERE p.plan = 'trial'
          AND p.trial_started_at IS NOT NULL
          AND ${trialExpiresAtSql} >= now() - make_interval(days => ${TRIAL_WINDOW_DAYS})
          AND ${trialExpiresAtSql} <= now() + make_interval(days => ${TRIAL_WINDOW_DAYS})
        ORDER BY trial_expires_at ASC
        LIMIT ${LIST_LIMIT}
      ) t
    `)) as unknown as RawRow[];

        const [paid] = (await tx.execute(sql`
      SELECT coalesce(
        json_agg(
          json_build_object('name', name, 'email', email, 'plan', plan, 'plan_activated_at', plan_activated_at)
          ORDER BY plan_activated_at DESC NULLS LAST
        ),
        '[]'::json
      ) AS rows
      FROM (
        SELECT
          ${fullNameSql} AS name,
          p.email        AS email,
          p.plan         AS plan,
          -- "Paga dal": lo schema non registra l'inizio del periodo pagato, e
          -- va derivato. Il webhook Stripe, quando un pagamento riesce, scrive
          -- plan + plan_expires_at (la FINE del periodo), quindi l'inizio è
          -- quella data meno un intervallo di fatturazione.
          --
          -- Alternative scartate (verificate in produzione):
          --   subscriptions.created_at — è il checkout, che può precedere il
          --     primo pagamento di un intero trial;
          --   subscriptions.current_period_end — non risincronizzato in modo
          --     affidabile a ogni pagamento;
          --   profiles.updated_at — si muove a ogni modifica del profilo.
          --
          -- È l'inizio del periodo CORRENTE: al primo rinnovo avanza di un
          -- anno. Risponde a "paga da quando, per questo periodo", non a
          -- "primo pagamento in assoluto" — che nessuna colonna registra.
          --
          -- Join su auth_user_id: subscriptions.user_id è l'id di auth.users,
          -- non profiles.id. La riga è al più una (user_id è UNIQUE).
          (
            SELECT p.plan_expires_at - CASE s.interval
                     WHEN 'year'  THEN interval '1 year'
                     WHEN 'month' THEN interval '1 month'
                   END
            FROM subscriptions s
            WHERE s.user_id = p.auth_user_id
          ) AS plan_activated_at
        FROM profiles p
        WHERE p.plan IN (${paidPlansSql})
        ORDER BY plan_activated_at DESC NULLS LAST, p.created_at DESC
        LIMIT ${PAID_USERS_LIMIT}
      ) t
    `)) as unknown as RawRow[];

        return [merchants, profiles, trials, paid] as const;
      });

    if (!merchantsRow || !profilesRow || !trialsRow || !paidRow) {
      logger.warn(
        { errorClass: "admin_directory_load", range },
        "admin directory: query senza righe",
      );
      return { error: LOAD_ERROR };
    }

    return {
      directory: {
        topByReceipts: toRows(merchantsRow.by_receipts).map(mapMerchant),
        topByRevenue: toRows(merchantsRow.by_revenue).map(mapMerchant),
        recentProfiles: toRows(profilesRow.rows).map((row) => ({
          name: toNullableText(row.name),
          email: toText(row.email),
          createdAt: toText(row.created_at),
        })),
        trialExpiring: toRows(trialsRow.rows).map((row) => ({
          name: toNullableText(row.name),
          email: toText(row.email),
          trialExpiresAt: toText(row.trial_expires_at),
        })),
        paidUsers: toRows(paidRow.rows).map((row) => ({
          name: toNullableText(row.name),
          email: toText(row.email),
          plan: toText(row.plan),
          planActivatedAt: toNullableText(row.plan_activated_at),
        })),
      },
    };
  } catch {
    // L'errore NON viene loggato: un messaggio Postgres può contenere il valore
    // che ha fatto fallire la query, e qui quei valori sono email e nomi.
    logger.warn(
      { errorClass: "admin_directory_load", range },
      "admin directory: query fallita",
    );
    return { error: LOAD_ERROR };
  }
}
