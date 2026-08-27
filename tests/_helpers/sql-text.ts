/**
 * Testo SQL di una query Drizzle passata a un `execute` mockato.
 *
 * Serve perché un template `sql` è un **oggetto**: `String(query)` restituisce
 * "[object Object]", quindi un `expect(String(query)).not.toContain("…")` passa
 * sempre, anche quando la stringa cercata c'è. È successo davvero — un assert
 * scritto così sembrava proteggere una query e non guardava niente. Il testo
 * vero sta nei `queryChunks`, frammenti `sql` annidati compresi, e
 * `JSON.stringify` li attraversa tutti.
 *
 * Da usare solo per verificare COSA una query tocca (una tabella, `now()`), mai
 * per assert sulla sua forma esatta: l'output include la struttura interna di
 * Drizzle, che non è un contratto pubblico.
 */
export function sqlTextOf(query: unknown): string {
  return JSON.stringify(query);
}
