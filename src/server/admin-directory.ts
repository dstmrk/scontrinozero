import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { PAID_SELF_SERVICE_PLANS, TRIAL_DAYS } from "@/lib/plans";
import {
  type RawRow,
  adminRangeParams,
  lineCentsSql,
  runAdminRead,
  toNullableText,
  toNumber,
  toRows,
  toText,
} from "./admin-sql";
import type { AnalyticsRange } from "./analytics-helpers";

/**
 * Elenchi del pannello operatore (`/admin`) — le cinque tabelle che affiancano
 * i KPI di `admin-metrics.ts`: classifiche esercenti, trial in scadenza,
 * utenti paganti, ultimi registrati.
 *
 * Separato da `admin-metrics.ts` perché la natura del dato è diversa: qui ogni
 * riga porta **nome ed email di una persona**. Tenerlo distinto rende esplicito
 * dove il pannello tocca dati personali, e dove no. Nessuno di questi valori
 * finisce mai in un log o in Sentry: sui fallimenti si logga solo `errorClass`
 * e il range (denylist telemetria di `src/lib/logger.ts`).
 *
 * **Quattro letture, non una.** Erano quattro query dentro la stessa
 * transazione, eseguite in sequenza: la pagina aspettava la loro SOMMA. Ora
 * ognuna è una lettura a sé dietro il proprio boundary Suspense, e la sua
 * tabella compare appena quella query è pronta. Le quattro non condividono
 * nessun invariante — sono elenchi distinti, non pezzi di uno stesso totale —
 * quindi lo snapshot condiviso non proteggeva niente che si stia perdendo.
 *
 * Due delle quattro non guardano nemmeno il range: `getAdminTrialExpiring` e
 * `getAdminPaidUsers` sono ancorate ad ADESSO, e infatti non prendono più un
 * parametro `range` che ignoravano.
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

/** Le due classifiche escono dalla stessa query: si ordinano sullo stesso CTE. */
export type AdminTopMerchants = {
  readonly byReceipts: readonly AdminMerchant[];
  readonly byRevenue: readonly AdminMerchant[];
};

export type AdminTopMerchantsResult =
  { merchants: AdminTopMerchants } | { error: string };

export type AdminProfilesResult =
  { rows: readonly AdminProfileRow[] } | { error: string };

export type AdminTrialsResult =
  { rows: readonly AdminTrialRow[] } | { error: string };

export type AdminPaidUsersResult =
  { rows: readonly AdminPaidUserRow[] } | { error: string };

/**
 * Un messaggio per elenco: con quattro letture indipendenti l'avviso compare
 * dentro la tabella che è caduta, e dice quale.
 */
const MERCHANTS_LOAD_ERROR =
  "Impossibile caricare le classifiche esercenti. Riprova tra qualche istante.";
const PROFILES_LOAD_ERROR =
  "Impossibile caricare i registrati di recente. Riprova tra qualche istante.";
const TRIALS_LOAD_ERROR =
  "Impossibile caricare i trial in scadenza. Riprova tra qualche istante.";
const PAID_USERS_LOAD_ERROR =
  "Impossibile caricare gli utenti paganti. Riprova tra qualche istante.";

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
 * Logga il fallimento di un elenco.
 *
 * L'errore NON viene passato al logger: un messaggio Postgres può contenere il
 * valore che ha fatto fallire la query, e qui quei valori sono email e nomi.
 */
function logDirectoryFailure(list: string, range: AnalyticsRange | null): void {
  logger.warn(
    { errorClass: "admin_directory_load", list, range },
    "admin directory: query fallita",
  );
}

/**
 * Le due classifiche esercenti per il range dato — per numero di scontrini e
 * per incasso. Una sola query: entrambe ordinano lo stesso CTE aggregato.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 *
 * `reference` è iniettabile per i test — in produzione è sempre "adesso".
 */
export async function getAdminTopMerchants(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminTopMerchantsResult> {
  const { rangeStart, rangeEnd } = adminRangeParams(range, reference);

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
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
    });

    if (!row) {
      logDirectoryFailure("merchants", range);
      return { error: MERCHANTS_LOAD_ERROR };
    }

    return {
      merchants: {
        byReceipts: toRows(row.by_receipts).map(mapMerchant),
        byRevenue: toRows(row.by_revenue).map(mapMerchant),
      },
    };
  } catch {
    logDirectoryFailure("merchants", range);
    return { error: MERCHANTS_LOAD_ERROR };
  }
}

/**
 * Ultimi profili registrati nel range, dal più recente.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminRecentProfiles(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminProfilesResult> {
  const { rangeStart, rangeEnd } = adminRangeParams(range, reference);

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
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
    });

    if (!row) {
      logDirectoryFailure("profiles", range);
      return { error: PROFILES_LOAD_ERROR };
    }

    return {
      rows: toRows(row.rows).map((profile) => ({
        name: toNullableText(profile.name),
        email: toText(profile.email),
        createdAt: toText(profile.created_at),
      })),
    };
  } catch {
    logDirectoryFailure("profiles", range);
    return { error: PROFILES_LOAD_ERROR };
  }
}

/**
 * Trial che scadono — o sono scaduti — entro ±7 giorni da adesso.
 *
 * **Non prende un range**: la finestra è ancorata ad ADESSO, perché la domanda
 * "chi devo richiamare questa settimana" non dipende dal periodo selezionato
 * nelle card. Prima il parametro c'era e veniva ignorato.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminTrialExpiring(): Promise<AdminTrialsResult> {
  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      SELECT coalesce(
        json_agg(
          json_build_object('name', name, 'email', email, 'trial_expires_at', trial_expires_at)
          ORDER BY trial_expires_at ASC
        ),
        '[]'::json
      ) AS rows
      FROM (
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
    });

    if (!row) {
      logDirectoryFailure("trials", null);
      return { error: TRIALS_LOAD_ERROR };
    }

    return {
      rows: toRows(row.rows).map((trial) => ({
        name: toNullableText(trial.name),
        email: toText(trial.email),
        trialExpiresAt: toText(trial.trial_expires_at),
      })),
    };
  } catch {
    logDirectoryFailure("trials", null);
    return { error: TRIALS_LOAD_ERROR };
  }
}

/**
 * Utenti su un piano a pagamento, dal più recente per inizio del periodo.
 *
 * **Non prende un range**: è una fotografia dello stato attuale degli
 * abbonamenti, non un aggregato di periodo.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminPaidUsers(): Promise<AdminPaidUsersResult> {
  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
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
    });

    if (!row) {
      logDirectoryFailure("paid", null);
      return { error: PAID_USERS_LOAD_ERROR };
    }

    return {
      rows: toRows(row.rows).map((user) => ({
        name: toNullableText(user.name),
        email: toText(user.email),
        plan: toText(user.plan),
        planActivatedAt: toNullableText(user.plan_activated_at),
      })),
    };
  } catch {
    logDirectoryFailure("paid", null);
    return { error: PAID_USERS_LOAD_ERROR };
  }
}
