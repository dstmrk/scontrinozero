"use client";

import { useState, useCallback } from "react";
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

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
  }, []);

  const total = lines.reduce(
    (sum, l) => sum + l.grossUnitPrice * l.quantity,
    0,
  );

  return {
    lines,
    paymentMethod,
    addLine,
    removeLine,
    clearCart,
    setPaymentMethod,
    total,
  };
}
