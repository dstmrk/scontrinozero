import { logger } from "@/lib/logger";

/**
 * Banner annunci globale per l'app autenticata (es. manutenzione programmata).
 *
 * Guidato da env var **a runtime** (NON `NEXT_PUBLIC_*`, che sarebbero baked al
 * build): per accendere/spegnere basta editare il `.env` del container e
 * riavviarlo (`docker compose up -d`), senza rebuild. Allineato al pattern di
 * `NEW_SIGNUP_NOTIFICATION_EMAIL` (no-op quando la var è assente).
 *
 *   ANNOUNCEMENT_MESSAGE  testo del banner; assente/vuoto = nessun banner
 *   ANNOUNCEMENT_LEVEL    info | warning | critical (default info)
 *
 * `critical` non è chiudibile dall'utente; `info`/`warning` sì, e il dismiss è
 * persistito client-side su una chiave derivata dal contenuto del messaggio →
 * cambiando annuncio il banner ricompare anche per chi aveva chiuso il vecchio.
 */

export type AnnouncementLevel = "info" | "warning" | "critical";

const LEVELS: readonly AnnouncementLevel[] = ["info", "warning", "critical"];

export interface Announcement {
  message: string;
  level: AnnouncementLevel;
  dismissible: boolean;
  dismissKey: string;
}

function normalizeLevel(raw: string | undefined): AnnouncementLevel {
  if (!raw) return "info";
  const value = raw.trim().toLowerCase();
  if ((LEVELS as readonly string[]).includes(value)) {
    return value as AnnouncementLevel;
  }
  logger.warn(
    { announcementLevel: raw },
    "Unrecognized ANNOUNCEMENT_LEVEL, defaulting to 'info'",
  );
  return "info";
}

/**
 * Hash deterministico (djb2) del messaggio → chiave di dismiss stabile.
 * Non serve robustezza crittografica: serve solo che la stessa stringa produca
 * sempre la stessa chiave e che un messaggio diverso ne produca una diversa.
 */
function hashMessage(message: string): string {
  let hash = 5381;
  for (const char of message) {
    hash = (hash * 33) ^ (char.codePointAt(0) ?? 0);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Legge la configurazione del banner dalle env a runtime.
 * Ritorna `null` quando non c'è nessun annuncio attivo (var assente o vuota).
 */
export function getAnnouncement(): Announcement | null {
  const message = process.env.ANNOUNCEMENT_MESSAGE?.trim();
  if (!message) return null;

  const level = normalizeLevel(process.env.ANNOUNCEMENT_LEVEL);

  return {
    message,
    level,
    dismissible: level !== "critical",
    dismissKey: `announcement-dismissed:${hashMessage(message)}`,
  };
}
