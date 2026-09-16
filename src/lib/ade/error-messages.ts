import {
  AdeAuthError,
  AdeNetworkError,
  AdeNoPartitaIvaError,
  AdePasswordExpiredError,
  AdePortalError,
  AdeSpidTimeoutError,
  AdeUnknownOutcomeError,
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
} from "./errors";
import type { AdeLoginMethod } from "./types";
import { CONTACT_EMAIL } from "@/lib/contact";

export type UserFacingAdeError = {
  message: string;
  passwordExpired?: boolean;
};

/**
 * Maps an AdE-side error to a message the end user can act on.
 *
 * The default catch sites used to return the same generic "verifica
 * credenziali" string for every failure mode, which misleads users when the
 * AdE portal itself is temporarily down (5xx) — they assume their CF /
 * password / PIN are wrong and either retry the same data or abandon the
 * onboarding. This helper distinguishes the cases that map to actionable,
 * non-blaming messages and leaves everything else to the caller's fallback.
 *
 * `method` rende i due casi d'errore più comuni (credenziali errate, secondo
 * fattore non approvato) method-aware: un utente CIE che sbaglia la password
 * non deve vedere "Credenziali Fisconline non valide. Verifica codice fiscale,
 * password e PIN" (campi che non ha mai inserito). Omesso o `"fisconline"` →
 * i messaggi Fisconline storici, così i call-site emit/void restano invariati.
 */
export function getUserFacingAdeErrorMessage(
  err: unknown,
  fallback: string,
  method?: AdeLoginMethod,
): UserFacingAdeError {
  if (err instanceof AdePasswordExpiredError) {
    return {
      message: "La password Fisconline è scaduta.",
      passwordExpired: true,
    };
  }
  if (err instanceof AdeAuthError) {
    return {
      message:
        method === "cie"
          ? "Credenziali CIE ID non valide. Verifica email e password."
          : "Credenziali Fisconline non valide. Verifica codice fiscale, password e PIN.",
    };
  }
  if (err instanceof AdeNoPartitaIvaError) {
    // SCONTRINOZERO-13: il login è riuscito, la P.IVA no. Il messaggio storico
    // ("Verifica fallita. Controlla le credenziali") mandava l'utente a
    // riscrivere credenziali già corrette — quattro tentativi in quaranta
    // secondi. Non è method-aware: la causa sta nell'utenza, non nei campi.
    return {
      message: `Le credenziali sono corrette, ma su questa utenza dell'Agenzia delle Entrate non risulta nessuna partita IVA. Se è intestata a una società o a un altro soggetto, serve l'utenza di chi la possiede: l'accesso come incaricato o delegato non è supportato. Scrivici a ${CONTACT_EMAIL} se pensi ci sia un errore.`,
    };
  }
  if (err instanceof AdeUtenzaSelectionRequiredError) {
    // Il picker non esiste ancora (REVIEW.md #106, slice 3): finché non c'è, il
    // messaggio dice quello che è vero oggi — la condizione è riconosciuta, il
    // caso non è servito — senza promettere una scelta che non possiamo offrire.
    return {
      message: `Le credenziali sono corrette, ma questo accesso opera per conto di altri soggetti e non ha una partita IVA propria. ScontrinoZero non gestisce ancora questo caso: serve l'utenza di chi possiede la partita IVA. Scrivici a ${CONTACT_EMAIL} e ti aggiorniamo appena è disponibile.`,
    };
  }
  if (err instanceof AdeUtenzaNotAvailableError) {
    return {
      message: `La partita IVA collegata a questo account non risulta più fra quelle che puoi gestire sul portale Agenzia delle Entrate. Di solito succede quando un incarico viene revocato o la società cessa. Verifica le abilitazioni sul portale, oppure scrivici a ${CONTACT_EMAIL}.`,
    };
  }
  if (err instanceof AdeNetworkError) {
    return {
      message:
        "Il portale Agenzia delle Entrate Fatture e Corrispettivi non è raggiungibile al momento. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    };
  }
  if (
    (err instanceof AdePortalError && err.statusCode >= 500) ||
    err instanceof AdeUnknownOutcomeError
  ) {
    // Esito ignoto (200 non-JSON) → stesso messaggio dei 5xx: il portale non
    // risponde in modo utilizzabile, riprova. La riga resta PENDING e la stale
    // recovery riconcilia (REVIEW.md #64), quindi il retry è sicuro.
    return {
      message:
        "Il portale Agenzia delle Entrate Fatture e Corrispettivi non risponde al momento. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    };
  }
  if (err instanceof AdeSpidTimeoutError) {
    return {
      message:
        method === "cie"
          ? "Non hai approvato la notifica sull'app CIE ID in tempo. Riprova."
          : "Non hai approvato la richiesta SPID in tempo. Riprova.",
    };
  }
  return { message: fallback };
}

/**
 * Ritorna true se l'errore è una condizione transient su cui ScontrinoZero
 * non può fare nulla (downtime AdE, rete, SPID timeout) OPPURE un esito
 * **ignoto** (`AdeUnknownOutcomeError`: 200 con body non-JSON dopo un submit).
 *
 * Usato dai catch site dei servizi AdE per due decisioni: (a) il log level —
 * i transient vanno a `warn` (non `error`) per non aprire issue Sentry spurie
 * (durante un downtime AdE da 100 utenti riceveremmo ~100 issue identiche e
 * non actionable; il logger.ts hook a livello 50 le farebbe scattare); (b) il
 * gate mark-ERROR di emit/void — quando true la riga resta **PENDING**, mai
 * ERROR. Per l'esito ignoto è cruciale: la POST può aver registrato il
 * documento su AdE, quindi marcarla ERROR la farebbe uscire dall'indice unique
 * e dalla riconciliazione pre-resubmit → rischio doppio documento fiscale
 * (REVIEW.md #64). Restando PENDING la stale recovery riconcilia contro AdE via
 * `searchDocuments` prima di ogni re-submit. Coerente con il downgrade di
 * `esito:false` (rifiuto business AdE) a `warn` fatto in 8c654b5.
 */
export function isTransientAdeError(err: unknown): boolean {
  if (err instanceof AdeNetworkError) return true;
  if (err instanceof AdeSpidTimeoutError) return true;
  if (err instanceof AdePortalError && err.statusCode >= 500) return true;
  if (err instanceof AdeUnknownOutcomeError) return true;
  return false;
}

/**
 * Ritorna true se l'errore è un caso prevedibile di **input utente
 * invalido**: credenziali Fisconline sbagliate, password scaduta che
 * l'utente deve ruotare sul portale AdE, utenza AdE senza nessuna partita
 * IVA su cui operare. Non è un bug del nostro sistema più di quanto lo sia
 * "password sbagliata" su `/login`.
 *
 * Conseguenza per il logging: come per `isTransientAdeError`, va
 * loggato a `warn` (non `error`) — niente issue Sentry. Storico:
 * SCONTRINOZERO-7 ha accumulato 23 eventi in 5 settimane prima di
 * essere archiviata come noise perché tutte le auth-failure salivano
 * a Sentry come issue. Regola 20 di `CLAUDE.md`.
 */
export function isExpectedUserAdeError(err: unknown): boolean {
  if (err instanceof AdeAuthError) return true;
  if (err instanceof AdePasswordExpiredError) return true;
  // SCONTRINOZERO-13: utenza AdE senza partita IVA. Il login è andato a buon
  // fine, quindi non è un guasto nostro né del portale; è deterministico
  // (nessun retry produce una P.IVA che non esiste) e si corregge solo
  // cambiando utenza. Resta tracciabile via il log `ade:wizard_piva_missing`
  // nel dataset Sentry `logs` — trigger di riapertura in REVIEW.md #106.
  if (err instanceof AdeNoPartitaIvaError) return true;
  // Utenza di lavoro: richiede una scelta che non abbiamo, o punta a un
  // incarico che il portale non offre più. Entrambe deterministiche — nessun
  // retry le risolve — e correggibili solo lato utente/portale.
  if (err instanceof AdeUtenzaSelectionRequiredError) return true;
  if (err instanceof AdeUtenzaNotAvailableError) return true;
  return false;
}
