"use client";

import { useState, useCallback, useMemo } from "react";
import { CartLine, PaymentMethod, VatCode } from "@/types/cassa";

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
  total: number;
}

export function useCassa(): UseCassaReturn {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PC");

  const addLine = useCallback((input: AddLineInput) => {
    const newLine: CartLine = {
      id: crypto.randomUUID(),
      ...input,
    };
    setLines((prev) => [...prev, newLine]);
  }, []);

  const updateLine = useCallback((id: string, input: AddLineInput) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...input } : l)));
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
  }, []);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.grossUnitPrice * l.quantity, 0),
    [lines],
  );

  return {
    lines,
    paymentMethod,
    addLine,
    updateLine,
    removeLine,
    clearCart,
    setPaymentMethod,
    total,
  };
}
