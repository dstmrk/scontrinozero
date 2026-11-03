import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { assertFunctionalWebStorage } from "./_helpers/assert-functional-web-storage";

/**
 * Tetto di `waitFor`/`findBy*`. Testing Library ne ha uno proprio, 1s, che non
 * guarda il `testTimeout` di vitest (15s): l'asserzione async scade 15 volte
 * prima del test che la contiene, e su un runner carico è quello che si rompe
 * per primo — non il codice.
 *
 * Il caso misurato: `pending-sales-banner.test.tsx` ("chiude la scelta fra
 * candidati dopo una conferma riuscita") attende due aggiornamenti di stato in
 * fila, guidati da due mock che risolvono separatamente, ed è quindi il test
 * del file con la maggior esposizione cumulativa a quel tetto. È fallito a
 * 1109ms in una run completa (320 file in parallelo) e passa 3 volte su 3 da
 * solo. Il commento sopra quell'asserzione prevedeva esattamente questo, ma la
 * fix di allora aveva spostato l'attesa dalla sparizione alla comparsa — e
 * `findBy*` ha lo stesso default di `waitFor`.
 *
 * 5s: cinque volte il default, e un terzo di `testTimeout`. Il margine sotto
 * `testTimeout` serve a tenere il fallimento leggibile — un'asserzione scaduta
 * stampa il DOM ("Unable to find role…"), un test troncato da vitest no.
 *
 * Non nasconde una regressione: un'attesa che non si risolve fallisce ancora,
 * solo più tardi. E non rallenta il caso verde, perché `waitFor` esce al primo
 * poll che passa: il tetto si paga solo quando il test sta già fallendo.
 *
 * Sta qui e non nei singoli file per lo stesso motivo dello stub
 * `ResizeObserver` sotto: è una proprietà dell'ambiente, non una scelta del
 * test. Il contratto è verificato da `tests/unit/testing-library-config.test.tsx`.
 */
export const ASYNC_UTIL_TIMEOUT_MS = 5_000;

configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

// Fail-fast se lo Storage di jsdom non ha sovrascritto lo stub Web Storage
// di Node ≥ 25 (vedi il commento nell'helper e vitest.config.ts). Solo con
// DOM attivo: i file con pragma `@vitest-environment node` caricano comunque
// questo setup ma non hanno (né devono avere) Web Storage.
if (typeof window !== "undefined") {
  assertFunctionalWebStorage();
}

// jsdom non implementa ResizeObserver, e diversi primitivi Radix (Checkbox,
// Select, Popover) lo chiamano al mount per misurarsi. Senza questo stub un
// test fallisce con `ResizeObserver is not defined` in un punto che non ha
// niente a che vedere con ciò che sta verificando. Sta qui e non nei singoli
// file perché è una mancanza dell'ambiente, non una scelta del test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined" && globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;
}

// jsdom tiene lo stesso Web Storage per tutti i test di un file: quello che un
// test scrive (il carrello di `useCassa`, le preferenze stampante) lo eredita
// il successivo. Il reset sta qui e non nei singoli file per lo stesso motivo
// di `cleanup`: è isolamento dell'ambiente, e un file che se ne dimentica
// regge solo finché nessun test conta ciò che trova.
//
// L'ordine conta. Vitest esegue gli `afterEach` in ordine "stack" (l'ultimo
// registrato gira per primo), e questo setup registra prima dei file di test.
// Quindi il reset gira dopo gli `afterEach` del file, cioè dopo che uno
// storage sostituito con uno stub che lancia è stato ripristinato, e dopo
// `cleanup` qui sotto: un componente che scrive nello storage mentre si
// smonta non lascia niente al test successivo.
// Contratto in `tests/unit/web-storage-reset.test.tsx`.
afterEach(() => {
  if (typeof window === "undefined") return;
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(cleanup);
