import { useCallback, useRef } from "react";

/**
 * Chiave di idempotenza **stabile per carrello** (REVIEW.md #103, slice 3).
 *
 * **Il difetto che chiude.** La cassa coniava `crypto.randomUUID()` dentro
 * `handleSubmit`, cioè una chiave nuova a ogni click. Un retry dopo un
 * fallimento non collideva quindi sul vincolo UNIQUE
 * `(business_id, idempotency_key)`: inseriva una riga nuova e lasciava la
 * precedente `PENDING` per sempre. Ed è proprio quella collisione l'unico
 * ingresso della stale-recovery — la misura anti-doppione teneva chiuso il
 * meccanismo che avrebbe riconciliato la riga.
 *
 * **Due rotazioni obbligatorie**, senza le quali la stabilità fa più danni del
 * difetto che cura:
 *
 * 1. **Su emissione riuscita** (`rotate()`). Senza, due vendite identiche di
 *    fila — due caffè — riuserebbero la stessa chiave e la seconda riceverebbe
 *    il successo idempotente della prima *senza emettere nulla*.
 * 2. **A ogni modifica del carrello** (il `fingerprint`). Senza, un ritocco
 *    alle righe produce `IDEMPOTENCY_PAYLOAD_MISMATCH` e blocca l'utente col
 *    cliente al banco.
 *
 * Con entrambe, l'unico caso di blocco resta "carrello identico, riprovo entro
 * la soglia stale" — cioè esattamente il caso in cui ri-sottomettere è
 * pericoloso, e in cui la verifica della slice 2 è la strada giusta.
 *
 * Il `fingerprint` deve essere **almeno tanto fine** quanto l'hash che il
 * server calcola in `hashSaleRequest` (righe, modalità di pagamento,
 * ripartizione, codice lotteria, abbuono): uno più grossolano non ruoterebbe
 * su un cambiamento che il server invece vede, e produrrebbe un mismatch.
 * Passare il payload serializzato è più fine del necessario — ruota qualche
 * volta di troppo, mai una di meno.
 */
export type CartIdempotencyKey = {
  /** La chiave per questo payload: la stessa finché il payload non cambia. */
  readonly keyFor: (fingerprint: string) => string;
  /** Scarta la chiave corrente. Da chiamare a emissione riuscita. */
  readonly rotate: () => void;
};

export function useCartIdempotencyKey(): CartIdempotencyKey {
  // `useRef` e non `useState`: la chiave è letta dentro l'handler di submit, e
  // non deve provocare un render quando cambia.
  const current = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((fingerprint: string): string => {
    if (current.current?.fingerprint === fingerprint) {
      return current.current.key;
    }
    const key = crypto.randomUUID();
    current.current = { fingerprint, key };
    return key;
  }, []);

  const rotate = useCallback(() => {
    current.current = null;
  }, []);

  return { keyFor, rotate };
}
