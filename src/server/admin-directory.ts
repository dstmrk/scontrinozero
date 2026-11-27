import { sql } from "drizzle-orm";

import { TRIAL_DAYS } from "@/lib/plans-shared";

import { logger } from "@/lib/logger";
import { staleUpdatedBefore } from "@/lib/services/ade-recovery";
import {
  type RawRow,
  adminRangeParams,
  lineCentsSql,
  merchantLocationSql,
  paidPlansSql,
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
 * Elenchi del pannello amministratore (`/admin`) — le tabelle che affiancano i KPI
 * di `admin-metrics.ts`: classifiche esercenti (globali e in trial attivo),
 * documenti in sospeso, registrati con gli onboarding fermi, trial in
 * scadenza, utenti paganti.
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
 * `getAdminTrialExpiring`, `getAdminPaidUsers`,
 * `getAdminStalePendingDocuments` e `getAdminTrialActive` sono
 * ancorate ad ADESSO — rispondono a "chi/cosa richiede attenzione oggi", non
 * "cosa è successo nel periodo".
 *
 * Server-only come il gemello: nessun `"use server"` qui. Le vie d'accesso
 * sono la RSC `/admin` e le action su richiesta di `admin-actions.ts`,
 * entrambe dietro `requireAdmin`.
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

/**
 * Stato dell'onboarding di chi si è registrato:
 *  - `none`: nessuna credenziale AdE salvata, non ha ancora cominciato;
 *  - `ok`: `businesses.fiscal_code` valorizzato, il segnale canonico di
 *    `onboarding-actions.ts`;
 *  - `stalled`: credenziali salvate, onboarding non completato.
 */
export type AdminOnboardingStatus = "none" | "ok" | "stalled";

export type AdminSignupRow = {
  readonly name: string | null;
  readonly email: string;
  /** ISO 8601 — quando si è registrato. */
  readonly registeredAt: string;
  readonly status: AdminOnboardingStatus;
  /**
   * `last_verify_outcome` quando `status` è `stalled`, `null` altrimenti — e
   * anche per chi non ha MAI premuto Verifica, che è un esito a sua volta
   * (PR #957).
   */
  readonly outcome: string | null;
  readonly attempts: number;
  /** ISO 8601, solo se `stalled`: quando ha salvato le credenziali. */
  readonly stalledSince: string | null;
};

/**
 * Conteggi per fascia d'età sull'INTERA popolazione ferma, non solo sulle
 * righe elencate: l'elenco è tagliato a `LIST_LIMIT`, questi no. Oltre la
 * durata della prova un onboarding fermo non si conta più (`STALLED_MAX_DAYS`).
 */
export type AdminStalledCounts = {
  readonly total: number;
  /** Fermi da meno di 7 giorni. */
  readonly recent: number;
  /** Fermi da 7 giorni fino alla durata della prova. */
  readonly weeks: number;
};

/**
 * Registrati del periodo e onboarding fermi in una tabella sola: `inRange`
 * sono i registrati nel periodo, `earlier` chi è fermo adesso ma si è
 * registrato prima — senza questa seconda metà, guardando gli ultimi sette
 * giorni sparirebbero proprio i casi da recuperare.
 */
export type AdminSignups = {
  readonly counts: AdminStalledCounts;
  readonly inRange: readonly AdminSignupRow[];
  readonly earlier: readonly AdminSignupRow[];
};

export type AdminSignupsResult = { signups: AdminSignups } | { error: string };

/** Le due classifiche escono dalla stessa query: si ordinano sullo stesso CTE. */
export type AdminTopMerchants = {
  readonly byReceipts: readonly AdminMerchant[];
  readonly byRevenue: readonly AdminMerchant[];
};

export type AdminTopMerchantsResult =
  { merchants: AdminTopMerchants } | { error: string };

export type AdminTrialsResult =
  { rows: readonly AdminTrialRow[] } | { error: string };

export type AdminPaidUsersResult =
  { rows: readonly AdminPaidUserRow[] } | { error: string };

/** Un documento `SALE` fermo oltre la soglia stale (PR #904). */
export type AdminStalePendingDocumentRow = {
  readonly businessName: string | null;
  /** ISO 8601 — quando lo scontrino è stato creato, non l'ultimo tentativo. */
  readonly createdAt: string;
  readonly amountCents: number;
};

export type AdminStalePendingDocumentsResult =
  { rows: readonly AdminStalePendingDocumentRow[] } | { error: string };

/**
 * Trial attivi adesso: quanti sono, quanti hanno emesso almeno uno scontrino
 * accettato, e l'elenco di questi ultimi. Una sola lettura alimenta sia il
 * KPI "Trial attivi" sia la tabella "Trial attivi con scontrini": i due
 * numeri devono tornare con le righe che hanno sotto.
 */
export type AdminTrialActive = {
  readonly active: number;
  readonly withReceipts: number;
  readonly merchants: readonly AdminMerchant[];
};

export type AdminTrialActiveResult =
  { trials: AdminTrialActive } | { error: string };

/**
 * Un messaggio per elenco: con più letture indipendenti l'avviso compare
 * dentro la tabella che è caduta, e dice quale.
 */
const MERCHANTS_LOAD_ERROR =
  "Impossibile caricare le classifiche esercenti. Riprova tra qualche istante.";
const SIGNUPS_LOAD_ERROR =
  "Impossibile caricare i registrati. Riprova tra qualche istante.";
const TRIALS_LOAD_ERROR =
  "Impossibile caricare i trial in scadenza. Riprova tra qualche istante.";
const PAID_USERS_LOAD_ERROR =
  "Impossibile caricare gli utenti paganti. Riprova tra qualche istante.";
const STALE_PENDING_DOCUMENTS_LOAD_ERROR =
  "Impossibile caricare i documenti in sospeso. Riprova tra qualche istante.";
const TRIAL_ACTIVE_LOAD_ERROR =
  "Impossibile caricare i trial attivi. Riprova tra qualche istante.";

/** Quanti esercenti mostrare in ciascuna delle due classifiche. */
const TOP_MERCHANTS = 5;

/** Tetto delle tabelle-elenco: oltre non è più una tabella, è un export. */
const LIST_LIMIT = 50;
const PAID_USERS_LIMIT = 100;

/**
 * Oltre questa età un onboarding fermo non interessa più: è la durata della
 * prova, nel corso della quale chi è fermo è già stato contattato. Dato che
 * "fermo" richiede anche un trial attivo, la soglia morde solo per chi ha un
 * bonus referral.
 */
const STALLED_MAX_DAYS = TRIAL_DAYS;

/**
 * Ampiezza della finestra "trial in scadenza", in giorni **prima e dopo**
 * adesso: si vogliono vedere sia le prove che stanno per finire sia quelle
 * finite da poco, che sono il momento utile per intervenire.
 */
const TRIAL_WINDOW_DAYS = 7;

/** Nome completo, o NULL se il profilo non ne ha uno utilizzabile. */
const fullNameSql = sql`nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')`;

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
 * Trial attivi adesso e, fra questi, chi ha emesso scontrini (vedi
 * `AdminTrialActive`), con lo storico completo di ciascuno.
 *
 * **Prima la popolazione, poi i documenti.** I trial attivi sono pochi: la
 * query li isola e solo dopo va a leggere i loro scontrini, per
 * `business_id` e quindi sull'indice. La versione precedente sommava lo
 * storico di tutti gli esercenti e filtrava i trial alla fine.
 *
 * Stessa forma di riga e stesso ordinamento di `getAdminTopMerchants`
 * (`business_id` come ultima chiave, ordini deterministici: skill
 * `money-rounding`). Conteggi e righe in una lettura sola, come per gli
 * onboarding fermi: due fotografie di istanti diversi non tornerebbero.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 */
export async function getAdminTrialActive(): Promise<AdminTrialActiveResult> {
  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH trial AS (
        SELECT
          b.id                   AS business_id,
          b.business_name        AS business_name,
          ${fullNameSql}         AS owner_name,
          ${merchantLocationSql} AS location,
          p.email                AS email
        FROM profiles p
        LEFT JOIN businesses b ON b.profile_id = p.id
        WHERE ${trialActiveSql}
      ),
      agg AS (
        SELECT
          t.business_id                             AS business_id,
          count(DISTINCT cd.id)::bigint             AS receipts,
          coalesce(sum(${lineCentsSql}), 0)::bigint AS revenue_cents
        FROM trial t
        JOIN commercial_documents cd
          ON cd.business_id = t.business_id
         AND cd.kind = 'SALE'
         AND cd.status = 'ACCEPTED'
        LEFT JOIN commercial_document_lines l ON l.document_id = cd.id
        GROUP BY t.business_id
      ),
      merchants AS (
        SELECT
          t.business_id,
          t.business_name,
          t.owner_name,
          t.location,
          t.email,
          a.receipts,
          a.revenue_cents
        FROM agg a
        JOIN trial t ON t.business_id = a.business_id
      )
      SELECT
        (SELECT count(*)::bigint FROM trial) AS active,
        (SELECT count(*)::bigint FROM agg)   AS with_receipts,
        (
          SELECT coalesce(
            json_agg(
              row_to_json(t)
              ORDER BY t.receipts DESC, t.revenue_cents DESC, t.business_id
            ),
            '[]'::json
          )
          FROM (
            SELECT * FROM merchants
            ORDER BY receipts DESC, revenue_cents DESC, business_id
            LIMIT ${LIST_LIMIT}
          ) t
        ) AS rows
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logDirectoryFailure("trial_active", null);
      return { error: TRIAL_ACTIVE_LOAD_ERROR };
    }

    return {
      trials: {
        active: toNumber(row.active),
        withReceipts: toNumber(row.with_receipts),
        merchants: toRows(row.rows).map(mapMerchant),
      },
    };
  } catch {
    logDirectoryFailure("trial_active", null);
    return { error: TRIAL_ACTIVE_LOAD_ERROR };
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
 * Documenti `SALE` fermi oltre la soglia stale, su tutti i tenant (PR
 * #904) — sostituisce il banner che si limitava a contarli: qui l'operatore
 * vede DI CHI sono e quanto valgono, non solo quanti.
 *
 * **Solo `SALE`, mai `VOID`.** Un annullo fermo non ha un "importo" proprio —
 * è la reversione di un documento altrove — e la tabella ha tre colonne
 * fisse (esercente, data scontrino, importo) che un annullo non riempirebbe
 * con lo stesso significato. `countStalePendingDocuments`
 * (`src/lib/services/ade-recovery.ts`), che alimenta anche lo sweep
 * automatico in `instrumentation-node.ts`, resta l'unico owner del conteggio che
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

/**
 * Onboarding fermo ADESSO: credenziali salvate e mai verificate, onboarding
 * non completato, trial attivo, fermo da al più `STALLED_MAX_DAYS`. Assume
 * `p`, `b`, `c` aliasati come in `getAdminSignups`. Il `c.id IS NOT NULL` non
 * è ridondante: con i `LEFT JOIN`, chi non ha credenziali ha `verified_at`
 * NULL anche lui.
 */
const stalledNowSql = sql`(
  c.id IS NOT NULL
  AND c.verified_at IS NULL
  AND b.fiscal_code IS NULL
  AND ${trialActiveSql}
  AND c.created_at >= now() - make_interval(days => ${STALLED_MAX_DAYS})
)`;

function mapSignup(row: RawRow): AdminSignupRow {
  const status = toText(row.status);
  return {
    name: toNullableText(row.name),
    email: toText(row.email),
    registeredAt: toText(row.registered_at),
    status: status === "ok" || status === "stalled" ? status : "none",
    outcome: toNullableText(row.outcome),
    attempts: toNumber(row.attempts),
    stalledSince: toNullableText(row.stalled_since),
  };
}

/**
 * Registrati del periodo più onboarding fermi (vedi `AdminSignups`), in una
 * lettura sola: era due tabelle e due query, che guardavano popolazioni
 * diverse (il periodo e "adesso") per rispondere alla stessa domanda — chi è
 * arrivato e chi si è bloccato.
 *
 * **Lo stato di una riga del periodo è un fatto, non il predicato "fermo".**
 * Un registrato del periodo con le credenziali salvate e l'onboarding non
 * completato è `stalled` anche se il trial gli è scaduto: col periodo "Da
 * inizio anno" capita, ed è giusto vederlo. I conteggi e la metà `earlier`
 * usano invece `stalledNowSql`, ancorato ad adesso.
 *
 * **Due limiti, non uno.** Con il periodo lungo i registrati riempirebbero i
 * cinquanta posti e spingerebbero fuori i fermi più vecchi, che sono quelli
 * da recuperare: ogni metà ha il suo `LIST_LIMIT`.
 *
 * Una riga per profilo: `businesses.profile_id` e `ade_credentials.business_id`
 * sono UNIQUE, quindi i `LEFT JOIN` non moltiplicano nulla.
 *
 * Degrada a `{ error }` su qualunque fallimento DB (regola 19).
 *
 * `reference` è iniettabile per i test — in produzione è sempre "adesso".
 */
export async function getAdminSignups(
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<AdminSignupsResult> {
  const { rangeStart, rangeEnd } = adminRangeParams(range, reference);
  const inRangeSql = sql`(p.created_at >= ${rangeStart} AND p.created_at < ${rangeEnd})`;

  try {
    const [row] = await runAdminRead(async (tx) => {
      return (await tx.execute(sql`
      WITH people AS (
        SELECT
          ${fullNameSql} AS name,
          p.email        AS email,
          p.created_at   AS registered_at,
          CASE
            WHEN b.fiscal_code IS NOT NULL THEN 'ok'
            WHEN c.id IS NOT NULL THEN 'stalled'
            ELSE 'none'
          END AS status,
          CASE WHEN b.fiscal_code IS NULL THEN c.last_verify_outcome END AS outcome,
          CASE WHEN b.fiscal_code IS NULL THEN coalesce(c.verify_attempts, 0) ELSE 0 END AS attempts,
          CASE WHEN b.fiscal_code IS NULL THEN c.created_at END AS stalled_since,
          ${inRangeSql}  AS in_range,
          ${stalledNowSql} AS stalled_now
        FROM profiles p
        LEFT JOIN businesses      b ON b.profile_id  = p.id
        LEFT JOIN ade_credentials c ON c.business_id = b.id
        WHERE ${inRangeSql} OR ${stalledNowSql}
      ),
      counts AS (
        SELECT
          count(*)::bigint AS total,
          count(*) FILTER (
            WHERE stalled_since >= now() - interval '7 days'
          )::bigint AS recent,
          count(*) FILTER (
            WHERE stalled_since < now() - interval '7 days'
          )::bigint AS weeks
        FROM people
        WHERE stalled_now
      )
      SELECT
        counts.total,
        counts.recent,
        counts.weeks,
        (
          SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.registered_at DESC), '[]'::json)
          FROM (
            SELECT name, email, registered_at, status, outcome, attempts, stalled_since
            FROM people
            WHERE in_range
            ORDER BY registered_at DESC
            LIMIT ${LIST_LIMIT}
          ) t
        ) AS in_range_rows,
        (
          SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.registered_at DESC), '[]'::json)
          FROM (
            SELECT name, email, registered_at, status, outcome, attempts, stalled_since
            FROM people
            WHERE NOT in_range
            ORDER BY registered_at DESC
            LIMIT ${LIST_LIMIT}
          ) t
        ) AS earlier_rows
      FROM counts
    `)) as unknown as RawRow[];
    });

    if (!row) {
      logDirectoryFailure("signups", range);
      return { error: SIGNUPS_LOAD_ERROR };
    }

    return {
      signups: {
        counts: {
          total: toNumber(row.total),
          recent: toNumber(row.recent),
          weeks: toNumber(row.weeks),
        },
        inRange: toRows(row.in_range_rows).map(mapSignup),
        earlier: toRows(row.earlier_rows).map(mapSignup),
      },
    };
  } catch {
    logDirectoryFailure("signups", range);
    return { error: SIGNUPS_LOAD_ERROR };
  }
}
