import { sql } from "drizzle-orm";

import { withStatementTimeout } from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { PAID_SELF_SERVICE_PLANS, TRIAL_DAYS } from "@/lib/plans";
import {
  ADMIN_QUERY_TIMEOUT_MS,
  type RawRow,
  lineCentsSql,
  toNumber,
  toRows,
} from "./admin-sql";
import {
  type AnalyticsRange,
  eachRomeDay,
  rangeToBounds,
} from "./analytics-helpers";

/**
 * Metriche del pannello operatore (`/admin`) — lettura sola, aggregata su
 * TUTTI i tenant. Server-only: nessun `"use server"`, quindi nessuna action
 * RPC raggiungibile dal browser. Il gate è il layout (`isAdminEmail`), che
 * resta l'unico punto d'ingresso.
 *
 * **Perché aggrega in SQL e non in JS** come `analytics-actions.ts`: là il
 * dataset è di un solo esercente e viene riusato per KPI, timeseries e
 * breakdown; qui è l'intero database e servono solo scalari e serie
 * giornaliere. Tirarsi in memoria ogni riga di ogni scontrino per sommarle
 * sarebbe l'unica parte del progetto che cresce linearmente col fatturato di
 * tutti.
 *
 * **Il prezzo di aggregare in SQL** è che il canone della regola 17 (centesimi
 * interi per riga, mai un arrotondamento per documento) va riscritto in
 * Postgres: `lineCentsSql` in `./admin-sql.ts` è la traduzione uno-a-uno di
 * `lineTotalCents` in `src/lib/receipts/receipt-totals.ts`. Toccarne una senza
 * l'altra fa divergere il totale del pannello da quello dello scontrino: le
 * due formule vanno lette insieme.
 */

export type AdminSparklinePoint = {
  /** Giorno fiscale italiano, `yyyy-MM-dd` (Europe/Rome). */
  readonly date: string;
  readonly value: number;
};

export type AdminKpis = {
  /** Profili registrati fino alla fine del range (storico completo). */
  readonly usersTotal: number;
  readonly usersInRange: number;
  readonly usersSparkline: readonly AdminSparklinePoint[];
  /** Scontrini SALE accettati fino alla fine del range. */
  readonly receiptsTotal: number;
  readonly receiptsInRange: number;
  readonly receiptsSparkline: readonly AdminSparklinePoint[];
  /** Incasso lordo in centesimi, solo scontrini accettati e non annullati. */
  readonly revenueCentsTotal: number;
  readonly revenueCentsInRange: number;
  readonly revenueSparkline: readonly AdminSparklinePoint[];
  /** Scontrini annullati nel range (SALE passati a VOID_ACCEPTED). */
  readonly voidedInRange: number;
  /** Trial ancora attivi ADESSO (bonus referral incluso). */
  readonly trialsActive: number;
  /** Frazione 0..1 di trial partiti negli ultimi 90 giorni passati a pagamento. */
  readonly trialConversionRate: number;
};

export type AdminKpisResult = { kpis: AdminKpis } | { error: string };

const LOAD_ERROR =
  "Impossibile caricare le metriche. Riprova tra qualche istante.";

/**
 * Finestra della coorte per il tasso di conversione, **indipendente dal range
 * selezionato**: è un segnale stabile che non deve ridursi a rumore quando si
 * guardano 7 giorni. Scelta ereditata dalla dashboard che questo pannello
 * sostituisce.
 */
const TRIAL_CONVERSION_WINDOW_DAYS = 90;

/**
 * Espande le righe `{ date, … }` di una serie giornaliera sull'asse completo
 * del range, con 0 nei giorni senza dati. Senza il fill una sparkline salterebbe
 * i giorni vuoti e comprimerebbe il tempo: due picchi a una settimana di
 * distanza apparirebbero adiacenti.
 */
function fillSeries(
  rows: readonly RawRow[],
  valueKey: string,
  from: Date,
  to: Date,
): AdminSparklinePoint[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const date = typeof row.date === "string" ? row.date : null;
    if (date) byDay.set(date, toNumber(row[valueKey]));
  }
  return eachRomeDay(from, to).map((date) => ({
    date,
    value: byDay.get(date) ?? 0,
  }));
}

/**
 * KPI del pannello operatore per il range dato.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19): la pagina è
 * server-rendered e un throw la sostituirebbe con l'error boundary.
 *
 * `reference` è iniettabile per i test — in produzione è sempre "adesso".
 */
export async function getAdminKpis(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminKpisResult> {
  const { from, to } = rangeToBounds(range, reference);
  // Date legate come ISO string + cast esplicito: un oggetto Date passato a un
  // template sql`` viene serializzato dal driver in una forma che Postgres non
  // riconosce come timestamptz (skill db-migrations).
  const rangeStart = sql`${from.toISOString()}::timestamptz`;
  const rangeEnd = sql`${to.toISOString()}::timestamptz`;

  try {
    // Le due query in UNA transazione: condividono il budget di timeout e,
    // soprattutto, lo stesso snapshot: eseguite separate, un profilo o uno
    // scontrino creato tra l'una e l'altra renderebbe i totali reciprocamente
    // incoerenti (un utente contato nei nuovi iscritti ma non nel totale).
    const [usersRow, docsRow] = await withStatementTimeout(
      ADMIN_QUERY_TIMEOUT_MS,
      async (tx) => {
        const [users] = (await tx.execute(sql`
      WITH in_range AS (
        SELECT (p.created_at AT TIME ZONE 'Europe/Rome')::date AS day
        FROM profiles p
        WHERE p.created_at >= ${rangeStart}
          AND p.created_at <  ${rangeEnd}
      ),
      by_day AS (
        SELECT day, count(*)::bigint AS value FROM in_range GROUP BY day
      ),
      cohort AS (
        -- trial_started_at GREZZO, senza bonus referral: qui la domanda è
        -- "chi ha iniziato la prova negli ultimi 90 giorni", cioè quando si è
        -- iscritto, non quando la prova scade.
        SELECT
          count(*) FILTER (
            WHERE p.trial_started_at >= now() - make_interval(days => ${TRIAL_CONVERSION_WINDOW_DAYS})
          )::bigint AS started,
          count(*) FILTER (
            WHERE p.trial_started_at >= now() - make_interval(days => ${TRIAL_CONVERSION_WINDOW_DAYS})
              AND p.plan IN (${sql.join(
                PAID_SELF_SERVICE_PLANS.map((plan) => sql`${plan}`),
                sql`, `,
              )})
          )::bigint AS converted
        FROM profiles p
      )
      SELECT
        (SELECT count(*)::bigint FROM profiles WHERE created_at < ${rangeEnd}) AS users_total,
        (SELECT count(*)::bigint FROM in_range) AS users_in_range,
        (
          SELECT coalesce(
            json_agg(
              json_build_object('date', to_char(day, 'YYYY-MM-DD'), 'value', value)
              ORDER BY day
            ),
            '[]'::json
          )
          FROM by_day
        ) AS users_sparkline,
        (
          -- Scadenza trial DERIVATA come nell'app (trialStartWithReferralBonus
          -- + TRIAL_DAYS): il bonus referral sposta lo start in avanti, quindi
          -- ignorarlo dichiarerebbe scaduta una prova che l'app tiene aperta.
          SELECT count(*)::bigint FROM profiles p
          WHERE p.plan = 'trial'
            AND p.trial_started_at IS NOT NULL
            AND p.trial_started_at
                + make_interval(days => p.referral_bonus_days)
                + make_interval(days => ${TRIAL_DAYS}) > now()
        ) AS trials_active,
        (SELECT started   FROM cohort) AS trial_cohort_started,
        (SELECT converted FROM cohort) AS trial_cohort_converted
    `)) as unknown as RawRow[];

        const [docs] = (await tx.execute(sql`
      WITH sale AS (
        SELECT
          cd.id,
          cd.status,
          (cd.created_at AT TIME ZONE 'Europe/Rome')::date AS day,
          cd.created_at >= ${rangeStart} AS in_range
        FROM commercial_documents cd
        WHERE cd.kind = 'SALE'
          AND cd.created_at < ${rangeEnd}
      ),
      totals AS (
        SELECT
          s.status,
          s.day,
          s.in_range,
          coalesce(sum(${lineCentsSql}), 0)::bigint AS cents
        FROM sale s
        LEFT JOIN commercial_document_lines l ON l.document_id = s.id
        GROUP BY s.id, s.status, s.day, s.in_range
      ),
      by_day AS (
        SELECT day, count(*)::bigint AS receipts, sum(cents)::bigint AS cents
        FROM totals
        WHERE status = 'ACCEPTED' AND in_range
        GROUP BY day
      )
      SELECT
        count(*) FILTER (WHERE status = 'ACCEPTED')::bigint AS receipts_total,
        count(*) FILTER (WHERE status = 'ACCEPTED' AND in_range)::bigint AS receipts_in_range,
        coalesce(sum(cents) FILTER (WHERE status = 'ACCEPTED'), 0)::bigint AS revenue_cents_total,
        coalesce(sum(cents) FILTER (WHERE status = 'ACCEPTED' AND in_range), 0)::bigint AS revenue_cents_in_range,
        count(*) FILTER (WHERE status = 'VOID_ACCEPTED' AND in_range)::bigint AS voided_in_range,
        (
          SELECT coalesce(
            json_agg(
              json_build_object(
                'date', to_char(day, 'YYYY-MM-DD'),
                'receipts', receipts,
                'cents', cents
              ) ORDER BY day
            ),
            '[]'::json
          )
          FROM by_day
        ) AS daily
      FROM totals
    `)) as unknown as RawRow[];

        return [users, docs] as const;
      },
    );

    if (!usersRow || !docsRow) {
      logger.warn(
        { errorClass: "admin_metrics_load", range },
        "admin metrics: query senza righe",
      );
      return { error: LOAD_ERROR };
    }

    const started = toNumber(usersRow.trial_cohort_started);
    const converted = toNumber(usersRow.trial_cohort_converted);
    const daily = toRows(docsRow.daily);

    return {
      kpis: {
        usersTotal: toNumber(usersRow.users_total),
        usersInRange: toNumber(usersRow.users_in_range),
        usersSparkline: fillSeries(
          toRows(usersRow.users_sparkline),
          "value",
          from,
          to,
        ),
        receiptsTotal: toNumber(docsRow.receipts_total),
        receiptsInRange: toNumber(docsRow.receipts_in_range),
        receiptsSparkline: fillSeries(daily, "receipts", from, to),
        revenueCentsTotal: toNumber(docsRow.revenue_cents_total),
        revenueCentsInRange: toNumber(docsRow.revenue_cents_in_range),
        revenueSparkline: fillSeries(daily, "cents", from, to),
        voidedInRange: toNumber(docsRow.voided_in_range),
        trialsActive: toNumber(usersRow.trials_active),
        trialConversionRate: started === 0 ? 0 : converted / started,
      },
    };
  } catch (err) {
    logger.warn(
      { errorClass: "admin_metrics_load", range, err },
      "admin metrics: query fallita",
    );
    return { error: LOAD_ERROR };
  }
}
