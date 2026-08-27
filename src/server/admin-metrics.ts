import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { PAID_SELF_SERVICE_PLANS, TRIAL_DAYS } from "@/lib/plans";
import {
  type RawRow,
  adminRangeParams,
  lineCentsSql,
  runAdminRead,
  toNumber,
  toRows,
} from "./admin-sql";
import { type AnalyticsRange, eachRomeDay } from "./analytics-helpers";

/**
 * Metriche del pannello operatore (`/admin`) — lettura sola, aggregata su
 * TUTTI i tenant. Server-only: nessun `"use server"`, quindi nessuna action
 * RPC raggiungibile dal browser. Il gate è il layout (`isAdminEmail`), che
 * resta l'unico punto d'ingresso.
 *
 * **Due letture, non una.** `getAdminUserKpis` interroga `profiles`,
 * `getAdminDocumentKpis` interroga `commercial_documents`: erano due query
 * dentro la stessa transazione e sono diventate due letture separate, ognuna
 * dietro il proprio boundary Suspense in `src/app/admin/page.tsx`. Le tre card
 * degli utenti compaiono senza aspettare la scansione di ogni scontrino mai
 * emesso, che è la query più lenta del pannello.
 *
 * **Perché separarle non rompe la coerenza** che la transazione condivisa
 * proteggeva: quell'invariante era "un profilo creato fra una query e l'altra
 * non deve comparire nei nuovi iscritti ma non nel totale", e vive INTERNA a
 * ciascuna query — `users_total` e `users_in_range` sono due colonne della
 * stessa SELECT, come `receipts_total` e `receipts_in_range`. Nessun KPI
 * mescola `profiles` con `commercial_documents`, quindi non c'è nessuno
 * snapshot che le due letture debbano condividere.
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

export type AdminUserKpis = {
  /** Profili registrati fino alla fine del range (storico completo). */
  readonly usersTotal: number;
  readonly usersInRange: number;
  readonly usersSparkline: readonly AdminSparklinePoint[];
  /** Trial ancora attivi ADESSO (bonus referral incluso). */
  readonly trialsActive: number;
  /** Frazione 0..1 di trial partiti negli ultimi 90 giorni passati a pagamento. */
  readonly trialConversionRate: number;
};

export type AdminDocumentKpis = {
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
};

export type AdminUserKpisResult = { kpis: AdminUserKpis } | { error: string };

export type AdminDocumentKpisResult =
  { kpis: AdminDocumentKpis } | { error: string };

/**
 * Messaggi distinti per blocco: con sei letture indipendenti un unico testo
 * generico non direbbe QUALE è caduta, e l'avviso compare al posto delle sole
 * card che dipendevano da quella query.
 */
const USERS_LOAD_ERROR =
  "Impossibile caricare le metriche utenti. Riprova tra qualche istante.";
const DOCUMENTS_LOAD_ERROR =
  "Impossibile caricare le metriche scontrini. Riprova tra qualche istante.";

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
 * Logga il fallimento di una lettura di metriche.
 *
 * `metric` distingue le due letture come `list` fa per gli elenchi: con sei
 * blocchi indipendenti, un `errorClass` uguale per tutti direbbe che il
 * pannello ha un problema, non quale.
 */
function logMetricsFailure(
  metric: "users" | "documents",
  range: AnalyticsRange,
  message: string,
  err?: unknown,
): void {
  logger.warn(
    { errorClass: "admin_metrics_load", metric, range, err },
    message,
  );
}

/**
 * KPI utenti del pannello operatore: iscritti nel periodo, totale storico,
 * trial attivi e conversione della coorte a 90 giorni.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19): la pagina è
 * server-rendered e un throw sostituirebbe il boundary Suspense di questo
 * blocco con l'error boundary di segmento, portandosi via anche gli altri
 * cinque.
 *
 * `reference` è iniettabile per i test — in produzione è sempre "adesso".
 */
export async function getAdminUserKpis(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminUserKpisResult> {
  const { from, to, rangeStart, rangeEnd } = adminRangeParams(range, reference);

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
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
    });

    if (!row) {
      logMetricsFailure(
        "users",
        range,
        "admin metrics: query utenti senza righe",
      );
      return { error: USERS_LOAD_ERROR };
    }

    const started = toNumber(row.trial_cohort_started);
    const converted = toNumber(row.trial_cohort_converted);

    return {
      kpis: {
        usersTotal: toNumber(row.users_total),
        usersInRange: toNumber(row.users_in_range),
        usersSparkline: fillSeries(
          toRows(row.users_sparkline),
          "value",
          from,
          to,
        ),
        trialsActive: toNumber(row.trials_active),
        trialConversionRate: started === 0 ? 0 : converted / started,
      },
    };
  } catch (err) {
    logMetricsFailure(
      "users",
      range,
      "admin metrics: query utenti fallita",
      err,
    );
    return { error: USERS_LOAD_ERROR };
  }
}

/**
 * KPI scontrini del pannello operatore: emessi e incassati nel periodo, totali
 * storici, annullati.
 *
 * È la lettura più cara del pannello — `created_at < rangeEnd` significa tutto
 * lo storico, e il join sulle righe non ha indice utile perché non si filtra
 * per `business_id`. Sta dietro al proprio boundary apposta: è quella che
 * faceva aspettare tutto il resto.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminDocumentKpis(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminDocumentKpisResult> {
  const { from, to, rangeStart, rangeEnd } = adminRangeParams(range, reference);

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
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
    });

    if (!row) {
      logMetricsFailure(
        "documents",
        range,
        "admin metrics: query scontrini senza righe",
      );
      return { error: DOCUMENTS_LOAD_ERROR };
    }

    const daily = toRows(row.daily);

    return {
      kpis: {
        receiptsTotal: toNumber(row.receipts_total),
        receiptsInRange: toNumber(row.receipts_in_range),
        receiptsSparkline: fillSeries(daily, "receipts", from, to),
        revenueCentsTotal: toNumber(row.revenue_cents_total),
        revenueCentsInRange: toNumber(row.revenue_cents_in_range),
        revenueSparkline: fillSeries(daily, "cents", from, to),
        voidedInRange: toNumber(row.voided_in_range),
      },
    };
  } catch (err) {
    logMetricsFailure(
      "documents",
      range,
      "admin metrics: query scontrini fallita",
      err,
    );
    return { error: DOCUMENTS_LOAD_ERROR };
  }
}
