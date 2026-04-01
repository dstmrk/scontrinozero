"use client";

import { useEffect, useRef, useState } from "react";

const DISMISSED_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

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
    if (typeof globalThis.window === "undefined") return false;
    if (localStorage.getItem(DISMISSED_KEY)) return false;
    return isIos() && !isInStandalone();
  });

  const [showAndroid, setShowAndroid] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Skip Android prompt if iOS banner is visible or user already dismissed.
    if (showIos || localStorage.getItem(DISMISSED_KEY)) return;

    // Called in an event callback — not synchronously in the effect body.
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShowAndroid(true);
    };

    globalThis.window.addEventListener("beforeinstallprompt", handler);
    return () =>
      globalThis.window.removeEventListener("beforeinstallprompt", handler);
  }, [showIos]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShowAndroid(false);
    setShowIos(false);
  };

  const handleInstall = async () => {
    if (!deferredPromptRef.current) return;
    await deferredPromptRef.current.prompt();
    deferredPromptRef.current = null;
    setShowAndroid(false);
  };

  if (!showAndroid && !showIos) return null;

  if (showIos) {
    return (
      <header className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-200 bg-white px-4 py-4 shadow-lg">
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">
              Installa ScontrinoZero
            </p>
            <button
              onClick={handleDismiss}
              aria-label="Non ora"
              className="shrink-0 text-gray-400 hover:text-gray-600"
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
          <p className="text-sm text-gray-600">
            Aggiungi a schermata Home per usarla come un&apos;app:
          </p>
          <ol className="space-y-1 text-sm text-gray-600">
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
    <header className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-200 bg-white px-4 py-4 shadow-lg">
      <div className="mx-auto flex max-w-sm items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">
            Installa ScontrinoZero
          </p>
          <p className="text-xs text-gray-500">
            Accesso rapido dalla schermata Home
          </p>
        </div>
        <button
          onClick={() => void handleInstall()}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Installa
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Non ora"
          className="text-gray-400 hover:text-gray-600"
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
