import { type SQL, sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import {
  type RawRow,
  adminRangeParams,
  lineCentsSql,
  paidPlansSql,
  runAdminRead,
  toNumber,
  toRows,
} from "./admin-sql";
import { type AnalyticsRange, eachRomeDay } from "./analytics-helpers";

/**
 * Metriche del pannello amministratore (`/admin`) — lettura sola, aggregata su
 * TUTTI i tenant. Nessun `"use server"` qui: le chiamano la RSC `/admin` e,
 * per le card su richiesta, le action di `admin-actions.ts`, che verificano
 * l'amministratore prima di arrivarci. `runAdminRead` lo verifica di nuovo
 * sul dato.
 *
 * **Tre letture, non una.** `getAdminFunnel` è il funnel di sempre
 * (registrati → onboarding → scontrini → paganti, con il metodo di accesso
 * AdE a ogni gradino) ed è l'unica sempre in pagina. `getAdminUserKpis`
 * interroga `profiles`, `getAdminDocumentKpis` interroga
 * `commercial_documents`: sono le card del periodo, che stanno nella
 * sezione "Altre metriche" di `src/app/admin/page.tsx`.
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
};

export type AdminDocumentKpis = {
  /** Scontrini SALE accettati fino alla fine del range. */
  readonly receiptsTotal: number;
  readonly receiptsInRange: number;
  readonly receiptsSparkline: readonly AdminSparklinePoint[];
  /** Incasso lordo in centesimi, solo scontrini accettati. */
  readonly revenueCentsTotal: number;
  readonly revenueCentsInRange: number;
  readonly revenueSparkline: readonly AdminSparklinePoint[];
};

/** Metodi di accesso AdE, nell'ordine in cui il funnel li disegna. */
export const ADMIN_LOGIN_METHODS = ["fisconline", "cie", "spid"] as const;
export type AdminLoginMethod = (typeof ADMIN_LOGIN_METHODS)[number];

/**
 * Un gradino del funnel: quanti ci sono arrivati e con quale metodo di
 * accesso AdE. La somma dei metodi può stare sotto `total`: chi ha completato
 * l'onboarding e poi ha cancellato le credenziali resta nel gradino, ma non ha
 * più un metodo da contare.
 */
export type AdminFunnelStage = {
  readonly total: number;
  readonly methods: Readonly<Record<AdminLoginMethod, number>>;
};

/**
 * Funnel di sempre, a gradini **annidati**: ognuno è un sottoinsieme del
 * precedente, così la percentuale fra due gradini vicini è una conversione
 * vera.
 *
 *  - `registered`: ogni profilo (i collaboratori non hanno un profilo);
 *  - `onboarded`: `businesses.fiscal_code` valorizzato, il segnale canonico
 *    di `onboarding-actions.ts`;
 *  - `issuedReceipts`: onboarding completato e almeno uno scontrino `SALE`
 *    accettato;
 *  - `paying`: tutto il precedente, più un piano in `paidPlansSql`.
 *
 * Un pagante che non ha mai emesso scontrini esce dal funnel per
 * costruzione: lo conta a parte `payingWithoutReceipts`, perché è un caso
 * che vale la pena vedere, non un errore di arrotondamento.
 */
export type AdminFunnel = {
  readonly registered: number;
  readonly onboarded: AdminFunnelStage;
  readonly issuedReceipts: AdminFunnelStage;
  readonly paying: AdminFunnelStage;
  readonly payingWithoutReceipts: number;
};

export type AdminUserKpisResult = { kpis: AdminUserKpis } | { error: string };

export type AdminDocumentKpisResult =
  { kpis: AdminDocumentKpis } | { error: string };

export type AdminFunnelResult = { funnel: AdminFunnel } | { error: string };

/**
 * Messaggi distinti per blocco: con più letture indipendenti un unico testo
 * generico non direbbe QUALE è caduta, e l'avviso compare al posto delle sole
 * card che dipendevano da quella query.
 */
const USERS_LOAD_ERROR =
  "Impossibile caricare le metriche utenti. Riprova tra qualche istante.";
const DOCUMENTS_LOAD_ERROR =
  "Impossibile caricare le metriche scontrini. Riprova tra qualche istante.";
const FUNNEL_LOAD_ERROR =
  "Impossibile caricare il funnel. Riprova tra qualche istante.";

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
 * `metric` distingue le letture come `list` fa per gli elenchi: con più
 * blocchi indipendenti, un `errorClass` uguale per tutti direbbe che il
 * pannello ha un problema, non quale.
 */
function logMetricsFailure(
  metric: "users" | "documents" | "funnel",
  range: AnalyticsRange | null,
  message: string,
  err?: unknown,
): void {
  logger.warn(
    { errorClass: "admin_metrics_load", metric, range, err },
    message,
  );
}

/**
 * KPI utenti del pannello amministratore: iscritti nel periodo e totale storico.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19): la pagina è
 * server-rendered e un throw sostituirebbe il boundary Suspense di questo
 * blocco con l'error boundary di segmento, portandosi via anche gli altri
 * blocchi.
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
        ) AS users_sparkline
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
 * KPI scontrini del pannello amministratore: emessi e incassati nel periodo e
 * totali storici.
 *
 * È la lettura più cara del pannello — `created_at < rangeEnd` significa tutto
 * lo storico, e il join sulle righe non ha indice utile perché non si filtra
 * per `business_id`. Per questo si carica solo su richiesta, dalla sezione
 * "Altre metriche" del pannello.
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
          (cd.created_at AT TIME ZONE 'Europe/Rome')::date AS day,
          cd.created_at >= ${rangeStart} AS in_range
        FROM commercial_documents cd
        WHERE cd.kind = 'SALE'
          AND cd.status = 'ACCEPTED'
          AND cd.created_at < ${rangeEnd}
      ),
      totals AS (
        SELECT
          s.day,
          s.in_range,
          coalesce(sum(${lineCentsSql}), 0)::bigint AS cents
        FROM sale s
        LEFT JOIN commercial_document_lines l ON l.document_id = s.id
        GROUP BY s.id, s.day, s.in_range
      ),
      by_day AS (
        SELECT day, count(*)::bigint AS receipts, sum(cents)::bigint AS cents
        FROM totals
        WHERE in_range
        GROUP BY day
      )
      SELECT
        count(*)::bigint                                   AS receipts_total,
        count(*) FILTER (WHERE in_range)::bigint            AS receipts_in_range,
        coalesce(sum(cents), 0)::bigint                     AS revenue_cents_total,
        coalesce(sum(cents) FILTER (WHERE in_range), 0)::bigint AS revenue_cents_in_range,
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

/** Le colonne di un gradino: il totale e una per metodo di accesso. */
function stageColumnsSql(stage: string, predicate: SQL): SQL {
  const perMethod = ADMIN_LOGIN_METHODS.map((method) => {
    const alias = sql.raw(stage + "_" + method);
    return sql`count(*) FILTER (WHERE ${predicate} AND method = ${method})::bigint AS ${alias}`;
  });
  return sql.join(
    [
      sql`count(*) FILTER (WHERE ${predicate})::bigint AS ${sql.raw(stage)}`,
      ...perMethod,
    ],
    sql`,
`,
  );
}

function toStage(row: RawRow, stage: string): AdminFunnelStage {
  return {
    total: toNumber(row[stage]),
    methods: {
      fisconline: toNumber(row[`${stage}_fisconline`]),
      cie: toNumber(row[`${stage}_cie`]),
      spid: toNumber(row[`${stage}_spid`]),
    },
  };
}

/**
 * Funnel di sempre del pannello amministratore (vedi `AdminFunnel`). Nessun
 * periodo: è la fotografia di dove si perdono gli utenti da quando il
 * prodotto esiste, e il metodo di accesso a ogni gradino dice se CIE converte
 * peggio di Fisconline.
 *
 * Una riga per profilo: `businesses.profile_id` e `ade_credentials.business_id`
 * sono UNIQUE, quindi i due `LEFT JOIN` non moltiplicano nulla. "Ha emesso
 * scontrini" è un `EXISTS` correlato su `business_id`, che usa l'indice
 * `(business_id, status)` invece di scandire lo storico.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminFunnel(): Promise<AdminFunnelResult> {
  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH base AS (
        SELECT
          p.plan IN (${paidPlansSql}) AS paying,
          coalesce(b.fiscal_code IS NOT NULL, false) AS onboarded,
          c.login_method AS method,
          EXISTS (
            SELECT 1 FROM commercial_documents cd
            WHERE cd.business_id = b.id
              AND cd.kind = 'SALE'
              AND cd.status = 'ACCEPTED'
          ) AS has_receipts
        FROM profiles p
        LEFT JOIN businesses      b ON b.profile_id  = p.id
        LEFT JOIN ade_credentials c ON c.business_id = b.id
      ),
      stages AS (
        SELECT
          method,
          onboarded                              AS s_onboarded,
          onboarded AND has_receipts             AS s_receipts,
          onboarded AND has_receipts AND paying  AS s_paying,
          paying AND NOT (onboarded AND has_receipts) AS s_paying_orphan
        FROM base
      )
      SELECT
        count(*)::bigint AS registered,
        ${stageColumnsSql("onboarded", sql`s_onboarded`)},
        ${stageColumnsSql("issued_receipts", sql`s_receipts`)},
        ${stageColumnsSql("paying", sql`s_paying`)},
        count(*) FILTER (WHERE s_paying_orphan)::bigint AS paying_without_receipts
      FROM stages
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logMetricsFailure(
        "funnel",
        null,
        "admin metrics: query funnel senza righe",
      );
      return { error: FUNNEL_LOAD_ERROR };
    }

    return {
      funnel: {
        registered: toNumber(row.registered),
        onboarded: toStage(row, "onboarded"),
        issuedReceipts: toStage(row, "issued_receipts"),
        paying: toStage(row, "paying"),
        payingWithoutReceipts: toNumber(row.paying_without_receipts),
      },
    };
  } catch (err) {
    logMetricsFailure(
      "funnel",
      null,
      "admin metrics: query funnel fallita",
      err,
    );
    return { error: FUNNEL_LOAD_ERROR };
  }
}
