import { unstable_isUnrecognizedActionError } from "next/navigation";
import { safeSessionStorage } from "@/lib/safe-storage";

/**
 * Deploy skew: la scheda ha il bundle della release N-1 e chiama una Server
 * Action che nel build N non esiste più.
 *
 * Next genera gli ID delle Server Action in modo NON deterministico a ogni
 * build (docs "failed-to-find-server-action"): ogni release invalida gli ID in
 * mano alle sessioni già aperte, il POST torna con la risposta
 * "action not found" e `fetchServerAction` lancia `UnrecognizedActionError`.
 * Non è prevenibile da noi — Skew Protection è di Vercel e
 * `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` riguarda il multi-istanza, mentre qui
 * il container è uno solo — e Next non tenta alcun recupero: il reducer
 * rigetta la promise dell'action e basta. La cura è quella che Next stesso
 * documenta, ricaricare la pagina per prendere il bundle nuovo.
 *
 * Perché ci importa (SCONTRINOZERO-Z): dentro `startTransition` React 19
 * rilancia l'errore dell'action al boundary più vicino. Un esercente a metà
 * onboarding, con le credenziali CIE appena digitate, si è ritrovato sulla
 * pagina d'errore con "Riprova" che non poteva funzionare — il bundle vecchio
 * è ancora in memoria, l'ID resta introvabile. Con una PWA installata e più
 * release al giorno, il caso si ripresenta a ogni deploy.
 *
 * L'azione NON è stata eseguita: il server ha rifiutato la richiesta prima di
 * arrivare al nostro codice. Il reload non perde nulla di registrato.
 */

/**
 * Marcatore dell'ultimo reload automatico. Sta in `sessionStorage` perché è la
 * sola memoria che sopravvive al reload (che azzera ogni stato di modulo) e
 * muore con la scheda.
 */
const RELOAD_MARK_KEY = "sz.deploy-skew-reload-at";

/**
 * Finestra entro cui non ritentiamo il reload automatico. Copre il caso in cui
 * ricaricare non risolve (bundle vecchio riservito da una cache): invece di
 * rimbalzare l'utente una seconda volta gli offriamo il ricarico manuale.
 * Oltre la finestra il reload torna disponibile, perché una scheda aperta a
 * lungo incontra più release.
 */
export const DEPLOY_SKEW_RELOAD_COOLDOWN_MS = 30_000;

/** True se l'errore arrivato al boundary è un deploy skew. */
export function isDeploySkewError(error: unknown): boolean {
  if (unstable_isUnrecognizedActionError(error)) return true;
  // Il predicato di Next è un `instanceof`: se il suo modulo finisse duplicato
  // in due chunk l'identità della classe non combacerebbe e lo skew tornerebbe
  // invisibile. `name` è assegnato come stringa letterale nel costruttore di
  // `UnrecognizedActionError`, quindi sopravvive alla minificazione ed è il
  // fallback stabile.
  return error instanceof Error && error.name === "UnrecognizedActionError";
}

/** Ricarica la pagina: il browser prende HTML e bundle della release corrente. */
export function reloadPage(): void {
  globalThis.location.reload();
}

/**
 * Avvia il recupero dallo skew. Ritorna `false` — senza ricaricare — se un
 * reload è già stato tentato da poco: in quel caso il chiamante deve offrire
 * il ricarico manuale invece di rimbalzare l'utente.
 */
export function recoverFromDeploySkew(now: number = Date.now()): boolean {
  const mark = safeSessionStorage.getItem(RELOAD_MARK_KEY);
  const lastReloadAt = mark === null ? Number.NaN : Number(mark);
  if (
    Number.isFinite(lastReloadAt) &&
    now - lastReloadAt < DEPLOY_SKEW_RELOAD_COOLDOWN_MS
  ) {
    return false;
  }

  safeSessionStorage.setItem(RELOAD_MARK_KEY, String(now));
  reloadPage();
  return true;
}
