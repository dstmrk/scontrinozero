/**
 * Store singleton client-only per l'evento `beforeinstallprompt` (Android/Chrome).
 *
 * Il problema che risolve: Chrome su Android emette `beforeinstallprompt`
 * molto presto dopo il load della pagina (appena manifest + service worker
 * sono pronti). Se il listener viene agganciato dentro una `useEffect` di un
 * componente annidato (es. il banner nel dashboard layout, che è un Server
 * Component `async` con due `await` bloccanti prima del render), l'evento può
 * scattare PRIMA che React idrati e attacchi il listener — e Chrome non lo
 * ri-emette. Risultato: il pulsante "Installa" non compare mai su Android,
 * mentre iOS (che non ha l'evento, usa istruzioni statiche) sembra funzionare.
 *
 * Soluzione: agganciare il listener il prima possibile, dall'entry client
 * condiviso (`Providers`, montato nel root layout), bufferizzando l'evento in
 * questo store. La UI lo legge poi via `useSyncExternalStore` quando è pronta,
 * anche se l'evento è già stato catturato.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

function handleBeforeInstallPrompt(event: Event): void {
  // Impedisce il mini-infobar nativo di Chrome così da presentare la nostra UI.
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  emit();
}

function handleAppInstalled(): void {
  // Una volta installata, l'evento non è più valido: niente più prompt.
  deferredPrompt = null;
  emit();
}

/**
 * Aggancia i listener globali. Idempotente e SSR-safe (no-op senza `window`).
 * Va chiamato il prima possibile sul client (vedi `Providers`).
 */
export function initInstallPromptCapture(): void {
  if (initialized || globalThis.window === undefined) return;
  initialized = true;
  globalThis.window.addEventListener(
    "beforeinstallprompt",
    handleBeforeInstallPrompt,
  );
  globalThis.window.addEventListener("appinstalled", handleAppInstalled);
}

/** Snapshot stabile per `useSyncExternalStore`. */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** Scarta l'evento bufferizzato (dopo prompt accettato o non più rilevante). */
export function clearDeferredPrompt(): void {
  deferredPrompt = null;
  emit();
}

/** Subscribe per `useSyncExternalStore`; garantisce anche l'init dei listener. */
export function subscribeInstallPrompt(callback: () => void): () => void {
  initInstallPromptCapture();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Reset dello stato del singleton: solo per i test. */
export function resetInstallPromptStoreForTests(): void {
  deferredPrompt = null;
  initialized = false;
  subscribers.clear();
  if (globalThis.window !== undefined) {
    globalThis.window.removeEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    globalThis.window.removeEventListener("appinstalled", handleAppInstalled);
  }
}
