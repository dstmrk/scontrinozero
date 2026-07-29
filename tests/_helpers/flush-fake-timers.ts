import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Flusha le promise in volo (e i re-render React che ne derivano) mentre sono
 * attivi i fake timer di Vitest.
 *
 * Sotto `vi.useFakeTimers()` NON si possono usare `waitFor`/`findBy*`: RTL
 * riconosce solo i fake timer di Jest (`jestFakeTimersAreEnabled` controlla il
 * global `jest`), quindi il suo `asyncWrapper` resta appeso a un
 * `setTimeout(…, 0)` che nessuno avanzerà mai → il test va in timeout.
 *
 * Un tick asincrono dei timer finti dentro `act()` fa lo stesso lavoro: cede il
 * controllo alla microtask queue e applica gli update risultanti. È anche l'uso
 * legittimo di `act()` — avvolge l'avanzamento dei timer, non una chiamata
 * `fireEvent`/`render` (che si auto-avvolgono già, vedi regola SonarCloud
 * "Remove this redundant act() call").
 */
export async function flushWithFakeTimers(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
