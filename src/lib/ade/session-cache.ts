/**
 * In-process cache delle sessioni AdE per riusare un singolo login Fisconline
 * su più operazioni ravvicinate dello stesso business (REVIEW #5).
 *
 * Il login Fisconline è la latenza dominante dell'emissione (~10 round-trip
 * HTTP sequenziali verso AdE), mentre il `submitSale`/`submitVoid` vero è un
 * singolo POST. Senza cache ogni operazione paga il login completo + logout.
 *
 * Assunzione single-container (coerente con CLAUDE.md): la cache vive nel
 * processo Node. Per ogni `businessId`:
 *  - un **lock async** (catena di Promise) serializza le operazioni concorrenti
 *    → due emit ravvicinate riusano un solo login invece di gareggiare;
 *  - una **entry** conserva il client autenticato (AdeSession + CookieJar) con
 *    TTL sotto la scadenza sessione AdE e cap **LRU**.
 *
 * Sicurezza (REVIEW #5.4): la entry conserva solo i cookie di sessione. Le
 * credenziali decifrate vengono re-iniettate per la singola operazione (così il
 * re-auth su 401 in `submitDocument` funziona) e **azzerate** subito dopo —
 * mai trattenute nella cache long-lived.
 */

import type { AdeClient } from "./client";
import type { FisconlineCredentials } from "./types";
import { RealAdeClient } from "./real-client";
import { logger } from "@/lib/logger";

/**
 * Client AdE che espone la gestione esplicita delle credenziali richiesta dal
 * riuso sessione. `RealAdeClient` la implementa.
 */
export interface CachedAdeClient extends AdeClient {
  setCredentials(credentials: FisconlineCredentials): void;
  clearCredentials(): void;
}

/** TTL di default: sotto la scadenza sessione AdE (~20 min osservati). */
const DEFAULT_ADE_SESSION_TTL_MS = 10 * 60 * 1000;

/** Cap LRU di default sul numero di sessioni cached in memoria. */
const DEFAULT_ADE_SESSION_MAX_ENTRIES = 100;

interface CacheEntry {
  client: CachedAdeClient;
  expiresAt: number;
}

export interface AdeSessionCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  /** Factory del client reale (override nei test). */
  createClient?: () => CachedAdeClient;
  /** Sorgente temporale (override nei test). */
  now?: () => number;
}

export class AdeSessionCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly createClient: () => CachedAdeClient;
  private readonly now: () => number;

  /** Sessioni autenticate, in ordine di accesso (insertion order = LRU). */
  private readonly entries = new Map<string, CacheEntry>();
  /** Lock per-business: coda di Promise che serializza le operazioni. */
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(options: AdeSessionCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_ADE_SESSION_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_ADE_SESSION_MAX_ENTRIES;
    this.createClient = options.createClient ?? (() => new RealAdeClient());
    this.now = options.now ?? Date.now;
  }

  /**
   * Esegue `fn` con un client AdE autenticato per `businessId`, riusando la
   * sessione cached quando possibile. Le operazioni per lo stesso business sono
   * serializzate; business diversi procedono in parallelo.
   */
  async run<T>(
    businessId: string,
    credentials: FisconlineCredentials,
    fn: (client: AdeClient) => Promise<T>,
  ): Promise<T> {
    const prev = this.chains.get(businessId) ?? Promise.resolve();
    // `prev` è sempre un guard già protetto da `.catch` (vedi sotto), quindi non
    // rifiuta mai: basta il ramo fulfilled per accodarsi dopo l'op precedente.
    const task = prev.then(() => this.execute(businessId, credentials, fn));
    const guard = task.catch(() => {});
    this.chains.set(businessId, guard);
    try {
      return await task;
    } finally {
      // Pulizia del lock quando nessun'altra operazione si è accodata.
      if (this.chains.get(businessId) === guard) {
        this.chains.delete(businessId);
      }
    }
  }

  /**
   * Invalida la sessione cached di un business (chiamato su cambio credenziali).
   * Esegue il logout best-effort e rimuove la entry.
   */
  async invalidate(businessId: string): Promise<void> {
    const entry = this.entries.get(businessId);
    if (!entry) return;
    this.entries.delete(businessId);
    await entry.client.logout().catch((err) => {
      logger.warn({ err, businessId }, "AdE session invalidate logout failed");
    });
  }

  private async execute<T>(
    businessId: string,
    credentials: FisconlineCredentials,
    fn: (client: AdeClient) => Promise<T>,
  ): Promise<T> {
    const entry = await this.acquireEntry(businessId, credentials);

    try {
      return await fn(entry.client);
    } catch (err) {
      // La sessione potrebbe essere compromessa: invalida così la prossima
      // operazione ri-effettua il login pulito invece di riusare uno stato rotto.
      this.entries.delete(businessId);
      await entry.client.logout().catch(() => {});
      throw err;
    } finally {
      // Mai trattenere le credenziali decifrate nella cache long-lived.
      entry.client.clearCredentials();
    }
  }

  private async acquireEntry(
    businessId: string,
    credentials: FisconlineCredentials,
  ): Promise<CacheEntry> {
    const existing = this.entries.get(businessId);

    if (existing && existing.expiresAt > this.now()) {
      // Cache hit: riusa la sessione, re-inietta le credenziali per il 401
      // re-auth, e sposta la entry in coda (most-recently-used).
      this.entries.delete(businessId);
      this.entries.set(businessId, existing);
      existing.client.setCredentials(credentials);
      logger.info(
        { businessId, event: "ade_session_reuse" },
        "AdE session reused",
      );
      return existing;
    }

    if (existing) {
      // Scaduta: logout best-effort e rimozione prima del nuovo login.
      this.entries.delete(businessId);
      await existing.client.logout().catch(() => {});
    }

    const client = this.createClient();
    await client.login(credentials);
    const entry: CacheEntry = { client, expiresAt: this.now() + this.ttlMs };
    this.entries.set(businessId, entry);
    this.evictIfNeeded();
    logger.info(
      { businessId, event: "ade_session_login" },
      "AdE session login",
    );
    return entry;
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) {
        void oldest.client.logout().catch(() => {});
      }
    }
  }

  /** Numero di sessioni attualmente cached (test/diagnostica). */
  get size(): number {
    return this.entries.size;
  }
}

/** Cache singleton usata in produzione. */
export const adeSessionCache = new AdeSessionCache();
