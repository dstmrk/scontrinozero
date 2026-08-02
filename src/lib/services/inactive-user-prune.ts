import { createElement } from "react";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { getTrustedAppUrl } from "@/lib/trusted-app-url";
import { isPaidPlanExpired, isPlan, type Plan } from "@/lib/plans-shared";
import { purgeUserById } from "@/lib/services/purge-user";
import { AccountInactivityWarningEmail } from "@/emails/account-inactivity-warning";
import { AccountInactivityDeletionEmail } from "@/emails/account-inactivity-deletion";
import {
  readPruneConfig,
  type PruneConfig,
} from "./inactive-user-prune-config";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Un account è PROTETTO dalla cancellazione per inattività (mai warn, mai
 * delete, e se già preavvisato viene azzerato) se:
 *   - `unlimited` (invite-only, esente per design), oppure
 *   - piano a pagamento (`starter`/`pro`/`developer_*`) ANCORA attivo — cioè NON
 *     scaduto oltre la grazia (`isPaidPlanExpired` = false). Un piano pagato con
 *     `planExpiresAt` null è considerato attivo → protetto (fail-safe: nel dubbio
 *     non si cancella chi paga).
 *
 * NON protetti: `trial` (qualsiasi stato) e i piani a pagamento scaduti oltre la
 * grazia. Un valore `plan` non riconosciuto (drift schema) è trattato come
 * protetto — non si cancella su un dato ambiguo.
 */
export function isProtectedFromPrune(
  plan: string,
  planExpiresAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (!isPlan(plan)) return true;
  if (plan === "unlimited") return true;
  if (plan === "trial") return false;
  return !isPaidPlanExpired(plan as Plan, planExpiresAt, now);
}

type CandidateRow = {
  auth_user_id: string;
  email: string;
  first_name: string | null;
  plan: string;
  plan_expires_at: Date | string | null;
  inactivity_warning_sent_at: Date | string | null;
  last_activity_at: Date | string;
};

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

async function setWarningSentAt(
  authUserId: string,
  value: Date | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(profiles)
    .set({ inactivityWarningSentAt: value })
    .where(eq(profiles.authUserId, authUserId));
}

/**
 * Sweep GDPR di cancellazione utenti inattivi (PLAN.md v1.4.2, base legale:
 * minimizzazione dati, art. 5(1)(e) GDPR). Processo in due fasi, entrambe
 * eseguite in questa passata:
 *
 *   1. PREAVVISO — inattività ≥ (deleteAfterDays − warnBeforeDays) e nessun
 *      preavviso pendente → email di avviso + `inactivity_warning_sent_at = now`.
 *   2. CANCELLAZIONE — inattività ≥ deleteAfterDays E preavviso inviato ≥
 *      warnBeforeDays fa → `purgeUserById` (cascata) + email di conferma.
 *
 * Inattività = `MAX(ultimo scontrino, last_sign_in_at, last_seen_at,
 * profiles.created_at)`: l'utente è "attivo" se ha emesso uno scontrino OPPURE
 * ha effettuato login OPPURE ha visitato l'app autenticato (`last_seen_at`,
 * touch throttled in `getAuthenticatedUser` — necessario perché
 * `last_sign_in_at` NON si aggiorna sul refresh token e un utente PWA con
 * sessione persistente in sola lettura risulterebbe inattivo). Il floor a
 * `created_at` evita di cancellare un iscritto recente senza attività.
 *
 * RESET — se un utente preavvisato torna attivo (attività rientrata nella
 * finestra di warn) o diventa protetto (es. si abbona), il flag viene azzerato,
 * così una futura inattività riparte con un preavviso completo.
 *
 * Esclusi (`isProtectedFromPrune`): `unlimited` e abbonati a pagamento attivi.
 *
 * Resiliente: ogni utente è processato in try/catch isolato — un fallimento
 * (email/DB/purge) logga `warn` e non aborta il batch. È una server-side sweep:
 * degrada, non lancia (CLAUDE.md regola 19).
 */
export async function pruneInactiveUsers(
  now: Date = new Date(),
  config: PruneConfig = readPruneConfig(),
): Promise<{ warned: number; deleted: number; reset: number }> {
  const nowMs = now.getTime();
  const warnCutoff = new Date(
    nowMs - (config.deleteAfterDays - config.warnBeforeDays) * MS_PER_DAY,
  );
  const deleteCutoff = new Date(nowMs - config.deleteAfterDays * MS_PER_DAY);
  const warnGraceCutoff = new Date(nowMs - config.warnBeforeDays * MS_PER_DAY);

  const db = getDb();

  // Un solo giro DB: seleziona i profili inattivi oltre la soglia di preavviso
  // OPPURE con un preavviso pendente (per gestire delete/reset). `last_sign_in_at`
  // vive in `auth.users` (schema auth di Supabase): la connessione diretta
  // Postgres (non PostgREST) la legge senza problemi di RLS.
  let rows: CandidateRow[];
  try {
    const result = await db.execute<CandidateRow>(sql`
      SELECT
        p.auth_user_id AS auth_user_id,
        p.email AS email,
        p.first_name AS first_name,
        p.plan AS plan,
        p.plan_expires_at AS plan_expires_at,
        p.inactivity_warning_sent_at AS inactivity_warning_sent_at,
        GREATEST(
          p.created_at,
          COALESCE(u.last_sign_in_at, p.created_at),
          COALESCE(p.last_seen_at, p.created_at),
          COALESCE(d.last_doc_at, p.created_at)
        ) AS last_activity_at
      FROM profiles p
      LEFT JOIN auth.users u ON u.id = p.auth_user_id
      LEFT JOIN (
        SELECT b.profile_id AS profile_id, MAX(cd.created_at) AS last_doc_at
        FROM businesses b
        JOIN commercial_documents cd ON cd.business_id = b.id
        GROUP BY b.profile_id
      ) d ON d.profile_id = p.id
      WHERE
        GREATEST(
          p.created_at,
          COALESCE(u.last_sign_in_at, p.created_at),
          COALESCE(p.last_seen_at, p.created_at),
          COALESCE(d.last_doc_at, p.created_at)
        ) < ${warnCutoff.toISOString()}::timestamptz
        OR p.inactivity_warning_sent_at IS NOT NULL
    `);
    rows = result as unknown as CandidateRow[];
  } catch (err) {
    logger.error({ err }, "pruneInactiveUsers: query candidati fallita");
    return { warned: 0, deleted: 0, reset: 0 };
  }

  const ctx: PruneContext = {
    now,
    nowMs,
    warnCutoff,
    deleteCutoff,
    warnGraceCutoff,
    warnBeforeDays: config.warnBeforeDays,
    loginUrl: safeLoginUrl(),
  };

  const counts: Record<PruneAction, number> = {
    warned: 0,
    deleted: 0,
    reset: 0,
    none: 0,
  };

  for (const row of rows) {
    try {
      counts[await processCandidate(row, ctx)]++;
    } catch (err) {
      logger.warn(
        { err },
        "pruneInactiveUsers: elaborazione utente fallita (batch continua)",
      );
    }
  }

  const { warned, deleted, reset } = counts;
  if (warned > 0 || deleted > 0 || reset > 0) {
    logger.info(
      { warned, deleted, reset },
      "pruneInactiveUsers: sweep completato",
    );
  }

  return { warned, deleted, reset };
}

type PruneAction = "warned" | "deleted" | "reset" | "none";

type PruneContext = {
  now: Date;
  nowMs: number;
  warnCutoff: Date;
  deleteCutoff: Date;
  warnGraceCutoff: Date;
  warnBeforeDays: number;
  loginUrl: string;
};

/**
 * Classifica ed esegue l'azione (warn/delete/reset/none) per un singolo
 * candidato. Estratta da `pruneInactiveUsers` per contenere la complessità
 * cognitiva: qui vive tutta la logica decisionale, là resta solo il loop.
 */
async function processCandidate(
  row: CandidateRow,
  ctx: PruneContext,
): Promise<PruneAction> {
  const lastActivity = toDate(row.last_activity_at);
  if (!lastActivity) return "none";
  const planExpiresAt = toDate(row.plan_expires_at);
  const warningSentAt = toDate(row.inactivity_warning_sent_at);
  const protectedNow = isProtectedFromPrune(row.plan, planExpiresAt, ctx.nowMs);
  const inactivePastWarn = lastActivity < ctx.warnCutoff;

  // RESET: preavvisato ma non più eleggibile (tornato attivo o protetto).
  if (warningSentAt && (!inactivePastWarn || protectedNow)) {
    await setWarningSentAt(row.auth_user_id, null);
    return "reset";
  }

  if (protectedNow) return "none";

  // DELETE: 12 mesi di inattività + preavviso inviato ≥ warnBeforeDays fa.
  if (
    lastActivity < ctx.deleteCutoff &&
    warningSentAt &&
    warningSentAt <= ctx.warnGraceCutoff
  ) {
    return await deleteCandidate(row, ctx);
  }

  // WARN: inattivo oltre la soglia di preavviso, nessun avviso pendente.
  if (inactivePastWarn && !warningSentAt) {
    await warnCandidate(row, ctx);
    return "warned";
  }

  return "none";
}

/**
 * Ri-legge la riga di UN candidato con la stessa shape della SELECT dei
 * candidati. Ritorna `null` se la riga non esiste più o se la query fallisce —
 * in entrambi i casi il chiamante NON deve cancellare (fail-safe).
 *
 * L'aggregato sui documenti è una subquery correlata invece del LEFT JOIN
 * raggruppato della SELECT dei candidati: su un singolo profilo evita di
 * aggregare `commercial_documents` per TUTTI i business, che è esattamente il
 * costo che questa query non deve reintrodurre.
 */
async function reReadCandidate(
  authUserId: string,
): Promise<CandidateRow | null> {
  try {
    const result = await getDb().execute<CandidateRow>(sql`
      SELECT
        p.auth_user_id AS auth_user_id,
        p.email AS email,
        p.first_name AS first_name,
        p.plan AS plan,
        p.plan_expires_at AS plan_expires_at,
        p.inactivity_warning_sent_at AS inactivity_warning_sent_at,
        GREATEST(
          p.created_at,
          COALESCE(u.last_sign_in_at, p.created_at),
          COALESCE(p.last_seen_at, p.created_at),
          COALESCE((
            SELECT MAX(cd.created_at)
            FROM businesses b
            JOIN commercial_documents cd ON cd.business_id = b.id
            WHERE b.profile_id = p.id
          ), p.created_at)
        ) AS last_activity_at
      FROM profiles p
      LEFT JOIN auth.users u ON u.id = p.auth_user_id
      WHERE p.auth_user_id = ${authUserId}
    `);
    const rows = result as unknown as CandidateRow[];
    return rows[0] ?? null;
  } catch (err) {
    logger.warn(
      { err },
      "pruneInactiveUsers: ri-lettura candidato fallita, purge saltato",
    );
    return null;
  }
}

/**
 * Cancella l'account (cascata) e invia l'email di conferma (fire-and-forget).
 *
 * ⚠️ Prima del purge ri-legge la riga e ri-valida l'eleggibilità (REVIEW.md
 * #40): lo snapshot dei candidati è preso a inizio sweep, ma il loop processa
 * gli utenti in sequenza con side-effect lenti (email fino a 8s l'una, retry del
 * purge), quindi il batch può durare minuti. Un utente che si abbona o torna
 * attivo TRA la SELECT e l'elaborazione della sua riga verrebbe altrimenti
 * cancellato su un dato vecchio — su un'operazione irreversibile.
 *
 * Costo: una query in più SOLO sul ramo delete (raro), zero sul warn.
 */
async function deleteCandidate(
  row: CandidateRow,
  ctx: PruneContext,
): Promise<PruneAction> {
  const fresh = await reReadCandidate(row.auth_user_id);
  if (!fresh) return "none";

  const verdict = deleteVerdict(fresh, ctx);
  if (verdict !== "deleted") {
    logger.warn(
      { authUserId: row.auth_user_id, verdict },
      "pruneInactiveUsers: candidato non più eleggibile alla ri-lettura, purge saltato",
    );
    // Tornato attivo o protetto con un preavviso pendente: azzera il flag, così
    // una futura inattività riparte con un preavviso completo (stessa regola del
    // ramo RESET di processCandidate).
    if (verdict === "reset") await setWarningSentAt(row.auth_user_id, null);
    return verdict;
  }

  const { authDeleted } = await purgeUserById(row.auth_user_id);
  if (!authDeleted) return "none";
  void sendEmail({
    to: row.email,
    subject: "Il tuo account ScontrinoZero è stato eliminato",
    react: createElement(AccountInactivityDeletionEmail, {
      email: row.email,
    }),
  }).catch((err) =>
    logger.warn(
      { err },
      "pruneInactiveUsers: email conferma cancellazione fallita",
    ),
  );
  return "deleted";
}

/**
 * Verdetto di eleggibilità al delete su una riga FRESCA (ri-lettura pre-purge).
 * Stessa gerarchia di regole di `processCandidate`, applicata al dato appena
 * riletto: `reset` se l'utente è tornato attivo o protetto con un preavviso
 * pendente, `deleted` se le tre condizioni del delete reggono ancora, `none`
 * altrimenti.
 */
function deleteVerdict(row: CandidateRow, ctx: PruneContext): PruneAction {
  const lastActivity = toDate(row.last_activity_at);
  if (!lastActivity) return "none";

  const warningSentAt = toDate(row.inactivity_warning_sent_at);
  const protectedNow = isProtectedFromPrune(
    row.plan,
    toDate(row.plan_expires_at),
    ctx.nowMs,
  );
  const inactivePastWarn = lastActivity < ctx.warnCutoff;

  if (warningSentAt && (!inactivePastWarn || protectedNow)) return "reset";
  if (protectedNow) return "none";
  if (
    lastActivity < ctx.deleteCutoff &&
    warningSentAt &&
    warningSentAt <= ctx.warnGraceCutoff
  ) {
    return "deleted";
  }
  return "none";
}

/** Invia l'email di preavviso e registra il timestamp di invio. */
async function warnCandidate(
  row: CandidateRow,
  ctx: PruneContext,
): Promise<void> {
  const deletionDate = new Date(ctx.nowMs + ctx.warnBeforeDays * MS_PER_DAY);
  await sendEmail({
    to: row.email,
    subject:
      "Il tuo account ScontrinoZero sta per essere eliminato per inattività",
    react: createElement(AccountInactivityWarningEmail, {
      firstName: row.first_name ?? "",
      deletionDate,
      loginUrl: ctx.loginUrl,
    }),
  });
  await setWarningSentAt(row.auth_user_id, ctx.now);
}

/** URL di login per la CTA dell'email di preavviso; degrada al dominio prod. */
function safeLoginUrl(): string {
  try {
    return `${getTrustedAppUrl()}/login`;
  } catch {
    return "https://app.scontrinozero.it/login";
  }
}
