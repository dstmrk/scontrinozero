/**
 * Store in-memory delle sessioni AdE stabilite in modo INTERATTIVO (CIE).
 *
 * A differenza di Fisconline — dove il server conserva le credenziali e può
 * rifare il login in silenzio su 401 (`session-cache.ts`) — una sessione CIE è
 * stabilita da un login con secondo fattore umano (push sull'app CIE ID) e NON
 * è ri-creabile senza una nuova azione dell'utente. Quindi qui NON si fa login:
 * il client già autenticato viene depositato da `verifyAdeCredentials` (il
 * "collega/rinnova") e riusato per emissione/annullo finché AdE lo accetta.
 *
 * Rinnovo lazy: `run` prova la sessione depositata; se assente o rifiutata da
 * AdE (401 → `AdeSessionExpiredError`) solleva `AdeReauthRequiredError`, che
 * emit/void traducono in `{ reauthRequired }` per chiedere all'utente di
 * ri-collegarsi. Nessun TTL "indovinato" come scadenza logica: il TTL è solo un
 * cap di memoria ampio (sopra la durata tipica della sessione AdE); la scadenza
 * reale è segnalata da AdE.
 *
 * Assunzione single-container (coerente con CLAUDE.md): lo store vive nel
 * processo. Un deploy/restart perde le sessioni → l'utente ri-collega (atteso).
 */

import type { AdeClient } from "./client";
import { AdeReauthRequiredError, AdeSessionExpiredError } from "./errors";
import { logger } from "@/lib/logger";

/** TTL di default: cap di memoria ampio (6h), NON la scadenza logica AdE. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

/** Cap LRU di default sul numero di sessioni interattive in memoria. */
const DEFAULT_MAX_ENTRIES = 100;

interface Entry {
  client: AdeClient;
  expiresAt: number;
}

export interface AdeInteractiveSessionStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class AdeInteractiveSessionStore {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  private readonly entries = new Map<string, Entry>();
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(options: AdeInteractiveSessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  /**
   * Deposita un client CIE già autenticato per il business, sostituendo
   * (con logout best-effort) un'eventuale sessione precedente.
   */
  set(businessId: string, client: AdeClient): void {
    const existing = this.entries.get(businessId);
    if (existing && existing.client !== client) {
      void existing.client.logout().catch(() => {});
    }
    this.entries.delete(businessId);
    this.entries.set(businessId, {
      client,
      expiresAt: this.now() + this.ttlMs,
    });
    this.evictIfNeeded();
    logger.info(
      { businessId, event: "ade_interactive_session_set" },
      "AdE interactive session stored",
    );
  }

  /** True se esiste una sessione interattiva viva per il business. */
  has(businessId: string): boolean {
    const entry = this.entries.get(businessId);
    return !!entry && entry.expiresAt > this.now();
  }

  /**
   * Esegue `fn` con il client CIE depositato, serializzando le operazioni per
   * business. Solleva `AdeReauthRequiredError` se la sessione è assente/scaduta
   * o se AdE la rifiuta durante l'operazione (`AdeSessionExpiredError`).
   */
  async run<T>(
    businessId: string,
    fn: (client: AdeClient) => Promise<T>,
  ): Promise<T> {
    const prev = this.chains.get(businessId) ?? Promise.resolve();
    const task = prev.then(() => this.execute(businessId, fn));
    const guard = task.catch(() => {});
    this.chains.set(businessId, guard);
    try {
      return await task;
    } finally {
      if (this.chains.get(businessId) === guard) {
        this.chains.delete(businessId);
      }
    }
  }

  private async execute<T>(
    businessId: string,
    fn: (client: AdeClient) => Promise<T>,
  ): Promise<T> {
    const entry = this.entries.get(businessId);
    if (!entry || entry.expiresAt <= this.now()) {
      if (entry) {
        this.entries.delete(businessId);
        void entry.client.logout().catch(() => {});
      }
      logger.warn(
        { businessId, event: "ade_interactive_session_missing" },
        "AdE interactive session missing/expired — reauth required",
      );
      throw new AdeReauthRequiredError("cie");
    }

    // MRU refresh (access order = LRU).
    this.entries.delete(businessId);
    this.entries.set(businessId, entry);

    try {
      return await fn(entry.client);
    } catch (err) {
      if (err instanceof AdeSessionExpiredError) {
        // AdE ha rifiutato la sessione (401): non ri-creabile in silenzio.
        this.entries.delete(businessId);
        void entry.client.logout().catch(() => {});
        logger.warn(
          { businessId, event: "ade_interactive_session_expired" },
          "AdE interactive session rejected by AdE — reauth required",
        );
        throw new AdeReauthRequiredError("cie");
      }
      throw err;
    }
  }

  /** Rimuove (con logout best-effort) la sessione di un business. */
  async invalidate(businessId: string): Promise<void> {
    const entry = this.entries.get(businessId);
    if (!entry) return;
    this.entries.delete(businessId);
    await entry.client.logout().catch(() => {});
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) void oldest.client.logout().catch(() => {});
    }
  }

  /** Numero di sessioni attualmente depositate (test/diagnostica). */
  get size(): number {
    return this.entries.size;
  }
}

/** Store singleton usato in produzione. */
export const adeInteractiveSessionStore = new AdeInteractiveSessionStore();
