/**
 * Accesso difensivo a Web Storage (`sessionStorage` / `localStorage`).
 *
 * Su browser con storage bloccato (modalità privacy, cookie di terze parti
 * disabilitati, alcune webview mobile) anche solo **leggere la property**
 * `window.sessionStorage` / `window.localStorage` lancia `SecurityError`
 * (DOMException 18) — non basta un try/catch sul singolo `getItem`/`setItem`,
 * va protetto l'accesso allo store stesso. Visto in produzione su /login da
 * Chrome Mobile (Sentry SCONTRINOZERO-H).
 *
 * Questi helper degradano a `null` (lettura) / no-op (scrittura) invece di
 * propagare l'eccezione: un throw dentro un effetto/initializer React
 * finirebbe in Sentry e/o romperebbe il commit dell'effetto. Sono anche
 * SSR-safe: senza `window` ritornano `null` / no-op.
 */

export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStore(kind: "local" | "session"): Storage | null {
  try {
    if (typeof globalThis.window === "undefined") return null;
    return kind === "local"
      ? globalThis.window.localStorage
      : globalThis.window.sessionStorage;
  } catch {
    // Accesso alla property negato (storage bloccato): nessuno store usabile.
    return null;
  }
}

function makeSafeStorage(kind: "local" | "session"): SafeStorage {
  return {
    getItem(key) {
      const store = resolveStore(kind);
      if (!store) return null;
      try {
        return store.getItem(key);
      } catch {
        // Lettura negata: trattiamo la chiave come assente.
        return null;
      }
    },
    setItem(key, value) {
      const store = resolveStore(kind);
      if (!store) return;
      try {
        store.setItem(key, value);
      } catch {
        // Scrittura negata (quota/security): no-op, lo stato resta in memoria.
      }
    },
    removeItem(key) {
      const store = resolveStore(kind);
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        // Rimozione negata: no-op.
      }
    },
  };
}

export const safeSessionStorage: SafeStorage = makeSafeStorage("session");
export const safeLocalStorage: SafeStorage = makeSafeStorage("local");
