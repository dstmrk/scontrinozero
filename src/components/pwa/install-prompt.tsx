"use client";

import { useState, useSyncExternalStore } from "react";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  clearDeferredPrompt,
  getDeferredPrompt,
  subscribeInstallPrompt,
} from "@/lib/pwa/install-prompt-store";

const DISMISSED_KEY = "pwa-install-dismissed";

// Pannello fisso in fondo, condiviso dalla variante iOS e da quella Android.
//
// Il padding sui tre lati esposti somma la safe-area alle vecchie 1rem (py-4 /
// px-4): con il viewport-fit=cover dell'app shell il pannello arriva al bordo
// fisico, quindi senza la somma i bottoni finirebbero sotto la home indicator.
// Le inset valgono 0 fuori dai dispositivi con ritaglio, dove il padding torna
// a essere esattamente 1rem.
//
// Colori a token e non hardcoded: il prompt monta dentro il ThemeProvider del
// dashboard, quindi con `bg-white` era una lastra bianca in dark mode.
const PANEL_CLASS =
  "bg-background border-border fixed right-0 bottom-0 left-0 z-50 border-t pt-4 pr-[calc(1rem_+_env(safe-area-inset-right))] pb-[calc(1rem_+_env(safe-area-inset-bottom))] pl-[calc(1rem_+_env(safe-area-inset-left))] shadow-lg";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isInStandalone(): boolean {
  return (
    "standalone" in navigator &&
    (navigator as Navigator & { standalone: boolean }).standalone === true
  );
}

export function PwaInstallPrompt() {
  // Lazy initializer: runs once on first client render.
  // Checks localStorage + iOS detection without triggering a setState-in-effect cycle.
  const [showIos, setShowIos] = useState<boolean>(() => {
    if (globalThis.window === undefined) return false;
    if (safeLocalStorage.getItem(DISMISSED_KEY)) return false;
    return isIos() && !isInStandalone();
  });

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (globalThis.window === undefined) return false;
    return safeLocalStorage.getItem(DISMISSED_KEY) === "1";
  });

  // Legge l'evento beforeinstallprompt dallo store globale (catturato ASAP da
  // `Providers`, prima che questo componente annidato monti — vedi
  // install-prompt-store.ts). `subscribeInstallPrompt` garantisce anche l'init
  // dei listener nei contesti in cui `Providers` non è montato (es. test).
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
    () => null,
  );

  const showAndroid = !dismissed && !showIos && deferredPrompt !== null;

  const handleDismiss = () => {
    safeLocalStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setShowIos(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    clearDeferredPrompt();
  };

  if (!showAndroid && !showIos) return null;

  if (showIos) {
    return (
      <header className={PANEL_CLASS}>
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-foreground text-sm font-semibold">
              Installa ScontrinoZero
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Non ora"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="text-muted-foreground text-sm">
            Aggiungi a schermata Home per usarla come un&apos;app:
          </p>
          <ol className="text-muted-foreground space-y-1 text-sm">
            <li>
              1. Tocca{" "}
              <span className="font-medium">
                Condividi{" "}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="inline"
                  aria-hidden="true"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{" "}
              nella barra di Safari
            </li>
            <li>
              2. Scorri e tocca{" "}
              <span className="font-medium">Aggiungi a schermata Home</span>
            </li>
          </ol>
        </div>
      </header>
    );
  }

  return (
    <header className={PANEL_CLASS}>
      <div className="mx-auto flex max-w-sm items-center gap-3">
        <div className="flex-1">
          <p className="text-foreground text-sm font-semibold">
            Installa ScontrinoZero
          </p>
          <p className="text-muted-foreground text-xs">
            Accesso rapido dalla schermata Home
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-sm font-medium"
        >
          Installa
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Non ora"
          className="text-muted-foreground hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
}
