import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCartIdempotencyKey } from "./use-cart-idempotency-key";

const CART_A = JSON.stringify({ lines: [{ price: 1 }] });
const CART_B = JSON.stringify({ lines: [{ price: 2 }] });

describe("useCartIdempotencyKey", () => {
  it("ritorna la stessa chiave se il carrello non è cambiato", () => {
    const { result } = renderHook(() => useCartIdempotencyKey());

    // È la proprietà che riapre l'ingresso della stale-recovery: un retry
    // sullo stesso carrello DEVE collidere sul vincolo UNIQUE.
    expect(result.current.keyFor(CART_A)).toBe(result.current.keyFor(CART_A));
  });

  it("conia una chiave nuova a ogni modifica del carrello", () => {
    const { result } = renderHook(() => useCartIdempotencyKey());

    const first = result.current.keyFor(CART_A);
    const second = result.current.keyFor(CART_B);

    // Senza questa rotazione un ritocco alle righe produrrebbe
    // IDEMPOTENCY_PAYLOAD_MISMATCH e bloccherebbe l'utente al banco.
    expect(second).not.toBe(first);
  });

  it("conia una chiave nuova dopo l'emissione riuscita", () => {
    const { result } = renderHook(() => useCartIdempotencyKey());

    const first = result.current.keyFor(CART_A);
    result.current.rotate();
    const second = result.current.keyFor(CART_A);

    // Due vendite identiche di fila: senza la rotazione la seconda
    // riceverebbe il successo idempotente della prima senza emettere nulla.
    expect(second).not.toBe(first);
  });

  it("non torna alla chiave precedente tornando al carrello di prima", () => {
    const { result } = renderHook(() => useCartIdempotencyKey());

    const first = result.current.keyFor(CART_A);
    result.current.keyFor(CART_B);
    const backToA = result.current.keyFor(CART_A);

    // Ricorda solo l'ultimo payload: aggiungere una riga e toglierla è un
    // carrello nuovo, non il ritorno a quello di prima.
    expect(backToA).not.toBe(first);
  });

  it("sopravvive a un re-render: la chiave non è stato di render", () => {
    const { result, rerender } = renderHook(() => useCartIdempotencyKey());

    const first = result.current.keyFor(CART_A);
    rerender();

    expect(result.current.keyFor(CART_A)).toBe(first);
  });

  it("produce un UUID valido", () => {
    const { result } = renderHook(() => useCartIdempotencyKey());

    expect(result.current.keyFor(CART_A)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
