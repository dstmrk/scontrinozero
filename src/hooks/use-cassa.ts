"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { CartLine, PaymentMethod, VatCode } from "@/types/cassa";
import { safeSessionStorage } from "@/lib/safe-storage";
// Import da `receipt-totals` e MAI da `document-lines`: il secondo importa
// `getDb()` e trascinerebbe il driver `postgres` nel bundle del browser.
import { calcInputLinesTotalCents } from "@/lib/receipts/receipt-totals";

export const CASSA_SESSION_KEY = "cassa_cart";

interface SessionData {
  lines: CartLine[];
  paymentMethod: PaymentMethod;
}

interface CartState extends SessionData {
  isHydrated: boolean;
}

function readFromSession(): SessionData {
  // safeSessionStorage non lancia su storage bloccato; il try/catch resta per
  // il JSON.parse (dati corrotti → carrello vuoto).
  try {
    const raw = safeSessionStorage.getItem(CASSA_SESSION_KEY);
    if (!raw) return { lines: [], paymentMethod: "PC" };
    return JSON.parse(raw) as SessionData;
  } catch {
    return { lines: [], paymentMethod: "PC" };
  }
}

interface AddLineInput {
  description: string;
  quantity: number;
  grossUnitPrice: number;
  vatCode: VatCode;
}

interface UseCassaReturn {
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  addLine: (input: AddLineInput) => void;
  updateLine: (id: string, input: AddLineInput) => void;
  removeLine: (id: string) => void;
  clearCart: () => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  /**
   * Totale del carrello in centesimi interi, canone della regola 17. È l'unica
   * grandezza da confrontare con una soglia (es. il minimo €1,00 della
   * lotteria): coincide byte-per-byte con `calcInputLinesTotalCents` usata dal
   * server in `resolveLotteryCode` e dall'importo trasmesso all'AdE.
   */
  totalCents: number;
  /** Derivato da `totalCents / 100`, per la sola formattazione display. */
  total: number;
}

export function useCassa(): UseCassaReturn {
  const [{ lines, paymentMethod, isHydrated }, setCartState] =
    useState<CartState>({
      lines: [],
      paymentMethod: "PC",
      isHydrated: false,
    });

  // Idrata da sessionStorage dopo il mount (evita hydration mismatch SSR/client).
  // sessionStorage è una API browser non disponibile lato server: il lazy initializer causerebbe
  // hydration mismatch, quindi l'idratazione post-mount via useEffect è il pattern corretto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration da sessionStorage post-mount; pattern necessario per evitare SSR/client mismatch
    setCartState({ ...readFromSession(), isHydrated: true });
  }, []);

  // Sincronizza su sessionStorage ad ogni cambiamento (solo dopo l'idratazione)
  useEffect(() => {
    if (!isHydrated) return;
    // safeSessionStorage: su storage bloccato la scrittura è un no-op (il
    // carrello resta in memoria) invece di lanciare SecurityError nell'effetto.
    safeSessionStorage.setItem(
      CASSA_SESSION_KEY,
      JSON.stringify({ lines, paymentMethod }),
    );
  }, [lines, paymentMethod, isHydrated]);

  const addLine = useCallback((input: AddLineInput) => {
    setCartState((prev) => {
      const existingIndex = prev.lines.findIndex(
        (l) =>
          l.description === input.description &&
          l.grossUnitPrice === input.grossUnitPrice &&
          l.vatCode === input.vatCode,
      );
      if (existingIndex !== -1) {
        const updatedLines = prev.lines.map((l, i) =>
          i === existingIndex
            ? { ...l, quantity: l.quantity + input.quantity }
            : l,
        );
        return { ...prev, lines: updatedLines };
      }
      const newLine: CartLine = { id: crypto.randomUUID(), ...input };
      return { ...prev, lines: [...prev.lines, newLine] };
    });
  }, []);

  const updateLine = useCallback((id: string, input: AddLineInput) => {
    setCartState((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === id ? { ...l, ...input } : l)),
    }));
  }, []);

  const removeLine = useCallback((id: string) => {
    setCartState((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.id !== id),
    }));
  }, []);

  const clearCart = useCallback(() => {
    setCartState((prev) => ({ ...prev, lines: [] }));
  }, []);

  const setPaymentMethod = useCallback((method: PaymentMethod) => {
    setCartState((prev) => ({ ...prev, paymentMethod: method }));
  }, []);

  const totalCents = useMemo(() => calcInputLinesTotalCents(lines), [lines]);

  return {
    lines,
    paymentMethod,
    addLine,
    updateLine,
    removeLine,
    clearCart,
    setPaymentMethod,
    totalCents,
    total: totalCents / 100,
  };
}
