/**
 * In-process cache delle sessioni AdE per riusare un singolo login Fisconline
 * su più operazioni ravvicinate dello stesso business (PR #624).
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
 *    TTL sotto la scadenza sessione AdE e cap **LRU**;
 *  - un **rifiuto** ricorda l'ultimo login respinto per credenziali (errate,
 *    password scaduta, utenza bloccata), così le operazioni già in coda non lo
 *    ripetono con la stessa password (issue #1099).
 *
 * Sicurezza (PR #624): la entry conserva solo i cookie di sessione. Le
 * credenziali decifrate vengono re-iniettate per la singola operazione (così il
 * re-auth su 401 in `submitDocument` funziona) e **azzerate** subito dopo —
 * mai trattenute nella cache long-lived.
 */

import type { AdeClient } from "./client";
import type { FisconlineCredentials } from "./types";
import { RealAdeClient } from "./real-client";
import { loginRejectionOutcome } from "./verify-outcome";
import { logger } from "@/lib/logger";

/**
 * Client AdE che espone la gestione esplicita delle credenziali richiesta dal
 * riuso sessione. `RealAdeClient` la implementa.
 */
export interface CachedAdeClient extends AdeClient {
  setCredentials(credentials: FisconlineCredentials): void;
  clearCredentials(): void;
}

/**
 * Gli input della procedura di login, come li legge `fetchAdePrerequisites`
 * dalla riga `ade_credentials`.
 *
 * `utenzaPiva` sta qui e non dentro `FisconlineCredentials` perché non è un
 * segreto e non è un'identità: è la scelta di **su quale partita IVA
 * operare** fra quelle che quell'accesso offre (HAR.md #18, migrazione 0037).
 * Va rigiocata a ogni login — quello che apre la sessione come quello che la
 * rinnova su 401 — o il portale ripropone la scelta a un'operazione automatica,
 * che non ha nessuno davanti a cui riproporla.
 */
export interface AdeLoginInputs {
  credentials: FisconlineCredentials;
  utenzaPiva?: string;
  /**
   * `ade_credentials.updated_at` letto insieme alle credenziali. Identifica
   * *quali* credenziali sono state rifiutate: un salvataggio o una verifica
   * riuscita lo cambiano, e da lì il login torna a essere tentato.
   */
  credentialVersion: Date;
}

interface RejectedLogin {
  credentialVersion: number;
  error: Error;
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
  /**
   * Ultimo rifiuto delle credenziali per business (issue #1099). Copre le
   * operazioni già accodate nel lock, che hanno letto le credenziali prima
   * che il rifiuto arrivasse al DB: con lo stesso `credentialVersion`
   * falliscono senza contattare l'AdE. Stesso cap LRU delle sessioni.
   */
  private readonly rejections = new Map<string, RejectedLogin>();

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
    login: AdeLoginInputs,
    fn: (client: AdeClient) => Promise<T>,
  ): Promise<T> {
    const prev = this.chains.get(businessId) ?? Promise.resolve();
    // `prev` è sempre un guard già protetto da `.catch` (vedi sotto), quindi non
    // rifiuta mai: basta il ramo fulfilled per accodarsi dopo l'op precedente.
    const task = prev.then(() => this.execute(businessId, login, fn));
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
    this.rejections.delete(businessId);
    const entry = this.entries.get(businessId);
    if (!entry) return;
    this.entries.delete(businessId);
    await entry.client.logout().catch((err) => {
      logger.warn({ err, businessId }, "AdE session invalidate logout failed");
    });
  }

  private async execute<T>(
    businessId: string,
    login: AdeLoginInputs,
    fn: (client: AdeClient) => Promise<T>,
  ): Promise<T> {
    this.throwIfRejected(businessId, login);

    let entry: CacheEntry;
    try {
      entry = await this.acquireEntry(businessId, login);
    } catch (err) {
      this.recordRejection(businessId, login, err);
      throw err;
    }

    try {
      return await fn(entry.client);
    } catch (err) {
      // La sessione potrebbe essere compromessa: invalida così la prossima
      // operazione ri-effettua il login pulito invece di riusare uno stato rotto.
      this.entries.delete(businessId);
      await entry.client.logout().catch(() => {});
      // Un rifiuto qui viene dalla re-auth su 401 dentro l'operazione.
      this.recordRejection(businessId, login, err);
      throw err;
    } finally {
      // Mai trattenere le credenziali decifrate nella cache long-lived.
      entry.client.clearCredentials();
    }
  }

  /**
   * Rilancia il rifiuto già ricevuto se l'operazione porta le stesse
   * credenziali: un secondo login con la stessa password sbagliata è solo un
   * passo in più verso il blocco dell'utenza.
   */
  private throwIfRejected(businessId: string, login: AdeLoginInputs): void {
    const rejected = this.rejections.get(businessId);
    if (
      !rejected ||
      rejected.credentialVersion !== login.credentialVersion.getTime()
    ) {
      return;
    }
    logger.info(
      { businessId, event: "ade_login_skipped_rejected_credentials" },
      "AdE login skipped: stored credentials already rejected",
    );
    throw rejected.error;
  }

  private recordRejection(
    businessId: string,
    login: AdeLoginInputs,
    err: unknown,
  ): void {
    if (!(err instanceof Error) || !loginRejectionOutcome(err)) return;
    // delete + set: la entry più recente va in coda, come per le sessioni.
    this.rejections.delete(businessId);
    this.rejections.set(businessId, {
      credentialVersion: login.credentialVersion.getTime(),
      error: err,
    });
    trimOldest(this.rejections, this.maxEntries);
  }

  private async acquireEntry(
    businessId: string,
    login: AdeLoginInputs,
  ): Promise<CacheEntry> {
    const existing = this.entries.get(businessId);

    if (existing && existing.expiresAt > this.now()) {
      // Cache hit: riusa la sessione, re-inietta le credenziali per il 401
      // re-auth, e sposta la entry in coda (most-recently-used).
      this.entries.delete(businessId);
      this.entries.set(businessId, existing);
      // Solo le credenziali: `utenzaPiva` è già sul client dal suo login e
      // `clearCredentials` non la tocca — non è un segreto, è un parametro
      // della procedura.
      existing.client.setCredentials(login.credentials);
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
    await client.login(login.credentials, login.utenzaPiva);
    this.rejections.delete(businessId);
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
    for (const oldest of trimOldest(this.entries, this.maxEntries)) {
      void oldest.client.logout().catch(() => {});
    }
  }

  /** Numero di sessioni attualmente cached (test/diagnostica). */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Toglie da `map` le chiavi più vecchie (ordine d'inserimento = LRU) finché
 * non rientra in `max`, e restituisce i valori tolti.
 */
function trimOldest<K, V>(map: Map<K, V>, max: number): V[] {
  const removed: V[] = [];
  for (const [key, value] of map) {
    if (map.size <= max) break;
    map.delete(key);
    removed.push(value);
  }
  return removed;
}

/** Cache singleton usata in produzione. */
export const adeSessionCache = new AdeSessionCache();
