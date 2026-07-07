import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    authUserId: uuid("auth_user_id").notNull().unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    // Unique case-insensitive — enforced via functional index lower(email) in migration 0008.
    // Application layer normalises to lower-case before any insert/select.
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    // Stripe / billing
    plan: text("plan").notNull().default("trial"),
    trialStartedAt: timestamp("trial_started_at", {
      withTimezone: true,
    }).defaultNow(),
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    // Anti-abuso trial: UNIQUE per P.IVA
    partitaIva: text("partita_iva").unique(),
    // Attribution: provenance from ?ref= query string at signup time.
    // Validated against allowlist in src/lib/signup-source.ts before insert.
    signupSource: text("signup_source"),
    // Referral program (member-get-member). Codice personale riusabile,
    // derivato deterministicamente dall'authUserId all'INSERT
    // (src/lib/referral-code.ts). Distinto dal futuro `referred_by` del
    // programma Partner (NDS, monouso, B2B). NOT NULL: i profili
    // pre-esistenti alla migration 0021 sono stati backfillati in SQL nella
    // migration stessa (replica esatta dell'algoritmo JS), nessun intervento
    // manuale richiesto.
    referralCode: text("referral_code").notNull().unique(),
    // Codice referral usato da QUESTO utente in fase di signup (audit, NULL
    // se nessun referral). Nome distinto da `referred_by` per non confondersi
    // con l'attribution partner futura.
    referredByReferralCode: text("referred_by_referral_code"),
    // Giorni bonus accumulati via referral (proprio +1 mese da nuovo utente +
    // reward come referrer). Additivo, mai scritto dal webhook Stripe — vedi
    // src/lib/plans.ts fetchPlan(). Per `unlimited` è ininfluente: i gate non
    // leggono planExpiresAt/trialStartedAt per quel piano.
    referralBonusDays: integer("referral_bonus_days").notNull().default(0),
    // Onboarding tour dashboard (PLAN.md v1.4.1): timestamp del primo
    // completamento/skip del walkthrough guidato. NULL = mai visto → il tour
    // viene mostrato al primo accesso al dashboard. Per-utente (non per-device):
    // sopravvive a cambio dispositivo e reinstallazione PWA. Migration 0025 ha
    // backfillato i profili pre-esistenti a now() (solo i nuovi vedono il tour).
    onboardingTourSeenAt: timestamp("onboarding_tour_seen_at", {
      withTimezone: true,
    }),
    // GDPR — cancellazione utenti inattivi >12 mesi (PLAN.md v1.4.2, migration
    // 0026): timestamp dell'invio dell'email di PREAVVISO cancellazione. Lo
    // sweep periodico (src/lib/services/inactive-user-prune.ts) cancella solo se
    // questo valore è ≥30 giorni fa (grace period), e lo azzera se l'utente
    // torna attivo (nuovo scontrino, login o visita autenticata). NULL =
    // nessun preavviso pendente.
    inactivityWarningSentAt: timestamp("inactivity_warning_sent_at", {
      withTimezone: true,
    }),
    // GDPR — segnale "visita autenticata" (migration 0028): ultima richiesta
    // autenticata, touch throttled 1/24h in getAuthenticatedUser
    // (src/lib/server-auth.ts). Serve allo sweep di inattività perché
    // auth.users.last_sign_in_at NON si aggiorna sul refresh token: senza
    // questo, un utente PWA con sessione persistente in sola lettura
    // risulterebbe inattivo. NULL = nessuna visita registrata dal deploy
    // della colonna (il GREATEST dello sweep ha il floor a created_at).
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => [
    // Defense-in-depth (migration 0019): 254 = RFC 5321 max address length.
    check(
      "profiles_email_length_check",
      sql`char_length(${table.email}) <= 254`,
    ),
  ],
);

export type InsertProfile = typeof profiles.$inferInsert;
export type SelectProfile = typeof profiles.$inferSelect;
