/**
 * Riconoscere il guscio Capacitor (docs/mobile-v2.md) dalla web app.
 *
 * Il guscio carica l'app deployata via `server.url`, e Capacitor inietta il
 * suo bridge (`window.Capacitor`) anche in quelle pagine remote. Da qui la web
 * app sa di girare nell'app nativa e parla ai plugin senza importare
 * `@capacitor/core`: il bridge basta, e il bundle web resta quello della PWA.
 */

import { useSyncExternalStore } from "react";

/** Il sottoinsieme del bridge Capacitor che la web app usa. */
export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  nativePromise?: (
    pluginName: string,
    methodName: string,
    options?: unknown,
  ) => Promise<unknown>;
  addListener?: (
    pluginName: string,
    eventName: string,
    callback: (data: { url?: string }) => void,
  ) => { remove: () => unknown };
}

export function getCapacitorBridge(): CapacitorBridge | null {
  if (globalThis.window === undefined) return null;
  const bridge = (globalThis.window as { Capacitor?: CapacitorBridge })
    .Capacitor;
  return bridge ?? null;
}

/** True solo dentro l'app nativa iOS/Android, mai nel browser o nella PWA. */
export function isNativeShell(): boolean {
  try {
    return getCapacitorBridge()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

/**
 * `isNativeShell()` per i componenti. Lo snapshot server è `false`, così l'HTML
 * del server e il primo render del client coincidono; il bridge non cambia
 * durante la vita della pagina, quindi niente da sottoscrivere.
 */
export function useIsNativeShell(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeShell, () => false);
}
