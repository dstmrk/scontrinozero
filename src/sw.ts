import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// `defaultCache` NON è asset-only: include una `NetworkFirst` per le GET
// same-origin `/api/*` che scrive la response in CacheStorage via
// `fetchAndCachePut`. Il `cacheOkAndOpaquePlugin` aggiunto di default decide
// solo in base allo status HTTP e IGNORA `Cache-Control`, quindi il `no-store`
// già presente su alcune route non impedisce la scrittura. La CacheStorage è
// per-origin e sopravvive al logout: su un dispositivo condiviso (tablet di
// negozio, PWA installata, cambio account) una GET del secondo utente andata
// in timeout o partita offline verrebbe servita col documento fiscale del
// primo. L'unica difesa è un override esplicito PRIMA dello spread — vince il
// primo matcher.
//
// `/v1/` è il path con cui le richieste arrivano dal subdomain API *prima* del
// rewrite (`next.config.ts` → `rewrites()`), quindi va escluso insieme a `/api/`.
//
// Scelta consapevole: la pagina pubblica dello scontrino (`/r/<id>`) resta
// sulla `NetworkFirst` delle navigazioni di `defaultCache`. Non è autenticata —
// nessun leak cross-account — ed è un artefatto da consegnare al cliente, per
// cui poterla mostrare offline è un vantaggio, non un rischio.
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")),
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();
