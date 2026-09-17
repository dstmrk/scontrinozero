import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { PAID_SELF_SERVICE_PLANS } from "@/lib/plans";
import { staleUpdatedBefore } from "@/lib/services/ade-recovery";
import {
  type RawRow,
  adminRangeParams,
  lineCentsSql,
  merchantLocationSql,
  runAdminRead,
  toNullableText,
  toNumber,
  toRows,
  toText,
  trialActiveSql,
  trialExpiresAtSql,
} from "./admin-sql";
import type { AnalyticsRange } from "./analytics-helpers";

/**
 * Elenchi del pannello operatore (`/admin`) — le tabelle che affiancano i KPI
 * di `admin-metrics.ts`: classifiche esercenti (globali e in trial attivo),
 * documenti in sospeso, onboarding fermi, trial in scadenza, utenti paganti,
 * ultimi registrati.
 *
 * Separato da `admin-metrics.ts` perché la natura del dato è diversa: qui ogni
 * riga porta **nome ed email di una persona** (o, per i documenti in sospeso,
 * il nome dell'esercente). Tenerlo distinto rende esplicito dove il pannello
 * tocca dati personali, e dove no. Nessuno di questi valori finisce mai in un
 * log o in Sentry: sui fallimenti si logga solo `errorClass` e il range
 * (denylist telemetria di `src/lib/logger.ts`).
 *
 * **Una lettura per tabella, non una transazione condivisa.** Ognuna è una
 * lettura a sé dietro il proprio boundary Suspense in
 * `src/app/admin/page.tsx`, e la sua tabella compare appena quella query è
 * pronta. Non condividono nessun invariante — sono elenchi distinti, non
 * pezzi di uno stesso totale — quindi uno snapshot condiviso non
 * proteggerebbe niente che valga la latenza di attenderle tutte insieme.
 *
 * La maggior parte non guarda nemmeno il range selezionato:
 * `getAdminTrialExpiring`, `getAdminPaidUsers`, `getAdminStalledOnboarding`,
 * `getAdminStalePendingDocuments` e `getAdminTrialActiveMerchants` sono
 * ancorate ad ADESSO — rispondono a "chi/cosa richiede attenzione oggi", non
 * "cosa è successo nel periodo".
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

export type AdminStalledOnboardingRow = {
  readonly name: string | null;
  readonly email: string;
  /**
   * `last_verify_outcome`, o `null` per chi non ha MAI premuto Verifica —
   * che è un esito a sua volta, ed è il più interessante (REVIEW.md #107).
   */
  readonly outcome: string | null;
  readonly attempts: number;
  /** ISO 8601. Quando ha salvato le credenziali, cioè da quanto è fermo. */
  readonly createdAt: string;
  /** ISO 8601, o null se non ha mai tentato. */
  readonly lastVerifyAt: string | null;
};

/**
 * Conteggi per fascia d'età sull'INTERA popolazione ferma, non solo sulle
 * righe elencate: l'elenco è tagliato a `LIST_LIMIT`, questi no.
 *
 * L'età è la metà della diagnosi che l'esito non dà: fermo da tre giorni è
 * qualcuno che sta ancora decidendo, fermo da quattro mesi è un account morto.
 */
export type AdminStalledOnboardingCounts = {
  readonly total: number;
  /** Fermi da meno di 7 giorni. */
  readonly recent: number;
  /** Fermi da 7 a 30 giorni. */
  readonly weeks: number;
  /** Fermi da oltre 30 giorni. */
  readonly stale: number;
};

export type AdminStalledOnboarding = {
  readonly counts: AdminStalledOnboardingCounts;
  readonly rows: readonly AdminStalledOnboardingRow[];
};

export type AdminStalledOnboardingResult =
  { stalled: AdminStalledOnboarding } | { error: string };

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

/** Un documento `SALE` fermo oltre la soglia stale (REVIEW.md #103). */
export type AdminStalePendingDocumentRow = {
  readonly businessName: string | null;
  /** ISO 8601 — quando lo scontrino è stato creato, non l'ultimo tentativo. */
  readonly createdAt: string;
  readonly amountCents: number;
};

export type AdminStalePendingDocumentsResult =
  { rows: readonly AdminStalePendingDocumentRow[] } | { error: string };

export type AdminTrialActiveMerchantsResult =
  { merchants: readonly AdminMerchant[] } | { error: string };

/**
 * Un messaggio per elenco: con più letture indipendenti l'avviso compare
 * dentro la tabella che è caduta, e dice quale.
 */
const MERCHANTS_LOAD_ERROR =
  "Impossibile caricare le classifiche esercenti. Riprova tra qualche istante.";
const PROFILES_LOAD_ERROR =
  "Impossibile caricare i registrati di recente. Riprova tra qualche istante.";
const TRIALS_LOAD_ERROR =
  "Impossibile caricare i trial in scadenza. Riprova tra qualche istante.";
const STALLED_LOAD_ERROR =
  "Impossibile caricare gli onboarding fermi. Riprova tra qualche istante.";
const PAID_USERS_LOAD_ERROR =
  "Impossibile caricare gli utenti paganti. Riprova tra qualche istante.";
const STALE_PENDING_DOCUMENTS_LOAD_ERROR =
  "Impossibile caricare i documenti in sospeso. Riprova tra qualche istante.";
const TRIAL_ACTIVE_MERCHANTS_LOAD_ERROR =
  "Impossibile caricare gli esercenti in trial. Riprova tra qualche istante.";

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
          ${merchantLocationSql} AS location,
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
 * Utenti in trial attivo che hanno emesso almeno uno scontrino — storico
 * completo, non filtrato dal range selezionato: sta accanto a "Trial in
 * scadenza", che è anch'essa una fotografia di adesso.
 *
 * Stessa forma di riga e stesso ordinamento di `getAdminTopMerchants`
 * (`AdminMerchant`, scontrini poi incasso poi `business_id` come spareggio
 * deterministico — skill money-rounding), ma senza il tetto a
 * `TOP_MERCHANTS`: qui la domanda è "chi", non "i primi cinque".
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminTrialActiveMerchants(): Promise<AdminTrialActiveMerchantsResult> {
  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH agg AS (
        SELECT
          cd.business_id                            AS business_id,
          count(DISTINCT cd.id)::bigint             AS receipts,
          coalesce(sum(${lineCentsSql}), 0)::bigint AS revenue_cents
        FROM commercial_documents cd
        LEFT JOIN commercial_document_lines l ON l.document_id = cd.id
        WHERE cd.kind = 'SALE'
          AND cd.status = 'ACCEPTED'
        GROUP BY cd.business_id
      ),
      merchants AS (
        SELECT
          a.business_id,
          b.business_name,
          ${fullNameSql} AS owner_name,
          ${merchantLocationSql} AS location,
          p.email,
          a.receipts,
          a.revenue_cents
        FROM agg a
        JOIN businesses b ON b.id = a.business_id
        JOIN profiles   p ON p.id = b.profile_id
        WHERE ${trialActiveSql}
      )
      SELECT coalesce(
        json_agg(
          row_to_json(t)
          ORDER BY t.receipts DESC, t.revenue_cents DESC, t.business_id
        ),
        '[]'::json
      ) AS rows
      FROM (
        SELECT * FROM merchants
        ORDER BY receipts DESC, revenue_cents DESC, business_id
        LIMIT ${LIST_LIMIT}
      ) t
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logDirectoryFailure("trial_active_merchants", null);
      return { error: TRIAL_ACTIVE_MERCHANTS_LOAD_ERROR };
    }

    return { merchants: toRows(row.rows).map(mapMerchant) };
  } catch {
    logDirectoryFailure("trial_active_merchants", null);
    return { error: TRIAL_ACTIVE_MERCHANTS_LOAD_ERROR };
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

/**
 * Chi ha inserito le credenziali AdE e non ha mai completato l'onboarding, con
 * l'esito dell'ultimo tentativo e da quanto è fermo (REVIEW.md #107).
 *
 * **La definizione di "fermo" è quella deterministica**: `verified_at IS NULL`
 * su `ade_credentials` più `fiscal_code IS NULL` su `businesses`, **e** un
 * trial ancora attivo (`trialActiveSql`, `admin-sql.ts`) — chi ha lasciato
 * scadere il trial senza mai completare non è più un caso su cui intervenire.
 * La query senza l'ultimo filtro è quella con cui il finding è stato misurato
 * (10 righe su 22 il 16/09/2026), e sta qui perché i Sentry Logs campionano e
 * scartano — un conteggio preso da lì non regge (REVIEW.md #106).
 *
 * **Non prende un range**, come `getAdminTrialExpiring`: la domanda è "chi è
 * fermo adesso", e chi si è arenato a maggio deve comparire anche guardando
 * gli ultimi sette giorni. Anzi, è proprio quello il caso interessante.
 *
 * **Ordinati dal più vecchio.** Le altre tabelle mostrano il più recente per
 * primo perché rispondono a "cosa è successo"; questa risponde a "chi ho
 * perso", e il fondo della lista è dove stanno le persone ferme da più tempo,
 * col trial ancora attivo ma senza un solo scontrino.
 *
 * Conteggi e righe in UNA query: i primi sull'intera popolazione, le seconde
 * tagliate a `LIST_LIMIT`. Separarle darebbe due fotografie di istanti diversi
 * per un totale che deve tornare con l'elenco che ha sotto.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminStalledOnboarding(): Promise<AdminStalledOnboardingResult> {
  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH stalled AS (
        SELECT
          ${fullNameSql}        AS name,
          p.email               AS email,
          c.last_verify_outcome AS outcome,
          c.verify_attempts     AS attempts,
          c.created_at          AS created_at,
          c.last_verify_at      AS last_verify_at
        FROM ade_credentials c
        JOIN businesses b ON b.id = c.business_id
        JOIN profiles   p ON p.id = b.profile_id
        WHERE c.verified_at IS NULL
          AND b.fiscal_code IS NULL
          AND ${trialActiveSql}
      ),
      counts AS (
        SELECT
          count(*)::bigint AS total,
          count(*) FILTER (
            WHERE created_at >= now() - interval '7 days'
          )::bigint AS recent,
          count(*) FILTER (
            WHERE created_at <  now() - interval '7 days'
              AND created_at >= now() - interval '30 days'
          )::bigint AS weeks,
          count(*) FILTER (
            WHERE created_at < now() - interval '30 days'
          )::bigint AS stale
        FROM stalled
      ),
      listed AS (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'name', name,
              'email', email,
              'outcome', outcome,
              'attempts', attempts,
              'created_at', created_at,
              'last_verify_at', last_verify_at
            )
            ORDER BY created_at ASC
          ),
          '[]'::json
        ) AS rows
        FROM (
          SELECT * FROM stalled ORDER BY created_at ASC LIMIT ${LIST_LIMIT}
        ) t
      )
      SELECT counts.total, counts.recent, counts.weeks, counts.stale, listed.rows
      FROM counts, listed
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logDirectoryFailure("stalled_onboarding", null);
      return { error: STALLED_LOAD_ERROR };
    }

    return {
      stalled: {
        counts: {
          total: toNumber(row.total),
          recent: toNumber(row.recent),
          weeks: toNumber(row.weeks),
          stale: toNumber(row.stale),
        },
        rows: toRows(row.rows).map((stalledRow) => ({
          name: toNullableText(stalledRow.name),
          email: toText(stalledRow.email),
          outcome: toNullableText(stalledRow.outcome),
          attempts: toNumber(stalledRow.attempts),
          createdAt: toText(stalledRow.created_at),
          lastVerifyAt: toNullableText(stalledRow.last_verify_at),
        })),
      },
    };
  } catch {
    logDirectoryFailure("stalled_onboarding", null);
    return { error: STALLED_LOAD_ERROR };
  }
}

/**
 * Documenti `SALE` fermi oltre la soglia stale, su tutti i tenant (REVIEW.md
 * #103) — sostituisce il banner che si limitava a contarli: qui l'operatore
 * vede DI CHI sono e quanto valgono, non solo quanti.
 *
 * **Solo `SALE`, mai `VOID`.** Un annullo fermo non ha un "importo" proprio —
 * è la reversione di un documento altrove — e la tabella ha tre colonne
 * fisse (esercente, data scontrino, importo) che un annullo non riempirebbe
 * con lo stesso significato. `countStalePendingDocuments`
 * (`src/lib/services/ade-recovery.ts`), che alimenta anche lo sweep
 * automatico in `instrumentation.ts`, resta l'unico owner del conteggio che
 * include entrambi i `kind`.
 *
 * Stessa soglia stale del recovery: `staleUpdatedBefore` è l'owner unico del
 * predicato (vedi il commento su `isStaleUpdatedAt`), quindi una riga qui è
 * sempre una riga che il recovery è già disposto a toccare.
 *
 * **Non prende un range**, come `getAdminTrialExpiring`: un orfano di tre
 * settimane fa è esattamente quello che interessa vedere.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 *
 * `now` è iniettabile per i test — in produzione è sempre "adesso".
 */
export async function getAdminStalePendingDocuments(
  now: Date = new Date(),
): Promise<AdminStalePendingDocumentsResult> {
  const staleBefore = sql`${staleUpdatedBefore(now).toISOString()}::timestamptz`;

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH pending AS (
        SELECT cd.id, cd.business_id, cd.created_at
        FROM commercial_documents cd
        WHERE cd.kind = 'SALE'
          AND cd.status = 'PENDING'
          AND cd.updated_at < ${staleBefore}
      ),
      totals AS (
        SELECT
          p.id,
          p.business_id,
          p.created_at,
          coalesce(sum(${lineCentsSql}), 0)::bigint AS amount_cents
        FROM pending p
        LEFT JOIN commercial_document_lines l ON l.document_id = p.id
        GROUP BY p.id, p.business_id, p.created_at
      )
      SELECT coalesce(
        json_agg(
          row_to_json(t) ORDER BY t.created_at ASC
        ),
        '[]'::json
      ) AS rows
      FROM (
        SELECT b.business_name, t.created_at, t.amount_cents
        FROM totals t
        JOIN businesses b ON b.id = t.business_id
        ORDER BY t.created_at ASC
        LIMIT ${LIST_LIMIT}
      ) t
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logDirectoryFailure("stale_pending_documents", null);
      return { error: STALE_PENDING_DOCUMENTS_LOAD_ERROR };
    }

    return {
      rows: toRows(row.rows).map((doc) => ({
        businessName: toNullableText(doc.business_name),
        createdAt: toText(doc.created_at),
        amountCents: toNumber(doc.amount_cents),
      })),
    };
  } catch {
    logDirectoryFailure("stale_pending_documents", null);
    return { error: STALE_PENDING_DOCUMENTS_LOAD_ERROR };
  }
}
