import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import {
  type RawRow,
  adminRangeParams,
  lineCentsSql,
  runAdminRead,
  toNumber,
  toRows,
  trialActiveSql,
} from "./admin-sql";
import { type AnalyticsRange, eachRomeDay } from "./analytics-helpers";

/**
 * Metriche del pannello operatore (`/admin`) — lettura sola, aggregata su
 * TUTTI i tenant. Server-only: nessun `"use server"`, quindi nessuna action
 * RPC raggiungibile dal browser. Il gate è il layout (`isAdminEmail`), che
 * resta l'unico punto d'ingresso.
 *
 * **Tre letture, non una.** `getAdminUserKpis` interroga `profiles`,
 * `getAdminDocumentKpis` interroga `commercial_documents` (e `ade_credentials`
 * per il conteggio fisconline/CIE, che non dipende dal periodo ma vive qui
 * perché sta nella stessa riga di card), `getAdminTrialFunnel` interroga
 * entrambe per la coorte trial del periodo. Ognuna sta dietro il proprio
 * boundary Suspense in `src/app/admin/page.tsx`: le card utenti compaiono
 * senza aspettare la scansione di ogni scontrino mai emesso, che è la query
 * più lenta del pannello.
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
  /**
   * Trial ancora attivi ADESSO (bonus referral incluso) che hanno completato
   * l'onboarding — `businesses.fiscal_code` valorizzato, lo stesso segnale
   * canonico che `onboarding-actions.ts` usa per "onboarding mai completato".
   * Non filtrato dal range: fotografia dello stato attuale, come lo era il
   * vecchio KPI "trial attivi" che sostituisce.
   */
  readonly trialsOnboarded: number;
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
  /**
   * Business con credenziali AdE salvate, per metodo di accesso —
   * indipendentemente dall'esito di verifica: risponde a "quale metodo hanno
   * scelto", non a "chi ha finito l'onboarding". Non filtrato dal range:
   * fotografia dello stato attuale delle credenziali salvate, come i trial
   * attivi.
   */
  readonly fisconlineUsers: number;
  readonly cieUsers: number;
};

/**
 * Funnel di attivazione della coorte trial del periodo selezionato: chi ha
 * iniziato il trial nel range **ed è tuttora in trial attivo** (non scaduto,
 * non convertito a pagamento) — quanti di questi hanno completato
 * l'onboarding, quanti hanno emesso almeno uno scontrino.
 *
 * Sostituisce la vecchia "conversione trial" (coorte fissa a 90 giorni,
 * indipendente dal periodo selezionato): quella rispondeva "quanti convertono
 * a pagamento", questa risponde "quanti, di chi è arrivato in questo periodo
 * ed è ancora con noi, stanno effettivamente usando il prodotto".
 */
export type AdminTrialFunnel = {
  readonly registered: number;
  readonly onboarded: number;
  readonly issuedReceipts: number;
};

export type AdminUserKpisResult = { kpis: AdminUserKpis } | { error: string };

export type AdminDocumentKpisResult =
  { kpis: AdminDocumentKpis } | { error: string };

export type AdminTrialFunnelResult =
  { funnel: AdminTrialFunnel } | { error: string };

/**
 * Messaggi distinti per blocco: con più letture indipendenti un unico testo
 * generico non direbbe QUALE è caduta, e l'avviso compare al posto delle sole
 * card che dipendevano da quella query.
 */
const USERS_LOAD_ERROR =
  "Impossibile caricare le metriche utenti. Riprova tra qualche istante.";
const DOCUMENTS_LOAD_ERROR =
  "Impossibile caricare le metriche scontrini. Riprova tra qualche istante.";
const TRIAL_FUNNEL_LOAD_ERROR =
  "Impossibile caricare il funnel trial. Riprova tra qualche istante.";

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
  metric: "users" | "documents" | "trial_funnel",
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
 * KPI utenti del pannello operatore: iscritti nel periodo, totale storico,
 * trial attivi che hanno completato l'onboarding.
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
        ) AS users_sparkline,
        (
          -- Onboarding completato = businesses.fiscal_code valorizzato, il
          -- segnale canonico di onboarding-actions.ts.
          SELECT count(*)::bigint
          FROM profiles p
          JOIN businesses b ON b.profile_id = p.id
          WHERE ${trialActiveSql}
            AND b.fiscal_code IS NOT NULL
        ) AS trials_onboarded
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
        trialsOnboarded: toNumber(row.trials_onboarded),
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
 * storici, business per metodo di accesso AdE.
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
      ),
      methods AS (
        SELECT
          count(*) FILTER (WHERE login_method = 'fisconline')::bigint AS fisconline_users,
          count(*) FILTER (WHERE login_method = 'cie')::bigint AS cie_users
        FROM ade_credentials
      )
      SELECT
        count(*)::bigint                                   AS receipts_total,
        count(*) FILTER (WHERE in_range)::bigint            AS receipts_in_range,
        coalesce(sum(cents), 0)::bigint                     AS revenue_cents_total,
        coalesce(sum(cents) FILTER (WHERE in_range), 0)::bigint AS revenue_cents_in_range,
        (SELECT fisconline_users FROM methods)              AS fisconline_users,
        (SELECT cie_users FROM methods)                      AS cie_users,
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
        fisconlineUsers: toNumber(row.fisconline_users),
        cieUsers: toNumber(row.cie_users),
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

/**
 * Funnel di attivazione della coorte trial del periodo selezionato (vedi
 * `AdminTrialFunnel`). Popolazione: trial iniziati dentro `[rangeStart,
 * rangeEnd)` e tuttora attivi ADESSO — chi ha già convertito o il cui trial è
 * scaduto esce dal funnel, perché la domanda è "di chi è arrivato in questo
 * periodo ed è ancora con noi, quanti stanno usando il prodotto".
 *
 * Tocca `commercial_documents` (per "ha emesso scontrini"), quindi condivide
 * il costo di `getAdminDocumentKpis` — ma filtrato a una coorte tipicamente
 * piccola via `EXISTS` correlato su `business_id`, non una scansione intera.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminTrialFunnel(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminTrialFunnelResult> {
  const { rangeStart, rangeEnd } = adminRangeParams(range, reference);

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH cohort AS (
        SELECT b.id AS business_id, b.fiscal_code
        FROM profiles p
        JOIN businesses b ON b.profile_id = p.id
        WHERE p.trial_started_at >= ${rangeStart}
          AND p.trial_started_at <  ${rangeEnd}
          AND ${trialActiveSql}
      )
      SELECT
        count(*)::bigint AS registered,
        count(*) FILTER (WHERE fiscal_code IS NOT NULL)::bigint AS onboarded,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM commercial_documents cd
            WHERE cd.business_id = cohort.business_id
              AND cd.kind = 'SALE'
              AND cd.status = 'ACCEPTED'
          )
        )::bigint AS issued_receipts
      FROM cohort
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logMetricsFailure(
        "trial_funnel",
        range,
        "admin metrics: query funnel trial senza righe",
      );
      return { error: TRIAL_FUNNEL_LOAD_ERROR };
    }

    return {
      funnel: {
        registered: toNumber(row.registered),
        onboarded: toNumber(row.onboarded),
        issuedReceipts: toNumber(row.issued_receipts),
      },
    };
  } catch (err) {
    logMetricsFailure(
      "trial_funnel",
      range,
      "admin metrics: query funnel trial fallita",
      err,
    );
    return { error: TRIAL_FUNNEL_LOAD_ERROR };
  }
}
